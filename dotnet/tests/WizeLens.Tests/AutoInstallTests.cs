using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WizeLens.EntityFrameworkCore;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>The auto install: the WizeLens.AutoInstrumentation hosting startup adds WizeLens to an app with no WizeLens code.</summary>
[Collection(TestApp.Collection)]
public class AutoInstallTests
{
    private sealed class ShopDb(DbContextOptions<ShopDb> options) : DbContext(options)
    {
        public DbSet<Item> Items => Set<Item>();
    }

    private sealed class Item
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
    }

    /// <summary>An app started the way the startup hook starts it: with WizeLens.AutoInstrumentation as a hosting startup.</summary>
    private static async Task<WebApplication> StartAsync(Action<WebApplicationBuilder>? configure = null, Action<WebApplication>? use = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Development",
            Args = ["--hostingStartupAssemblies=WizeLens.AutoInstrumentation"],
        });
        builder.WebHost.UseTestServer();
        configure?.Invoke(builder);
        var app = builder.Build();
        use?.Invoke(app);
        app.MapGet("/hello/{name}", (string name) => $"hello {name}");
        app.MapGet("/boom", string () => throw new InvalidOperationException("auto boom"));
        app.MapGet("/items", async (HttpContext c) => await c.RequestServices.GetRequiredService<ShopDb>().Items.Select(i => i.Name).ToListAsync());
        await app.StartAsync();
        return app;
    }

    private static async Task<Trace> TraceAsync(WebApplication app, HttpResponseMessage response)
    {
        var traceId = Assert.Single(response.Headers.GetValues(WizeLensMiddleware.TraceHeader));
        var trace = await app.GetTestClient().GetFromJsonAsync<Trace>($"/_wizelens/api/traces/{traceId}", WizeLensJson.Options);
        return trace!;
    }

    private static void AddShop(WebApplicationBuilder builder, bool interceptor)
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        builder.Services.AddDbContext<ShopDb>(o =>
        {
            o.UseSqlite(connection);
            if (interceptor) o.UseWizeLens();
        });
    }

    private static async Task SeedAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ShopDb>();
        await db.Database.EnsureCreatedAsync();
        db.Items.Add(new Item { Name = "lamp" });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Adds_WizeLens_with_no_AddWizeLens_or_UseWizeLens()
    {
        await using var app = await StartAsync();
        var response = await app.GetTestClient().GetAsync("/hello/ada");
        Assert.Equal("hello ada", await response.Content.ReadAsStringAsync());
        var root = TestApp.Root(await TraceAsync(app, response));
        Assert.Equal("GET /hello/{name}", root.Name);
        Assert.True(app.Services.GetRequiredService<WizeLensInstall>().Auto);
        Assert.Equal(HttpStatusCode.OK, (await app.GetTestClient().GetAsync("/_wizelens/api/info")).StatusCode);
    }

    [Fact]
    public async Task Records_exceptions_the_developer_exception_page_caught()
    {
        await using var app = await StartAsync();
        var response = await app.GetTestClient().GetAsync("/boom");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var root = TestApp.Root(await TraceAsync(app, response));
        Assert.Equal(SpanStatuses.Error, root.Status);
        Assert.Single(root.Events, e => e.Name == "exception" && e.Attributes["exception.message"]?.ToString() == "auto boom");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Records_EF_Core_commands_once_with_or_without_the_EF_Core_interceptor(bool interceptor)
    {
        await using var app = await StartAsync(b => AddShop(b, interceptor));
        await SeedAsync(app);
        var response = await app.GetTestClient().GetAsync("/items");
        var trace = await TraceAsync(app, response);
        var query = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("efcore", query.Attr("wizelens.db.adapter"));
        Assert.Equal("SELECT Items", query.Name);
    }

    [Fact]
    public async Task The_code_install_wins_when_the_app_adds_WizeLens_too()
    {
        await using var app = await StartAsync(
            b => b.Services.AddWizeLens(o => { o.Service = "code-api"; o.Storage = WizeLensStorage.Memory; }),
            a => a.UseWizeLens());
        var response = await app.GetTestClient().GetAsync("/hello/grace");
        var trace = await TraceAsync(app, response);
        var root = TestApp.Root(trace);
        Assert.Equal("code-api", root.Service);
        Assert.False(app.Services.GetRequiredService<WizeLensInstall>().Auto);
        Assert.Single(app.Services.GetServices<IHostedService>().OfType<TraceStorageService>());
        Assert.Single(app.Services.GetServices<WizeLensOptions>());
    }
}
