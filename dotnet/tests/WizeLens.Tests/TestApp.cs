using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>Starts an in-memory app with WizeLens on and gives typed access to its API.</summary>
internal sealed class TestApp : IAsyncDisposable
{
    // Listeners are process-wide: apps under test, and tests that send HTTP, must not run at the same time.
    public const string Collection = "wizelens-app";

    private TestApp(WebApplication app)
    {
        App = app;
        Client = app.GetTestClient();
    }

    public WebApplication App { get; }

    public HttpClient Client { get; }

    public TraceStore Store => App.Services.GetRequiredService<TraceStore>();

    public static async Task<TestApp> StartAsync(
        Action<WebApplication> map, Action<WizeLensOptions>? configure = null, Action<IServiceCollection>? services = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        services?.Invoke(builder.Services);
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

    /// <summary>The kept spans that match, once <paramref name="count"/> have arrived: a server span can end just after its client has the answer.</summary>
    public async Task<List<Span>> SpansAsync(Func<Span, bool> match, int count)
    {
        var until = DateTime.UtcNow.AddSeconds(5);
        while (true)
        {
            var spans = Store.All().SelectMany(t => t.Spans).Where(match).ToList();
            if (spans.Count >= count || DateTime.UtcNow > until) return spans;
            await Task.Delay(20);
        }
    }

    public static Span Root(Trace trace) => Assert.Single(trace.Spans, s => s.Category == SpanCategories.HttpServer);

    public async ValueTask DisposeAsync() => await App.DisposeAsync();
}
