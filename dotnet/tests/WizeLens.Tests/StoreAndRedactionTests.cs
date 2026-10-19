using WizeLens.Capture;
using WizeLens.Model;
using WizeLens.Storage;

namespace WizeLens.Tests;

public class StoreAndRedactionTests
{
    [Theory]
    [InlineData("Authorization")]
    [InlineData("db.password")]
    [InlineData("X-Api_Key")]
    [InlineData("refresh_token")]
    [InlineData("ConnectionString")]
    public void Sensitive_keys_are_redacted(string key)
    {
        var redactor = new Redactor(WizeLensOptions.DefaultRedactKeys);
        var attributes = redactor.Redact(new Dictionary<string, object?> { [key] = "hunter2", ["user.id"] = 7 });

        Assert.Equal(Redactor.Redacted, attributes[key]);
        Assert.Equal(7L, attributes["user.id"]);
    }

    [Fact]
    public void Sensitive_query_values_are_redacted_in_urls()
    {
        var url = ActivityMapper.RedactQuery("http://x/orders?customerId=3&access_token=abc&page=2");
        Assert.Equal("http://x/orders?customerId=3&access_token=[redacted]&page=2", url);
    }

    [Fact]
    public void Store_evicts_oldest_trace_first()
    {
        var store = new TraceStore(maxTraces: 3);
        for (var i = 1; i <= 5; i++)
        {
            store.AddSpan(new Span { TraceId = $"a{i:x31}", SpanId = $"{i:x16}", StartMs = i });
        }

        Assert.Equal(3, store.Count);
        Assert.Null(store.Get($"a{1:x31}"));
        Assert.Null(store.Get($"a{2:x31}"));
        Assert.NotNull(store.Get($"a{5:x31}"));
        Assert.Equal([$"a{5:x31}", $"a{4:x31}", $"a{3:x31}"], store.Summaries(10).Select(s => s.TraceId));
    }

    [Fact]
    public void Store_never_lists_its_own_endpoint_as_remote()
    {
        var store = new TraceStore(10);
        var traceId = new string('a', 32);
        store.AddSelfEndpoint("http://localhost:5100/_wizelens");
        store.AddSpan(new Span { TraceId = traceId, SpanId = new string('b', 16) });

        store.AddRemote(traceId, "http://localhost:5100/_wizelens/");
        store.AddRemote(traceId, "http://localhost:5200/_wizelens");
        store.AddRemote(traceId, "http://localhost:5200/_wizelens");

        Assert.Equal(["http://localhost:5200/_wizelens"], store.Get(traceId)!.Remotes);
    }
}
