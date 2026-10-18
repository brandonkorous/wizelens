using System.Text.Json;
using System.Text.Json.Nodes;
using WizeLens.Search;

namespace WizeLens.Tests;

/// <summary>The shared cases in docs/search-vectors.json; the TS suite runs the same file.</summary>
public class SearchTests
{
    private static readonly Lazy<JsonElement> Vectors = new(() => JsonDocument.Parse(File.ReadAllText(SearchFixtures.RepoFile("docs", "search-vectors.json"))).RootElement);

    private static IEnumerable<JsonElement> Cases(string name) => Vectors.Value.GetProperty(name).EnumerateArray();

    public static TheoryData<int, string> ParseCases() => Indexed("parse");

    public static TheoryData<int, string> ErrorCases() => Indexed("errors");

    public static TheoryData<int, string> MatchCases() => Indexed("match");

    private static TheoryData<int, string> Indexed(string name)
    {
        var data = new TheoryData<int, string>();
        var i = 0;
        foreach (var c in Cases(name)) data.Add(i++, c.GetProperty("q").GetString()!);
        return data;
    }

    private static JsonElement Case(string name, int i) => Vectors.Value.GetProperty(name)[i];

    private static void AssertTree(JsonElement expected, SearchNode? actual, string q)
    {
        var want = JsonNode.Parse(expected.GetRawText());
        var got = JsonNode.Parse(SearchJson.ToJsonString(actual));
        Assert.True(JsonNode.DeepEquals(want, got), $"{q}\nwant {want?.ToJsonString() ?? "null"}\ngot  {got?.ToJsonString() ?? "null"}");
    }

    [Theory]
    [MemberData(nameof(ParseCases))]
    public void Parses_every_case_to_its_tree_and_its_text(int i, string q)
    {
        var c = Case("parse", i);
        var node = SearchParser.Parse(q);
        AssertTree(c.GetProperty("ast"), node, q);
        Assert.Equal(c.GetProperty("text").GetString(), SearchFormat.Format(node));
    }

    [Theory]
    [MemberData(nameof(ParseCases))]
    public void Reads_its_own_text_back_to_the_same_tree(int i, string q)
    {
        var c = Case("parse", i);
        AssertTree(c.GetProperty("ast"), SearchParser.Parse(c.GetProperty("text").GetString()!), q);
    }

    [Theory]
    [MemberData(nameof(ErrorCases))]
    public void Rejects_bad_searches_with_the_right_position(int i, string q)
    {
        var c = Case("errors", i);
        var r = SearchCheck.Check(q);
        Assert.False(r.Ok, q);
        Assert.Equal((c.GetProperty("start").GetInt32(), c.GetProperty("end").GetInt32()), (r.Start, r.End));
        Assert.Throws<SearchError>(() => SearchParser.Parse(q));
    }

    [Theory]
    [MemberData(nameof(MatchCases))]
    public void Matches_documents_as_each_case_expects(int i, string q)
    {
        var c = Case("match", i);
        var doc = DocOf(Vectors.Value.GetProperty("docs").GetProperty(c.GetProperty("doc").GetString()!));
        Assert.Equal(c.GetProperty("expect").GetBoolean(), SearchMatch.Compile(SearchParser.Parse(q))(doc));
    }

    [Fact]
    public void Has_cases_for_every_part_of_the_language()
    {
        Assert.True(Cases("parse").Count() > 50);
        Assert.True(Cases("errors").Count() > 20);
        Assert.True(Cases("match").Count() > 80);
    }

    /// <summary>A search document from its JSON form in the vectors file.</summary>
    private static SearchDoc DocOf(JsonElement d) => new(
        d.GetProperty("kind").GetString()!,
        [.. d.GetProperty("text").EnumerateArray().Select(t => t.GetString()!)],
        MapOf(d.GetProperty("fields")),
        [.. d.GetProperty("attrs").EnumerateArray().Select(MapOf)]);

    private static Dictionary<string, object?> MapOf(JsonElement o) =>
        o.EnumerateObject().ToDictionary(p => p.Name, p => ValueOf(p.Value));

    private static object? ValueOf(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString(),
        JsonValueKind.Number => v.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Array => v.EnumerateArray().Select(x => x.GetString()!).ToArray(),
        _ => null,
    };
}
