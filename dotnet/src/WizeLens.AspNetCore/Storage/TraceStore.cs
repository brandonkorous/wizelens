using System.Collections.Concurrent;
using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>Thread-safe in-memory trace store (the read path); drops the oldest first and tracks changes for SQLite.</summary>
public sealed class TraceStore
{
    public const string SessionAttribute = "wizelens.browser.session";

    private readonly ConcurrentDictionary<string, TraceEntry> _traces = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentQueue<string> _order = new();
    private readonly ConcurrentDictionary<string, byte> _selfEndpoints = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _dirty = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _evictLock = new();
    private readonly int _maxTraces;

    public TraceStore(int maxTraces) => _maxTraces = Math.Max(1, maxTraces);

    public int Count => _traces.Count;

    public void AddSpan(Span span)
    {
        var entry = GetOrCreate(span.TraceId);
        lock (entry)
        {
            entry.Spans.Add(span);
            entry.StartMs = Math.Min(entry.StartMs, span.StartMs);
            if (span.Attr(SessionAttribute) is { Length: > 0 } session) entry.Sessions.Add(session);
            entry.Touch();
        }
        _dirty.TryAdd(entry.TraceId, 0);
    }

    public void AddLog(string traceId, LogRecord log)
    {
        var entry = GetOrCreate(traceId);
        lock (entry)
        {
            entry.Logs.Add(log);
            entry.Touch();
        }
        _dirty.TryAdd(entry.TraceId, 0);
    }

    /// <summary>Records that another service has data for this trace at <paramref name="endpoint"/>.</summary>
    public void AddRemote(string traceId, string endpoint)
    {
        endpoint = endpoint.TrimEnd('/');
        if (_selfEndpoints.ContainsKey(endpoint)) return;
        var entry = GetOrCreate(traceId);
        lock (entry)
        {
            if (entry.Remotes.Contains(endpoint, StringComparer.OrdinalIgnoreCase)) return;
            entry.Remotes.Add(endpoint);
            entry.Touch();
        }
        _dirty.TryAdd(entry.TraceId, 0);
    }

    /// <summary>Remembers this app's own endpoint URLs so they are never listed as remotes.</summary>
    public void AddSelfEndpoint(string endpoint) => _selfEndpoints.TryAdd(endpoint.TrimEnd('/'), 0);

    public bool IsSelfEndpoint(string endpoint) => _selfEndpoints.ContainsKey(endpoint.TrimEnd('/'));

    public Trace? Get(string traceId)
    {
        if (!_traces.TryGetValue(traceId, out var entry)) return null;
        lock (entry) return entry.Build();
    }

    /// <summary>All traces that have at least one span, newest first.</summary>
    public IReadOnlyList<Trace> All() => Newest(int.MaxValue, session: null);

    /// <summary>Newest traces first. With <paramref name="session"/>, only traces with a browser span from that tab.</summary>
    public IReadOnlyList<TraceSummary> Summaries(int limit, string? session = null) =>
        [.. Newest(Math.Max(0, limit), session).Select(t => t.ToSummary())];

    /// <summary>Newest full traces first. With <paramref name="sinceMs"/>, only traces active at or after that time.</summary>
    public IReadOnlyList<Trace> Recent(int limit, double? sinceMs = null)
    {
        var traces = Newest(int.MaxValue, session: null);
        var picked = sinceMs is { } since ? traces.Where(t => t.StartMs + t.DurationMs >= since) : traces;
        return [.. picked.Take(Math.Max(0, limit))];
    }

    /// <summary>Drops traces that started before <paramref name="cutoffMs"/> (Unix ms).</summary>
    public int PruneOlderThan(double cutoffMs)
    {
        var removed = 0;
        lock (_evictLock)
        {
            foreach (var (id, entry) in _traces)
            {
                double age;
                lock (entry) age = entry.AgeMs;
                if (age < cutoffMs && _traces.TryRemove(id, out _))
                {
                    _dirty.TryRemove(id, out _);
                    removed++;
                }
            }

            if (removed > 0)
            {
                // Rebuild the eviction order so it does not keep ids that are gone.
                _order.Clear();
                foreach (var id in _traces.OrderBy(kv => kv.Value.AgeMs).Select(kv => kv.Key)) _order.Enqueue(id);
            }
        }
        return removed;
    }

