using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol.Protocol;
using WizeLens.Mcp;

namespace WizeLens.Tests;

/// <summary>The search API and the search MCP tools over a live app's own traces.</summary>
[Collection(TestApp.Collection)]
public class SearchApiTests
{
    private static async Task<TestApp> StartWithTraceAsync()
    {
        var app = await TestApp.StartAsync(a => a.MapGet("/ping", () => "pong"));
        var traceId = (await app.Client.GetAsync("/ping?x=1")).Headers.GetValues("X-WizeLens-Trace").Single();
        // The request span ends on a background thread: wait for it rather than a fixed time.
        for (var deadline = DateTime.UtcNow.AddSeconds(5); DateTime.UtcNow < deadline && app.Store.Get(traceId) is null; await Task.Delay(50)) { }
        return app;
    }

    private static async Task<(HttpStatusCode Status, JsonElement Body)> GetAsync(TestApp app, string pathAndQuery)
    {
        var response = await app.Client.GetAsync("/_wizelens/" + pathAndQuery);
        return (response.StatusCode, await response.Content.ReadFromJsonAsync<JsonElement>());
    }

    [Fact]
    public async Task Searches_requests_and_spans_with_the_apps_environment()
    {
        await using var app = await StartWithTraceAsync();
        var (status, body) = await GetAsync(app, "api/search?q=" + Uri.EscapeDataString("path:/ping method:GET status:200"));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("requests", body.GetProperty("kind").GetString());
        var item = Assert.Single(body.GetProperty("items").EnumerateArray());
        Assert.Equal(("/ping?x=1", "GET /ping", "test-api"), (item.GetProperty("path").GetString(), item.GetProperty("endpoint").GetString(), item.GetProperty("service").GetString()));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("next").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("settling").ValueKind);
        Assert.True(body.GetProperty("tookMs").GetDouble() >= 0);

        var (_, spans) = await GetAsync(app, "api/search?kind=spans&q=env:Development&env=prod");
        Assert.NotEmpty(spans.GetProperty("items").EnumerateArray());
        var (_, none) = await GetAsync(app, "api/search?kind=spans&q=env:prod");
        Assert.Empty(none.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Answers_bad_searches_with_400_and_the_position()
    {
        await using var app = await StartWithTraceAsync();
        var (status, body) = await GetAsync(app, "api/search?q=status:abc");
        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal(new[] { "ok", "error", "start", "end" }, body.EnumerateObject().Select(p => p.Name));
        Assert.Equal((false, "\"abc\" is not a status. Use 404, 5xx, ok, error, or unset.", 0, 10),
            (body.GetProperty("ok").GetBoolean(), body.GetProperty("error").GetString(), body.GetProperty("start").GetInt32(), body.GetProperty("end").GetInt32()));
        var (kindStatus, kind) = await GetAsync(app, "api/search?kind=nope");
        Assert.Equal(HttpStatusCode.BadRequest, kindStatus);
        Assert.False(kind.TryGetProperty("start", out _));
        var (rangeStatus, _) = await GetAsync(app, "api/search/suggest?range=2h");
        Assert.Equal(HttpStatusCode.BadRequest, rangeStatus);
    }

    [Fact]
    public async Task Suggests_fields_and_values_and_lists_search_in_info()
    {
        await using var app = await StartWithTraceAsync();
        var (_, fields) = await GetAsync(app, "api/search/suggest?prefix=se");
        Assert.Equal("""{"value":"service","help":"Service name"}""", fields.GetProperty("items")[0].GetRawText());
        var (_, methods) = await GetAsync(app, "api/search/suggest?field=method");
        Assert.Equal("""[{"value":"GET","count":1}]""", methods.GetProperty("items").GetRawText());
        var (_, envs) = await GetAsync(app, "api/search/suggest?field=env");
        Assert.Equal("""[{"value":"Development","count":1}]""", envs.GetProperty("items").GetRawText());
        var info = await app.Client.GetFromJsonAsync<JsonElement>("/_wizelens/api/info");
        Assert.Contains("search", info.GetProperty("capabilities").EnumerateArray().Select(c => c.GetString()));
    }

    private static JsonElement Text(CallToolResult result) => JsonDocument.Parse(((TextContentBlock)Assert.Single(result.Content)).Text).RootElement;

    [Fact]
    public async Task Mcp_tools_search_and_list_fields()
    {
        await using var app = await StartWithTraceAsync();
        var tools = new WizeLensSearchTools(app.Store, app.App.Services.GetRequiredService<WizeLensOptions>(), app.App.Services.GetRequiredService<IHostEnvironment>(), NullLogger<WizeLensSearchTools>.Instance);
        var page = tools.Search("path:/ping", limit: 5);
        Assert.NotEqual(true, page.IsError);
        Assert.Equal("/ping?x=1", Assert.Single(Text(page).GetProperty("items").EnumerateArray()).GetProperty("path").GetString());
        Assert.NotEmpty(Text(tools.Search("env:Development", kind: "spans", range: "15m")).GetProperty("items").EnumerateArray());

        var bad = tools.Search("status:abc");
        Assert.True(bad.IsError);
        Assert.Equal((0, 10), (Text(bad).GetProperty("start").GetInt32(), Text(bad).GetProperty("end").GetInt32()));
        Assert.True(tools.Search("", kind: "nope").IsError);
        Assert.True(tools.Search("", range: "2h").IsError);

        Assert.Contains(Text(tools.SearchFields()).EnumerateArray(), s => s.GetProperty("value").GetString() == "@url.path");
        Assert.Equal("GET", Assert.Single(Text(tools.SearchFields(field: "method")).EnumerateArray()).GetProperty("value").GetString());
        Assert.Equal("Development", Assert.Single(Text(tools.SearchFields(field: "env")).EnumerateArray()).GetProperty("value").GetString());
    }
}
