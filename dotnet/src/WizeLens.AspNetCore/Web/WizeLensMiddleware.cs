using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using WizeLens.Capture;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>Enriches the request span, records exceptions, and adds WizeLens response headers; skips WizeLens's own path.</summary>
internal sealed class WizeLensMiddleware(RequestDelegate next, WizeLensOptions options, TraceStore store)
{
    public const string TraceHeader = "X-WizeLens-Trace";
    public const string EndpointHeader = "X-WizeLens-Endpoint";
    public const string HopHeader = "X-WizeLens-Hop";

    public async Task InvokeAsync(HttpContext context)
    {
        var basePath = options.NormalizedBasePath;
        if (context.Request.Path.StartsWithSegments(basePath))
        {
            await HandleOwnPathAsync(context, basePath);
            return;
        }
        if (IsPreflight(context.Request))
        {
            await SkipAsync(context);
            return;
        }

        var selfEndpoint = SelfEndpoint(context, basePath);
        store.AddSelfEndpoint(selfEndpoint);
        var activity = Activity.Current;
        if (activity is not null) AddResponseHeaders(context, activity.TraceId.ToHexString(), selfEndpoint);
        await ProfileAsync(context, activity);
    }

    private async Task HandleOwnPathAsync(HttpContext context, string basePath)
    {
        Activity.Current?.SetCustomProperty(WizeLensContext.IgnoreProperty, true);
        WizeLensContext.Suppressed = true;
        if (context.Request.Path.StartsWithSegments(basePath + "/api"))
        {
            context.Response.Headers.AccessControlAllowOrigin = "*";
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "content-type, traceparent, " + HopHeader;
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
        }
        await next(context);
    }

    /// <summary>A CORS preflight: sent before a cross-origin call, with no traceparent, so it is not traced.</summary>
    internal static bool IsPreflight(HttpRequest request) =>
        HttpMethods.IsOptions(request.Method) && request.Headers.ContainsKey("Access-Control-Request-Method");

    private async Task SkipAsync(HttpContext context)
    {
        Activity.Current?.SetCustomProperty(WizeLensContext.IgnoreProperty, true);
        WizeLensContext.Suppressed = true;
        await next(context);
    }

    private async Task ProfileAsync(HttpContext context, Activity? activity)
    {
        var bodies = activity is null ? null : BodyCapture.Start(context, options.CaptureResponseBody);
        Exception? failure = null;
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            failure = ex;
            activity?.AddException(ex);
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            throw;
        }
        finally
        {
            if (bodies is not null) await bodies.FinishAsync(activity!, failure is null);
            if (activity is not null) RequestEnricher.Enrich(activity, context, failure);
        }
    }

    private static void AddResponseHeaders(HttpContext context, string traceId, string selfEndpoint)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers[TraceHeader] = traceId;
            headers[EndpointHeader] = selfEndpoint;
            headers.Append("Access-Control-Expose-Headers", $"{TraceHeader}, {EndpointHeader}");
            return Task.CompletedTask;
        });
    }

    private static string SelfEndpoint(HttpContext context, string basePath) =>
        $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}{basePath}";
}
