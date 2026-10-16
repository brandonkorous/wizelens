using System.Diagnostics.Metrics;

namespace WizeLens.Metrics;

/// <summary>One time series: an instrument and one tag set. Thread-safe.</summary>
internal sealed class MetricSeries(Instrument instrument, SeriesShape shape, Dictionary<string, object?> attributes, double startMs)
{
    private readonly object _lock = new();
    private readonly double[] _bounds = shape == SeriesShape.Distribution ? MetricInstruments.BoundsOf(instrument) : [];
    private long[] _counts = [];
    private double _total;
    private double _sum;
    private long _count;
    private double _min = double.PositiveInfinity;
    private double _max = double.NegativeInfinity;
    private bool _fresh;
    private bool _seen;
    private readonly double _startMs = startMs;
    private double _intervalStartMs = startMs;

    public void Record(double value)
    {
        lock (_lock)
        {
            switch (shape)
            {
                case SeriesShape.RunningTotal: _total += value; break;
                case SeriesShape.Distribution: AddToHistogram(value); break;
                default: _total = value; break;
            }
            _fresh = true;
            _seen = true;
        }
    }

    private void AddToHistogram(double value)
    {
        if (_counts.Length == 0) _counts = new long[_bounds.Length + 1];
        var i = Array.BinarySearch(_bounds, value);
        _counts[i >= 0 ? i : ~i]++;
        _count++;
        _sum += value;
        _min = Math.Min(_min, value);
        _max = Math.Max(_max, value);
    }

    /// <summary>The point for the interval that ends now, or null when there is nothing to report.</summary>
    public MetricPoint? Collect(string service, double nowMs)
    {
        lock (_lock)
        {
            var point = shape switch
            {
                SeriesShape.Distribution => _count > 0 ? HistogramPoint(service, nowMs) : null,
                SeriesShape.LastValue => _fresh ? ValuePoint(service, nowMs, null) : null,
                _ => _seen ? ValuePoint(service, nowMs, _startMs) : null,
            };
            _fresh = false;
            return point;
        }
    }

    private MetricPoint ValuePoint(string service, double nowMs, double? cumulativeStart) => new()
    {
        Name = instrument.Name,
        Kind = MetricInstruments.KindOf(shape),
        Unit = instrument.Unit ?? "",
        Description = string.IsNullOrEmpty(instrument.Description) ? null : instrument.Description,
        Service = service,
        Monotonic = shape == SeriesShape.LastValue ? null : MetricInstruments.IsMonotonic(instrument),
        Temporality = shape == SeriesShape.LastValue ? null : "cumulative",
        Attributes = new(attributes),
        TimeMs = nowMs,
        StartMs = cumulativeStart,
        Value = _total,
    };

    private MetricPoint HistogramPoint(string service, double nowMs)
    {
        var point = new MetricPoint
        {
            Name = instrument.Name,
            Kind = MetricPoint.HistogramKind,
            Unit = instrument.Unit ?? "",
            Description = string.IsNullOrEmpty(instrument.Description) ? null : instrument.Description,
            Service = service,
            Temporality = "delta",
            Attributes = new(attributes),
            TimeMs = nowMs,
            StartMs = _intervalStartMs,
            Histogram = new MetricHistogram { Count = _count, Sum = _sum, Min = _min, Max = _max, Bounds = _bounds, Counts = _counts },
        };
        _counts = [];
        (_count, _sum, _min, _max, _intervalStartMs) = (0, 0, double.PositiveInfinity, double.NegativeInfinity, nowMs);
        return point;
    }
}
