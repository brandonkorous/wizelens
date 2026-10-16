namespace WizeLens.Model;

/// <summary>Values for <see cref="Span.Kind"/>.</summary>
public static class SpanKinds
{
    public const string Server = "server";
    public const string Client = "client";
    public const string Internal = "internal";
    public const string Producer = "producer";
    public const string Consumer = "consumer";
}

/// <summary>Values for <see cref="Span.Status"/>.</summary>
public static class SpanStatuses
{
    public const string Unset = "unset";
    public const string Ok = "ok";
    public const string Error = "error";
}

/// <summary>Values for <see cref="Span.Category"/>.</summary>
public static class SpanCategories
{
    public const string HttpServer = "http.server";
    public const string HttpClient = "http.client";
    public const string Db = "db";
    public const string Messaging = "messaging";
    public const string Browser = "browser";
    public const string Internal = "internal";
}

/// <summary>One timed operation. OTel-shaped. See docs/CONTRACT.md.</summary>
public sealed class Span
{
    public string TraceId { get; set; } = "";
    public string SpanId { get; set; } = "";
    public string? ParentSpanId { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = SpanKinds.Internal;
    public string Category { get; set; } = SpanCategories.Internal;
    public string Service { get; set; } = "";
    public double StartMs { get; set; }
    public double DurationMs { get; set; }
    public string Status { get; set; } = SpanStatuses.Unset;
    public string? StatusMessage { get; set; }
    public Dictionary<string, object?> Attributes { get; set; } = [];
    public List<SpanEvent> Events { get; set; } = [];

    /// <summary>Reads an attribute as a string, whatever form it was stored in.</summary>
    public string? Attr(string key) => Attributes.TryGetValue(key, out var value) ? AttributeValue.AsString(value) : null;
}

public sealed class SpanEvent
{
    public string Name { get; set; } = "";
    public double TimeMs { get; set; }
    public Dictionary<string, object?> Attributes { get; set; } = [];
}

public sealed class LogRecord
{
    public double TimeMs { get; set; }
    public string Level { get; set; } = "info";
    public string Category { get; set; } = "";
    public string Message { get; set; } = "";
    public string Service { get; set; } = "";
    public string? SpanId { get; set; }
    public Dictionary<string, object?> Attributes { get; set; } = [];
}

public class TraceSummary
{
    public string TraceId { get; set; } = "";
    public string RootName { get; set; } = "";
    public string Service { get; set; } = "";
    public double StartMs { get; set; }
    public double DurationMs { get; set; }
    public string Status { get; set; } = SpanStatuses.Unset;
    public int SpanCount { get; set; }
    public int DbCount { get; set; }
    public int HttpClientCount { get; set; }
    public int ErrorCount { get; set; }
    public List<string> Services { get; set; } = [];
    public string? RootMethod { get; set; }
    public string? RootUrl { get; set; }
    public int? RootStatusCode { get; set; }
}

public sealed class Trace : TraceSummary
{
    public List<Span> Spans { get; set; } = [];
    public List<LogRecord> Logs { get; set; } = [];
    public List<string> Remotes { get; set; } = [];

    public TraceSummary ToSummary() => new()
    {
        TraceId = TraceId, RootName = RootName, Service = Service, StartMs = StartMs, DurationMs = DurationMs,
        Status = Status, SpanCount = SpanCount, DbCount = DbCount, HttpClientCount = HttpClientCount,
        ErrorCount = ErrorCount, Services = Services,
        RootMethod = RootMethod, RootUrl = RootUrl, RootStatusCode = RootStatusCode,
    };
}

/// <summary>The JSON body of <c>POST api/client-spans</c>.</summary>
public sealed class ClientSpansRequest
{
    public List<Span> Spans { get; set; } = [];
    public List<ClientLog> Logs { get; set; } = [];
}

/// <summary>A browser log line posted with <see cref="ClientSpansRequest"/>.</summary>
public sealed class ClientLog
{
    public string? TraceId { get; set; }
    public string? SpanId { get; set; }
    public double TimeMs { get; set; }
    public string? Level { get; set; }
    public string? Category { get; set; }
    public string? Message { get; set; }
    public string? Service { get; set; }
    public Dictionary<string, object?>? Attributes { get; set; }
}
