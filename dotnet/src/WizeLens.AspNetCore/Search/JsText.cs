// JavaScript's whitespace, Number() and String(), so the port reads and prints values like the TS code.
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using WizeLens.Model;

namespace WizeLens.Search;

internal static partial class JsText
{
    /// <summary>The characters of JavaScript's <c>\s</c>.</summary>
    public static bool IsSpace(char c) => c == '﻿' || (char.IsWhiteSpace(c) && c != '\u0085');

    /// <summary>JavaScript's <c>String.prototype.trim</c>.</summary>
    public static string Trim(string s)
    {
        int a = 0, b = s.Length;
        while (a < b && IsSpace(s[a])) a++;
        while (b > a && IsSpace(s[b - 1])) b--;
        return s[a..b];
    }

    /// <summary>JavaScript's <c>String(n)</c> for a number.</summary>
    public static string Number(double d)
    {
        if (d == 0) return "0";
        if (double.IsNaN(d)) return "NaN";
        if (double.IsInfinity(d)) return d > 0 ? "Infinity" : "-Infinity";
        var (digits, exp) = Digits(d.ToString("R", CultureInfo.InvariantCulture));
        var sign = d < 0 ? "-" : "";
        var abs = Math.Abs(d);
        if (abs >= 1e21 || abs < 1e-6) return sign + Exponent(digits, exp);
        if (exp >= digits.Length - 1) return sign + digits + new string('0', exp - digits.Length + 1);
        if (exp >= 0) return sign + digits[..(exp + 1)] + "." + digits[(exp + 1)..];
        return sign + "0." + new string('0', -exp - 1) + digits;
    }

    /// <summary>The significant digits of a shortest round-trip text, and the power of ten of the first one.</summary>
    private static (string Digits, int Exp) Digits(string s)
    {
        s = s.TrimStart('-');
        var e = s.IndexOf('E');
        var exp = e < 0 ? 0 : int.Parse(s[(e + 1)..], CultureInfo.InvariantCulture);
        var mantissa = e < 0 ? s : s[..e];
        var dot = mantissa.IndexOf('.');
        var intPart = dot < 0 ? mantissa : mantissa[..dot];
        var all = intPart + (dot < 0 ? "" : mantissa[(dot + 1)..]);
        var lead = all.Length - all.TrimStart('0').Length;
        var digits = all.Trim('0');
        return (digits.Length == 0 ? "0" : digits, exp + intPart.Length - 1 - lead);
    }

    private static string Exponent(string digits, int exp)
    {
        var m = digits.Length == 1 ? digits : digits[..1] + "." + digits[1..];
        return m + "e" + (exp >= 0 ? "+" : "-") + Math.Abs(exp).ToString(CultureInfo.InvariantCulture);
    }

    [GeneratedRegex(@"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")]
    private static partial Regex DecimalLiteral();

    [GeneratedRegex(@"^0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$")]
    private static partial Regex PrefixedLiteral();

    /// <summary>JavaScript's <c>Number(s)</c> for a string: NaN when it is not a number.</summary>
    public static double ParseNumber(string s)
    {
        s = Trim(s);
        if (s.Length == 0) return 0;
        if (s is "Infinity" or "+Infinity") return double.PositiveInfinity;
        if (s is "-Infinity") return double.NegativeInfinity;
        if (DecimalLiteral().IsMatch(s)) return double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture);
        var m = PrefixedLiteral().Match(s);
        if (!m.Success) return double.NaN;
        var radix = char.ToLowerInvariant(m.Groups[1].Value[0]) switch { 'x' => 16, 'o' => 8, _ => 2 };
        return m.Groups[1].Value[1..].Aggregate(0d, (n, c) => n * radix + Convert.ToInt32(c.ToString(), 16));
    }

    /// <summary>JavaScript's <c>Number(v)</c> for a stored value.</summary>
    public static double ToNumber(object? v) => AttributeValue.Normalize(v) switch
    {
        null => 0,
        bool b => b ? 1 : 0,
        long l => l,
        double d => d,
        string s => ParseNumber(s),
        _ => double.NaN,
    };

    /// <summary>JavaScript's <c>String(v)</c> for a stored value.</summary>
    public static string Of(object? v) => AttributeValue.Normalize(v) switch
    {
        null => "null",
        string s => s,
        bool b => b ? "true" : "false",
        long l => l.ToString(CultureInfo.InvariantCulture),
        double d => Number(d),
        var other => other.ToString() ?? "",
    };

    /// <summary>True for a JavaScript number: a long or a double after normalizing.</summary>
    public static bool IsNumber(object? v, out double n)
    {
        var value = AttributeValue.Normalize(v);
        n = value switch { long l => l, double d => d, _ => 0 };
        return value is long or double;
    }

    /// <summary>JavaScript's <c>JSON.stringify</c> for a string.</summary>
    public static string JsonString(string s)
    {
        var sb = new StringBuilder("\"");
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            if (char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
            {
                sb.Append(c).Append(s[++i]);
                continue;
            }
            sb.Append(c switch
            {
                '"' => "\\\"", '\\' => "\\\\", '\b' => "\\b", '\f' => "\\f", '\n' => "\\n", '\r' => "\\r", '\t' => "\\t",
                _ when c < ' ' || char.IsSurrogate(c) => $"\\u{(int)c:x4}",
                _ => c.ToString(),
            });
        }
        return sb.Append('"').ToString();
    }

    /// <summary>JavaScript's <c>atob</c>: forgiving base64, with or without padding. Throws a FormatException when it is broken.</summary>
    public static byte[] Atob(string s)
    {
        var t = new string([.. s.Where(c => c is not ('\t' or '\n' or '\f' or '\r' or ' '))]);
        if (t.Length % 4 == 0 && t.EndsWith("==", StringComparison.Ordinal)) t = t[..^2];
        else if (t.Length % 4 == 0 && t.EndsWith('=')) t = t[..^1];
        if (t.Length % 4 == 1 || !t.All(c => char.IsAsciiLetterOrDigit(c) || c is '+' or '/')) throw new FormatException("Not base64.");
        return Convert.FromBase64String(t + new string('=', (4 - t.Length % 4) % 4));
    }
}
