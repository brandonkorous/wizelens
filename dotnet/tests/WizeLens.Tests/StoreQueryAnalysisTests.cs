using WizeLens.Analysis;
using WizeLens.Data;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>Query shapes, fingerprints, and the N+1 and duplicate rules for Redis, MongoDB, and Elasticsearch spans.</summary>
public class StoreQueryAnalysisTests
{
    private const string TraceId = "fedcba9876543210fedcba9876543210";

    [Theory]
    [InlineData("user:42", "user:?")]
    [InlineData("user:42:cart", "user:?:cart")]
    [InlineData("cache:product:3f2504e0-4f89-11d3-9a0c-0305e82c3301", "cache:product:?")]
    [InlineData("orders/507f1f77bcf86cd799439011", "orders/?")]
    [InlineData("lock:order-123", "lock:order-?")]
    [InlineData("rate:10.0.0.1", "rate:?.?.?.?")]
    [InlineData("login:bob@example.com", "login:?")]
    [InlineData("session:a8Fk2Lq9Zx7Pw3Rt5Yb1Nc", "session:?")]
    [InlineData("config:v2:features", "config:v2:features")]
    [InlineData("user_profile_settings_v2", "user_profile_settings_v2")]
    public void Ids_become_placeholders_and_names_stay(string key, string expected) =>
        Assert.Equal(expected, QueryShape.Ids(key));

    [Fact]
    public void Fingerprints_match_for_equal_input_and_never_hold_it()
    {
        Assert.Equal(QueryShape.Fingerprint("GET user:42"), QueryShape.Fingerprint("GET user:42"));
        Assert.NotEqual(QueryShape.Fingerprint("GET user:42"), QueryShape.Fingerprint("GET user:43"));
        Assert.Equal(16, QueryShape.Fingerprint("GET user:42").Length);
        Assert.DoesNotContain("42", QueryShape.Parameters("GET user:42").Replace(QueryShape.Fingerprint("GET user:42"), ""));
        Assert.Equal("{}", QueryShape.Parameters(null));
    }

    [Fact]
    public void Redis_set_is_a_query_not_a_session_statement()
    {
        var spans = Enumerable.Range(1, 5).Select(i => Store("redis", "SET", "SET user:?", Key($"SET user:{i}"))).ToArray();

        var hit = Assert.Single(TraceAnalysis.NPlusOnes(Build(spans)));
        Assert.Equal("SET user:?", hit.Shape);
        Assert.Equal(1, RequestParts.InsightCount(Build(spans)));
    }

    [Fact]
    public void Redis_transaction_and_connection_commands_are_never_n_plus_one()
    {
        var spans = Enumerable.Range(1, 6).SelectMany(_ => new[]
        {
            Store("redis", "MULTI", "MULTI", "{}"), Store("redis", "EXEC", "EXEC", "{}"), Store("redis", "PING", "PING", "{}"),
        }).ToArray();

        Assert.Empty(TraceAnalysis.NPlusOnes(Build(spans)));
        Assert.Empty(TraceAnalysis.DuplicateQueries(Build(spans)));
        Assert.Equal(0, RequestParts.InsightCount(Build(spans)));
    }

    [Fact]
    public void Same_key_twice_is_a_duplicate_and_different_keys_are_not()
    {
        var trace = Build(
            Store("redis", "GET", "GET user:?", Key("GET user:1")),
            Store("redis", "GET", "GET user:?", Key("GET user:1")),
            Store("redis", "GET", "GET user:?", Key("GET user:2")));

        var duplicate = Assert.Single(TraceAnalysis.DuplicateQueries(trace));
        Assert.Equal(2, duplicate.Count);
        Assert.Equal("GET user:?", duplicate.Query);
    }

    [Fact]
    public void Store_queries_without_parameters_are_never_duplicates()
    {
        var search = Enumerable.Range(1, 5).Select(_ => Store("elasticsearch", "search", "POST /orders/_search", null)).ToArray();

        Assert.Empty(TraceAnalysis.DuplicateQueries(Build(search)));
        Assert.Equal("POST /orders/_search", Assert.Single(TraceAnalysis.NPlusOnes(Build(search))).Shape);
        Assert.True(TraceAnalysis.HasUnknownParams(search[0]));
    }

    [Fact]
    public void Mongo_cursor_batches_are_never_n_plus_one()
    {
        var spans = Enumerable.Range(1, 6).Select(i => Store("mongodb", "getMore", """{"getMore":?,"collection":"orders"}""", Key($"getMore {i}"))).ToArray();

        Assert.Empty(TraceAnalysis.NPlusOnes(Build(spans)));
    }

    [Fact]
    public void Sql_rules_are_unchanged_for_spans_with_a_sql_system()
    {
        var set = Store("postgresql", null, "SET LOCAL app.tenant_id = 'a'", "{}");
        var select = Store("postgresql", null, "SELECT * FROM a WHERE id = $1", null);

        Assert.True(TraceAnalysis.IsSessionStatement(set));
        Assert.False(TraceAnalysis.IsSessionStatement(select));
        Assert.True(TraceAnalysis.HasUnknownParams(select));
        Assert.False(TraceAnalysis.HasUnknownParams(Store("postgresql", null, "SELECT 1", null)));
    }

    private static string Key(string raw) => QueryShape.Parameters(raw);

    private static Trace Build(params Span[] spans) => TraceBuilder.Build(TraceId, spans, [], []);

    private static int _next;

    private static Span Store(string system, string? operation, string query, string? parameters)
    {
        var span = new Span
        {
            TraceId = TraceId,
            SpanId = Interlocked.Increment(ref _next).ToString("x16"),
            Name = query,
            Category = SpanCategories.Db,
            Service = "api",
            DurationMs = 1,
            Attributes = { ["db.system.name"] = system, ["db.query.text"] = query },
        };
        if (operation is not null) span.Attributes["db.operation.name"] = operation;
        if (parameters is not null) span.Attributes["wizelens.db.parameters"] = parameters;
        return span;
    }
}
