using System.Diagnostics;
using System.Reflection;
using Microsoft.Extensions.Hosting;

namespace WizeLens.AutoInstrumentation;

/// <summary>Listens to one DiagnosticListener while the auto install owns WizeLens. A code install hooks these itself.</summary>
internal abstract class DiagnosticObserver(WizeLensInstall install, WizeLensOptions options, string listenerName)
    : IHostedService, IObserver<DiagnosticListener>, IObserver<KeyValuePair<string, object?>>, IDisposable
{
    private readonly List<IDisposable> _subscriptions = [];
    private IDisposable? _all;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (options.IsEnabled && install.Auto) _all = DiagnosticListener.AllListeners.Subscribe(this);
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
        if (listener.Name != listenerName) return;
        lock (_subscriptions) _subscriptions.Add(listener.Subscribe(this, Wants));
    }

    public void OnNext(KeyValuePair<string, object?> e)
    {
        try
        {
            OnEvent(e.Key, e.Value);
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    /// <summary>True for the events this observer reads. The listener skips building the others.</summary>
    protected abstract bool Wants(string name);

    protected abstract void OnEvent(string name, object? payload);

    /// <summary>A property of an event payload, read by name because the payload types live in assemblies WizeLens does not reference.</summary>
    protected static T? Read<T>(object? payload, string property) =>
        payload?.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(payload) is T value ? value : default;

    public void OnCompleted() { }

    public void OnError(Exception error) { }
}
