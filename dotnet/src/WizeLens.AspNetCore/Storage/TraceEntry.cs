using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>One trace in <see cref="TraceStore"/>. Callers lock it while they read or change it.</summary>
internal sealed class TraceEntry(string traceId)
{
    public string TraceId { get; } = traceId;
    public List<Span> Spans { get; } = [];
    public List<LogRecord> Logs { get; } = [];
    public List<string> Remotes { get; } = [];
    public HashSet<string> Sessions { get; } = new(StringComparer.Ordinal);
    public double CreatedMs { get; } = TraceStore.NowMs();
    public double StartMs { get; set; } = double.MaxValue;
    public double UpdatedMs { get; set; } = TraceStore.NowMs();
    public int FlushedSpans { get; set; }
    public int FlushedLogs { get; set; }

    /// <summary>The time used for age limits: first span start, or when the entry was made.</summary>
    public double AgeMs => StartMs == double.MaxValue ? CreatedMs : StartMs;

    public void Touch() => UpdatedMs = TraceStore.NowMs();

    public Trace Build() => TraceBuilder.Build(TraceId, Spans, Logs, Remotes);
}

/// <summary>A trace as read from disk.</summary>
internal sealed record StoredTrace(
    string TraceId, double StartMs, double UpdatedMs, List<string> Remotes, List<Span> Spans, List<LogRecord> Logs);

/// <summary>Changes in one trace since the last flush; Remotes is the full list, FirstLogSeq numbers the first new log.</summary>
internal sealed record TraceChanges(
    string TraceId, double StartMs, double UpdatedMs, List<string> Remotes,
    List<Span> NewSpans, int FirstLogSeq, List<LogRecord> NewLogs);
