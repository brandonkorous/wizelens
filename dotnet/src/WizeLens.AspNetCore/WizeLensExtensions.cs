using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;
using WizeLens.Mcp;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens;

public static class WizeLensExtensions
{
    /// <summary>Registers WizeLens. Pair with <see cref="UseWizeLens"/>.</summary>
    public static IServiceCollection AddWizeLens(this IServiceCollection services, Action<WizeLensOptions>? configure = null)
    {
        var options = new WizeLensOptions();
        configure?.Invoke(options);

        services.AddSingleton(sp =>
        {
            var env = sp.GetRequiredService<IHostEnvironment>();
            options.IsEnabled = options.Enabled ?? env.IsDevelopment();
            options.ServiceName ??= env.ApplicationName;
            WizeLensRuntime.Redactor = new Redactor(options.RedactKeys);
            return options;
        });
        services.AddSingleton(sp => new TraceStore(sp.GetRequiredService<WizeLensOptions>().MaxTraces));
        // Registered before the listener: hosted services stop in reverse order, so capture stops first
        // and the final flush then writes everything.
        services.AddSingleton<TraceStorageService>();
        services.AddHostedService(sp => sp.GetRequiredService<TraceStorageService>());
        services.AddSingleton<WizeLensActivityListener>();
        services.AddHostedService(sp => sp.GetRequiredService<WizeLensActivityListener>());
        services.AddSingleton<ILoggerProvider, WizeLensLoggerProvider>();

        services.AddSingleton<TraceFederation>();
        services.AddTransient<WizeLensFederationHandler>();
        services.AddHttpClient(TraceFederation.ClientName, c => c.Timeout = TimeSpan.FromSeconds(2));
        services.ConfigureHttpClientDefaults(b => b.AddHttpMessageHandler<WizeLensFederationHandler>());

        if (options.EnableMcp)
        {
            services.AddMcpServer(o => o.ServerInfo = new() { Name = "wizelens", Version = "0.1.0" })
                .WithHttpTransport(o => o.Stateless = true)
                .WithTools<WizeLensMcpTools>();
        }

        return services;
    }

    /// <summary>
    /// Adds WizeLens middleware and maps <c>/_wizelens</c> (UI, API and, when enabled, MCP).
    /// Does nothing when WizeLens is disabled. Call it early in the pipeline.
    /// </summary>
    public static IApplicationBuilder UseWizeLens(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<WizeLensOptions>();
        if (!options.IsEnabled) return app;

        app.UseMiddleware<WizeLensMiddleware>();
        if (app is IEndpointRouteBuilder endpoints) WizeLensEndpoints.Map(endpoints, options);
        return app;
    }

    /// <summary>
    /// Maps WizeLens endpoints yourself. Only needed when the app builder is not a <c>WebApplication</c>
    /// (then call <c>app.UseWizeLens()</c> plus <c>endpoints.MapWizeLens()</c> inside <c>UseEndpoints</c>).
    /// </summary>
    public static IEndpointRouteBuilder MapWizeLens(this IEndpointRouteBuilder endpoints)
    {
        var options = endpoints.ServiceProvider.GetRequiredService<WizeLensOptions>();
        if (options.IsEnabled) WizeLensEndpoints.Map(endpoints, options);
        return endpoints;
    }
}
