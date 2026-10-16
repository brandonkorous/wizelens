using System.Text.RegularExpressions;
using WizeLens.Capture;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>Checks and stores browser log lines from <c>POST api/client-spans</c>.</summary>
internal static partial class ClientLogs
{
    public const int MaxLogs = 100;
    public const int MaxMessage = 4000;
    public const int MaxName = 100;

    private static readonly HashSet<string> Levels = ["trace", "debug", "info", "warn", "error", "critical"];

    /// <summary>Stores the valid lines, at most <see cref="MaxLogs"/>; returns how many were stored.</summary>
    public static int Add(TraceStore store, IEnumerable<ClientLog>? logs)
    {
        var added = 0;
        foreach (var log in (logs ?? []).Take(MaxLogs))
        {
            if (ToRecord(log) is not { } record) continue;
            store.AddLog(log.TraceId!.ToLowerInvariant(), WizeLensRuntime.Redactor.Redact(record));
            added++;
        }
        return added;
    }

    /// <summary>The stored form of one line, or null when its trace or span id is not valid.</summary>
    internal static LogRecord? ToRecord(ClientLog? log)
    {
        if (log is null || !TraceIdRegex().IsMatch(log.TraceId ?? "")) return null;
        var hasSpan = !string.IsNullOrEmpty(log.SpanId);
        if (hasSpan && !SpanIdRegex().IsMatch(log.SpanId!)) return null;
        var level = log.Level?.ToLowerInvariant() ?? "";
        return new LogRecord
        {
            TimeMs = double.IsFinite(log.TimeMs) && log.TimeMs > 0 ? log.TimeMs : ActivityMapper.ToUnixMs(DateTime.UtcNow),
            Level = Levels.Contains(level) ? level : "info",
            Category = Cap(log.Category, MaxName, "console"),
            Message = Cap(log.Message, MaxMessage, ""),
            Service = Cap(log.Service, MaxName, "browser"),
            SpanId = hasSpan ? log.SpanId!.ToLowerInvariant() : null,
            Attributes = log.Attributes is null ? [] : new(log.Attributes),
        };
    }

    private static string Cap(string? value, int max, string fallback) =>
        string.IsNullOrEmpty(value) ? fallback : value.Length <= max ? value : value[..max];

    [GeneratedRegex("^[0-9a-fA-F]{32}$")]
    private static partial Regex TraceIdRegex();

    [GeneratedRegex("^[0-9a-fA-F]{16}$")]
    private static partial Regex SpanIdRegex();
}
