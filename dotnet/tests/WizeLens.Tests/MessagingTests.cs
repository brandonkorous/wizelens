using System.Reflection;
using System.Text;
using Confluent.Kafka;
using MassTransit;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using WizeLens.Kafka;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>Message queues that run in process: MassTransit's in-memory transport and Kafka through WizeLens.Kafka.</summary>
[Collection(TestApp.Collection)]
public class MessagingTests
{
    [Fact]
    public async Task MassTransit_consumer_joins_the_publishing_request()
    {
        PingConsumer.Received = new TaskCompletionSource();
        await using var app = await TestApp.StartAsync(
            a => a.MapPost("/ping", async (IPublishEndpoint bus) =>
            {
                await bus.Publish(new Ping("hello"));
                return "sent";
            }),
            services: s => s.AddMassTransit(x =>
            {
                x.AddConsumer<PingConsumer>();
                x.UsingInMemory((context, cfg) => cfg.ConfigureEndpoints(context));
            }));
        var response = await app.Client.PostAsync("/ping", null);
        await PingConsumer.Received.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var traceId = Assert.Single(response.Headers.GetValues("X-WizeLens-Trace"));

        var spans = await WaitForAsync(app, traceId, s => s.Kind == SpanKinds.Consumer);
        var messaging = spans.Where(s => s.Category == SpanCategories.Messaging).ToList();
        Assert.Contains(messaging, s => s.Kind == SpanKinds.Producer && s.Attr("messaging.operation.type") == "send");
        Assert.Contains(messaging, s => s.Kind == SpanKinds.Consumer && s.Name == "process Ping");
        Assert.All(messaging, s => Assert.NotEqual("unknown", s.Attr("messaging.destination.name")));
    }

    [Fact]
    public async Task Kafka_process_span_joins_the_producer_span()
    {
        var producer = DispatchProxy.Create<IProducer<string, string>, FakeProducer>();
        Message<string, string>? sent = null;
        await using var app = await TestApp.StartAsync(a => a.MapPost("/kafka", async () =>
        {
            sent = new Message<string, string> { Key = "k", Value = "hello" };
            await producer.ProduceTracedAsync("orders", sent);
            var consumed = new ConsumeResult<string, string> { Topic = "orders", Message = sent, Partition = new Partition(0), Offset = new Offset(42) };
            await consumed.ProcessTracedAsync(_ => Task.CompletedTask);
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.PostAsync("/kafka", null));

        var send = Assert.Single(trace.Spans, s => s.Name == "send orders");
        var process = Assert.Single(trace.Spans, s => s.Name == "process orders");
        Assert.Equal(SpanCategories.Messaging, send.Category);
        Assert.Equal(SpanKinds.Producer, send.Kind);
        Assert.Equal(send.SpanId, process.ParentSpanId);
        Assert.Equal("kafka", process.Attr("messaging.system"));
        Assert.Equal("5", send.Attr("messaging.message.body.size"));
        Assert.True(sent!.Headers.TryGetLastBytes("traceparent", out var header));
        Assert.Contains(send.SpanId, Encoding.UTF8.GetString(header));
    }

    private static async Task<List<Span>> WaitForAsync(TestApp app, string traceId, Func<Span, bool> until)
    {
        for (var i = 0; i < 50; i++)
        {
            var spans = app.Store.Get(traceId)?.Spans ?? [];
            if (spans.Any(until)) return spans;
            await Task.Delay(100);
        }
        return app.Store.Get(traceId)?.Spans ?? [];
    }
}

public sealed record Ping(string Text);

public sealed class PingConsumer : IConsumer<Ping>
{
    public static TaskCompletionSource Received { get; set; } = new();

    public Task Consume(ConsumeContext<Ping> context)
    {
        Received.TrySetResult();
        return Task.CompletedTask;
    }
}

/// <summary>An IProducer that answers ProduceAsync without a broker.</summary>
public class FakeProducer : DispatchProxy
{
    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        if (method?.Name == nameof(IProducer<string, string>.ProduceAsync) && args?[0] is string topic && args[1] is Message<string, string> message)
        {
            return Task.FromResult(new DeliveryResult<string, string> { Topic = topic, Message = message, Partition = new Partition(0), Offset = new Offset(42) });
        }
        if (method?.Name == nameof(IDisposable.Dispose)) return null;
        throw new NotSupportedException(method?.Name);
    }
}
