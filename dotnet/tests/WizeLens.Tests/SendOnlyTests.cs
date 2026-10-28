using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WizeLens.Hub;

namespace WizeLens.Tests;

/// <summary>With the dashboard off, WizeLens captures and sends, but nothing can be read from the app.</summary>
[Collection(TestApp.Collection)]
public class SendOnlyTests
{
    /// <summary>A fake hub that keeps every body it gets.</summary>
    private sealed class FakeHub : HttpMessageHandler
    {
        public List<JsonElement> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.Clone();
            lock (Bodies) Bodies.Add(body);
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }
    }

    private static Task<TestApp> StartAsync(FakeHub? hub = null) =>
        TestApp.StartAsync(a => a.MapGet("/ping", () => "pong"), o =>
        {
            o.Dashboard = false;
            o.EnableMcp = true;
            o.HubUrl = hub is null ? null : "http://hub.test:5960";
            o.HubHandler = hub;
        });

    [Fact]
    public async Task Answers_no_reads()
    {
        await using var app = await StartAsync();
        string[] paths = ["", "/", "/index.html", "/api/info", "/api/traces", "/api/traces/" + new string('a', 32), "/api/metrics/points", "/api/search", "/api/search/suggest", "/mcp"];
        foreach (var path in paths)
        {
            var response = await app.Client.GetAsync("/_wizelens" + path);
            Assert.Equal((path, HttpStatusCode.NotFound), (path, response.StatusCode));
        }
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await app.Client.GetAsync("/_wizelens/api/client-spans")).StatusCode);
        var mcp = await app.Client.PostAsync("/_wizelens/mcp", new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.NotFound, mcp.StatusCode);
    }

    [Fact]
    public async Task Still_traces_requests_and_takes_browser_spans()
    {
        await using var app = await StartAsync();
        var traceId = (await app.Client.GetAsync("/ping")).Headers.GetValues("X-WizeLens-Trace").Single();
        var browser = new string('c', 32);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var body = $$"""{"spans":[{"traceId":"{{browser}}","spanId":"{{new string('d', 16)}}","name":"pageview /","startMs":{{now}},"durationMs":1}]}""";
        var posted = await app.Client.PostAsync("/_wizelens/api/client-spans", new StringContent(body, Encoding.UTF8, "application/json"));
        // The request span ends on a background thread: wait for it rather than a fixed time.
        for (var deadline = DateTime.UtcNow.AddSeconds(5); DateTime.UtcNow < deadline && app.Store.Get(traceId) is null; await Task.Delay(50)) { }

        Assert.Equal(HttpStatusCode.NoContent, posted.StatusCode);
        Assert.NotNull(app.Store.Get(traceId));
        Assert.NotNull(app.Store.Get(browser));
    }

    [Fact]
    public async Task Sends_to_the_hub_with_no_address_to_read_from()
    {
        var hub = new FakeHub();
        await using var app = await StartAsync(hub);
        await app.Client.GetAsync("/ping");
        var exporter = app.App.Services.GetRequiredService<HubExporter>();
        List<JsonElement> bodies = [];
        for (var deadline = DateTime.UtcNow.AddSeconds(5); DateTime.UtcNow < deadline && bodies.Count == 0; await Task.Delay(50))
        {
            await exporter.TickAsync(CancellationToken.None);
            lock (hub.Bodies) bodies = [.. hub.Bodies];
        }
        Assert.NotEmpty(bodies);
        Assert.All(bodies, b => Assert.False(b.GetProperty("sender").TryGetProperty("endpoint", out var e) && e.ValueKind == JsonValueKind.String));
    }

    [Fact]
    public async Task Is_send_only_by_default_outside_development()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.WebHost.UseTestServer();
        builder.Services.AddWizeLens(o => o.Enabled = true);
        await using var app = builder.Build();
        app.UseWizeLens();
        await app.StartAsync();

        var options = app.Services.GetRequiredService<WizeLensOptions>();
        Assert.Equal((true, false, WizeLensStorage.Memory), (options.IsEnabled, options.ServesDashboard, options.StorageKind));
        Assert.Equal(HttpStatusCode.NotFound, (await app.GetTestClient().GetAsync("/_wizelens/api/info")).StatusCode);
    }

    [Fact]
    public async Task Says_so_when_production_keeps_it_off_with_a_hub_set()
    {
        var lines = new List<string>();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders().AddProvider(new LineLogger(lines));
        builder.Services.AddWizeLens(o => o.HubUrl = "http://localhost:5970");
        await using var app = builder.Build();
        app.UseWizeLens();
        await app.StartAsync();

        Assert.False(app.Services.GetRequiredService<WizeLensOptions>().IsEnabled);
        Assert.Contains(lines, l => l.Contains("Set WIZELENS_ENABLED=true", StringComparison.Ordinal));
    }

    private sealed class LineLogger(List<string> lines) : ILoggerProvider, ILogger
    {
        public ILogger CreateLogger(string categoryName) => this;
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => lines.Add(formatter(state, exception));
        public void Dispose() { }
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData(" YES ", true)]
    [InlineData("0", false)]
    [InlineData("off", false)]
    [InlineData("maybe", null)]
    [InlineData(null, null)]
    public void Reads_on_off_variables(string? value, bool? expected)
    {
        var name = "WIZELENS_TEST_FLAG_" + Guid.NewGuid().ToString("N");
        Environment.SetEnvironmentVariable(name, value);
        try
        {
            Assert.Equal(expected, WizeLensOptions.EnvFlag(name));
        }
        finally
        {
            Environment.SetEnvironmentVariable(name, null);
        }
    }
}
