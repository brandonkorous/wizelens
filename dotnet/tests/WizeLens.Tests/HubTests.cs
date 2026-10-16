using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Hub;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class HubTests
{
    /// <summary>A fake hub: keeps every body it gets and answers with the given status.</summary>
    private sealed class FakeHub(HttpStatusCode status) : HttpMessageHandler
    {
        public List<(string Url, string? Auth, JsonElement Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.Clone();
            lock (Calls) Calls.Add((request.RequestUri!.ToString(), request.Headers.Authorization?.ToString(), body));
            return new HttpResponseMessage(status);
        }
    }

    private static Task<TestApp> StartAsync(FakeHub hub) => TestApp.StartAsync(
        a => a.MapGet("/ping", () => "pong"),
        o =>
        {
            o.HubUrl = "hub.test:5960/_wizelens/";
            o.HubToken = "s3cret";
            o.Project = "shop";
            o.HubHandler = hub;
        });

    private static async Task<List<JsonElement>> SpansAsync(FakeHub hub, HubExporter exporter)
    {
        for (var i = 0; i < 50; i++)
        {
            await exporter.TickAsync(CancellationToken.None);
            List<JsonElement> spans;
            lock (hub.Calls) spans = [.. hub.Calls.SelectMany(c => c.Body.GetProperty("spans").EnumerateArray())];
            if (spans.Any(s => s.GetProperty("category").GetString() == "http.server")) return spans;
            await Task.Delay(100);
        }
        return [];
    }

    [Fact]
    public async Task Sends_request_spans_to_the_hub_with_the_sender_and_token()
    {
        var hub = new FakeHub(HttpStatusCode.NoContent);
        await using var app = await StartAsync(hub);
        await app.Client.GetAsync("/ping");

        var spans = await SpansAsync(hub, app.App.Services.GetRequiredService<HubExporter>());
        Assert.Contains(spans, s => s.GetProperty("name").GetString()!.Contains("/ping", StringComparison.Ordinal));
        var call = hub.Calls[0];
        Assert.Equal("http://hub.test:5960/_wizelens/api/ingest", call.Url);
        Assert.Equal("Bearer s3cret", call.Auth);
        var sender = call.Body.GetProperty("sender");
        Assert.Equal("test-api", sender.GetProperty("service").GetString());
        Assert.Equal("shop", sender.GetProperty("project").GetString());
        Assert.Equal("Development", sender.GetProperty("environment").GetString());
        // The calls to the hub are not traced by the app itself.
        Assert.Single(app.Store.All());
    }

    [Fact]
    public async Task Keeps_the_data_while_the_hub_is_down()
    {
        var hub = new FakeHub(HttpStatusCode.ServiceUnavailable);
        await using var app = await StartAsync(hub);
        await app.Client.GetAsync("/ping");
        var exporter = app.App.Services.GetRequiredService<HubExporter>();
        await Task.Delay(300);
        await exporter.TickAsync(CancellationToken.None);
        Assert.True(exporter.Queued > 0);
    }

    [Fact]
    public async Task Info_shows_the_hub_and_project()
    {
        await using var app = await StartAsync(new FakeHub(HttpStatusCode.NoContent));
        var info = JsonDocument.Parse(await app.Client.GetStringAsync("/_wizelens/api/info")).RootElement;
        Assert.Equal("http://hub.test:5960", info.GetProperty("hub").GetString());
        Assert.Equal("shop", info.GetProperty("project").GetString());
    }
}
