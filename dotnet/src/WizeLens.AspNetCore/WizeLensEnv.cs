using System.Collections.Concurrent;
using System.Globalization;

namespace WizeLens;

/// <summary>Reads WizeLens environment variables; a value it cannot read gets one warning, and the default applies.</summary>
internal static class WizeLensEnv
{
    private static readonly ConcurrentDictionary<string, byte> Warned = new();

    /// <summary>Where warnings go: standard error, or a test's sink.</summary>
    internal static Action<string> Warn { get; set; } = message => Console.Error.WriteLine("[wizelens] " + message);

    /// <summary>An on/off value: true, 1, on, yes or false, 0, off, no, in any case. Null for anything else.</summary>
    public static bool? ParseFlag(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "true" or "1" or "on" or "yes" => true,
        "false" or "0" or "off" or "no" => false,
        _ => null,
    };

    /// <summary>An on/off variable. Null when unset or blank; any other value warns once and is null, so the default applies.</summary>
    public static bool? Flag(string name)
    {
        if (Text(name) is not { } raw) return null;
        var value = ParseFlag(raw);
        if (value is null) WarnOnce(name, raw, "is not true/1/on/yes or false/0/off/no, so the default is used");
        return value;
    }

    /// <summary>A variable's trimmed value, or null when it is unset or blank.</summary>
    public static string? Text(string name) =>
        Environment.GetEnvironmentVariable(name) is { } v && !string.IsNullOrWhiteSpace(v) ? v.Trim() : null;

    /// <summary>A number variable. Null when unset or blank; anything else that is not a number warns once and is null.</summary>
    public static double? Number(string name)
    {
        if (Text(name) is not { } raw) return null;
        if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)) return value;
        WarnOnce(name, raw, "is not a number, so the default is used");
        return null;
    }

    /// <summary>A milliseconds variable that can be turned off: false when unset; blank, off, none, null or false is off (null).</summary>
    public static bool OptionalMs(string name, out double? value)
    {
        value = null;
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(raw)) return false;
        if (raw.Trim().ToLowerInvariant() is "off" or "none" or "null" or "false") return true;
        if (double.TryParse(raw.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var ms)) value = ms;
        else WarnOnce(name, raw, "is not a number of milliseconds or off, so the default is used");
        return value is not null;
    }

    /// <summary>A comma-separated variable as trimmed items; empty when unset.</summary>
    public static List<string> List(string name) =>
        [.. (Environment.GetEnvironmentVariable(name) ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];

    /// <summary>Warns once per variable and value, so a bad setting is said once, not on every app start in a test run.</summary>
    internal static void WarnOnce(string name, string value, string why)
    {
        if (Warned.TryAdd(name + "=" + value, 0)) Warn($"{name}={value} {why}.");
    }
}
