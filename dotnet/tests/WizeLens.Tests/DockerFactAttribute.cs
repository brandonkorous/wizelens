using System.Diagnostics;

namespace WizeLens.Tests;

/// <summary>A fact that needs Docker with Linux containers (Testcontainers); skipped otherwise, or when WIZELENS_SKIP_DOCKER=1.</summary>
public sealed class DockerFactAttribute : FactAttribute
{
    public DockerFactAttribute()
    {
        if (!DockerCheck.Available) Skip = "Docker is not available.";
    }
}

internal static class DockerCheck
{
    public static readonly bool Available = Check();

    private static bool Check()
    {
        if (Environment.GetEnvironmentVariable("WIZELENS_SKIP_DOCKER") == "1") return false;
        try
        {
            var info = new ProcessStartInfo("docker", "info --format {{.OSType}}")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            using var process = Process.Start(info);
            if (process is null || !process.WaitForExit(15_000) || process.ExitCode != 0) return false;
            // The test images are Linux images; a Windows-container engine (Windows CI runners) cannot run them.
            return process.StandardOutput.ReadToEnd().Trim() == "linux";
        }
        catch
        {
            return false;
        }
    }
}
