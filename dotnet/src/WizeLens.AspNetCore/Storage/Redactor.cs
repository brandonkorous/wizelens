using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>Replaces secret values with "[redacted]" before anything is stored; keeps the evidence docs/CONTRACT.md "Redaction" names.</summary>
internal sealed partial class Redactor(IEnumerable<string> keys)
{
    public const string Redacted = "[redacted]";

    /// <summary>The default keys, for rules that judge a key by them (docs/CONTRACT.md "Security analysis").</summary>
    public static readonly Redactor Defaults = new(WizeLensOptions.DefaultRedactKeys);

    private readonly string[] _keys = [.. keys.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.ToLowerInvariant())];

    public bool IsSensitive(string key)
    {
        foreach (var k in _keys)
        {
            if (key.Contains(k, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    /// <summary>One attribute value as stored: by its key first, then secrets found inside the text.</summary>
    public object? RedactValue(string key, object? value)
    {
        value = AttributeValue.Normalize(value);
        if (value is null) return null;
        var k = key.ToLowerInvariant();
        if (value is not string text) return IsSensitive(k) ? Redacted : value;
        if (k == "set-cookie" || k.EndsWith(".set-cookie", StringComparison.Ordinal)) return text == Redacted ? text : RedactSetCookie(text);
        if (IsSensitive(k)) return Redacted;
        if (k == "url.query") return ValuePatterns.RedactText(RedactQueryString(text));
        if (k == "url.full") return ValuePatterns.RedactText(RedactUrl(text));
        return ValuePatterns.RedactText(text);
    }

    /// <summary>A query string with the values of sensitive keys replaced: <c>token=[redacted]</c>.</summary>
    public string RedactQueryString(string query)
    {
        var pairs = query.Split('&');
        for (var i = 0; i < pairs.Length; i++)
        {
            var eq = pairs[i].IndexOf('=');
            if (eq >= 0 && IsSensitive(Uri.UnescapeDataString(pairs[i][..eq]))) pairs[i] = pairs[i][..(eq + 1)] + Redacted;
        }
        return string.Join('&', pairs);
    }

    public string RedactUrl(string url)
    {
        var index = url.IndexOf('?');
        return index < 0 ? url : url[..(index + 1)] + RedactQueryString(url[(index + 1)..]);
    }

    /// <summary>Each cookie's value hidden, its name and flags kept: <c>sid=[redacted]; Path=/; HttpOnly</c>.</summary>
    public static string RedactSetCookie(string value) => string.Join(", ", SplitSetCookie(value).Select(cookie =>
    {
        var semi = cookie.IndexOf(';');
        var head = semi < 0 ? cookie : cookie[..semi];
        var eq = head.IndexOf('=');
        return $"{(eq < 0 ? head : head[..eq]).Trim()}={Redacted}{(semi < 0 ? "" : cookie[semi..])}";
    }));

    /// <summary>Cookies in one value: split at ", " before the next <c>name=</c>, so an Expires date stays whole.</summary>
    public static string[] SplitSetCookie(string value) => CookieSplit().Split(value);

    public Dictionary<string, object?> Redact(Dictionary<string, object?> attributes)
    {
        foreach (var key in attributes.Keys.ToList()) attributes[key] = RedactValue(key, attributes[key]);
        return attributes;
    }

    public Span Redact(Span span)
    {
        Redact(span.Attributes);
        foreach (var e in span.Events) Redact(e.Attributes);
        if (span.StatusMessage is { } message) span.StatusMessage = ValuePatterns.RedactText(message);
        return span;
    }

    public LogRecord Redact(LogRecord log)
    {
        Redact(log.Attributes);
        log.Message = ValuePatterns.RedactText(log.Message);
        return log;
    }

    [GeneratedRegex(@",\s*(?=[^;,\s=]+=)", RegexOptions.ECMAScript)]
    private static partial Regex CookieSplit();
}
