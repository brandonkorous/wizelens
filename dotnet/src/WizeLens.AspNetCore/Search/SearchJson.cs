// The search tree as JSON, with the same keys and shapes as the TS objects.
using System.Text.Json.Nodes;

namespace WizeLens.Search;

public static class SearchJson
{
    /// <summary>A tree as a JSON node; null (match everything) is JSON null.</summary>
    public static JsonNode? ToJson(SearchNode? n) => n switch
    {
        null => null,
        AndNode a => new JsonObject { ["type"] = "and", ["items"] = Items(a.Items) },
        OrNode o => new JsonObject { ["type"] = "or", ["items"] = Items(o.Items) },
        NotNode not => new JsonObject { ["type"] = "not", ["item"] = ToJson(not.Item) },
        TextNode t => new JsonObject { ["type"] = "text", ["value"] = t.Value },
        FieldNode f => new JsonObject { ["type"] = "field", ["field"] = f.Field, ["cmp"] = f.Cmp, ["value"] = ValueJson(f.Value) },
        AttrNode at => new JsonObject { ["type"] = "attr", ["key"] = at.Key, ["cmp"] = at.Cmp, ["value"] = ValueJson(at.Value) },
        _ => throw new ArgumentOutOfRangeException(nameof(n)),
    };

    /// <summary>A tree as JSON text.</summary>
    public static string ToJsonString(SearchNode? n) => ToJson(n)?.ToJsonString() ?? "null";

    private static JsonArray Items(IEnumerable<SearchNode> items) => [.. items.Select(ToJson)];

    private static JsonObject ValueJson(SearchValue v) => v switch
    {
        StringValue s => Typed("string", s.Value),
        PatternValue p => new JsonObject { ["type"] = "pattern", ["pieces"] = new JsonArray([.. p.Pieces.Select(x => (JsonNode?)x)]) },
        NumberValue n => Typed("number", Number(n.Value)),
        BoolValue b => Typed("bool", b.Value),
        LevelValue l => Typed("level", l.Value),
        StatusClassValue c => Typed("statusClass", c.Value),
        SpanStatusValue st => Typed("spanStatus", st.Value),
        ExistsValue => new JsonObject { ["type"] = "exists" },
        _ => throw new ArgumentOutOfRangeException(nameof(v)),
    };

    private static JsonObject Typed(string type, JsonNode? value) => new() { ["type"] = type, ["value"] = value };

    /// <summary>Whole numbers print without a fraction and NaN prints as null, as JSON.stringify does.</summary>
    private static JsonNode? Number(double d) =>
        !double.IsFinite(d) ? null : d == Math.Floor(d) && Math.Abs(d) < 9007199254740992d ? JsonValue.Create((long)d) : JsonValue.Create(d);
}
