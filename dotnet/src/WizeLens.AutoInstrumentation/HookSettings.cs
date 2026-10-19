namespace WizeLens.AutoInstrumentation;

/// <summary>The environment variables the startup hook reads and sets.</summary>
internal static class HookSettings
{
    public const string AssemblyName = "WizeLens.AutoInstrumentation";
    public const string HostingStartupVariable = "ASPNETCORE_HOSTINGSTARTUPASSEMBLIES";

    /// <summary>True when WIZELENS_ENABLED says off, so the hook does nothing at all.</summary>
    public static bool Off() => Environment.GetEnvironmentVariable("WIZELENS_ENABLED")?.Trim().ToLowerInvariant() is "false" or "0" or "off" or "no";

    /// <summary>Adds this assembly to the hosting startup list, so ASP.NET Core runs <see cref="WizeLensHostingStartup"/>.</summary>
    public static void AddHostingStartup()
    {
        var current = Environment.GetEnvironmentVariable(HostingStartupVariable) ?? "";
        var names = current.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (names.Contains(AssemblyName, StringComparer.OrdinalIgnoreCase)) return;
        Environment.SetEnvironmentVariable(HostingStartupVariable, string.Join(';', names.Append(AssemblyName)));
    }
}
