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
        new("signed-token", t => t.Contains("eyJ", StringComparison.Ordinal), SignedToken()),
        new("aws-key", t => t.Contains("AKIA", StringComparison.Ordinal) || t.Contains("ASIA", StringComparison.Ordinal), AwsKey()),
        new("stripe-key", t => t.Contains("_live_", StringComparison.Ordinal) || t.Contains("_test_", StringComparison.Ordinal) || t.Contains("whsec_", StringComparison.Ordinal), StripeKey()),
        new("github-token", t => t.Contains("gh", StringComparison.Ordinal) || t.Contains("github_pat_", StringComparison.Ordinal), GitHubToken()),
        new("slack-token", t => t.Contains("xox", StringComparison.Ordinal), SlackToken()),
        new("google-key", t => t.Contains("AIza", StringComparison.Ordinal), GoogleKey()),
        new("card", t => FourDigits().IsMatch(t), Card()),
    ];

    public static string Marker(string kind) => $"[redacted:{kind}]";

    /// <summary>The text with every secret found by pattern replaced by its marker. The card pattern skips values of count and id keys.</summary>
    public static string RedactText(string text, string key = "")
    {
        var output = text;
        foreach (var p in Patterns)
        {
            if (!p.Hint(output) || p.Kind == "card" && key.Length > 0 && CardNumbers.IsNumericKey(key)) continue;
            var whole = output;
            output = p.Re.Replace(output, m => p.Kind != "card" || IsCardAt(m, whole) ? Marker(p.Kind) : m.Value);
        }
        return output;
    }

    private static bool IsCardAt(Match m, string text) => IsCardNumber(m.Value) && !CardNumbers.NumericContext(text, m.Index, m.Length);

    /// <summary>True for an attribute key whose values are ids and sampling numbers, never secrets (a baggage <c>sample_rand</c> passes Luhn).</summary>
    public static bool SkipsValuePatterns(string key) => PatternFreeKey().IsMatch(key.ToLowerInvariant());

    /// <summary>A card brand's prefix and length, Luhn valid.</summary>
    public static bool IsCardNumber(string match) => CardNumbers.IsCardNumber(match);

    public static bool LuhnValid(string digits) => CardNumbers.LuhnValid(digits);

    [GeneratedRegex(@"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)", Ascii)]
    private static partial Regex PrivateKey();

    [GeneratedRegex(@"\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}", Ascii)]
    private static partial Regex Jwt();

    [GeneratedRegex(@"\beyJ[\w-]{10,}\.[\w-]{20,}", Ascii)]
    private static partial Regex SignedToken();

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
