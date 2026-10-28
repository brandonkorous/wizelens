using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WizeLens.Analysis;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Writes the contract's http.server attributes onto the request span when the request ends.</summary>
internal static class RequestEnricher
{
    public const string RequestHeaderPrefix = "http.request.header.";
    public const string ResponseHeaderPrefix = "http.response.header.";
    public const string RequestIdAttribute = "wizelens.request.id";
    public const string StreamAttribute = "wizelens.stream";
    public const string StreamFirstByteAttribute = "wizelens.stream.first_byte_ms";
    /// <summary>Activity property: ms from the request start to the response start, set when the response starts.</summary>
    public const string FirstByteProperty = "wizelens.first_byte_ms";
    private const int MaxHeaders = 50;
    private const int MaxHeaderValue = 1024;

    public static void Enrich(Activity activity, HttpContext context, Exception? failure)
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
        var expected = RequestParts.IsOn(activity.GetTagItem(RequestParts.ExpectedAttribute)) || RequestParts.IsOn(context.Response.Headers[RequestParts.ExpectedHeader].ToString());
        if (expected) activity.SetTag(RequestParts.ExpectedAttribute, true);
        if (statusCode >= 500 && !expected && activity.Status != ActivityStatusCode.Error) activity.SetStatus(ActivityStatusCode.Error, $"HTTP {statusCode}");
        MarkStream(activity, context.Response, statusCode);
        AddClient(activity, context);
        AddHeaders(activity, RequestHeaderPrefix, request.Headers);
        AddHeaders(activity, ResponseHeaderPrefix, context.Response.Headers);
    }

    /// <summary>A stream answer (server-sent events, an upgrade): its open time is not request time, so mark it and its first byte.</summary>
    internal static void MarkStream(Activity activity, HttpResponse response, int statusCode)
    {
        var type = response.ContentType ?? "";
        if (statusCode != StatusCodes.Status101SwitchingProtocols && !type.TrimStart().StartsWith("text/event-stream", StringComparison.OrdinalIgnoreCase)) return;
        activity.SetTag(StreamAttribute, true);
        if (activity.GetCustomProperty(FirstByteProperty) is double ms) activity.SetTag(StreamFirstByteAttribute, Math.Round(ms, 1));
    }

    private static void AddClient(Activity activity, HttpContext context)
    {
        var forwarded = context.Request.Headers["X-Forwarded-For"].ToString().Split(',')[0].Trim();
        var client = forwarded.Length > 0 ? forwarded : context.Connection.RemoteIpAddress?.ToString();
        if (!string.IsNullOrEmpty(client)) activity.SetTag("client.address", client);
        var userAgent = context.Request.Headers.UserAgent.ToString();
        if (userAgent.Length > 0) activity.SetTag("user_agent.original", userAgent);
        activity.SetTag(RequestIdAttribute, context.TraceIdentifier);
        if (context.User.Identity is { IsAuthenticated: true, Name: { Length: > 0 } user }) activity.SetTag("enduser.id", user);
    }

    private static void AddHeaders(Activity activity, string prefix, IHeaderDictionary headers)
    {
        var redactor = WizeLensRuntime.Redactor;
        foreach (var (name, values) in headers.Take(MaxHeaders))
        {
            var key = name.ToLowerInvariant();
            var value = (string)redactor.RedactValue(prefix + key, string.Join(", ", values.ToArray()))!;
            activity.SetTag(prefix + key, value.Length > MaxHeaderValue ? value[..MaxHeaderValue] : value);
        }
    }
}
