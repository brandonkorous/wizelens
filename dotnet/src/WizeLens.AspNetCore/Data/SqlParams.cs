using System.Globalization;
using System.Text.RegularExpressions;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Data;

/// <summary>Which column each SQL parameter is bound to, so its value can be redacted by that column's name; the same rule as core/src/redact-sql-params.ts.</summary>
internal static partial class SqlParams
{
    /// <summary>Column names whose values are never kept in SQL parameters, besides the redact keys: personal data, and ASP.NET Identity's SecurityStamp (it signs a user's sign-in cookies).</summary>
    public static readonly string[] SqlParamKeys = ["email", "securitystamp", "security_stamp"];

    private static readonly Redactor Personal = new(SqlParamKeys);

    // One placeholder: $1, @name, :name (not a :: cast), %(name)s; `?` and `%s` are numbered first.
    private const string Placeholder = @"(?:\$(\d+)|(?<![:\w])[@:]([A-Za-z_]\w*)|%\((\w+)\)s)";

    /// <summary>The parameters as stored, by name or <c>p0</c>, <c>p1</c>… by position: redacted by name or by the column <paramref name="sql"/> binds them to.</summary>
    public static Dictionary<string, object?> Redact(Redactor redactor, string sql, IEnumerable<(string? Name, object? Value)> parameters)
    {
        var columns = Columns(sql);
        var values = new Dictionary<string, object?>();
        var position = 0;
        foreach (var (name, value) in parameters)
        {
            var named = !string.IsNullOrEmpty(name);
            var column = columns.GetValueOrDefault(named ? Unsigiled(name!) : Key(position));
            values[named ? name! : $"p{position}"] = Value(redactor, value, named ? name : null, column);
            position++;
        }
        return values;
    }

    /// <summary>One value: redacted when its name or its column is sensitive, else with secrets found by pattern replaced.</summary>
    private static object? Value(Redactor redactor, object? value, params string?[] names)
    {
        if (names.Any(n => !string.IsNullOrEmpty(n) && (redactor.IsSensitive(n) || Personal.IsSensitive(n)))) return Redactor.Redacted;
        value = AttributeValue.Normalize(value);
        return value is string text ? ValuePatterns.RedactText(text) : value;
    }

    /// <summary>The column each parameter is compared with or set to, by key: the zero-based position for <c>$1</c>, <c>?</c>, <c>%s</c>, else the name: <c>"t"."token" = $1</c> gives "0" → token.</summary>
    public static Dictionary<string, string> Columns(string sql)
    {
        var text = Normalized(sql);
        var output = new Dictionary<string, string>();
        foreach (Match m in ComparedRegex().Matches(text)) output[KeyOf(m, 2)] = Bare(m.Groups[1].Value);
        InsertColumns(text, output);
        return output;
    }

    /// <summary>Columns of <c>insert into t (a, b) values ($1, default, @b)</c>, by parameter key.</summary>
    private static void InsertColumns(string sql, Dictionary<string, string> output)
    {
        var m = InsertRegex().Match(sql);
        if (!m.Success) return;
        var cols = m.Groups[1].Value.Split(',').Select(Bare).ToArray();
        var values = m.Groups[2].Value.Split(',');
        for (var i = 0; i < values.Length; i++)
        {
            var p = PlaceholderRegex().Match(values[i].Trim());
            if (p.Success && i < cols.Length && cols[i].Length > 0) output[KeyOf(p, 1)] = cols[i];
        }
    }

    /// <summary>Quoted text emptied, <c>::type</c> casts dropped, and <c>?</c> and <c>%s</c> numbered as <c>$1</c>, <c>$2</c>…, so one parser reads every style.</summary>
    private static string Normalized(string sql)
    {
        var text = CastRegex().Replace(QuotedRegex().Replace(sql, "''"), "");
        if (DollarRegex().IsMatch(text)) return text;
        var n = 0;
        return PositionalRegex().Replace(text, _ => $"${++n}");
    }

    /// <summary>The key a placeholder match stands for: "0" for <c>$1</c> (zero-based), else its name.</summary>
    private static string KeyOf(Match m, int at)
    {
        if (m.Groups[at].Success) return long.TryParse(m.Groups[at].Value, CultureInfo.InvariantCulture, out var n) ? Key(n - 1) : "-1";
        return m.Groups[at + 1].Success ? m.Groups[at + 1].Value : m.Groups[at + 2].Value;
    }

    private static string Key(long position) => position.ToString(CultureInfo.InvariantCulture);

    /// <summary>A parameter name without its leading @, : or $, as the SQL text names it.</summary>
    private static string Unsigiled(string name) => name[0] is '@' or ':' or '$' ? name[1..] : name;

    private static string Bare(string ident) => string.Concat(ident.Where(c => c is not ('`' or '"' or '[' or ']'))).Split('.')[^1].Trim();

    [GeneratedRegex(Placeholder, RegexOptions.ECMAScript)]
    private static partial Regex PlaceholderRegex();

    [GeneratedRegex(@"([\w""`\]]+)\s*(?:=|!=|<>|<=|>=|<|>|\s(?:i?like|in)\s*\(?)\s*" + Placeholder, RegexOptions.IgnoreCase | RegexOptions.ECMAScript)]
    private static partial Regex ComparedRegex();

    [GeneratedRegex(@"insert\s+into\s+[\w"".`\[\]]+\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)", RegexOptions.IgnoreCase | RegexOptions.ECMAScript)]
    private static partial Regex InsertRegex();

    [GeneratedRegex(@"'(?:[^']|'')*'")]
    private static partial Regex QuotedRegex();

    [GeneratedRegex(@"::\w+", RegexOptions.ECMAScript)]
    private static partial Regex CastRegex();

    [GeneratedRegex(@"\$\d", RegexOptions.ECMAScript)]
    private static partial Regex DollarRegex();

    [GeneratedRegex(@"\?|%s")]
    private static partial Regex PositionalRegex();
}
