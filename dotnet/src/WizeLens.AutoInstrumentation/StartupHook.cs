using WizeLens.AutoInstrumentation;

/// <summary>The .NET startup hook: <c>DOTNET_STARTUP_HOOKS=/path/WizeLens.AutoInstrumentation.dll</c>. Runs before the app's Main.</summary>
internal static class StartupHook
{
    /// <summary>Lets the app load WizeLens from the hook's folder, then turns on the WizeLens hosting startup.</summary>
    public static void Initialize()
    {
        try
        {
            if (HookSettings.Off()) return;
            HookResolver.Install(Path.GetDirectoryName(typeof(StartupHook).Assembly.Location)!);
            HookSettings.AddHostingStartup();
        }
        catch (Exception ex)
        {
            // The app must start even when WizeLens cannot.
            Console.Error.WriteLine($"[wizelens] The auto install could not start: {ex.Message}");
        }
    }
}
