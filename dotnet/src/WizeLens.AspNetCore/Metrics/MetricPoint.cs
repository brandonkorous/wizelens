using System.Text.Json.Serialization;

namespace WizeLens.Metrics;

/// <summary>One metric data point (contract type MetricPoint). Gauges and sums have a value; histograms a histogram.</summary>
internal sealed class MetricPoint
{
    public const string Gauge = "gauge";
    public const string Sum = "sum";
    public const string HistogramKind = "histogram";

    public required string Name { get; init; }

    public required string Kind { get; init; }

    public string Unit { get; init; } = "";

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    public required string Service { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Monotonic { get; init; }

    /// <summary>"delta" or "cumulative"; sums and histograms only.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Temporality { get; init; }

    public Dictionary<string, object?> Attributes { get; init; } = [];

    public double TimeMs { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? StartMs { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Value { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public MetricHistogram? Histogram { get; init; }
}

/// <summary>An explicit-bucket histogram; <see cref="Counts"/> has one more entry than <see cref="Bounds"/>.</summary>
internal sealed class MetricHistogram
{
    public long Count { get; init; }

    public double Sum { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Min { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Max { get; init; }

    public double[] Bounds { get; init; } = [];

    public long[] Counts { get; init; } = [];
}