    public void Clear()
    {
        lock (_evictLock)
        {
            _traces.Clear();
            _order.Clear();
            _dirty.Clear();
        }
    }

    /// <summary>Puts a trace read from disk back into memory. It is not marked as changed.</summary>
    internal void Hydrate(StoredTrace stored)
    {
        var entry = GetOrCreate(stored.TraceId);
        lock (entry)
        {
            var known = entry.Spans.Select(s => s.SpanId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var newSpans = stored.Spans.Where(s => known.Add(s.SpanId)).ToList();
            entry.Spans.InsertRange(0, newSpans);
            entry.Logs.InsertRange(0, stored.Logs);
            foreach (var remote in stored.Remotes)
            {
                if (!entry.Remotes.Contains(remote, StringComparer.OrdinalIgnoreCase)) entry.Remotes.Add(remote);
            }

            foreach (var span in newSpans)
            {
                entry.StartMs = Math.Min(entry.StartMs, span.StartMs);
                if (span.Attr(SessionAttribute) is { Length: > 0 } session) entry.Sessions.Add(session);
            }
            if (entry.Spans.Count == 0) entry.StartMs = Math.Min(entry.StartMs, stored.StartMs);
            entry.UpdatedMs = Math.Max(entry.UpdatedMs, stored.UpdatedMs);

            // Everything that came from disk is already flushed. Spans that arrived first stay dirty.
            entry.FlushedSpans += newSpans.Count;
            entry.FlushedLogs += stored.Logs.Count;
        }
    }

    /// <summary>Takes the changes since the last call, for writing to disk.</summary>
    internal List<TraceChanges> DrainChanges()
    {
        var result = new List<TraceChanges>();
        foreach (var id in _dirty.Keys)
        {
            _dirty.TryRemove(id, out _);
            if (!_traces.TryGetValue(id, out var entry)) continue;
            lock (entry)
            {
                var changes = new TraceChanges(
                    entry.TraceId,
                    entry.AgeMs,
                    entry.UpdatedMs,
                    [.. entry.Remotes],
                    entry.Spans.GetRange(entry.FlushedSpans, entry.Spans.Count - entry.FlushedSpans),
                    entry.FlushedLogs,
                    entry.Logs.GetRange(entry.FlushedLogs, entry.Logs.Count - entry.FlushedLogs));
                entry.FlushedSpans = entry.Spans.Count;
                entry.FlushedLogs = entry.Logs.Count;
                result.Add(changes);
            }
        }
        return result;
    }

    private List<Trace> Newest(int limit, string? session)
    {
        var picked = new List<TraceEntry>();
        foreach (var entry in _traces.Values)
        {
            lock (entry)
            {
                if (entry.Spans.Count == 0) continue;
                if (session is not null && !entry.Sessions.Contains(session)) continue;
                picked.Add(entry);
            }
        }

        var result = new List<Trace>();
        foreach (var entry in picked.OrderByDescending(e => e.StartMs).Take(limit))
        {
            lock (entry) result.Add(entry.Build());
        }
        return result;
    }

    private TraceEntry GetOrCreate(string traceId)
    {
        if (_traces.TryGetValue(traceId, out var existing)) return existing;
        lock (_evictLock)
        {
            if (_traces.TryGetValue(traceId, out existing)) return existing;
            var entry = new TraceEntry(traceId.ToLowerInvariant());
            _traces[traceId] = entry;
            _order.Enqueue(traceId);
            while (_traces.Count > _maxTraces && _order.TryDequeue(out var oldest))
            {
                if (_traces.TryRemove(oldest, out _)) _dirty.TryRemove(oldest, out _);
            }
            return entry;
        }
    }

    internal static double NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
