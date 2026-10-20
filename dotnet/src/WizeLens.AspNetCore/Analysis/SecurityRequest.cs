using System.Text.Json;
using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Analysis;

public sealed record SecurityFinding(string Kind, string Severity, string Title, string Shape, int Count, double TotalMs, IReadOnlyList<string> SpanIds)
{
    public static SecurityFinding Of(string kind, string severity, string title, string shape, Span span) => new(kind, severity, title, shape, 1, span.DurationMs, [span.SpanId]);
}

/// <summary>The request a trace answers, as the security rules read it; the same as core/src/security/request.ts.</summary>
public sealed partial class SecurityRequest
{
    public required Span Span { get; init; }
    public required string Method { get; init; }
    public required string Path { get; init; }
    public required string Endpoint { get; init; }
    public int? Status { get; init; }
    public bool Https { get; init; }
    public bool HeadersKnown { get; init; }
    public bool User { get; init; }
    public string? Body { get; init; }
    public required IReadOnlyList<string> Inputs { get; init; }

    public string? Header(string name) => Span.Attr("http.response.header." + name);

    public string? RequestHeader(string name) => Span.Attr("http.request.header." + name);

    public bool Is2xx => Status is >= 200 and < 300;

    public static SecurityRequest? Of(Trace trace)
    {
        var span = RequestParts.EntryServerSpan(trace.Spans);
        if (span is null) return null;
        var method = (span.Attr("http.request.method") ?? "GET").ToUpperInvariant();
        var path = span.Attr("url.path") ?? "/";
        var query = span.Attr("url.query");
        var status = AttributeValue.AsDouble(span.Attributes.GetValueOrDefault("http.response.status_code"));
        return new SecurityRequest
        {
            Span = span,
            Method = method,
            Path = path,
            Endpoint = $"{method} {span.Attr("http.route") ?? TraceAnalysis.PathShape(path, query is null ? "" : "?" + query)}",
            Status = status is > 0 ? (int)status : null,
            Https = span.Attr("url.scheme")?.ToLowerInvariant() == "https" || FirstValue(span.Attr("http.request.header.x-forwarded-proto")) == "https",
            HeadersKnown = span.Attributes.Keys.Any(k => k.StartsWith("http.response.header.", StringComparison.Ordinal)),
            User = trace.Spans.Any(s => !string.IsNullOrEmpty(s.Attr("enduser.id"))),
            Body = span.Attr("wizelens.response.body"),
            Inputs = InputsOf(span, path),
        };
    }

    private static string? FirstValue(string? v) => v?.Split(',')[0].Trim().ToLowerInvariant();

    private static string Decode(string s) => Uri.UnescapeDataString(s.Replace('+', ' '));

    /// <summary>3 to 200 characters, or 2 or more digits, and not a redaction marker.</summary>
    public static bool IsInputValue(string v) => !v.StartsWith("[redacted", StringComparison.Ordinal) && (Digits().IsMatch(v) || v.Length is >= 3 and <= 200);

    public static IEnumerable<string> QueryValues(string? query) => (query ?? "").Split('&')
        .Where(p => p.Contains('=')).Select(p => Decode(p[(p.IndexOf('=') + 1)..]));

    public static IEnumerable<string> PathValues(string? route, string path)
    {
        if (route is null) yield break;
        var r = route.Split('/');
        var p = path.Split('/');
        for (var i = 0; i < r.Length; i++)
        {
            if (RouteParam().IsMatch(r[i]) && i < p.Length && p[i].Length > 0) yield return Decode(p[i]);
        }
    }

    /// <summary>String and number leaves of a JSON body, depth 5, at most 100.</summary>
    public static List<string> BodyValues(string? body)
    {
        var output = new List<string>();
        if (body is null) return output;
        try
        {
            using var doc = JsonDocument.Parse(body);
            Walk(doc.RootElement, 0, output);
        }
        catch (JsonException)
        {
        }
        return output;
    }

    private static void Walk(JsonElement e, int depth, List<string> output)
    {
        if (output.Count >= 100 || depth > 5) return;
        if (e.ValueKind is JsonValueKind.String) output.Add(e.GetString()!);
        else if (e.ValueKind is JsonValueKind.Number) output.Add(e.GetRawText());
        else if (e.ValueKind is JsonValueKind.Array) foreach (var x in e.EnumerateArray()) Walk(x, depth + 1, output);
        else if (e.ValueKind is JsonValueKind.Object) foreach (var x in e.EnumerateObject()) Walk(x.Value, depth + 1, output);
    }

    private static List<string> InputsOf(Span span, string path)
    {
        var body = span.Attributes.GetValueOrDefault("wizelens.request.body.truncated") is true ? null : span.Attr("wizelens.request.body");
        var all = QueryValues(span.Attr("url.query")).Concat(PathValues(span.Attr("http.route"), path)).Concat(BodyValues(body));
        return [.. all.Where(IsInputValue).Distinct()];
    }

    [GeneratedRegex(@"^\d{2,}$", RegexOptions.ECMAScript)]
    private static partial Regex Digits();

    [GeneratedRegex(@"^(\{[^}]+\}|:\w+)$", RegexOptions.ECMAScript)]
    private static partial Regex RouteParam();
}
