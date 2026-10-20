using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Analysis;

/// <summary>Secrets that reached logs, span data, or a response (A09); the same as core/src/security/leaks.ts.</summary>
public static partial class SecurityLeaks
{
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["jwt"] = "JWT", ["aws-key"] = "AWS key", ["private-key"] = "Private key", ["stripe-key"] = "Stripe key",
        ["github-token"] = "GitHub token", ["slack-token"] = "Slack token", ["google-key"] = "Google API key", ["card"] = "Card number",
    };

    private static readonly HashSet<string> Bodies = ["wizelens.response.body", "wizelens.request.body"];

    private sealed record Hit(string Kind, string Where, string? SpanId);

    public static IEnumerable<string> MarkersIn(string? text) => string.IsNullOrEmpty(text) || !text.Contains("[redacted:", StringComparison.Ordinal) ? []
        : Marker().Matches(text).Select(m => m.Groups[1].Value).Where(Labels.ContainsKey);

    private static IEnumerable<string> AttrMarkers(Dictionary<string, object?> a, bool skipBodies) =>
        a.Where(kv => kv.Value is string && !(skipBodies && Bodies.Contains(kv.Key))).SelectMany(kv => MarkersIn((string)kv.Value!));

    private static IEnumerable<Hit> HitsOf(Trace trace)
    {
        foreach (var s in trace.Spans)
        {
            var data = AttrMarkers(s.Attributes, true).Concat(s.Events.SelectMany(e => AttrMarkers(e.Attributes, false))).Concat(MarkersIn(s.StatusMessage));
            foreach (var kind in data) yield return new Hit(kind, "in span data", s.SpanId);
            if (s.Attributes.GetValueOrDefault("wizelens.response.body") is string body)
            {
                foreach (var kind in MarkersIn(body).Where(k => k != "jwt")) yield return new Hit(kind, "in a response", s.SpanId);
            }
        }
        foreach (var l in trace.Logs)
        {
            foreach (var kind in MarkersIn(l.Message).Concat(AttrMarkers(l.Attributes, false))) yield return new Hit(kind, "in logs", l.SpanId);
        }
    }

    public static IEnumerable<SecurityFinding> Leaks(Trace trace) => HitsOf(trace)
        .GroupBy(h => $"{Labels[h.Kind]} {h.Where}")
        .Select(g => new SecurityFinding("secret-leak", g.First().Kind == "jwt" ? "warning" : "error", "A secret was written where it is kept", g.Key, g.Count(), 0,
            [.. g.Select(h => h.SpanId).OfType<string>().Distinct()]));

    [GeneratedRegex(@"\[redacted:([a-z-]+)\]", RegexOptions.ECMAScript)]
    private static partial Regex Marker();
}
