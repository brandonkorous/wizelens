using System.Diagnostics;

namespace WizeLens.Tests;

/// <summary>A fact that needs Docker (Testcontainers); skipped when Docker is not running or WIZELENS_SKIP_DOCKER=1.</summary>
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
            var info = new ProcessStartInfo("docker", "info --format {{.ServerVersion}}")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            using var process = Process.Start(info);
            return process is not null && process.WaitForExit(15_000) && process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
