using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;

namespace WizeLens.Capture;

/// <summary>Wraps an endpoint so its handler (minimal API delegate or MVC action) runs inside a "handler" span.</summary>
internal static class HandlerSpan
{
    public const string SourceName = "WizeLens.Handler";
    public const string LayerAttribute = "wizelens.layer";
    public const string HandlerLayer = "handler";

    private static readonly ActivitySource Source = new(SourceName);

    public static Endpoint Wrap(Endpoint endpoint)
    {
        var inner = endpoint.RequestDelegate!;
        RequestDelegate wrapped = context => RunAsync(inner, context, NameOf(endpoint, context.Request.Method));
        return endpoint is RouteEndpoint route
            ? new RouteEndpoint(wrapped, route.RoutePattern, route.Order, route.Metadata, route.DisplayName)
            : new Endpoint(wrapped, endpoint.Metadata, endpoint.DisplayName);
    }

    internal static string NameOf(Endpoint endpoint, string method)
    {
        if (endpoint.Metadata.GetMetadata<ControllerActionDescriptor>() is { } action)
        {
            return $"{action.ControllerTypeInfo.Name}.{action.ActionName}";
        }
        var pattern = (endpoint as RouteEndpoint)?.RoutePattern.RawText;
        if (pattern is null) return $"Handler {endpoint.DisplayName}";
        return $"Handler {method} {(pattern.StartsWith('/') ? pattern : "/" + pattern)}";
    }

    private static async Task RunAsync(RequestDelegate inner, HttpContext context, string name)
    {
        using var activity = Source.StartActivity(name, ActivityKind.Internal);
        activity?.SetTag(LayerAttribute, HandlerLayer);
        // The exception is recorded once, on the request span, so errors are not counted twice.
        try
        {
            await inner(context).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Kept for the request span: an exception page inside WizeLens answers 500 and the exception never reaches it.
            context.Items[CaughtException.ItemKey] = ex;
            throw;
        }
    }
}
