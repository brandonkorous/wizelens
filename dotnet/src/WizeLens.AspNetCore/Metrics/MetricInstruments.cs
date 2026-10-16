using System.Diagnostics.Metrics;

namespace WizeLens.Metrics;

/// <summary>How an instrument's measurements become points.</summary>
internal enum SeriesShape
{
    /// <summary>Counter or UpDownCounter: a running total.</summary>
    RunningTotal,

    /// <summary>ObservableCounter or ObservableUpDownCounter: each observation is the total.</summary>
    ObservedTotal,

    /// <summary>Gauge or ObservableGauge: the last value.</summary>
    LastValue,

    /// <summary>Histogram: bucket counts per interval.</summary>
    Distribution,
}

/// <summary>Reads the shape, kind, and bucket bounds of an instrument.</summary>
internal static class MetricInstruments
{
    /// <summary>OTel's default bounds for durations in seconds (semantic conventions advice).</summary>
    internal static readonly double[] SecondsBounds = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];

    /// <summary>OTel SDK default explicit bucket bounds.</summary>
    internal static readonly double[] DefaultBounds = [0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];

    public static SeriesShape? ShapeOf(Instrument instrument)
    {
        var name = instrument.GetType().Name;
        return name switch
        {
            "Counter`1" or "UpDownCounter`1" => SeriesShape.RunningTotal,
            "ObservableCounter`1" or "ObservableUpDownCounter`1" => SeriesShape.ObservedTotal,
            "Gauge`1" or "ObservableGauge`1" => SeriesShape.LastValue,
            "Histogram`1" => SeriesShape.Distribution,
            _ => null,
        };
    }

    /// <summary>True for Counter and ObservableCounter: values only go up.</summary>
    public static bool IsMonotonic(Instrument instrument) => instrument.GetType().Name is "Counter`1" or "ObservableCounter`1";

    public static string KindOf(SeriesShape shape) => shape switch
    {
        SeriesShape.LastValue => MetricPoint.Gauge,
        SeriesShape.Distribution => MetricPoint.HistogramKind,
        _ => MetricPoint.Sum,
    };

    /// <summary>The instrument's advised bucket bounds, else the defaults for its unit.</summary>
    public static double[] BoundsOf(Instrument instrument)
    {
        var advised = instrument switch
        {
            Histogram<double> h => h.Advice?.HistogramBucketBoundaries?.ToArray(),
            Histogram<float> h => h.Advice?.HistogramBucketBoundaries?.Select(v => (double)v).ToArray(),
            Histogram<long> h => h.Advice?.HistogramBucketBoundaries?.Select(v => (double)v).ToArray(),
            Histogram<int> h => h.Advice?.HistogramBucketBoundaries?.Select(v => (double)v).ToArray(),
            _ => null,
        };
        if (advised is { Length: > 0 }) return advised;
        return instrument.Unit == "s" ? SecondsBounds : DefaultBounds;
    }

    /// <summary>WizeLens's own meters are never collected.</summary>
    public static bool IsOwn(Meter meter) => meter.Name.StartsWith("WizeLens", StringComparison.Ordinal);
}
