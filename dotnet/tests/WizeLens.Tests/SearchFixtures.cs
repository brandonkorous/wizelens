using System.Text.Json;
using WizeLens.Model;
using WizeLens.Search;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>The traces of SearchFixtures.mjs, built in .NET, and the TS results for them in SearchFixtures.json.</summary>
internal static class SearchFixtures
{
    public static readonly string T1 = new('a', 32), T2 = new('b', 32), T3 = new('c', 32);

    /// <summary>A window that holds every fixture span and log.</summary>
    public static readonly SearchWindow Window = new(0, 10_000);

    /// <summary>A file under the repo root, found by walking up from the test folder.</summary>
    public static string RepoFile(params string[] parts)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var path = Path.Combine([dir.FullName, .. parts]);
            if (File.Exists(path)) return path;
        }
        throw new FileNotFoundException($"{string.Join('/', parts)} was not found above the test folder.");
    }

    private static readonly Lazy<JsonElement> Ts = new(() =>
        JsonDocument.Parse(File.ReadAllText(RepoFile("dotnet", "tests", "WizeLens.Tests", "SearchFixtures.json"))).RootElement);

    /// <summary>One part of the TS results: items, queries, suggest, req, or sug.</summary>
    public static JsonElement Expected(string name) => Ts.Value.GetProperty(name);

    private static Span Sp(string traceId, string spanId, string name, double startMs, double durationMs, string category, Dictionary<string, object?> attributes, string? parent = null, string kind = SpanKinds.Internal) => new()
    {
        TraceId = traceId, SpanId = spanId, ParentSpanId = parent, Name = name, Category = category, Service = "api",
        StartMs = startMs, DurationMs = durationMs, Attributes = attributes, Kind = kind,
    };

    private static Span Server() => new()
    {
        TraceId = T1, SpanId = "s1", Name = "POST /orders/42", Kind = SpanKinds.Server, Category = SpanCategories.HttpServer, Service = "api",
        StartMs = 1000, DurationMs = 800, Status = SpanStatuses.Error, StatusMessage = "boom",
        Attributes = new()
        {
            ["http.request.method"] = "post", ["url.path"] = "/orders/42", ["url.query"] = "x=1&flag", ["http.response.status_code"] = 503,
            ["user_agent.original"] = "curl", ["client.address"] = "10.0.0.1", ["enduser.id"] = "alice", ["wizelens.request.id"] = "req-1",
            ["wizelens.tag.beta"] = true, ["wizelens.tag.plan"] = "pro", ["tenant"] = 7,
        },
        Events = [new SpanEvent { Name = "exception", TimeMs = 1001, Attributes = new() { ["exception.message"] = "kaboom" } }],
    };

    private static IEnumerable<Span> Trace1Spans()
    {
        yield return Server();
        for (var i = 0; i < 5; i++)
            yield return Sp(T1, $"d{i}", "SELECT a", 1010 + i * 20, 10, SpanCategories.Db, new()
            {
                ["db.query.text"] = "SELECT * FROM a WHERE id = @id", ["wizelens.db.parameters"] = i < 2 ? "{\"@id\":1}" : $"{{\"@id\":{i}}}",
            }, "s1", SpanKinds.Client);
        yield return Sp(T1, "d5", "slow", 1200, 150, SpanCategories.Db, new() { ["db.query.text"] = "SELECT pg_sleep(1)" }, "s1");
        yield return Sp(T1, "d6", "slow2", 1210, 120, SpanCategories.Db, new() { ["db.query.text"] = "SELECT 2" }, "s1");
        yield return Sp(T1, "d7", "set", 1500, 200, SpanCategories.Db, new() { ["db.query.text"] = "SET x = 1" }, "s1");
        for (var i = 0; i < 5; i++)
            yield return Sp(T1, $"c{i}", "GET", 1100 + i, 5, SpanCategories.HttpClient, new() { ["http.request.method"] = "get", ["url.full"] = "http://inventory:8080/items/1?q=2" }, "s1", SpanKinds.Client);
    }

    private static IEnumerable<Span> Trace2Spans()
    {
        var fetch = Sp(T2, "f1", "fetch /api/cart", 5000, 200, SpanCategories.Browser, new()
        {
            ["url.full"] = "https://shop.test/api/cart?id=3", ["http.request.method"] = "GET", ["http.response.status_code"] = 200, ["wizelens.browser.render_ms"] = 30,
        });
        fetch.Service = "browser";
        var grpc = Sp(T2, "g1", "Cart/Get", 5050, 100, SpanCategories.HttpServer, new() { ["rpc.system"] = "grpc", ["rpc.service"] = "Cart", ["rpc.method"] = "Get" }, "f1", SpanKinds.Server);
        grpc.Service = "cart";
        return [fetch, grpc];
    }

    /// <summary>A request with N+1s, a duplicate, slow queries, a wait, tags, and an error; a gRPC call from the browser; a page view.</summary>
    public static List<Trace> Traces()
    {
        var log = new LogRecord { TimeMs = 1300, Level = "warn", Category = "Orders", Message = "slow bank", Service = "api", SpanId = "s1", Attributes = new() { ["attempt"] = 2 } };
        var pageview = Sp(T3, "p1", "pageview /", 9000, 1, SpanCategories.Browser, new() { ["wizelens.browser.type"] = "pageview" });
        pageview.Service = "browser";
        return [TraceBuilder.Build(T1, Trace1Spans(), [log], []), TraceBuilder.Build(T2, Trace2Spans(), [], []), TraceBuilder.Build(T3, [pageview], [], [])];
    }
}
