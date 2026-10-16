using NLog;
using NLog.Config;

namespace WizeLens.NLog;

/// <summary>Registers the WizeLens target with NLog.</summary>
public static class WizeLensNLogExtensions
{
    /// <summary>Makes <c>xsi:type="WizeLens"</c> known: <c>LogManager.Setup().SetupExtensions(e => e.RegisterWizeLens())</c>.</summary>
    public static ISetupExtensionsBuilder RegisterWizeLens(this ISetupExtensionsBuilder setup) => setup.RegisterTarget<WizeLensTarget>("WizeLens");
}
