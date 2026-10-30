// Which tag rules match a page of rows, over the app's traces in memory. Mirrors core/src/tags/match.ts.
using System.Text.Json;
using System.Text.RegularExpressions;
using WizeLens.Model;
using WizeLens.Search;

namespace WizeLens.Tagging;

/// <summary>One row to check: its trace, its part (span id, log index, or "" for a request or trace), and when it happened.</summary>
internal sealed record TagMatchItem(string TraceId, string Owner, double TimeMs);

internal static partial class TagMatch
{
    public const int MaxItems = 200;

    /// <summary>Room around the rows' times: the trace ids pick the rows, and a trace's request can start well after the trace.</summary>
    public const double SlackMs = 3_600_000;

    [GeneratedRegex("^[0-9a-fA-F]{1,64}$")]
    private static partial Regex TraceIdPattern();

    public static string Key(string traceId, string owner) => $"{traceId} {owner}";

    /// <summary>Tag names per row, keyed by <see cref="Key"/>; rows without a tag are left out. Names keep the rules' order.</summary>
    public static Dictionary<string, List<string>> Match(IEnumerable<Trace> traces, string kind, IReadOnlyList<TagMatchItem> items, IReadOnlyList<ActiveTag> tags, string? env)
    {
        var result = new Dictionary<string, List<string>>();
        if (items.Count == 0 || tags.Count == 0) return result;
        var window = new SearchWindow(items.Min(i => i.TimeMs) - SlackMs, items.Max(i => i.TimeMs) + SlackMs);
        var want = items.Select(i => Key(i.TraceId, i.Owner)).ToHashSet(StringComparer.Ordinal);
        var only = items.Select(i => i.TraceId).ToHashSet(StringComparer.Ordinal);
        var predicates = tags.Select(t => (t.Name, Test: SearchMatch.Compile(t.Node))).ToList();
        var entries = traces.Where(t => only.Contains(t.TraceId)).SelectMany(t => SearchItems.DocEntries(t, kind, env))
            .Where(e => e.TimeMs >= window.From && e.TimeMs < window.To).ToList();
        foreach (var (name, test) in predicates)
        {
            foreach (var e in entries)
            {
                var key = Key(JsText.Of(e.Doc.Fields.GetValueOrDefault("trace")), e.Owner);
                if (!want.Contains(key) || !test(e.Doc)) continue;
                if (!result.TryGetValue(key, out var names)) result[key] = names = [];
                if (!names.Contains(name)) names.Add(name);
            }
        }
        return result;
    }

    /// <summary>The body of <c>POST api/tags/match</c>: <c>{ kind, items: [{ traceId, owner, timeMs }] }</c>, or the error to send back.</summary>
    public static (string? Kind, List<TagMatchItem>? Items, string? Error) RequestOf(JsonElement body)
    {
        var kind = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString() : null;
        if (kind is null || !SearchKinds.All.Contains(kind)) return (null, null, $"Set kind to one of {string.Join(", ", SearchKinds.All)}.");
        if (!body.TryGetProperty("items", out var list) || list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > MaxItems)
            return (null, null, $"Send items: up to {MaxItems} rows.");
        var items = list.EnumerateArray().Select(ItemOf).ToList();
        if (items.Any(i => i is null)) return (null, null, "Each item needs traceId (hex), owner (text, may be empty), and timeMs (epoch ms).");
        return (kind, [.. items.Select(i => i!)], null);
    }

    private static TagMatchItem? ItemOf(JsonElement e)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        var traceId = e.TryGetProperty("traceId", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()! : "";
        var owner = !e.TryGetProperty("owner", out var o) ? "" : o.ValueKind == JsonValueKind.String ? o.GetString()! : null;
        var time = e.TryGetProperty("timeMs", out var ms) && ms.ValueKind == JsonValueKind.Number ? ms.GetDouble() : double.NaN;
        if (!TraceIdPattern().IsMatch(traceId) || owner is null || owner.Length > 64 || !double.IsFinite(time)) return null;
        return new TagMatchItem(traceId.ToLowerInvariant(), owner, time);
    }
}
