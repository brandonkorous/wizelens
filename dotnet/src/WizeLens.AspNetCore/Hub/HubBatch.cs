using System.Runtime.InteropServices;
using WizeLens.Metrics;
using WizeLens.Model;

namespace WizeLens.Hub;

/// <summary>The body of <c>POST {hub}/_wizelens/api/ingest</c> (contract type IngestBatch). An empty batch is a heartbeat.</summary>
internal sealed class HubBatch
{
    public required HubSenderInfo Sender { get; init; }
    public List<Span> Spans { get; init; } = [];
    public List<HubLogItem> Logs { get; init; } = [];
    public List<HubRemoteItem> Remotes { get; init; } = [];
    public List<MetricPoint> Metrics { get; init; } = [];

    public static HubBatch From(HubSenderInfo sender, List<HubItem> items) => new()
    {
        Sender = sender,
        Spans = [.. items.Where(i => i.Span is not null).Select(i => i.Span!)],
        Logs = [.. items.Where(i => i.Log is not null).Select(i => new HubLogItem(i.TraceId, i.Log!))],
        Remotes = [.. items.Where(i => i.Remote is not null).Select(i => new HubRemoteItem(i.TraceId, i.Remote!))],
        Metrics = [.. items.Where(i => i.Metric is not null).Select(i => i.Metric!)],
    };
}

internal sealed record HubLogItem(string TraceId, LogRecord Log);

internal sealed record HubRemoteItem(string TraceId, string Endpoint);

/// <summary>Who sends the batch (contract type HubSender).</summary>
internal sealed record HubSenderInfo(
    string Service, string? Project, string Version, string Runtime, string Environment, string Host, string? Endpoint, double StartedMs)
{
    public static HubSenderInfo Of(WizeLensOptions options, string environment, string? endpoint) => new(
        options.ServiceName ?? "app",
        string.IsNullOrWhiteSpace(options.Project) ? null : options.Project,
        typeof(HubSenderInfo).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
        RuntimeInformation.FrameworkDescription,
        environment,
        System.Environment.MachineName,
        endpoint,
        options.StartedMs);
}
