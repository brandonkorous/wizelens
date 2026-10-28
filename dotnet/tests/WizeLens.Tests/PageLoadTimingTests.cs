using WizeLens.Analysis;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>A server page (a Razor page) loaded by the browser: its render time comes from the page view, as in the HUD.</summary>
public class PageLoadTimingTests
{
    private static readonly string T = new('d', 32);

    [Fact]
    public void A_page_load_counts_first_paint_and_render_after_the_first_byte()
    {
        var server = new Span
        {
            TraceId = T, SpanId = "s1", Name = "GET /Basket", Category = SpanCategories.HttpServer, Kind = SpanKinds.Server, Service = "Web", StartMs = 1005, DurationMs = 4,
            Attributes = new() { ["http.request.method"] = "GET", ["url.path"] = "/Basket", ["http.response.status_code"] = 200 },
        };
        var view = new Span
        {
            TraceId = T, SpanId = "p1", Name = "pageview /Basket", Category = SpanCategories.Browser, Service = "browser", StartMs = 1000, DurationMs = 85,
            Attributes = new() { ["wizelens.browser.type"] = "pageview", ["wizelens.browser.navigation"] = "load", ["wizelens.page.ttfb_ms"] = 11.0, ["wizelens.page.fcp_ms"] = 85.0 },
        };

        var trace = WizeLens.Storage.TraceBuilder.Build(T, [view, server], [], []);
        var row = RequestItems.Of(trace)!;

        // The page view is the root and has no status; the trace takes the server's (a 500 page shows 500).
        Assert.Equal(("pageview /Basket", 200), (trace.RootName, trace.RootStatusCode));
        Assert.Equal(85, row.DurationMs);
        Assert.Equal(74, row.RenderMs);
        Assert.Equal(7, row.NetworkMs);
    }
}
