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
        var name = Environment.GetEnvironmentVariable("OTEL_SERVICE_NAME");
        var options = new WizeLensOptions { ServiceName = string.IsNullOrWhiteSpace(name) ? null : name.Trim() };
        WizeLensExtensions.AddWizeLensCore(services, options, auto: true);
        services.AddSingleton<IStartupFilter, AutoStartupFilter>();
        return true;
    }

    /// <summary>The middleware, then the <c>/_wizelens</c> endpoints in a branch of their own, in front of the app's pipeline.</summary>
    public static void UsePipeline(IApplicationBuilder app, WizeLensOptions options)
    {
        options.PipelineAdded = true;
        app.UseMiddleware<WizeLensMiddleware>();
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
            logger.LogInformation("{Service} adds WizeLens in code, so the auto install steps aside.", options.ServiceName);
        else if (options.IsEnabled)
            logger.LogInformation("WizeLens auto install on for {Service}{Hub}.", options.ServiceName, options.NormalizedHubUrl is { } hub ? $", sending to {hub}" : "");
    }
}
