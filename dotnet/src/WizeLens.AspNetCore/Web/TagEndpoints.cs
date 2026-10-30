using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using WizeLens.Storage;
using WizeLens.Tagging;

namespace WizeLens.Web;

/// <summary>The in-app tags API: the rules from the Tags option, read-only, and which of them match a page of rows.</summary>
internal static class TagEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("api/tags", (WizeLensOptions options) => Results.Json(new { tags = options.TagList, editable = false, max = TagRules.MaxRules }, WizeLensJson.Options));
        group.MapPost("api/tags/match", MatchAsync);
    }

    /// <summary><c>POST api/tags/match</c> with <c>{ kind, items }</c>: each enabled rule runs as a search over these traces in memory.</summary>
    private static async Task<IResult> MatchAsync(HttpRequest request, TraceStore store, WizeLensOptions options, IHostEnvironment environment)
    {
        JsonElement body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<JsonElement>(request.Body, cancellationToken: request.HttpContext.RequestAborted);
        }
        catch (JsonException)
        {
            body = default;
        }
        var (kind, items, error) = TagMatch.RequestOf(body);
        if (error is not null) return Results.Json(new { ok = false, error }, WizeLensJson.Options, statusCode: StatusCodes.Status400BadRequest);
        var matches = TagMatch.Match(store.All(), kind!, items!, TagRules.Active(options.TagList), environment.EnvironmentName);
        return Results.Json(new { matches }, WizeLensJson.Options);
    }
}
