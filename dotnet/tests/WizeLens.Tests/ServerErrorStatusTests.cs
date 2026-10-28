using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using WizeLens.Model;

namespace WizeLens.Tests;

/// <summary>A request that answers 5xx with no exception still says why it is an error.</summary>
[Collection(TestApp.Collection)]
public class ServerErrorStatusTests
{
    [Fact]
    public async Task A_500_answer_reads_HTTP_500()
    {
        await using var app = await TestApp.StartAsync(a => a.MapPost("/save", () => Results.StatusCode(500)));
        var trace = await app.TraceAsync(await app.Client.PostAsync("/save", null));

        var request = Assert.Single(trace.Spans, s => s.Category == SpanCategories.HttpServer);
        Assert.Equal(SpanStatuses.Error, request.Status);
        Assert.Equal("HTTP 500", request.StatusMessage);
    }
}
