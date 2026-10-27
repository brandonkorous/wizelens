using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Analysis;

public sealed record DuplicateQuery(string TraceId, string Query, string Parameters, int Count, double TotalMs, string Service);

public sealed record NPlusOne(string TraceId, string Kind, string Shape, int Count, double TotalMs);

public sealed record SlowQuery(string TraceId, string SpanId, double DurationMs, string Query, string Service);

public sealed record ErrorInfo(string TraceId, string SpanId, string Service, string Name, string? Message, string? Type, string? Stack);

/// <summary>Analysis rules from docs/CONTRACT.md. The JS side implements the same rules.</summary>
public static partial class TraceAnalysis
{
    /// <summary>≥ 2 db spans with identical query text AND identical parameters.</summary>
    public static IReadOnlyList<DuplicateQuery> DuplicateQueries(Trace trace) =>
    [
        .. trace.Spans
            .Where(IsRepeatable)
            .Where(s => !HasUnknownParams(s))
            .GroupBy(s => (Query: s.Attr("db.query.text")!, Params: ParamsOf(s) ?? ""))
            .Where(g => g.Count() >= 2)
            .Select(g => new DuplicateQuery(trace.TraceId, g.Key.Query, g.Key.Params, g.Count(), g.Sum(s => s.DurationMs), g.First().Service))
            .OrderByDescending(d => d.Count),
    ];

    /// <summary>N+1 db (same query text) and N+1 HTTP (same method + host + path shape), ≥ threshold repeats.</summary>
    public static IReadOnlyList<NPlusOne> NPlusOnes(Trace trace, int threshold = 5)
    {
        var db = trace.Spans
            .Where(IsRepeatable)
            .GroupBy(s => s.Attr("db.query.text")!)
            .Where(g => g.Count() >= threshold)
            .Select(g => new NPlusOne(trace.TraceId, "db", g.Key, g.Count(), g.Sum(s => s.DurationMs)));

        var http = trace.Spans
            .Where(s => s.Category == SpanCategories.HttpClient)
            .Select(s => (Span: s, Shape: HttpShape(s)))
            .Where(x => x.Shape is not null)
            .GroupBy(x => x.Shape!)
            .Where(g => g.Count() >= threshold)
            .Select(g => new NPlusOne(trace.TraceId, "http", g.Key, g.Count(), g.Sum(x => x.Span.DurationMs)));

        return [.. db.Concat(http).OrderByDescending(n => n.Count)];
    }

    /// <summary>A db span with query text that is not a session statement.</summary>
    private static bool IsRepeatable(Span s) =>
        s.Category == SpanCategories.Db && s.Attr("db.query.text") is not null && !IsSessionStatement(s);

    /// <summary>SET, BEGIN, COMMIT and the like: their repeats are by design, not N+1.</summary>
    public static bool IsSessionStatement(string query) => SessionRegex().IsMatch(query);

    /// <summary>SQL session statements, Redis connection and transaction commands, MongoDB cursor and session commands.</summary>
    public static bool IsSessionStatement(Span s) => s.Attr("db.system.name") switch
    {
        "redis" => RedisSessionCommands.Contains(s.Attr("db.operation.name") ?? ""),
        "mongodb" => MongoSessionCommands.Contains(s.Attr("db.operation.name") ?? ""),
        "elasticsearch" => false,
        _ => IsSessionStatement(s.Attr("db.query.text") ?? s.Name),
    };

    /// <summary>Placeholders but no captured parameters (OTLP agents): two such queries may differ, so they are never duplicates.</summary>
    public static bool HasUnknownParams(string query, object? parameters) => parameters is null && PlaceholderRegex().IsMatch(query);

    /// <summary>The captured parameters, or null when a value is redacted: hidden values never count as the same parameters.</summary>
    public static string? ParamsOf(Span s) =>
        s.Attr("wizelens.db.parameters") is { } p && !p.Contains("[redacted", StringComparison.Ordinal) ? p : null;

    /// <summary>As above; Redis, MongoDB, and Elasticsearch text never has values, so without parameters it is always unknown.</summary>
    public static bool HasUnknownParams(Span s)
    {
        var parameters = ParamsOf(s);
        return HasUnknownParams(s.Attr("db.query.text") ?? s.Name, parameters)
            || parameters is null && s.Attr("db.system.name") is "redis" or "mongodb" or "elasticsearch";
    }

    private static readonly HashSet<string> RedisSessionCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "MULTI", "EXEC", "DISCARD", "WATCH", "UNWATCH", "SELECT", "AUTH", "PING", "ECHO", "HELLO", "CLIENT", "QUIT", "RESET",
        "READONLY", "READWRITE", "ASKING",
    };

    private static readonly HashSet<string> MongoSessionCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "getMore", "killCursors", "endSessions", "commitTransaction", "abortTransaction",
    };

    /// <summary>db spans at or above <paramref name="thresholdMs"/>.</summary>
    public static IEnumerable<SlowQuery> SlowQueries(Trace trace, double thresholdMs = 100) =>
        trace.Spans
            .Where(s => s.Category == SpanCategories.Db && s.DurationMs >= thresholdMs)
            .Select(s => new SlowQuery(trace.TraceId, s.SpanId, s.DurationMs, s.Attr("db.query.text") ?? s.Name, s.Service));

    /// <summary>Spans with an error status, leaving out 4xx answers.</summary>
    public static IEnumerable<ErrorInfo> Errors(Trace trace) =>
        trace.Spans
            .Where(RequestParts.IsErrorStatus)
            .Select(s =>
            {
                var ex = s.Events.FirstOrDefault(e => e.Name == "exception");
                string? A(string key) => ex is null ? null : AttributeValue.AsString(ex.Attributes.GetValueOrDefault(key));
                return new ErrorInfo(trace.TraceId, s.SpanId, s.Service, s.Name,
                    A("exception.message") ?? s.StatusMessage, A("exception.type") ?? s.Attr("error.type"), A("exception.stacktrace"));
            });

    /// <summary>"GET localhost:5200/orders?customerId={}" — numeric/guid segments and query values become <c>{}</c>.</summary>
    public static string? HttpShape(Span span)
    {
        if (!Uri.TryCreate(span.Attr("url.full"), UriKind.Absolute, out var uri)) return null;
        var method = span.Attr("http.request.method") ?? "GET";
        return $"{method} {uri.Authority}{PathShape(uri.AbsolutePath, uri.Query)}";
    }

    public static string PathShape(string path, string query = "")
    {
        var segments = path.Split('/').Select(seg => IdSegmentRegex().IsMatch(seg) ? "{}" : seg);
        var shaped = string.Join('/', segments);
        if (!string.IsNullOrEmpty(query) && query != "?")
        {
            var keys = query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
                .Select(pair => pair.Split('=')[0] + "={}");
            shaped += "?" + string.Join('&', keys);
        }
        return shaped;
    }

    [GeneratedRegex(@"^(\d+|[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})$")]
    private static partial Regex IdSegmentRegex();

    [GeneratedRegex(@"^\s*(SET|RESET|BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|DISCARD|USE)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SessionRegex();

    [GeneratedRegex(@"\?|\$\d+|%s|%\(\w+\)s|(?<![:\w]):[A-Za-z_]\w*|@[A-Za-z_]\w*")]
    private static partial Regex PlaceholderRegex();
}
