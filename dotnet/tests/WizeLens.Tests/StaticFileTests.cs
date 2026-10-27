using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.FileProviders;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class StaticFileTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("wl-static-").FullName;

    public StaticFileTests()
    {
        File.WriteAllText(Path.Combine(_root, "site.css"), "body { margin: 0; }");
        File.WriteAllBytes(Path.Combine(_root, "logo.png"), [0x89, 0x50, 0x4E, 0x47]);
        File.WriteAllText(Path.Combine(_root, "about.html"), "<html><body>Ashgrove & Peña</body></html>");
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private Task<TestApp> StartAsync(bool traceFiles = false) => TestApp.StartAsync(a =>
    {
        a.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(_root) });
        a.MapGet("/catalog", () => "12 products");
    }, o => o.TraceStaticFiles = traceFiles);

    [Fact]
    public async Task Served_files_are_not_traced_but_pages_and_missing_files_are()
    {
        // eShop's home page brought 17 file requests, and the page itself was not on page 1 of Requests.
        await using var app = await StartAsync();
        Assert.Equal("body { margin: 0; }", await app.Client.GetStringAsync("/site.css"));
        (await app.Client.GetAsync("/logo.png")).EnsureSuccessStatusCode();
        var missing = await app.Client.GetAsync("/images/products/13.png");
        var page = await app.Client.GetAsync("/about.html");
        var catalog = await app.Client.GetAsync("/catalog");

        Assert.Equal(404, (int)missing.StatusCode);
        foreach (var kept in new[] { missing, page, catalog }) Assert.NotNull(await app.TraceAsync(kept));
        Assert.Equal(3, app.Store.All().Count);
    }

    [Fact]
    public async Task Trace_static_files_keeps_them()
    {
        await using var app = await StartAsync(traceFiles: true);
        var file = await app.Client.GetAsync("/site.css");
        Assert.NotNull(await app.TraceAsync(file));
    }
}
