// The known fields of the search language: short names that map to columns.
namespace WizeLens.Search;

/// <summary>How a known field reads its value.</summary>
internal enum FieldType { Text, Id, Status, Duration, Level, Bool }

/// <summary>One known field: its type, one line of help, and the kinds that have it.</summary>
internal sealed record FieldSpec(FieldType Type, string Help, IReadOnlyList<string> Kinds);

internal static class SearchFields
{
    private static readonly IReadOnlyList<string> AllKinds = SearchKinds.All;
    private static readonly string[] NotLogs = [SearchKinds.Requests, SearchKinds.Traces, SearchKinds.Spans];

    /// <summary>Short names that map to columns. Anything else is an attribute: <c>@key:value</c>.</summary>
    public static readonly IReadOnlyDictionary<string, FieldSpec> All = new Dictionary<string, FieldSpec>(StringComparer.Ordinal)
    {
        ["service"] = new(FieldType.Text, "Service name", AllKinds),
        ["env"] = new(FieldType.Text, "Environment", AllKinds),
        ["trace"] = new(FieldType.Id, "Trace id, or its start", AllKinds),
        ["span"] = new(FieldType.Id, "Span id, or its start", [SearchKinds.Spans, SearchKinds.Logs]),
        ["name"] = new(FieldType.Text, "Span name, or the trace's root span name", [SearchKinds.Traces, SearchKinds.Spans, SearchKinds.Logs]),
        ["method"] = new(FieldType.Text, "HTTP method", NotLogs),
        ["path"] = new(FieldType.Text, "URL path", NotLogs),
        ["route"] = new(FieldType.Text, "Route template, such as /orders/{id}", [SearchKinds.Requests, SearchKinds.Spans]),
        ["status"] = new(FieldType.Status, "HTTP status (500, 5xx) or span status (ok, error, unset)", NotLogs),
        ["duration"] = new(FieldType.Duration, "Duration: 250ms, 1.5s, 2m", NotLogs),
        ["level"] = new(FieldType.Level, "Log level: trace, debug, info, warn, error, critical", [SearchKinds.Logs]),
        ["category"] = new(FieldType.Text, "Log category, or span category (db, http.client, ...)", [SearchKinds.Spans, SearchKinds.Logs]),
        ["kind"] = new(FieldType.Text, "Span kind: server, client, internal, producer, consumer", [SearchKinds.Spans]),
        ["user"] = new(FieldType.Text, "End user id", [SearchKinds.Requests, SearchKinds.Spans]),
        ["error"] = new(FieldType.Bool, "true when it failed", AllKinds),
        ["message"] = new(FieldType.Text, "Log message", [SearchKinds.Logs]),
        ["tag"] = new(FieldType.Text, "Tag: a tag rule's name, or a tag the app sets", AllKinds),
    };

    public static bool IsField(string name) => All.ContainsKey(name);

    /// <summary>Log levels, lowest first.</summary>
    public static IReadOnlyList<string> LogLevels => Levels;

    private static readonly string[] Levels = ["trace", "debug", "info", "warn", "error", "critical"];

    /// <summary>The rank of a log level, or -1 when it is not one (case-sensitive).</summary>
    public static int LevelRank(string level) => Array.IndexOf(Levels, level);
}
