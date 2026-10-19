using System.Reflection;
using StackExchange.Redis.Profiling;

namespace WizeLens.Redis;

/// <summary>Reads "COMMAND key" (never the values) from a profiled command; the profiling API itself gives only the command name.</summary>
internal static class RedisMessage
{
    private const BindingFlags Instance = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    // Internal ProfiledCommand.Message.CommandAndKey (2.x and 3.x), as OpenTelemetry reads it; if it moves, spans show the command alone.
    private static readonly Lazy<(FieldInfo Message, PropertyInfo CommandAndKey)?> Members = new(Find);

    /// <summary>"SET user:42" for a real SE.Redis command; null when it cannot be read.</summary>
    public static string? CommandAndKey(IProfiledCommand command)
    {
        try
        {
            if (Members.Value is not { } members || !members.Message.DeclaringType!.IsInstanceOfType(command)) return null;
            var message = members.Message.GetValue(command);
            return message is null ? null : members.CommandAndKey.GetValue(message) as string;
        }
        catch
        {
            return null;
        }
    }

    private static (FieldInfo, PropertyInfo)? Find()
    {
        var assembly = typeof(IProfiledCommand).Assembly;
        var field = assembly.GetType("StackExchange.Redis.Profiling.ProfiledCommand")?.GetField("Message", Instance);
        var property = assembly.GetType("StackExchange.Redis.Message")?.GetProperty("CommandAndKey", Instance);
        return field is null || property is null ? null : (field, property);
    }
}
