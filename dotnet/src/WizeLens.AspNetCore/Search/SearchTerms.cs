// One term of a search as a tree node: free text, a known field, or an attribute.
using System.Text.RegularExpressions;

namespace WizeLens.Search;

internal static partial class SearchTerms
{
    [GeneratedRegex(@"^@?[A-Za-z_][A-Za-z0-9_.-]*\z")]
    private static partial Regex FieldName();

    private static readonly string[] Cmps = [SearchCmp.Ge, SearchCmp.Le, SearchCmp.Gt, SearchCmp.Lt];

    /// <summary>The comparison at the start of a value, and the rest.</summary>
    private static (string Cmp, List<Ch> Value) SplitCmp(IReadOnlyList<Ch> chars)
    {
        var lit = IndexOf(chars, ch => ch.Lit);
        var head = SearchLexer.Text(chars.Take(lit < 0 ? 2 : Math.Min(2, lit)));
        var cmp = Cmps.FirstOrDefault(c => head.StartsWith(c, StringComparison.Ordinal));
        return cmp is not null ? (cmp, chars.Skip(cmp.Length).ToList()) : (SearchCmp.Eq, chars.ToList());
    }

    /// <summary>Index of an unquoted "..", or -1.</summary>
    private static int RangeAt(IReadOnlyList<Ch> chars)
    {
        for (var i = 0; i + 1 < chars.Count; i++)
            if (chars[i].C == '.' && chars[i + 1].C == '.' && !chars[i].Lit && !chars[i + 1].Lit) return i;
        return -1;
    }

    private static SearchNode Leaf(string name, string cmp, SearchValue value) =>
        name.StartsWith('@') ? new AttrNode(name[1..], cmp, value) : new FieldNode(name, cmp, value);

    /// <summary>One <c>name:value</c> part, already split at the colon.</summary>
    private static SearchNode FieldNodeOf(SearchToken t, string name, List<Ch> chars)
    {
        var attr = name.StartsWith('@');
        if (!attr && !SearchFields.IsField(name))
            throw new SearchError($"Unknown field \"{name}\". Use @{name} for an attribute, or put the text in quotes.", t.Start, t.End);
        FieldType? type = attr ? null : SearchFields.All[name].Type;
        SearchValue ValueOf(IReadOnlyList<Ch> c, string cmp) => type is { } ft ? SearchValues.FieldValue(ft, c, cmp) : SearchValues.AttrValue(c, cmp);
        var (cmp, rest) = SplitCmp(chars);
        if (rest.Count == 0) throw new SearchError($"{name} needs a value.", t.Start, t.End);
        try
        {
            if (cmp == SearchCmp.Eq && rest.Count == 1 && rest[0].C == '*' && !rest[0].Lit) return Leaf(name, SearchCmp.Eq, new ExistsValue());
            var dots = cmp == SearchCmp.Eq ? RangeAt(rest) : -1;
            if (dots < 0) return Leaf(name, cmp, ValueOf(rest, cmp));
            if (type is { } t2 && !SearchValues.Ordered.Contains(t2)) throw new ValueError($"{name} cannot take a range.");
            var (lo, hi) = (rest[..dots], rest[(dots + 2)..]);
            if (lo.Count == 0 || hi.Count == 0) throw new ValueError("A range needs both ends, such as 200..299.");
            return new AndNode([Leaf(name, SearchCmp.Ge, ValueOf(lo, SearchCmp.Ge)), Leaf(name, SearchCmp.Le, ValueOf(hi, SearchCmp.Le))]);
        }
        catch (ValueError err)
        {
            throw new SearchError(err.Message, t.Start, t.End);
        }
    }

    /// <summary>A term as a node, or null when it matches everything (a lone <c>*</c>). <c>name://</c> is a URL, so it is text.</summary>
    public static SearchNode? TermNode(SearchToken t)
    {
        var chars = t.Chars;
        var colon = IndexOf(chars, ch => ch.C == ':' && !ch.Lit);
        var head = colon > 0 ? chars.Take(colon).ToList() : [];
        var name = head.All(ch => !ch.Lit) ? SearchLexer.Text(head) : "";
        var url = At(chars, colon + 1) == '/' && At(chars, colon + 2) == '/';
        var node = FieldName().IsMatch(name) && !url ? FieldNodeOf(t, name, chars.Skip(colon + 1).ToList()) : TextNodeOf(chars);
        if (node is null) return t.Neg ? new NotNode(new AndNode([])) : null;
        return t.Neg ? new NotNode(node) : node;
    }

    private static int IndexOf(IReadOnlyList<Ch> chars, Func<Ch, bool> test)
    {
        for (var i = 0; i < chars.Count; i++) if (test(chars[i])) return i;
        return -1;
    }

    private static char? At(IReadOnlyList<Ch> chars, int i) => i >= 0 && i < chars.Count ? chars[i].C : null;

    private static TextNode? TextNodeOf(IReadOnlyList<Ch> chars)
    {
        var value = SearchLexer.Text(chars.Where(ch => ch.Lit || ch.C != '*'));
        return value.Length > 0 ? new TextNode(value) : null;
    }

    /// <summary>Flattens nested ANDs and ORs, and unwraps single items.</summary>
    public static SearchNode Join(bool and, IReadOnlyList<SearchNode> items)
    {
        var flat = items.SelectMany<SearchNode, SearchNode>(n => n switch
        {
            AndNode a when and => a.Items,
            OrNode o when !and => o.Items,
            _ => [n],
        }).ToList();
        if (flat.Count == 1) return flat[0];
        return and ? new AndNode(flat) : new OrNode(flat);
    }

    /// <summary>True for an AND with no items: it matches everything.</summary>
    public static bool IsEmpty(SearchNode n) => n is AndNode { Items.Count: 0 };
}
