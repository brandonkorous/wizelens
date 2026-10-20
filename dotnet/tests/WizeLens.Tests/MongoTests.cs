using System.Net;
using Microsoft.AspNetCore.Builder;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;
using MongoDB.Driver.Core.Configuration;
using MongoDB.Driver.Core.Connections;
using MongoDB.Driver.Core.Events;
using MongoDB.Driver.Core.Servers;
using WizeLens.Model;
using WizeLens.MongoDB;

namespace WizeLens.Tests;

/// <summary>WizeLens.MongoDB: the driver's command events become db spans with the command's shape and never its values.</summary>
[Collection(TestApp.Collection)]
public class MongoTests
{
    private static readonly ConnectionId Connection = new(new ServerId(new ClusterId(), new DnsEndPoint("mongo.local", 27017)));

    private static int _requestId = 1000;

    [Fact]
    public async Task A_find_becomes_a_db_span_under_the_request()
    {
        var find = BsonDocument.Parse("""
            { find: "orders", filter: { customerId: 42, status: { $in: ["paid", "sent"] } }, sort: { createdAt: -1 }, limit: 10,
              lsid: { id: 1 }, $db: "shop" }
            """);
        var reply = BsonDocument.Parse("""{ cursor: { firstBatch: [{ _id: 1 }, { _id: 2 }], id: 0 }, ok: 1 }""");
        await using var app = await TestApp.StartAsync(a => a.MapGet("/orders", () =>
        {
            Run("find", find, reply);
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/orders"));

        var span = Assert.Single(trace.Spans, s => s.Name == "find orders");
        Assert.Equal(SpanCategories.Db, span.Category);
        Assert.Equal("mongodb", span.Attr("db.system.name"));
        Assert.Equal("find", span.Attr("db.operation.name"));
        Assert.Equal("orders", span.Attr("db.collection.name"));
        Assert.Equal("shop", span.Attr("db.namespace"));
        Assert.Equal("""{"find":"orders","filter":{"customerId":?,"status":{"$in":?}},"sort":{"createdAt":?},"limit":?}""", span.Attr("db.query.text"));
        Assert.Equal("2", span.Attr("db.response.returned_rows"));
        Assert.Equal("mongo.local", span.Attr("server.address"));
        Assert.DoesNotContain("42", span.Attr("wizelens.db.parameters"));
        Assert.Contains(trace.Spans, s => s.SpanId == span.ParentSpanId);
    }

    [Fact]
    public async Task A_failed_command_is_an_error_and_handshakes_are_hidden()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/fail", () =>
        {
            Run("hello", new BsonDocument("hello", 1), new BsonDocument("ok", 1));
            var id = Interlocked.Increment(ref _requestId);
            var update = BsonDocument.Parse("""{ update: "orders", updates: [{ q: { _id: 7 }, u: { $set: { total: 9 } } }] }""");
            MongoCommands.Shared.Started(new CommandStartedEvent("update", update, new DatabaseNamespace("shop"), null, id, Connection));
            MongoCommands.Shared.Failed(new CommandFailedEvent("update", new DatabaseNamespace("shop"), new InvalidOperationException("duplicate key"), null, id, Connection, TimeSpan.FromMilliseconds(3)));
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/fail"));

        var span = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("update orders", span.Name);
        Assert.Equal(SpanStatuses.Error, span.Status);
        Assert.Equal("""{"update":"orders","updates":[{"q":{"_id":?},"u":{"$set":{"total":?}}}]}""", span.Attr("db.query.text"));
    }

    [Fact]
    public void An_insert_of_many_documents_of_one_shape_is_written_once()
    {
        var insert = new BsonDocument { ["insert"] = "orders", ["documents"] = new BsonArray(Enumerable.Range(1, 50).Select(i => new BsonDocument { ["_id"] = i, ["total"] = i * 2 })) };

        Assert.Equal("""{"insert":"orders","documents":[{"_id":?,"total":?}]}""", MongoQuery.Shape("insert", insert));
    }

    [Fact]
    public void GetMore_keeps_the_collection_and_hides_the_cursor_id()
    {
        var getMore = BsonDocument.Parse("""{ getMore: NumberLong(81237123), collection: "orders", batchSize: 100 }""");

        Assert.Equal("orders", MongoQuery.Collection("getMore", getMore));
        Assert.Equal("""{"getMore":?,"collection":"orders","batchSize":?}""", MongoQuery.Shape("getMore", getMore));
    }

    [Fact]
    public void The_fingerprint_input_drops_session_fields_so_equal_commands_match()
    {
        var a = BsonDocument.Parse("""{ find: "orders", filter: { _id: 1 }, lsid: { id: 1 }, $clusterTime: { t: 1 } }""");
        var b = BsonDocument.Parse("""{ find: "orders", filter: { _id: 1 }, lsid: { id: 2 }, $clusterTime: { t: 2 } }""");

        Assert.Equal(MongoQuery.Raw(a), MongoQuery.Raw(b));
        Assert.Equal(3, MongoQuery.AffectedRows("delete", BsonDocument.Parse("{ n: 3, ok: 1 }")));
        Assert.Null(MongoQuery.AffectedRows("find", BsonDocument.Parse("{ n: 3, ok: 1 }")));
    }

    [Fact]
    public void UseWizeLens_keeps_the_existing_cluster_configurator()
    {
        var called = false;
        var settings = new MongoClientSettings { ClusterConfigurator = _ => called = true }.UseWizeLens();

        settings.ClusterConfigurator(new ClusterBuilder());

        Assert.True(called);
    }

    private static void Run(string name, BsonDocument command, BsonDocument reply)
    {
        var id = Interlocked.Increment(ref _requestId);
        var database = new DatabaseNamespace("shop");
        MongoCommands.Shared.Started(new CommandStartedEvent(name, command, database, null, id, Connection));
        MongoCommands.Shared.Succeeded(new CommandSucceededEvent(name, reply, database, null, id, Connection, TimeSpan.FromMilliseconds(2)));
    }
}
