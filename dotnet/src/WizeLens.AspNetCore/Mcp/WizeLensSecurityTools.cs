using System.ComponentModel;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using WizeLens.Analysis;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Mcp;

/// <summary>The read-only find_security_issues tool: OWASP Top 10 risks seen in the app's own traffic.</summary>
[McpServerToolType]
internal sealed class WizeLensSecurityTools(TraceStore store, ILogger<WizeLensSecurityTools> logger)
{
    private static readonly Dictionary<string, int> Rank = new() { ["error"] = 0, ["warning"] = 1, ["info"] = 2 };

    private sealed record Hit(SecurityFinding Finding, string Endpoint, Trace Trace);

    [McpServerTool(Name = "find_security_issues", ReadOnly = true), Description("Find security risks (OWASP Top 10:2025) in real requests: SQL built from input, missing security headers, loose CORS, cookies without flags, secrets in URLs and logs, plain HTTP calls, SSRF, open admin routes and sensitive files, and stack traces in answers. Grouped by kind and shape, the most severe first. Each one is a hint with an example trace, not proof.")]
    public string FindSecurityIssues(
        [Description("Lowest severity to list: error, warning, or info (default).")] string? severity = null,
        [Description("Maximum number of groups.")] int limit = 50,
        [Description("How far back: 15m, 1h, 6h, 24h (default), 7d, 30d.")] string? range = null)
    {
        logger.LogInformation("WizeLens MCP audit: tool {Tool} called with {Args}", "find_security_issues", JsonSerializer.Serialize(new { severity, limit, range }, WizeLensJson.Options));
        if (WizeLensSearchTools.WindowOf(range) is not { } w) return Json(new { error = WizeLensSearchTools.UnknownRange(range!) });
        var lowest = Rank.GetValueOrDefault(severity ?? "info", 2);
        var hits = store.All().Where(t => t.StartMs >= w.From && t.StartMs < w.To)
            .SelectMany(t => SecurityAnalysis.Find(t).Select(f => new Hit(f, SecurityRequest.Of(t)?.Endpoint ?? t.RootName, t)))
            .Where(h => Rank[h.Finding.Severity] <= lowest);
        var groups = hits.GroupBy(h => (h.Finding.Kind, h.Finding.Shape)).Select(g =>
        {
            var newest = g.MaxBy(h => h.Trace.StartMs)!;
            return new
            {
                g.Key.Kind,
                Owasp = SecurityAnalysis.Owasp[g.Key.Kind],
                newest.Finding.Severity,
                newest.Finding.Title,
                g.Key.Shape,
                Endpoints = g.Select(h => h.Endpoint).Distinct().Take(5).ToList(),
                Requests = g.Select(h => h.Trace.TraceId).Distinct().Count(),
                Count = g.Sum(h => h.Finding.Count),
                LastSeen = DateTimeOffset.FromUnixTimeMilliseconds((long)newest.Trace.StartMs).ToString("O"),
                ExampleTraceId = newest.Trace.TraceId,
            };
        });
        return Json(groups.OrderBy(g => Rank[g.Severity]).ThenByDescending(g => g.Requests).Take(Math.Clamp(limit, 1, 200)));
    }

    private static string Json(object value) => JsonSerializer.Serialize(value, WizeLensJson.Options);
}
