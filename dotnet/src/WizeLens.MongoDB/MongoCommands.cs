using System.Collections.Concurrent;
using System.Diagnostics;
using MongoDB.Driver.Core.Events;
using WizeLens.Capture;
using WizeLens.Data;

namespace WizeLens.MongoDB;

/// <summary>Turns the driver's command started, succeeded, and failed events into one client activity per command.</summary>
internal sealed class MongoCommands
{
    /// <summary>Activity source name; WizeLens.AspNetCore listens to every WizeLens.* source.</summary>
    public const string SourceName = "WizeLens.MongoDB";

    public const string AdapterName = "mongodb.driver";

    // Commands that never got their end event are not kept past this many.
    private const int MaxOpen = 10_000;

    public static readonly MongoCommands Shared = new();

    internal static readonly ActivitySource Source = new(SourceName, typeof(MongoCommands).Assembly.GetName().Version?.ToString());

    private readonly ConcurrentDictionary<int, Activity> _open = new();

    /// <summary>Commands started and not yet ended.</summary>
    internal int OpenCount => _open.Count;

    public void Started(CommandStartedEvent e)
    {
        try
        {
            if (!Source.HasListeners() || WizeLensContext.Suppressed || MongoQuery.IsHidden(e.CommandName)) return;
            // Commands outside a request (startup, index builds) are not recorded, as with SQL drivers.
            if (Activity.Current is not { } parent || _open.Count >= MaxOpen) return;
            var collection = MongoQuery.Collection(e.CommandName, e.Command);
            var activity = Source.StartActivity(collection is null ? e.CommandName : $"{e.CommandName} {collection}", ActivityKind.Client);
            // The event may run in a method that is not async, so the new activity must not stay current for the caller.
            Activity.Current = parent;
            if (activity is null) return;
            Tag(activity, e, collection);
            _open[e.RequestId] = activity;
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    public void Succeeded(CommandSucceededEvent e)
    {
        if (!_open.TryRemove(e.RequestId, out var activity)) return;
        try
        {
            if (MongoQuery.ReturnedRows(e.Reply) is { } rows) activity.SetTag("db.response.returned_rows", rows);
            DbActivity.Stop(activity, MongoQuery.AffectedRows(e.CommandName, e.Reply));
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    public void Failed(CommandFailedEvent e)
    {
        if (!_open.TryRemove(e.RequestId, out var activity)) return;
        try
        {
            DbActivity.Stop(activity, error: e.Failure);
        }
        catch
        {
            // WizeLens must never break the app.
        }
    }

    private static void Tag(Activity activity, CommandStartedEvent e, string? collection)
    {
        activity.SetTag("db.system.name", "mongodb");
        activity.SetTag("db.operation.name", e.CommandName);
        if (collection is not null) activity.SetTag("db.collection.name", collection);
        if (e.DatabaseNamespace?.DatabaseName is { Length: > 0 } database) activity.SetTag("db.namespace", database);
        activity.SetTag("db.query.text", MongoQuery.Shape(e.CommandName, e.Command));
        activity.SetTag("wizelens.db.parameters", QueryShape.Parameters(MongoQuery.Raw(e.Command)));
        activity.SetTag("wizelens.db.adapter", AdapterName);
        DbActivity.SetServer(activity, e.ConnectionId?.ServerId?.EndPoint);
    }
}
