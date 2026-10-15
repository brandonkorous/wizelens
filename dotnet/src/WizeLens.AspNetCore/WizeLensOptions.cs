namespace WizeLens;

/// <summary>Where WizeLens keeps traces.</summary>
public enum WizeLensStorage
{
    /// <summary>A SQLite file (see <see cref="WizeLensOptions.StoragePath"/>). Traces survive restarts.</summary>
    Sqlite,

    /// <summary>Memory only. Traces are lost when the app stops.</summary>
    Memory,
}

/// <summary>Settings for WizeLens add-on.</summary>
public sealed class WizeLensOptions
{
    /// <summary>Default keys whose values are replaced with "[redacted]".</summary>
    public static readonly IReadOnlyList<string> DefaultRedactKeys =
    [
        "authorization", "cookie", "password", "passwd", "secret", "token", "apikey", "api_key", "connectionstring",
    ];

    /// <summary>Turns WizeLens on or off. <c>null</c> (the default) means on in Development only.</summary>
    public bool? Enabled { get; set; }

    /// <summary>Where the dashboard and API live. Default <c>/_wizelens</c>.</summary>
    public string BasePath { get; set; } = "/_wizelens";

    /// <summary>Name shown for spans from this app. Default: the application name.</summary>
    public string? ServiceName { get; set; }

    /// <summary>How many traces to keep (in memory and on disk). The oldest trace is dropped first. Default 2000.</summary>
    public int MaxTraces { get; set; } = 2000;

    /// <summary>Traces older than this are dropped. Default 24 hours.</summary>
    public TimeSpan MaxAge { get; set; } = TimeSpan.FromHours(24);

    /// <summary>Where traces are kept. Default <see cref="WizeLensStorage.Sqlite"/>, so they survive restarts.</summary>
    public WizeLensStorage Storage { get; set; } = WizeLensStorage.Sqlite;

    /// <summary>The SQLite file. Relative paths start at the content root. Default <c>.wizelens/traces.db</c>.</summary>
    public string? StoragePath { get; set; }

    /// <summary>Exposes a read-only MCP endpoint at <c>{BasePath}/mcp</c> for AI agents. Off by default.</summary>
    public bool EnableMcp { get; set; }

    /// <summary>Attribute, header and parameter names (case-insensitive substrings) to redact.</summary>
    public List<string> RedactKeys { get; set; } = [.. DefaultRedactKeys];

    /// <summary>How many repeats of one query or HTTP call in a trace count as N+1.</summary>
    public int NPlusOneThreshold { get; set; } = 5;

    /// <summary>Queries at or above this duration (ms) count as slow.</summary>
    public double SlowQueryMs { get; set; } = 100;

    internal bool IsEnabled { get; set; }

    internal string NormalizedBasePath => "/" + BasePath.Trim('/');
}
