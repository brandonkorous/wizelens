using System.Diagnostics;
using System.Globalization;
using StackExchange.Redis.Profiling;
using WizeLens.Data;

namespace WizeLens.Redis;

/// <summary>Fills a Redis command's activity with the contract's db attributes and ends it at the command's own times.</summary>
internal static class RedisSpan
{
    public const string AdapterName = "stackexchange.redis";

    /// <summary>Ends the span with the commands it ran; <paramref name="commandAndKey"/> is "SET user:42", or null for the command alone.</summary>
    public static void Complete(Activity activity, IReadOnlyList<IProfiledCommand> commands, string? commandAndKey)
    {
        var first = commands[0];
        var last = commands[^1];
        var (operation, key) = Split(commandAndKey ?? last.Command);
        var query = Query(operation, key);

        activity.DisplayName = query;
        activity.SetTag("db.system.name", "redis");
        activity.SetTag("db.operation.name", operation);
        activity.SetTag("db.query.text", query);
        if (last.Db >= 0) activity.SetTag("db.namespace", last.Db.ToString(CultureInfo.InvariantCulture));
        activity.SetTag("wizelens.db.parameters", QueryShape.Parameters(key is null ? null : $"{operation} {key}"));
        activity.SetTag("wizelens.db.adapter", AdapterName);
        if (commands.Count > 1) activity.SetTag("wizelens.redis.retransmissions", commands.Count - 1);
        DbActivity.SetServer(activity, last.EndPoint);

        activity.SetStartTime(Utc(first.CommandCreated));
        activity.SetEndTime(Utc(last.CommandCreated) + last.ElapsedTime);
        activity.Stop();
    }

    /// <summary>"GET user:?": the command, then the key with its ids as <c>?</c>.</summary>
    public static string Query(string operation, string? key) => key is null ? operation : $"{operation} {QueryShape.Ids(key)}";

    /// <summary>"SET user:42" becomes ("SET", "user:42"); "PING" has no key.</summary>
    public static (string Operation, string? Key) Split(string commandAndKey)
    {
        var text = commandAndKey.Trim();
        var space = text.IndexOf(' ');
        if (space < 0) return (text.ToUpperInvariant(), null);
        var key = text[(space + 1)..].Trim();
        return (text[..space].ToUpperInvariant(), key.Length == 0 ? null : key);
    }

    private static DateTime Utc(DateTime time) => time.Kind switch
    {
        DateTimeKind.Utc => time,
        DateTimeKind.Local => time.ToUniversalTime(),
        _ => DateTime.SpecifyKind(time, DateTimeKind.Utc),
    };
}
