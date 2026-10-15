using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using WizeLens.Data;
using WizeLens.Model;
using WizeLens.Web;

namespace WizeLens.Tests;

public class IntegrationTests
{
    [Fact]
    public async Task Request_is_captured_with_db_span_log_and_headers()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        builder.Services.AddWizeLens(o =>
        {
            o.ServiceName = "test-api";
            o.Storage = WizeLensStorage.Memory;
        });

        await using var app = builder.Build();
        app.UseWizeLens();
        app.MapGet("/hello/{name}", async (string name, ILogger<IntegrationTests> logger) =>
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
        });
        await app.StartAsync();

        var client = app.GetTestClient();
        var response = await client.GetAsync("/hello/ada");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var traceId = Assert.Single(response.Headers.GetValues("X-WizeLens-Trace"));
        Assert.EndsWith("/_wizelens", Assert.Single(response.Headers.GetValues("X-WizeLens-Endpoint")));

        var summaries = await client.GetFromJsonAsync<List<TraceSummary>>("/_wizelens/api/traces", WizeLensJson.Options);
        var summary = Assert.Single(summaries!);
        Assert.Equal(traceId, summary.TraceId);
        Assert.Equal("GET /hello/{name}", summary.RootName);
        Assert.Equal(1, summary.DbCount);

        var trace = await client.GetFromJsonAsync<Trace>($"/_wizelens/api/traces/{traceId}", WizeLensJson.Options);
        var db = Assert.Single(trace!.Spans, s => s.Category == SpanCategories.Db);
        Assert.Equal("sqlite", db.Attr("db.system.name"));
        Assert.Equal("""{"@name":"ada"}""", db.Attr("wizelens.db.parameters"));
        Assert.Equal(trace.Spans[0].SpanId, db.ParentSpanId);
        Assert.Contains(trace.Logs, l => l.Message == "Saying hello to ada");

        var ui = await client.GetAsync("/_wizelens/");
        Assert.Equal(HttpStatusCode.OK, ui.StatusCode);
        Assert.Equal("text/html", ui.Content.Headers.ContentType?.MediaType);
    }
}
