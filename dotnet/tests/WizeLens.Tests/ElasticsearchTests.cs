using System.Diagnostics;
using System.Text;
using Elastic.Clients.Elasticsearch;
using Elastic.Transport;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Capture;
using WizeLens.Elasticsearch;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>WizeLens.Elasticsearch: the client's Elastic.Transport activity becomes a db span with the path shape and never the body.</summary>
[Collection(TestApp.Collection)]
public class ElasticsearchTests
{
    private const string SearchReply = """{"took":1,"timed_out":false,"_shards":{"total":1,"successful":1,"skipped":0,"failed":0},"hits":{"total":{"value":0,"relation":"eq"},"hits":[]}}""";
    private const string DocReply = """{"_index":"orders","_id":"42","_version":1,"_seq_no":0,"_primary_term":1,"found":true,"_source":{"total":9}}""";

    [Fact]
    public async Task A_search_and_a_get_become_db_spans_under_the_request()
    {
        var search = Client(SearchReply);
        var get = Client(DocReply);
        await using var app = await TestApp.StartAsync(a => a.MapGet("/find", async () =>
        {
            await search.SearchAsync<object>(s => s.Indices("orders").Query(q => q.Term(t => t.Field("customerId").Value(42))));
            await get.GetAsync<object>("orders", "42");
            return "ok";
        }), services: s => s.AddWizeLensElasticsearch());
        var trace = await app.TraceAsync(await app.Client.GetAsync("/find"));

        var db = trace.Spans.Where(s => s.Category == SpanCategories.Db).ToList();
        var searchSpan = Assert.Single(db, s => s.Name == "search orders");
        Assert.Equal("elasticsearch", searchSpan.Attr("db.system.name"));
        Assert.Equal("search", searchSpan.Attr("db.operation.name"));
        Assert.Equal("POST /orders/_search", searchSpan.Attr("db.query.text"));
        Assert.Equal("orders", searchSpan.Attr("db.namespace"));
        Assert.Equal("es.local", searchSpan.Attr("server.address"));
        Assert.Null(searchSpan.Attr("wizelens.db.parameters"));
        Assert.Null(searchSpan.Attr("url.full"));
        Assert.Contains(trace.Spans, s => s.SpanId == searchSpan.ParentSpanId);
        var getSpan = Assert.Single(db, s => s.Attr("db.query.text") == "GET /orders/_doc/?");
        // Only a fingerprint, never the value 42 (a random hex fingerprint may contain "42" by chance).
        Assert.Matches("""^({}|{"fingerprint":"[0-9a-f]{16}"})$""", getSpan.Attr("wizelens.db.parameters"));
        Assert.Null(getSpan.Attr("db.elasticsearch.path_parts.id"));
        Assert.DoesNotContain(trace.Spans, s => s.Category == SpanCategories.HttpClient);
    }

    [Fact]
    public async Task A_server_error_is_an_error_span_and_calls_outside_a_request_are_skipped()
    {
        var failing = Client("""{"error":"boom","status":500}""", 500);
        await failing.SearchAsync<object>(s => s.Indices("startup"));
        await using var app = await TestApp.StartAsync(a => a.MapGet("/boom", async () =>
        {
            await failing.SearchAsync<object>(s => s.Indices("orders"));
            return "ok";
        }), services: s => s.AddWizeLensElasticsearch());
        await failing.SearchAsync<object>(s => s.Indices("startup"));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/boom"));

        var span = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal(SpanStatuses.Error, span.Status);
        Assert.Equal("500", span.Attr("http.response.status_code"));
        Assert.DoesNotContain(app.Store.All().SelectMany(t => t.Spans), s => s.Attr("db.namespace") == "startup");
    }

    [Fact]
    public void Transport_tags_map_onto_the_contract()
    {
        using var listener = new ActivityListener
        {
            ShouldListenTo = s => s.Name == ElasticSpans.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);
        ExternalSources.Map(ElasticSpans.SourceName, ElasticSpans.Apply);
        using var source = new ActivitySource(ElasticSpans.SourceName);
        var activity = source.StartActivity("update", ActivityKind.Client)!;
        foreach (var (key, value) in Tags()) activity.SetTag(key, value);
        activity.Stop();

        var span = ActivityMapper.ToSpan(activity, "svc");

        Assert.Equal(SpanCategories.Db, span.Category);
        Assert.Equal("update orders", span.Name);
        Assert.Equal("POST /orders/_update/?", span.Attr("db.query.text"));
        Assert.Equal("update", span.Attr("db.operation.name"));
        Assert.Null(span.Attr("db.system"));
        Assert.Null(span.Attr("db.elasticsearch.path_parts.id"));
        Assert.Null(span.Attr("user_agent.original"));
        Assert.Equal(ElasticSpans.AdapterName, span.Attr("wizelens.db.adapter"));
    }

    [Fact]
    public void The_http_call_under_an_elasticsearch_request_is_not_a_second_span()
    {
        using var listener = new ActivityListener
        {
            ShouldListenTo = s => s.Name == ElasticSpans.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);
        ExternalSources.Map(ElasticSpans.SourceName, ElasticSpans.Apply);
        using var source = new ActivitySource(ElasticSpans.SourceName);

        Assert.False(ExternalSources.IsWrappedHttpCall(ActivityMapper.HttpClientSource));
        using (source.StartActivity("search", ActivityKind.Client))
        {
            Assert.True(ExternalSources.IsWrappedHttpCall(ActivityMapper.HttpClientSource));
            Assert.False(ExternalSources.IsWrappedHttpCall("Npgsql"));
        }
    }

    [Theory]
    [InlineData("/orders/_doc/42", "/orders/_doc/?")]
    [InlineData("/orders/_doc/order-abc", "/orders/_doc/?")]
    [InlineData("/orders/_search", "/orders/_search")]
    [InlineData("/logs-2026.10.19/_search", "/logs-?.?.?/_search")]
    [InlineData("/_cluster/health", "/_cluster/health")]
    [InlineData("/users/_doc/bob%40example.com", "/users/_doc/?")]
    public void Path_shape_hides_document_ids(string path, string expected) =>
        Assert.Equal(expected, ElasticSpans.PathShape(path));

    [Theory]
    [InlineData("/orders/_search", "orders")]
    [InlineData("/_search", null)]
    [InlineData("/", null)]
    public void Index_comes_from_the_first_path_segment(string path, string? expected) =>
        Assert.Equal(expected, ElasticSpans.IndexOf(path));

    private static (string, object?)[] Tags() =>
    [
        ("elastic.transport.product.name", "elasticsearch-net"), ("user_agent.original", "elasticsearch-net/8.19.27"),
        ("http.request.method", "POST"), ("url.full", "http://es.local:9200/orders/_update/42?refresh=true"),
        ("server.address", "es.local"), ("server.port", 9200), ("http.response.status_code", 200), ("db.operation", "update"),
        ("db.elasticsearch.path_parts.index", "orders"), ("db.elasticsearch.path_parts.id", "42"), ("db.system", "elasticsearch"),
    ];

    // The in-memory invoker matches header names as written; the client looks for the lower-case product header.
    private static ElasticsearchClient Client(string reply, int status = 200)
    {
        var headers = new Dictionary<string, IEnumerable<string>> { ["x-elastic-product"] = ["Elasticsearch"] };
        var invoker = new InMemoryRequestInvoker(Encoding.UTF8.GetBytes(reply), status, null, "application/json", headers);
        return new ElasticsearchClient(new ElasticsearchClientSettings(new SingleNodePool(new Uri("http://es.local:9200")), invoker));
    }
}
