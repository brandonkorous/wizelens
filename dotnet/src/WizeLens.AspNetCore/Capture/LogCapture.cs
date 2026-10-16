using System.Diagnostics;
using Microsoft.Extensions.Logging;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>The trace and span a log record belongs to.</summary>
internal readonly record struct LogTarget(string TraceId, string? SpanId)
{
    /// <summary>The recorded activity of this async flow, or null outside a request and on WizeLens's own endpoints.</summary>
    public static LogTarget? Current()
    {
        if (WizeLensContext.Suppressed) return null;
        var activity = Activity.Current;
        return activity is { Recorded: true } ? new(activity.TraceId.ToHexString(), activity.SpanId.ToHexString()) : null;
    }
}

/// <summary>One log line from any source (ILogger, Serilog, NLog), before it becomes a <see cref="LogRecord"/>.</summary>
internal readonly record struct LogEntry(LogLevel Level, string Category, string Message, Exception? Exception = null, int EventId = 0);

/// <summary>Builds and stores log records the same way for every log source.</summary>
internal static class LogCapture
{
    /// <summary>WizeLens's own log categories. They go to the app's other log providers, not into traces.</summary>
    private static readonly string[] OwnCategories =
    [
        "WizeLens.Analysis", "WizeLens.Capture", "WizeLens.Data",
        "WizeLens.Mcp", "WizeLens.Storage", "WizeLens.Web", "ModelContextProtocol",
    ];

    /// <summary>True when records of this category and level are kept.</summary>
    public static bool Accepts(WizeLensOptions options, string category, LogLevel level) =>
        options.IsEnabled && level != LogLevel.None && !IsNoisy(category, level);

    /// <summary>Categories that are too noisy below Warning, or that WizeLens already shows as spans.</summary>
    internal static bool IsNoisy(string category, LogLevel level)
    {
        foreach (var own in OwnCategories)
        {
            if (category.StartsWith(own, StringComparison.Ordinal)) return true;
        }
        if (level >= LogLevel.Warning) return false;
        return category.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
            || category.StartsWith("System.Net.Http", StringComparison.Ordinal)
            || category.StartsWith("Microsoft.EntityFrameworkCore.Database.Command", StringComparison.Ordinal)
            || category.StartsWith("Microsoft.Extensions.Http", StringComparison.Ordinal);
    }

    /// <summary>Stores one record in the trace of <paramref name="target"/>; never throws.</summary>
    public static void Write(TraceStore store, WizeLensOptions options, LogTarget target, LogEntry entry, IEnumerable<KeyValuePair<string, object?>>? attributes)
    {
        try
        {
            var record = new LogRecord
            {
                TimeMs = ActivityMapper.ToUnixMs(DateTime.UtcNow),
                Level = MapLevel(entry.Level),
                Category = entry.Category,
                Message = entry.Message,
                Service = options.ServiceName ?? "app",
                SpanId = target.SpanId,
            };
            foreach (var (key, value) in attributes ?? []) record.Attributes[key] = value;
            if (entry.EventId != 0) record.Attributes["event.id"] = entry.EventId;
            AddException(record, entry.Exception);
            store.AddLog(target.TraceId, WizeLensRuntime.Redactor.Redact(record));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    private static void AddException(LogRecord record, Exception? exception)
    {
        if (exception is null) return;
        record.Attributes["exception.type"] = exception.GetType().FullName;
        record.Attributes["exception.message"] = exception.Message;
        record.Attributes["exception.stacktrace"] = exception.ToString();
    }

    /// <summary>The contract's level name for a Microsoft.Extensions.Logging level.</summary>
    public static string MapLevel(LogLevel level) => level switch
    {
        LogLevel.Trace => "trace",
        LogLevel.Debug => "debug",
        LogLevel.Information => "info",
        LogLevel.Warning => "warn",
        LogLevel.Error => "error",
        _ => "critical",
    };
}
