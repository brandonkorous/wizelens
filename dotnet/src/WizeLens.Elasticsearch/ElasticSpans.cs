using WizeLens.Capture;
using WizeLens.Data;
using WizeLens.Model;

namespace WizeLens.Elasticsearch;

/// <summary>Maps the Elastic.Transport activity (the client's own OpenTelemetry span) onto the contract's db attributes.</summary>
internal static class ElasticSpans
{
    /// <summary>The activity source Elastic.Transport (under Elastic.Clients.Elasticsearch 8.10+ and 9) reports requests on.</summary>
    public const string SourceName = "Elastic.Transport";

    public const string AdapterName = "elastic.clients.elasticsearch";

    // The path segment after one of these is a document, scroll, or search id.
    private static readonly HashSet<string> IdMarkers = new(StringComparer.Ordinal)
    {
        "_doc", "_create", "_update", "_source", "_explain", "_termvectors", "_async_search", "scroll",
    };

    // Client and product versions, and the full URL (its query string can hold values): noise, or never stored.
    private static readonly string[] Dropped =
    [
        "elastic.transport.product.name", "elastic.transport.product.version", "elastic.transport.version",
        "elastic.transport.attempted_nodes", "user_agent.original", "db.elasticsearch.schema_url", "url.full", "db.statement",
    ];

    public static void Apply(Span span)
    {
        SpanTags.Rename(span, "db.system", "db.system.name");
        SpanTags.Rename(span, "db.operation", "db.operation.name");
        span.Attributes.TryAdd("db.system.name", "elasticsearch");
        var method = (SpanTags.Text(span, "http.request.method") ?? "GET").ToUpperInvariant();
        var uri = Uri.TryCreate(SpanTags.Text(span, "url.full"), UriKind.Absolute, out var u) ? u : null;
        var path = uri?.AbsolutePath ?? "/";
        var index = SpanTags.Text(span, "db.elasticsearch.path_parts.index") ?? IndexOf(path);

        span.Attributes["db.query.text"] = $"{method} {PathShape(path)}";
        if (index is not null)
        {
            span.Attributes["db.namespace"] = index;
            span.Attributes["db.collection.name"] = index;
        }
        // POST and PUT carry a body WizeLens never reads, so their values are unknown: no fingerprint.
        if (method is "GET" or "HEAD" or "DELETE") span.Attributes["wizelens.db.parameters"] = QueryShape.Parameters($"{method} {uri?.PathAndQuery ?? path}");
        span.Attributes["wizelens.db.adapter"] = AdapterName;
        var operation = SpanTags.Text(span, "db.operation.name") ?? span.Name;
        span.Name = index is null ? operation : $"{operation} {index}";
        Drop(span);
    }

    /// <summary>"/orders/_doc/42" becomes "/orders/_doc/?": document ids and other ids become <c>?</c>.</summary>
    public static string PathShape(string path)
    {
        var segments = path.Split('/');
        for (var i = 0; i < segments.Length; i++)
        {
            var segment = Uri.UnescapeDataString(segments[i]);
            var isId = i > 0 && IdMarkers.Contains(Uri.UnescapeDataString(segments[i - 1])) && segment.Length > 0 && !segment.StartsWith('_');
            segments[i] = isId ? QueryShape.Placeholder : QueryShape.Ids(segment);
        }
        return string.Join('/', segments);
    }

    /// <summary>The index of "/orders/_search"; null for cluster-wide paths such as "/_search".</summary>
    public static string? IndexOf(string path)
    {
        var first = Uri.UnescapeDataString(path.TrimStart('/').Split('/')[0]);
        return first.Length == 0 || first.StartsWith('_') ? null : first;
    }

    private static void Drop(Span span)
    {
        SpanTags.Remove(span, Dropped);
        foreach (var key in span.Attributes.Keys.Where(k => k.StartsWith("db.elasticsearch.path_parts.", StringComparison.Ordinal)).ToList())
        {
            span.Attributes.Remove(key);
        }
    }
}
