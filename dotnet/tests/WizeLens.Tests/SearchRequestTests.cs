using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.WebUtilities;
using WizeLens.Analysis;
using WizeLens.Search;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>Request rows, request search, suggestions, and API inputs, against the TS results in SearchFixtures.json.</summary>
public class SearchRequestTests
{
    private static void AssertJson(JsonElement expected, object? actual, string label)
    {
        var want = JsonNode.Parse(expected.GetRawText());
        var got = JsonNode.Parse(JsonSerializer.Serialize(actual, WizeLensJson.Options));
        Assert.True(JsonNode.DeepEquals(want, got), $"{label}\nwant {want?.ToJsonString()}\ngot  {got?.ToJsonString()}");
    }

    private static Func<string, string?> Params(string query)
    {
        var values = QueryHelpers.ParseQuery("?" + query);
        return key => values.TryGetValue(key, out var v) ? v[0] ?? "" : null;
    }

    [Fact]
    public void Builds_request_rows_like_the_ts_core()
    {
        var items = SearchFixtures.Traces().Select(RequestItems.Of).ToList();
        AssertJson(SearchFixtures.Expected("items"), items, "items");
        var keys = SearchFixtures.Expected("items")[0].EnumerateObject().Select(p => p.Name);
        Assert.Equal(keys, JsonSerializer.SerializeToElement(items[0], WizeLensJson.Options).EnumerateObject().Select(p => p.Name));
    }

    [Fact]
    public void Finds_requests_like_the_ts_core()
    {
        var traces = SearchFixtures.Traces();
        foreach (var q in SearchFixtures.Expected("queries").EnumerateObject())
        {
            var page = SearchRun.SearchMemory(traces, new SearchQuery(SearchKinds.Requests, SearchParser.Parse(q.Name), SearchFixtures.Window, 50));
            AssertJson(q.Value, page.Items.Cast<RequestItem>().Select(i => i.TraceId), q.Name);
        }
    }

    [Fact]
    public void Suggests_like_the_ts_core()
    {
        var traces = SearchFixtures.Traces();
        (string Name, string? Field, string Prefix, int Limit, string? Env)[] cases =
        [
            ("none", null, "", 50, null), ("at", null, "@url", 5, null), ("service", "service", "", 50, null), ("tenant", "@db.query.text", "select", 3, null),
            ("status", "status", "5", 50, null), ("env", "env", "", 50, null), ("envSet", "env", "p", 50, "prod"),
        ];
        foreach (var c in cases)
            AssertJson(SearchFixtures.Expected("suggest").GetProperty(c.Name), SearchSuggest.SuggestMemory(traces, new SuggestRequest(c.Field, c.Prefix, SearchFixtures.Window, c.Limit, c.Env)), c.Name);
    }

    [Fact]
    public void Reads_search_parameters_like_the_ts_core()
    {
        foreach (var c in SearchFixtures.Expected("req").EnumerateObject())
        {
            var r = SearchRequests.SearchRequestOf(Params(c.Name), 100_000_000, 7 * 86_400_000);
            object actual = r.Ok
                ? new { ok = true, kind = r.Query!.Kind, window = r.Query.Window, limit = r.Query.Limit, env = r.Query.Env }
                : r.Start is null ? new { ok = false, error = r.Error } : new { ok = false, error = r.Error, start = r.Start, end = r.End };
            AssertJson(c.Value, actual, c.Name);
        }
    }

    [Fact]
    public void Reads_suggest_parameters_like_the_ts_core()
    {
        foreach (var c in SearchFixtures.Expected("sug").EnumerateObject())
        {
            var r = SearchRequests.SuggestRequestOf(Params(c.Name), 100_000_000, 7 * 86_400_000);
            object actual = r.Ok
                ? new { field = r.Request!.Field, prefix = r.Request.Prefix.Length, window = r.Request.Window, limit = r.Request.Limit }
                : new { ok = false, error = r.Error };
            AssertJson(c.Value, actual, c.Name);
        }
    }

    [Fact]
    public void Shapes_paths_like_the_ts_core()
    {
        Assert.Equal("/orders/{}/{}/x?a={}&flag", RequestParts.PathShape("/orders/42/0f8fad5b-d9cb-469f-a165-70867728950e/x?a=1&&flag"));
        Assert.Equal("/k/0f8fad5bd9cb469fa16570867728950e", RequestParts.PathShape("/k/0f8fad5bd9cb469fa16570867728950e"));
        Assert.Null(RequestItems.Of(SearchFixtures.Traces()[2]));
    }
}
