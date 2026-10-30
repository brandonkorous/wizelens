// Tag names for tag: autocomplete, and a search result as a row to match. Mirrors core/src/tags/suggest.ts and match.ts.
using WizeLens.Model;
using WizeLens.Search;

namespace WizeLens.Tagging;

internal static class TagSuggest
{
    /// <summary>Values for <c>tag:</c> from the enabled tags; null for any other field, which the host answers from its data.</summary>
    public static List<Suggestion>? Suggest(SuggestRequest r, IEnumerable<TagView> tags)
    {
        if (r.Field != "tag") return null;
        var prefix = r.Prefix.ToLowerInvariant();
        return [.. tags.Where(t => t.Enabled && t.Name.StartsWith(prefix, StringComparison.Ordinal)).Select(t => new Suggestion(t.Name, t.BuiltIn ? "Built-in tag" : t.Query)).Take(r.Limit)];
    }

    /// <summary>A search result as a row to match: its trace, its part, and when it happened.</summary>
    public static TagMatchItem ItemOf(string kind, object item) => item switch
    {
        SpanItem s => new TagMatchItem(s.TraceId, s.SpanId, s.StartMs),
        LogItem l => new TagMatchItem(l.TraceId, SearchItems.LogOwner(l), l.TimeMs),
        TraceSummary t => new TagMatchItem(t.TraceId, "", t.StartMs),
        Analysis.RequestItem r => new TagMatchItem(r.TraceId, "", r.StartMs),
        _ => throw new ArgumentException($"No {kind} row: {item.GetType().Name}"),
    };
}
