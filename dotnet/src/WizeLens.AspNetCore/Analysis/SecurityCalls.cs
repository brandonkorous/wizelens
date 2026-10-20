using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Analysis;

/// <summary>Secrets in URLs and plain HTTP (A04), and SSRF (A01); the same as core/src/security/calls.ts.</summary>
public static partial class SecurityCalls
{
    private const string SecretTitle = "A secret is sent in the URL";

    private static IEnumerable<Span> Clients(Trace t) => t.Spans.Where(s => s.Category == SpanCategories.HttpClient);

    /// <summary>JS <c>pathShape</c>: numeric and dashed guid segments and query values become <c>{}</c>.</summary>
    public static string PathShape(string pathAndQuery)
    {
        var q = pathAndQuery.IndexOf('?');
        var path = q >= 0 ? pathAndQuery[..q] : pathAndQuery;
        var query = q >= 0 ? pathAndQuery[(q + 1)..] : "";
        var shaped = string.Join('/', path.Split('/').Select(seg => Num().IsMatch(seg) || Guid().IsMatch(seg) ? "{}" : seg));
        if (query.Length == 0) return shaped;
        var pairs = query.Split('&').Where(p => p.Length > 0).Select(p => p.Contains('=') ? p[..p.IndexOf('=')] + "={}" : p);
        return $"{shaped}?{string.Join('&', pairs)}";
    }

    /// <summary>JS <c>httpShape</c>: <c>METHOD host[:port]/path/shape?q={}</c>.</summary>
    public static string HttpShape(Span s)
    {
        var method = (s.Attr("http.request.method") ?? "GET").ToUpperInvariant();
        if (Uri.TryCreate(s.Attr("url.full"), UriKind.Absolute, out var u)) return $"{method} {u.Authority}{PathShape(u.AbsolutePath + u.Query)}";
        var port = s.Attr("server.port");
        return $"{method} {s.Attr("server.address") ?? ""}{(string.IsNullOrEmpty(port) ? "" : ":" + port)}{PathShape(s.Attr("url.path") ?? s.Name)}";
    }

    public static List<string> SensitiveQueryKeys(string? query) => query is null ? [] :
        [.. query.Split('&').Select(p => Uri.UnescapeDataString(p.Split('=')[0])).Where(k => k.Length > 0 && WizeLens.Storage.Redactor.Defaults.IsSensitive(k)).Distinct()];

    private static string? QueryOf(string? url) => url is not null && url.Contains('?') ? url[(url.IndexOf('?') + 1)..] : null;

    public static IEnumerable<SecurityFinding> SecretInUrl(SecurityRequest r)
    {
        var own = SensitiveQueryKeys(r.Span.Attr("url.query"));
        if (own.Count == 0) yield break;
        var route = r.Span.Attr("http.route") ?? r.Path;
        yield return SecurityFinding.Of("secret-in-url", "warning", SecretTitle, $"{r.Method} {route}?{string.Join('&', own.Select(k => k + "={}"))}", r.Span);
    }

    public static IEnumerable<SecurityFinding> SecretInCalls(Trace trace) =>
        Clients(trace).Where(s => SensitiveQueryKeys(QueryOf(s.Attr("url.full"))).Count > 0).Select(s => SecurityFinding.Of("secret-in-url", "warning", SecretTitle, HttpShape(s), s));

    public sealed record Target(string Scheme, string Host, string? Full);

    public static Target? TargetOf(Span s)
    {
        var full = s.Attr("url.full");
        if (full is not null) return Uri.TryCreate(full, UriKind.Absolute, out var u) ? new Target(u.Scheme.ToLowerInvariant(), u.Host.ToLowerInvariant().Trim('[', ']'), full) : null;
        var scheme = s.Attr("url.scheme");
        var host = s.Attr("server.address");
        return scheme is null || host is null ? null : new Target(scheme.ToLowerInvariant(), host.ToLowerInvariant(), null);
    }

    public static bool IsInternalHost(string host)
    {
        if (host is "localhost" or "::1" || Ula().IsMatch(host) || host.StartsWith("fe80:", StringComparison.Ordinal)) return true;
        if (Ipv4().IsMatch(host)) return PrivateV4().IsMatch(host);
        return !host.Contains('.') || InternalSuffix().IsMatch(host);
    }

    public static IEnumerable<SecurityFinding> PlainHttp(Trace trace) => Clients(trace)
        .Where(s => TargetOf(s) is { Scheme: "http" } t && !IsInternalHost(t.Host))
        .Select(s => SecurityFinding.Of("plain-http", "warning", "A call goes out without HTTPS", HttpShape(s), s));

    private static string? HostOfInput(string v) =>
        UrlStart().IsMatch(v) && Uri.TryCreate(v, UriKind.Absolute, out var u) ? u.Host.ToLowerInvariant() : null;

    public static bool InputPicksTarget(Target t, IReadOnlyList<string> inputs) => inputs.Any(v =>
        UrlChars().IsMatch(v) && (v.ToLowerInvariant() == t.Host || t.Full is not null && t.Full.StartsWith(v, StringComparison.Ordinal) || HostOfInput(v) == t.Host));

    public static IEnumerable<SecurityFinding> Ssrf(Trace trace, SecurityRequest r) => r.Inputs.Count == 0 ? [] : Clients(trace)
        .Where(s => TargetOf(s) is { } t && InputPicksTarget(t, r.Inputs))
        .Select(s => SecurityFinding.Of("ssrf", "error", "A request decides where the server calls", HttpShape(s), s));

    [GeneratedRegex(@"^\d+$", RegexOptions.ECMAScript)]
    private static partial Regex Num();

    [GeneratedRegex(@"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex Guid();

    [GeneratedRegex(@"^f[cd][0-9a-f]{2}:", RegexOptions.ECMAScript)]
    private static partial Regex Ula();

    [GeneratedRegex(@"^\d+\.\d+\.\d+\.\d+$", RegexOptions.ECMAScript)]
    private static partial Regex Ipv4();

    [GeneratedRegex(@"^(?:10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)", RegexOptions.ECMAScript)]
    private static partial Regex PrivateV4();

    [GeneratedRegex(@"(?:\.local|\.internal|\.svc|\.cluster\.local|\.localhost)$", RegexOptions.ECMAScript)]
    private static partial Regex InternalSuffix();

    [GeneratedRegex(@"^[a-z][a-z0-9+.-]*://", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex UrlStart();

    [GeneratedRegex(@"[.:/]", RegexOptions.ECMAScript)]
    private static partial Regex UrlChars();
}
