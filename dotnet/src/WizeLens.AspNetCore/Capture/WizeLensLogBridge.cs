using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Logging libraries that can feed WizeLens directly.</summary>
[Flags]
internal enum LogLibraries
{
    None = 0,
    Serilog = 1,
    NLog = 2,
}

/// <summary>Finds the store and options of the running app.</summary>
internal delegate bool LogDestination(out TraceStore store, out WizeLensOptions options);

/// <summary>Where library sinks (Serilog, NLog) store records; they are built before the host, so DI cannot reach them.</summary>
internal static class WizeLensLogBridge
{
    private sealed record Destination(TraceStore Store, WizeLensOptions Options);

    private static volatile Destination? _current;
    private static int _sinks;

    /// <summary>Called when the app's <see cref="TraceStore"/> is created; the newest app wins.</summary>
    public static void Attach(TraceStore store, WizeLensOptions options) => _current = new(store, options);

    /// <summary>The store and options of the running app, or false before it starts.</summary>
    public static bool TryGet(out TraceStore store, out WizeLensOptions options)
    {
        var current = _current;
        store = current?.Store!;
        options = current?.Options!;
        return current is not null;
    }

    /// <summary>Library sinks that are in use in this process.</summary>
    public static LogLibraries Sinks => (LogLibraries)Volatile.Read(ref _sinks);

    /// <summary>Called by a library sink when it is created.</summary>
    public static void SinkCreated(LogLibraries library) => Interlocked.Or(ref _sinks, (int)library);

    /// <summary>Clears the sink flags; for tests.</summary>
    internal static void ResetSinks() => Interlocked.Exchange(ref _sinks, 0);
}

/// <summary>Finds the logging libraries that ILogger records are forwarded to, so they are not stored twice.</summary>
internal static class LogRouting
{
    /// <summary>The libraries that receive this app's ILogger records; throws while the host is still being built.</summary>
    public static LogLibraries Detect(IServiceProvider services)
    {
        var found = Library(services.GetService<ILoggerFactory>()?.GetType());
        foreach (var provider in services.GetServices<ILoggerProvider>()) found |= Library(provider.GetType());
        return found;
    }

    private static LogLibraries Library(Type? type)
    {
        var name = type?.FullName ?? "";
        if (name.StartsWith("Serilog.", StringComparison.Ordinal)) return LogLibraries.Serilog;
        return name.StartsWith("NLog.", StringComparison.Ordinal) ? LogLibraries.NLog : LogLibraries.None;
    }
}
