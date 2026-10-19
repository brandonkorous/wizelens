using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace WizeLens.Data;

/// <summary>Query shapes for stores without SQL parameters (Redis keys, Elasticsearch paths): ids become <c>?</c>, values are never kept.</summary>
public static partial class QueryShape
{
    /// <summary>The placeholder that replaces an id or a value.</summary>
    public const string Placeholder = "?";

    // A per-process secret, so a fingerprint cannot be turned back into the value it came from.
    private static readonly byte[] Secret = RandomNumberGenerator.GetBytes(32);

    /// <summary>"user:42:cart" becomes "user:?:cart": numbers, GUIDs, long hex, emails, and tokens become <c>?</c>.</summary>
    public static string Ids(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var shaped = EmailRegex().Replace(text, Placeholder);
        shaped = GuidRegex().Replace(shaped, Placeholder);
        shaped = HexRegex().Replace(shaped, Placeholder);
        shaped = TokenRegex().Replace(shaped, Placeholder);
        return NumberRegex().Replace(shaped, Placeholder);
    }

    /// <summary>A short keyed hash of <paramref name="raw"/>: equal inputs match within this process, and the input cannot be read back.</summary>
    public static string Fingerprint(string raw)
    {
        var hash = HMACSHA256.HashData(Secret, Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexStringLower(hash.AsSpan(0, 8));
    }

    /// <summary>The <c>wizelens.db.parameters</c> JSON for a query whose values are hidden: <c>{"fingerprint":"…"}</c>, or <c>{}</c>.</summary>
    public static string Parameters(string? raw) =>
        raw is null ? "{}" : JsonSerializer.Serialize(new Dictionary<string, string> { ["fingerprint"] = Fingerprint(raw) });

    [GeneratedRegex(@"[\w.+-]+@[\w-]+(\.[\w-]+)+", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"\b[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}\b", RegexOptions.CultureInvariant)]
    private static partial Regex GuidRegex();

    [GeneratedRegex(@"\b(?=[0-9a-fA-F]*\d)[0-9a-fA-F]{16,}\b", RegexOptions.CultureInvariant)]
    private static partial Regex HexRegex();

    [GeneratedRegex(@"(?<![\w-])(?=(?:[\w-]*\d){3})(?=[\w-]*[A-Za-z])[\w-]{20,}(?![\w-])", RegexOptions.CultureInvariant)]
    private static partial Regex TokenRegex();

    [GeneratedRegex(@"(?<![A-Za-z\d])\d+(?![A-Za-z\d])", RegexOptions.CultureInvariant)]
    private static partial Regex NumberRegex();
}
