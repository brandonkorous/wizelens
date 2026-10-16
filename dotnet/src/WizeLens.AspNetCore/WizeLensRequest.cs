using System.Diagnostics;
using WizeLens.Capture;

namespace WizeLens;

/// <summary>Adds app data to the request WizeLens is profiling right now.</summary>
public static class WizeLensRequest
{
    public const string TagPrefix = "wizelens.tag.";

    /// <summary>Tags the current request, for example Tag("cache", "hit") shows as "cache:hit". Does nothing outside a request.</summary>
    public static void Tag(string key, string? value = null)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        ServerActivity()?.SetTag(TagPrefix + key.Trim(), value ?? "");
    }

    internal static Activity? ServerActivity()
    {
        for (var activity = Activity.Current; activity is not null; activity = activity.Parent)
        {
            if (activity.Source.Name == ActivityMapper.AspNetCoreSource && activity.Kind == ActivityKind.Server) return activity;
        }
        return null;
    }
}
