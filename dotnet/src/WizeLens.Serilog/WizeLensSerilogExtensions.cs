using Serilog.Configuration;
using Serilog.Events;
using WizeLens.Capture;
using WizeLens.Serilog;

namespace Serilog;

/// <summary>Adds the WizeLens sink: <c>.WriteTo.WizeLens()</c>.</summary>
public static class WizeLensSerilogExtensions
{
    /// <summary>Writes each event into the trace of the request that logged it; pair with <c>AddWizeLens()</c>.</summary>
    public static LoggerConfiguration WizeLens(this LoggerSinkConfiguration writeTo, LogEventLevel restrictedToMinimumLevel = LevelAlias.Minimum)
    {
        ArgumentNullException.ThrowIfNull(writeTo);
        // Tells the ILogger provider to leave records that Serilog also receives to this sink.
        WizeLensLogBridge.SinkCreated(LogLibraries.Serilog);
        return writeTo.Sink(new WizeLensSink(), restrictedToMinimumLevel);
    }
}
