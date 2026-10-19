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

    /// <summary>Turns WizeLens on or off. <c>null</c> (the default) means the WIZELENS_ENABLED variable, else on in Development only.</summary>
    public bool? Enabled { get; set; }

    /// <summary>Serves the dashboard, read API, and MCP. False is send-only: capture and send, no reads. <c>null</c>: WIZELENS_DASHBOARD, else Development only.</summary>
    public bool? Dashboard { get; set; }

    /// <summary>Where the dashboard and API live. Default <c>/_wizelens</c>.</summary>
    public string BasePath { get; set; } = "/_wizelens";

    /// <summary>Name shown for spans from this app. Default: the application name.</summary>
    public string? ServiceName { get; set; }

    /// <summary>How many traces to keep (in memory and on disk). The oldest trace is dropped first. Default 2000.</summary>
    public int MaxTraces { get; set; } = 2000;

    /// <summary>Traces older than this are dropped. Default 24 hours.</summary>
    public TimeSpan MaxAge { get; set; } = TimeSpan.FromHours(24);

    /// <summary>Where traces are kept. Default <see cref="WizeLensStorage.Sqlite"/>, so they survive restarts, or memory when the dashboard is off.</summary>
    public WizeLensStorage? Storage { get; set; }

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

    /// <summary>Keeps the first 16 KB of text and JSON response bodies on the request span. Off by default.</summary>
    public bool CaptureResponseBody { get; set; }

    /// <summary>Also sends everything to this local hub, for example <c>http://localhost:5960</c>. Default: the WIZELENS_HUB variable.</summary>
    public string? HubUrl { get; set; } = Environment.GetEnvironmentVariable("WIZELENS_HUB");

    /// <summary>Access token for the hub. Default: the WIZELENS_HUB_TOKEN variable.</summary>
    public string? HubToken { get; set; } = Environment.GetEnvironmentVariable("WIZELENS_HUB_TOKEN");

    /// <summary>The project this service belongs to, so a shared hub can group it. Default: the WIZELENS_PROJECT variable.</summary>
    public string? Project { get; set; } = Environment.GetEnvironmentVariable("WIZELENS_PROJECT");

    /// <summary>The app's version, kept on every span as <c>service.version</c> for release markers and version compares. Default: the WIZELENS_RELEASE variable, or the entry assembly's informational version.</summary>
    public string? Release { get; set; } = Environment.GetEnvironmentVariable("WIZELENS_RELEASE");

    /// <summary>Keeps only part of the traces, for busy services. Default: all, or the WIZELENS_SAMPLE_RATE variable.</summary>
    public WizeLensSampling Sampling { get; set; } = new();

    /// <summary>Collects metrics from every meter in the app (.NET runtime, ASP.NET Core, HttpClient, your own). On by default.</summary>
    public bool CaptureMetrics { get; set; } = true;

    /// <summary>How often metric points are taken. Default 10 seconds.</summary>
    public TimeSpan MetricsInterval { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>Metric points older than this are dropped from memory. Default 1 hour.</summary>
    public TimeSpan MetricsMaxAge { get; set; } = TimeSpan.FromHours(1);

    internal bool IsEnabled { get; set; }

    /// <summary>True when the dashboard, read API, and MCP answer; false is send-only.</summary>
    internal bool ServesDashboard { get; set; }

    /// <summary>The storage in use: the option, or SQLite with the dashboard and memory without it.</summary>
    internal WizeLensStorage StorageKind => Storage ?? (ServesDashboard ? WizeLensStorage.Sqlite : WizeLensStorage.Memory);

    /// <summary>The entry assembly's informational version without build metadata (the part after '+'), or null.</summary>
    internal static string? EntryVersion()
    {
        var v = System.Reflection.Assembly.GetEntryAssembly()?.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion;
        if (string.IsNullOrWhiteSpace(v)) return null;
        var plus = v.IndexOf('+');
        var clean = (plus > 0 ? v[..plus] : v).Trim();
        return clean.Length > 50 ? clean[..50] : clean;
    }

    /// <summary>Reads an on/off variable ("true", "1", "on", "yes" or "false", "0", "off", "no"). Null when unset or unknown.</summary>
    internal static bool? EnvFlag(string name) => Environment.GetEnvironmentVariable(name)?.Trim().ToLowerInvariant() switch
    {
        "true" or "1" or "on" or "yes" => true,
        "false" or "0" or "off" or "no" => false,
        _ => null,
    };

    /// <summary>True when WizeLens is on and collects metrics.</summary>
    internal bool MetricsOn => IsEnabled && CaptureMetrics;

    /// <summary>Most time series kept; new ones past this are dropped.</summary>
    internal int MaxMetricSeries { get; set; } = Metrics.MetricCollector.DefaultMaxSeries;

    /// <summary>For tests: the HTTP handler the hub sender uses.</summary>
    internal HttpMessageHandler? HubHandler { get; set; }

    /// <summary>The hub base URL without a trailing slash or "/_wizelens", or null when none is set.</summary>
    internal string? NormalizedHubUrl
    {
        get
        {
            var v = HubUrl?.Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(v)) return null;
            if (v.EndsWith("/_wizelens", StringComparison.OrdinalIgnoreCase)) v = v[..^"/_wizelens".Length];
            return v.Contains("://", StringComparison.Ordinal) ? v : "http://" + v;
        }
    }

    internal double StartedMs { get; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    internal string NormalizedBasePath => "/" + BasePath.Trim('/');
}
