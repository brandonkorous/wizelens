using System.Text.Json;
using WizeLens.Search;
using WizeLens.Tagging;

namespace WizeLens.Tests;

/// <summary>The tag cases in docs/search-vectors.json (the TS suite runs the same file), and the in-app tag rules.</summary>
public class TagTests
{
    private static readonly Lazy<JsonElement> Vectors =
        new(() => JsonDocument.Parse(File.ReadAllText(SearchFixtures.RepoFile("docs", "search-vectors.json"))).RootElement.GetProperty("tags"));

    private static IEnumerable<JsonElement> Cases(string name) => Vectors.Value.GetProperty(name).EnumerateArray();

    private static List<ActiveTag> VectorTags() => TagRules.Active(TagRules.List(
        Cases("rules").Select(r => new TagView(r.GetProperty("name").GetString()!, r.GetProperty("name").GetString()!, "blue", r.GetProperty("query").GetString()!, false, true)), []));

    [Fact]
    public void Ships_the_built_ins_the_file_names()
    {
        var want = Cases("builtIns").Select(b => (b.GetProperty("name").GetString()!, b.GetProperty("color").GetString()!, b.GetProperty("query").GetString()!));
        Assert.Equal(want, TagRules.BuiltIns);
    }

    [Fact]
    public void Expands_tag_as_each_case_expects()
    {
        var tags = VectorTags();
        foreach (var c in Cases("expand"))
        {
            var q = c.GetProperty("q").GetString()!;
            var (node, unknown) = TagExpand.Expand(SearchParser.Parse(q), tags);
            Assert.True(c.GetProperty("text").GetString() == SearchFormat.Format(node), $"{q}: {SearchFormat.Format(node)}");
            Assert.Equal(c.GetProperty("unknown").EnumerateArray().Select(u => u.GetString()), unknown);
        }
    }

    [Fact]
    public void Checks_names_searches_and_colors_as_each_case_expects()
    {
        foreach (var c in Cases("names"))
        {
            var want = c.GetProperty("name").ValueKind == JsonValueKind.Null ? null : c.GetProperty("name").GetString();
            Assert.Equal(want, TagRules.Check(c.GetProperty("input").GetString(), null, "a", ["pay"]).Rule?.Name);
        }
        foreach (var c in Cases("queries")) Assert.Equal(c.GetProperty("ok").GetBoolean(), TagRules.Check("x", null, c.GetProperty("query").GetString(), []).Rule is not null);
        foreach (var c in Cases("colors")) Assert.Equal(c.GetProperty("ok").GetBoolean(), TagRules.Check("x", c.GetProperty("color").GetString(), "a", []).Rule is not null);
    }

    [Fact]
    public void Reads_rules_from_the_option_and_refuses_bad_ones()
    {
        var list = TagRules.FromOptions(new WizeLensTags { Rules = [new("Slow", "duration:>1s", "red")], DisableBuiltIns = ["bot"] });
        Assert.Equal(["stream:True", "probe:True", "bot:False", "slow:True"], list.Select(t => $"{t.Name}:{t.Enabled}"));
        Assert.Throws<ArgumentException>(() => TagRules.FromOptions(new WizeLensTags { Rules = [new("x", "status:abc")] }));
        Assert.Throws<ArgumentException>(() => TagRules.FromOptions(new WizeLensTags { Rules = [new("x", "a"), new("X", "b")] }));
        Assert.Throws<ArgumentException>(() => TagRules.FromOptions(new WizeLensTags { DisableBuiltIns = ["nope"] }));
    }
}
