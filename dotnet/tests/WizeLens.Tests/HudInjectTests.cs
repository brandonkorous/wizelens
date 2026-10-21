using System.IO.Compression;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.DependencyInjection;

namespace WizeLens.Tests;

/// <summary>The HUD script tag goes before the last &lt;/body&gt; of a full HTML page, and every other answer passes through untouched.</summary>
[Collection(TestApp.Collection)]
public class HudInjectTests
{
    internal const string Tag = """<script src="/_wizelens/wizelens.js" data-endpoint="/_wizelens" data-hud="true" data-source="inject" defer></script>""";
    internal const string Page = "<!doctype html><html><head><title>Shop</title></head><body><h1>Hi</h1></body></html>";
    internal static readonly string Injected = Page.Replace("</body>", Tag + "</body>");

    private static IResult Html(string html, int status = 200) => Results.Content(html, "text/html; charset=utf-8", Encoding.UTF8, status);

    private static Task<TestApp> StartAsync(Action<WebApplication> map, Action<WizeLensOptions>? configure = null) =>
        TestApp.StartAsync(map, configure, s => s.AddResponseCompression(o => o.Providers.Add<GzipCompressionProvider>()));

    private static async Task<string> GetAsync(TestApp app, string path) => await app.Client.GetStringAsync(path);

    [Fact]
    public async Task Puts_the_tag_before_body_in_one_write()
    {
        await using var app = await StartAsync(a => a.MapGet("/page", () => Html(Page)));
        Assert.Equal(Injected, await GetAsync(app, "/page"));
    }

    [Fact]
    public async Task Finds_a_body_end_split_over_writes_in_any_case()
    {
        string[] parts = ["<html><body><p>a</p></B", "o", "DY>", "</html>"];
        await using var app = await StartAsync(a => a.MapGet("/split", async (HttpContext c) =>
        {
            c.Response.ContentType = "text/html";
            foreach (var part in parts)
            {
                await c.Response.WriteAsync(part);
                await c.Response.Body.FlushAsync();
            }
        }));
        Assert.Equal("<html><body><p>a</p>" + Tag + "</BoDY></html>", await GetAsync(app, "/split"));
    }

    [Fact]
    public async Task Takes_a_page_written_one_byte_at_a_time()
    {
        var bytes = Encoding.UTF8.GetBytes(Page);
        await using var app = await StartAsync(a => a.MapGet("/bytes", async (HttpContext c) =>
        {
            c.Response.ContentType = "text/html; charset=utf-8";
            foreach (var b in bytes) await c.Response.Body.WriteAsync(new[] { b });
        }));
        Assert.Equal(Injected, await GetAsync(app, "/bytes"));
    }

    [Fact]
    public async Task Drops_content_length_when_the_tag_goes_in()
    {
        var bytes = Encoding.UTF8.GetBytes(Page);
        await using var app = await StartAsync(a => a.MapGet("/sized", async (HttpContext c) =>
        {
            c.Response.ContentType = "text/html";
            c.Response.ContentLength = bytes.Length;
            await c.Response.Body.WriteAsync(bytes);
        }));
        var response = await app.Client.GetAsync("/sized");
        Assert.Equal(Injected, await response.Content.ReadAsStringAsync());
        // The app's length is gone; the client counts the bytes it got.
        Assert.Equal(Encoding.UTF8.GetByteCount(Injected), response.Content.Headers.ContentLength);
    }

    [Fact]
    public async Task Uses_the_last_body_end()
    {
        var page = "<html><body><script>const s = \"</body>\";</script><p>x</p></body></html>";
        await using var app = await StartAsync(a => a.MapGet("/two", () => Html(page)));
        Assert.Equal("<html><body><script>const s = \"</body>\";</script><p>x</p>" + Tag + "</body></html>", await GetAsync(app, "/two"));
    }

    [Fact]
    public async Task Leaves_a_compressed_answer_alone()
    {
        await using var app = await StartAsync(a =>
        {
            a.UseResponseCompression();
            a.MapGet("/zipped", () => Html(Page));
        });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/zipped");
        request.Headers.AcceptEncoding.ParseAdd("gzip");
        var response = await app.Client.SendAsync(request);
        Assert.Equal("gzip", Assert.Single(response.Content.Headers.ContentEncoding));
        await using var unzip = new GZipStream(await response.Content.ReadAsStreamAsync(), CompressionMode.Decompress);
        Assert.Equal(Page, await new StreamReader(unzip).ReadToEndAsync());
    }

    [Fact]
    public async Task Leaves_an_answer_with_content_encoding_alone()
    {
        await using var app = await StartAsync(a => a.MapGet("/encoded", (HttpContext c) =>
        {
            c.Response.Headers.ContentEncoding = "identity-test";
            return Html(Page);
        }));
        Assert.Equal(Page, await GetAsync(app, "/encoded"));
    }

    [Fact]
    public async Task Leaves_json_404_and_fragments_alone()
    {
        await using var app = await StartAsync(a =>
        {
            a.MapGet("/json", () => Results.Json(new { html = Page }));
            a.MapGet("/missing", () => Html(Page, 404));
            a.MapGet("/fragment", () => Html("<li>one</li><li>two</li>"));
        });
        Assert.DoesNotContain("data-source", await GetAsync(app, "/json"));
        var missing = await app.Client.GetAsync("/missing");
        Assert.Equal((HttpStatusCode.NotFound, Page), (missing.StatusCode, await missing.Content.ReadAsStringAsync()));
        Assert.Equal("<li>one</li><li>two</li>", await GetAsync(app, "/fragment"));
    }

    [Fact]
    public async Task Leaves_head_requests_alone()
    {
        var bytes = Encoding.UTF8.GetBytes(Page);
        await using var app = await StartAsync(a => a.MapMethods("/page", ["GET", "HEAD"], async (HttpContext c) =>
        {
            c.Response.ContentType = "text/html";
            c.Response.ContentLength = bytes.Length;
            if (HttpMethods.IsGet(c.Request.Method)) await c.Response.Body.WriteAsync(bytes);
        }));
        var head = await app.Client.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/page"));
        Assert.Equal(bytes.Length, head.Content.Headers.ContentLength);
        Assert.Equal(Injected, await GetAsync(app, "/page"));
    }

    [Fact]
    public async Task Leaves_its_own_path_alone()
    {
        await using var app = await StartAsync(_ => { });
        var dashboard = await GetAsync(app, "/_wizelens/");
        Assert.Contains("</body>", dashboard, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("data-source=\"inject\"", dashboard);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task Is_off_without_the_hud_or_the_dashboard(bool hud, bool dashboard)
    {
        await using var app = await StartAsync(a => a.MapGet("/page", () => Html(Page)), o =>
        {
            o.Hud = hud;
            o.Dashboard = dashboard;
        });
        Assert.Equal(Page, await GetAsync(app, "/page"));
    }
}
