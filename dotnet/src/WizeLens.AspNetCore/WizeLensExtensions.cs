using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;
using WizeLens.Hub;
using WizeLens.Mcp;
using WizeLens.Metrics;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens;

/// <summary>Adds WizeLens to an ASP.NET Core app: <see cref="AddWizeLens"/>, then <see cref="UseWizeLens"/>.</summary>
public static class WizeLensExtensions
{
    private const string AzureActivitySwitch = "Azure.Experimental.EnableActivitySource";

    /// <summary>Registers WizeLens. Pair with <see cref="UseWizeLens"/>. When the auto install already added it, this call takes it over.</summary>
    public static IServiceCollection AddWizeLens(this IServiceCollection services, Action<WizeLensOptions>? configure = null)
    {
        var options = new WizeLensOptions();
        configure?.Invoke(options);
        options.TagList = Tagging.TagRules.FromOptions(options.Tags);
        SetAzureSwitch(options);
        var install = WizeLensInstall.Find(services);
        if (install is null) return AddWizeLensCore(services, options, auto: false);
        // The code install wins: its options replace the auto install's, and nothing is registered twice.
        install.Options = options;
        install.Auto = false;
        if (options.Mcp && !install.McpAdded) AddMcp(services, install);
        return services;
    }

    /// <summary>Registers every WizeLens service once. The auto install calls it with <paramref name="auto"/> true.</summary>
    internal static IServiceCollection AddWizeLensCore(IServiceCollection services, WizeLensOptions options, bool auto)
    {
        var install = new WizeLensInstall(options, auto);
        services.AddSingleton(install);
        services.AddSingleton(sp =>
        {
            var env = sp.GetRequiredService<IHostEnvironment>();
            var resolved = install.Options;
            resolved.ApplyEnvironment(env);
            WizeLensRuntime.Redactor = new Redactor(resolved.RedactKeys);
            return resolved;
        });
        AddStores(services);
        AddHostedServices(services);
        services.AddSingleton<ILoggerProvider, WizeLensLoggerProvider>();

        services.AddSingleton<TraceFederation>();
        services.AddTransient<WizeLensFederationHandler>();
        services.AddHttpClient(TraceFederation.ClientName, c => c.Timeout = TimeSpan.FromSeconds(2));
        services.ConfigureHttpClientDefaults(b => b.AddHttpMessageHandler<WizeLensFederationHandler>());

        if (options.Mcp) AddMcp(services, install);
        return services;
    }

    // Azure SDKs (Service Bus) only emit activities with this switch; leave it alone when the app set it.
    private static void SetAzureSwitch(WizeLensOptions options)
    {
        if (options.Enabled != false && !AppContext.TryGetSwitch(AzureActivitySwitch, out _)) AppContext.SetSwitch(AzureActivitySwitch, true);
    }

    private static void AddHostedServices(IServiceCollection services)
    {
        // Registered before the listener: hosted services stop in reverse order, so the last flush sees everything.
        services.AddSingleton<TraceStorageService>();
        services.AddHostedService(sp => sp.GetRequiredService<TraceStorageService>());
        // Also before the listener, so the hub gets the last spans before the app stops.
        services.AddSingleton<HubExporter>();
        services.AddHostedService(sp => sp.GetRequiredService<HubExporter>());
        // After the hub sender, so it stops first and its last points still reach the hub.
        services.AddSingleton<MetricsService>();
        services.AddHostedService(sp => sp.GetRequiredService<MetricsService>());
        services.AddSingleton<WizeLensActivityListener>();
        services.AddHostedService(sp => sp.GetRequiredService<WizeLensActivityListener>());
        services.AddHostedService<EndpointObserver>();
        services.AddHostedService<SqlClientObserver>();
    }

    private static void AddMcp(IServiceCollection services, WizeLensInstall install)
    {
        install.McpAdded = true;
        services.AddMcpServer(o => o.ServerInfo = new() { Name = "wizelens", Version = typeof(WizeLensExtensions).Assembly.GetName().Version?.ToString(3) ?? "0.0.0" })
            .WithHttpTransport(o => o.Stateless = true)
            .WithTools<WizeLensMcpTools>()
            .WithTools<WizeLensMetricTools>()
            .WithTools<WizeLensSecurityTools>()
            .WithTools<WizeLensSearchTools>();
    }

    private static void AddStores(IServiceCollection services)
    {
        services.AddSingleton(sp =>
        {
            var wizelens = sp.GetRequiredService<WizeLensOptions>();
            var store = new TraceStore(wizelens.MaxTraces, wizelens.Sampling);
            // Serilog and NLog sinks are built before the host, so they find the store here.
            if (wizelens.IsEnabled) WizeLensLogBridge.Attach(store, wizelens);
            return store;
        });
        services.AddSingleton(sp => new MetricStore(sp.GetRequiredService<WizeLensOptions>().MetricsMaxAge, MetricStore.DefaultMaxPoints));
    }

    /// <summary>Off only by the production default while an endpoint is set: say so, or the service sends nothing without a word.</summary>
    private static void WarnOffWithEndpoint(IApplicationBuilder app, WizeLensOptions options)
    {
        if (options.NormalizedEndpoint is not { } endpoint || options.Enabled is not null || Environment.GetEnvironmentVariable("WIZELENS_ENABLED") is not null) return;
        app.ApplicationServices.GetService<ILoggerFactory>()?.CreateLogger("WizeLens")
            .LogWarning("WizeLens is off outside Development, so nothing is sent to {Endpoint}. Set WIZELENS_ENABLED=true to send.", endpoint);
    }

    /// <summary>Adds the middleware and maps <c>/_wizelens</c> (UI, API, MCP); call it early; does nothing when disabled or already added.</summary>
    public static IApplicationBuilder UseWizeLens(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<WizeLensOptions>();
        if (!options.IsEnabled) WarnOffWithEndpoint(app, options);
        if (!options.IsEnabled || options.PipelineAdded) return app;
        options.PipelineAdded = true;

        UseMiddleware(app, options);
        if (app is IEndpointRouteBuilder endpoints) WizeLensEndpoints.Map(endpoints, options);
        return app;
    }

    /// <summary>The HUD injection when it is on (outside, so a kept response body is the app's own), then the request middleware.</summary>
    internal static void UseMiddleware(IApplicationBuilder app, WizeLensOptions options)
    {
        if (options.InjectsHud) app.UseMiddleware<HudMiddleware>();
        app.UseMiddleware<WizeLensMiddleware>();
    }

    /// <summary>Maps the endpoints yourself when the app is not a <c>WebApplication</c> (call it inside <c>UseEndpoints</c>).</summary>
    public static IEndpointRouteBuilder MapWizeLens(this IEndpointRouteBuilder endpoints)
    {
        var options = endpoints.ServiceProvider.GetRequiredService<WizeLensOptions>();
        if (options.IsEnabled) WizeLensEndpoints.Map(endpoints, options);
        return endpoints;
    }
}
