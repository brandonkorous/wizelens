// Running a search: the request, the page it returns, its cursor, and the memory runner (in-app and tests).
using System.Text;
using System.Text.Json;
using WizeLens.Model;

namespace WizeLens.Search;

/// <summary>Where the last page stopped: newest first, then trace id, then owner (span id or log index).</summary>
public sealed record SearchCursor(double TimeMs, string TraceId, string Owner);

/// <summary>A time window in epoch ms: From is in it, To is not.</summary>
public sealed record SearchWindow(double From, double To);

/// <summary>TraceIds, when set, limits the search to those traces: tag matching (Tagging/TagMatch.cs) checks one page of rows.</summary>
public sealed record SearchQuery(string Kind, SearchNode? Node, SearchWindow Window, int Limit, SearchCursor? Cursor = null, string? Env = null, IReadOnlyList<string>? TraceIds = null);

/// <summary>One page of results; pass Next back as the cursor for the next page (null on the last page).</summary>
public sealed record SearchPage(string Kind, IReadOnlyList<object> Items, string? Next);

public static class SearchRun
{
    /// <summary>Most results one page may ask for.</summary>
    public const int PageMax = 200;

    /// <summary>Base64 of the JSON array [timeMs, traceId, owner], as btoa(JSON.stringify(...)) writes it.</summary>
    public static string EncodeCursor(SearchCursor c)
    {
        var json = $"[{JsText.Number(c.TimeMs)},{JsText.JsonString(c.TraceId)},{JsText.JsonString(c.Owner)}]";
        if (json.Any(ch => ch > 0xFF)) throw new FormatException("A cursor can only hold Latin-1 characters.");
        return Convert.ToBase64String(Encoding.Latin1.GetBytes(json));
    }

    /// <summary>A cursor from its text, or null when it is missing or broken.</summary>
    public static SearchCursor? DecodeCursor(string? s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        try
        {
            using var doc = JsonDocument.Parse(Encoding.Latin1.GetString(JsText.Atob(s)));
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return null;
            var parts = doc.RootElement.EnumerateArray().Take(3).ToList();
            if (parts.Count < 3 || parts[0].ValueKind != JsonValueKind.Number) return null;
            if (parts[1].ValueKind != JsonValueKind.String || parts[2].ValueKind != JsonValueKind.String) return null;
            return new SearchCursor(parts[0].GetDouble(), parts[1].GetString()!, parts[2].GetString()!);
        }
        catch (Exception e) when (e is FormatException or JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>Result order: newest first, then trace id and owner in code-unit order (SQL <c>COLLATE "C"</c>).</summary>
    public static int CompareEntries(SearchCursor a, SearchCursor b)
    {
        if (a.TimeMs != b.TimeMs) return b.TimeMs.CompareTo(a.TimeMs);
        if (a.TraceId != b.TraceId) return string.CompareOrdinal(a.TraceId, b.TraceId) < 0 ? -1 : 1;
        return a.Owner == b.Owner ? 0 : string.CompareOrdinal(a.Owner, b.Owner) < 0 ? -1 : 1;
    }

    /// <summary>One page of results and the cursor after it, from rows already sorted and past the cursor.</summary>
    public static (List<T> Rows, string? Next) PageOf<T>(IReadOnlyList<T> rows, int limit, Func<T, SearchCursor> keyOf)
    {
        var page = rows.Take(limit).ToList();
        return (page, rows.Count > limit && page.Count > 0 ? EncodeCursor(keyOf(page[^1])) : null);
    }

    /// <summary>A page size from 1 to <see cref="PageMax"/>; 50 when it is not given.</summary>
    public static int ClampLimit(double? n) =>
        n is { } v && !double.IsNaN(v) ? (int)Math.Max(1, Math.Min(PageMax, Math.Floor(v))) : 50;

    /// <summary>Search traces held in memory.</summary>
    public static SearchPage SearchMemory(IEnumerable<Trace> traces, SearchQuery q)
    {
        var match = SearchMatch.Compile(q.Node);
        var limit = ClampLimit(q.Limit);
        static SearchCursor KeyOf(DocEntry e) => new(e.TimeMs, JsText.Of(e.Doc.Fields.GetValueOrDefault("trace")), e.Owner);
        var hits = new List<DocEntry>();
        var only = q.TraceIds is null ? null : new HashSet<string>(q.TraceIds, StringComparer.Ordinal);
        foreach (var t in traces)
        {
            if (only is not null && !only.Contains(t.TraceId)) continue;
            foreach (var e in SearchItems.DocEntries(t, q.Kind, q.Env))
            {
                if (e.TimeMs < q.Window.From || e.TimeMs >= q.Window.To) continue;
                if (q.Cursor is not null && CompareEntries(KeyOf(e), q.Cursor) <= 0) continue;
                if (match(e.Doc)) hits.Add(e);
            }
        }
        var sorted = hits.OrderBy(KeyOf, Comparer<SearchCursor>.Create(CompareEntries)).ToList();
        var (rows, next) = PageOf(sorted, limit, KeyOf);
        return new SearchPage(q.Kind, [.. rows.Select(e => e.Item())], next);
    }
}
