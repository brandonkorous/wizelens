using System.Diagnostics;
using WizeLens.Capture;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>Maps activities the way the libraries report them (tag names taken from real runs) onto contract spans.</summary>
[Collection(TestApp.Collection)]
public sealed class LibraryMappingTests : IDisposable
{
    private readonly ActivityListener _listener = new()
    {
        ShouldListenTo = _ => true,
        Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
    };

    public LibraryMappingTests() => ActivitySource.AddActivityListener(_listener);

    public void Dispose() => _listener.Dispose();

    private static Activity Run(string source, string name, ActivityKind kind, params (string Key, object? Value)[] tags)
    {
        using var s = new ActivitySource(source);
        var activity = s.StartActivity(name, kind)!;
        foreach (var (key, value) in tags) activity.SetTag(key, value);
        activity.Stop();
        return activity;
    }

    private static Span Map(string source, string name, ActivityKind kind, params (string Key, object? Value)[] tags) =>
        ActivityMapper.ToSpan(Run(source, name, kind, tags), "svc");

    [Fact]
    public void Npgsql_command_becomes_a_named_db_span_without_the_data_source()
    {
        var span = Map("Npgsql", "postgresql", ActivityKind.Client,
            ("db.system.name", "postgresql"), ("db.query.text", "SELECT * FROM orders WHERE id = $1"),
            ("db.namespace", "shop"), ("db.npgsql.data_source", "Host=db;Username=app"), ("db.npgsql.connection_id", 7));

        Assert.Equal(SpanCategories.Db, span.Category);
        Assert.Equal("SELECT orders", span.Name);
        Assert.Equal("npgsql", span.Attr("wizelens.db.adapter"));
        Assert.Equal("shop", span.Attr("db.namespace"));
        Assert.Null(span.Attr("db.npgsql.data_source"));
    }

    [Fact]
    public void MySqlConnector_old_tag_names_move_to_the_contract_and_the_connection_string_is_dropped()
    {
        var span = Map("MySqlConnector", "Execute", ActivityKind.Client,
            ("db.system", "mysql"), ("db.statement", "UPDATE users SET name = @n"), ("db.name", "app"),
            ("db.connection_string", "Server=db;Password=secret"), ("db.user", "app"), ("net.peer.ip", "10.0.0.5"));

        Assert.Equal("UPDATE users", span.Name);
        Assert.Equal("mysql", span.Attr("db.system.name"));
        Assert.Equal("UPDATE users SET name = @n", span.Attr("db.query.text"));
        Assert.Equal("app", span.Attr("db.namespace"));
        Assert.Equal("10.0.0.5", span.Attr("server.address"));
        Assert.Equal("mysqlconnector", span.Attr("wizelens.db.adapter"));
        Assert.Null(span.Attr("db.connection_string"));
        Assert.Null(span.Attr("db.user"));
    }

    [Fact]
    public void Connection_opens_and_service_bus_message_stamps_are_noise()
    {
        Assert.True(ExternalSources.IsNoise(Run("Npgsql", "CONNECT shop", ActivityKind.Client, ("db.system.name", "postgresql"))));
        Assert.True(ExternalSources.IsNoise(Run("MySqlConnector", "Open", ActivityKind.Client, ("db.system", "mysql"))));
        Assert.True(ExternalSources.IsNoise(Run("Azure.Messaging.ServiceBus.Message", "Message", ActivityKind.Producer)));
        Assert.False(ExternalSources.IsNoise(Run("Npgsql", "postgresql", ActivityKind.Client, ("db.query.text", "SELECT 1"))));
    }

    [Fact]
    public void RabbitMq_publish_and_deliver_become_send_and_process_on_the_routing_key()
    {
        (string, object?)[] common = [("messaging.system", "rabbitmq"), ("messaging.destination.name", "amq.default"), ("messaging.rabbitmq.destination.routing_key", "orders")];
        var send = Map("RabbitMQ.Client.Publisher", "publish orders", ActivityKind.Producer, [.. common, ("messaging.operation.type", "send")]);
        var process = Map("RabbitMQ.Client.Subscriber", "deliver orders", ActivityKind.Consumer, [.. common, ("messaging.operation.type", "process")]);

        Assert.Equal(SpanCategories.Messaging, send.Category);
        Assert.Equal("send orders", send.Name);
        Assert.Equal(SpanKinds.Producer, send.Kind);
        Assert.Equal("process orders", process.Name);
        Assert.Equal("orders", process.Attr("messaging.destination.name"));
    }

