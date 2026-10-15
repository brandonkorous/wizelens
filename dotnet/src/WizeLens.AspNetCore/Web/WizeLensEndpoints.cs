using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Capture;
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

        group.MapGet("api/info", (WizeLensOptions o) => Results.Json(new
        {
            service = o.ServiceName,
            version = typeof(WizeLensEndpoints).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
            runtime = RuntimeInformation.FrameworkDescription,
            mcp = o.EnableMcp,
        }, WizeLensJson.Options));

        group.MapGet("api/traces", (TraceStore store, int? limit, string? session) =>
            Results.Json(store.Summaries(Math.Clamp(limit ?? 50, 1, 1000), string.IsNullOrEmpty(session) ? null : session), WizeLensJson.Options));

        group.MapGet("api/traces/{traceId}", async (HttpContext context, string traceId, bool? federate, TraceFederation federation) =>
        {
            var hop = int.TryParse(context.Request.Headers[WizeLensMiddleware.HopHeader], NumberStyles.Integer, CultureInfo.InvariantCulture, out var h) ? h : 0;
            var trace = await federation.GetAsync(traceId.ToLowerInvariant(), federate ?? false, hop, context.RequestAborted);
            return trace is null ? Results.NotFound() : Results.Json(trace, WizeLensJson.Options);
        });

        group.MapPost("api/client-spans", async (HttpContext context, TraceStore store) =>
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

            foreach (var span in (body?.Spans ?? []).Take(MaxClientSpans))
            {
                if (!TraceIdRegex().IsMatch(span.TraceId ?? "") || !SpanIdRegex().IsMatch(span.SpanId ?? "")) continue;
                span.TraceId = span.TraceId!.ToLowerInvariant();
                span.SpanId = span.SpanId!.ToLowerInvariant();
                span.ParentSpanId = string.IsNullOrEmpty(span.ParentSpanId) ? null : span.ParentSpanId.ToLowerInvariant();
                if (string.IsNullOrEmpty(span.Service)) span.Service = "browser";
                if (string.IsNullOrEmpty(span.Category)) span.Category = SpanCategories.Browser;
                span.Attributes ??= [];
                span.Events ??= [];
                store.AddSpan(WizeLensRuntime.Redactor.Redact(span));
            }
            return Results.NoContent();
        });

        // Dashboard UI. A bare "/_wizelens" redirects to "/_wizelens/" so relative asset URLs resolve.
        group.MapGet("", (HttpContext context) =>
        {
            if (!context.Request.Path.Value!.EndsWith('/'))
            {
                return Results.Redirect(context.Request.PathBase + context.Request.Path + "/" + context.Request.QueryString);
            }
            return Results.Extensions.Ui(null);
        });
        group.MapGet("{**path}", (string? path) => Results.Extensions.Ui(path));

        if (options.EnableMcp)
        {
            endpoints.MapMcp(options.NormalizedBasePath + "/mcp");
        }
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
