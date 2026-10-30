using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>Log lines outside a request go into loose batches, with a level floor and sampling.</summary>
public class LooseLogTests
{
    private readonly TraceStore _store = new(100);
    private readonly WizeLensOptions _options = new() { Service = "svc", IsEnabled = true };

    private void Write(LogLevel level, string message, string category = "Jobs") =>
        LogCapture.WriteLoose(_store, _options, new LogEntry(level, category, message), null);

    private List<LogRecord> Loose() => [.. _store.Recent(1000).Where(t => TraceIds.IsLoose(t.TraceId)).SelectMany(t => t.Logs)];

    private static LogRecord Line(double timeMs) => new() { TimeMs = timeMs, Level = "info", Category = "c", Message = "m", Service = "svc" };

    [Fact]
    public void Loose_line_keeps_service_and_level_without_a_span()
    {
        Write(LogLevel.Warning, "disk low");
        var log = Assert.Single(Loose());
        Assert.Equal(("warn", "svc", "Jobs", "disk low"), (log.Level, log.Service, log.Category, log.Message));
        Assert.Null(log.SpanId);
    }

    [Fact]
    public void Lines_below_the_floor_and_wizelens_lines_are_dropped()
    {
        _options.Logs.MinLevel = LogLevel.Warning;
        Write(LogLevel.Information, "info");
        Write(LogLevel.Error, "hub down", "WizeLens.Hub.HubExporter");
        Write(LogLevel.Error, "kept");
        Assert.Equal(["kept"], Loose().Select(l => l.Message));
    }

    [Fact]
    public void Sample_rate_zero_drops_info_but_keeps_warnings()
    {
        _options.Logs.Rate = 0;
        for (var i = 0; i < 20; i++) Write(LogLevel.Information, "info");
        Write(LogLevel.Warning, "warn");
        Assert.Equal(["warn"], Loose().Select(l => l.Message));
    }

    [Fact]
    public void Outside_off_drops_every_loose_line()
    {
        _options.Logs.Outside = false;
        Write(LogLevel.Critical, "boom");
        Assert.Equal(0, _store.Count);
    }

    [Fact]
    public void Batch_starts_again_in_a_new_five_minute_window_and_when_full()
    {
        var start = 1_700_000_100_000d - 1_700_000_100_000d % TraceStore.LooseWindowMs;
        _store.AddLooseLog(Line(start + 1));
        _store.AddLooseLog(Line(start + 2));
        _store.AddLooseLog(Line(start + TraceStore.LooseWindowMs));
        var ids = _store.Recent(10).Select(t => t.TraceId).ToList();
        Assert.Equal(2, ids.Count);
        Assert.All(ids, id => Assert.Matches("^0{16}[0-9a-f]{16}$", id));
        Assert.Contains(_store.Recent(10), t => t.Logs.Count == 2);

        for (var i = 0; i < TraceStore.LooseMaxLogs + 1; i++) _store.AddLooseLog(Line(start + TraceStore.LooseWindowMs + 1));
        Assert.Equal(3, _store.Count);
    }

    [Fact]
    public void Loose_batches_have_their_own_cap_and_never_push_out_requests()
    {
        var store = new TraceStore(maxTraces: 4);
        for (var i = 1; i <= 4; i++) store.AddSpan(new Span { TraceId = $"a{i:x31}", SpanId = $"{i:x16}", StartMs = i });
        for (var w = 0; w < 15; w++) store.AddLooseLog(Line(w * TraceStore.LooseWindowMs));
        Assert.Equal(store.MaxLooseBatches, store.Recent(100).Count(t => TraceIds.IsLoose(t.TraceId)));
        Assert.Equal(4, store.Summaries(100).Count);
    }

    [Fact]
    public void Level_names_parse_like_the_variable()
    {
        Assert.Equal(LogLevel.Information, WizeLensLogs.ParseLevel("Info"));
        Assert.Equal(LogLevel.Warning, WizeLensLogs.ParseLevel("warning"));
        Assert.Null(WizeLensLogs.ParseLevel("loud"));
    }
}

/// <summary>Loose batches in a running app: ILogger lines outside a request, and the read API.</summary>
[Collection(TestApp.Collection)]
public class LooseLogAppTests
{
    [Fact]
    public async Task ILogger_line_outside_a_request_is_kept_and_only_full_reads_list_it()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/ok", () => Results.Ok()));
        app.App.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Orders.Jobs").LogInformation("nightly sync done");
        await app.Client.GetAsync("/ok");

        var full = await app.Client.GetFromJsonAsync<List<Trace>>("/_wizelens/api/traces?full=true", WizeLensJson.Options);
        var batch = Assert.Single(full!, t => TraceIds.IsLoose(t.TraceId) && t.Logs.Any(l => l.Message == "nightly sync done"));
        var log = batch.Logs.Single(l => l.Message == "nightly sync done");
        Assert.Equal(("info", "test-api", "Orders.Jobs"), (log.Level, log.Service, log.Category));

        var list = await app.Client.GetFromJsonAsync<List<TraceSummary>>("/_wizelens/api/traces", WizeLensJson.Options);
        Assert.DoesNotContain(list!, t => TraceIds.IsLoose(t.TraceId));
        Assert.Contains(list!, t => t.RootUrl == "/ok");
        var one = await app.Client.GetFromJsonAsync<Trace>($"/_wizelens/api/traces/{batch.TraceId}", WizeLensJson.Options);
        Assert.Contains(one!.Logs, l => l.Message == "nightly sync done");
    }

    [Fact]
    public async Task Search_finds_loose_lines_as_logs_but_never_as_traces_or_requests()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/ok", () => Results.Ok()));
        app.App.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Orders.Jobs").LogWarning("reindex finished");
        await app.Client.GetAsync("/ok");

        var logs = await app.Client.GetFromJsonAsync<JsonElement>("/_wizelens/api/search?kind=logs&q=reindex", WizeLensJson.Options);
        var item = Assert.Single(logs.GetProperty("items").EnumerateArray());
        Assert.Equal("reindex finished", item.GetProperty("message").GetString());
        Assert.True(TraceIds.IsLoose(item.GetProperty("traceId").GetString()!));
        foreach (var kind in new[] { "traces", "requests", "spans" })
        {
            var page = await app.Client.GetFromJsonAsync<JsonElement>($"/_wizelens/api/search?kind={kind}", WizeLensJson.Options);
            Assert.DoesNotContain(page.GetProperty("items").EnumerateArray(), i => TraceIds.IsLoose(i.GetProperty("traceId").GetString()!));
        }
        Assert.DoesNotContain(app.Store.All(), t => TraceIds.IsLoose(t.TraceId));
    }
}
