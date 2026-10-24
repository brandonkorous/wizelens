using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class CaptureTests
{
    [Fact]
    public async Task Server_span_has_client_headers_request_id_and_routing()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/items/{id}", (int id) => Results.Ok(new { id })));
        using var request = new HttpRequestMessage(HttpMethod.Get, "/items/7");
        request.Headers.Add("X-Forwarded-For", "203.0.113.42, 10.0.0.1");
        request.Headers.Add("User-Agent", "WizeLensTest/1.0");
        request.Headers.Add("Authorization", "Bearer secret-value");
        var root = TestApp.Root(await app.TraceAsync(await app.Client.SendAsync(request)));

        Assert.Equal("203.0.113.42", root.Attr("client.address"));
        Assert.Equal("WizeLensTest/1.0", root.Attr("user_agent.original"));
        Assert.Equal("[redacted]", root.Attr("http.request.header.authorization"));
        Assert.Equal("application/json; charset=utf-8", root.Attr("http.response.header.content-type"));
        Assert.False(string.IsNullOrEmpty(root.Attr("wizelens.request.id")));
        Assert.NotNull(root.Attr("wizelens.server.routed_ms"));
        Assert.True(double.Parse(root.Attr("http.response.body.size")!) > 0);
        Assert.Null(root.Attr("wizelens.response.body"));
    }

    [Fact]
    public async Task A_stream_is_marked_with_its_first_byte()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/events", async (HttpContext c) =>
        {
            c.Response.ContentType = "text/event-stream";
            await c.Response.WriteAsync("data: one\n\n");
            await c.Response.Body.FlushAsync();
            await Task.Delay(200);
            await c.Response.WriteAsync("data: two\n\n");
        }));
        var root = TestApp.Root(await app.TraceAsync(await app.Client.GetAsync("/events")));

        Assert.Equal("true", root.Attr("wizelens.stream"));
        Assert.True(double.Parse(root.Attr("wizelens.stream.first_byte_ms")!, System.Globalization.CultureInfo.InvariantCulture) < 150);
    }

    [Fact]
    public async Task Spans_carry_the_service_version()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/v", () => "ok"), o => o.Release = "2.0.0");
        var root = TestApp.Root(await app.TraceAsync(await app.Client.GetAsync("/v")));

        Assert.Equal("2.0.0", root.Attr("service.version"));
    }

    [Fact]
    public async Task Tags_and_user_are_recorded()
    {
        await using var app = await TestApp.StartAsync(a =>
        {
            a.Use((context, next) =>
            {
                context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "ada")], "test"));
                return next(context);
            });
            a.MapGet("/tagged", () =>
            {
                WizeLensRequest.Tag("catalog");
                WizeLensRequest.Tag("cache", "hit");
                return "ok";
            });
        });
        var root = TestApp.Root(await app.TraceAsync(await app.Client.GetAsync("/tagged")));
        Assert.Equal("", root.Attr("wizelens.tag.catalog"));
        Assert.Equal("hit", root.Attr("wizelens.tag.cache"));
        Assert.Equal("ada", root.Attr("enduser.id"));
    }

    [Fact]
    public async Task Cors_preflight_is_not_traced()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/items", () => "ok"));
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/items");
        preflight.Headers.Add("Access-Control-Request-Method", "GET");
        var response = await app.Client.SendAsync(preflight);
        Assert.False(response.Headers.Contains("X-WizeLens-Trace"));
    }

    [Theory]
    [InlineData("kube-probe/1.35")]
    [InlineData("GoogleHC/1.0")]
    [InlineData("ELB-HealthChecker/2.0")]
    [InlineData("GoogleStackdriverMonitoring-UptimeChecks(https://cloud.google.com/monitoring)")]
    public async Task Health_check_is_not_traced(string agent)
    {
        // Three small apps' probes were 200 traces an hour, and the trace list showed nothing else.
        await using var app = await TestApp.StartAsync(a => a.MapGet("/health", () => "ok"));
        using var probe = new HttpRequestMessage(HttpMethod.Get, "/health");
        probe.Headers.TryAddWithoutValidation("User-Agent", agent);
        var response = await app.Client.SendAsync(probe);
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
        Assert.False(response.Headers.Contains("X-WizeLens-Trace"));
        Assert.Empty(app.Store.All());

        // A visitor on the same path is still traced.
        var visitor = await app.Client.GetAsync("/health");
        Assert.True(visitor.Headers.Contains("X-WizeLens-Trace"));
    }

    [Fact]
    public void Tag_outside_a_request_does_nothing() => WizeLensRequest.Tag("lonely", "value");

    [Fact]
    public async Task Response_body_is_kept_when_enabled()
    {
        await using var app = await TestApp.StartAsync(
            a => a.MapGet("/json", () => Results.Ok(new { name = "ada" })),
            o => o.CaptureResponseBody = true);
        var response = await app.Client.GetAsync("/json");
        Assert.Equal("""{"name":"ada"}""", await response.Content.ReadAsStringAsync());
        var root = TestApp.Root(await app.TraceAsync(response));
        Assert.Equal("""{"name":"ada"}""", root.Attr("wizelens.response.body"));
        Assert.Equal("false", root.Attr("wizelens.response.body.truncated")?.ToLowerInvariant());
    }

    [Fact]
    public async Task Large_body_is_cut_and_binary_is_skipped()
    {
        var big = new string('x', 40_000);
        await using var app = await TestApp.StartAsync(a =>
        {
            a.MapGet("/big", () => Results.Text(big, "text/plain"));
            a.MapGet("/bin", () => Results.Bytes(new byte[2048], "application/octet-stream"));
        }, o => o.CaptureResponseBody = true);

        var bigResponse = await app.Client.GetAsync("/big");
        Assert.Equal(big, await bigResponse.Content.ReadAsStringAsync());
        var bigRoot = TestApp.Root(await app.TraceAsync(bigResponse));
        Assert.Equal(16 * 1024, bigRoot.Attr("wizelens.response.body")!.Length);
        Assert.Equal("true", bigRoot.Attr("wizelens.response.body.truncated")?.ToLowerInvariant());
        Assert.Equal("40000", bigRoot.Attr("http.response.body.size"));

        var binRoot = TestApp.Root(await app.TraceAsync(await app.Client.GetAsync("/bin")));
        Assert.Null(binRoot.Attr("wizelens.response.body"));
        Assert.Equal("2048", binRoot.Attr("http.response.body.size"));
    }
}
