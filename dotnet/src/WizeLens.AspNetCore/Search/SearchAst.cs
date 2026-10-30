// The search language: its syntax tree. See docs/SEARCH-PLAN.md, "The search language".
namespace WizeLens.Search;

/// <summary>What a search finds.</summary>
internal static class SearchKinds
{
    public const string Requests = "requests";
    public const string Traces = "traces";
    public const string Spans = "spans";
    public const string Logs = "logs";
    public static readonly IReadOnlyList<string> All = [Requests, Traces, Spans, Logs];
}

/// <summary>Comparisons. Ranges become two of them; negation is a <see cref="NotNode"/>.</summary>
internal static class SearchCmp
{
    public const string Eq = "=";
    public const string Gt = ">";
    public const string Ge = ">=";
    public const string Lt = "<";
    public const string Le = "<=";
}

/// <summary>A field or attribute value.</summary>
internal abstract record SearchValue;

internal sealed record StringValue(string Value) : SearchValue;

/// <summary>Wildcard pieces: literal text, or null for "any text".</summary>
internal sealed record PatternValue(IReadOnlyList<string?> Pieces) : SearchValue;

internal sealed record NumberValue(double Value) : SearchValue;

internal sealed record BoolValue(bool Value) : SearchValue;

internal sealed record LevelValue(string Value) : SearchValue;

/// <summary>An HTTP status class: 5 for 5xx.</summary>
internal sealed record StatusClassValue(int Value) : SearchValue;

/// <summary>A span status: ok, error, or unset.</summary>
internal sealed record SpanStatusValue(string Value) : SearchValue;

/// <summary>The value is there (a lone <c>*</c>).</summary>
internal sealed record ExistsValue : SearchValue;

/// <summary>A node of the search tree.</summary>
internal abstract record SearchNode;

internal sealed record AndNode(IReadOnlyList<SearchNode> Items) : SearchNode;

internal sealed record OrNode(IReadOnlyList<SearchNode> Items) : SearchNode;

internal sealed record NotNode(SearchNode Item) : SearchNode;

internal sealed record TextNode(string Value) : SearchNode;

internal sealed record FieldNode(string Field, string Cmp, SearchValue Value) : SearchNode;

internal sealed record AttrNode(string Key, string Cmp, SearchValue Value) : SearchNode;

/// <summary>A parse error, with the character span it covers.</summary>
internal sealed class SearchError(string message, int start, int end) : Exception(message)
{
    public int Start { get; } = start;
    public int End { get; } = end;
}

/// <summary>Limits that keep one query cheap to run.</summary>
internal static class SearchLimits
{
    public const int Chars = 2000;
    public const int Terms = 64;
    public const int Depth = 16;
}
