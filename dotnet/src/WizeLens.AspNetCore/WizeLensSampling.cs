using System.Globalization;

namespace WizeLens;

/// <summary>Keeps only part of the traces, for busy services. Every add-on with the same rate keeps the same traces.</summary>
public sealed class WizeLensSampling
{
    /// <summary>Share of traces kept, 0 to 1. Default 1 (all), or the WIZELENS_SAMPLE_RATE variable.</summary>
    public double Rate { get; set; } = RateFromEnvironment();

    /// <summary>Keeps traces with an error at any rate. Default true.</summary>
    public bool KeepErrors { get; set; } = true;

    /// <summary>Keeps traces with a server-side span at least this slow (ms) at any rate. Null turns it off. Default 1000.</summary>
    public double? KeepSlowMs { get; set; } = 1000;

    /// <summary>The rate, clamped to 0..1.</summary>
    internal double ClampedRate => double.IsFinite(Rate) ? Math.Clamp(Rate, 0, 1) : 1;

    /// <summary>True when some traces can be dropped.</summary>
    internal bool IsOn => ClampedRate < 1;

    private static double RateFromEnvironment() =>
        double.TryParse(Environment.GetEnvironmentVariable("WIZELENS_SAMPLE_RATE"), NumberStyles.Float, CultureInfo.InvariantCulture, out var rate) ? rate : 1;

    /// <summary>True when the trace falls inside the rate: the last 8 hex digits as a share. Same rule as lens-core keepByRate.</summary>
    public static bool KeepByRate(string traceId, double rate)
    {
        if (rate >= 1) return true;
        if (!(rate > 0) || traceId.Length < 8) return false;
        return uint.TryParse(traceId.AsSpan(traceId.Length - 8), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var n)
            && n / 4294967296.0 < rate;
    }
}
