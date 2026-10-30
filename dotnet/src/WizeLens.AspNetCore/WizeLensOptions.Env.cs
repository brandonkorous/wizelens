using Microsoft.Extensions.Hosting;

namespace WizeLens;

public sealed partial class WizeLensOptions
{
    /// <summary>Fills each option the code left unset from its environment variable, once, when WizeLens is registered. Code-set values win.</summary>
    internal void ApplyEnvironment(IHostEnvironment env)
    {
        IsEnabled = Enabled ?? WizeLensEnv.Flag("WIZELENS_ENABLED") ?? env.IsDevelopment();
        ServesDashboard = Dashboard ?? WizeLensEnv.Flag("WIZELENS_DASHBOARD") ?? env.IsDevelopment();
        _hud ??= WizeLensEnv.Flag("WIZELENS_HUD");
        _traceStaticFiles ??= WizeLensEnv.Flag("WIZELENS_STATIC_FILES");
        _reportPackages ??= WizeLensEnv.Flag("WIZELENS_PACKAGES");
        Service ??= WizeLensEnv.Text("OTEL_SERVICE_NAME") ?? env.ApplicationName;
        Endpoint ??= WizeLensEnv.Text("WIZELENS_ENDPOINT");
        Token ??= WizeLensEnv.Text("WIZELENS_TOKEN");
        Project ??= WizeLensEnv.Text("WIZELENS_PROJECT");
        Release ??= WizeLensEnv.Text("WIZELENS_RELEASE") ?? WizeLensEnv.Text("OTEL_SERVICE_VERSION") ?? EntryVersion();
        if (TrustedRemotes.Count == 0) TrustedRemotes.AddRange(WizeLensEnv.List("WIZELENS_TRUSTED_REMOTES"));
        AddRedactKeys(WizeLensEnv.List("WIZELENS_REDACT_KEYS"));
        Sampling.ApplyEnvironment();
        Logs.ApplyEnvironment();
    }

    /// <summary>Adds keys to <see cref="RedactKeys"/>, lowercased, skipping ones already there.</summary>
    private void AddRedactKeys(IEnumerable<string> keys)
    {
        foreach (var key in keys.Select(k => k.ToLowerInvariant()))
        {
            if (!RedactKeys.Contains(key, StringComparer.OrdinalIgnoreCase)) RedactKeys.Add(key);
        }
    }
}
