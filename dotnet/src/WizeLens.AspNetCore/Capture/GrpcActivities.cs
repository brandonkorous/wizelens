using System.Diagnostics;
using WizeLens.Model;

namespace WizeLens.Capture;

/// <summary>Adds the contract's rpc.* attributes to gRPC calls; grpc-dotnet tags them with grpc.method and grpc.status_code.</summary>
internal static class GrpcAttributes
{
    private const string MethodTag = "grpc.method";
    private const string StatusTag = "grpc.status_code";

    /// <summary>Turns grpc.* tags into rpc.* attributes, names the span {service}/{method}, and flags a non-zero status.</summary>
    public static void Apply(Span span)
    {
        if (SpanTags.Text(span, MethodTag) is not { } path) return;
        var trimmed = path.TrimStart('/');
        var slash = trimmed.LastIndexOf('/');
        var service = slash > 0 ? trimmed[..slash] : trimmed;
        var method = slash > 0 ? trimmed[(slash + 1)..] : "";
        span.Attributes["rpc.system"] = "grpc";
        span.Attributes["rpc.service"] = service;
        span.Attributes["rpc.method"] = method;
        span.Name = slash > 0 ? $"{service}/{method}" : service;
        if (span.Category == SpanCategories.HttpClient) span.Attributes.TryAdd("http.request.method", "POST");
        if (AttributeValue.AsDouble(span.Attributes.GetValueOrDefault(StatusTag)) is { } code)
        {
            span.Attributes["rpc.grpc.status_code"] = (long)code;
            if (code != 0) span.Status = SpanStatuses.Error;
            if (code != 0) span.StatusMessage ??= $"gRPC status {(long)code}";
        }
        SpanTags.Remove(span, MethodTag, StatusTag);
    }
}

/// <summary>Merges a gRPC client call (GrpcOut) with the HttpClient call under it into one http.client span.</summary>
internal static class GrpcClientCalls
{
    private const string StashKey = "WizeLens.GrpcHttpSpan";

    /// <summary>The span to store for <paramref name="activity"/>, or null when it waits for its gRPC call to finish.</summary>
    public static Span? Complete(Activity activity, string service)
    {
        var source = activity.Source.Name;
        if (source == ActivityMapper.HttpClientSource && activity.Parent?.Source.Name == ExternalSources.GrpcClient)
        {
            activity.Parent.SetCustomProperty(StashKey, ActivityMapper.ToSpan(activity, service));
            return null;
        }
        var call = ActivityMapper.ToSpan(activity, service);
        if (source != ExternalSources.GrpcClient || activity.GetCustomProperty(StashKey) is not Span http) return call;
        // Keep the HTTP span id: the called service's server span points to it.
        http.ParentSpanId = call.ParentSpanId;
        http.StartMs = call.StartMs;
        http.DurationMs = call.DurationMs;
        http.Name = call.Name;
        http.Status = call.Status == SpanStatuses.Error ? SpanStatuses.Error : http.Status;
        http.StatusMessage ??= call.StatusMessage;
        foreach (var (key, value) in call.Attributes.Where(a => a.Key.StartsWith("rpc.", StringComparison.Ordinal))) http.Attributes[key] = value;
        return http;
    }
}
