// The memory compiler: a search tree becomes a predicate over search documents.
using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Search;

/// <summary>One thing a search can find. Fields hold strings, numbers, bools, null, or string lists; <c>outcome</c> is the span status.</summary>
internal sealed record SearchDoc(
    string Kind,
    IReadOnlyList<string> Text,
    IReadOnlyDictionary<string, object?> Fields,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Attrs);

internal static class SearchMatch
{
    /// <summary>A case-insensitive regex for wildcard pieces.</summary>
    public static Regex PatternRegex(IEnumerable<string?> pieces) =>
        new($"^{string.Concat(pieces.Select(p => p is null ? @"[\s\S]*" : Regex.Escape(p)))}\\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static bool Compare(double a, string cmp, double b) => cmp switch
    {
        SearchCmp.Gt => a > b,
        SearchCmp.Ge => a >= b,
        SearchCmp.Lt => a < b,
        SearchCmp.Le => a <= b,
        _ => a == b,
    };

    private static bool Present(object? v) => v is not null and not "";

    /// <summary>A stored value as a number: numbers, and text that reads as one. Booleans and blanks are not numbers.</summary>
    public static double? NumberOf(object? v)
    {
        var value = AttributeValue.Normalize(v);
        double? n = value switch
        {
            string s when JsText.Trim(s).Length > 0 => JsText.ParseNumber(s),
            _ when JsText.IsNumber(value, out var x) => x,
            _ => null,
        };
        return n is { } d && double.IsFinite(d) ? d : null;
    }

    /// <summary>A test for one stored value (text, number, or boolean) against a query value.</summary>
    private static Func<object?, bool> ValueTest(SearchValue value, string cmp, bool prefix)
    {
        switch (value)
        {
            case ExistsValue:
                return Present;
            case StringValue s:
                var want = s.Value.ToLowerInvariant();
                return prefix
                    ? v => Present(v) && JsText.Of(v).ToLowerInvariant().StartsWith(want, StringComparison.Ordinal)
                    : v => Present(v) && JsText.Of(v).ToLowerInvariant() == want;
            case PatternValue p:
                var re = PatternRegex(p.Pieces);
                return v => Present(v) && re.IsMatch(JsText.Of(v));
            case NumberValue n:
                return v => NumberOf(v) is { } x && Compare(x, cmp, n.Value);
            case BoolValue b:
                return v => v is bool x && x == b.Value;
            case StatusClassValue c:
                return v => JsText.IsNumber(v, out var x) && Math.Floor(x / 100) == c.Value;
            case LevelValue l:
                var rank = SearchFields.LevelRank(l.Value);
                return v => v is string x && SearchFields.LevelRank(x) >= 0 && Compare(SearchFields.LevelRank(x), cmp, rank);
            case SpanStatusValue st:
                return v => v is string x && x == st.Value;
            default:
                throw new ArgumentOutOfRangeException(nameof(value));
        }
    }

    /// <summary>The test on a value in its contract form: string, long, double, bool, or null.</summary>
    private static Func<object?, bool> Normalized(Func<object?, bool> test) => v => test(AttributeValue.Normalize(v));

    /// <summary>Any element of a list value, or the value itself.</summary>
    private static Func<object?, bool> AnyOf(Func<object?, bool> test) =>
        v => v is not string && v is IEnumerable<object?> list ? list.Any(test) : test(v);

    private static Func<SearchDoc, bool> FieldPredicate(FieldNode n)
    {
        if (n.Field == "tag") return _ => false;
        var spec = SearchFields.All[n.Field];
        var key = n.Field == "status" && n.Value is SpanStatusValue ? "outcome" : n.Field;
        var test = AnyOf(Normalized(ValueTest(n.Value, n.Cmp, spec.Type == FieldType.Id)));
        return doc => spec.Kinds.Contains(doc.Kind) && test(doc.Fields.GetValueOrDefault(key));
    }

    private static Func<SearchDoc, bool> AttrPredicate(AttrNode n)
    {
        var test = Normalized(ValueTest(n.Value, n.Cmp, false));
        return doc => doc.Attrs.Any(a => a.TryGetValue(n.Key, out var v) && test(v));
    }

    /// <summary>A predicate for a search tree; null matches everything. Expand <c>tag:</c> first (Tagging/TagExpand.cs): left as is, it matches nothing.</summary>
    public static Func<SearchDoc, bool> Compile(SearchNode? node)
    {
        switch (node)
        {
            case null:
                return _ => true;
            case AndNode a:
                var all = a.Items.Select(Compile).ToList();
                return doc => all.All(p => p(doc));
            case OrNode o:
                var any = o.Items.Select(Compile).ToList();
                return doc => any.Any(p => p(doc));
            case NotNode not:
                var inner = Compile(not.Item);
                return doc => !inner(doc);
            case TextNode t:
                var needle = t.Value.ToLowerInvariant();
                return doc => doc.Text.Any(x => x.Contains(needle, StringComparison.Ordinal));
            case FieldNode f:
                return FieldPredicate(f);
            case AttrNode at:
                return AttrPredicate(at);
            default:
                throw new ArgumentOutOfRangeException(nameof(node));
        }
    }
}
