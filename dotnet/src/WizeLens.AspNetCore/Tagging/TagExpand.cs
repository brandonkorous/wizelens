// tag: in a search becomes the searches it stands for, before the tree is compiled. Mirrors core/src/tags/expand.ts.
using WizeLens.Search;

namespace WizeLens.Tagging;

internal static class TagExpand
{
    /// <summary>The prefix of tags the app sets on a span: <c>wizelens.tag.key</c>.</summary>
    public const string TagPrefix = "wizelens.tag.";

    /// <summary>Matches nothing: NOT of an empty AND, as the parser reads <c>-*</c>.</summary>
    public static readonly SearchNode Nothing = new NotNode(new AndNode([]));

    private static SearchNode AnyOf(List<SearchNode> items) => items.Count switch { 0 => Nothing, 1 => items[0], _ => new OrNode(items) };

    private static SearchNode AppTag(string key, string? value = null) =>
        new AttrNode(TagPrefix + key, SearchCmp.Eq, value is null ? new ExistsValue() : new StringValue(value));

    private static SearchNode TagNode(FieldNode n, IReadOnlyList<ActiveTag> tags, List<string> unknown)
    {
        switch (n.Value)
        {
            case ExistsValue:
                return AnyOf([.. tags.Select(t => t.Node)]);
            case PatternValue p:
                var re = SearchMatch.PatternRegex(p.Pieces);
                return AnyOf([.. tags.Where(t => re.IsMatch(t.Name)).Select(t => t.Node)]);
            case StringValue s:
                var colon = s.Value.IndexOf(':');
                if (colon > 0) return AppTag(s.Value[..colon], s.Value[(colon + 1)..]);
                var name = s.Value.ToLowerInvariant();
                var rule = tags.FirstOrDefault(t => t.Name == name);
                if (rule is null && !unknown.Contains(name)) unknown.Add(name);
                return AnyOf([.. rule is null ? [] : new[] { rule.Node }, AppTag(s.Value)]);
            default:
                return Nothing;
        }
    }

    private static SearchNode ExpandNode(SearchNode n, IReadOnlyList<ActiveTag> tags, List<string> unknown) => n switch
    {
        AndNode a => new AndNode([.. a.Items.Select(i => ExpandNode(i, tags, unknown))]),
        OrNode o => new OrNode([.. o.Items.Select(i => ExpandNode(i, tags, unknown))]),
        NotNode not => new NotNode(ExpandNode(not.Item, tags, unknown)),
        FieldNode { Field: "tag" } f => TagNode(f, tags, unknown),
        _ => n,
    };

    /// <summary>The tree with every <c>tag:</c> replaced, and the names that matched no rule. Rules never use <c>tag:</c>, so one pass is enough.</summary>
    public static (SearchNode? Node, List<string> UnknownTags) Expand(SearchNode? node, IReadOnlyList<ActiveTag> tags)
    {
        var unknown = new List<string>();
        return (node is null ? null : ExpandNode(node, tags, unknown), unknown);
    }
}
