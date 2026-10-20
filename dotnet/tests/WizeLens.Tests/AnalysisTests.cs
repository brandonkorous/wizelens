using WizeLens.Analysis;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Tests;

public class AnalysisTests
{
    private const string TraceId = "0123456789abcdef0123456789abcdef";

    [Fact]
    public void Duplicate_queries_need_same_text_and_same_parameters()
    {
        var trace = Build(
            Db("SELECT * FROM a WHERE id = @id", """{"@id":1}"""),
            Db("SELECT * FROM a WHERE id = @id", """{"@id":1}"""),
            Db("SELECT * FROM a WHERE id = @id", """{"@id":2}"""));

        var duplicate = Assert.Single(TraceAnalysis.DuplicateQueries(trace));
        Assert.Equal(2, duplicate.Count);
        Assert.Equal("""{"@id":1}""", duplicate.Parameters);
    }

    [Fact]
    public void N_plus_one_db_ignores_parameters_and_respects_threshold()
    {
        var spans = Enumerable.Range(1, 5).Select(i => Db("SELECT * FROM orders WHERE customer = @c", $$"""{"@c":{{i}}}""")).ToArray();

        Assert.Empty(TraceAnalysis.NPlusOnes(Build(spans[..4])));
        var hit = Assert.Single(TraceAnalysis.NPlusOnes(Build(spans)));
        Assert.Equal("db", hit.Kind);
        Assert.Equal(5, hit.Count);
    }

    [Fact]
    public void Session_statements_are_never_n_plus_one_or_duplicates()
    {
        var spans = Enumerable.Range(1, 6).Select(_ => Db("SET LOCAL app.tenant_id = 'a'", "{}"))
            .Concat(Enumerable.Range(1, 6).Select(i => Db(i % 2 == 0 ? "COMMIT" : "BEGIN", "{}")))
            .ToArray();

        Assert.Empty(TraceAnalysis.NPlusOnes(Build(spans)));
        Assert.Empty(TraceAnalysis.DuplicateQueries(Build(spans)));
    }

    [Fact]
    public void N_plus_one_http_groups_by_path_shape()
    {
        var spans = Enumerable.Range(1, 6)
            .Select(i => Http($"http://localhost:5200/orders/{i}?customerId={i}&expand=items"))
            .Append(Http("http://localhost:5200/health"))
            .ToArray();

        var hit = Assert.Single(TraceAnalysis.NPlusOnes(Build(spans)));
        Assert.Equal("http", hit.Kind);
        Assert.Equal("GET localhost:5200/orders/{}?customerId={}&expand={}", hit.Shape);
        Assert.Equal(6, hit.Count);
    }

    [Theory]
    [InlineData("/orders/42", "", "/orders/{}")]
    [InlineData("/users/3f2504e0-4f89-11d3-9a0c-0305e82c3301/posts", "", "/users/{}/posts")]
    [InlineData("/orders", "?customerId=7", "/orders?customerId={}")]
    [InlineData("/v2/items", "", "/v2/items")]
    public void Path_shape_replaces_ids_and_query_values(string path, string query, string expected) =>
        Assert.Equal(expected, TraceAnalysis.PathShape(path, query));

    [Fact]
    public void Slow_queries_use_threshold()
    {
        var trace = Build(Db("SELECT 1", "{}", 150), Db("SELECT 2", "{}", 99.9), Db("SELECT 3", "{}", 100));
        var slow = TraceAnalysis.SlowQueries(trace, 100).Select(q => q.Query).ToList();
        Assert.Equal(["SELECT 1", "SELECT 3"], slow);
    }

    [Fact]
    public void Trace_summary_counts_and_root()
    {
        var root = new Span { TraceId = TraceId, SpanId = "aaaaaaaaaaaaaaaa", Name = "GET /x", Category = SpanCategories.HttpServer, Service = "api", StartMs = 1000, DurationMs = 50 };
        var child = Db("SELECT 1", "{}", 10);
        child.ParentSpanId = root.SpanId;
        child.StartMs = 1045;
        child.Status = SpanStatuses.Error;

        var trace = TraceBuilder.Build(TraceId, [child, root], [], []);

        Assert.Equal("GET /x", trace.RootName);
        Assert.Equal(55, trace.DurationMs);
        Assert.Equal(SpanStatuses.Error, trace.Status);
        Assert.Equal(1, trace.DbCount);
        Assert.Equal(1, trace.ErrorCount);
        Assert.Equal(root.SpanId, trace.Spans[0].SpanId);
    }

    [Fact]
    public void A_4xx_answer_is_not_a_failure_but_a_5xx_is()
    {
        Span Answered(int code) => new()
        {
            TraceId = TraceId, SpanId = $"{code:x16}", Name = "GET /x", Category = SpanCategories.HttpServer, Service = "api", StartMs = 1000, DurationMs = 5,
            Status = SpanStatuses.Error, Attributes = new() { ["http.response.status_code"] = code },
            Events = [new SpanEvent { Name = "exception", Attributes = new() { ["exception.message"] = "Builder page not found" } }],
        };

        var notFound = Build(Answered(404));
        Assert.False(RequestParts.IsErrorSpan(notFound.Spans[0]));
        Assert.Equal(0, notFound.ErrorCount);
        Assert.NotEqual(SpanStatuses.Error, notFound.Status);
        Assert.Empty(TraceAnalysis.Errors(notFound));

        var down = Build(Answered(503));
        Assert.True(RequestParts.IsErrorSpan(down.Spans[0]));
        Assert.Equal(SpanStatuses.Error, down.Status);
        Assert.Single(TraceAnalysis.Errors(down));
    }

    private static Trace Build(params Span[] spans) => TraceBuilder.Build(TraceId, spans, [], []);

    private static int _next;

    private static string NextSpanId() => Interlocked.Increment(ref _next).ToString("x16");

    private static Span Db(string sql, string parameters, double durationMs = 1) => new()
    {
        TraceId = TraceId,
        SpanId = NextSpanId(),
        Name = "db",
        Category = SpanCategories.Db,
        Service = "api",
        DurationMs = durationMs,
        Attributes = { ["db.query.text"] = sql, ["wizelens.db.parameters"] = parameters },
    };

    private static Span Http(string url) => new()
    {
        TraceId = TraceId,
        SpanId = NextSpanId(),
        Name = "GET",
        Category = SpanCategories.HttpClient,
        Service = "api",
        DurationMs = 1,
        Attributes = { ["http.request.method"] = "GET", ["url.full"] = url },
    };
}
