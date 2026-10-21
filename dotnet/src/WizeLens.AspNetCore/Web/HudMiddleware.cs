using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Primitives;
using Microsoft.Net.Http.Headers;

namespace WizeLens.Web;

/// <summary>Puts the HUD script tag (docs/HUD-PLAN.md) before the last <c>&lt;/body&gt;</c> of the app's HTML pages; everything else passes through.</summary>
internal sealed class HudMiddleware(RequestDelegate next, WizeLensOptions options)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var prior = context.Features.Get<IHttpResponseBodyFeature>();
        if (prior is null || !Applies(context.Request, options.NormalizedBasePath) || context.WebSockets.IsWebSocketRequest)
        {
            await next(context);
            return;
        }
        var encoding = HideEncoding(context.Request);
        // Back once the app's answer reaches the HUD, so compression placed before UseWizeLens still compresses the tagged page.
        using var body = new HudBody(context, prior, () => Tag(context.Request.PathBase + options.NormalizedBasePath),
            () => { if (encoding.Count > 0) context.Request.Headers.AcceptEncoding = encoding; });
        context.Features.Set<IHttpResponseBodyFeature>(body);
        try
        {
            await next(context);
            await body.FinishAsync();
        }
        finally
        {
            context.Features.Set(prior);
        }
    }

    /// <summary>A GET outside WizeLens's own path: the only requests whose answer can take the tag.</summary>
    internal static bool Applies(HttpRequest request, string basePath) =>
        HttpMethods.IsGet(request.Method) && !request.Path.StartsWithSegments(basePath);

    /// <summary>A page load asks for plain HTML, so compression placed after UseWizeLens leaves it whole; returns the header taken off.</summary>
    private static StringValues HideEncoding(HttpRequest request)
    {
        var encoding = request.Headers.AcceptEncoding;
        if (encoding.Count == 0 || !IsPageNavigation(request)) return StringValues.Empty;
        request.Headers.Remove(HeaderNames.AcceptEncoding);
        return encoding;
    }

    /// <summary>A request whose <c>Accept</c> takes <c>text/html</c>: a page load, not a script, JSON, or asset call.</summary>
    internal static bool IsPageNavigation(HttpRequest request) =>
        MediaTypeHeaderValue.TryParseList(request.Headers.Accept, out var types)
        && types.Any(t => t.MediaType.Equals("text/html", StringComparison.OrdinalIgnoreCase) && t.Quality != 0);

    /// <summary>A 200 <c>text/html</c> answer with no <c>Content-Encoding</c>: a compressed body is left alone.</summary>
    internal static bool IsFullPage(HttpResponse response)
    {
        if (response.StatusCode != StatusCodes.Status200OK) return false;
        if (!string.IsNullOrEmpty(response.Headers.ContentEncoding.ToString())) return false;
        return MediaTypeHeaderValue.TryParse(response.ContentType, out var type)
            && type.MediaType.Equals("text/html", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>The script tag for a dashboard at <paramref name="basePath"/>, as UTF-8.</summary>
    internal static byte[] Tag(string basePath)
    {
        var path = WebUtility.HtmlEncode(basePath);
        return Encoding.UTF8.GetBytes($"""<script src="{path}/wizelens.js" data-endpoint="{path}" data-hud="true" data-source="inject" defer></script>""");
    }
}
