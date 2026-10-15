using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WizeLens.Capture;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>
/// Enriches the request span, records exceptions, and adds WizeLens response headers.
/// Requests to WizeLens's own base path are not profiled.
/// </summary>
internal sealed class WizeLensMiddleware(RequestDelegate next, WizeLensOptions options, TraceStore store)
{
    public const string TraceHeader = "X-WizeLens-Trace";
    public const string EndpointHeader = "X-WizeLens-Endpoint";
    public const string HopHeader = "X-WizeLens-Hop";

    public async Task InvokeAsync(HttpContext context)
    {
        var basePath = options.NormalizedBasePath;
        var activity = Activity.Current;

        if (context.Request.Path.StartsWithSegments(basePath))
        {
            activity?.SetCustomProperty(WizeLensContext.IgnoreProperty, true);
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
            return;
        }

        var selfEndpoint = SelfEndpoint(context, basePath);
        store.AddSelfEndpoint(selfEndpoint);

        if (activity is not null)
        {
            var traceId = activity.TraceId.ToHexString();
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers[TraceHeader] = traceId;
                headers[EndpointHeader] = selfEndpoint;
                headers.Append("Access-Control-Expose-Headers", $"{TraceHeader}, {EndpointHeader}");
                return Task.CompletedTask;
            });
        }

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
            if (activity is not null) Enrich(activity, context, failure);
        }
    }

    private static void Enrich(Activity activity, HttpContext context, Exception? failure)
    {
        var request = context.Request;
        var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
        if (route is not null && !route.StartsWith('/')) route = "/" + route;
        var statusCode = failure is null ? context.Response.StatusCode : StatusCodes.Status500InternalServerError;

        activity.SetTag("http.request.method", request.Method);
        activity.SetTag("url.scheme", request.Scheme);
        activity.SetTag("url.path", request.PathBase.Add(request.Path).Value);
        if (request.QueryString.HasValue) activity.SetTag("url.query", request.QueryString.Value!.TrimStart('?'));
        if (route is not null) activity.SetTag("http.route", route);
        activity.SetTag("server.address", request.Host.Host);
        if (request.Host.Port is { } port) activity.SetTag("server.port", port);
        activity.SetTag("http.response.status_code", statusCode);
        activity.DisplayName = $"{request.Method} {route ?? request.Path.Value}";
        if (statusCode >= 500 && activity.Status != ActivityStatusCode.Error)
        {
            activity.SetStatus(ActivityStatusCode.Error);
        }
    }

    private static string SelfEndpoint(HttpContext context, string basePath) =>
        $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}{basePath}";
}
