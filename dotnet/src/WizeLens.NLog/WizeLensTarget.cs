using System.ComponentModel;
using NLog;
using NLog.Layouts;
using NLog.Targets;
using WizeLens.Capture;
using MsLogLevel = Microsoft.Extensions.Logging.LogLevel;

namespace WizeLens.NLog;

/// <summary>Puts NLog events into the trace of the request that wrote them: <c>xsi:type="WizeLens"</c>.</summary>
[Target("WizeLens")]
public sealed class WizeLensTarget : TargetWithLayout
{
    private readonly LogDestination _destination;

    public WizeLensTarget()
        : this(WizeLensLogBridge.TryGet)
    {
    }

    internal WizeLensTarget(LogDestination destination)
    {
        _destination = destination;
        Name = "wizelens";
        Layout = "${message}";
        // Not thread-agnostic, so an async wrapper reads it on the logging thread, where the request's activity is.
        ActivityContext = Layout.FromMethod(CaptureActivity, LayoutRenderOptions.None);
    }

    /// <summary>The request's trace and span, read where the event is logged; set by WizeLens.</summary>
    [EditorBrowsable(EditorBrowsableState.Never)]
    public Layout ActivityContext { get; set; }

    protected override void InitializeTarget()
    {
        // Tells the ILogger provider to leave records that NLog also receives to this target.
        WizeLensLogBridge.SinkCreated(LogLibraries.NLog);
        base.InitializeTarget();
    }

    protected override void Write(LogEventInfo logEvent)
    {
        try
        {
            if (!_destination(out var store, out var options)) return;
            var level = MapLevel(logEvent.Level);
            var category = string.IsNullOrEmpty(logEvent.LoggerName) ? "NLog" : logEvent.LoggerName;
            if (!LogCapture.Accepts(options, category, level) || Parse(RenderLogEvent(ActivityContext, logEvent)) is not { } target) return;
            var entry = new LogEntry(level, category, RenderLogEvent(Layout, logEvent), logEvent.Exception);
            LogCapture.Write(store, options, target, entry, Attributes(logEvent));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    private static string CaptureActivity(LogEventInfo _) => LogTarget.Current() is { } t ? $"{t.TraceId}-{t.SpanId}" : "";

    private static LogTarget? Parse(string value)
    {
        var dash = value.IndexOf('-');
        return dash == 32 ? new LogTarget(value[..dash], value[(dash + 1)..]) : null;
    }

    private static IEnumerable<KeyValuePair<string, object?>>? Attributes(LogEventInfo logEvent) =>
        logEvent.HasProperties ? logEvent.Properties.Select(p => new KeyValuePair<string, object?>(p.Key.ToString() ?? "", p.Value)) : null;

    internal static MsLogLevel MapLevel(LogLevel level) => level.Ordinal switch
    {
        0 => MsLogLevel.Trace,
        1 => MsLogLevel.Debug,
        2 => MsLogLevel.Information,
        3 => MsLogLevel.Warning,
        4 => MsLogLevel.Error,
        _ => MsLogLevel.Critical,
    };
}
