using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using WizeLens.Storage;

namespace WizeLens.Capture;

/// <summary>Listens to ASP.NET Core, HttpClient and wizelens activities and stores them as spans.</summary>
internal sealed class WizeLensActivityListener(TraceStore store, WizeLensOptions options) : IHostedService, IDisposable
{
    private ActivityListener? _listener;

    public static bool IsProfiledSource(string name) =>
        name == ActivityMapper.AspNetCoreSource
        || name == ActivityMapper.HttpClientSource
        || name.StartsWith("WizeLens", StringComparison.Ordinal);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!options.IsEnabled) return Task.CompletedTask;

        // .NET 9+ replaces the query string in url.full with "*". WizeLens needs the query keys to find
        // N+1 HTTP calls, so it turns that off and redacts sensitive query values itself (see ActivityMapper).
        AppContext.SetSwitch("System.Net.Http.DisableUriRedaction", true);

        _listener = new ActivityListener
        {
            ShouldListenTo = source => IsProfiledSource(source.Name),
            Sample = (ref ActivityCreationOptions<ActivityContext> _) =>
                WizeLensContext.Suppressed ? ActivitySamplingResult.None : ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = OnStopped,
        };
        ActivitySource.AddActivityListener(_listener);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _listener?.Dispose();
        _listener = null;
    }

    private void OnStopped(Activity activity)
    {
        if (activity.GetCustomProperty(WizeLensContext.IgnoreProperty) is not null) return;
        if (activity.Parent?.GetCustomProperty(WizeLensContext.IgnoreProperty) is not null) return;

        try
        {
            var span = ActivityMapper.ToSpan(activity, options.ServiceName ?? "app");
            store.AddSpan(WizeLensRuntime.Redactor.Redact(span));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }
}
