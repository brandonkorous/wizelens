using System.IO.Compression;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static WizeLens.Tests.HudInjectTests;

namespace WizeLens.Tests;

/// <summary>With response compression on, a page load gets plain HTML with the HUD, and every other answer still compresses.</summary>
[Collection(TestApp.Collection)]
public class HudCompressionTests
{
    private static void AddCompression(IServiceCollection services) => services.AddResponseCompression(o =>
    {
        o.EnableForHttps = true;
        o.Providers.Add<GzipCompressionProvider>();
        o.MimeTypes = [.. ResponseCompressionDefaults.MimeTypes, "application/javascript"];
    });

    private static void Map(WebApplication app)
    {
        app.MapGet("/page", () => Results.Content(Page, "text/html"));
        app.MapGet("/json", () => Results.Json(new { html = Page }));
        app.MapGet("/app.js", () => Results.Content("console.log(\"" + new string('x', 200) + "\");", "application/javascript"));
    }

    private static Task<TestApp> StartAsync(bool hud = true) => TestApp.StartAsync(a =>
    {
        a.UseResponseCompression();
        Map(a);
    }, o => o.Hud = hud, AddCompression);

    private static Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string accept)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("Accept", accept);
        request.Headers.AcceptEncoding.ParseAdd("gzip");
        return client.SendAsync(request);
    }

    private static async Task<string> TextAsync(HttpResponseMessage response)
    {
        var stream = await response.Content.ReadAsStreamAsync();
        if (response.Content.Headers.ContentEncoding.Contains("gzip")) stream = new GZipStream(stream, CompressionMode.Decompress);
        return await new StreamReader(stream).ReadToEndAsync();
    }

    [Fact]
    public async Task A_page_load_gets_plain_html_with_the_tag()
    {
        await using var app = await StartAsync();
        var response = await GetAsync(app.Client, "/page", "text/html,application/xhtml+xml,*/*;q=0.8");
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(Injected, await TextAsync(response));
    }

    [Theory]
    [InlineData("/json", "application/json")]
    [InlineData("/app.js", "*/*")]
    [InlineData("/page", "text/html;q=0, */*")]
    public async Task Other_requests_still_compress(string path, string accept)
    {
        await using var app = await StartAsync();
        var response = await GetAsync(app.Client, path, accept);
        Assert.Equal("gzip", Assert.Single(response.Content.Headers.ContentEncoding));
        Assert.DoesNotContain("data-source=\"inject\"", await TextAsync(response));
    }

    [Fact]
    public async Task Leaves_accept_encoding_alone_without_the_hud()
    {
        await using var app = await StartAsync(hud: false);
        var response = await GetAsync(app.Client, "/page", "text/html");
        Assert.Equal("gzip", Assert.Single(response.Content.Headers.ContentEncoding));
        Assert.Equal(Page, await TextAsync(response));
    }

    [Fact]
    public async Task Compression_placed_first_compresses_the_page_with_the_tag()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        AddCompression(builder.Services);
        builder.Services.AddWizeLens(o => o.Storage = WizeLensStorage.Memory);
        await using var app = builder.Build();
        app.UseResponseCompression();
        app.UseWizeLens();
        Map(app);
        await app.StartAsync();
        var response = await GetAsync(app.GetTestClient(), "/page", "text/html");
        Assert.Equal("gzip", Assert.Single(response.Content.Headers.ContentEncoding));
        Assert.Equal(Injected, await TextAsync(response));
    }
}
