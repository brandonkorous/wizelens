using System.Diagnostics;
#if !NET9_0_OR_GREATER
using System.Diagnostics.Metrics;
#endif
using Microsoft.Extensions.Hosting;
using WizeLens.Capture;

namespace WizeLens.Metrics;

/// <summary>Runs the collector every <see cref="WizeLensOptions.MetricsInterval"/> while the app runs.</summary>
internal sealed class MetricsService(MetricStore store, WizeLensOptions options) : IHostedService, IDisposable
{
    private MetricCollector? _collector;
    private CancellationTokenSource? _stopping;
    private Task? _loop;
#if !NET9_0_OR_GREATER
    private Meter? _runtime;
#endif

    internal MetricCollector? Collector => _collector;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!options.MetricsOn) return Task.CompletedTask;
#if !NET9_0_OR_GREATER
        // A .NET 9 app runs this .NET 8 build, and .NET 9 publishes System.Runtime itself.
        if (Environment.Version.Major < 9) _runtime = RuntimeMeter.Create();
#endif
        _collector = new MetricCollector(store, options.ServiceName ?? "app", options.MaxMetricSeries);
        _collector.Start();
        _stopping = new CancellationTokenSource();
        _loop = Task.Run(() => LoopAsync(_stopping.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    private async Task LoopAsync(CancellationToken stop)
    {
        // Collecting is WizeLens's own work: never trace it.
        WizeLensContext.Suppressed = true;
        Activity.Current = null;
        using var timer = new PeriodicTimer(options.MetricsInterval > TimeSpan.Zero ? options.MetricsInterval : TimeSpan.FromSeconds(10));
        try
        {
            while (await timer.WaitForNextTickAsync(stop).ConfigureAwait(false)) _collector!.Collect();
        }
        catch (OperationCanceledException)
        {
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_stopping is null || _loop is null) return;
        await _stopping.CancelAsync().ConfigureAwait(false);
        await _loop.ConfigureAwait(false);
        // The last interval, so the hub gets it before the app stops.
        _collector?.Collect();
    }

    public void Dispose()
    {
        _collector?.Dispose();
#if !NET9_0_OR_GREATER
        _runtime?.Dispose();
#endif
        _stopping?.Dispose();
    }
}
