using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using WizeLens.Analysis;

namespace WizeLens.Capture;

/// <summary>An exception an inner middleware caught and answered with a 5xx (the developer exception page, UseExceptionHandler): the request span never saw it thrown, so it is added here.</summary>
internal static class CaughtException
{
    public const string ItemKey = "WizeLens.HandlerException";

    public static void Record(Activity activity, HttpContext context)
    {
        if (context.Response.StatusCode < StatusCodes.Status500InternalServerError) return;
        if (RequestParts.IsOn(context.Response.Headers[RequestParts.ExpectedHeader].ToString())) return;
        var error = context.Items[ItemKey] as Exception ?? context.Features.Get<IExceptionHandlerFeature>()?.Error;
        // The auto install's request span can already have it: ASP.NET adds it to the hosting activity.
        if (error is null || activity.Events.Any(e => e.Name == "exception")) return;
        activity.AddException(error);
        activity.SetStatus(ActivityStatusCode.Error, error.Message);
    }
}
