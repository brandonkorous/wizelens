using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;
using WizeLens.Metrics;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Hub;

/// <summary>Sends every new span, log, and remote to the hub in batches; a hub that is down never slows the app.</summary>
internal sealed class HubExporter : IHostedService, IDisposable
{
    private const int BatchSize = 1000;
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan Heartbeat = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromSeconds(30);

    private readonly TraceStore _store;
    private readonly MetricStore _metrics;
    private readonly WizeLensOptions _options;
    private readonly string _environment;
    private readonly ILogger<HubExporter> _logger;
    private readonly HubQueue _queue = new(20_000);
    private readonly string? _url;
    private HttpClient? _client;
    private CancellationTokenSource? _stopping;
    private Task? _loop;
    private DateTimeOffset _lastSent = DateTimeOffset.MinValue;
    private DateTimeOffset _retryAt = DateTimeOffset.MinValue;
    private int _failures;
    private string? _reason;

    public HubExporter(TraceStore store, MetricStore metrics, WizeLensOptions options, IHostEnvironment environment, ILogger<HubExporter> logger)
    {
        _store = store;
        _metrics = metrics;
        _options = options;
        _environment = environment.EnvironmentName;
        _logger = logger;
        _url = options.IsEnabled ? options.NormalizedHubUrl : null;
        if (_url is null) return;
        _store.Changed += _queue.Add;
        _metrics.Changed += AddMetric;
    }

    private void AddMetric(MetricPoint point) => _queue.Add(new HubItem("", null, null, null, point));

    public int Queued => _queue.Count;

    /// <summary>How sending goes, for the dashboard: waiting for the first batch, fine, or failing and why.</summary>
    public HubSendState SendState
    {
        get
        {
            long? last = _lastSent == DateTimeOffset.MinValue ? null : _lastSent.ToUnixTimeMilliseconds();
            if (_reason is not null) return new HubSendState("failing", _reason, last);
            return last is null ? new HubSendState("waiting") : new HubSendState("ok", null, last);
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (_url is null) return Task.CompletedTask;
        _client = new HttpClient(_options.HubHandler ?? new SocketsHttpHandler(), disposeHandler: _options.HubHandler is null)
        {
            Timeout = TimeSpan.FromSeconds(5),
        };
        if (!string.IsNullOrEmpty(_options.HubToken)) _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.HubToken);
        _stopping = new CancellationTokenSource();
        _loop = Task.Run(() => LoopAsync(_stopping.Token), CancellationToken.None);
        if (_options.ReportPackages) _ = Task.Run(() => PackageReport.SendAsync(_client, _url, HubSenderInfo.Of(_options, _environment, null), _stopping.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_stopping is null || _loop is null) return;
        await _stopping.CancelAsync().ConfigureAwait(false);
        try
        {
            await _loop.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        // One last try, so the final requests reach the hub.
        _retryAt = DateTimeOffset.MinValue;
        if (_queue.Count > 0) await TickAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task LoopAsync(CancellationToken stop)
    {
        // Calls to the hub are WizeLens's own work: never trace them.
        WizeLensContext.Suppressed = true;
        Activity.Current = null;
        while (!stop.IsCancellationRequested)
        {
            await TickAsync(stop).ConfigureAwait(false);
            await Task.Delay(Interval, stop).ConfigureAwait(false);
        }
    }

    /// <summary>Sends one batch when there is data, or a heartbeat when it is time.</summary>
    internal async Task TickAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (_client is null || now < _retryAt) return;
        if (_queue.Count == 0 && now - _lastSent < Heartbeat) return;
        var items = _queue.Take(BatchSize);
        var batch = HubBatch.From(HubSenderInfo.Of(_options, _environment, _options.ServesDashboard ? _store.SelfEndpoint : null), items);
        var status = await PostAsync(batch, cancellationToken).ConfigureAwait(false);
        if (status is >= 200 and < 300) Succeeded(now);
        else Failed(items, now, status);
    }

    /// <summary>The hub's status code, or 0 when it could not be reached.</summary>
    private async Task<int> PostAsync(HubBatch batch, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _client!.PostAsJsonAsync($"{_url}/_wizelens/api/ingest", batch, WizeLensJson.Options, cancellationToken).ConfigureAwait(false);
            return (int)response.StatusCode;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return 0;
        }
    }

    private void Succeeded(DateTimeOffset now)
    {
        if (_failures > 0) _logger.LogInformation("WizeLens is connected to the hub at {Hub} again.", _url);
        _failures = 0;
        _reason = null;
        _lastSent = now;
    }

    private void Failed(List<HubItem> items, DateTimeOffset now, int status)
    {
        _queue.PutBack(items);
        _reason = HubSendState.ReasonOf(status, _url!, !string.IsNullOrEmpty(_options.HubToken));
        if (_failures++ == 0) _logger.LogWarning("WizeLens: {Reason} Traces stay in this app, and sending will retry.", _reason);
        var backoff = TimeSpan.FromSeconds(Math.Pow(2, Math.Min(_failures, 5)));
        _retryAt = now + (backoff < MaxBackoff ? backoff : MaxBackoff);
    }

    public void Dispose()
    {
        _store.Changed -= _queue.Add;
        _metrics.Changed -= AddMetric;
        _stopping?.Dispose();
        _client?.Dispose();
    }
}
