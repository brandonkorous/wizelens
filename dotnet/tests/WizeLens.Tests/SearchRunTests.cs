using WizeLens.Analysis;
using WizeLens.Model;
using WizeLens.Search;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>The memory runner: result rows per kind, order, cursors, and pages.</summary>
public class SearchRunTests
{
    private static Span SpanOf(string traceId, string spanId, double startMs, string status = SpanStatuses.Ok, string? parent = null) => new()
    {
        TraceId = traceId, SpanId = spanId, ParentSpanId = parent, Name = $"GET /items/{spanId}", Kind = SpanKinds.Server,
        Category = SpanCategories.HttpServer, Service = "api", StartMs = startMs, DurationMs = 10, Status = status,
        Attributes = new() { ["http.request.method"] = "GET", ["url.path"] = $"/items/{spanId}", ["http.response.status_code"] = "200" },
    };

    private static readonly SearchWindow All = new(0, 10_000);

    private static List<Trace> Traces() =>
    [
        TraceBuilder.Build("bbbb", [SpanOf("bbbb", "b1", 100), SpanOf("bbbb", "b2", 300, SpanStatuses.Error, "b1")],
            [new LogRecord { TimeMs = 120, Level = "error", Message = "boom", Service = "browser" }, new LogRecord { TimeMs = 110, Message = "hi" }], []),
        TraceBuilder.Build("aaaa", [SpanOf("aaaa", "a1", 300), SpanOf("aaaa", "a2", 200, parent: "a1")], [], []),
    ];

    private static SearchPage Run(string kind, string q, int limit = 50, SearchCursor? cursor = null, SearchWindow? window = null) =>
        SearchRun.SearchMemory(Traces(), new SearchQuery(kind, SearchParser.Parse(q), window ?? All, limit, cursor));

    [Fact]
    public void Writes_and_reads_cursors_like_btoa_and_json()
    {
        var c = new SearchCursor(1700000000000.5, "té\"x", "00f0");
        Assert.Equal("WzE3MDAwMDAwMDAwMDAuNSwidOlcIngiLCIwMGYwIl0=", SearchRun.EncodeCursor(c));
        Assert.Equal("WzFlKzIxLCJhIiwiMyJd", SearchRun.EncodeCursor(new SearchCursor(1e21, "a", "3")));
        Assert.Equal(c, SearchRun.DecodeCursor(SearchRun.EncodeCursor(c)));
        Assert.Equal(new SearchCursor(1e21, "a", "3"), SearchRun.DecodeCursor("WzFlKzIxLCJhIiwiMyJd"));
        Assert.Equal(c, SearchRun.DecodeCursor("WzE3MDAwMDAwMDAwMDAuNSwidOlcIngiLCIwMGYwIl0"));
        Assert.Null(SearchRun.DecodeCursor(null));
        Assert.Null(SearchRun.DecodeCursor("not a cursor!"));
        Assert.Null(SearchRun.DecodeCursor(Convert.ToBase64String("[\"1\",\"a\",\"b\"]"u8.ToArray())));
        Assert.Null(SearchRun.DecodeCursor(Convert.ToBase64String("{\"a\":1}"u8.ToArray())));
    }

    [Fact]
    public void Orders_newest_first_then_trace_then_owner_and_clamps_limits()
    {
        Assert.True(SearchRun.CompareEntries(new(2, "b", "x"), new(1, "a", "a")) < 0);
        Assert.True(SearchRun.CompareEntries(new(1, "B", "x"), new(1, "a", "a")) < 0);
        Assert.True(SearchRun.CompareEntries(new(1, "a", "b"), new(1, "a", "a")) > 0);
        Assert.Equal(0, SearchRun.CompareEntries(new(1, "a", "a"), new(1, "a", "a")));
        Assert.Equal(new[] { 50, 1, 200, 7, 1 }, new double?[] { null, 0, 500, 7.9, -3 }.Select(SearchRun.ClampLimit));
    }

    [Fact]
    public void Reads_numbers_from_numbers_and_number_text_only()
    {
        Assert.Equal(new double?[] { 42, 1.5, 26, null, null, null, null, null },
            new object?[] { 42, " 1.5 ", "0x1A", "  ", "", true, "abc", double.PositiveInfinity }.Select(SearchMatch.NumberOf));
        var doc = new SearchDoc(SearchKinds.Spans, [], new Dictionary<string, object?>(), [new Dictionary<string, object?> { ["b"] = "  ", ["n"] = "7" }]);
        Assert.False(SearchMatch.Compile(SearchParser.Parse("@b:<1"))(doc));
        Assert.True(SearchMatch.Compile(SearchParser.Parse("@n:>=7"))(doc));
    }

    [Fact]
    public void Finds_spans_in_order_and_pages_with_the_cursor()
    {
        var first = Run(SearchKinds.Spans, "service:api", limit: 2);
        Assert.Equal(new[] { "a1", "b2" }, first.Items.Cast<SpanItem>().Select(s => s.SpanId));
        Assert.NotNull(first.Next);
        var second = Run(SearchKinds.Spans, "service:api", limit: 2, cursor: SearchRun.DecodeCursor(first.Next));
        Assert.Equal(new[] { "a2", "b1" }, second.Items.Cast<SpanItem>().Select(s => s.SpanId));
        Assert.Null(second.Next);
    }

    [Fact]
    public void Builds_span_rows_and_filters_by_window()
    {
        var item = Assert.IsType<SpanItem>(Assert.Single(Run(SearchKinds.Spans, "status:error").Items));
        Assert.Equal(new SpanItem("bbbb", "b2", 300, 10, "api", "GET /items/b2", "server", "http.server", "error", "GET", "/items/b2", null, 200, null), item);
        Assert.Equal("a2", Assert.IsType<SpanItem>(Assert.Single(Run(SearchKinds.Spans, "", window: new SearchWindow(200, 300)).Items)).SpanId);
    }

    [Fact]
    public void Finds_logs_with_their_index_and_traces_as_summaries()
    {
        var logs = Run(SearchKinds.Logs, "").Items.Cast<LogItem>().ToList();
        Assert.Equal(new[] { "bbbb:1", "bbbb:0" }, logs.Select(l => l.Key));
        var boom = Assert.IsType<LogItem>(Assert.Single(Run(SearchKinds.Logs, "level:error service:\"Web App\" name:\"GET /items/b1\"").Items));
        Assert.Equal("boom", boom.Message);
        Assert.Equal("1", SearchItems.LogOwner(boom));
        var traces = Run(SearchKinds.Traces, "error:true").Items.Cast<TraceSummary>().ToList();
        Assert.Equal(new[] { "bbbb" }, traces.Select(t => t.TraceId));
        Assert.Equal(new[] { "aaaa" }, Run(SearchKinds.Requests, "status:2xx path:/items/a1").Items.Cast<RequestItem>().Select(r => r.TraceId));
    }
}
