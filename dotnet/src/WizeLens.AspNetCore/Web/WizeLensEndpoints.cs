using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Capture;
using WizeLens.Metrics;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>Maps the dashboard UI and the JSON API from docs/CONTRACT.md.</summary>
internal static partial class WizeLensEndpoints
{
    private const int MaxClientSpans = 500;

    public static void Map(IEndpointRouteBuilder endpoints, WizeLensOptions options)
    {
        var group = endpoints.MapGroup(options.NormalizedBasePath).ExcludeFromDescription();
        group.MapGet("api/info", ServiceInfo.Create);
        group.MapGet("api/traces", ListTraces);
        group.MapGet("api/traces/{traceId}", GetTraceAsync);
        group.MapPost("api/client-spans", AddClientSpansAsync);
        if (options.MetricsOn) group.MapGet("api/metrics/points", (MetricStore metrics, double? since) => Results.Json(new { points = metrics.Since(since) }, WizeLensJson.Options));
        MapUi(group);
        if (options.EnableMcp) endpoints.MapMcp(options.NormalizedBasePath + "/mcp");
    }

    private static IResult ListTraces(TraceStore store, int? limit, string? session, bool? full, double? since)
    {
        if (full == true) return Results.Json(store.Recent(Math.Clamp(limit ?? 1000, 1, 5000), since), WizeLensJson.Options);
        var summaries = store.Summaries(Math.Clamp(limit ?? 50, 1, 1000), string.IsNullOrEmpty(session) ? null : session);
        return Results.Json(summaries, WizeLensJson.Options);
    }

    private static async Task<IResult> GetTraceAsync(HttpContext context, string traceId, bool? federate, TraceFederation federation)
    {
        var hopHeader = context.Request.Headers[WizeLensMiddleware.HopHeader];
        var hop = int.TryParse(hopHeader, NumberStyles.Integer, CultureInfo.InvariantCulture, out var h) ? h : 0;
        var trace = await federation.GetAsync(traceId.ToLowerInvariant(), federate ?? false, hop, context.RequestAborted);
        return trace is null ? Results.NotFound() : Results.Json(trace, WizeLensJson.Options);
    }

    private static async Task<IResult> AddClientSpansAsync(HttpContext context, TraceStore store)
    {
        ClientSpansRequest? body;
        try
        {
            body = await context.Request.ReadFromJsonAsync<ClientSpansRequest>(WizeLensJson.Options, context.RequestAborted);
        }
        catch (Exception)
        {
            return Results.BadRequest();
        }
        var origin = context.Request.Headers.Origin.ToString();
        foreach (var span in (body?.Spans ?? []).Take(MaxClientSpans))
        {
            if (!Normalize(span)) continue;
            store.AddSpan(WizeLensRuntime.Redactor.Redact(span));
            var remote = ClientRemote.Of(span, origin);
            if (remote is not null) store.AddRemote(span.TraceId, remote);
        }
        ClientLogs.Add(store, body?.Logs);
        return Results.NoContent();
    }

    private static bool Normalize(Span span)
    {
        if (!TraceIdRegex().IsMatch(span.TraceId ?? "") || !SpanIdRegex().IsMatch(span.SpanId ?? "")) return false;
        span.TraceId = span.TraceId!.ToLowerInvariant();
        span.SpanId = span.SpanId!.ToLowerInvariant();
        span.ParentSpanId = string.IsNullOrEmpty(span.ParentSpanId) ? null : span.ParentSpanId.ToLowerInvariant();
        if (string.IsNullOrEmpty(span.Service)) span.Service = "browser";
        if (string.IsNullOrEmpty(span.Category)) span.Category = SpanCategories.Browser;
        span.Attributes ??= [];
        span.Events ??= [];
        return true;
    }

    // A bare "/_wizelens" redirects to "/_wizelens/" so relative asset URLs resolve.
    private static void MapUi(RouteGroupBuilder group)
    {
        group.MapGet("", (HttpContext context) =>
        {
            if (!context.Request.Path.Value!.EndsWith('/'))
            {
                return Results.Redirect(context.Request.PathBase + context.Request.Path + "/" + context.Request.QueryString);
            }
            return Results.Extensions.Ui(null);
        });
        group.MapGet("{**path}", (string? path) => Results.Extensions.Ui(path));
    }

    private static IResult Ui(this IResultExtensions _, string? path) => new UiResult(path);

    private sealed class UiResult(string? path) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext) => EmbeddedUi.ServeAsync(httpContext, path);
    }

    [GeneratedRegex("^[0-9a-fA-F]{32}$")]
    private static partial Regex TraceIdRegex();

    [GeneratedRegex("^[0-9a-fA-F]{16}$")]
    private static partial Regex SpanIdRegex();
}
