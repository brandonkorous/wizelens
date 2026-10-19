using System.ComponentModel;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using WizeLens.Analysis;
using WizeLens.Model;
using WizeLens.Search;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Mcp;

/// <summary>Read-only MCP tools over WizeLens's traces. Every call writes an audit line to the app log.</summary>
[McpServerToolType]
internal sealed class WizeLensMcpTools(TraceStore store, WizeLensOptions options, IHostEnvironment environment, ILogger<WizeLensMcpTools> logger)
{
    private const string RangeHelp = "How far back: 15m, 1h, 6h, 24h (default), 7d, 30d.";

    [McpServerTool(Name = "list_traces", ReadOnly = true), Description("List request traces, newest first.")]
    public string ListTraces(
        [Description("Maximum number of traces to return.")] int limit = 20,
        [Description("Only traces at least this long, in milliseconds.")] double? minDurationMs = null,
        [Description("Only traces with this status: unset, ok or error.")] string? status = null,
        [Description("Only traces that match this search (the search tool's language).")] string? q = null,
        [Description(RangeHelp)] string? range = null)
    {
        Audit("list_traces", new { limit, minDurationMs, status, q, range });
        if (WizeLensSearchTools.WindowOf(range) is not { } window) return Json(new { error = WizeLensSearchTools.UnknownRange(range!) });
        var parts = new List<SearchNode>();
        if (q is not null)
        {
            var parsed = SearchCheck.Check(q);
            if (!parsed.Ok) return Json(new { error = parsed.Error, start = parsed.Start, end = parsed.End });
            if (parsed.Node is not null) parts.Add(parsed.Node);
        }
        var traces = store.All().Where(t => t.StartMs >= window.From && t.StartMs < window.To);
        if (parts.Count > 0) traces = traces.Where(t => SearchRun.SearchMemory([t], new SearchQuery(SearchKinds.Traces, new AndNode(parts), window, 1, Env: environment.EnvironmentName)).Items.Count > 0);
        return Json(traces
            .Where(t => minDurationMs is null || t.DurationMs >= minDurationMs)
            .Where(t => string.IsNullOrEmpty(status) || string.Equals(t.Status, status, StringComparison.OrdinalIgnoreCase))
            .Take(Math.Clamp(limit, 1, 500))
            .Select(t => t.ToSummary()));
    }

    /// <summary>The app's traces that started within a named range, newest first; null for an unknown range.</summary>
    private IEnumerable<Trace>? InRange(string? range) =>
        WizeLensSearchTools.WindowOf(range) is { } w ? store.All().Where(t => t.StartMs >= w.From && t.StartMs < w.To) : null;

    [McpServerTool(Name = "get_trace", ReadOnly = true), Description("Get one trace with all spans and logs. With federate=true it includes spans from downstream services.")]
    public async Task<string> GetTrace(
        TraceFederation federation,
        [Description("The 32-character hex trace id.")] string traceId,
        [Description("Pull spans from downstream services too.")] bool federate = true,
        CancellationToken cancellationToken = default)
    {
        Audit("get_trace", new { traceId, federate });
        var trace = await federation.GetAsync(traceId.ToLowerInvariant(), federate, 0, cancellationToken);
        return trace is null ? Json(new { error = $"Trace {traceId} not found." }) : Json(trace);
    }

    [McpServerTool(Name = "find_slow_queries", ReadOnly = true), Description("Find database queries at or above a duration threshold, slowest first.")]
    public string FindSlowQueries(
        [Description("Threshold in milliseconds. Default is the app's SlowQueryMs setting.")] double? thresholdMs = null,
        [Description("Maximum number of results.")] int limit = 20,
        [Description(RangeHelp)] string? range = null)
    {
        Audit("find_slow_queries", new { thresholdMs, limit, range });
        var threshold = thresholdMs ?? options.SlowQueryMs;
        if (InRange(range) is not { } traces) return Json(new { error = WizeLensSearchTools.UnknownRange(range!) });
        return Json(traces
            .SelectMany(t => TraceAnalysis.SlowQueries(t, threshold))
            .OrderByDescending(q => q.DurationMs)
            .Take(Math.Clamp(limit, 1, 500)));
    }

    [McpServerTool(Name = "find_n_plus_one", ReadOnly = true), Description("Find N+1 patterns: the same query or the same HTTP call repeated many times in one trace.")]
    public string FindNPlusOne([Description("Minimum repeats. Default is the app's NPlusOneThreshold setting.")] int? minRepeats = null)
    {
        Audit("find_n_plus_one", new { minRepeats });
        var threshold = Math.Max(2, minRepeats ?? options.NPlusOneThreshold);
        return Json(store.All()
            .SelectMany(t => TraceAnalysis.NPlusOnes(t, threshold))
            .Select(n => new { n.TraceId, n.Kind, n.Shape, n.Count, n.TotalMs }));
    }

    [McpServerTool(Name = "get_errors", ReadOnly = true), Description("List recent errors and exceptions, newest first.")]
    public string GetErrors([Description("Maximum number of results.")] int limit = 20, [Description(RangeHelp)] string? range = null)
    {
        Audit("get_errors", new { limit, range });
        if (InRange(range) is not { } traces) return Json(new { error = WizeLensSearchTools.UnknownRange(range!) });
        return Json(traces.SelectMany(TraceAnalysis.Errors).Take(Math.Clamp(limit, 1, 500)));
    }

    private void Audit(string tool, object args) =>
        logger.LogInformation("WizeLens MCP audit: tool {Tool} called with {Args}", tool, JsonSerializer.Serialize(args, WizeLensJson.Options));

    private static string Json(object value) => JsonSerializer.Serialize(value, WizeLensJson.Options);
}
