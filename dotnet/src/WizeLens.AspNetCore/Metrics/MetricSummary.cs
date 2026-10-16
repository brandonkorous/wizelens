namespace WizeLens.Metrics;

/// <summary>Short summaries of the kept points, for the MCP tools.</summary>
internal static class MetricSummary
{
    /// <summary>One line per metric name: kind, unit, series, and the newest value.</summary>
    public static IEnumerable<object> List(IEnumerable<MetricPoint> points, string? q) =>
        points
            .Where(p => string.IsNullOrEmpty(q) || p.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
            .GroupBy(p => p.Name)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g =>
            {
                var latest = g.MaxBy(p => p.TimeMs)!;
                var series = g.Select(SeriesKey).Distinct().Count();
                return (object)new { name = g.Key, kind = latest.Kind, unit = latest.Unit, latest = MetricFormat.Format(ValueOf(latest), latest.Unit), series };
            });

    /// <summary>Per series of one metric: newest, min, max, and average; histograms add count and p95.</summary>
    public static IEnumerable<object> Detail(IEnumerable<MetricPoint> points, string name) =>
        points.Where(p => p.Name == name).GroupBy(SeriesKey).Select(g => g.First().Kind == MetricPoint.HistogramKind ? HistogramSeries(g) : ValueSeries(g));

    private static object ValueSeries(IGrouping<string, MetricPoint> g)
    {
        var values = g.Select(p => p.Value ?? 0).ToList();
        var first = g.First();
        string F(double v) => MetricFormat.Format(v, first.Unit);
        return new { attributes = first.Attributes, points = values.Count, latest = F(values[^1]), min = F(values.Min()), max = F(values.Max()), avg = F(values.Average()) };
    }

    private static object HistogramSeries(IGrouping<string, MetricPoint> g)
    {
        var first = g.First();
        var hists = g.Select(p => p.Histogram!).ToList();
        var count = hists.Sum(h => h.Count);
        var avg = count > 0 ? hists.Sum(h => h.Sum) / count : (double?)null;
        return new { attributes = first.Attributes, count, avg = MetricFormat.Format(avg, first.Unit), p95 = MetricFormat.Format(Percentile(hists, 0.95), first.Unit) };
    }

    /// <summary>A percentile from summed bucket counts, by straight-line steps inside the bucket.</summary>
    internal static double? Percentile(IReadOnlyList<MetricHistogram> hists, double p)
    {
        var bounds = hists.FirstOrDefault(h => h.Counts.Length > 0)?.Bounds;
        if (bounds is null) return null;
        var counts = new long[bounds.Length + 1];
        foreach (var h in hists.Where(h => h.Counts.Length == counts.Length)) for (var i = 0; i < counts.Length; i++) counts[i] += h.Counts[i];
        var total = counts.Sum();
        if (total == 0) return null;
        var target = p * total;
        double seen = 0;
        for (var i = 0; i < counts.Length; i++)
        {
            if (counts[i] > 0 && seen + counts[i] >= target)
            {
                var lower = i == 0 ? Math.Min(0, bounds.Length > 0 ? bounds[0] : 0) : bounds[i - 1];
                var upper = i < bounds.Length ? bounds[i] : hists.Max(h => h.Max ?? lower);
                return lower + (upper - lower) * ((target - seen) / counts[i]);
            }
            seen += counts[i];
        }
        return null;
    }

    private static double? ValueOf(MetricPoint p) => p.Histogram is { Count: > 0 } h ? h.Sum / h.Count : p.Value;

    private static string SeriesKey(MetricPoint p) =>
        p.Service + "|" + string.Join(",", p.Attributes.OrderBy(a => a.Key, StringComparer.Ordinal).Select(a => a.Key + "=" + a.Value));
}
