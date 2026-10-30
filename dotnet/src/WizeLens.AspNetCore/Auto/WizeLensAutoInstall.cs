using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WizeLens.Web;

namespace WizeLens;

/// <summary>Adds WizeLens with no app code. The WizeLens.AutoInstrumentation hosting startup calls it.</summary>
internal static class WizeLensAutoInstall
{
    /// <summary>Registers WizeLens, set by environment variables only. False when WizeLens is already registered.</summary>
    public static bool AddServices(IServiceCollection services)
    {
        if (WizeLensInstall.Find(services) is not null) return false;
        WizeLensExtensions.AddWizeLensCore(services, new WizeLensOptions(), auto: true);
        services.AddSingleton<IStartupFilter, AutoStartupFilter>();
        return true;
    }

    /// <summary>The middleware (and the HUD injection), then the <c>/_wizelens</c> endpoints in a branch of their own, in front of the app's pipeline.</summary>
    public static void UsePipeline(IApplicationBuilder app, WizeLensOptions options)
    {
        options.PipelineAdded = true;
        WizeLensExtensions.UseMiddleware(app, options);
        app.MapWhen(c => c.Request.Path.StartsWithSegments(options.NormalizedBasePath), branch =>
        {
            branch.UseRouting();
            branch.UseEndpoints(e => WizeLensEndpoints.Map(e, options));
        });
    }
}

/// <summary>Puts WizeLens in front of the app's pipeline, unless the app's own <c>UseWizeLens</c> already did.</summary>
internal sealed class AutoStartupFilter(WizeLensInstall install, WizeLensOptions options, ILogger<AutoStartupFilter> logger) : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        Report();
        if (options.IsEnabled && !options.PipelineAdded) WizeLensAutoInstall.UsePipeline(app, options);
        next(app);
    };

    private void Report()
    {
        if (!install.Auto)
            logger.LogInformation("{Service} adds WizeLens in code, so the auto install steps aside.", options.Service);
        else if (options.IsEnabled)
            logger.LogInformation("WizeLens auto install on for {Service}{Endpoint}.", options.Service, options.NormalizedEndpoint is { } endpoint ? $", sending to {endpoint}" : "");
    }
}
