using WizeLens.Model;

namespace WizeLens;

/// <summary>One change for the hub: a span, a log, or a remote of one trace.</summary>
internal sealed record HubItem(string TraceId, Span? Span, LogRecord? Log, string? Remote);
