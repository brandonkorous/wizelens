using Azure.Messaging.ServiceBus;
using Grpc.Core;
using Grpc.Net.Client;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Model;
using WizeLens.Tests.Grpc;

namespace WizeLens.Tests;

/// <summary>Real libraries, no external services: SqlClient against a closed port, gRPC in memory, Service Bus against nothing.</summary>
[Collection(TestApp.Collection)]
public class LibraryCaptureTests
{
    [Fact]
    public async Task SqlClient_commands_are_captured_with_no_code()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/sql", async () =>
        {
            await using var connection = new SqlConnection("Server=127.0.0.1,1;Connect Timeout=1;Encrypt=false");
            await using var command = new SqlCommand("SELECT * FROM Orders WHERE Id = @id", connection);
            command.Parameters.AddWithValue("@id", 7);
            try { await command.ExecuteScalarAsync(); } catch (InvalidOperationException) { }
            return "done";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/sql"));

        var db = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("SELECT Orders", db.Name);
        Assert.Equal("sqlclient", db.Attr("wizelens.db.adapter"));
        Assert.Equal("microsoft.sql_server", db.Attr("db.system.name"));
        Assert.Contains("7", db.Attr("wizelens.db.parameters"));
        Assert.Equal(SpanStatuses.Error, db.Status);
    }

    [Fact]
    public async Task Grpc_server_and_client_calls_get_rpc_attributes()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGrpcService<GreeterService>(), services: s => s.AddGrpc());
        using var channel = GrpcChannel.ForAddress("http://localhost", new GrpcChannelOptions { HttpHandler = app.App.GetTestServer().CreateHandler() });
        var client = new Greeter.GreeterClient(channel);
        await client.SayHelloAsync(new HelloRequest { Name = "ada" });
        await Assert.ThrowsAsync<RpcException>(async () => await client.SayHelloAsync(new HelloRequest { Name = "missing" }));

        var spans = await app.SpansAsync(s => s.Attr("rpc.system") == "grpc", 4);
        var servers = spans.Where(s => s.Category == SpanCategories.HttpServer).ToList();
        var clients = spans.Where(s => s.Category == SpanCategories.HttpClient).ToList();
        Assert.Equal(2, servers.Count);
        Assert.Equal(2, clients.Count);
        Assert.All(spans, s => Assert.Equal("probe.v1.Greeter/SayHello", s.Name));
        Assert.Single(servers, s => s.Status == SpanStatuses.Error && s.Attr("rpc.grpc.status_code") == "5");
        Assert.Single(clients, s => s.Status == SpanStatuses.Error);
    }

    [Fact]
    public async Task Service_bus_send_is_captured_and_the_message_stamp_is_not()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/sb", async () =>
        {
            var options = new ServiceBusClientOptions { RetryOptions = new ServiceBusRetryOptions { MaxRetries = 0, TryTimeout = TimeSpan.FromSeconds(2) } };
            await using var client = new ServiceBusClient("Endpoint=sb://127.0.0.1:1/;SharedAccessKeyName=k;SharedAccessKey=dGVzdA==", options);
            try { await client.CreateSender("orders").SendMessageAsync(new ServiceBusMessage("hi")); } catch (ServiceBusException) { }
            return "done";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/sb"));

        var send = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Messaging);
        Assert.Equal("send orders", send.Name);
        Assert.Equal("servicebus", send.Attr("messaging.system"));
        Assert.Equal(SpanStatuses.Error, send.Status);
    }
}

/// <summary>The gRPC service used by the tests: "missing" fails with NotFound.</summary>
public sealed class GreeterService : Greeter.GreeterBase
{
    public override Task<HelloReply> SayHello(HelloRequest request, ServerCallContext context) =>
        request.Name == "missing"
            ? throw new RpcException(new Status(StatusCode.NotFound, "no such name"))
            : Task.FromResult(new HelloReply { Message = $"hi {request.Name}" });
}
