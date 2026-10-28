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
        if (IsPreflight(context.Request) || IsHealthProbe(context.Request))
        {
            await SkipAsync(context);
            return;
        }

        var selfEndpoint = SelfEndpoint(context, basePath);
        store.AddSelfEndpoint(selfEndpoint);
        var activity = Activity.Current;
        if (activity is not null) AddResponseHeaders(context, activity, selfEndpoint);
        await ProfileAsync(context, activity);
    }

    private async Task HandleOwnPathAsync(HttpContext context, string basePath)
    {
        Activity.Current?.SetCustomProperty(WizeLensContext.IgnoreProperty, true);
        WizeLensContext.Suppressed = true;
        if (!options.ServesDashboard && !context.Request.Path.Equals(basePath + "/" + WizeLensEndpoints.ClientSpansPath, StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
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

    // Kubernetes probes, Google and AWS load balancer checks, and Google uptime checks: 200 traces an hour that hid every visit.
    private static readonly string[] ProbeAgents = ["kube-probe/", "GoogleHC/", "ELB-HealthChecker/", "GoogleStackdriverMonitoring-UptimeChecks"];

    /// <summary>A health check from the platform, not a visitor, so it is not traced.</summary>
    internal static bool IsHealthProbe(HttpRequest request)
    {
        var agent = request.Headers.UserAgent.ToString();
        return ProbeAgents.Any(p => agent.StartsWith(p, StringComparison.Ordinal));
    }

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
            if (activity is not null && failure is null) CaughtException.Record(activity, context);
            if (activity is not null) RequestEnricher.Enrich(activity, context, failure);
            // Images, fonts, scripts and style sheets would bury the pages; a failed one stays.
            if (activity is not null && !options.TraceStaticFiles && StaticFileRequests.IsServedFile(context, failure)) activity.SetCustomProperty(WizeLensContext.IgnoreProperty, true);
        }
    }

    private static void AddResponseHeaders(HttpContext context, Activity activity, string selfEndpoint)
    {
        var traceId = activity.TraceId.ToHexString();
        context.Response.OnStarting(() =>
        {
            // The response starts here: a stream's request time ends at this first byte.
            activity.SetCustomProperty(RequestEnricher.FirstByteProperty, (DateTime.UtcNow - activity.StartTimeUtc).TotalMilliseconds);
            var headers = context.Response.Headers;
            headers[TraceHeader] = traceId;
            headers[EndpointHeader] = selfEndpoint;
            headers.Append("Access-Control-Expose-Headers", $"{TraceHeader}, {EndpointHeader}");
            // A page cannot read its own document headers, but it can read Server-Timing. The page load joins this trace with it.
            headers.Append("Server-Timing", $"wl-trace;desc={traceId}, wl-endpoint;desc=\"{selfEndpoint}\", wl-start;desc={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");
            return Task.CompletedTask;
        });
    }

    private static string SelfEndpoint(HttpContext context, string basePath) =>
        $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}{basePath}";
}
