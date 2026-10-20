using System.Text.RegularExpressions;

namespace WizeLens.Analysis;

/// <summary>Open sensitive paths (A02), open admin routes (A01), and stack traces in answers (A10); the same as core/src/security/paths.ts.</summary>
public static partial class SecurityPaths
{
    private static readonly string[] CredentialHeaders = ["authorization", "cookie", "x-api-key", "api-key"];

    public static IEnumerable<SecurityFinding> ExposedPath(SecurityRequest r)
    {
        var path = r.Path.ToLowerInvariant();
        if (r.Is2xx && Exposed().IsMatch(path)) yield return SecurityFinding.Of("exposed-path", "error", "A sensitive file or debug page is open", path, r.Span);
    }

    public static bool Anonymous(SecurityRequest r) => !r.User && CredentialHeaders.All(h => r.RequestHeader(h) is null);

    public static IEnumerable<SecurityFinding> OpenAdmin(SecurityRequest r)
    {
        var path = r.Path.ToLowerInvariant();
        if (!r.Is2xx || !AdminSegment().IsMatch(path) || SignIn().IsMatch(path) || !Anonymous(r)) yield break;
        var html = (r.Header("content-type") ?? "").StartsWith("text/html", StringComparison.OrdinalIgnoreCase);
        if (r.Method == "GET" && (html || !r.HeadersKnown)) yield break;
        yield return SecurityFinding.Of("open-admin", "warning", "An admin route answered without credentials", r.Endpoint, r.Span);
    }

    public static IEnumerable<SecurityFinding> StackExposed(SecurityRequest r)
    {
        if (r.Status is null or < 400 || string.IsNullOrEmpty(r.Body) || !Stack().IsMatch(r.Body)) yield break;
        yield return SecurityFinding.Of("stack-exposed", "warning", "An error answer shows a stack trace", r.Endpoint, r.Span);
    }

    [GeneratedRegex(@"(?:^|/)(?:\.env(?:\.[\w-]+)?$|\.git/|\.svn/|\.aws/|\.ds_store$|web\.config$|phpinfo\.php$|server-status$|elmah\.axd|trace\.axd|debug/pprof|actuator/(?:env|heapdump|threaddump|configprops|mappings|beans|loggers|shutdown|jolokia)(?:/|$))", RegexOptions.ECMAScript)]
    private static partial Regex Exposed();

    [GeneratedRegex(@"Traceback \(most recent call last\)|goroutine \d+ \[|\.java:\d+\)|:line \d+|(?:\n|\\n)\s*at [\w.$<>`[\]]+ ?\(|(?:\n|\\n)\s*at .+ \(.+:\d+:\d+\)|Stack trace:(?:\s|\\n)*#0", RegexOptions.ECMAScript)]
    private static partial Regex Stack();

    [GeneratedRegex(@"(?:^|/)(?:admin|internal|management)(?:/|$)", RegexOptions.ECMAScript)]
    private static partial Regex AdminSegment();

    [GeneratedRegex(@"login|signin|sign-in|logon", RegexOptions.ECMAScript)]
    private static partial Regex SignIn();
}
