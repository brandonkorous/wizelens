using System.Diagnostics.Metrics;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using WizeLens.Hub;
using WizeLens.Mcp;
using WizeLens.Metrics;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class MetricsAppTests
{
    /// <summary>A fake hub that keeps every body it gets.</summary>
    private sealed class FakeHub : HttpMessageHandler
    {
        public List<JsonElement> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.Clone();
            if (request.RequestUri!.AbsolutePath.EndsWith("/api/packages", StringComparison.Ordinal)) return new HttpResponseMessage(HttpStatusCode.NoContent);
            lock (Bodies) Bodies.Add(body);
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }
    }

    private static Task<TestApp> StartAsync(Action<WizeLensOptions>? configure = null) =>
        TestApp.StartAsync(a => a.MapGet("/ping", () => "pong"), o =>
        {
            o.MetricsInterval = TimeSpan.FromHours(1);
            configure?.Invoke(o);
        });

    /// <summary>Records on a fresh meter and collects once, as the timer would.</summary>
    private static string RecordAndCollect(TestApp app)
    {
        using var meter = new Meter("Test.App." + Guid.NewGuid().ToString("N"));
        meter.CreateCounter<int>(meter.Name + ".hits", "{hit}").Add(3, new KeyValuePair<string, object?>("route", "/a"));
        app.App.Services.GetRequiredService<MetricsService>().Collector!.Collect();
        return meter.Name + ".hits";
    }

    [Fact]
    public async Task Serves_points_and_the_metrics_capability()
    {
        await using var app = await StartAsync();
        var name = RecordAndCollect(app);

        var info = JsonDocument.Parse(await app.Client.GetStringAsync("/_wizelens/api/info")).RootElement;
        Assert.Contains("metrics", info.GetProperty("capabilities").EnumerateArray().Select(c => c.GetString()));
        var body = JsonDocument.Parse(await app.Client.GetStringAsync("/_wizelens/api/metrics/points?since=0")).RootElement;
        var point = body.GetProperty("points").EnumerateArray().Single(p => p.GetProperty("name").GetString() == name);
        Assert.Equal(("sum", "{hit}", "test-api", 3d, "/a"), (point.GetProperty("kind").GetString(), point.GetProperty("unit").GetString(),
            point.GetProperty("service").GetString(), point.GetProperty("value").GetDouble(), point.GetProperty("attributes").GetProperty("route").GetString()));
        // The .NET runtime meter comes with no code.
        Assert.Contains(body.GetProperty("points").EnumerateArray(), p => p.GetProperty("name").GetString() == "dotnet.process.memory.working_set");
        var later = JsonDocument.Parse(await app.Client.GetStringAsync($"/_wizelens/api/metrics/points?since={DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds()}")).RootElement;
        Assert.Empty(later.GetProperty("points").EnumerateArray());
    }

    [Fact]
    public async Task Sends_metric_points_to_the_hub()
    {
        var hub = new FakeHub();
        await using var app = await StartAsync(o =>
        {
            o.HubUrl = "http://hub.test:5960";
            o.HubHandler = hub;
        });
        var name = RecordAndCollect(app);
        var exporter = app.App.Services.GetRequiredService<HubExporter>();

        // The background loop may have taken the points and still be sending them, so wait for the hub to have them.
        List<JsonElement> metrics = [];
        for (var deadline = DateTime.UtcNow.AddSeconds(5); DateTime.UtcNow < deadline; await Task.Delay(50))
        {
            await exporter.TickAsync(CancellationToken.None);
            lock (hub.Bodies) metrics = [.. hub.Bodies.SelectMany(b => b.GetProperty("metrics").EnumerateArray())];
            if (metrics.Any(m => m.GetProperty("name").GetString() == name)) break;
        }
        Assert.Contains(metrics, m => m.GetProperty("name").GetString() == name && m.GetProperty("monotonic").GetBoolean());
    }

    [Fact]
    public async Task Mcp_tools_list_and_describe_metrics()
    {
        await using var app = await StartAsync();
        var name = RecordAndCollect(app);
        var tools = new WizeLensMetricTools(app.App.Services.GetRequiredService<MetricStore>(), NullLogger<WizeLensMetricTools>.Instance);

        var list = JsonDocument.Parse(tools.ListMetrics(q: name)).RootElement;
        var entry = Assert.Single(list.EnumerateArray());
        Assert.Equal(("sum", "3.00 hit", 1), (entry.GetProperty("kind").GetString(), entry.GetProperty("latest").GetString(), entry.GetProperty("series").GetInt32()));
        var detail = JsonDocument.Parse(tools.GetMetric(name)).RootElement;
        var series = Assert.Single(detail.GetProperty("series").EnumerateArray());
        Assert.Equal("3.00 hit", series.GetProperty("max").GetString());
        Assert.Contains("not found", tools.GetMetric("nope.metric"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Capture_metrics_off_collects_nothing()
    {
        await using var app = await StartAsync(o => o.CaptureMetrics = false);
        Assert.Null(app.App.Services.GetRequiredService<MetricsService>().Collector);
        var info = JsonDocument.Parse(await app.Client.GetStringAsync("/_wizelens/api/info")).RootElement;
        Assert.DoesNotContain("metrics", info.GetProperty("capabilities").EnumerateArray().Select(c => c.GetString()));
        var response = await app.Client.GetAsync("/_wizelens/api/metrics/points");
        Assert.NotEqual("application/json", response.Content.Headers.ContentType?.MediaType);
    }
}
