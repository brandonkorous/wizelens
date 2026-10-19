using System.Net;
using System.Net.Http.Json;
using WizeLens.Capture;
using WizeLens.Web;

namespace WizeLens.Tests;

// A crawler's clock put its page view 4.6 hours before the server request, so the request read as 4.6 hours long.
[Collection(TestApp.Collection)]
public class BrowserClockTests
{
    private const string TraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    private const string SpanId = "00f067aa0ba902b7";
    private const double Hours = 16_560_000; // 4.6 hours

    [Fact]
    public async Task Browser_spans_events_and_logs_move_onto_the_server_clock()
    {
        await using var app = await TestApp.StartAsync(_ => { });
        var browserNow = ActivityMapper.ToUnixMs(DateTime.UtcNow) - Hours;
        var response = await app.Client.PostAsJsonAsync("/_wizelens/api/client-spans", new
        {
            sentAt = browserNow,
            spans = new[]
            {
                new
                {
                    traceId = TraceId, spanId = SpanId, name = "react renders /pricing", category = "browser",
                    startMs = browserNow - 2000, durationMs = 1500.0,
                    events = new[] { new { name = "click", timeMs = browserNow - 1000 } },
                },
            },
            logs = new[] { new { traceId = TraceId, spanId = SpanId, level = "info", message = "hi", timeMs = browserNow - 500 } },
        });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var trace = app.Store.Get(TraceId)!;
        var span = Assert.Single(trace.Spans);
        Assert.InRange(span.StartMs - (ActivityMapper.ToUnixMs(DateTime.UtcNow) - 2000), -5000, 5000);
        Assert.Equal(1500, span.DurationMs);
        Assert.Equal(1000, Assert.Single(span.Events).TimeMs - span.StartMs, 3);
        Assert.Equal(1500, Assert.Single(trace.Logs).TimeMs - span.StartMs, 3);
    }

    [Fact]
    public void A_small_gap_is_network_time_not_a_wrong_clock()
    {
        Assert.Equal(0, BrowserClock.Offset(1_000_000, 1_003_000));
        Assert.Equal(Hours, BrowserClock.Offset(1_000_000, 1_000_000 + Hours));
        Assert.Equal(-Hours, BrowserClock.Offset(1_000_000 + Hours, 1_000_000));
        Assert.Equal(0, BrowserClock.Offset(null, 1_000_000));
        Assert.Equal(0, BrowserClock.Shift(0, Hours));
    }
}
