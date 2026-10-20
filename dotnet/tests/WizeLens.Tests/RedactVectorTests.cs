using System.Text.Json;
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
}
