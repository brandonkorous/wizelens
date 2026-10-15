using System.Diagnostics;
using Microsoft.Extensions.Logging;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Attaches <see cref="ILogger"/> records to the trace of the current request.</summary>
[ProviderAlias("WizeLens")]
internal sealed class WizeLensLoggerProvider(TraceStore store, WizeLensOptions options) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new WizeLensLogger(categoryName, store, options);

    public void Dispose()
    {
    }

    /// <summary>WizeLens's own log categories. They go to the app's other log providers, not into traces.</summary>
    private static readonly string[] OwnCategories =
    [
        "WizeLens.Analysis", "WizeLens.Capture", "WizeLens.Data",
        "WizeLens.Mcp", "WizeLens.Storage", "WizeLens.Web", "ModelContextProtocol",
    ];

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

    private sealed class WizeLensLogger(string category, TraceStore store, WizeLensOptions options) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) =>
            options.IsEnabled && logLevel != LogLevel.None && !IsNoisy(category, logLevel);

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel) || WizeLensContext.Suppressed) return;
            var activity = Activity.Current;
            if (activity is null || !activity.Recorded) return;

            try
            {
                var record = new LogRecord
                {
                    TimeMs = ActivityMapper.ToUnixMs(DateTime.UtcNow),
                    Level = MapLevel(logLevel),
                    Category = category,
                    Message = formatter(state, exception),
                    Service = options.ServiceName ?? "app",
                    SpanId = activity.SpanId.ToHexString(),
                };

                if (state is IEnumerable<KeyValuePair<string, object?>> pairs)
                {
                    foreach (var (key, value) in pairs)
                    {
                        if (key != "{OriginalFormat}") record.Attributes[key] = value;
                    }
                }
                if (eventId.Id != 0) record.Attributes["event.id"] = eventId.Id;
                if (exception is not null)
                {
                    record.Attributes["exception.type"] = exception.GetType().FullName;
                    record.Attributes["exception.message"] = exception.Message;
                    record.Attributes["exception.stacktrace"] = exception.ToString();
                }

                store.AddLog(activity.TraceId.ToHexString(), WizeLensRuntime.Redactor.Redact(record));
            }
            catch
            {
                // WizeLens must never break the app.
            }
        }

        private static string MapLevel(LogLevel level) => level switch
        {
            LogLevel.Trace => "trace",
            LogLevel.Debug => "debug",
            LogLevel.Information => "info",
            LogLevel.Warning => "warn",
            LogLevel.Error => "error",
            _ => "critical",
        };
    }
}
