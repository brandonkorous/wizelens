using Microsoft.Extensions.DependencyInjection;

namespace WizeLens;

/// <summary>The one WizeLens registration in a service collection, and whether the auto install or the app's own code made it.</summary>
internal sealed class WizeLensInstall(WizeLensOptions options, bool auto)
{
    /// <summary>The options the app runs with. A code install replaces the auto install's.</summary>
    public WizeLensOptions Options { get; set; } = options;

    /// <summary>True while the auto install owns the registration; false once <c>AddWizeLens</c> took it over.</summary>
    public bool Auto { get; set; } = auto;

    /// <summary>True once the MCP server is registered.</summary>
    public bool McpAdded { get; set; }

    /// <summary>The registration in <paramref name="services"/>, or null when WizeLens is not added yet.</summary>
    public static WizeLensInstall? Find(IServiceCollection services) =>
        services.LastOrDefault(d => d.ServiceType == typeof(WizeLensInstall))?.ImplementationInstance as WizeLensInstall;
}
