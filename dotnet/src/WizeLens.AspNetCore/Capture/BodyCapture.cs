using System.Diagnostics;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace WizeLens.Capture;

/// <summary>Counts request and response body bytes and, when enabled, keeps the start of a text or JSON response body.</summary>
internal sealed class BodyCapture
{
    public const string ResponseBodyAttribute = "wizelens.response.body";
    public const string ResponseBodyTruncatedAttribute = "wizelens.response.body.truncated";
    public const int MaxBodyBytes = 16 * 1024;

    private readonly HttpContext _context;
    private readonly IHttpResponseBodyFeature _prior;
    private readonly StreamResponseBodyFeature _feature;
    private readonly CaptureStream _response;
    private readonly CaptureStream? _request;

    private BodyCapture(HttpContext context, bool keepResponse)
    {
        _context = context;
        _prior = context.Features.Get<IHttpResponseBodyFeature>()!;
        _response = new CaptureStream(_prior.Stream, keepResponse ? MaxBodyBytes : 0, () => IsText(context.Response.ContentType));
        _feature = new StreamResponseBodyFeature(_response, _prior);
        context.Features.Set<IHttpResponseBodyFeature>(_feature);
        if (context.Request.ContentLength is null && context.Request.Body is { CanRead: true } body)
        {
            _request = new CaptureStream(body, 0);
            context.Request.Body = _request;
        }
    }

    public static BodyCapture? Start(HttpContext context, bool keepResponse) =>
        context.Features.Get<IHttpResponseBodyFeature>() is null ? null : new(context, keepResponse);

    public async Task FinishAsync(Activity activity, bool succeeded)
    {
        try
        {
            if (succeeded) await _feature.CompleteAsync().ConfigureAwait(false);
        }
        catch (IOException)
        {
        }
        finally
        {
            _context.Features.Set(_prior);
        }
        AddSizes(activity);
        if (_response.Kept.Length > 0) AddBody(activity);
    }

    internal static bool IsText(string? contentType)
    {
        if (string.IsNullOrEmpty(contentType)) return false;
        var type = contentType.Split(';')[0].Trim().ToLowerInvariant();
        return type.StartsWith("text/", StringComparison.Ordinal) || type == "application/json" || type.EndsWith("+json", StringComparison.Ordinal);
    }

    private void AddSizes(Activity activity)
    {
        var requestSize = _context.Request.ContentLength ?? _request?.Count;
        if (requestSize is > 0) activity.SetTag("http.request.body.size", requestSize.Value);
        var responseSize = _context.Response.ContentLength ?? _response.Count;
        if (responseSize > 0 || _context.Response.ContentLength is not null) activity.SetTag("http.response.body.size", responseSize);
    }

    private void AddBody(Activity activity)
    {
        var kept = _response.Kept.ToArray();
        activity.SetTag(ResponseBodyAttribute, Encoding.UTF8.GetString(kept));
        activity.SetTag(ResponseBodyTruncatedAttribute, _response.Count > kept.Length);
    }
}
