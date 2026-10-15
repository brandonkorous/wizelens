using WizeLens.Model;

namespace WizeLens.Storage;

/// <summary>Builds a <see cref="Trace"/> (with its summary fields) from spans, logs and remotes.</summary>
internal static class TraceBuilder
{
    public static Trace Build(string traceId, IEnumerable<Span> spans, IEnumerable<LogRecord> logs, IEnumerable<string> remotes)
    {
        var spanList = spans.GroupBy(s => s.SpanId).Select(g => g.First()).OrderBy(s => s.StartMs).ToList();
        var logList = logs.OrderBy(l => l.TimeMs).ToList();
        var ids = spanList.Select(s => s.SpanId).ToHashSet();

        var root = spanList.FirstOrDefault(s => s.ParentSpanId is null)
            ?? spanList.FirstOrDefault(s => !ids.Contains(s.ParentSpanId!))
            ?? spanList.FirstOrDefault();

        var trace = new Trace
        {
            TraceId = traceId,
            Spans = spanList,
            Logs = logList,
            Remotes = [.. remotes.Distinct(StringComparer.OrdinalIgnoreCase)],
            RootName = root?.Name ?? "",
            RootMethod = root?.Attr("http.request.method"),
            RootUrl = root?.Attr("url.path") ?? root?.Attr("url.full"),
            RootStatusCode = root?.Attributes.GetValueOrDefault("http.response.status_code") is { } code
                && AttributeValue.AsDouble(code) is { } number ? (int)number : null,
            Service = root?.Service ?? logList.FirstOrDefault()?.Service ?? "",
            SpanCount = spanList.Count,
            DbCount = spanList.Count(s => s.Category == SpanCategories.Db),
            HttpClientCount = spanList.Count(s => s.Category == SpanCategories.HttpClient),
            ErrorCount = spanList.Count(s => s.Status == SpanStatuses.Error),
            Services = [.. spanList.Select(s => s.Service).Concat(logList.Select(l => l.Service))
                .Where(s => s.Length > 0).Distinct().Order(StringComparer.Ordinal)],
        };

        if (spanList.Count > 0)
        {
            trace.StartMs = spanList.Min(s => s.StartMs);
            trace.DurationMs = spanList.Max(s => s.StartMs + s.DurationMs) - trace.StartMs;
        }
        else if (logList.Count > 0)
        {
            trace.StartMs = logList[0].TimeMs;
            trace.DurationMs = logList[^1].TimeMs - logList[0].TimeMs;
        }

        trace.Status = trace.ErrorCount > 0 ? SpanStatuses.Error : root?.Status ?? SpanStatuses.Unset;
        return trace;
    }

    /// <summary>Merges several views of one trace (local and federated) into one.</summary>
    public static Trace Merge(string traceId, IEnumerable<Trace> parts)
    {
        var list = parts.ToList();
        var logs = list.SelectMany(t => t.Logs)
            .GroupBy(l => (l.TimeMs, l.Service, l.SpanId, l.Message))
            .Select(g => g.First());
        return Build(traceId, list.SelectMany(t => t.Spans), logs, list.SelectMany(t => t.Remotes));
    }
}
