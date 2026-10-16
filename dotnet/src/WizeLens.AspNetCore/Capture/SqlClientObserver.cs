using System.Collections.Concurrent;
using System.Data.Common;
using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using WizeLens.Data;

namespace WizeLens.Capture;

/// <summary>Captures Microsoft.Data.SqlClient commands from its diagnostic listener, with no user code.</summary>
internal sealed class SqlClientObserver(WizeLensOptions options)
    : IHostedService, IObserver<DiagnosticListener>, IObserver<KeyValuePair<string, object?>>, IDisposable
{
    public const string ListenerName = "SqlClientDiagnosticListener";

    private readonly ConcurrentDictionary<Guid, Activity> _open = new();
    private readonly List<IDisposable> _subscriptions = [];
    private IDisposable? _all;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (options.IsEnabled) _all = DiagnosticListener.AllListeners.Subscribe(this);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _all?.Dispose();
        _all = null;
        lock (_subscriptions)
        {
            foreach (var s in _subscriptions) s.Dispose();
            _subscriptions.Clear();
        }
    }

    public void OnNext(DiagnosticListener listener)
    {
        if (listener.Name != ListenerName) return;
        lock (_subscriptions) _subscriptions.Add(listener.Subscribe(this));
    }

    public void OnNext(KeyValuePair<string, object?> e)
    {
        try
        {
            if (e.Key.EndsWith("WriteCommandBefore", StringComparison.Ordinal)) Before(e.Value);
            else if (e.Key.EndsWith("WriteCommandAfter", StringComparison.Ordinal)) After(e.Value, null);
            else if (e.Key.EndsWith("WriteCommandError", StringComparison.Ordinal)) After(e.Value, Read<Exception>(e.Value, "Exception"));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    private void Before(object? payload)
    {
        // Outside a request, or already traced by EF Core or ProfiledDbConnection: skip.
        if (Activity.Current is not { } current || current.Source.Name == WizeLensRuntime.DbSourceName) return;
        if (Read<DbCommand>(payload, "Command") is not { } command || Read<Guid?>(payload, "OperationId") is not { } id) return;
        var activity = DbActivity.Start(command, "sqlclient");
        if (activity is not null) _open[id] = activity;
    }

    private void After(object? payload, Exception? error)
    {
        if (Read<Guid?>(payload, "OperationId") is not { } id || !_open.TryRemove(id, out var activity)) return;
        DbActivity.Stop(activity, error: error);
    }

    private static T? Read<T>(object? payload, string property) =>
        payload?.GetType().GetProperty(property)?.GetValue(payload) is T value ? value : default;

    public void OnCompleted() { }

    public void OnError(Exception error) { }
}
