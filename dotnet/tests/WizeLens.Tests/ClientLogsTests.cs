using System.Net;
using System.Net.Http.Json;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class ClientLogsTests
{
    private const string TraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    private const string SpanId = "00f067aa0ba902b7";

    private static object Log(string traceId = TraceId, string? spanId = SpanId, string level = "warn", string message = "Cart is empty") => new
    {
        traceId,
        spanId,
        timeMs = 1_700_000_000_000.0,
        level,
        category = "console",
        message,
        service = "web",
        attributes = new Dictionary<string, object?> { ["url.full"] = "http://localhost/cart", ["token"] = "abc" },
    };

    private static async Task<List<LogRecord>> PostAsync(params object[] logs)
    {
        await using var app = await TestApp.StartAsync(_ => { });
        var response = await app.Client.PostAsJsonAsync("/_wizelens/api/client-spans", new { spans = Array.Empty<object>(), logs });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        return app.Store.Get(TraceId)?.Logs ?? [];
    }

    [Fact]
    public async Task Valid_browser_log_is_stored_and_redacted()
    {
        var log = Assert.Single(await PostAsync(Log(traceId: TraceId.ToUpperInvariant())));
        Assert.Equal("warn", log.Level);
        Assert.Equal("console", log.Category);
        Assert.Equal("Cart is empty", log.Message);
        Assert.Equal("web", log.Service);
        Assert.Equal(SpanId, log.SpanId);
        Assert.Equal(1_700_000_000_000.0, log.TimeMs);
        Assert.Equal("http://localhost/cart", log.Attributes["url.full"]);
        Assert.Equal(Redactor.Redacted, log.Attributes["token"]);
    }

    [Fact]
    public async Task Invalid_browser_logs_are_skipped()
    {
        var logs = await PostAsync(Log(traceId: "nope"), Log(spanId: "xyz"), Log(spanId: null, message: "kept"));
        var log = Assert.Single(logs);
        Assert.Equal("kept", log.Message);
        Assert.Null(log.SpanId);
    }

    [Fact]
    public async Task Browser_logs_are_capped()
    {
        var many = Enumerable.Range(0, 150).Select(i => Log(level: "loud", message: new string('x', 5000))).ToArray();
        var logs = await PostAsync(many);
        Assert.Equal(ClientLogs.MaxLogs, logs.Count);
        Assert.All(logs, l => Assert.Equal("info", l.Level));
        Assert.All(logs, l => Assert.Equal(ClientLogs.MaxMessage, l.Message.Length));
    }

    [Fact]
    public void Missing_fields_get_defaults()
    {
        var record = ClientLogs.ToRecord(new ClientLog { TraceId = TraceId, Category = new string('c', 300) })!;
        Assert.Equal("browser", record.Service);
        Assert.Equal("info", record.Level);
        Assert.Equal(ClientLogs.MaxName, record.Category.Length);
        Assert.True(record.TimeMs > 0);
    }
}
