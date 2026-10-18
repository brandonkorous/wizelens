// Autocomplete: field names, attribute keys, and the common values of a field, newest data first.
using System.Text.Json.Serialization;
using WizeLens.Model;

namespace WizeLens.Search;

/// <summary>What to insert: "service", "@user.id", or a value; with help for a field, or how often a value was seen.</summary>
public sealed record Suggestion(
    string Value,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Help = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Count = null);

/// <summary>Field null asks for field names and attribute keys; else for values of that field. Env is what memory documents carry (in-app: the app's own).</summary>
public sealed record SuggestRequest(string? Field, string Prefix, SearchWindow Window, int Limit, string? Env = null);

public static class SearchSuggest
{
    /// <summary>Values every host knows without reading data.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> FixedValues = new Dictionary<string, IReadOnlyList<string>>
    {
        ["status"] = ["ok", "error", "unset", "2xx", "3xx", "4xx", "5xx"],
        ["level"] = SearchFields.LogLevels,
        ["error"] = ["true", "false"],
        ["kind"] = ["server", "client", "internal", "producer", "consumer"],
    };

    /// <summary>Fields whose values come from data, and the kind whose rows hold them.</summary>
    public static readonly IReadOnlyDictionary<string, string> DataFields = new Dictionary<string, string>
    {
        ["service"] = SearchKinds.Spans, ["env"] = SearchKinds.Traces, ["name"] = SearchKinds.Spans, ["method"] = SearchKinds.Spans,
        ["path"] = SearchKinds.Spans, ["route"] = SearchKinds.Spans, ["category"] = SearchKinds.Spans, ["user"] = SearchKinds.Spans,
    };

    private static bool Starts(string s, string prefix) => s.ToLowerInvariant().StartsWith(prefix.ToLowerInvariant(), StringComparison.Ordinal);

    /// <summary>Known fields that start with the prefix.</summary>
    public static List<Suggestion> FieldSuggestions(string prefix) =>
        [.. SearchFields.All.Where(f => Starts(f.Key, prefix)).Select(f => new Suggestion(f.Key, f.Value.Help))];

    public static List<Suggestion> FixedSuggestions(string field, string prefix) =>
        SearchFields.IsField(field) && FixedValues.TryGetValue(field, out var values) ? [.. values.Where(v => Starts(v, prefix)).Select(v => new Suggestion(v))] : [];

    /// <summary>Counted values, most common first, then by value in code-unit order.</summary>
    public static List<Suggestion> TopCounts(IEnumerable<KeyValuePair<string, int>> counts, int limit) =>
        [.. counts.OrderByDescending(c => c.Value).ThenBy(c => c.Key, StringComparer.Ordinal).Take(limit).Select(c => new Suggestion(c.Key, Count: c.Value))];

    private static Dictionary<string, int> CountMemory(IEnumerable<Trace> traces, SuggestRequest r)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        var prefix = r.Field is null && r.Prefix.StartsWith('@') ? r.Prefix[1..] : r.Prefix;
        void Add(object? v, string? label = null)
        {
            v = AttributeValue.Normalize(v);
            if (v is null or "" || !Starts(JsText.Of(v), prefix)) return;
            label ??= JsText.Of(v);
            counts[label] = counts.GetValueOrDefault(label) + 1;
        }
        var field = r.Field;
        var kind = field is null || field.StartsWith('@') ? SearchKinds.Spans : DataFields.GetValueOrDefault(field);
        if (kind is null) return counts;
        foreach (var e in traces.SelectMany(t => SearchItems.DocEntries(t, kind, r.Env)))
        {
            if (e.TimeMs < r.Window.From || e.TimeMs >= r.Window.To) continue;
            var attrs = e.Doc.Attrs.Count > 0 ? e.Doc.Attrs[0] : null;
            if (field is null)
            {
                foreach (var (k, v) in attrs ?? new Dictionary<string, object?>())
                    if (AttributeValue.Normalize(v) is not (null or "")) Add(k, $"@{k}");
            }
            else if (field.StartsWith('@')) Add(attrs?.GetValueOrDefault(field[1..]));
            else Add(e.Doc.Fields.GetValueOrDefault(field));
        }
        return counts;
    }

    /// <summary>Suggestions from traces held in memory.</summary>
    public static List<Suggestion> SuggestMemory(IEnumerable<Trace> traces, SuggestRequest r)
    {
        var fixedValues = r.Field is null ? (r.Prefix.StartsWith('@') ? [] : FieldSuggestions(r.Prefix)) : FixedSuggestions(r.Field, r.Prefix);
        return [.. fixedValues.Concat(TopCounts(CountMemory(traces, r), r.Limit)).Take(r.Limit)];
    }
}
