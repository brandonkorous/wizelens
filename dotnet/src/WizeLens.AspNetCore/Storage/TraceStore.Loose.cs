using System.Collections.Concurrent;
using System.Security.Cryptography;
using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>Trace ids of loose batches: the log lines one service wrote outside a request.</summary>
public static class TraceIds
{
    /// <summary>Every loose batch id starts with 16 zeros; random trace ids almost never do.</summary>
    public const string LoosePrefix = "0000000000000000";

    /// <summary>True for the id of a loose batch.</summary>
    public static bool IsLoose(string traceId) => traceId.StartsWith(LoosePrefix, StringComparison.Ordinal);

    /// <summary>A new loose batch id: the prefix and 16 random hex digits.</summary>
    internal static string NewLoose() => LoosePrefix + Hex.Lower(RandomNumberGenerator.GetBytes(8));
}

/// <summary>Loose batches: lines outside a request, grouped per 5 minutes, with their own cap so they never push out requests.</summary>
public sealed partial class TraceStore
{
    /// <summary>A loose batch holds the lines of one 5-minute window.</summary>
    public const double LooseWindowMs = 300_000;

    /// <summary>Most lines in one loose batch; a full batch starts the next one.</summary>
    public const int LooseMaxLogs = 1000;

    private readonly ConcurrentQueue<string> _looseOrder = new();
    private readonly object _looseLock = new();
    private int _looseCount;
    private string? _looseId;
    private double _looseWindow;
    private int _looseLogs;

    /// <summary>Most loose batches kept: a quarter of the trace limit, at least 10.</summary>
    internal int MaxLooseBatches => Math.Max(10, _maxTraces / 4);

    /// <summary>Stores a line written outside a request in the current loose batch; trace sampling does not apply.</summary>
    public void AddLooseLog(LogRecord log) => PutLog(LooseBatchFor(log.TimeMs), log);

    private string LooseBatchFor(double timeMs)
    {
        lock (_looseLock)
        {
            var window = Math.Floor(timeMs / LooseWindowMs);
            if (_looseId is null || window != _looseWindow || _looseLogs >= LooseMaxLogs)
            {
                _looseId = TraceIds.NewLoose();
                _looseWindow = window;
                _looseLogs = 0;
            }
            _looseLogs++;
            return _looseId;
        }
    }

    // Under _evictLock: queue a new id in its own order, then drop the oldest past each cap.
    private void Track(string traceId)
    {
        if (TraceIds.IsLoose(traceId))
        {
            _looseOrder.Enqueue(traceId);
            _looseCount++;
        }
        else
        {
            _order.Enqueue(traceId);
        }
        while (_looseCount > MaxLooseBatches && _looseOrder.TryDequeue(out var batch)) Remove(batch);
        while (_traces.Count - _looseCount > _maxTraces && _order.TryDequeue(out var oldest)) Remove(oldest);
    }

    // Under _evictLock: forget one trace; true when it was there.
    private bool Remove(string traceId)
    {
        if (!_traces.TryRemove(traceId, out _)) return false;
        _dirty.TryRemove(traceId, out _);
        if (TraceIds.IsLoose(traceId)) _looseCount--;
        return true;
    }

    // Under _evictLock: rebuild both eviction orders so they do not keep ids that are gone.
    private void RebuildOrder()
    {
        _order.Clear();
        _looseOrder.Clear();
        foreach (var id in _traces.OrderBy(kv => kv.Value.AgeMs).Select(kv => kv.Key)) (TraceIds.IsLoose(id) ? _looseOrder : _order).Enqueue(id);
    }
}
