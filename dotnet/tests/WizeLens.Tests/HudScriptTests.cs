using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using WizeLens.Web;
using static WizeLens.Tests.HudInjectTests;

namespace WizeLens.Tests;

/// <summary>The HUD script route, the Hud option, static pages, the auto install, and the response body wrapper on its own.</summary>
[Collection(TestApp.Collection)]
public class HudScriptTests
{
    [Fact]
    public async Task Serves_the_script_and_its_map_fresh()
    {
        await using var app = await TestApp.StartAsync(_ => { });
        var script = await app.Client.GetAsync("/_wizelens/wizelens.js");
        Assert.Equal(HttpStatusCode.OK, script.StatusCode);
        Assert.Equal("application/javascript", script.Content.Headers.ContentType?.MediaType);
        Assert.True(script.Headers.CacheControl?.NoCache);
        var map = await app.Client.GetAsync("/_wizelens/wizelens.js.map");
        if (!HudScript.IsBuilt)
        {
            Assert.Contains("not built", await script.Content.ReadAsStringAsync());
            return;
        }
        Assert.EndsWith("//# sourceMappingURL=wizelens.js.map", (await script.Content.ReadAsStringAsync()).TrimEnd());
        Assert.Equal((HttpStatusCode.OK, "application/json"), (map.StatusCode, map.Content.Headers.ContentType?.MediaType));
        Assert.True(map.Headers.CacheControl?.NoCache);
    }

    [Fact]
    public async Task Answers_not_modified_for_the_same_script()
    {
        await using var app = await TestApp.StartAsync(_ => { });
        var first = await app.Client.GetAsync("/_wizelens/wizelens.js");
        using var again = new HttpRequestMessage(HttpMethod.Get, "/_wizelens/wizelens.js");
        again.Headers.IfNoneMatch.Add(first.Headers.ETag!);
        Assert.Equal(HttpStatusCode.NotModified, (await app.Client.SendAsync(again)).StatusCode);
    }

    [Fact]
    public async Task Serves_no_script_when_send_only()
    {
        await using var app = await TestApp.StartAsync(_ => { }, o => o.Dashboard = false);
        Assert.Equal(HttpStatusCode.NotFound, (await app.Client.GetAsync("/_wizelens/wizelens.js")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await app.Client.GetAsync("/_wizelens/wizelens.js.map")).StatusCode);
    }

    [Theory]
    [InlineData("false", false)]
    [InlineData("0", false)]
    [InlineData("true", true)]
    [InlineData(null, true)]
    public void Reads_the_hud_variable(string? value, bool expected)
    {
        Environment.SetEnvironmentVariable("WIZELENS_HUD", value);
        try
        {
            Assert.Equal(expected, new WizeLensOptions().Hud);
        }
        finally
        {
            Environment.SetEnvironmentVariable("WIZELENS_HUD", null);
        }
    }

    [Fact]
    public async Task Puts_the_tag_in_a_static_page()
    {
        var root = Directory.CreateTempSubdirectory("wizelens-hud-").FullName;
        await File.WriteAllTextAsync(Path.Combine(root, "index.html"), Page);
        try
        {
            await using var app = await TestApp.StartAsync(a => a.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(root) }));
            Assert.Equal(Injected, await app.Client.GetStringAsync("/index.html"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Puts_the_tag_in_pages_of_an_auto_installed_app()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development",
            Args = ["--hostingStartupAssemblies=WizeLens.AutoInstrumentation"],
        });
        builder.WebHost.UseTestServer();
        builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
        await using var app = builder.Build();
        app.UseResponseCompression();
        app.MapGet("/page", () => Results.Content(Page, "text/html"));
        await app.StartAsync();
        var client = app.GetTestClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/page");
        request.Headers.Accept.ParseAdd("text/html");
        request.Headers.AcceptEncoding.ParseAdd("gzip");
        var response = await client.SendAsync(request);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(Injected, await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/_wizelens/wizelens.js")).StatusCode);
    }

    private static (DefaultHttpContext Context, MemoryStream Sent, HudBody Body) Wrap(string contentType = "text/html")
    {
        var context = new DefaultHttpContext();
        var sent = new MemoryStream();
        context.Response.ContentType = contentType;
        var body = new HudBody(context, new StreamResponseBodyFeature(sent), () => Encoding.UTF8.GetBytes(Tag));
        return (context, sent, body);
    }

    [Fact]
    public async Task Reads_a_sent_page_file_through_the_tag()
    {
        var file = Path.GetTempFileName();
        await File.WriteAllTextAsync(file, Page);
        try
        {
            var (_, sent, body) = Wrap();
            await ((IHttpResponseBodyFeature)body).SendFileAsync(file, 0, null);
            await body.CompleteAsync();
            Assert.Equal(Injected, Encoding.UTF8.GetString(sent.ToArray()));
        }
        finally
        {
            File.Delete(file);
        }
    }

    [Fact]
    public async Task Writes_through_the_pipe_writer_after_start()
    {
        var (context, sent, body) = Wrap();
        context.Response.ContentLength = Page.Length;
        await body.StartAsync();
        await body.Writer.WriteAsync(Encoding.UTF8.GetBytes(Page));
        await body.FinishAsync();
        Assert.Equal((Injected, (long?)null), (Encoding.UTF8.GetString(sent.ToArray()), context.Response.ContentLength));
    }

    [Fact]
    public async Task Passes_other_answers_straight_through()
    {
        var (context, sent, body) = Wrap("text/plain");
        context.Response.ContentLength = Page.Length;
        await body.WriteAsync(Encoding.UTF8.GetBytes(Page));
        await body.FinishAsync();
        Assert.False(body.Injecting);
        Assert.Equal((Page, (long?)Page.Length), (Encoding.UTF8.GetString(sent.ToArray()), context.Response.ContentLength));
    }

    [Fact]
    public async Task Skips_a_body_end_followed_by_more_than_the_tail_holds()
    {
        var page = "<html><body><script>\"</body>\"</script>" + new string('x', HtmlTail.MaxHeld + 10) + "</html>";
        var (_, sent, body) = Wrap();
        await body.WriteAsync(Encoding.UTF8.GetBytes(page));
        await body.FinishAsync();
        Assert.Equal(page, Encoding.UTF8.GetString(sent.ToArray()));
    }

    [Theory]
    [InlineData("</body>", 0)]
    [InlineData("a</BoDy>b</body>", 9)]
    [InlineData("\u001c/body>", -1)]
    [InlineData("</bod", -1)]
    public void Finds_the_last_body_end(string text, int expected) =>
        Assert.Equal(expected, HtmlTail.LastMarker(Encoding.UTF8.GetBytes(text), 0));
}
