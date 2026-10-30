using System.Diagnostics;
using WizeLens.Analysis;
using WizeLens.Capture;

namespace WizeLens;

/// <summary>Adds app data to the request WizeLens is profiling right now.</summary>
public static class WizeLensRequest
{
    internal const string TagPrefix = "wizelens.tag.";

    /// <summary>Tags the current request, for example Tag("cache", "hit") shows as "cache:hit". Does nothing outside a request.</summary>
    public static void Tag(string key, string? value = null)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        ServerActivity()?.SetTag(TagPrefix + key.Trim(), value ?? "");
    }

    /// <summary>Marks the current request's answer as expected, for example a deliberate 503: a 5xx is then not a failure. An exception still is. Does nothing outside a request.</summary>
    public static void Expected() => ServerActivity()?.SetTag(RequestParts.ExpectedAttribute, true);

    internal static Activity? ServerActivity()
    {
        for (var activity = Activity.Current; activity is not null; activity = activity.Parent)
        {
            if (activity.Source.Name == ActivityMapper.AspNetCoreSource && activity.Kind == ActivityKind.Server) return activity;
        }
        return null;
    }
}
