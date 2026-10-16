using System.Diagnostics;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Per-async-flow state. Used to stop WizeLens from profiling itself.</summary>
internal static class WizeLensContext
{
    private static readonly AsyncLocal<bool> SuppressedFlag = new();

    /// <summary>True while handling a request to WizeLens's own endpoints.</summary>
    public static bool Suppressed
    {
        get => SuppressedFlag.Value;
        set => SuppressedFlag.Value = value;
    }

    /// <summary>Custom property set on a hosting Activity that must not be stored.</summary>
    public const string IgnoreProperty = "WizeLens.Ignore";
}

/// <summary>Process-wide settings for code not created by DI, such as <see cref="Data.ProfiledDbConnection"/>.</summary>
internal static class WizeLensRuntime
{
    public const string DbSourceName = "WizeLens.Db";

    public static readonly ActivitySource DbSource = new(DbSourceName, typeof(WizeLensRuntime).Assembly.GetName().Version?.ToString());

    public static Redactor Redactor { get; set; } = new(WizeLensOptions.DefaultRedactKeys);
}
