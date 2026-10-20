using System.Collections.Concurrent;
using System.Diagnostics;
using StackExchange.Redis.Profiling;
using WizeLens.Capture;

namespace WizeLens.Redis;

/// <summary>StackExchange.Redis profiler: one session and one client activity per command, under the caller's activity.</summary>
internal sealed class RedisProfiler
{
    /// <summary>Activity source name; WizeLens.AspNetCore listens to every WizeLens.* source.</summary>
    public const string SourceName = "WizeLens.Redis";

    /// <summary>How often finished commands are turned into spans.</summary>
    public static readonly TimeSpan FlushInterval = TimeSpan.FromMilliseconds(100);

    /// <summary>A command with no reply after this long is dropped, not recorded.</summary>
    public static readonly TimeSpan MaxWait = TimeSpan.FromMinutes(2);

    public static readonly RedisProfiler Shared = new();

    internal static readonly ActivitySource Source = new(SourceName, typeof(RedisProfiler).Assembly.GetName().Version?.ToString());

    private readonly ConcurrentDictionary<ProfilingSession, Activity> _open = new(ReferenceEqualityComparer.Instance);
    private readonly Func<ProfilingSession, IReadOnlyList<IProfiledCommand>> _finish;
    private readonly Func<IProfiledCommand, string?> _text;
    private readonly object _timerLock = new();
    private Timer? _timer;

    /// <param name="finish">Reads a session's finished commands (FinishProfiling); tests pass fakes for it and for the command text.</param>
    internal RedisProfiler(Func<ProfilingSession, IReadOnlyList<IProfiledCommand>>? finish = null, Func<IProfiledCommand, string?>? text = null)
    {
        _finish = finish ?? (session => [.. session.FinishProfiling()]);
        _text = text ?? RedisMessage.CommandAndKey;
    }

    /// <summary>Commands sent and not yet turned into spans.</summary>
    internal int OpenCount => _open.Count;

    /// <summary>The profiler callback SE.Redis calls as each command is created, on the caller's thread.</summary>
    public ProfilingSession? Session()
    {
        try
        {
            if (!Source.HasListeners() || WizeLensContext.Suppressed || Activity.Current is not { } parent) return null;
            var activity = Source.StartActivity("redis", ActivityKind.Client);
            // SE.Redis calls this from a method that is not async, so the new activity must not stay current for the caller.
            Activity.Current = parent;
            if (activity is null) return null;
            var session = new ProfilingSession(activity);
            _open[session] = activity;
            EnsureTimer();
            return session;
        }
        catch
        {
            // WizeLens must never break the app.
            return null;
        }
    }

    /// <summary>Turns every finished command into a span and drops commands that never got a reply.</summary>
    internal void Flush()
    {
        foreach (var (session, activity) in _open)
        {
            try
            {
                var commands = _finish(session);
                if (commands.Count == 0 && DateTime.UtcNow - activity.StartTimeUtc < MaxWait) continue;
                if (_open.TryRemove(session, out _) && commands.Count > 0) RedisSpan.Complete(activity, commands, _text(commands[^1]));
            }
            catch
            {
                // A command that cannot be read is dropped.
                _open.TryRemove(session, out _);
            }
        }
    }

    private void EnsureTimer()
    {
        if (_timer is not null) return;
        lock (_timerLock)
        {
            if (_timer is not null) return;
            // The timer must not carry the first request's context (and its Activity.Current) forever.
            using (ExecutionContext.SuppressFlow()) _timer = new Timer(_ => Flush(), null, FlushInterval, FlushInterval);
        }
    }
}
