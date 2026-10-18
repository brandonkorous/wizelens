// Search documents for each kind: what free words read and which value each field has.
using System.Text.RegularExpressions;
using WizeLens.Analysis;
using WizeLens.Model;

namespace WizeLens.Search;

public static partial class SearchDocs
{
    [GeneratedRegex(@"^[a-z][a-z0-9+.-]*://", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex UrlScheme();

    private static readonly int ErrorRank = SearchFields.LevelRank("error");

    private static List<string> Lower(IEnumerable<object?> parts) =>
        [.. parts.Where(p => p is not null and not "").Select(p => JsText.Of(p).ToLowerInvariant())];

    private static string? Str(IReadOnlyDictionary<string, object?> a, string key) =>
        a.TryGetValue(key, out var v) && AttributeValue.Normalize(v) is { } value ? JsText.Of(value) : null;

    private static double? Num(object? v) => SearchMatch.NumberOf(v);

    /// <summary>Error text of a span: its status message and exception messages.</summary>
    private static IEnumerable<string?> ErrorTexts(Span s) =>
        [s.StatusMessage, .. s.Events.Where(e => e.Name == "exception").Select(e => Str(e.Attributes, "exception.message"))];

    /// <summary>The path part of a path or a full URL, without the query.</summary>
    internal static string? PathOnly(string? u)
    {
        if (string.IsNullOrEmpty(u) || !UrlScheme().IsMatch(u)) return u?.Split('?')[0];
        return Uri.TryCreate(u, UriKind.Absolute, out var uri) ? uri.AbsolutePath : u.Split('?')[0];
    }

    /// <summary>The service name the dashboard shows: "browser" is the Web App.</summary>
    internal static string DisplayService(string service) => service == "browser" ? "Web App" : service;

    public static SearchDoc SpanDoc(Span s, string? env = null)
    {
        var a = s.Attributes;
        var url = Str(a, "url.path") ?? Str(a, "url.full");
        return new SearchDoc(SearchKinds.Spans, Lower([s.Name, url, Str(a, "db.query.text"), .. ErrorTexts(s)]), new Dictionary<string, object?>
        {
            ["service"] = s.Service, ["env"] = env, ["trace"] = s.TraceId, ["span"] = s.SpanId, ["name"] = s.Name,
            ["method"] = Str(a, "http.request.method"), ["path"] = PathOnly(url), ["route"] = Str(a, "http.route"),
            ["status"] = Num(a.GetValueOrDefault("http.response.status_code")), ["outcome"] = s.Status, ["duration"] = s.DurationMs,
            ["category"] = s.Category, ["kind"] = s.Kind, ["user"] = Str(a, "enduser.id"), ["error"] = s.Status == SpanStatuses.Error,
        }, [a]);
    }

    /// <summary>A log line of <paramref name="trace"/>; its name is the trace's root span name.</summary>
    public static SearchDoc LogDoc(Trace trace, LogRecord l, string? env = null) =>
        LogDoc(SearchItems.LogItemOf(trace, l, trace.Logs.IndexOf(l)), env);

    public static SearchDoc LogDoc(LogItem l, string? env = null) =>
        new(SearchKinds.Logs, Lower([l.Message, l.Category, l.TraceName]), new Dictionary<string, object?>
        {
            ["service"] = l.Service == DisplayService("browser") ? new[] { l.Service, "browser" } : (object)l.Service, ["env"] = env, ["trace"] = l.TraceId, ["span"] = l.SpanId, ["name"] = l.TraceName,
            ["level"] = l.Level, ["category"] = l.Category, ["message"] = l.Message, ["error"] = SearchFields.LevelRank(l.Level) >= ErrorRank,
        }, [l.Attributes]);

    /// <summary>The error texts of every span in a trace, for the free text of a trace or its request.</summary>
    public static List<string?> TraceErrorTexts(Trace t) => [.. t.Spans.SelectMany(ErrorTexts)];

    public static SearchDoc TraceDoc(Trace t, string? env = null)
    {
        var errors = TraceErrorTexts(t);
        return new SearchDoc(SearchKinds.Traces, Lower([t.RootName, t.RootUrl, .. t.Services, .. errors]), new Dictionary<string, object?>
        {
            ["service"] = t.Services.Count > 0 ? t.Services.ToArray() : new[] { t.Service }, ["env"] = env, ["trace"] = t.TraceId,
            ["name"] = t.RootName, ["method"] = t.RootMethod, ["path"] = PathOnly(t.RootUrl), ["status"] = t.RootStatusCode,
            ["outcome"] = t.Status, ["duration"] = t.DurationMs, ["error"] = t.Status == SpanStatuses.Error || t.ErrorCount > 0,
        }, [.. t.Spans.Select(s => s.Attributes)]);
    }

    /// <summary>A request row; pass its trace's span attributes and error texts when the host has them. Path drops the query.</summary>
    public static SearchDoc RequestDoc(RequestItem r, IReadOnlyList<IReadOnlyDictionary<string, object?>>? attrs = null, string? env = null, IEnumerable<string?>? errors = null)
    {
        var failed = r.Errors > 0 || (r.Status ?? 0) >= 500;
        var route = r.Endpoint[(r.Endpoint.IndexOf(' ') + 1)..];
        return new SearchDoc(SearchKinds.Requests, Lower([r.Path, r.Endpoint, r.User, r.RequestId, r.ClientAddress, .. r.Tags, .. errors ?? []]), new Dictionary<string, object?>
        {
            ["service"] = new[] { r.Service }.Concat(r.Services).ToArray(), ["env"] = env, ["trace"] = r.TraceId, ["method"] = r.Method,
            ["path"] = PathOnly(r.Path), ["route"] = route, ["status"] = r.Status, ["outcome"] = failed ? "error" : "ok",
            ["duration"] = r.DurationMs, ["user"] = r.User, ["error"] = failed,
        }, attrs ?? []);
    }
}
