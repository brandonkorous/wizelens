using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Logging;
using Serilog.Core;
using Serilog.Events;
using WizeLens.Capture;

namespace WizeLens.Serilog;

/// <summary>Puts Serilog events into the trace of the request that wrote them.</summary>
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
            if (!LogCapture.Accepts(options, category, level) || TargetOf(logEvent) is not { } target) return;
            var entry = new LogEntry(level, category, logEvent.RenderMessage(CultureInfo.InvariantCulture), logEvent.Exception);
            LogCapture.Write(store, options, target, entry, Attributes(logEvent));
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
