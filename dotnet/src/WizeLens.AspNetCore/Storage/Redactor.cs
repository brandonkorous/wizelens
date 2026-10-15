using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>Replaces secret values with "[redacted]" before anything is stored.</summary>
internal sealed class Redactor(IEnumerable<string> keys)
{
    public const string Redacted = "[redacted]";

    private readonly string[] _keys = [.. keys.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.ToLowerInvariant())];

    public bool IsSensitive(string key)
    {
        foreach (var k in _keys)
        {
            if (key.Contains(k, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    public Dictionary<string, object?> Redact(Dictionary<string, object?> attributes)
    {
        foreach (var key in attributes.Keys.ToList())
        {
            attributes[key] = IsSensitive(key) ? Redacted : AttributeValue.Normalize(attributes[key]);
        }
        return attributes;
    }

    public Span Redact(Span span)
    {
        Redact(span.Attributes);
        foreach (var e in span.Events) Redact(e.Attributes);
        return span;
    }

    public LogRecord Redact(LogRecord log)
    {
        Redact(log.Attributes);
        return log;
    }
}
