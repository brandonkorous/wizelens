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

    [Fact]
    public async Task An_exception_the_developer_page_caught_is_still_on_the_request()
    {
        // eShop: UseWizeLens early, UseDeveloperExceptionPage inside it; the page answers 500 and the exception never reaches WizeLens.
        await using var app = await TestApp.StartAsync(a =>
        {
            a.UseDeveloperExceptionPage();
            a.MapGet("/basket", string () => throw new InvalidOperationException("Sequence contains no matching element"));
        });
        var trace = await app.TraceAsync(await app.Client.GetAsync("/basket"));

        var request = Assert.Single(trace.Spans, s => s.Category == SpanCategories.HttpServer);
        Assert.Equal(SpanStatuses.Error, request.Status);
        Assert.Equal("Sequence contains no matching element", request.StatusMessage);
        Assert.Contains(request.Events, e => e.Name == "exception" && e.Attributes["exception.type"]?.ToString() == "System.InvalidOperationException");
    }
}
