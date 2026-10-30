// Field values: wildcards, numbers, durations, statuses, and levels, checked against the field's type.
using System.Globalization;
using System.Text.RegularExpressions;

namespace WizeLens.Search;

/// <summary>A value that failed its field's type; the parser adds the position.</summary>
internal sealed class ValueError(string message) : Exception(message);

internal static partial class SearchValues
{
    [GeneratedRegex(@"^((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:e[+-]?[0-9]+)?)(us|µs|ms|s|m|h)?\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Duration();

    [GeneratedRegex(@"^-?([0-9]+(?:\.[0-9]+)?|\.[0-9]+)(e[+-]?[0-9]+)?\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex NumberText();

    [GeneratedRegex(@"^[1-5]xx\z")]
    private static partial Regex StatusClass();

    [GeneratedRegex(@"^[0-9]{3}\z")]
    private static partial Regex StatusCode();

    private static readonly Dictionary<string, double> UnitMs = new(StringComparer.Ordinal)
    {
        ["us"] = 0.001, ["µs"] = 0.001, ["ms"] = 1, ["s"] = 1000, ["m"] = 60_000, ["h"] = 3_600_000,
    };

    private static readonly Dictionary<string, string> LevelAliases = new(StringComparer.Ordinal)
    {
        ["warning"] = "warn", ["err"] = "error", ["fatal"] = "critical", ["crit"] = "critical",
    };

    private static readonly HashSet<string> SpanStatuses = new(StringComparer.Ordinal) { "ok", "error", "unset" };

    /// <summary>Field types that take ranges (a..b) and comparisons.</summary>
    internal static readonly HashSet<FieldType> Ordered = [FieldType.Status, FieldType.Duration, FieldType.Level];

    /// <summary>Wildcard pieces when the value has an unquoted <c>*</c>; else null.</summary>
    public static List<string?>? PiecesOf(IReadOnlyList<Ch> chars)
    {
        if (!chars.Any(ch => ch.C == '*' && !ch.Lit)) return null;
        var output = new List<string?>();
        var cur = "";
        foreach (var ch in chars)
        {
            if (ch.C == '*' && !ch.Lit)
            {
                if (cur.Length > 0) output.Add(cur);
                if (output.Count == 0 || output[^1] is not null) output.Add(null);
                cur = "";
            }
            else cur += ch.C;
        }
        if (cur.Length > 0) output.Add(cur);
        return output;
    }

    /// <summary>Milliseconds from "250ms", "1.5s", "2m", or a bare number (ms).</summary>
    public static double DurationMs(string s)
    {
        var m = Duration().Match(JsText.Trim(s));
        if (!m.Success) throw new ValueError($"\"{s}\" is not a duration. Use 250ms, 1.5s, or 2m.");
        var unit = m.Groups[2].Success ? m.Groups[2].Value.ToLowerInvariant() : "ms";
        return double.Parse(m.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture) * UnitMs.GetValueOrDefault(unit, double.NaN);
    }

    public static string LevelOf(string s)
    {
        var v = s.ToLowerInvariant();
        var level = LevelAliases.GetValueOrDefault(v) ?? SearchFields.LogLevels.FirstOrDefault(l => l == v);
        return level ?? throw new ValueError($"\"{s}\" is not a log level. Use {string.Join(", ", SearchFields.LogLevels)}.");
    }

    private static SearchValue StatusValue(string s, string cmp)
    {
        var v = s.ToLowerInvariant();
        if (cmp == SearchCmp.Eq && SpanStatuses.Contains(v)) return new SpanStatusValue(v);
        if (cmp == SearchCmp.Eq && StatusClass().IsMatch(v)) return new StatusClassValue(v[0] - '0');
        if (StatusCode().IsMatch(v)) return new NumberValue(double.Parse(v, CultureInfo.InvariantCulture));
        throw new ValueError($"\"{s}\" is not a status. Use 404, 5xx, ok, error, or unset.");
    }

    private static SearchValue BoolValueOf(string s)
    {
        var v = s.ToLowerInvariant();
        if (v is "true" or "false") return new BoolValue(v == "true");
        throw new ValueError($"\"{s}\" is not true or false.");
    }

    /// <summary>A text or id value: exact, or a pattern. Text fields cannot be compared with &lt; or &gt;.</summary>
    private static SearchValue TextValue(IReadOnlyList<Ch> chars, string cmp, FieldType type)
    {
        if (cmp != SearchCmp.Eq) throw new ValueError($"This field holds {(type == FieldType.Id ? "ids" : "text")}. It cannot use {cmp}.");
        var pieces = PiecesOf(chars);
        return pieces is not null ? new PatternValue(pieces) : new StringValue(SearchLexer.Text(chars));
    }

    /// <summary>The value of <c>field:value</c> for a known field of <paramref name="type"/>.</summary>
    internal static SearchValue FieldValue(FieldType type, IReadOnlyList<Ch> chars, string cmp)
    {
        var s = SearchLexer.Text(chars);
        if (type is FieldType.Text or FieldType.Id) return TextValue(chars, cmp, type);
        if (type == FieldType.Duration) return new NumberValue(DurationMs(s));
        if (type == FieldType.Status) return StatusValue(s, cmp);
        if (type == FieldType.Level) return new LevelValue(LevelOf(s));
        if (cmp != SearchCmp.Eq) throw new ValueError("true or false cannot use < or >.");
        return BoolValueOf(s);
    }

    /// <summary>The value of <c>@key:value</c>: text or a pattern for =, a number for comparisons.</summary>
    internal static SearchValue AttrValue(IReadOnlyList<Ch> chars, string cmp)
    {
        var s = SearchLexer.Text(chars);
        if (cmp == SearchCmp.Eq) return TextValue(chars, cmp, FieldType.Text);
        if (!NumberText().IsMatch(s)) throw new ValueError($"{cmp} needs a number, not \"{s}\".");
        return new NumberValue(double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture));
    }
}
