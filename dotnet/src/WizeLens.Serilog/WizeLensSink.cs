using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Logging;
using Serilog.Core;
using Serilog.Events;
using WizeLens.Capture;

namespace WizeLens.Serilog;

/// <summary>Puts Serilog events into the trace of the request that wrote them, or into the loose batch outside one.</summary>
internal sealed class WizeLensSink(LogDestination destination) : ILogEventSink
{
    private const string SourceContext = "SourceContext";

    public WizeLensSink()
        : this(WizeLensLogBridge.TryGet)
    {
    }

    public void Emit(LogEvent logEvent)
    {
        try
        {
            if (!destination(out var store, out var options)) return;
            var level = MapLevel(logEvent.Level);
            var category = Category(logEvent);
            if (!LogCapture.Accepts(options, category, level)) return;
            var target = TargetOf(logEvent);
            if (target is null && !IsOutside(logEvent)) return;
            var entry = new LogEntry(level, category, logEvent.RenderMessage(CultureInfo.InvariantCulture), logEvent.Exception);
            if (target is { } t) LogCapture.Write(store, options, t, entry, Attributes(logEvent));
            else LogCapture.WriteLoose(store, options, entry, Attributes(logEvent));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    /// <summary>The event's own trace (it survives an async sink); else the current activity.</summary>
    internal static LogTarget? TargetOf(LogEvent logEvent)
    {
        if (logEvent.TraceId is not { } traceId) return LogTarget.Current();
        var activity = Activity.Current;
        if (activity is not null && activity.TraceId == traceId && (!activity.Recorded || WizeLensContext.Suppressed)) return null;
        return new LogTarget(traceId.ToHexString(), logEvent.SpanId?.ToHexString());
    }

    /// <summary>True when the event was written outside a request: it carries no trace and none is current.</summary>
    internal static bool IsOutside(LogEvent logEvent) => logEvent.TraceId is null && LogTarget.Outside();

    private static string Category(LogEvent logEvent) =>
        logEvent.Properties.TryGetValue(SourceContext, out var value) && value is ScalarValue { Value: string name } ? name : "Serilog";

    private static IEnumerable<KeyValuePair<string, object?>> Attributes(LogEvent logEvent)
    {
        foreach (var (key, value) in logEvent.Properties)
        {
            if (key == SourceContext) continue;
            yield return new(key, value is ScalarValue scalar ? scalar.Value : value.ToString());
        }
    }

    internal static LogLevel MapLevel(LogEventLevel level) => level switch
    {
        LogEventLevel.Verbose => LogLevel.Trace,
        LogEventLevel.Debug => LogLevel.Debug,
        LogEventLevel.Information => LogLevel.Information,
        LogEventLevel.Warning => LogLevel.Warning,
        LogEventLevel.Error => LogLevel.Error,
        _ => LogLevel.Critical,
    };
}
