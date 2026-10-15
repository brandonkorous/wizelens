using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;

namespace WizeLens.Storage;

/// <summary>
/// Keeps the trace store within its age limit and, with SQLite storage, saves it to disk:
/// load on startup, write changes every 500 ms, and write once more on shutdown.
/// Any disk error turns storage off (one warning) and WizeLens keeps working in memory.
/// </summary>
internal sealed class TraceStorageService : IHostedService, IDisposable
{
    private static readonly TimeSpan FlushInterval = TimeSpan.FromMilliseconds(500);

    private readonly TraceStore _store;
    private readonly WizeLensOptions _options;
    private readonly ILogger<TraceStorageService> _logger;
    private readonly object _flushLock = new();
    private SqliteTraceStorage? _sqlite;
    private CancellationTokenSource? _stopping;
    private Task? _loop;

    // Loading happens here, not in StartAsync: the host builds every hosted service before it starts any,
    // and the web server may start (and take requests) before this service's StartAsync runs.
    public TraceStorageService(TraceStore store, WizeLensOptions options, IHostEnvironment environment, ILogger<TraceStorageService> logger)
    {
        _store = store;
        _options = options;
        _logger = logger;

        if (!options.IsEnabled || options.Storage != WizeLensStorage.Sqlite) return;

        var path = ResolvePath(options.StoragePath, environment.ContentRootPath);
        WithSuppression(() =>
        {
            try
            {
                _sqlite = SqliteTraceStorage.Open(path, options.ServiceName ?? "app");
                _sqlite.Prune(options.MaxTraces, CutoffMs());
                foreach (var trace in _sqlite.Load(options.MaxTraces)) _store.Hydrate(trace);
            }
            catch (Exception ex)
            {
                Disable(ex, $"could not open trace store at {path}");
            }
        });
    }

    /// <summary>The file in use, or null when traces are kept in memory only.</summary>
    public string? StoragePath => _sqlite?.Path;

    public static string ResolvePath(string? storagePath, string contentRoot) =>
        string.IsNullOrWhiteSpace(storagePath)
            ? Path.Combine(contentRoot, ".wizelens", "traces.db")
            : Path.GetFullPath(storagePath, contentRoot);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.IsEnabled) return Task.CompletedTask;
        _stopping = new CancellationTokenSource();
        _loop = Task.Run(() => LoopAsync(_stopping.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_stopping is null || _loop is null) return;
        await _stopping.CancelAsync().ConfigureAwait(false);
        try
        {
            await _loop.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        Flush();
    }

    /// <summary>Writes pending changes and applies the age and count limits. Safe to call at any time.</summary>
    public void Flush()
    {
        lock (_flushLock)
        {
            WithSuppression(() =>
            {
                var cutoff = CutoffMs();
                _store.PruneOlderThan(cutoff);
                if (_sqlite is null) return;
                try
                {
                    _sqlite.Write(_store.DrainChanges());
                    _sqlite.Prune(_options.MaxTraces, cutoff);
                }
                catch (Exception ex)
                {
                    Disable(ex, $"could not write trace store at {_sqlite.Path}");
                }
            });
        }
    }

    public void Dispose()
    {
        _stopping?.Dispose();
        _sqlite?.Dispose();
        _sqlite = null;
    }

    private async Task LoopAsync(CancellationToken token)
    {
        using var timer = new PeriodicTimer(FlushInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false)) Flush();
        }
        catch (OperationCanceledException)
        {
        }
    }

    private double CutoffMs() => TraceStore.NowMs() - _options.MaxAge.TotalMilliseconds;

    private void Disable(Exception ex, string what)
    {
        _logger.LogWarning(ex, "WizeLens {What}. Traces are kept in memory only until the app restarts.", what);
        _sqlite?.Dispose();
        _sqlite = null;
    }

    private static void WithSuppression(Action action)
    {
        // Never trace WizeLens's own storage work.
        var previous = WizeLensContext.Suppressed;
        WizeLensContext.Suppressed = true;
        try
        {
            action();
        }
        finally
        {
            WizeLensContext.Suppressed = previous;
        }
    }
}
