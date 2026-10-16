using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using WizeLens.Model;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>Starts an in-memory app with WizeLens on and gives typed access to its API.</summary>
internal sealed class TestApp : IAsyncDisposable
{
    // Activity listeners are process-wide, so apps under test must not run at the same time.
    public const string Collection = "wizelens-app";

    private TestApp(WebApplication app)
    {
        App = app;
        Client = app.GetTestClient();
    }

    public WebApplication App { get; }

    public HttpClient Client { get; }

    public static async Task<TestApp> StartAsync(Action<WebApplication> map, Action<WizeLensOptions>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        builder.Services.AddWizeLens(o =>
        {
            o.ServiceName = "test-api";
            o.Storage = WizeLensStorage.Memory;
            configure?.Invoke(o);
        });
        var app = builder.Build();
        app.UseWizeLens();
        map(app);
        await app.StartAsync();
        return new TestApp(app);
    }

    public async Task<Trace> TraceAsync(HttpResponseMessage response)
    {
        var traceId = Assert.Single(response.Headers.GetValues(WizeLensMiddleware.TraceHeader));
        var trace = await Client.GetFromJsonAsync<Trace>($"/_wizelens/api/traces/{traceId}", WizeLensJson.Options);
        return trace!;
    }

    public static Span Root(Trace trace) => Assert.Single(trace.Spans, s => s.Category == SpanCategories.HttpServer);

    public async ValueTask DisposeAsync() => await App.DisposeAsync();
}
