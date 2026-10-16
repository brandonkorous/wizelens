using System.Diagnostics;
using WizeLens.Data;
using WizeLens.Model;

namespace WizeLens.Capture;

/// <summary>Moves database driver tags (Npgsql, MySqlConnector) onto the contract's db attributes.</summary>
internal static class DriverActivities
{
    private static readonly string[] Dropped =
    [
        "db.connection_string", "db.npgsql.data_source", "db.user", "db.connection_id", "db.npgsql.connection_id",
        "thread.id", "net.transport",
    ];

    public static void Apply(Span span, string source)
    {
        if (!ExternalSources.IsDriver(source)) return;
        SpanTags.Rename(span, "db.statement", "db.query.text");
        SpanTags.Rename(span, "db.name", "db.namespace");
        SpanTags.Rename(span, "db.system", "db.system.name");
        SpanTags.Rename(span, "net.peer.ip", "server.address");
        SpanTags.Rename(span, "net.peer.port", "server.port");
        SpanTags.Remove(span, Dropped);
        span.Attributes["wizelens.db.adapter"] = source == ExternalSources.Npgsql ? "npgsql" : "mysqlconnector";
        var sql = SpanTags.Text(span, "db.query.text") ?? "";
        var operation = DbActivity.OperationName(sql);
        var collection = DbActivity.CollectionName(sql);
        if (operation is not null) span.Attributes.TryAdd("db.operation.name", operation);
        if (collection is not null) span.Attributes.TryAdd("db.collection.name", collection);
        span.Name = collection is null ? operation ?? "db" : $"{operation} {collection}";
    }
}

/// <summary>Gives message queue spans the contract's operation, destination, and name ({operation} {destination}).</summary>
internal static class MessagingActivities
{
    public static void Apply(Span span, Activity activity)
    {
        if (span.Category != SpanCategories.Messaging) return;
        var operation = OperationOf(span, activity);
        var destination = DestinationOf(span);
        span.Attributes["messaging.operation.type"] = operation;
        span.Attributes["messaging.destination.name"] = destination;
        if (activity.Source.Name == ExternalSources.MassTransit) span.Attributes.TryAdd("messaging.system", "masstransit");
        SpanTags.Rename(span, "messaging.message_id", "messaging.message.id");
        span.Name = $"{operation} {destination}";
    }

    private static string OperationOf(Span span, Activity activity)
    {
        var raw = (SpanTags.Text(span, "messaging.operation.type") ?? SpanTags.Text(span, "messaging.operation") ?? "").ToLowerInvariant();
        if (raw is "send" or "publish" or "create") return "send";
        if (raw is "receive") return "receive";
        if (raw is "process" or "deliver") return "process";
        if (activity.Kind == ActivityKind.Producer) return "send";
        if (activity.Kind == ActivityKind.Consumer) return "process";
        var name = activity.DisplayName;
        if (name.Contains("Send", StringComparison.OrdinalIgnoreCase) || name.Contains("Schedule", StringComparison.OrdinalIgnoreCase)) return "send";
        return name.Contains("Receive", StringComparison.OrdinalIgnoreCase) || name.Contains("Peek", StringComparison.OrdinalIgnoreCase) ? "receive" : "process";
    }

    private static string DestinationOf(Span span)
    {
        var destination = SpanTags.Text(span, "messaging.destination.name");
        if (string.IsNullOrEmpty(destination) || destination == "amq.default")
        {
            destination = SpanTags.Text(span, "messaging.rabbitmq.destination.routing_key")
                ?? SpanTags.Text(span, "messaging.masstransit.input_address")
                ?? SpanTags.Text(span, "messaging.masstransit.destination_address");
        }
        return ShortName(destination) ?? "unknown";
    }

    /// <summary>"urn:message:Shop:OrderPlaced" becomes "OrderPlaced"; "rabbitmq://host/vhost/orders?x=1" becomes "orders".</summary>
    private static string? ShortName(string? destination)
    {
        if (string.IsNullOrEmpty(destination)) return null;
        if (destination.StartsWith("urn:message:", StringComparison.Ordinal)) return destination[(destination.LastIndexOf(':') + 1)..];
        if (!Uri.TryCreate(destination, UriKind.Absolute, out var uri) || uri.Scheme is "amqp" or "sb" && uri.AbsolutePath == "/") return destination;
        var last = Uri.UnescapeDataString(uri.AbsolutePath.TrimEnd('/').Split('/')[^1]);
        return last.Length == 0 ? destination : last.StartsWith("urn:message:", StringComparison.Ordinal) ? ShortName(last) : last;
    }
}
