using System.Text.RegularExpressions;

namespace WizeLens.Storage;

/// <summary>Secrets found inside any text become a typed marker such as "[redacted:jwt]"; the same patterns as core/src/redact-values.ts.</summary>
internal static partial class ValuePatterns
{
    private sealed record Pattern(string Kind, Func<string, bool> Hint, Regex Re);

    private const RegexOptions Ascii = RegexOptions.ECMAScript;

    private static readonly Pattern[] Patterns =
    [
        new("private-key", t => t.Contains("PRIVATE KEY-----", StringComparison.Ordinal), PrivateKey()),
        new("jwt", t => t.Contains("eyJ", StringComparison.Ordinal), Jwt()),
        new("aws-key", t => t.Contains("AKIA", StringComparison.Ordinal) || t.Contains("ASIA", StringComparison.Ordinal), AwsKey()),
        new("stripe-key", t => t.Contains("_live_", StringComparison.Ordinal) || t.Contains("_test_", StringComparison.Ordinal) || t.Contains("whsec_", StringComparison.Ordinal), StripeKey()),
        new("github-token", t => t.Contains("gh", StringComparison.Ordinal) || t.Contains("github_pat_", StringComparison.Ordinal), GitHubToken()),
        new("slack-token", t => t.Contains("xox", StringComparison.Ordinal), SlackToken()),
        new("google-key", t => t.Contains("AIza", StringComparison.Ordinal), GoogleKey()),
        new("card", t => FourDigits().IsMatch(t), Card()),
    ];

    public static string Marker(string kind) => $"[redacted:{kind}]";

    /// <summary>The text with every secret found by pattern replaced by its marker.</summary>
    public static string RedactText(string text)
    {
        var output = text;
        foreach (var p in Patterns)
        {
            if (!p.Hint(output)) continue;
            output = p.Re.Replace(output, m => p.Kind != "card" || IsCardNumber(m.Value) ? Marker(p.Kind) : m.Value);
        }
        return output;
    }

    /// <summary>True for an attribute key whose values are ids and sampling numbers, never secrets (a baggage <c>sample_rand</c> passes Luhn).</summary>
    public static bool SkipsValuePatterns(string key) => PatternFreeKey().IsMatch(key.ToLowerInvariant());

    /// <summary>13 to 19 digits, the first 3 to 6, Luhn valid.</summary>
    public static bool IsCardNumber(string match)
    {
        var digits = match.Replace(" ", "").Replace("-", "");
        return digits.Length is >= 13 and <= 19 && digits[0] is >= '3' and <= '6' && LuhnValid(digits);
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

    [GeneratedRegex(@"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)", Ascii)]
    private static partial Regex PrivateKey();

    [GeneratedRegex(@"\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}", Ascii)]
    private static partial Regex Jwt();

    [GeneratedRegex(@"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", Ascii)]
    private static partial Regex AwsKey();

    [GeneratedRegex(@"\b(?:(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|whsec_[0-9A-Za-z]{20,})\b", Ascii)]
    private static partial Regex StripeKey();

    [GeneratedRegex(@"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b", Ascii)]
    private static partial Regex GitHubToken();

    [GeneratedRegex(@"\bxox[abprs]-[A-Za-z0-9-]{10,}\b", Ascii)]
    private static partial Regex SlackToken();

    [GeneratedRegex(@"\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])", Ascii)]
    private static partial Regex GoogleKey();

    [GeneratedRegex(@"\b\d(?:[ -]?\d){12,18}\b", Ascii)]
    private static partial Regex Card();

    [GeneratedRegex(@"(?:^|\.)(?:baggage|traceparent|tracestate|(?:trace|span|parent_span|request)[._]?id)$", Ascii)]
    private static partial Regex PatternFreeKey();

    [GeneratedRegex(@"\d{4}", Ascii)]
    private static partial Regex FourDigits();
}
