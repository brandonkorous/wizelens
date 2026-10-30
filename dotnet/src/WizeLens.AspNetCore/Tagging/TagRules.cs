// Tag rules: a name, a color, and a search, checked when data is shown (docs/TAGS-PLAN.md). Mirrors core/src/tags in TypeScript.
using System.Text.RegularExpressions;
using WizeLens.Search;

namespace WizeLens.Tagging;

/// <summary>A tag as <c>api/tags</c> lists it. Built-ins have ids like <c>builtin:stream</c>.</summary>
internal sealed record TagView(string Id, string Name, string Color, string Query, bool BuiltIn, bool Enabled);

/// <summary>A rule ready to run: its name and parsed search.</summary>
internal sealed record ActiveTag(string Name, SearchNode Node);

internal static partial class TagRules
{
    public static readonly IReadOnlyList<string> Colors = ["blue", "green", "amber", "orange", "red", "violet", "slate"];

    public const int MaxName = 40;
    public const int MaxQuery = 2000;
    public const int MaxRules = 50;
    public const string BuiltInPrefix = "builtin:";

    private const string Ua = "@user_agent.original";

    /// <summary>Built-in tags in the order the dashboard lists them; the same three as core/src/tags/builtins.ts.</summary>
    public static readonly IReadOnlyList<(string Name, string Color, string Query)> BuiltIns =
    [
        ("stream", "violet", "@http.response.header.content-type:text/event-stream*"),
        ("probe", "slate", $"{Ua}:kube-probe/* OR {Ua}:GoogleHC/* OR {Ua}:ELB-HealthChecker/* OR {Ua}:GoogleStackdriverMonitoring-UptimeChecks*"),
        ("bot", "amber", $"{Ua}:*bot* OR {Ua}:*crawler* OR {Ua}:*spider*"),
    ];

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]{0,39}$")]
    private static partial Regex NamePattern();

    public static bool IsBuiltIn(string name) => BuiltIns.Any(b => b.Name == name);

    /// <summary>Built-ins first (minus those turned off), then the rules by name.</summary>
    public static List<TagView> List(IEnumerable<TagView> rules, IReadOnlyCollection<string> disabled)
    {
        var builtIns = BuiltIns.Select(b => new TagView(BuiltInPrefix + b.Name, b.Name, b.Color, b.Query, true, !disabled.Contains(b.Name)));
        return [.. builtIns, .. rules.Where(r => !r.BuiltIn).OrderBy(r => r.Name, StringComparer.Ordinal)];
    }

    /// <summary>The enabled tags with a search that parses.</summary>
    public static List<ActiveTag> Active(IEnumerable<TagView> tags) =>
        [.. tags.Where(t => t.Enabled).Select(t => (t.Name, Check: SearchCheck.Check(t.Query))).Where(x => x.Check is { Ok: true, Node: not null }).Select(x => new ActiveTag(x.Name, x.Check.Node!))];

    /// <summary>True when the tree uses <c>tag:</c> anywhere.</summary>
    public static bool UsesTags(SearchNode? n) => n switch
    {
        AndNode a => a.Items.Any(UsesTags),
        OrNode o => o.Items.Any(UsesTags),
        NotNode not => UsesTags(not.Item),
        FieldNode f => f.Field == "tag",
        _ => false,
    };

    /// <summary>A rule's name (lowercased), color, and search, or the error; the same checks and words as checkTagInput.</summary>
    public static (TagView? Rule, string? Error) Check(string? rawName, string? color, string? rawQuery, IReadOnlyCollection<string> taken)
    {
        var name = (rawName ?? "").Trim().ToLowerInvariant();
        if (!NamePattern().IsMatch(name)) return (null, $"Name the tag with 1 to {MaxName} lowercase letters, digits, - or _.");
        if (IsBuiltIn(name)) return (null, $"\"{name}\" is a built-in tag. Pick another name.");
        if (taken.Contains(name)) return (null, $"A tag named \"{name}\" already exists here.");
        color ??= "blue";
        if (!Colors.Contains(color)) return (null, $"Pick a color: {string.Join(", ", Colors)}.");
        var query = (rawQuery ?? "").Trim();
        if (query.Length == 0) return (null, "Set the search this tag stands for.");
        if (query.Length > MaxQuery) return (null, $"A tag's search can be at most {MaxQuery} characters.");
        var c = SearchCheck.Check(query);
        if (!c.Ok) return (null, c.Error);
        if (c.Node is null) return (null, "This search matches everything. Narrow it, such as service:api.");
        if (UsesTags(c.Node)) return (null, "A tag's search cannot use tag:. Copy the other tag's search in instead.");
        return (new TagView(name, name, color, query, false, true), null);
    }

    /// <summary>The tags of the add-on from its option; a rule that fails its check throws, so a typo shows at startup.</summary>
    public static List<TagView> FromOptions(WizeLensTags o)
    {
        var rules = new List<TagView>();
        foreach (var r in o.Rules)
        {
            var (rule, error) = Check(r.Name, r.Color, r.Query, [.. rules.Select(x => x.Name)]);
            rules.Add(rule ?? throw new ArgumentException($"WizeLens tags: {error} ({r.Name}: {r.Query})"));
        }
        var unknown = o.DisableBuiltIns.Where(n => !IsBuiltIn(n)).ToList();
        if (unknown.Count > 0) throw new ArgumentException($"WizeLens tags: no built-in tag named {string.Join(", ", unknown)}. Built-ins: {string.Join(", ", BuiltIns.Select(b => b.Name))}.");
        return List(rules, o.DisableBuiltIns);
    }
}
