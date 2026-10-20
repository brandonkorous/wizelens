using System.Text.Json;
using WizeLens.Analysis;
using WizeLens.Model;
using Xunit;

namespace WizeLens.Tests;

/// <summary>The shared cases in docs/security-vectors.json; the TS suite runs the same file.</summary>
public class SecurityVectorTests
{
    private static readonly Lazy<JsonElement> Vectors = new(() => JsonDocument.Parse(File.ReadAllText(SearchFixtures.RepoFile("docs", "security-vectors.json"))).RootElement);

    public static TheoryData<string> Cases()
    {
        var data = new TheoryData<string>();
        foreach (var c in Vectors.Value.GetProperty("cases").EnumerateArray()) data.Add(c.GetProperty("name").GetString()!);
        return data;
    }

    private static Dictionary<string, object?> Attributes(JsonElement e) =>
        e.EnumerateObject().ToDictionary(p => p.Name, p => AttributeValue.Normalize(p.Value));

    private static Span SpanOf(JsonElement v, int i)
    {
        var category = v.GetProperty("category").GetString()!;
        return new Span
        {
            TraceId = new string('0', 31) + "1",
            SpanId = v.GetProperty("spanId").GetString()!,
            ParentSpanId = v.TryGetProperty("parentSpanId", out var p) ? p.GetString() : null,
            Name = $"span {i}",
            Kind = category == SpanCategories.HttpServer ? SpanKinds.Server : SpanKinds.Client,
            Category = category,
            Service = "api",
            StartMs = 1000 + i,
            DurationMs = 10,
            Status = SpanStatuses.Ok,
            Attributes = Attributes(v.GetProperty("attributes")),
        };
    }

    private static LogRecord LogOf(JsonElement l) => new()
    {
        TimeMs = 1000, Level = "info", Category = "app", Service = "api",
        SpanId = l.GetProperty("spanId").ValueKind == JsonValueKind.Null ? null : l.GetProperty("spanId").GetString(),
        Message = l.GetProperty("message").GetString()!,
        Attributes = Attributes(l.GetProperty("attributes")),
    };

    private static string Key(string kind, string shape) => kind + "\u0000" + shape;

    [Theory]
    [MemberData(nameof(Cases))]
    public void Finds_what_the_case_says(string name)
    {
        var c = Vectors.Value.GetProperty("cases").EnumerateArray().First(x => x.GetProperty("name").GetString() == name);
        var trace = new Trace
        {
            TraceId = new string('0', 31) + "1",
            Spans = [.. c.GetProperty("spans").EnumerateArray().Select(SpanOf)],
            Logs = c.TryGetProperty("logs", out var logs) ? [.. logs.EnumerateArray().Select(LogOf)] : [],
        };
        var want = c.GetProperty("findings").EnumerateArray()
            .Select(f => $"{f.GetProperty("kind").GetString()}|{f.GetProperty("severity").GetString()}|{f.GetProperty("shape").GetString()}|{f.GetProperty("count").GetInt32()}|{string.Join(",", f.GetProperty("spanIds").EnumerateArray().Select(s => s.GetString()))}")
            .Order(StringComparer.Ordinal);
        var got = SecurityAnalysis.Find(trace)
            .Select(f => $"{f.Kind}|{f.Severity}|{f.Shape}|{f.Count}|{string.Join(",", f.SpanIds)}")
            .Order(StringComparer.Ordinal);
        Assert.Equal(want, got);
    }
}
