using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol.Protocol;
using WizeLens.Mcp;

namespace WizeLens.Tests;

/// <summary>The in-app tags API and the tag MCP tools over a live app's own traces.</summary>
[Collection(TestApp.Collection)]
public class TagApiTests
{
    private static async Task<(TestApp App, string Stream, string Pay)> StartAsync()
    {
        var app = await TestApp.StartAsync(a =>
        {
            a.MapGet("/events", (HttpResponse r) => { r.ContentType = "text/event-stream"; return "data: x\n\n"; });
            a.MapPost("/api/pay", async () => { await Task.Delay(150); return "paid"; });
        }, o => o.Tags = new() { Rules = [new("Slow", "method:POST duration:>100ms", "red"), new("pay", "path:/api/pay")], DisableBuiltIns = ["bot"] });
        var stream = (await app.Client.GetAsync("/events")).Headers.GetValues("X-WizeLens-Trace").Single();
        var pay = (await app.Client.PostAsync("/api/pay", null)).Headers.GetValues("X-WizeLens-Trace").Single();
        // The request spans end on a background thread: wait for them rather than a fixed time.
        for (var deadline = DateTime.UtcNow.AddSeconds(5); DateTime.UtcNow < deadline && (app.Store.Get(stream) is null || app.Store.Get(pay) is null); await Task.Delay(50)) { }
        return (app, stream, pay);
    }

    private static async Task<JsonElement> GetAsync(TestApp app, string path) => await app.Client.GetFromJsonAsync<JsonElement>("/_wizelens/" + path);

    [Fact]
    public async Task Lists_tags_and_matches_a_page_of_rows()
    {
        var (app, stream, pay) = await StartAsync();
        await using var _ = app;
        var list = await GetAsync(app, "api/tags");
        Assert.False(list.GetProperty("editable").GetBoolean());
        Assert.Equal(["stream:True:violet", "probe:True:slate", "bot:False:amber", "pay:True:blue", "slow:True:red"],
            list.GetProperty("tags").EnumerateArray().Select(t => $"{t.GetProperty("name").GetString()}:{t.GetProperty("enabled").GetBoolean()}:{t.GetProperty("color").GetString()}"));

        var rows = await GetAsync(app, "api/search?range=1h&q=" + Uri.EscapeDataString("tag:slow OR tag:stream OR tag:typo"));
        Assert.Equal([pay, stream], rows.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("traceId").GetString()));
        Assert.Equal(["typo"], rows.GetProperty("unknownTags").EnumerateArray().Select(u => u.GetString()));
        var items = rows.GetProperty("items").EnumerateArray().Select(i => new { traceId = i.GetProperty("traceId").GetString(), owner = "", timeMs = i.GetProperty("startMs").GetDouble() });
        var match = await app.Client.PostAsJsonAsync("/_wizelens/api/tags/match", new { kind = "requests", items });
        var matches = (await match.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("matches");
        Assert.Equal("[\"pay\",\"slow\"]", matches.GetProperty($"{pay} ").GetRawText());
        Assert.Equal("[\"stream\"]", matches.GetProperty($"{stream} ").GetRawText());
        Assert.Equal(HttpStatusCode.BadRequest, (await app.Client.PostAsJsonAsync("/_wizelens/api/tags/match", new { kind = "nope" })).StatusCode);

        var suggest = await GetAsync(app, "api/search/suggest?field=tag&prefix=s");
        Assert.Equal(["stream", "slow"], suggest.GetProperty("items").EnumerateArray().Select(s => s.GetProperty("value").GetString()));
        Assert.Contains("tags", (await GetAsync(app, "api/info")).GetProperty("capabilities").EnumerateArray().Select(c => c.GetString()));
    }

    private static JsonElement Text(CallToolResult result) => JsonDocument.Parse(((TextContentBlock)Assert.Single(result.Content)).Text).RootElement;

    [Fact]
    public async Task Gives_ai_tools_tags_tag_search_and_the_tags_on_each_result()
    {
        var (app, _, pay) = await StartAsync();
        await using var __ = app;
        var services = app.App.Services;
        var tools = new WizeLensSearchTools(app.Store, services.GetRequiredService<WizeLensOptions>(), services.GetRequiredService<IHostEnvironment>(), NullLogger<WizeLensSearchTools>.Instance);
        Assert.Equal(["stream", "probe", "bot", "pay", "slow"], Text(tools.ListTags()).EnumerateArray().Select(t => t.GetProperty("name").GetString()));
        var found = Text(tools.Search("tag:pay", range: "1h"));
        Assert.Equal(pay, Assert.Single(found.GetProperty("items").EnumerateArray()).GetProperty("traceId").GetString());
        Assert.Equal("[\"pay\",\"slow\"]", found.GetProperty("tags").GetProperty($"{pay} ").GetRawText());
    }

    [Fact]
    public void Refuses_a_bad_rule_when_registered()
    {
        var services = new ServiceCollection();
        Assert.Throws<ArgumentException>(() => services.AddWizeLens(o => o.Tags.Rules.Add(new("x", "status:abc"))));
    }
}
