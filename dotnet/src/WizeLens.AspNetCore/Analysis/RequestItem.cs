// One request (a trace with a server span or a browser fetch), shaped like the JS RequestItem for the shared UI.
using WizeLens.Model;
using WizeLens.Search;

namespace WizeLens.Analysis;

/// <summary>A request row without its findings. Path keeps the query; endpoint is "METHOD route".</summary>
public sealed record RequestItem(
    string TraceId, double StartMs, string Method, string Path, string Endpoint, double? Status, bool Expected, bool Aborted,
    double DurationMs, double? ServerMs, double DbMs, int DbCount, int FetchCount, double FetchMs, double? RenderMs, double? NetworkMs,
    string Service, List<string> Services, int Errors, int Insights, string Health,
    string? UserAgent, string? ClientAddress, string? User, string? RequestId, List<string> Tags);

public static class RequestItems
{
    private const string TagPrefix = "wizelens.tag.";

    private static string? Str(Span? s, string key) =>
        s is not null && AttributeValue.Normalize(s.Attributes.GetValueOrDefault(key)) is { } v and not "" ? JsText.Of(v) : null;

    /// <summary>Tags as "key" or "key:value".</summary>
    private static List<string> TagsOf(Span? s) => s is null ? [] :
    [
        .. s.Attributes.Where(kv => kv.Key.StartsWith(TagPrefix, StringComparison.Ordinal)).Select(kv =>
            AttributeValue.Normalize(kv.Value) is null or "" or true ? kv.Key[TagPrefix.Length..] : $"{kv.Key[TagPrefix.Length..]}:{JsText.Of(kv.Value)}"),
    ];

    private static string PathOf(Span? server, Span? fetch)
    {
        if (Str(server, "url.path") is { } path) return Str(server, "url.query") is { } query ? $"{path}?{query}" : path;
        if (Str(fetch, "url.full") is not { } full) return server?.Name ?? fetch?.Name ?? "/";
        return Uri.TryCreate(full, UriKind.Absolute, out var u) ? u.AbsolutePath + (u.Query == "?" ? "" : u.Query) : full;
    }

    /// <summary>Method, path, and endpoint of a request. gRPC calls read "gRPC" and "/{service}/{method}".</summary>
    private static (string Method, string Path, string Endpoint) IdentityOf(Span? server, Span? fetch)
    {
        if (Str(server, "rpc.system") is not null)
        {
            var rpc = $"{Str(server, "rpc.service") ?? "service"}/{Str(server, "rpc.method") ?? "method"}";
            return ("gRPC", $"/{rpc}", $"gRPC {rpc}");
        }
        var method = (Str(server, "http.request.method") ?? Str(fetch, "http.request.method") ?? "GET").ToUpperInvariant();
        var path = PathOf(server, fetch);
        return (method, path, $"{method} {Str(server, "http.route") ?? RequestParts.PathShape(path)}");
    }

    private static double? StatusOf(Span? server, Span? fetch)
    {
        var raw = AttributeValue.Normalize(server?.Attributes.GetValueOrDefault("http.response.status_code") ?? fetch?.Attributes.GetValueOrDefault("http.response.status_code"));
        if (raw is null) return null;
        if (JsText.IsNumber(raw, out var n)) return n;
        var parsed = JsText.ToNumber(raw);
        return double.IsNaN(parsed) || parsed == 0 ? null : parsed;
    }

    private static bool Num(Span? span, string key, out double value)
    {
        var ok = JsText.IsNumber(AttributeValue.Normalize(span?.Attributes.GetValueOrDefault(key)), out value) && double.IsFinite(value);
        value = Math.Max(0, value);
        return ok;
    }

    // A full page load (a server page, not a fetch): first paint from navigation start, and render from the first byte, as the HUD counts them.
    private static (double PaintMs, double RenderMs)? PageLoadOf(Trace t)
    {
        var view = t.Spans.FirstOrDefault(s => RequestParts.BrowserTypeOf(s) == "pageview" && Str(s, "wizelens.browser.navigation") == "load");
        if (!Num(view, "wizelens.page.fcp_ms", out var paint) || !Num(view, "wizelens.page.ttfb_ms", out var ttfb)) return null;
        return (paint, Math.Max(0, paint - ttfb));
    }

    /// <summary>The request row of a trace, or null when the trace is not a request (a page view, a job).</summary>
    public static RequestItem? Of(Trace t)
    {
        var server = RequestParts.EntryServerSpan(t.Spans);
        var fetch = t.Spans.Where(s => RequestParts.BrowserTypeOf(s) == "fetch").OrderBy(s => s.StartMs).FirstOrDefault();
        if (server is null && fetch is null) return null;
        var db = t.Spans.Where(s => s.Category == SpanCategories.Db).ToList();
        var clients = t.Spans.Where(s => s.Category == SpanCategories.HttpClient).ToList();
        var load = fetch is null ? PageLoadOf(t) : null;
        double? renderMs = fetch is not null ? (Num(fetch, "wizelens.browser.render_ms", out var r) ? r : null) : load?.RenderMs;
        var totalMs = fetch is not null ? fetch.DurationMs + (renderMs ?? 0) : load is { } l ? Math.Max(l.PaintMs, server?.DurationMs ?? 0) : t.DurationMs;
        var networkMs = server is null ? (double?)null : fetch is not null ? Math.Max(0, fetch.DurationMs - server.DurationMs)
            : load is { } v ? Math.Max(0, v.PaintMs - v.RenderMs - server.DurationMs) : null;
        var errors = t.Spans.Count(RequestParts.IsErrorSpan);
        var insights = RequestParts.InsightCount(t);
        var (method, path, endpoint) = IdentityOf(server, fetch);
        var status = StatusOf(server, fetch);
        var answer = server ?? fetch;
        var expected = answer is not null && RequestParts.IsExpectedSpan(answer);
        return new RequestItem(
            t.TraceId, fetch?.StartMs ?? server?.StartMs ?? t.StartMs, method, path, endpoint, status, expected,
            AttributeValue.Normalize(server?.Attributes.GetValueOrDefault("wizelens.request.aborted")) is true,
            totalMs, server?.DurationMs, RequestParts.BusyMs(db), db.Count, clients.Count, RequestParts.BusyMs(clients), renderMs,
            networkMs,
            server?.Service ?? "browser", [.. t.Services], errors, insights, RequestParts.HealthOf(status, expected, errors > 0, totalMs, insights),
            Str(server, "user_agent.original"), Str(server, "client.address"), Str(server, "enduser.id"), Str(server, "wizelens.request.id"), TagsOf(server));
    }
}
