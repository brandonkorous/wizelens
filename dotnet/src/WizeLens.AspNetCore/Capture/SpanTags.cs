using WizeLens.Model;

namespace WizeLens.Capture;

/// <summary>Small helpers to move library tags onto the contract's attribute names.</summary>
internal static class SpanTags
{
    /// <summary>Moves <paramref name="from"/> to <paramref name="to"/> unless <paramref name="to"/> is already set.</summary>
    public static void Rename(Span span, string from, string to)
    {
        if (!span.Attributes.Remove(from, out var value)) return;
        span.Attributes.TryAdd(to, value);
    }

    public static void Remove(Span span, params string[] keys)
    {
        foreach (var key in keys) span.Attributes.Remove(key);
    }

    public static string? Text(Span span, string key) =>
        span.Attributes.GetValueOrDefault(key) is { } value ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : null;
}
