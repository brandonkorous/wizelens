using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Elastic.Clients.Elasticsearch;
using Microsoft.AspNetCore.Builder;
using MongoDB.Bson;
using MongoDB.Driver;
using StackExchange.Redis;
using Testcontainers.MongoDb;
using Testcontainers.Redis;
using WizeLens.Elasticsearch;
using WizeLens.Model;
using WizeLens.MongoDB;
using WizeLens.Redis;

namespace WizeLens.Tests;

/// <summary>Real Redis, MongoDB, and Elasticsearch in Docker, started once for the class. Skipped without Docker.</summary>
public sealed class StoreContainers : IAsyncLifetime
{
    public RedisContainer? Redis { get; private set; }
    public MongoDbContainer? Mongo { get; private set; }
    public IContainer? Elastic { get; private set; }

    public string ElasticUrl => $"http://{Elastic!.Hostname}:{Elastic.GetMappedPublicPort(9200)}";

    public async Task InitializeAsync()
    {
        if (!DockerCheck.Available) return;
        Redis = new RedisBuilder("redis:7.4-alpine").Build();
        Mongo = new MongoDbBuilder("mongo:8.0").Build();
        Elastic = new ContainerBuilder("docker.elastic.co/elasticsearch/elasticsearch:8.15.3")
            .WithEnvironment("discovery.type", "single-node").WithEnvironment("xpack.security.enabled", "false")
            .WithEnvironment("ES_JAVA_OPTS", "-Xms512m -Xmx512m").WithPortBinding(9200, true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(9200)))
            .Build();
        await Task.WhenAll(Redis.StartAsync(), Mongo.StartAsync(), Elastic.StartAsync());
    }

    public async Task DisposeAsync()
    {
        if (Redis is not null) await Redis.DisposeAsync();
        if (Mongo is not null) await Mongo.DisposeAsync();
        if (Elastic is not null) await Elastic.DisposeAsync();
    }
}

[Collection(TestApp.Collection)]
public class StoreContainerTests(StoreContainers stores) : IClassFixture<StoreContainers>
{
    private static List<Span> DbSpans(Trace trace) => trace.Spans.Where(s => s.Category == SpanCategories.Db).ToList();

    [DockerFact]
    public async Task Real_redis_commands_are_db_spans_with_key_shapes_and_no_values()
    {
        var redis = (await ConnectionMultiplexer.ConnectAsync(stores.Redis!.GetConnectionString())).UseWizeLens();
        await using var app = await TestApp.StartAsync(a => a.MapGet("/redis", async () =>
        {
            var db = redis.GetDatabase();
            await db.StringSetAsync("user:42", "secret-value");
            await db.StringGetAsync("user:42");
            return "ok";
        }));
        var response = await app.Client.GetAsync("/redis");
        // Redis spans are written from the profiler's flush, up to 100 ms after the request ends.
        var trace = await app.TraceAsync(response);
        for (var i = 0; i < 20 && DbSpans(trace).Count < 2; i++)
        {
            await Task.Delay(100);
            trace = await app.TraceAsync(response);
        }
        var spans = DbSpans(trace);
        Assert.True(spans.Any(s => s.Attr("db.query.text") == "GET user:?" && s.Attr("db.system.name") == "redis"), string.Join(" | ", trace.Spans.Select(s => $"{s.Category}:{s.Name}:{s.Attr("db.query.text")}")));
        Assert.Contains(spans, s => s.Attr("db.query.text") == "SET user:?");
        Assert.All(spans, s => Assert.Contains(trace.Spans, p => p.SpanId == s.ParentSpanId));
        Assert.DoesNotContain(trace.Spans, s => s.Attributes.Values.Any(v => v?.ToString()?.Contains("secret-value") == true));
    }

    [DockerFact]
    public async Task Real_mongodb_commands_are_db_spans_with_filter_values_hidden()
    {
        var client = new MongoClient(MongoClientSettings.FromConnectionString(stores.Mongo!.GetConnectionString()).UseWizeLens());
        var orders = client.GetDatabase("shop").GetCollection<BsonDocument>("orders");
        await using var app = await TestApp.StartAsync(a => a.MapGet("/mongo", async () =>
        {
            await orders.InsertOneAsync(new BsonDocument { ["email"] = "a@b.c", ["status"] = "paid" });
            await orders.Find(new BsonDocument("email", "a@b.c")).FirstOrDefaultAsync();
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/mongo"));
        var spans = DbSpans(trace);
        Assert.Contains(spans, s => s.Name == "insert orders");
        Assert.Contains(spans, s => s.Name == "find orders" && s.Attr("db.collection.name") == "orders");
        Assert.DoesNotContain(trace.Spans, s => s.Attributes.Values.Any(v => v?.ToString()?.Contains("a@b.c") == true));
    }

    [DockerFact]
    public async Task Real_elasticsearch_calls_are_db_spans_and_the_http_call_is_not_counted_twice()
    {
        var es = new ElasticsearchClient(new Uri(stores.ElasticUrl));
        await using var app = await TestApp.StartAsync(a => a.MapGet("/es", async () =>
        {
            await es.IndexAsync(new { note = "private-note" }, i => i.Index("orders").Id("order-1").Refresh(Elastic.Clients.Elasticsearch.Refresh.True));
            await es.GetAsync<object>("orders", "order-1");
            await es.SearchAsync<object>(s => s.Indices("orders"));
            return "ok";
        }), services: s => s.AddWizeLensElasticsearch());
        var trace = await app.TraceAsync(await app.Client.GetAsync("/es"));
        var spans = DbSpans(trace);
        Assert.Contains(spans, s => s.Attr("db.query.text") == "GET /orders/_doc/?");
        Assert.Contains(spans, s => s.Name == "search orders");
        Assert.DoesNotContain(trace.Spans, s => s.Category == SpanCategories.HttpClient);
        Assert.DoesNotContain(trace.Spans, s => s.Attributes.Values.Any(v => v?.ToString()?.Contains("private-note") == true));
    }
}
