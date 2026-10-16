using System.Diagnostics.Metrics;
using System.Text.Json;
using WizeLens.Metrics;
using WizeLens.Web;

namespace WizeLens.Tests;

public class MetricsTests
{
    private double _now = 1_000_000;

    private (Meter Meter, MetricStore Store, MetricCollector Collector) Make(int maxSeries = 1000)
    {
        var meter = new Meter("Test.Metrics." + Guid.NewGuid().ToString("N"));
        var store = new MetricStore(TimeSpan.FromHours(1), 50_000);
        var collector = new MetricCollector(store, "svc", maxSeries, () => _now);
        collector.Start();
        return (meter, store, collector);
    }

    private static List<MetricPoint> Of(MetricStore store, Meter meter) =>
        [.. store.Since(null).Where(p => p.Name.StartsWith(meter.Name, StringComparison.Ordinal))];

    [Fact]
    public void Counters_are_running_totals_per_tag_set_in_any_order()
    {
        var (meter, store, collector) = Make();
        using var _ = collector;
        var counter = meter.CreateCounter<long>(meter.Name + ".orders", "{order}", "Orders placed");
        counter.Add(2, new("shop", "a"), new("kind", "web"));
        counter.Add(3, new("kind", "web"), new("shop", "a"));
        counter.Add(1);
        collector.Collect();
        _now += 10_000;
        counter.Add(5);
        collector.Collect();

        var points = Of(store, meter);
        var tagged = points.Where(p => p.Attributes.Count == 2).ToList();
        Assert.Equal(2, tagged.Count);
        Assert.All(tagged, p => Assert.Equal(5, p.Value));
        Assert.Equal([1d, 6d], points.Where(p => p.Attributes.Count == 0).Select(p => p.Value!.Value));
        var first = points[0];
        Assert.Equal(("sum", true, "cumulative", "{order}", "Orders placed", "svc"), (first.Kind, first.Monotonic!.Value, first.Temporality!, first.Unit, first.Description!, first.Service));
        Assert.Equal(1_000_000, first.StartMs);
    }

