using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace WizeLens.AutoInstrumentation;

/// <summary>Puts exceptions that the exception page or handler caught on the request span; the auto middleware sits outside them.</summary>
internal sealed class ExceptionObserver(WizeLensInstall install, WizeLensOptions options)
    : DiagnosticObserver(install, options, "Microsoft.AspNetCore")
{
    protected override bool Wants(string name) => name.EndsWith("Exception", StringComparison.Ordinal);

    protected override void OnEvent(string name, object? payload)
    {
        if (Read<Exception>(payload, "exception") is not { } exception) return;
        var context = Read<HttpContext>(payload, "httpContext");
        var activity = context?.Features.Get<IHttpActivityFeature>()?.Activity ?? Activity.Current;
        if (activity is null || AlreadyRecorded(activity, exception)) return;
        activity.AddException(exception);
        activity.SetStatus(ActivityStatusCode.Error, exception.Message);
    }

    private static bool AlreadyRecorded(Activity activity, Exception exception) =>
        activity.Events.Any(e => e.Name == "exception" && e.Tags.Any(t => t.Key == "exception.message" && Equals(t.Value, exception.Message)));
}
