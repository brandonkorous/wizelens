// The search API's inputs, read the same way by every host: `api/search?q=&kind=&range=&from=&to=&env=&limit=&cursor=`.
namespace WizeLens.Search;

/// <summary>A search query, or the error to send back (400) with its span when the search did not parse.</summary>
public sealed record SearchRequest(bool Ok, SearchQuery? Query, string? Error = null, int? Start = null, int? End = null);

/// <summary>A suggest request, or the error to send back (400).</summary>
public sealed record SuggestRequestResult(bool Ok, SuggestRequest? Request, string? Error = null);

public static class SearchRequests
{
    /// <summary>The time ranges a search can ask for, in ms.</summary>
    public static readonly IReadOnlyList<(string Name, double Ms)> TimeRanges =
    [
        ("15m", 15 * 60_000d), ("1h", 60 * 60_000d), ("6h", 6 * 60 * 60_000d), ("24h", 24 * 60 * 60_000d),
        ("7d", 7 * 24 * 60 * 60_000d), ("30d", 30 * 24 * 60 * 60_000d),
    ];

    /// <summary>The ms of a named range, or null when there is no such range.</summary>
    public static double? RangeMs(string name) => TimeRanges.Where(r => r.Name == name).Select(r => (double?)r.Ms).FirstOrDefault();

    /// <summary>The window: from/to in epoch ms, else range (default 24h) back from now. A string when it is invalid or too long.</summary>
    private static (SearchWindow? Window, string? Error) WindowOf(Func<string, string?> p, double now, double maxMs)
    {
        var from = JsText.ParseNumber(p("from") ?? "");
        var to = p("to") is { } t ? JsText.ParseNumber(t) : now;
        if (p("from") is not null)
        {
            if (!double.IsFinite(from) || !double.IsFinite(to) || from >= to) return (null, "from must be before to, both in epoch ms.");
            return to - from > maxMs ? (null, "This window is longer than the data kept here.") : (new SearchWindow(from, to), null);
        }
        var range = p("range") ?? "24h";
        if (RangeMs(range) is not { } ms) return (null, $"Unknown range \"{range}\". Use {string.Join(", ", TimeRanges.Select(r => r.Name))}.");
        return ms > maxMs ? (null, "This range is longer than the data kept here.") : (new SearchWindow(now - ms, now), null);
    }

    /// <summary>A search query from URL parameters (<paramref name="p"/> gives null when one is missing). <paramref name="maxMs"/> is how far back the host keeps data.</summary>
    public static SearchRequest SearchRequestOf(Func<string, string?> p, double now, double maxMs)
    {
        var kind = p("kind") ?? SearchKinds.Requests;
        if (!SearchKinds.All.Contains(kind)) return new(false, null, $"Unknown kind \"{kind}\". Use {string.Join(", ", SearchKinds.All)}.");
        var (window, error) = WindowOf(p, now, maxMs);
        if (window is null) return new(false, null, error);
        var parsed = SearchCheck.Check(p("q") ?? "");
        if (!parsed.Ok) return new(false, null, parsed.Error, parsed.Start, parsed.End);
        var cursor = p("cursor");
        if (!string.IsNullOrEmpty(cursor) && SearchRun.DecodeCursor(cursor) is null) return new(false, null, "This cursor is not valid. Start again without one.");
        var limit = SearchRun.ClampLimit(p("limit") is { } l && JsText.ParseNumber(l) is var n && n != 0 && !double.IsNaN(n) ? n : null);
        var env = p("env") is { Length: > 0 } e ? e : null;
        return new(true, new SearchQuery(kind, parsed.Node, window, limit, SearchRun.DecodeCursor(cursor), env));
    }

    /// <summary><c>api/search/suggest?field=&amp;prefix=&amp;range=&amp;from=&amp;to=&amp;limit=</c>: no field asks for fields and attribute keys.</summary>
    public static SuggestRequestResult SuggestRequestOf(Func<string, string?> p, double now, double maxMs)
    {
        var (window, error) = WindowOf(p, now, maxMs);
        if (window is null) return new(false, null, error);
        var n = JsText.ParseNumber(p("limit") ?? "");
        var limit = (int)Math.Max(1, Math.Min(50, Math.Floor(n == 0 || double.IsNaN(n) ? 20 : n)));
        var prefix = p("prefix") ?? "";
        return new(true, new SuggestRequest(p("field") is { Length: > 0 } f ? f : null, prefix[..Math.Min(200, prefix.Length)], window, limit));
    }
}
