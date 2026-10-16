namespace WizeLens.Metrics;

/// <summary>Metric points of this app in memory, oldest first; bounded by age and count.</summary>
internal sealed class MetricStore(TimeSpan maxAge, int maxPoints)
{
    public const int DefaultMaxPoints = 50_000;

    private readonly LinkedList<MetricPoint> _points = new();
    private readonly object _lock = new();

    /// <summary>Raised for every new point, for the hub sender.</summary>
    internal event Action<MetricPoint>? Changed;

    public int Count
    {
        get
        {
            lock (_lock) return _points.Count;
        }
    }

    public void Add(IReadOnlyList<MetricPoint> points, double nowMs)
    {
        if (points.Count == 0) return;
        lock (_lock)
        {
            foreach (var p in points) _points.AddLast(p);
            Prune(nowMs);
        }
        foreach (var p in points) Changed?.Invoke(p);
    }

    /// <summary>Points at or after <paramref name="sinceMs"/>, oldest first, at most <paramref name="limit"/> (the newest win).</summary>
    public List<MetricPoint> Since(double? sinceMs, int limit = DefaultMaxPoints)
    {
        lock (_lock)
        {
            var list = _points.Where(p => sinceMs is null || p.TimeMs >= sinceMs).ToList();
            return list.Count > limit ? list.GetRange(list.Count - limit, limit) : list;
        }
    }

    private void Prune(double nowMs)
    {
        var cutoff = nowMs - maxAge.TotalMilliseconds;
        while (_points.First is { } first && (first.Value.TimeMs < cutoff || _points.Count > maxPoints)) _points.RemoveFirst();
    }
}
