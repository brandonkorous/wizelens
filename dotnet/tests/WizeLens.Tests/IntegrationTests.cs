using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using WizeLens.Data;
using WizeLens.Model;
using WizeLens.Web;

namespace WizeLens.Tests;

[Collection(TestApp.Collection)]
public class IntegrationTests
{
    [Fact]
    public async Task Request_is_captured_with_db_span_log_and_headers()
    {
        await using var app = await TestApp.StartAsync(a => a.MapGet("/hello/{name}", HelloAsync));
        var response = await app.Client.GetAsync("/hello/ada");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var traceId = Assert.Single(response.Headers.GetValues("X-WizeLens-Trace"));
        Assert.EndsWith("/_wizelens", Assert.Single(response.Headers.GetValues("X-WizeLens-Endpoint")));

        var summaries = await app.Client.GetFromJsonAsync<List<TraceSummary>>("/_wizelens/api/traces", WizeLensJson.Options);
        var summary = Assert.Single(summaries!);
        Assert.Equal(traceId, summary.TraceId);
        Assert.Equal("GET /hello/{name}", summary.RootName);
        Assert.Equal(1, summary.DbCount);

        var trace = await app.TraceAsync(response);
        var db = Assert.Single(trace.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("sqlite", db.Attr("db.system.name"));
        Assert.Equal("""{"@name":"ada"}""", db.Attr("wizelens.db.parameters"));
        var handler = Assert.Single(trace.Spans, s => s.Attr("wizelens.layer") == "handler");
        Assert.Equal(handler.SpanId, db.ParentSpanId);
        Assert.Equal(TestApp.Root(trace).SpanId, handler.ParentSpanId);
        Assert.Contains(trace.Logs, l => l.Message == "Saying hello to ada");
    }

    [Fact]
    public async Task Dashboard_is_served()
    {
        await using var app = await TestApp.StartAsync(_ => { });
        var ui = await app.Client.GetAsync("/_wizelens/");
        Assert.Equal(HttpStatusCode.OK, ui.StatusCode);
        Assert.Equal("text/html", ui.Content.Headers.ContentType?.MediaType);
    }

    private static async Task<IResult> HelloAsync(string name, ILogger<IntegrationTests> logger)
    {
        logger.LogInformation("Saying hello to {Name}", name);
        await using var connection = new ProfiledDbConnection(new SqliteConnection("Data Source=:memory:"));
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT @name";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "@name";
        parameter.Value = name;
        command.Parameters.Add(parameter);
        return Results.Ok(await command.ExecuteScalarAsync());
    }
}