    [Fact]
    public void Up_down_counters_and_gauges_keep_their_shape()
    {
        var (meter, store, collector) = Make();
        using var _ = collector;
        var queue = meter.CreateUpDownCounter<int>(meter.Name + ".queue");
        var level = 7.5;
        meter.CreateObservableGauge(meter.Name + ".level", () => level, "1");
        queue.Add(4);
        queue.Add(-1);
        collector.Collect();
        level = 2;
        _now += 10_000;
        collector.Collect();

        var points = Of(store, meter);
        var q = points.Where(p => p.Name.EndsWith(".queue", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, q.Count);
        Assert.All(q, p => Assert.Equal((3d, false, "sum"), (p.Value!.Value, p.Monotonic!.Value, p.Kind)));
        var gauge = points.Where(p => p.Name.EndsWith(".level", StringComparison.Ordinal)).ToList();
        Assert.Equal([7.5, 2], gauge.Select(p => p.Value!.Value));
        Assert.All(gauge, p => Assert.Equal(("gauge", (bool?)null, (string?)null), (p.Kind, p.Monotonic, p.Temporality)));
    }

    [Fact]
    public void Histograms_are_delta_buckets_with_advice_or_unit_defaults()
    {
        var (meter, store, collector) = Make();
        using var _ = collector;
        var ms = meter.CreateHistogram<double>(meter.Name + ".ms", "ms");
        var secs = meter.CreateHistogram<double>(meter.Name + ".s", "s");
        var advised = meter.CreateHistogram<long>(meter.Name + ".advised", null, null, null, new InstrumentAdvice<long> { HistogramBucketBoundaries = [1, 10] });
        foreach (var v in new[] { 3d, 12, 600 }) ms.Record(v);
        secs.Record(0.02);
        advised.Record(5);
        advised.Record(50);
        collector.Collect();
        _now += 10_000;
        ms.Record(1);
        collector.Collect();

        var points = Of(store, meter);
        var msPoints = points.Where(p => p.Name.EndsWith(".ms", StringComparison.Ordinal)).ToList();
        Assert.Equal([3L, 1L], msPoints.Select(p => p.Histogram!.Count));
        var h = msPoints[0].Histogram!;
        Assert.Equal((615d, 3d, 600d), (h.Sum, h.Min!.Value, h.Max!.Value));
        Assert.Equal(MetricInstruments.DefaultBounds, h.Bounds);
        Assert.Equal(h.Bounds.Length + 1, h.Counts.Length);
        Assert.Equal(1, h.Counts[1]);
        Assert.Equal(("delta", 1_010_000d, 1_000_000d), (msPoints[1].Temporality!, msPoints[1].TimeMs, msPoints[0].StartMs!.Value));
        Assert.Equal(MetricInstruments.SecondsBounds, points.Single(p => p.Name.EndsWith(".s", StringComparison.Ordinal)).Histogram!.Bounds);
        var adv = points.Single(p => p.Name.EndsWith(".advised", StringComparison.Ordinal)).Histogram!;
        Assert.Equal([1d, 10d], adv.Bounds);
        Assert.Equal([0L, 1L, 1L], adv.Counts);
    }

    [Fact]
    public void Skips_wizelens_meters_caps_series_and_redacts_tags()
    {
        var (meter, store, collector) = Make(maxSeries: 2);
        using var _ = collector;
        using var own = new Meter("WizeLens.Internal." + Guid.NewGuid().ToString("N"));
        own.CreateCounter<int>(own.Name + ".x").Add(1);
        var c = meter.CreateCounter<int>(meter.Name + ".calls");
        for (var i = 0; i < 5; i++) c.Add(1, new KeyValuePair<string, object?>("n", i), new("api_token", "abc"));
        collector.Collect();

        Assert.DoesNotContain(store.Since(null), p => p.Name.StartsWith("WizeLens", StringComparison.Ordinal));
        Assert.True(collector.SeriesCount <= 2);
        Assert.All(Of(store, meter), p => Assert.Equal("[redacted]", p.Attributes["api_token"]));
    }

    [Fact]
    public void Store_drops_old_points_and_keeps_the_newest_under_the_cap()
    {
        var store = new MetricStore(TimeSpan.FromMinutes(1), 3);
        var points = Enumerable.Range(0, 5).Select(i => new MetricPoint { Name = "m", Kind = "gauge", Service = "s", TimeMs = 100_000 + i, Value = i }).ToList();
        store.Add(points, 100_004);
        Assert.Equal([2d, 3d, 4d], store.Since(null).Select(p => p.Value!.Value));
        store.Add([new MetricPoint { Name = "m", Kind = "gauge", Service = "s", TimeMs = 200_000, Value = 9 }], 200_000);
        Assert.Equal([9d], store.Since(null).Select(p => p.Value!.Value));
        Assert.Empty(store.Since(200_001));
        Assert.Single(store.Since(null, limit: 1));
    }

    [Fact]
    public void Json_matches_the_contract()
    {
        var gauge = new MetricPoint { Name = "g", Kind = "gauge", Service = "s", TimeMs = 1, Value = 2 };
        var hist = new MetricPoint
        {
            Name = "h", Kind = "histogram", Unit = "s", Service = "s", Temporality = "delta", TimeMs = 2, StartMs = 1,
            Histogram = new MetricHistogram { Count = 1, Sum = 0.5, Min = 0.5, Max = 0.5, Bounds = [1], Counts = [1, 0] },
        };
        Assert.Equal(["name", "kind", "unit", "service", "attributes", "timeMs", "value"], Names(gauge));
        Assert.Equal(["name", "kind", "unit", "service", "temporality", "attributes", "timeMs", "startMs", "histogram"], Names(hist));
        var h = JsonSerializer.SerializeToElement(hist, WizeLensJson.Options).GetProperty("histogram");
        Assert.Equal(["count", "sum", "min", "max", "bounds", "counts"], h.EnumerateObject().Select(p => p.Name));
    }

    private static string[] Names(MetricPoint p) => [.. JsonSerializer.SerializeToElement(p, WizeLensJson.Options).EnumerateObject().Select(o => o.Name)];

    [Fact]
    public void Formats_values_and_estimates_p95()
    {
        string[] shown =
        [
            MetricFormat.Format(0.256, "1"), MetricFormat.Format(1536, "By"), MetricFormat.Format(0.0042, "s"),
            MetricFormat.Format(12, "{request}"), MetricFormat.Format(null, "s"),
        ];
        Assert.Equal(["25.6%", "1.50 KB", "4.20 ms", "12.0 request", "—"], shown);
        var h = new MetricHistogram { Count = 100, Sum = 1200, Max = 30, Bounds = [10, 20], Counts = [50, 40, 10] };
        Assert.Equal(25, MetricSummary.Percentile([h], 0.95)!.Value, 6);
    }
}
