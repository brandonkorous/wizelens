using Microsoft.Extensions.Logging;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Attaches <see cref="ILogger"/> records to the trace of the current request.</summary>
[ProviderAlias("WizeLens")]
internal sealed class WizeLensLoggerProvider(TraceStore store, WizeLensOptions options, IServiceProvider services) : ILoggerProvider
{
    private LogLibraries? _routing;

    public ILogger CreateLogger(string categoryName) => new WizeLensLogger(categoryName, store, options, this);

    public void Dispose()
    {
    }

    /// <summary>True when a Serilog or NLog sink already stores the records this provider sees.</summary>
    private bool HandledByLibrarySink()
    {
        var sinks = WizeLensLogBridge.Sinks;
        if (sinks == LogLibraries.None) return false;
        if (_routing is null)
        {
            try
            {
                _routing = LogRouting.Detect(services);
            }
            catch
            {
                // The host is still being built; ask again on the next record.
                return false;
            }
        }
        return (_routing.Value & sinks) != LogLibraries.None;
    }

    private sealed class WizeLensLogger(string category, TraceStore store, WizeLensOptions options, WizeLensLoggerProvider provider) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => LogCapture.Accepts(options, category, logLevel);

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel) || LogTarget.Current() is not { } target || provider.HandledByLibrarySink()) return;
            try
            {
                var entry = new LogEntry(logLevel, category, formatter(state, exception), exception, eventId.Id);
                LogCapture.Write(store, options, target, entry, Attributes(state));
            }
            catch
            {
                // WizeLens must never break the app.
            }
        }

        private static IEnumerable<KeyValuePair<string, object?>>? Attributes<TState>(TState state) =>
            state is IEnumerable<KeyValuePair<string, object?>> pairs ? pairs.Where(p => p.Key != "{OriginalFormat}") : null;
    }
}
