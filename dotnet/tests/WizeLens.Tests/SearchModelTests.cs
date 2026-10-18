using WizeLens.Model;
using WizeLens.Search;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>The search language over real spans, logs, and traces.</summary>
public class SearchModelTests
{
    private const string TraceId = "4bf92f3577b34da6a3ce929d0e0e4736";

    private static Func<SearchDoc, bool> Hit(string q) => SearchMatch.Compile(SearchParser.Parse(q));

    private static readonly Span Server = new()
    {
        TraceId = TraceId, SpanId = "00f067aa0ba902b7", Name = "POST /api/pay", Kind = SpanKinds.Server,
        Category = SpanCategories.HttpServer, Service = "api", DurationMs = 1250, Status = SpanStatuses.Error,
        StatusMessage = "Gateway failed",
        Attributes = new()
        {
            ["http.request.method"] = "POST", ["url.full"] = "https://shop.test/api/pay?retry=1", ["http.route"] = "/api/pay",
            ["http.response.status_code"] = 502, ["enduser.id"] = "u-7", ["tenant.id"] = 12,
        },
        Events = [new SpanEvent { Name = "exception", Attributes = new() { ["exception.message"] = "bank did not answer" } }],
    };

    private static readonly Span Db = new()
    {
        TraceId = TraceId, SpanId = "1111111111111111", ParentSpanId = Server.SpanId, Name = "SELECT cards", StartMs = 5,
        Kind = SpanKinds.Client, Category = SpanCategories.Db, Service = "api", DurationMs = 40, Status = SpanStatuses.Ok,
        Attributes = new() { ["db.system.name"] = "sqlite", ["db.query.text"] = "SELECT * FROM cards WHERE id = @p0" },
    };

    private static readonly LogRecord Warn = new()
    {
        TimeMs = 1, Level = "warn", Category = "Payments", Message = "retrying the bank", Service = "api",
        SpanId = Server.SpanId, Attributes = new() { ["attempt"] = 2 },
    };

    private static Trace Pay() => TraceBuilder.Build(TraceId, [Server, Db], [Warn], []);

    [Fact]
    public void Marks_quoted_and_escaped_characters_as_literal()
    {
        var t = Assert.Single(SearchLexer.Lex("a\"*b\"\\*"));
        Assert.Equal("a*!b!*!", string.Concat(t.Chars.Select(c => $"{c.C}{(c.Lit ? "!" : "")}")));
    }

    [Fact]
    public void Enforces_the_size_limits()
    {
        Assert.False(SearchCheck.Check(new string('a', SearchLimits.Chars + 1)).Ok);
        Assert.False(SearchCheck.Check(string.Join(" ", Enumerable.Range(0, SearchLimits.Terms + 1).Select(i => $"w{i}"))).Ok);
        Assert.False(SearchCheck.Check($"{new string('(', SearchLimits.Depth + 2)}a{new string(')', SearchLimits.Depth + 2)}").Ok);
        Assert.True(SearchCheck.Check($"{new string('(', SearchLimits.Depth - 1)}a{new string(')', SearchLimits.Depth - 1)}").Ok);
    }

    [Fact]
    public void Finds_spans_by_field_attribute_sql_text_and_error_message()
    {
        var docs = Pay().Spans.Select(s => SearchDocs.SpanDoc(s, "prod")).ToList();
        int Count(string q) => docs.Count(Hit(q));
        Assert.Equal(1, Count("status:502 method:POST route:/api/pay user:u-7 env:prod"));
        Assert.Equal(1, Count("category:db cards"));
        Assert.Equal(1, Count("\"bank did not answer\""));
        Assert.Equal(1, Count("gateway"));
        Assert.Equal(1, Count("@tenant.id:>=10"));
        Assert.Equal(1, Count("error:true duration:>1s"));
        Assert.Equal(1, Count("-error:true"));
        Assert.Equal(2, Count("trace:4bf9 service:api"));
    }

    [Fact]
    public void Reads_the_path_of_a_full_url_without_its_query()
    {
        var doc = SearchDocs.SpanDoc(Server);
        Assert.True(Hit("path:/api/pay")(doc));
        Assert.True(Hit("retry=1")(doc));
        Assert.False(Hit("path:*retry*")(doc));
    }

    [Fact]
    public void Finds_traces_when_any_span_matches_an_attribute()
    {
        var doc = SearchDocs.TraceDoc(Pay());
        Assert.True(Hit("@db.system.name:sqlite @tenant.id:12 status:5xx path:/api/* name:\"POST /api/pay\"")(doc));
        Assert.True(Hit("status:error error:true method:post")(doc));
        Assert.False(Hit("@db.system.name:postgres")(doc));
        Assert.False(Hit("route:/api/pay")(doc));
        Assert.Equal(new[] { "Gateway failed", "bank did not answer", null }, SearchDocs.TraceErrorTexts(Pay()));
        Assert.True(Hit("gateway \"bank did not\"")(doc));
    }

    [Fact]
    public void Finds_logs_by_level_category_and_attribute()
    {
        var trace = Pay();
        var doc = SearchDocs.LogDoc(trace, Assert.Single(trace.Logs));
        Assert.True(Hit("level:>=warn category:payments @attempt:2 retrying name:\"post /api/pay\" span:00f0")(doc));
        Assert.False(Hit("level:error")(doc));
        Assert.False(Hit("error:true")(doc));
    }

    [Fact]
    public void Formats_numbers_like_javascript()
    {
        Assert.Equal("@n:>=0.000001 @n:<1e-7 @n:>1e+21 @n:<123456789012", SearchFormat.Format(
            SearchParser.Parse("@n:>=0.000001 @n:<0.0000001 @n:>1000000000000000000000 @n:<123456789012")));
        Assert.Equal("duration:0.5ms", SearchFormat.Format(SearchParser.Parse("duration:500us")));
        double[] values = [0.000001, 1e-7, 1e21, 123456789012, 1e20, -0.0, 0.1 + 0.2, 5e-324, double.MaxValue, -1.5];
        Assert.Equal("0.000001 1e-7 1e+21 123456789012 100000000000000000000 0 0.30000000000000004 5e-324 1.7976931348623157e+308 -1.5",
            string.Join(" ", values.Select(JsText.Number)));
    }
}
