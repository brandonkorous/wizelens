using System.Globalization;

namespace WizeLens;

/// <summary>Keeps only part of the traces, for busy services. Every add-on with the same rate keeps the same traces.</summary>
public sealed class WizeLensSampling
{
    private double? _rate;
    private bool? _keepErrors;
    private double? _keepSlowMs = 1000;
    private bool _keepSlowSet;

    /// <summary>Share of traces kept, 0 to 1. Default 1 (all), or the WIZELENS_SAMPLE_RATE variable.</summary>
    public double Rate { get => _rate ?? 1; set => _rate = value; }

    /// <summary>Keeps traces with an error at any rate. Default true, or the WIZELENS_KEEP_ERRORS variable.</summary>
    public bool KeepErrors { get => _keepErrors ?? true; set => _keepErrors = value; }

    /// <summary>Keeps traces with a server-side span at least this slow (ms) at any rate. Null turns it off. Default 1000, or the WIZELENS_KEEP_SLOW_MS variable (off turns it off).</summary>
    public double? KeepSlowMs
    {
        get => _keepSlowMs;
        set
        {
            _keepSlowMs = value;
            _keepSlowSet = true;
        }
    }

    /// <summary>The rate, clamped to 0..1.</summary>
    internal double ClampedRate => double.IsFinite(Rate) ? Math.Clamp(Rate, 0, 1) : 1;

    /// <summary>True when some traces can be dropped.</summary>
    internal bool IsOn => ClampedRate < 1;

    /// <summary>Fills each setting the code left unset from its environment variable; called when WizeLens is registered.</summary>
    internal void ApplyEnvironment()
    {
        _rate ??= WizeLensEnv.Number("WIZELENS_SAMPLE_RATE");
        _keepErrors ??= WizeLensEnv.Flag("WIZELENS_KEEP_ERRORS");
        if (!_keepSlowSet && WizeLensEnv.OptionalMs("WIZELENS_KEEP_SLOW_MS", out var slow)) _keepSlowMs = slow;
    }

    /// <summary>True when the trace falls inside the rate: the last 8 hex digits as a share. Every WizeLens SDK uses this same rule.</summary>
    internal static bool KeepByRate(string traceId, double rate)
    {
        if (rate >= 1) return true;
        if (!(rate > 0) || traceId.Length < 8) return false;
        return uint.TryParse(traceId.AsSpan(traceId.Length - 8), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var n)
            && n / 4294967296.0 < rate;
    }
}
