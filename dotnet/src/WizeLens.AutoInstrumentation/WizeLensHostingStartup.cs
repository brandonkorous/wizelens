using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.AutoInstrumentation;

[assembly: HostingStartup(typeof(WizeLensHostingStartup))]

namespace WizeLens.AutoInstrumentation;

/// <summary>Adds WizeLens to an ASP.NET Core app with no code: <c>ASPNETCORE_HOSTINGSTARTUPASSEMBLIES=WizeLens.AutoInstrumentation</c>.</summary>
public sealed class WizeLensHostingStartup : IHostingStartup
{
    public void Configure(IWebHostBuilder builder) => builder.ConfigureServices(services =>
    {
        try
        {
            Add(services);
        }
        catch (Exception ex) when (ex is MissingMethodException or MissingFieldException or TypeLoadException or FileLoadException)
        {
            // The app ships an older WizeLens of its own: that is a code install, and it wins.
            Console.WriteLine("[wizelens] The app has its own WizeLens, so the auto install steps aside.");
        }
    });

    // Not inlined, so a missing WizeLens member fails the call above, where it is caught, and not the whole callback.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Add(IServiceCollection services)
    {
        if (!WizeLensAutoInstall.AddServices(services)) return;
        services.AddHostedService<EfCoreObserver>();
        services.AddHostedService<ExceptionObserver>();
    }
}
