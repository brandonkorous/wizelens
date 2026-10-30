using WizeLens.Analysis;
using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>What the store does with one item. <see cref="Held"/> comes with the first keep of a held trace.</summary>
internal readonly record struct SampleVerdict(bool Keep, HeldTrace? Held)
{
    public static readonly SampleVerdict KeepNow = new(true, null);
    public static readonly SampleVerdict Wait = new(false, null);
}

/// <summary>Spans, logs, and remotes of a trace that waits for its sampling choice.</summary>
internal sealed class HeldTrace(long sinceMs)
{
    public long SinceMs { get; } = sinceMs;
    public List<Span> Spans { get; } = [];
    public List<LogRecord> Logs { get; } = [];
    public List<string> Remotes { get; } = [];
    public bool IsEmpty => Spans.Count + Logs.Count + Remotes.Count == 0;
}

/// <summary>Decides, per trace, what the store keeps. A trace outside the rate waits until its local root span ends, then stays only with an error or a slow span.</summary>
internal sealed class TraceSampler(WizeLensSampling settings, Func<long>? now = null)
{
    private const int MaxDecided = 20_000;
    private const int MaxPending = 2000;
    private const long HoldMs = 60_000;

    private readonly Func<long> _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    private readonly Dictionary<string, bool> _decided = new(StringComparer.OrdinalIgnoreCase);
    private readonly Queue<string> _decidedOrder = new();
    private readonly Dictionary<string, HeldTrace> _pending = new(StringComparer.OrdinalIgnoreCase);
    private readonly Queue<(string Id, HeldTrace Held)> _pendingOrder = new();
    private readonly object _lock = new();

    public WizeLensSampling Settings { get; } = settings;

    /// <summary>Decides whether the span's trace is kept.</summary>
    /// <param name="span">The span that just ended.</param>
    /// <param name="root">The span starts this service's part of the trace (no parent, or a parent in another process).</param>
    public SampleVerdict Span(Span span, bool root)
    {
        lock (_lock)
        {
            var mustKeep = MustKeep(span);
            if (Known(span.TraceId, mustKeep) is { } early) return early;
            var held = Hold(span.TraceId);
            if (mustKeep) return KeepHeld(span.TraceId, held);
            if (!root)
            {
                held.Spans.Add(span);
                return SampleVerdict.Wait;
            }
            _pending.Remove(span.TraceId);
            Decide(span.TraceId, false);
            return SampleVerdict.Wait;
        }
    }

    public SampleVerdict Log(string traceId, LogRecord log)
    {
        lock (_lock)
        {
            var important = Settings.KeepErrors && log.Level == "error";
            if (Known(traceId, important) is { } early) return early;
            var held = Hold(traceId);
            if (important) return KeepHeld(traceId, held);
            held.Logs.Add(log);
            return SampleVerdict.Wait;
        }
    }

    /// <summary>A downstream endpoint never decides a trace; it waits with it.</summary>
    public SampleVerdict Remote(string traceId, string endpoint)
    {
        lock (_lock)
        {
            if (Known(traceId, false) is { } early) return early;
            Hold(traceId).Remotes.Add(endpoint);
            return SampleVerdict.Wait;
        }
    }

    // A decided or in-rate trace. An error after a drop keeps the rest of the trace.
    private SampleVerdict? Known(string traceId, bool important)
    {
        Expire();
        if (_decided.TryGetValue(traceId, out var keep))
        {
            if (keep || !important) return keep ? SampleVerdict.KeepNow : SampleVerdict.Wait;
            Decide(traceId, true);
            return SampleVerdict.KeepNow;
        }
        if (!WizeLensSampling.KeepByRate(traceId, Settings.ClampedRate)) return null;
        Decide(traceId, true);
        return SampleVerdict.KeepNow;
    }

    // A browser span's length is a page or render window, not a wait: it never counts as slow.
    private bool MustKeep(Span span) =>
        (Settings.KeepErrors && RequestParts.IsErrorStatus(span))
        || (Settings.KeepSlowMs is { } slow && span.Category != SpanCategories.Browser && span.DurationMs >= slow);

    private SampleVerdict KeepHeld(string traceId, HeldTrace held)
    {
        _pending.Remove(traceId);
        Decide(traceId, true);
        return new SampleVerdict(true, held.IsEmpty ? null : held);
    }

    private HeldTrace Hold(string traceId)
    {
        if (_pending.TryGetValue(traceId, out var held)) return held;
        held = new HeldTrace(_now());
        _pending[traceId] = held;
        _pendingOrder.Enqueue((traceId, held));
        while (_pending.Count > MaxPending && _pendingOrder.TryDequeue(out var oldest)) Drop(oldest);
        return held;
    }

    private void Decide(string traceId, bool keep)
    {
        if (!_decided.ContainsKey(traceId)) _decidedOrder.Enqueue(traceId);
        _decided[traceId] = keep;
        while (_decided.Count > MaxDecided && _decidedOrder.TryDequeue(out var oldest)) _decided.Remove(oldest);
    }

    // A trace whose root never ended (a lost request, a job with no root) is dropped after a while.
    private void Expire()
    {
        var cutoff = _now() - HoldMs;
        while (_pendingOrder.TryPeek(out var oldest))
        {
            if (IsLive(oldest) && oldest.Held.SinceMs >= cutoff) return;
            Drop(_pendingOrder.Dequeue());
        }
    }

    // A queue entry still waiting (not kept, dropped, or held again since).
    private bool IsLive((string Id, HeldTrace Held) entry) => _pending.TryGetValue(entry.Id, out var held) && ReferenceEquals(held, entry.Held);

    private void Drop((string Id, HeldTrace Held) entry)
    {
        if (!IsLive(entry)) return;
        _pending.Remove(entry.Id);
        Decide(entry.Id, false);
    }
}
