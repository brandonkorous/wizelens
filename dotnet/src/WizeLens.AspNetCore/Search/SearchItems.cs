// What a search returns per kind, and the documents of one trace, so every host searches the same things.
using WizeLens.Analysis;
using WizeLens.Model;

namespace WizeLens.Search;

/// <summary>A span as a search result.</summary>
public sealed record SpanItem(
    string TraceId, string SpanId, double StartMs, double DurationMs, string Service, string Name, string Kind, string Category,
    string Status, string? Method, string? Path, string? Route, double? HttpStatus, string? User);

/// <summary>A log line as a search result, with the trace it was written in; Key is <c>traceId:index</c>.</summary>
public sealed record LogItem(
    string Key, string TraceId, string TraceName, string? SpanId, double TimeMs, string Level, string Service, string Category,
    string Message, Dictionary<string, object?> Attributes);

/// <summary>One document of a trace: when it happened, which part it is (span id, log index, or ""), and the result row.</summary>
public sealed record DocEntry(string Kind, double TimeMs, string Owner, SearchDoc Doc, Func<object> Item);

public static class SearchItems
{
    private static string? TextOf(object? v) => v as string;

    public static SpanItem SpanItemOf(SearchDoc doc, double startMs)
    {
        var f = doc.Fields;
        object? F(string key) => f.GetValueOrDefault(key);
        return new SpanItem(
            JsText.Of(F("trace")), JsText.Of(F("span")), startMs, JsText.ToNumber(F("duration")), JsText.Of(F("service")), JsText.Of(F("name")),
            F("kind") as string ?? "", F("category") as string ?? "", F("outcome") as string ?? "", TextOf(F("method")), TextOf(F("path")),
            TextOf(F("route")), JsText.IsNumber(F("status"), out var status) ? status : null, TextOf(F("user")));
    }

    /// <summary>The log index from a <c>traceId:index</c> key, as text.</summary>
    public static string LogOwner(LogItem row) => row.Key[(row.Key.LastIndexOf(':') + 1)..];

    /// <summary>The log lines of one trace as result rows, keyed by their index in the trace.</summary>
    public static List<LogItem> LogItemsOf(Trace t) => [.. t.Logs.Select((l, i) => LogItemOf(t, l, i)).OrderByDescending(r => r.TimeMs)];

    /// <summary>Log line <paramref name="i"/> of a trace as a result row.</summary>
    public static LogItem LogItemOf(Trace t, LogRecord l, int i) => new(
        $"{t.TraceId}:{i}", t.TraceId, t.RootName, l.SpanId, l.TimeMs, l.Level, SearchDocs.DisplayService(l.Service), l.Category, l.Message, l.Attributes);

    private static List<DocEntry> RequestEntries(Trace t, string? env)
    {
        if (RequestItems.Of(t) is not { } item) return [];
        var doc = SearchDocs.RequestDoc(item, [.. t.Spans.Select(s => s.Attributes)], env, SearchDocs.TraceErrorTexts(t));
        return [new DocEntry(SearchKinds.Requests, item.StartMs, "", doc, () => item)];
    }

    /// <summary>The documents of <paramref name="kind"/> in one trace.</summary>
    public static List<DocEntry> DocEntries(Trace t, string kind, string? env = null)
    {
        if (kind != SearchKinds.Logs && Storage.TraceIds.IsLoose(t.TraceId)) return [];
        if (kind == SearchKinds.Requests) return RequestEntries(t, env);
        if (kind == SearchKinds.Traces) return [new DocEntry(kind, t.StartMs, "", SearchDocs.TraceDoc(t, env), t.ToSummary)];
        if (kind == SearchKinds.Logs)
            return [.. LogItemsOf(t).Select(row => new DocEntry(kind, row.TimeMs, LogOwner(row), SearchDocs.LogDoc(row, env), () => row))];
        return [.. t.Spans.Select(s =>
        {
            var doc = SearchDocs.SpanDoc(s, env);
            return new DocEntry(kind, s.StartMs, s.SpanId, doc, () => SpanItemOf(doc, s.StartMs));
        })];
    }
}
