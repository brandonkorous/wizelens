using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text;
using WizeLens.Capture;

namespace WizeLens.Metrics;

/// <summary>Listens to every meter in the process except WizeLens's own and turns measurements into points.</summary>
internal sealed class MetricCollector : IDisposable
{
    public const int DefaultMaxSeries = 1000;

    private readonly MeterListener _listener = new();
    private readonly ConcurrentDictionary<(Instrument, string), MetricSeries> _series = new();
    private readonly MetricStore _store;
    private readonly string _service;
    private readonly int _maxSeries;
    private readonly Func<double> _now;

    public MetricCollector(MetricStore store, string service, int maxSeries = DefaultMaxSeries, Func<double>? now = null)
    {
        _store = store;
        _service = service;
        _maxSeries = maxSeries;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _listener.InstrumentPublished = (instrument, listener) =>
        {
            if (!MetricInstruments.IsOwn(instrument.Meter) && MetricInstruments.ShapeOf(instrument) is not null) listener.EnableMeasurementEvents(instrument);
        };
        _listener.SetMeasurementEventCallback<double>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<float>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<long>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<int>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<short>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<byte>((i, v, t, _) => Record(i, v, t));
        _listener.SetMeasurementEventCallback<decimal>((i, v, t, _) => Record(i, (double)v, t));
    }

    public int SeriesCount => _series.Count;

    public void Start() => _listener.Start();

    /// <summary>Reads observable instruments, then stores one point per series with news.</summary>
    public int Collect()
    {
        try
        {
            _listener.RecordObservableInstruments();
            var now = _now();
            var points = new List<MetricPoint>();
            foreach (var series in _series.Values)
            {
                if (series.Collect(_service, now) is { } point) points.Add(point);
            }
            _store.Add(points, now);
            return points.Count;
        }
        catch
        {
            // Metrics must never break the app.
            return 0;
        }
    }

    private void Record(Instrument instrument, double value, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        try
        {
            if (!double.IsFinite(value)) return;
            var key = (instrument, TagKey(tags));
            if (!_series.TryGetValue(key, out var series))
            {
                if (_series.Count >= _maxSeries) return;
                series = _series.GetOrAdd(key, NewSeries(instrument, tags));
            }
            series.Record(value);
        }
        catch
        {
            // Metrics must never break the app.
        }
    }

    private MetricSeries NewSeries(Instrument instrument, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        var attributes = new Dictionary<string, object?>(tags.Length);
        foreach (var (k, v) in tags) attributes[k] = v;
        return new MetricSeries(instrument, MetricInstruments.ShapeOf(instrument)!.Value, WizeLensRuntime.Redactor.Redact(attributes), _now());
    }

    /// <summary>A key for one tag set; tags in any order give the same key.</summary>
    private static string TagKey(ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        if (tags.Length == 0) return "";
        var pairs = new string[tags.Length];
        for (var i = 0; i < tags.Length; i++) pairs[i] = tags[i].Key + "=" + tags[i].Value;
        Array.Sort(pairs, StringComparer.Ordinal);
        return new StringBuilder().AppendJoin('\u0001', pairs).ToString();
    }

    public void Dispose() => _listener.Dispose();
}
