using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>The sampling gate in front of the store: spans, logs, and remotes pass only when their trace is kept.</summary>
internal sealed partial class TraceStore
{
    internal TraceStore(int maxTraces, WizeLensSampling sampling)
        : this(maxTraces) => Sampler = sampling.IsOn ? new TraceSampler(sampling) : null;

    /// <summary>Decides which traces are kept. Null: all.</summary>
    internal TraceSampler? Sampler { get; }

    /// <summary>Adds a span to its trace, through the sampler when one is set; <paramref name="root"/> defaults to "it has no parent".</summary>
    public void AddSpan(Span span, bool? root = null)
    {
        if (Gate(span.TraceId, Sampler?.Span(span, root ?? span.ParentSpanId is null))) PutSpan(span);
    }

    public void AddLog(string traceId, LogRecord log)
    {
        if (Gate(traceId, Sampler?.Log(traceId, log))) PutLog(traceId, log);
    }

    // True when sampling keeps the item; first stores what the trace held back.
    private bool Gate(string traceId, SampleVerdict? verdict)
    {
        if (verdict is not { } v) return true;
        if (v.Held is { } held)
        {
            foreach (var s in held.Spans) PutSpan(s);
            foreach (var l in held.Logs) PutLog(traceId, l);
            foreach (var r in held.Remotes) PutRemote(traceId, r);
        }
        return v.Keep;
    }
}