    [Fact]
    public void Service_bus_send_with_the_old_publish_name_is_a_send()
    {
        var span = Map("Azure.Messaging.ServiceBus.ServiceBusSender", "ServiceBusSender.Send", ActivityKind.Client,
            ("az.namespace", "Microsoft.ServiceBus"), ("messaging.system", "servicebus"), ("messaging.operation", "publish"), ("messaging.destination.name", "orders"));

        Assert.Equal(SpanCategories.Messaging, span.Category);
        Assert.Equal("send orders", span.Name);
        Assert.Equal("send", span.Attr("messaging.operation.type"));
    }

    [Fact]
    public void Grpc_server_tags_become_rpc_attributes_and_a_non_zero_status_is_an_error()
    {
        var span = Map(ActivityMapper.AspNetCoreSource, "POST /probe.v1.Greeter/SayHello", ActivityKind.Server,
            ("http.request.method", "POST"), ("grpc.method", "/probe.v1.Greeter/SayHello"), ("grpc.status_code", 5));

        Assert.Equal(SpanCategories.HttpServer, span.Category);
        Assert.Equal("probe.v1.Greeter/SayHello", span.Name);
        Assert.Equal("grpc", span.Attr("rpc.system"));
        Assert.Equal("probe.v1.Greeter", span.Attr("rpc.service"));
        Assert.Equal("SayHello", span.Attr("rpc.method"));
        Assert.Equal("5", span.Attr("rpc.grpc.status_code"));
        Assert.Equal(SpanStatuses.Error, span.Status);
        Assert.Null(span.Attr("grpc.method"));
    }

    [Fact]
    public void A_server_span_that_answered_4xx_is_not_an_error_even_with_an_exception()
    {
        using var source = new ActivitySource(ActivityMapper.AspNetCoreSource);
        var activity = source.StartActivity("GET /pages/{slug}", ActivityKind.Server)!;
        activity.SetTag("http.response.status_code", 404);
        activity.AddEvent(new ActivityEvent("exception", tags: new ActivityTagsCollection { ["exception.message"] = "Page not found" }));
        activity.SetStatus(ActivityStatusCode.Error);
        activity.Stop();

        var span = ActivityMapper.ToSpan(activity, "svc");

        Assert.Equal(SpanStatuses.Unset, span.Status);
        Assert.Contains(span.Events, e => e.Name == "exception");
    }

    [Fact]
    public void Grpc_client_call_keeps_the_http_span_id_and_gets_the_call_status()
    {
        using var grpcSource = new ActivitySource(ExternalSources.GrpcClient);
        using var httpSource = new ActivitySource(ActivityMapper.HttpClientSource);
        var call = grpcSource.StartActivity("Grpc.Net.Client.GrpcOut", ActivityKind.Client)!;
        call.SetTag("grpc.method", "/probe.v1.Greeter/SayHello");
        var http = httpSource.StartActivity("System.Net.Http.HttpRequestOut", ActivityKind.Client)!;
        http.SetTag("http.request.method", "POST");
        http.SetTag("url.full", "http://orders/probe.v1.Greeter/SayHello");
        http.Stop();
        Assert.Null(GrpcClientCalls.Complete(http, "svc"));
        call.SetTag("grpc.status_code", 14);
        call.Stop();

        var span = GrpcClientCalls.Complete(call, "svc")!;
        Assert.Equal(http.SpanId.ToHexString(), span.SpanId);
        Assert.Equal("probe.v1.Greeter/SayHello", span.Name);
        Assert.Equal("14", span.Attr("rpc.grpc.status_code"));
        Assert.Equal(SpanStatuses.Error, span.Status);
    }

    [Fact]
    public void A_span_with_only_the_operation_and_table_is_a_db_span()
    {
        var span = Map("better-auth", "db findOne session", ActivityKind.Internal,
            ("db.operation.name", "findOne"), ("db.collection.name", "session"));

        Assert.Equal(SpanCategories.Db, span.Category);
    }
}
