using WizeLens.Model;

namespace WizeLens.Analysis;

/// <summary>Security rules over one trace. Every WizeLens SDK runs the same rules.</summary>
internal static class SecurityAnalysis
{
    /// <summary>The OWASP Top 10:2025 category of each kind.</summary>
    public static readonly IReadOnlyDictionary<string, string> Owasp = new Dictionary<string, string>
    {
        ["open-admin"] = "A01", ["ssrf"] = "A01", ["missing-headers"] = "A02", ["version-header"] = "A02", ["cors"] = "A02",
        ["exposed-path"] = "A02", ["vulnerable-package"] = "A03", ["cookie-flags"] = "A04", ["plain-http"] = "A04",
        ["secret-in-url"] = "A04", ["sql-injection"] = "A05", ["auth-guessing"] = "A07", ["secret-leak"] = "A09", ["stack-exposed"] = "A10",
    };

    /// <summary>Every security finding of a trace: the request's own, then outgoing calls, then leaked secrets.</summary>
    public static List<SecurityFinding> Find(Trace trace)
    {
        var r = SecurityRequest.Of(trace);
        var own = r is null ? [] : SecurityRules.SqlInjection(trace, r)
            .Concat(SecurityCalls.Ssrf(trace, r))
            .Concat(SecurityPaths.ExposedPath(r))
            .Concat(SecurityPaths.OpenAdmin(r))
            .Concat(SecurityRules.Headers(r))
            .Concat(SecurityRules.Cors(r))
            .Concat(SecurityRules.Cookies(r))
            .Concat(SecurityCalls.SecretInUrl(r))
            .Concat(SecurityPaths.StackExposed(r))
            .Concat(SecurityRules.VersionHeaders(r));
        return [.. own.Concat(SecurityCalls.SecretInCalls(trace)).Concat(SecurityCalls.PlainHttp(trace)).Concat(SecurityLeaks.Leaks(trace))];
    }
}
