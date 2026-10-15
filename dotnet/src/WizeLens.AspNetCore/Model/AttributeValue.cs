using System.Globalization;
using System.Text.Json;

namespace WizeLens.Model;

internal static class AttributeValue
{
    /// <summary>Converts any value into the contract's allowed types: string, number, bool or null.</summary>
    public static object? Normalize(object? value) => value switch
    {
        null or DBNull => null,
        string or bool or double or long => value,
        int or short or byte or sbyte or ushort or uint => Convert.ToInt64(value, CultureInfo.InvariantCulture),
        ulong u => u <= long.MaxValue ? (long)u : (double)u,
        float or decimal => Convert.ToDouble(value, CultureInfo.InvariantCulture),
        byte[] bytes => $"[binary {bytes.Length} bytes]",
        DateTime dt => dt.ToString("O", CultureInfo.InvariantCulture),
        DateTimeOffset dto => dto.ToString("O", CultureInfo.InvariantCulture),
        JsonElement el => FromJson(el),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString(),
    };

    public static string? AsString(object? value) => Normalize(value) switch
    {
        null => null,
        string s => s,
        bool b => b ? "true" : "false",
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        var other => other.ToString(),
    };

    public static double? AsDouble(object? value) => Normalize(value) switch
    {
        long l => l,
        double d => d,
        string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    private static object? FromJson(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.String => el.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        _ => el.GetRawText(),
    };
}
