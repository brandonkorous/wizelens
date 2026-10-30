using System.Diagnostics;
using System.Text;
using Confluent.Kafka;

namespace WizeLens.Kafka;

/// <summary>Traces Confluent.Kafka produce and process calls; the trace travels in the message's traceparent header.</summary>
public static class WizeLensKafkaExtensions
{
    /// <summary>Activity source name; WizeLens.AspNetCore listens to every WizeLens.* source.</summary>
    public const string SourceName = "WizeLens.Kafka";

    internal const string TraceParentHeader = "traceparent";
    internal const string TraceStateHeader = "tracestate";

    private static readonly ActivitySource Source = new(SourceName, typeof(WizeLensKafkaExtensions).Assembly.GetName().Version?.ToString());

    /// <summary>Produces <paramref name="message"/> in a producer span and writes the trace context into its headers.</summary>
    public static async Task<DeliveryResult<TKey, TValue>> ProduceTracedAsync<TKey, TValue>(
        this IProducer<TKey, TValue> producer, string topic, Message<TKey, TValue> message, CancellationToken cancellationToken = default)
    {
        using var activity = Source.StartActivity($"send {topic}", ActivityKind.Producer);
        Tag(activity, topic, "send", message.Value);
        Inject(activity ?? Activity.Current, message);
        try
        {
            var result = await producer.ProduceAsync(topic, message, cancellationToken).ConfigureAwait(false);
            activity?.SetTag("messaging.destination.partition.id", result.Partition.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
            activity?.SetTag("messaging.kafka.offset", result.Offset.Value);
            return result;
        }
        catch (Exception e)
        {
            Fail(activity, e);
            throw;
        }
    }

    /// <summary>Runs <paramref name="handler"/> in a consumer span that joins the producer's trace.</summary>
    public static async Task ProcessTracedAsync<TKey, TValue>(this ConsumeResult<TKey, TValue> result, Func<ConsumeResult<TKey, TValue>, Task> handler)
    {
        using var activity = StartProcess(result);
        try
        {
            await handler(result).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            Fail(activity, e);
            throw;
        }
    }

    /// <summary>Runs <paramref name="handler"/> in a consumer span that joins the producer's trace.</summary>
    public static void ProcessTraced<TKey, TValue>(this ConsumeResult<TKey, TValue> result, Action<ConsumeResult<TKey, TValue>> handler)
    {
        using var activity = StartProcess(result);
        try
        {
            handler(result);
        }
        catch (Exception e)
        {
            Fail(activity, e);
            throw;
        }
    }

    internal static Activity? StartProcess<TKey, TValue>(ConsumeResult<TKey, TValue> result)
    {
        var parent = Extract(result.Message?.Headers);
        var activity = Source.StartActivity($"process {result.Topic}", ActivityKind.Consumer, parent);
        Tag(activity, result.Topic, "process", result.Message is null ? default : result.Message.Value);
        activity?.SetTag("messaging.destination.partition.id", result.Partition.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        activity?.SetTag("messaging.kafka.offset", result.Offset.Value);
        return activity;
    }

    internal static void Inject<TKey, TValue>(Activity? activity, Message<TKey, TValue> message)
    {
        if (activity?.Id is not { } id || activity.IdFormat != ActivityIdFormat.W3C) return;
        message.Headers ??= [];
        message.Headers.Remove(TraceParentHeader);
        message.Headers.Add(TraceParentHeader, Encoding.UTF8.GetBytes(id));
        if (activity.TraceStateString is { Length: > 0 } state) message.Headers.Add(TraceStateHeader, Encoding.UTF8.GetBytes(state));
    }

    internal static ActivityContext Extract(Headers? headers)
    {
        if (headers is null || !headers.TryGetLastBytes(TraceParentHeader, out var parent)) return default;
        var state = headers.TryGetLastBytes(TraceStateHeader, out var s) ? Encoding.UTF8.GetString(s) : null;
        return ActivityContext.TryParse(Encoding.UTF8.GetString(parent), state, isRemote: true, out var context) ? context : default;
    }

    private static void Tag<TValue>(Activity? activity, string topic, string operation, TValue? value)
    {
        if (activity is null) return;
        activity.SetTag("messaging.system", "kafka");
        activity.SetTag("messaging.destination.name", topic);
        activity.SetTag("messaging.operation.type", operation);
        if (value is byte[] bytes) activity.SetTag("messaging.message.body.size", bytes.Length);
        else if (value is string text) activity.SetTag("messaging.message.body.size", Encoding.UTF8.GetByteCount(text));
    }

    private static void Fail(Activity? activity, Exception error)
    {
        if (activity is null) return;
        activity.AddException(error);
        activity.SetTag("error.type", error.GetType().FullName);
        activity.SetStatus(ActivityStatusCode.Error, error.Message);
    }
}
