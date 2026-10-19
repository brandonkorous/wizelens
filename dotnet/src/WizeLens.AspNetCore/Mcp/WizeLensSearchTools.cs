using System.ComponentModel;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using WizeLens.Search;
using WizeLens.Storage;
using WizeLens.Tagging;
using WizeLens.Web;

namespace WizeLens.Mcp;

/// <summary>search and search_fields: the search language over the app's traces in memory, in the app's environment. Every call writes an audit line.</summary>
[McpServerToolType]
internal sealed class WizeLensSearchTools(TraceStore store, WizeLensOptions options, IHostEnvironment environment, ILogger<WizeLensSearchTools> logger)
{
    private const string Language =
        "Search language: words and \"phrases\" match text (path, SQL, messages, errors). " +
        "field:value with service, env, trace, span, name, method, path, route, status (500, 5xx, ok, error), duration (250ms, 1s), level, category, kind, user, error (true/false), message. " +
        "@attribute:value for any span or log attribute, such as @user.id:42 or @db.system.name:postgres. " +
        "Use >, >=, <, <= (status:>=500, duration:>1s), ranges a..b, * wildcards (path:/api/*), -term or NOT to exclude, OR, and parentheses. " +
        "tag:name matches a tag rule (list_tags) or a tag the app sets; results come with the tags on each.";

    [McpServerTool(Name = "search", ReadOnly = true, OpenWorld = false), Description("Search requests, traces, spans, and logs, newest first. " + Language)]
    public CallToolResult Search(
        [Description("The search. Empty finds everything in the range.")] string q,
        [Description("What to find: requests (default), traces, spans, or logs.")] string? kind = null,
        [Description("How far back: 15m, 1h, 6h, 24h (default), 7d, 30d.")] string? range = null,
        [Description("Results per page. Default 20.")] int? limit = null,
        [Description("The `next` value of the last page, for the next page.")] string? cursor = null)
    {
        Audit("search", new { q, kind, range, limit, cursor });
        if (kind is not null && !SearchKinds.All.Contains(kind)) return Error(new { error = $"Unknown kind \"{kind}\". Use {string.Join(", ", SearchKinds.All)}." });
        if (limit is < 1 or > SearchRun.PageMax) return Error(new { error = $"limit must be 1 to {SearchRun.PageMax}." });
        if (WindowOf(range) is not { } window) return Error(new { error = UnknownRange(range!) });
        var parsed = SearchCheck.Check(q);
        if (!parsed.Ok) return Error(new { error = parsed.Error, start = parsed.Start, end = parsed.End });
        var active = TagRules.Active(options.TagList);
        var (node, unknownTags) = TagExpand.Expand(parsed.Node, active);
        var query = new SearchQuery(kind ?? SearchKinds.Requests, node, window, limit ?? 20, SearchRun.DecodeCursor(cursor), environment.EnvironmentName);
        var page = SearchRun.SearchMemory(store.All(), query);
        var tags = TagMatch.Match(store.All(), page.Kind, [.. page.Items.Select(i => TagSuggest.ItemOf(page.Kind, i))], active, environment.EnvironmentName);
        return Ok(new { kind = page.Kind, items = page.Items, next = page.Next, tags, unknownTags });
    }

    [McpServerTool(Name = "search_fields", ReadOnly = true, OpenWorld = false), Description("List search fields, attribute keys seen in the data, or the common values of one field, to build a search.")]
    public CallToolResult SearchFields(
        [Description("Leave out to list fields and attribute keys; or a field (service) or attribute (@user.id) to list its common values.")] string? field = null,
        [Description("Only names or values that start with this.")] string? prefix = null,
        [Description("Which data to read. Default 24h.")] string? range = null)
    {
        Audit("search_fields", new { field, prefix, range });
        if (field?.Length > 200 || prefix?.Length > 200) return Error(new { error = "field and prefix can be at most 200 characters." });
        if (WindowOf(range) is not { } window) return Error(new { error = UnknownRange(range!) });
        var request = new SuggestRequest(string.IsNullOrEmpty(field) ? null : field, prefix ?? "", window, 50, environment.EnvironmentName);
        return Ok(TagSuggest.Suggest(request, options.TagList) ?? SearchSuggest.SuggestMemory(store.All(), request));
    }

    [McpServerTool(Name = "list_tags", ReadOnly = true, OpenWorld = false), Description("List the project's tags: built-in and custom tag rules, each a name for a search. Use tag:name in search, list_traces q, or anything that takes a search.")]
    public CallToolResult ListTags()
    {
        Audit("list_tags", new { });
        return Ok(options.TagList.Select(t => new { t.Name, t.Query, t.BuiltIn, t.Enabled }));
    }

    /// <summary>The window of a named range back from now (default 24h), or null when there is no such range.</summary>
    internal static SearchWindow? WindowOf(string? range)
    {
        var now = (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return SearchRequests.RangeMs(range ?? "24h") is { } ms ? new SearchWindow(now - ms, now) : null;
    }

    internal static string UnknownRange(string range) =>
        $"Unknown range \"{range}\". Use {string.Join(", ", SearchRequests.TimeRanges.Select(r => r.Name))}.";

    private static CallToolResult Ok(object value) => new() { Content = [new TextContentBlock { Text = Json(value) }] };

    private static CallToolResult Error(object value) => new() { Content = [new TextContentBlock { Text = Json(value) }], IsError = true };

    private void Audit(string tool, object args) =>
        logger.LogInformation("WizeLens MCP audit: tool {Tool} called with {Args}", tool, JsonSerializer.Serialize(args, WizeLensJson.Options));

    private static string Json(object value) => JsonSerializer.Serialize(value, WizeLensJson.Options);
}
