using System.Diagnostics;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using MySqlConnector;
using Npgsql;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using Testcontainers.MySql;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using WizeLens.Data;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>Real Postgres, MySQL, and RabbitMQ in Docker, started once for the class. Skipped without Docker.</summary>
public sealed class Containers : IAsyncLifetime
{
    public PostgreSqlContainer? Postgres { get; private set; }
    public MySqlContainer? MySql { get; private set; }
    public RabbitMqContainer? Rabbit { get; private set; }

    public async Task InitializeAsync()
    {
        if (!DockerCheck.Available) return;
        Postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
        MySql = new MySqlBuilder("mysql:8.4").Build();
        Rabbit = new RabbitMqBuilder("rabbitmq:4-alpine").Build();
        await Task.WhenAll(Postgres.StartAsync(), MySql.StartAsync(), Rabbit.StartAsync());
    }

    public async Task DisposeAsync()
    {
        if (Postgres is not null) await Postgres.DisposeAsync();
        if (MySql is not null) await MySql.DisposeAsync();
        if (Rabbit is not null) await Rabbit.DisposeAsync();
    }
}

[Collection(TestApp.Collection)]
public class ContainerTests(Containers containers) : IClassFixture<Containers>
{
    private static async Task<object?> ScalarAsync(System.Data.Common.DbConnection connection, string sql)
    {
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteScalarAsync();
    }

    [DockerFact]
    public async Task Npgsql_and_MySqlConnector_commands_are_captured_once_with_no_code()
    {
        var pg = containers.Postgres!.GetConnectionString();
        var my = containers.MySql!.GetConnectionString();
        await using var app = await TestApp.StartAsync(a => a.MapGet("/both", async () =>
        {
            await using (var c = new NpgsqlConnection(pg)) await ScalarAsync(c, "SELECT 1 FROM pg_catalog.pg_tables LIMIT 1");
            await using (var c = new MySqlConnection(my)) await ScalarAsync(c, "SELECT 1 FROM information_schema.tables LIMIT 1");
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/both"));

        var db = trace.Spans.Where(s => s.Category == SpanCategories.Db).ToList();
        Assert.Equal(2, db.Count);
        var npgsql = Assert.Single(db, s => s.Attr("wizelens.db.adapter") == "npgsql");
        var mysql = Assert.Single(db, s => s.Attr("wizelens.db.adapter") == "mysqlconnector");
        Assert.Equal("SELECT pg_catalog.pg_tables", npgsql.Name);
        Assert.Equal("postgresql", npgsql.Attr("db.system.name"));
        Assert.Equal("SELECT information_schema.tables", mysql.Name);
        Assert.Equal("mysql", mysql.Attr("db.system.name"));
        Assert.All(db, s => Assert.DoesNotContain(s.Attributes.Keys, k => k.Contains("connection_string") || k.Contains("data_source")));
    }

    [DockerFact]
    public async Task A_wrapped_connection_is_counted_once_and_queries_outside_requests_are_skipped()
    {
        var pg = containers.Postgres!.GetConnectionString();
        await using var app = await TestApp.StartAsync(a => a.MapGet("/wrapped", async () =>
        {
            await using var c = new ProfiledDbConnection(new NpgsqlConnection(pg));
            return await ScalarAsync(c, "SELECT 42");
        }));
        await using (var outside = new NpgsqlConnection(pg)) await ScalarAsync(outside, "SELECT 'startup'");
        var trace = await app.TraceAsync(await app.Client.GetAsync("/wrapped"));

        var db = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("ado.net", db.Attr("wizelens.db.adapter"));
        Assert.DoesNotContain(app.Store.All(), t => t.Spans.Any(s => s.Attr("db.query.text") == "SELECT 'startup'"));
    }

    [DockerFact]
    public async Task RabbitMq_consumer_joins_the_publishing_request()
    {
        var factory = new ConnectionFactory { Uri = new Uri(containers.Rabbit!.GetConnectionString()) };
        await using var connection = await factory.CreateConnectionAsync();
        await using var channel = await connection.CreateChannelAsync();
        await channel.QueueDeclareAsync("wl-orders", durable: true, exclusive: false, autoDelete: false);
        var received = new TaskCompletionSource();
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += (_, _) => { received.TrySetResult(); return Task.CompletedTask; };
        await channel.BasicConsumeAsync("wl-orders", autoAck: true, consumer);
        await using var app = await TestApp.StartAsync(a => a.MapPost("/publish", async () =>
        {
            await channel.BasicPublishAsync("", "wl-orders", Encoding.UTF8.GetBytes("hi"));
            return "sent";
        }));

        var response = await app.Client.PostAsync("/publish", null);
        await received.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var traceId = Assert.Single(response.Headers.GetValues("X-WizeLens-Trace"));
        var spans = await SpansWhenAsync(app, traceId, s => s.Name == "process wl-orders");

        var send = Assert.Single(spans, s => s.Name == "send wl-orders");
        var process = Assert.Single(spans, s => s.Name == "process wl-orders");
        Assert.Equal(SpanCategories.Messaging, process.Category);
        Assert.Equal(send.SpanId, process.ParentSpanId);
    }

    private static async Task<List<Span>> SpansWhenAsync(TestApp app, string traceId, Func<Span, bool> until)
    {
        var watch = Stopwatch.StartNew();
        while (watch.Elapsed < TimeSpan.FromSeconds(5))
        {
            var spans = app.Store.Get(traceId)?.Spans ?? [];
            if (spans.Any(until)) return spans;
            await Task.Delay(100);
        }
        return app.Store.Get(traceId)?.Spans ?? [];
    }
}
