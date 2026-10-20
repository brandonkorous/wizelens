using System.Collections.Concurrent;
using System.Diagnostics;
using WizeLens.Model;

namespace WizeLens.Capture;

/// <summary>Activity sources of libraries WizeLens captures without user code: database drivers, gRPC, and message queues.</summary>
internal static class ExternalSources
{
    public const string Npgsql = "Npgsql";
    public const string MySqlConnector = "MySqlConnector";
    public const string GrpcClient = "Grpc.Net.Client";
    public const string MassTransit = "MassTransit";

    // Sources an add-on package maps onto contract spans (WizeLens.Elasticsearch), with the mapper.
    private static readonly ConcurrentDictionary<string, Action<Span>> Mapped = new(StringComparer.Ordinal);

    /// <summary>Database drivers that report their own commands.</summary>
    public static bool IsDriver(string source) => source is Npgsql or MySqlConnector;

    /// <summary>Message queue libraries: RabbitMQ.Client 7+, Azure Service Bus, and MassTransit.</summary>
    public static bool IsMessaging(string source) =>
        source.StartsWith("RabbitMQ.Client", StringComparison.Ordinal)
        || source.StartsWith("Azure.Messaging.ServiceBus", StringComparison.Ordinal)
        || source == MassTransit;

    public static bool IsListened(string source) => IsDriver(source) || IsMessaging(source) || source == GrpcClient || IsMapped(source);

    /// <summary>Lets an add-on package map a database client's activity source onto db spans. Call it before the app starts.</summary>
    public static void Map(string source, Action<Span> map) => Mapped[source] = map;

    public static bool IsMapped(string source) => Mapped.ContainsKey(source);

    /// <summary>Runs the add-on's mapper for a span of a mapped source.</summary>
    public static void ApplyMapped(Span span, string source)
    {
        if (Mapped.TryGetValue(source, out var map)) map(span);
    }

    /// <summary>A driver activity inside a WizeLens db span (EF Core or ProfiledDbConnection) is the same command; skip it.</summary>
    public static bool IsDuplicateDriverCall(string source) =>
        IsDriver(source) && Activity.Current?.Source.Name == WizeLensRuntime.DbSourceName;

    /// <summary>The HTTP call a mapped database client (Elasticsearch) makes is that db span itself; skip it.</summary>
    public static bool IsWrappedHttpCall(string source) =>
        source == ActivityMapper.HttpClientSource && Activity.Current is { } parent && IsMapped(parent.Source.Name);

    /// <summary>Driver commands outside a request (startup, migrations) are not recorded.</summary>
    public static bool IsOutsideRequest(string source, in ActivityCreationOptions<ActivityContext> options) =>
        (IsDriver(source) || IsMapped(source)) && options.Parent == default;

    /// <summary>Activities that carry no query or message: connection opens and the Service Bus per-message stamp.</summary>
    public static bool IsNoise(Activity activity)
    {
        var source = activity.Source.Name;
        if (IsDriver(source)) return activity.GetTagItem("db.query.text") is null && activity.GetTagItem("db.statement") is null;
        return source == "Azure.Messaging.ServiceBus.Message";
    }
}
