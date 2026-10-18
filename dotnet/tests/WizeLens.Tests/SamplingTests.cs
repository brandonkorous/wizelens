using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Tests;

/// <summary>Sampling keeps part of the traces, plus every trace with an error or a slow span.</summary>
[Collection(TestApp.Collection)]
public class SamplingTests
{
    // The last 8 hex digits pick the trace: ...00000000 is always in a rate, ...ffffffff never is.
    private static readonly string Out = new string('b', 24) + "ffffffff";

    private static Span SpanOf(string traceId, bool root, string status = SpanStatuses.Unset, double durationMs = 1) => new()
    {
        TraceId = traceId,
        SpanId = Guid.NewGuid().ToString("N")[..16],
        ParentSpanId = root ? null : "cccccccccccccccc",
        Name = "x",
        Status = status,
        DurationMs = durationMs,
    };

    private static TraceStore Sampled() => new(100, new WizeLensSampling { Rate = 0.5, KeepSlowMs = 1000 });

    [Theory]
    [InlineData("ffffffffffffffffffffffff19999999", 0.1, true)]
    [InlineData("0000000000000000000000001999999a", 0.1, false)]
    [InlineData("000000000000000000000000ffffffff", 1, true)]
    [InlineData("00000000000000000000000000000000", 0, false)]
    public void Keep_by_rate_matches_lens_core(string traceId, double rate, bool kept) =>
        Assert.Equal(kept, WizeLensSampling.KeepByRate(traceId, rate));

    [Fact]
    public void A_held_trace_is_dropped_when_its_root_ends_fine()
    {
        var store = Sampled();
        store.AddSpan(SpanOf(Out, root: false));
        store.AddRemote(Out, "http://x/_wizelens");
        store.AddSpan(SpanOf(Out, root: true));
        Assert.Null(store.Get(Out));
        Assert.Equal(0, store.Count);
    }

    [Fact]
    public void A_held_trace_is_kept_whole_when_a_span_fails_or_is_slow()
    {
        var store = Sampled();
        store.AddSpan(SpanOf(Out, root: false));
        store.AddLog(Out, new LogRecord { Message = "before" });
        store.AddRemote(Out, "http://x/_wizelens");
        store.AddSpan(SpanOf(Out, root: true, SpanStatuses.Error));
        var trace = store.Get(Out)!;
        Assert.Equal((2, 1, 1), (trace.Spans.Count, trace.Logs.Count, trace.Remotes.Count));

        var slow = new string('d', 24) + "ffffffff";
        store.AddSpan(SpanOf(slow, root: true, durationMs: 1500));
        Assert.NotNull(store.Get(slow));
    }

    [Fact]
    public void A_long_browser_span_does_not_count_as_slow()
    {
        var store = Sampled();
        var span = SpanOf(Out, root: true, durationMs: 9000);
        span.Category = SpanCategories.Browser;
        store.AddSpan(span);
        Assert.Null(store.Get(Out));
    }

    [Fact]
    public async Task An_app_drops_fine_requests_keeps_failed_ones_and_shows_the_setting()
    {
        await using var app = await TestApp.StartAsync(
            a =>
            {
                a.MapGet("/ok", () => "ok");
                a.MapGet("/fail", (HttpContext _) => Results.StatusCode(500));
            },
            o => o.Sampling = new WizeLensSampling { Rate = 0, KeepSlowMs = null });
        var ok = (await app.Client.GetAsync("/ok")).Headers.GetValues("X-WizeLens-Trace").Single();
        var fail = (await app.Client.GetAsync("/fail")).Headers.GetValues("X-WizeLens-Trace").Single();
        await Task.Delay(200);

        Assert.Null(app.Store.Get(ok));
        Assert.NotNull(app.Store.Get(fail));
        var info = await app.Client.GetFromJsonAsync<JsonElement>("/_wizelens/api/info");
        Assert.Equal(0, info.GetProperty("sampling").GetProperty("rate").GetDouble());
        Assert.True(info.GetProperty("sampling").GetProperty("keepErrors").GetBoolean());
    }
}
