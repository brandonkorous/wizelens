using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using WizeLens.Data;
using WizeLens.Storage;
using Xunit;

namespace WizeLens.Tests;

/// <summary>The shared cases in docs/redact-vectors.json; the TS suite runs the same file.</summary>
public class RedactVectorTests
{
    private static readonly Lazy<JsonElement> Vectors = new(() => JsonDocument.Parse(File.ReadAllText(SearchFixtures.RepoFile("docs", "redact-vectors.json"))).RootElement);

    private static readonly Redactor Redactor = new(WizeLensOptions.DefaultRedactKeys);

    private static object? ValueOf(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.TryGetInt64(out var n) ? n : e.GetDouble(),
        JsonValueKind.Null => null,
        _ => e.GetRawText(),
    };

    private static string Text(JsonElement e) =>
        e.ValueKind == JsonValueKind.Array ? string.Concat(e.EnumerateArray().Select(p => p.GetString())) : e.GetString()!;

    [Fact]
    public void Redacts_every_attribute_by_its_key_and_its_value()
    {
        foreach (var c in Vectors.Value.GetProperty("attributes").EnumerateArray())
        {
            var got = Redactor.RedactValue(c.GetProperty("key").GetString()!, ValueOf(c.GetProperty("value")));
            Assert.Equal(ValueOf(c.GetProperty("want")), got is int i ? (long)i : got);
        }
    }

    [Fact]
    public void Replaces_secrets_inside_text_with_their_marker()
    {
        foreach (var c in Vectors.Value.GetProperty("text").EnumerateArray())
        {
            Assert.Equal(c.GetProperty("out").GetString(), ValuePatterns.RedactText(Text(c.GetProperty("in"))));
        }
    }

    /// <summary>The vector's parameters as (name, value); an array has no names, so it is stored as p0, p1….</summary>
    private static (string? Name, object? Value)[] Parameters(JsonElement e) => e.ValueKind == JsonValueKind.Array
        ? [.. e.EnumerateArray().Select(v => ((string?)null, ValueOf(v)))]
        : [.. e.EnumerateObject().Select(p => ((string?)p.Name, ValueOf(p.Value)))];

    private static JsonNode? Stored(JsonElement want) => want.ValueKind == JsonValueKind.Array
        ? new JsonObject(want.EnumerateArray().Select((v, i) => KeyValuePair.Create($"p{i}", JsonNode.Parse(v.GetRawText()))))
        : JsonNode.Parse(want.GetRawText());

    [Fact]
    public void Redacts_sql_values_by_their_name_or_the_column_they_are_bound_to()
    {
        foreach (var c in Vectors.Value.GetProperty("params").EnumerateArray())
        {
            var sql = c.GetProperty("sql").GetString()!;
            var got = JsonNode.Parse(JsonSerializer.Serialize(SqlParams.Redact(Redactor, sql, Parameters(c.GetProperty("params")))));
            Assert.True(JsonNode.DeepEquals(Stored(c.GetProperty("want")), got), $"{sql}: {got?.ToJsonString()}");
        }
    }

    [Fact]
    public void A_command_redacts_values_bound_to_sensitive_columns()
    {
        using var command = new SqliteCommand("select * from users where email = @e and id = @id");
        command.Parameters.AddWithValue("@e", "nia@example.test");
        command.Parameters.AddWithValue("@id", 7);
        Assert.Equal("""{"@e":"[redacted]","@id":7}""", DbActivity.ParametersJson(command));
    }
}
