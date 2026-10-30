using Microsoft.Extensions.Logging;

namespace WizeLens;

/// <summary>Log lines written outside a request (startup, background jobs, timers), and how many of them are kept.</summary>
public sealed class WizeLensLogs
{
    private bool? _outside;
    private LogLevel? _minLevel;
    private double? _rate;

    /// <summary>Keeps lines written outside a request. Default true, or the WIZELENS_LOGS_OUTSIDE variable.</summary>
    public bool Outside { get => _outside ?? true; set => _outside = value; }

    /// <summary>Lowest level kept outside a request. Default Information, or the WIZELENS_LOGS_MIN_LEVEL variable.</summary>
    public LogLevel MinLevel { get => _minLevel ?? LogLevel.Information; set => _minLevel = value; }

    /// <summary>Share of lines below Warning kept outside a request, 0 to 1. Default 1, or the WIZELENS_LOGS_SAMPLE_RATE variable.</summary>
    public double Rate { get => _rate ?? 1; set => _rate = value; }

    /// <summary>The rate, clamped to 0..1.</summary>
    internal double ClampedRate => double.IsFinite(Rate) ? Math.Clamp(Rate, 0, 1) : 1;

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

    /// <summary>Fills each setting the code left unset from its environment variable; called when WizeLens is registered.</summary>
    internal void ApplyEnvironment()
    {
        _outside ??= WizeLensEnv.Flag("WIZELENS_LOGS_OUTSIDE");
        _minLevel ??= LevelFromEnvironment();
        _rate ??= WizeLensEnv.Number("WIZELENS_LOGS_SAMPLE_RATE");
    }

    private static LogLevel? LevelFromEnvironment()
    {
        const string name = "WIZELENS_LOGS_MIN_LEVEL";
        if (WizeLensEnv.Text(name) is not { } raw) return null;
        var level = ParseLevel(raw);
        if (level is null) WizeLensEnv.WarnOnce(name, raw, "is not trace, debug, info, warn, error or critical, so the default is used");
        return level;
    }
}
