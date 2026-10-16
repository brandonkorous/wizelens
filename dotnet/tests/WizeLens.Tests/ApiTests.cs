using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using WizeLens.Model;
using WizeLens.Web;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class ApiTests
{
    [Fact]
    public async Task Full_list_returns_traces_with_spans_and_filters_by_since()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/ping", () => "pong"));
        await app.Client.GetAsync("/ping");
        await app.Client.GetAsync("/ping");

        var traces = await app.Client.GetFromJsonAsync<List<Trace>>("/_wizelens/api/traces?full=true", WizeLensJson.Options);
        Assert.Equal(2, traces!.Count);
        Assert.All(traces, t => Assert.NotEmpty(t.Spans));
        Assert.True(traces[0].StartMs >= traces[1].StartMs);

        var limited = await app.Client.GetFromJsonAsync<List<Trace>>("/_wizelens/api/traces?full=true&limit=1", WizeLensJson.Options);
        Assert.Single(limited!);

        var future = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeMilliseconds();
        var none = await app.Client.GetFromJsonAsync<List<Trace>>($"/_wizelens/api/traces?full=true&since={future}", WizeLensJson.Options);
        Assert.Empty(none!);
    }

    [Fact]
    public async Task Info_has_environment_storage_and_analysis()
    {
        await using var app = await TestApp.StartAsync(_ => { }, o => o.SlowQueryMs = 250);
        var info = await app.Client.GetFromJsonAsync<JsonElement>("/_wizelens/api/info");

        Assert.Equal("test-api", info.GetProperty("service").GetString());
        Assert.Equal("in-app", info.GetProperty("mode").GetString());
        Assert.Equal("federation", info.GetProperty("capabilities")[0].GetString());
        Assert.Equal("Development", info.GetProperty("environment").GetString());
        Assert.Equal(Environment.MachineName, info.GetProperty("host").GetString());
        Assert.True(info.GetProperty("startedMs").GetDouble() > 0);
        Assert.Equal("memory", info.GetProperty("storage").GetProperty("kind").GetString());
        Assert.Equal(2000, info.GetProperty("storage").GetProperty("maxTraces").GetInt32());
        Assert.Equal(86_400_000, info.GetProperty("storage").GetProperty("maxAgeMs").GetDouble());
        Assert.Equal(250, info.GetProperty("analysis").GetProperty("slowQueryMs").GetDouble());
        Assert.Equal(5, info.GetProperty("analysis").GetProperty("nPlusOneThreshold").GetInt32());
        Assert.Contains("authorization", info.GetProperty("redactKeys").EnumerateArray().Select(k => k.GetString()));
        Assert.False(info.GetProperty("captureResponseBody").GetBoolean());
    }
}
