using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace WizeLens.Tests;

/// <summary>An MCP client connects over HTTP the way an agent does: initialize, tools/list, then a call.</summary>
[Collection(TestApp.Collection)]
public class McpHttpTests
{
    [Fact]
    public async Task Agent_connects_lists_tools_and_calls_one()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/boom", (HttpContext _) => throw new InvalidOperationException("kaboom")), o => o.EnableMcp = true);
        await app.Client.GetAsync("/boom");
        var options = new HttpClientTransportOptions { Endpoint = new Uri(app.Client.BaseAddress!, "/_wizelens/mcp"), TransportMode = HttpTransportMode.StreamableHttp };
        await using var client = await McpClient.CreateAsync(new HttpClientTransport(options, app.Client, ownsHttpClient: false));
        var tools = await client.ListToolsAsync();
        Assert.Contains(tools, t => t.Name == "get_errors");
        var result = await client.CallToolAsync("get_errors", new Dictionary<string, object?>());
        Assert.NotEqual(true, result.IsError);
        Assert.Contains("kaboom", string.Concat(result.Content.OfType<TextContentBlock>().Select(c => c.Text)));
    }

    [Fact]
    public async Task List_traces_takes_a_search_and_a_range()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/orders", () => "ok"), o => o.EnableMcp = true);
        await app.Client.GetAsync("/orders");
        var options = new HttpClientTransportOptions { Endpoint = new Uri(app.Client.BaseAddress!, "/_wizelens/mcp"), TransportMode = HttpTransportMode.StreamableHttp };
        await using var client = await McpClient.CreateAsync(new HttpClientTransport(options, app.Client, ownsHttpClient: false));
        async Task<string> Text(Dictionary<string, object?> args) =>
            string.Concat((await client.CallToolAsync("list_traces", args)).Content.OfType<TextContentBlock>().Select(c => c.Text));
        Assert.Contains("/orders", await Text(new() { ["q"] = "orders", ["range"] = "1h" }));
        Assert.Equal("[]", (await Text(new() { ["q"] = "nothing-matches-this" })).Trim());
        Assert.Contains("Unknown range", await Text(new() { ["range"] = "2y" }));
        Assert.Contains("start", await Text(new() { ["q"] = "status:abc" }));
    }
}
