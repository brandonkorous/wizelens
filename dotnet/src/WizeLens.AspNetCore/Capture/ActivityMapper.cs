using System.Diagnostics;
using WizeLens.Analysis;
using WizeLens.Model;

namespace WizeLens.Capture;

/// <summary>Turns a finished <see cref="Activity"/> into a contract <see cref="Span"/>.</summary>
internal static class ActivityMapper
{
    public const string AspNetCoreSource = "Microsoft.AspNetCore";
    public const string HttpClientSource = "System.Net.Http";

    public static Span ToSpan(Activity activity, string service)
    {
        var span = new Span
        {
            TraceId = activity.TraceId.ToHexString(),
            SpanId = activity.SpanId.ToHexString(),
            ParentSpanId = activity.ParentSpanId == default ? null : activity.ParentSpanId.ToHexString(),
            Kind = MapKind(activity.Kind),
            Service = service,
            StartMs = ToUnixMs(activity.StartTimeUtc),
            DurationMs = activity.Duration.TotalMilliseconds,
            StatusMessage = activity.StatusDescription,
        };

        foreach (var tag in activity.TagObjects)
        {
            span.Attributes[tag.Key] = AttributeValue.Normalize(tag.Value);
        }
        if (span.Attributes.TryGetValue("url.full", out var url) && url is string full)
        {
            span.Attributes["url.full"] = RedactQuery(full);
        }
        if (span.Attributes.TryGetValue("url.query", out var query) && query is string q)
        {
            span.Attributes["url.query"] = RedactQueryString(q);
        }

        foreach (var e in activity.Events)
        {
            var ev = new SpanEvent { Name = e.Name, TimeMs = ToUnixMs(e.Timestamp.UtcDateTime) };
            foreach (var tag in e.Tags) ev.Attributes[tag.Key] = AttributeValue.Normalize(tag.Value);
            span.Events.Add(ev);
        }

        span.Category = MapCategory(activity);
        span.Name = MapName(activity, span);
        span.Status = MapStatus(activity, span);
        GrpcAttributes.Apply(span);
        DriverActivities.Apply(span, activity.Source.Name);
        ExternalSources.ApplyMapped(span, activity.Source.Name);
        MessagingActivities.Apply(span, activity);
        if (span.Status == SpanStatuses.Error && span.StatusMessage is null)
        {
            span.StatusMessage = span.Events.FirstOrDefault(e => e.Name == "exception")?.Attributes.GetValueOrDefault("exception.message") as string
                ?? span.Attr("error.type");
        }

        return span;
    }

    public static double ToUnixMs(DateTime utc) => (utc - DateTime.UnixEpoch).TotalMilliseconds;

    /// <summary>Replaces values of sensitive query keys (token, password, ...) with "[redacted]".</summary>
    internal static string RedactQuery(string url) => WizeLensRuntime.Redactor.RedactUrl(url);

    internal static string RedactQueryString(string query) => WizeLensRuntime.Redactor.RedactQueryString(query);

    private static string MapKind(ActivityKind kind) => kind switch
    {
        ActivityKind.Server => SpanKinds.Server,
        ActivityKind.Client => SpanKinds.Client,
        ActivityKind.Producer => SpanKinds.Producer,
        ActivityKind.Consumer => SpanKinds.Consumer,
        _ => SpanKinds.Internal,
    };

    // Some libraries send only the operation and the table, with no db.system.name.
    private static readonly string[] DbMarkers = ["db.system.name", "db.system", "db.query.text", "db.operation.name", "db.collection.name"];

    private static string MapCategory(Activity activity)
    {
        var source = activity.Source.Name;
        if (source == AspNetCoreSource) return SpanCategories.HttpServer;
        if (source == HttpClientSource || source == ExternalSources.GrpcClient) return SpanCategories.HttpClient;
        if (activity.GetTagItem("messaging.system") is not null || ExternalSources.IsMessaging(source)) return SpanCategories.Messaging;
        if (source == WizeLensRuntime.DbSourceName) return SpanCategories.Db;
        if (DbMarkers.Any(k => activity.GetTagItem(k) is not null)) return SpanCategories.Db;
        if (activity.GetTagItem("http.request.method") is not null)
        {
            return activity.Kind == ActivityKind.Client ? SpanCategories.HttpClient : SpanCategories.HttpServer;
        }
        return SpanCategories.Internal;
    }

    private static string MapName(Activity activity, Span span)
    {
        if (span.Category == SpanCategories.HttpClient)
        {
            var method = span.Attr("http.request.method") ?? "HTTP";
            if (Uri.TryCreate(span.Attr("url.full"), UriKind.Absolute, out var uri))
            {
                return $"{method} {uri.Authority}{uri.AbsolutePath}";
            }
            return method;
        }
        return activity.DisplayName;
    }

    private static string MapStatus(Activity activity, Span span)
    {
        // A server span that answered 4xx is not a failure, even with an exception (OpenTelemetry's rule).
        if (span.Category == SpanCategories.HttpServer && RequestParts.IsClientErrorStatus(span)) return SpanStatuses.Unset;
        // An answer the app expected (a deliberate 503) is not a failure, unless something threw.
        var threw = span.Events.Any(e => e.Name == "exception");
        if (span.Category == SpanCategories.HttpServer && RequestParts.IsExpectedSpan(span) && !threw) return SpanStatuses.Unset;
        if (activity.Status == ActivityStatusCode.Error) return SpanStatuses.Error;
        if (threw) return SpanStatuses.Error;

        var code = AttributeValue.AsDouble(span.Attributes.GetValueOrDefault("http.response.status_code"));
        if (code is not null)
        {
            if (span.Category == SpanCategories.HttpServer && code >= 500) return SpanStatuses.Error;
            if (span.Category == SpanCategories.HttpClient && code >= 400) return SpanStatuses.Error;
        }
        if (span.Category == SpanCategories.HttpClient && span.Attr("error.type") is not null) return SpanStatuses.Error;

        return activity.Status == ActivityStatusCode.Ok ? SpanStatuses.Ok : SpanStatuses.Unset;
    }
}
