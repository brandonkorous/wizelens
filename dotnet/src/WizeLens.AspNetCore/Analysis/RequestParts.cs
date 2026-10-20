// The parts of a request row the JS side computes: entry span, busy time, shapes, insights, and health.
using System.Text.RegularExpressions;
using WizeLens.Model;
using WizeLens.Search;

namespace WizeLens.Analysis;

internal static partial class RequestParts
{
    [GeneratedRegex(@"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z")]
    private static partial Regex Guid();

    [GeneratedRegex(@"^[0-9]+\z")]
    private static partial Regex Digits();

    /// <summary>Requests at or over this many ms are "warning".</summary>
    public const double SlowMs = 500;

    /// <summary>The first server span whose parent is missing or in the browser; else the first server span.</summary>
    public static Span? EntryServerSpan(IReadOnlyList<Span> spans)
    {
        var byId = new Dictionary<string, Span>(StringComparer.Ordinal);
        foreach (var s in spans) byId[s.SpanId] = s;
        var servers = spans.Where(s => s.Category == SpanCategories.HttpServer).OrderBy(s => s.StartMs).ToList();
        bool IsEntry(Span s) => s.ParentSpanId is not { Length: > 0 } p || !byId.TryGetValue(p, out var parent) || parent.Category == SpanCategories.Browser;
        return servers.FirstOrDefault(IsEntry) ?? servers.FirstOrDefault();
    }

    /// <summary>A 4xx answer: the caller asked for something missing or wrong. It is not a failure, even when the app marks the span as an error.</summary>
    public static bool IsClientErrorStatus(Span s) => AttributeValue.AsDouble(s.Attributes.GetValueOrDefault("http.response.status_code")) is >= 400 and < 500;

    /// <summary>The span's status is error, and it did not answer 4xx.</summary>
    public static bool IsErrorStatus(Span s) => s.Status == SpanStatuses.Error && !IsClientErrorStatus(s);

    public static bool IsErrorSpan(Span s) => !IsClientErrorStatus(s) && (s.Status == SpanStatuses.Error || s.Events.Any(e => e.Name == "exception"));

    /// <summary>pageview, react, error, or fetch for a browser span; null for others.</summary>
    public static string? BrowserTypeOf(Span s)
    {
        if (s.Category != SpanCategories.Browser) return null;
        return Value(s.Attributes, "wizelens.browser.type") is string t and ("pageview" or "react" or "error") ? t : "fetch";
    }

    /// <summary>Wall time the spans cover: spans that run at the same time count once.</summary>
    public static double BusyMs(IEnumerable<Span> spans)
    {
        double total = 0, end = double.NegativeInfinity;
        foreach (var s in spans.OrderBy(s => s.StartMs))
        {
            var stop = s.StartMs + s.DurationMs;
            if (stop <= end) continue;
            total += stop - Math.Max(s.StartMs, end);
            end = stop;
        }
        return total;
    }

    /// <summary>Path with numeric or guid segments and query values replaced by <c>{}</c>.</summary>
    public static string PathShape(string pathAndQuery)
    {
        var q = pathAndQuery.IndexOf('?');
        var path = q >= 0 ? pathAndQuery[..q] : pathAndQuery;
        var query = q >= 0 ? pathAndQuery[(q + 1)..] : "";
        var shaped = string.Join('/', path.Split('/').Select(seg => Digits().IsMatch(seg) || Guid().IsMatch(seg) ? "{}" : seg));
        if (query.Length == 0) return shaped;
        var pairs = query.Split('&').Where(p => p.Length > 0).Select(p => p.IndexOf('=') is var eq && eq >= 0 ? $"{p[..eq]}={{}}" : p);
        return $"{shaped}?{string.Join('&', pairs)}";
    }

    /// <summary><c>METHOD host[:port]/path/shape?q={}</c> for an http.client span.</summary>
    public static string HttpShape(Span s)
    {
        var a = s.Attributes;
        var method = JsText.Of(Value(a, "http.request.method") ?? "GET").ToUpperInvariant();
        if (Value(a, "url.full") is string full && Uri.TryCreate(full, UriKind.Absolute, out var u))
            return $"{method} {u.Authority}{PathShape(u.AbsolutePath + (u.Query == "?" ? "" : u.Query))}";
        var host = Value(a, "server.address");
        var port = Value(a, "server.port");
        var path = JsText.Of(Value(a, "url.path") ?? s.Name);
        var portText = port is null or "" or 0L or 0d or false ? "" : $":{JsText.Of(port)}";
        return $"{method} {(host is null ? "" : JsText.Of(host))}{portText}{PathShape(path)}";
    }

    private static object? Value(IReadOnlyDictionary<string, object?> a, string key) => AttributeValue.Normalize(a.GetValueOrDefault(key));

    private static string QueryText(Span s) => Value(s.Attributes, "db.query.text") is { } q ? JsText.Of(q) : s.Name;

    /// <summary>The number of findings that are hints: N+1 (db and HTTP), duplicates, and slow queries or waits.</summary>
    public static int InsightCount(Trace t, int nPlusOne = 5, double slowQueryMs = 100)
    {
        var db = t.Spans.Where(s => s.Category == SpanCategories.Db).ToList();
        var repeatable = db.Where(s => !TraceAnalysis.IsSessionStatement(s)).ToList();
        var known = repeatable.Where(s => !TraceAnalysis.HasUnknownParams(s));
        var duplicates = known.GroupBy(s => $"{QueryText(s)}\0{(Value(s.Attributes, "wizelens.db.parameters") is { } p ? JsText.Of(p) : "")}").Count(g => g.Count() >= 2);
        var nPlusOneDb = repeatable.GroupBy(QueryText).Count(g => g.Count() >= nPlusOne);
        var nPlusOneHttp = t.Spans.Where(s => s.Category == SpanCategories.HttpClient).GroupBy(HttpShape).Count(g => g.Count() >= nPlusOne);
        return nPlusOneDb + nPlusOneHttp + duplicates + SlowFindings(db.Where(s => s.DurationMs >= slowQueryMs));
    }

    /// <summary>Slow queries; overlapping ones (3 or more, or only session statements) are one "db-wait" finding.</summary>
    private static int SlowFindings(IEnumerable<Span> slow)
    {
        var groups = new List<List<Span>>();
        var end = double.NegativeInfinity;
        foreach (var s in slow.OrderBy(s => s.StartMs))
        {
            if (s.StartMs < end) groups[^1].Add(s);
            else groups.Add([s]);
            end = Math.Max(end, s.StartMs + s.DurationMs);
        }
        return groups.Sum(g => g.Count >= 3 || g.All(TraceAnalysis.IsSessionStatement) ? 1 : g.Count);
    }

    /// <summary>The health color of a request: critical, warning, opportunity, or success.</summary>
    public static string HealthOf(double? status, bool error, double totalMs, int insights)
    {
        var code = status ?? 0;
        if (error || code >= 500) return "critical";
        if (code >= 400 || totalMs >= SlowMs) return "warning";
        return insights > 0 ? "opportunity" : "success";
    }
}
