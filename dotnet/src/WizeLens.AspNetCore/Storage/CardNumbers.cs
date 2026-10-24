using System.Text.RegularExpressions;

namespace WizeLens.Storage;

/// <summary>Card numbers: a brand's prefix and length, a valid Luhn sum, and no sign of a count or an id; the same as core/src/redact-card.ts.</summary>
internal static partial class CardNumbers
{
    private static readonly (Regex Prefix, int[] Lengths)[] Brands =
    [
        (Visa(), [13, 16, 19]),
        (Mastercard(), [16]),
        (Amex(), [15]),
        (Diners(), [14, 15, 16, 17, 18, 19]),
        (Jcb(), [16, 17, 18, 19]),
        (Discover(), [16, 17, 18, 19]),
        (UnionPay(), [16, 17, 18, 19]),
    ];

    /// <summary>A brand's prefix and length, and Luhn valid.</summary>
    public static bool IsCardNumber(string match)
    {
        var digits = match.Replace(" ", "").Replace("-", "");
        return Brands.Any(b => b.Prefix.IsMatch(digits) && b.Lengths.Contains(digits.Length)) && LuhnValid(digits);
    }

    public static bool LuhnValid(string digits)
    {
        var sum = 0;
        for (var i = 0; i < digits.Length; i++)
        {
            var d = digits[digits.Length - 1 - i] - '0';
            if (i % 2 == 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
            sum += d;
        }
        return sum % 10 == 0;
    }

    /// <summary>True for a key whose value is a number of something or an id, so the card pattern skips it.</summary>
    public static bool IsNumericKey(string key) => NumericKey().IsMatch(key);

    /// <summary>True when a digit run is part of a decimal number or follows a count or id label.</summary>
    public static bool NumericContext(string text, int at, int length)
    {
        var before = text[Math.Max(0, at - 40)..at];
        var end = at + length;
        var after = text[end..Math.Min(text.Length, end + 2)];
        return DecimalBefore().IsMatch(before) || DecimalAfter().IsMatch(after) || NumericLabel().IsMatch(before);
    }

    [GeneratedRegex(@"^4", RegexOptions.ECMAScript)] private static partial Regex Visa();
    [GeneratedRegex(@"^(?:5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)", RegexOptions.ECMAScript)] private static partial Regex Mastercard();
    [GeneratedRegex(@"^3[47]", RegexOptions.ECMAScript)] private static partial Regex Amex();
    [GeneratedRegex(@"^3(?:0[0-5]|[689])", RegexOptions.ECMAScript)] private static partial Regex Diners();
    [GeneratedRegex(@"^35(?:2[89]|[3-8]\d)", RegexOptions.ECMAScript)] private static partial Regex Jcb();
    [GeneratedRegex(@"^6(?:011|4[4-9]|5)", RegexOptions.ECMAScript)] private static partial Regex Discover();
    [GeneratedRegex(@"^62", RegexOptions.ECMAScript)] private static partial Regex UnionPay();
    [GeneratedRegex(@"\d[.,]$", RegexOptions.ECMAScript)] private static partial Regex DecimalBefore();
    [GeneratedRegex(@"^[.,]\d", RegexOptions.ECMAScript)] private static partial Regex DecimalAfter();

    [GeneratedRegex(@"(?:^|[._-])(?:count|counts|total|sum|size|length|len|rows|bytes|ms|seconds|duration|slots|qty|quantity|amount|offset|limit|seq|version|timestamp|time|id|ids|uuid|rand|random|seed|nonce)$", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex NumericKey();

    [GeneratedRegex(@"(?:count|total|sum|size|length|rows|bytes|ms|slots|qty|quantity|amount|offset|limit|seq|version|timestamp|id|ids|rand|seed|nonce)[""']?\s*[:=]\s*[""']?$", RegexOptions.ECMAScript | RegexOptions.IgnoreCase)]
    private static partial Regex NumericLabel();
}
