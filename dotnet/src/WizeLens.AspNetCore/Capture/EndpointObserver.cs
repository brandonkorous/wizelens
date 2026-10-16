using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace WizeLens.Capture;

/// <summary>On "endpoint matched", records routing time and wraps the endpoint so its handler gets its own span.</summary>
internal sealed class EndpointObserver(IServiceProvider services, WizeLensOptions options) : IHostedService, IObserver<KeyValuePair<string, object?>>
{
    public const string EndpointMatchedEvent = "Microsoft.AspNetCore.Routing.EndpointMatched";
    public const string RoutedMsAttribute = "wizelens.server.routed_ms";

    private IDisposable? _subscription;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (options.IsEnabled && services.GetService<DiagnosticListener>() is { } listener)
        {
            _subscription = listener.Subscribe(this, name => name == EndpointMatchedEvent);
        }
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _subscription?.Dispose();
        _subscription = null;
        return Task.CompletedTask;
    }

    public void OnNext(KeyValuePair<string, object?> value)
    {
        if (value.Key != EndpointMatchedEvent || value.Value is not HttpContext context) return;
        if (context.Request.Path.StartsWithSegments(options.NormalizedBasePath)) return;
        try
        {
            var server = WizeLensRequest.ServerActivity();
            if (server is null || !server.Recorded) return;
            server.SetTag(RoutedMsAttribute, (DateTime.UtcNow - server.StartTimeUtc).TotalMilliseconds);
            if (context.GetEndpoint() is { RequestDelegate: not null } endpoint) context.SetEndpoint(HandlerSpan.Wrap(endpoint));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    public void OnCompleted()
    {
    }

    public void OnError(Exception error)
    {
    }
}
