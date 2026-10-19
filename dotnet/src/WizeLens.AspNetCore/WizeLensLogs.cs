using System.Globalization;
using Microsoft.Extensions.Logging;

namespace WizeLens;

/// <summary>Log lines written outside a request (startup, background jobs, timers), and how many of them are kept.</summary>
public sealed class WizeLensLogs
{
    /// <summary>Keeps lines written outside a request. Default true, or the WIZELENS_LOGS_OUTSIDE variable.</summary>
    public bool Outside { get; set; } = WizeLensOptions.EnvFlag("WIZELENS_LOGS_OUTSIDE") ?? true;

    /// <summary>Lowest level kept outside a request. Default Information, or the WIZELENS_LOGS_MIN_LEVEL variable.</summary>
    public LogLevel MinLevel { get; set; } = LevelFromEnvironment() ?? LogLevel.Information;

    /// <summary>Share of lines below Warning kept outside a request, 0 to 1. Default 1, or the WIZELENS_LOGS_SAMPLE_RATE variable.</summary>
    public double SampleRate { get; set; } = RateFromEnvironment();

    /// <summary>The rate, clamped to 0..1.</summary>
    internal double ClampedRate => double.IsFinite(SampleRate) ? Math.Clamp(SampleRate, 0, 1) : 1;

    /// <summary>True when a line of this level, written outside a request, is kept; lines below Warning are sampled.</summary>
    internal bool Keeps(LogLevel level)
    {
        if (!Outside || level == LogLevel.None || level < MinLevel) return false;
        if (level >= LogLevel.Warning) return true;
        var rate = ClampedRate;
        return rate >= 1 || (rate > 0 && Random.Shared.NextDouble() < rate);
    }

    /// <summary>A level name: trace, debug, info or information, warn or warning, error, critical. Null when unknown.</summary>
    internal static LogLevel? ParseLevel(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "trace" => LogLevel.Trace,
        "debug" => LogLevel.Debug,
        "info" or "information" => LogLevel.Information,
        "warn" or "warning" => LogLevel.Warning,
        "error" => LogLevel.Error,
        "critical" => LogLevel.Critical,
        _ => null,
    };

    private static LogLevel? LevelFromEnvironment() => ParseLevel(Environment.GetEnvironmentVariable("WIZELENS_LOGS_MIN_LEVEL"));

    private static double RateFromEnvironment() =>
        double.TryParse(Environment.GetEnvironmentVariable("WIZELENS_LOGS_SAMPLE_RATE"), NumberStyles.Float, CultureInfo.InvariantCulture, out var rate) ? rate : 1;
}
