using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Logging.Abstractions;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Tests;

public sealed class PersistenceTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "wizelens-tests-" + Guid.NewGuid().ToString("N"));

    private string DbPath => Path.Combine(_dir, ".wizelens", "traces.db");

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }

    [Fact]
    public void Trace_survives_a_round_trip_with_spans_logs_and_remotes()
    {
        var traceId = Id32(1);
        var now = TraceStore.NowMs();

        var first = new TraceStore(100);
        first.AddSpan(new Span
        {
            TraceId = traceId, SpanId = Id16(1), Name = "GET /api/orders", Category = SpanCategories.HttpServer,
            Service = "gateway-api", StartMs = now, DurationMs = 12.5,
            Attributes = { ["http.request.method"] = "GET", ["http.response.status_code"] = 200L, ["cache.hit"] = true },
        });
        first.AddLog(traceId, new LogRecord { TimeMs = now + 1, Message = "first", Service = "gateway-api" });
        first.AddRemote(traceId, "http://localhost:5200/_wizelens");

        using (var storage = SqliteTraceStorage.Open(DbPath, "gateway-api"))
        {
            storage.Write(first.DrainChanges());

            // Only what is new is written the second time.
            first.AddSpan(new Span { TraceId = traceId, SpanId = Id16(2), ParentSpanId = Id16(1), Name = "SELECT", Category = SpanCategories.Db, StartMs = now + 2 });
            first.AddLog(traceId, new LogRecord { TimeMs = now + 3, Message = "second", Service = "gateway-api" });
            var changes = Assert.Single(first.DrainChanges());
            Assert.Single(changes.NewSpans);
            Assert.Equal(1, changes.FirstLogSeq);
            storage.Write([changes]);

            Assert.Empty(first.DrainChanges());
        }

        var second = new TraceStore(100);
        using (var storage = SqliteTraceStorage.Open(DbPath, "gateway-api"))
        {
            foreach (var stored in storage.Load(100)) second.Hydrate(stored);
        }

        var trace = second.Get(traceId);
        Assert.NotNull(trace);
        Assert.Equal([Id16(1), Id16(2)], trace.Spans.Select(s => s.SpanId));
        Assert.Equal(["first", "second"], trace.Logs.Select(l => l.Message));
        Assert.Equal(["http://localhost:5200/_wizelens"], trace.Remotes);
        Assert.Equal("GET", trace.Spans[0].Attr("http.request.method"));
        Assert.Equal("true", trace.Spans[0].Attr("cache.hit"));
        Assert.Equal(200, trace.RootStatusCode);

        // Hydrated data is not written again.
        Assert.Empty(second.DrainChanges());
    }

    [Fact]
    public async Task Storage_service_flushes_on_stop_and_loads_on_start()
    {
        var traceId = Id32(7);
        var options = Options();

        var store = new TraceStore(options.MaxTraces);
        using (var service = NewService(store, options))
        {
            Assert.Equal(DbPath, service.StoragePath);
            await service.StartAsync(CancellationToken.None);
            store.AddSpan(new Span { TraceId = traceId, SpanId = Id16(1), Name = "GET /", StartMs = TraceStore.NowMs() });
            await service.StopAsync(CancellationToken.None);
        }

        var restarted = new TraceStore(options.MaxTraces);
        using (NewService(restarted, options))
        {
            Assert.NotNull(restarted.Get(traceId));
        }
    }

    [Fact]
    public void Storage_falls_back_to_memory_when_the_file_cannot_be_opened()
    {
        Directory.CreateDirectory(_dir);
        var blocker = Path.Combine(_dir, "not-a-folder");
        File.WriteAllText(blocker, "x");
        var options = Options();
        options.StoragePath = Path.Combine(blocker, "traces.db");

        var store = new TraceStore(10);
        using var service = NewService(store, options);

        Assert.Null(service.StoragePath);
        store.AddSpan(new Span { TraceId = Id32(1), SpanId = Id16(1), StartMs = TraceStore.NowMs() });
        service.Flush();
        Assert.NotNull(store.Get(Id32(1)));
    }

    [Fact]
    public void Sqlite_prune_applies_age_then_count()
    {
        var now = TraceStore.NowMs();
        var store = new TraceStore(100);
        for (var i = 1; i <= 6; i++)
        {
            // Trace 1 is two days old. The rest are recent, one minute apart.
            var start = i == 1 ? now - TimeSpan.FromDays(2).TotalMilliseconds : now - (10 - i) * 60_000;
            store.AddSpan(new Span { TraceId = Id32(i), SpanId = Id16(i), StartMs = start });
        }

        using var storage = SqliteTraceStorage.Open(DbPath, "svc");
        storage.Write(store.DrainChanges());
        storage.Prune(maxTraces: 3, cutoffMs: now - TimeSpan.FromHours(24).TotalMilliseconds);

        Assert.Equal([Id32(4), Id32(5), Id32(6)], storage.Load(100).Select(t => t.TraceId));
    }

    [Fact]
    public void Memory_prune_drops_old_traces()
    {
        var now = TraceStore.NowMs();
        var store = new TraceStore(100);
        store.AddSpan(new Span { TraceId = Id32(1), SpanId = Id16(1), StartMs = now - TimeSpan.FromDays(2).TotalMilliseconds });
        store.AddSpan(new Span { TraceId = Id32(2), SpanId = Id16(2), StartMs = now });

        Assert.Equal(1, store.PruneOlderThan(now - TimeSpan.FromHours(24).TotalMilliseconds));
        Assert.Null(store.Get(Id32(1)));
        Assert.NotNull(store.Get(Id32(2)));
    }

    [Fact]
    public void Summaries_filter_by_browser_session()
    {
        var store = new TraceStore(100);
        store.AddSpan(new Span
        {
            TraceId = Id32(1), SpanId = Id16(1), Category = SpanCategories.Browser, Service = "browser", StartMs = 1,
            Attributes = { [TraceStore.SessionAttribute] = "tab-a" },
        });
        store.AddSpan(new Span { TraceId = Id32(1), SpanId = Id16(2), ParentSpanId = Id16(1), StartMs = 2 });
        store.AddSpan(new Span { TraceId = Id32(2), SpanId = Id16(3), StartMs = 3 });
        store.AddSpan(new Span
        {
            TraceId = Id32(3), SpanId = Id16(4), Category = SpanCategories.Browser, StartMs = 4,
            Attributes = { [TraceStore.SessionAttribute] = "tab-b" },
        });

        Assert.Equal([Id32(1)], store.Summaries(10, "tab-a").Select(s => s.TraceId));
        Assert.Equal(3, store.Summaries(10).Count);
        Assert.Empty(store.Summaries(10, "tab-z"));
    }

    [Fact]
    public void Summary_root_fields_come_from_the_root_span()
    {
        var store = new TraceStore(10);
        store.AddSpan(new Span
        {
            TraceId = Id32(1), SpanId = Id16(1), Name = "fetch /api/orders", Category = SpanCategories.Browser, StartMs = 1,
            Attributes = { ["http.request.method"] = "POST", ["url.full"] = "http://localhost:5173/api/orders", ["http.response.status_code"] = 201L },
        });
        store.AddSpan(new Span
        {
            TraceId = Id32(1), SpanId = Id16(2), ParentSpanId = Id16(1), Name = "POST /api/orders", StartMs = 2,
            Attributes = { ["http.request.method"] = "POST", ["url.path"] = "/api/orders", ["http.response.status_code"] = 500L },
        });
        store.AddSpan(new Span
        {
            TraceId = Id32(2), SpanId = Id16(3), Name = "GET /health", StartMs = 3,
            Attributes = { ["http.request.method"] = "GET", ["url.path"] = "/health", ["url.full"] = "http://x/health" },
        });

        var browser = store.Summaries(10).Single(s => s.TraceId == Id32(1));
        Assert.Equal("POST", browser.RootMethod);
        Assert.Equal("http://localhost:5173/api/orders", browser.RootUrl);
        Assert.Equal(201, browser.RootStatusCode);

        var server = store.Summaries(10).Single(s => s.TraceId == Id32(2));
        Assert.Equal("/health", server.RootUrl);
        Assert.Null(server.RootStatusCode);
    }

    private WizeLensOptions Options() => new()
    {
        IsEnabled = true,
        ServesDashboard = true,
        Service = "test",
        StoragePath = DbPath,
    };

    private TraceStorageService NewService(TraceStore store, WizeLensOptions options) =>
        new(store, options, new HostingEnvironment { ContentRootPath = _dir }, NullLogger<TraceStorageService>.Instance);

    private static string Id32(int i) => i.ToString("x32");

    private static string Id16(int i) => i.ToString("x16");
}
