// Writes a search tree back as text. Parsing the text gives the same tree.
using System.Text.RegularExpressions;

namespace WizeLens.Search;

internal static partial class SearchFormat
{
    [GeneratedRegex(@"[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff""\\():*]|^[-<>]|^(OR|AND|NOT)\z|\.\.")]
    private static partial Regex Special();

    /// <summary>Text as one term: bare when safe, else quoted with escapes.</summary>
    public static string QuoteText(string s) =>
        Special().IsMatch(s) || s.Length == 0 ? $"\"{s.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"" : s;

    /// <summary>A pattern: literal parts quoted when needed, <c>*</c> for "any text".</summary>
    private static string PatternText(IEnumerable<string?> pieces) => string.Concat(pieces.Select(p => p is null ? "*" : QuoteText(p)));

    private static string ValueText(SearchValue v) => v switch
    {
        StringValue s => QuoteText(s.Value),
        PatternValue p => PatternText(p.Pieces),
        NumberValue n => JsText.Number(n.Value),
        BoolValue b => b.Value ? "true" : "false",
        StatusClassValue c => $"{c.Value}xx",
        ExistsValue => "*",
        LevelValue l => l.Value,
        SpanStatusValue st => st.Value,
        _ => throw new ArgumentOutOfRangeException(nameof(v)),
    };

    /// <summary>Durations print in ms, so the text parses back to the same number.</summary>
    private static string LeafText(string name, string cmp, SearchValue v, bool ms) =>
        $"{name}:{(cmp == SearchCmp.Eq ? "" : cmp)}{(ms && v is NumberValue n ? $"{JsText.Number(n.Value)}ms" : ValueText(v))}";

    /// <summary>One node as text; <paramref name="inner"/> adds parentheses where the parent binds tighter.</summary>
    private static string NodeText(SearchNode n, bool inner) => n switch
    {
        AndNode a => a.Items.Count > 0 ? Wrap(string.Join(" ", a.Items.Select(i => NodeText(i, true))), inner && a.Items.Count > 1) : "*",
        OrNode o => Wrap(string.Join(" OR ", o.Items.Select(i => NodeText(i, true))), inner),
        NotNode { Item: AndNode or OrNode or NotNode } not => $"NOT {NodeText(not.Item, true)}",
        NotNode not => $"-{NodeText(not.Item, true)}",
        TextNode t => QuoteText(t.Value),
        FieldNode f => LeafText(f.Field, f.Cmp, f.Value, f.Field == "duration"),
        AttrNode at => LeafText($"@{at.Key}", at.Cmp, at.Value, false),
        _ => throw new ArgumentOutOfRangeException(nameof(n)),
    };

    private static string Wrap(string s, bool yes) => yes ? $"({s})" : s;

    /// <summary>A search tree as text; null (match everything) is "".</summary>
    public static string Format(SearchNode? n) => n is null ? "" : NodeText(n, false);
}
