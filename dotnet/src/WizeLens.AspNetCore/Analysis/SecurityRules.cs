using System.Text.RegularExpressions;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Analysis;

/// <summary>Injection (A05), headers and CORS (A02), and cookies (A04); the same as core/src/security/sql.ts, headers.ts, cookies.ts.</summary>
public static partial class SecurityRules
{
    private static readonly HashSet<string> NoSql = ["redis", "valkey", "mongodb", "elasticsearch", "opensearch", "memcached", "dynamodb"];

    public static IEnumerable<string> SqlLiterals(string sql) =>
        StringLiteral().Matches(sql).Select(m => TrimPercent().Replace(m.Groups[1].Value.Replace("''", "'"), ""))
            .Concat(NumberLiteral().Matches(sql).Select(m => m.Groups[1].Value));

    public static IEnumerable<SecurityFinding> SqlInjection(Trace trace, SecurityRequest r)
    {
        if (r.Inputs.Count == 0) return [];
        var inputs = r.Inputs.ToHashSet();
        return trace.Spans
            .Where(s => s.Category == SpanCategories.Db && !NoSql.Contains((s.Attr("db.system.name") ?? "").ToLowerInvariant()) && s.Attributes.GetValueOrDefault("db.query.text") is string)
            .Where(s => SqlLiterals(s.Attr("db.query.text")!).Any(inputs.Contains))
            .GroupBy(s => s.Attr("db.query.text")!)
            .Select(g => new SecurityFinding("sql-injection", "error", "Request input is written into SQL", g.Key, g.Count(), g.Sum(s => s.DurationMs), [.. g.Select(s => s.SpanId)]));
    }

    public static List<string> MissingHeaders(SecurityRequest r)
    {
        var missing = new List<string>();
        if (string.IsNullOrEmpty(r.Header("x-content-type-options"))) missing.Add("x-content-type-options");
        if (IsHtml(r))
        {
            var csp = r.Header("content-security-policy");
            if (string.IsNullOrEmpty(csp) && string.IsNullOrEmpty(r.Header("content-security-policy-report-only"))) missing.Add("content-security-policy");
            if (string.IsNullOrEmpty(r.Header("x-frame-options")) && !(csp ?? "").Contains("frame-ancestors", StringComparison.OrdinalIgnoreCase)) missing.Add("x-frame-options");
        }
        if (r.Https && string.IsNullOrEmpty(r.Header("strict-transport-security"))) missing.Add("strict-transport-security");
        return [.. missing.Order(StringComparer.Ordinal)];
    }

    private static bool IsHtml(SecurityRequest r) => (r.Header("content-type") ?? "").StartsWith("text/html", StringComparison.OrdinalIgnoreCase);

    /// <summary>Headers a proxy in front (Caddy, nginx, a CDN) often adds after the app answered, where WizeLens cannot see them.</summary>
    private static readonly HashSet<string> EdgeHeaders = ["strict-transport-security", "x-content-type-options", "x-frame-options"];

    private static bool ViaProxy(SecurityRequest r) => new[] { "via", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host" }.Any(h => !string.IsNullOrEmpty(r.RequestHeader(h)));

    public static IEnumerable<SecurityFinding> Headers(SecurityRequest r)
    {
        if (!r.HeadersKnown || !r.Is2xx) yield break;
        var missing = MissingHeaders(r);
        var edge = ViaProxy(r) ? missing.Where(EdgeHeaders.Contains).ToList() : [];
        var app = missing.Where(h => !edge.Contains(h)).ToList();
        if (app.Count > 0) yield return SecurityFinding.Of("missing-headers", "warning", "Security headers are missing", string.Join(", ", app), r.Span);
        if (edge.Count > 0) yield return SecurityFinding.Of("missing-headers", "info", "Security headers may be set at the edge", $"{string.Join(", ", edge)} (behind a proxy: check the answer it sends)", r.Span);
        if (IsHtml(r) && string.IsNullOrEmpty(r.Header("content-security-policy")) && !string.IsNullOrEmpty(r.Header("content-security-policy-report-only")))
            yield return SecurityFinding.Of("missing-headers", "info", "CSP in report-only mode", "content-security-policy-report-only: reports, does not block", r.Span);
    }

    public static IEnumerable<SecurityFinding> VersionHeaders(SecurityRequest r)
    {
        foreach (var name in new[] { "server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version" })
        {
            var v = r.Header(name);
            if (string.IsNullOrEmpty(v) || name == "server" && !Version().IsMatch(v)) continue;
            yield return SecurityFinding.Of("version-header", "info", "A header names the server's software", $"{name}: {(v.Length > 80 ? v[..80] : v)}", r.Span);
        }
    }

    public static IEnumerable<SecurityFinding> Cors(SecurityRequest r)
    {
        var origin = r.Header("access-control-allow-origin")?.Trim().ToLowerInvariant();
        var credentials = r.Header("access-control-allow-credentials")?.Trim().ToLowerInvariant() == "true";
        if (origin == "*" && credentials) yield return SecurityFinding.Of("cors", "warning", "CORS allows any origin with credentials", "access-control-allow-origin: *, with credentials", r.Span);
        else if (origin == "null") yield return SecurityFinding.Of("cors", "warning", "CORS allows the null origin", "access-control-allow-origin: null", r.Span);
    }

    public static IEnumerable<SecurityFinding> Cookies(SecurityRequest r)
    {
        var value = r.Header("set-cookie");
        if (value is null || value == Redactor.Redacted) yield break;
        foreach (var cookie in Redactor.SplitSetCookie(value))
        {
            var parts = cookie.Split(';');
            var name = parts[0].Split('=')[0].Trim();
            var flags = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var p in parts.Skip(1).Select(p => p.Split('=', 2))) flags[p[0].Trim().ToLowerInvariant()] = p.Length > 1 ? p[1].Trim().ToLowerInvariant() : "";
            var missing = MissingFlags(name, flags, r.Https);
            if (missing.Count > 0) yield return SecurityFinding.Of("cookie-flags", "warning", "A cookie is set without its safety flags", $"cookie {name}: missing {string.Join(", ", missing)}", r.Span);
        }
    }

    private static List<string> MissingFlags(string name, Dictionary<string, string> flags, bool https)
    {
        if (flags.GetValueOrDefault("max-age") == "0") return [];
        var missing = new List<string>();
        if (SessionName().IsMatch(name) && !flags.ContainsKey("httponly")) missing.Add("HttpOnly");
        if (!flags.ContainsKey("secure") && (https || flags.GetValueOrDefault("samesite") == "none")) missing.Add("Secure");
        return missing;
    }

    [GeneratedRegex(@"'((?:[^']|'')*)'", RegexOptions.ECMAScript)]
    private static partial Regex StringLiteral();

    [GeneratedRegex(@"(?:=|<>|!=|<=|>=|<|>|\bIN\s*\()\s*(-?\d+(?:\.\d+)?)(?![\w.])", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex NumberLiteral();

    [GeneratedRegex(@"^%+|%+$", RegexOptions.ECMAScript)]
    private static partial Regex TrimPercent();

    [GeneratedRegex(@"\d+\.\d+", RegexOptions.ECMAScript)]
    private static partial Regex Version();

    [GeneratedRegex(@"sess|sid|auth|token|jwt|login|remember|identity|\.aspnetcore\.", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex SessionName();
}
