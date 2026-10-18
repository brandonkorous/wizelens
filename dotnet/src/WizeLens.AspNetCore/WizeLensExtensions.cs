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

public static class WizeLensExtensions
{
    private const string AzureActivitySwitch = "Azure.Experimental.EnableActivitySource";

    /// <summary>Registers WizeLens. Pair with <see cref="UseWizeLens"/>.</summary>
    public static IServiceCollection AddWizeLens(this IServiceCollection services, Action<WizeLensOptions>? configure = null)
    {
        var options = new WizeLensOptions();
        configure?.Invoke(options);
        // Azure SDKs (Service Bus) only emit activities with this switch; leave it alone when the app set it.
        if (options.Enabled != false && !AppContext.TryGetSwitch(AzureActivitySwitch, out _)) AppContext.SetSwitch(AzureActivitySwitch, true);

        services.AddSingleton(sp =>
        {
            var env = sp.GetRequiredService<IHostEnvironment>();
            options.IsEnabled = options.Enabled ?? WizeLensOptions.EnvFlag("WIZELENS_ENABLED") ?? env.IsDevelopment();
            options.ServesDashboard = options.Dashboard ?? WizeLensOptions.EnvFlag("WIZELENS_DASHBOARD") ?? env.IsDevelopment();
            options.ServiceName ??= env.ApplicationName;
            WizeLensRuntime.Redactor = new Redactor(options.RedactKeys);
            return options;
        });
        AddStores(services);
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
        services.AddSingleton<ILoggerProvider, WizeLensLoggerProvider>();

        services.AddSingleton<TraceFederation>();
        services.AddTransient<WizeLensFederationHandler>();
        services.AddHttpClient(TraceFederation.ClientName, c => c.Timeout = TimeSpan.FromSeconds(2));
        services.ConfigureHttpClientDefaults(b => b.AddHttpMessageHandler<WizeLensFederationHandler>());

        if (options.EnableMcp)
        {
            services.AddMcpServer(o => o.ServerInfo = new() { Name = "wizelens", Version = typeof(WizeLensExtensions).Assembly.GetName().Version?.ToString(3) ?? "0.0.0" })
                .WithHttpTransport(o => o.Stateless = true)
                .WithTools<WizeLensMcpTools>()
                .WithTools<WizeLensMetricTools>()
                .WithTools<WizeLensSearchTools>();
        }

        return services;
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

    /// <summary>Adds the middleware and maps <c>/_wizelens</c> (UI, API, MCP); call it early; does nothing when disabled.</summary>
    public static IApplicationBuilder UseWizeLens(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<WizeLensOptions>();
        if (!options.IsEnabled) return app;

        app.UseMiddleware<WizeLensMiddleware>();
        if (app is IEndpointRouteBuilder endpoints) WizeLensEndpoints.Map(endpoints, options);
        return app;
    }

    /// <summary>Maps the endpoints yourself when the app is not a <c>WebApplication</c> (call it inside <c>UseEndpoints</c>).</summary>
    public static IEndpointRouteBuilder MapWizeLens(this IEndpointRouteBuilder endpoints)
    {
        var options = endpoints.ServiceProvider.GetRequiredService<WizeLensOptions>();
        if (options.IsEnabled) WizeLensEndpoints.Map(endpoints, options);
        return endpoints;
    }
}
