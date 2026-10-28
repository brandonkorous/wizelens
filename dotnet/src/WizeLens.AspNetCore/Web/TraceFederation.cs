using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using WizeLens.Capture;
using WizeLens.Model;
using WizeLens.Storage;
using Trace = WizeLens.Model.Trace;

namespace WizeLens.Web;

internal static class WizeLensJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    /// <summary>For JSON shown as text (SQL params, Mongo commands): "Peña —" stays as typed, not "Peña —". The UI escapes it on render.</summary>
    public static readonly JsonSerializerOptions Text = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
}

/// <summary>Learns about downstream services from the <c>X-WizeLens-Endpoint</c> response header.</summary>
internal sealed class WizeLensFederationHandler(TraceStore store) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        try
        {
            if (!WizeLensContext.Suppressed
                && Activity.Current is { } activity
                && response.Headers.TryGetValues(WizeLensMiddleware.EndpointHeader, out var values))
            {
                foreach (var value in values)
                {
                    if (Uri.TryCreate(value, UriKind.Absolute, out _)) store.AddRemote(activity.TraceId.ToHexString(), value);
                }
            }
        }
        catch
        {
            // WizeLens must never break the app.
        }
        return response;
    }
}

/// <summary>Builds a full cross-service trace by pulling parts from the services listed in <c>remotes</c>.</summary>
internal sealed class TraceFederation(TraceStore store, IHttpClientFactory httpClientFactory, ILogger<TraceFederation> logger)
{
    public const string ClientName = "WizeLens.Federation";
    public const int MaxHops = 5;

    public async Task<Trace?> GetAsync(string traceId, bool federate, int hop, CancellationToken cancellationToken)
    {
        var local = store.Get(traceId);
        if (!federate || hop > MaxHops || local is null || local.Remotes.Count == 0) return local;

        var client = httpClientFactory.CreateClient(ClientName);
        var fetches = local.Remotes.Select(async remote =>
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, $"{remote.TrimEnd('/')}/api/traces/{traceId}?federate=true");
                request.Headers.Add(WizeLensMiddleware.HopHeader, (hop + 1).ToString(CultureInfo.InvariantCulture));
                using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return null;
                return await response.Content.ReadFromJsonAsync<Trace>(WizeLensJson.Options, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
            {
                logger.LogDebug(ex, "Could not federate trace {TraceId} from {Remote}", traceId, remote);
                return null;
            }
        });

        var parts = (await Task.WhenAll(fetches).ConfigureAwait(false)).OfType<Trace>();
        var merged = TraceBuilder.Merge(traceId, [local, .. parts]);
        merged.Remotes = [.. merged.Remotes.Where(r => !store.IsSelfEndpoint(r))];
        return merged;
    }
}
