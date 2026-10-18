using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using WizeLens.Search;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>The in-app search API (docs/SEARCH-PLAN.md), over this service's own traces in memory. Env is the app's environment.</summary>
internal static class SearchEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("api/search", Search);
        group.MapGet("api/search/suggest", Suggest);
    }

    private static double NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>The first value of a query parameter, or null when it is missing (as URLSearchParams.get).</summary>
    private static Func<string, string?> Params(HttpRequest request) =>
        key => request.Query.TryGetValue(key, out var v) && v.Count > 0 ? v[0] ?? "" : null;

    /// <summary><c>GET api/search?q=&amp;kind=&amp;range=&amp;limit=&amp;cursor=</c>. A bad search answers 400 with the error's position.</summary>
    private static IResult Search(HttpRequest request, TraceStore store, WizeLensOptions options, IHostEnvironment environment)
    {
        var r = SearchRequests.SearchRequestOf(Params(request), NowMs(), options.MaxAge.TotalMilliseconds);
        if (!r.Ok) return Results.Json(ErrorBody(r.Error!, r.Start, r.End), WizeLensJson.Options, statusCode: StatusCodes.Status400BadRequest);
        var watch = Stopwatch.StartNew();
        var page = SearchRun.SearchMemory(store.All(), r.Query! with { Env = environment.EnvironmentName });
        var tookMs = Math.Round(watch.Elapsed.TotalMilliseconds, MidpointRounding.AwayFromZero);
        return Results.Json(new { kind = page.Kind, items = page.Items, next = page.Next, tookMs, settling = (object?)null }, WizeLensJson.Options);
    }

    /// <summary><c>GET api/search/suggest?field=&amp;prefix=&amp;range=&amp;limit=</c>.</summary>
    private static IResult Suggest(HttpRequest request, TraceStore store, WizeLensOptions options, IHostEnvironment environment)
    {
        var r = SearchRequests.SuggestRequestOf(Params(request), NowMs(), options.MaxAge.TotalMilliseconds);
        if (!r.Ok) return Results.Json(ErrorBody(r.Error!, null, null), WizeLensJson.Options, statusCode: StatusCodes.Status400BadRequest);
        return Results.Json(new { items = SearchSuggest.SuggestMemory(store.All(), r.Request! with { Env = environment.EnvironmentName }) }, WizeLensJson.Options);
    }

    /// <summary>The 400 body: <c>{ ok: false, error }</c>, with start and end when the search did not parse.</summary>
    private static Dictionary<string, object?> ErrorBody(string error, int? start, int? end)
    {
        var body = new Dictionary<string, object?> { ["ok"] = false, ["error"] = error };
        if (start is not null) body["start"] = start;
        if (end is not null) body["end"] = end;
        return body;
    }
}
