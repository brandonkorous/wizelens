using Microsoft.AspNetCore.Http;

namespace WizeLens.Web;

/// <summary>A file served as it is (an image, font, script or style sheet): no endpoint ran and it succeeded.</summary>
internal static class StaticFileRequests
{
    public static bool IsServedFile(HttpContext context, Exception? failure)
    {
        if (failure is not null || context.GetEndpoint() is not null) return false;
        if (!Path.HasExtension(context.Request.Path.Value)) return false;
        var status = context.Response.StatusCode;
        if (status is not (StatusCodes.Status200OK or StatusCodes.Status206PartialContent or StatusCodes.Status304NotModified)) return false;
        // An HTML page is a page the visitor sees, and it carries the HUD: keep it.
        return context.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) != true;
    }
}
