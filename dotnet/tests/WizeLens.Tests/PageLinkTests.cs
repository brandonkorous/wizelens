using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>How a page joins the server's traces: Server-Timing on responses, and browser spans that name the page's own server.</summary>
[Collection(TestApp.Collection)]
public class PageLinkTests
{
    [Fact]
    public async Task Responses_carry_the_trace_id_and_endpoint_in_Server_Timing()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/page", () => "<html></html>"));
        var response = await app.Client.GetAsync("/page");
        var traceId = response.Headers.GetValues("X-WizeLens-Trace").Single();
        var timing = string.Join(", ", response.Headers.GetValues("Server-Timing"));

        Assert.Contains($"wl-trace;desc={traceId}", timing);
        Assert.Contains("wl-endpoint;desc=\"http://localhost/_wizelens\"", timing);
        Assert.Matches(@"wl-start;desc=\d{13}", timing);
    }

    [Theory]
    [InlineData("http://localhost:3022/_wizelens/", "http://localhost:3022", "http://localhost:3022/_wizelens")]
    [InlineData("http://10.0.0.5/_wizelens", "http://localhost:3022", null)]
    [InlineData("file:///etc/passwd", "file://", null)]
    // An API on its own port, trusted by the developer (eShop's Blazor admin calls PublicApi on 5099).
    [InlineData("https://localhost:5099/_wizelens", "https://localhost:5001", "https://localhost:5099/_wizelens")]
    [InlineData("https://localhost:5100/_wizelens", "https://localhost:5001", null)]
    public async Task A_browser_span_adds_a_remote_only_on_the_page_origin_or_a_trusted_one(string remote, string origin, string? expected)
    {
        await using var app = await TestApp.StartAsync(_ => { }, o => o.TrustedRemotes = ["https://localhost:5099/", "not a url"]);
        var traceId = Guid.NewGuid().ToString("N");
        // A real start time: a span at 0 is past the age limit, and the store's flush timer may drop it before the read.
        var span = new { traceId, spanId = "0123456789abcdef", name = "pageview /", startMs = TraceStore.NowMs(), attributes = new Dictionary<string, object> { ["wizelens.browser.remote"] = remote } };
        using var request = new HttpRequestMessage(HttpMethod.Post, "/_wizelens/api/client-spans") { Content = JsonContent.Create(new { spans = new[] { span } }) };
        request.Headers.Add("Origin", origin);
        (await app.Client.SendAsync(request)).EnsureSuccessStatusCode();

        var remotes = app.Store.Get(traceId)!.Remotes;
        if (expected is null) Assert.Empty(remotes);
        else Assert.Equal([expected], remotes);
    }
}
