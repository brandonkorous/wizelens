using System.ComponentModel;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using WizeLens.Metrics;
using WizeLens.Web;

namespace WizeLens.Mcp;

/// <summary>Read-only MCP tools over the app's metrics. Every call writes an audit line to the app log.</summary>
[McpServerToolType]
internal sealed class WizeLensMetricTools(MetricStore metrics, ILogger<WizeLensMetricTools> logger)
{
    [McpServerTool(Name = "list_metrics", ReadOnly = true), Description("List the app's metrics (.NET runtime, ASP.NET Core, HttpClient, custom meters) with the newest value of each.")]
    public string ListMetrics([Description("Only metrics whose name contains this text.")] string? q = null)
    {
        Audit("list_metrics", new { q });
        return Json(MetricSummary.List(metrics.Since(null), q));
    }

    [McpServerTool(Name = "get_metric", ReadOnly = true), Description("Get one metric per series: newest, min, max, and average; histograms give count, average, and p95.")]
    public string GetMetric([Description("The metric name, for example http.server.request.duration.")] string name)
    {
        Audit("get_metric", new { name });
        var detail = MetricSummary.Detail(metrics.Since(null), name).ToList();
        return detail.Count == 0 ? Json(new { error = $"Metric {name} not found." }) : Json(new { name, series = detail });
    }

    private void Audit(string tool, object args) =>
        logger.LogInformation("WizeLens MCP audit: tool {Tool} called with {Args}", tool, JsonSerializer.Serialize(args, WizeLensJson.Options));

    private static string Json(object value) => JsonSerializer.Serialize(value, WizeLensJson.Options);
}
