using System.Collections.Concurrent;
using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore.Diagnostics;
using WizeLens.Data;

namespace WizeLens.EntityFrameworkCore;

/// <summary>
/// Records every EF Core command as a db span with <c>wizelens.db.adapter = efcore</c>.
/// If the connection is already a <see cref="ProfiledDbConnection"/>, the command records itself, so the
/// interceptor only relabels it (no double counting).
/// </summary>
public sealed class WizeLensDbCommandInterceptor : DbCommandInterceptor
{
    public const string AdapterName = "efcore";

    public static readonly WizeLensDbCommandInterceptor Instance = new();

    private readonly ConcurrentDictionary<Guid, Activity> _active = new();

    public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Begin(command, eventData);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        Begin(command, eventData);
        return ValueTask.FromResult(result);
    }

    public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        End(eventData.CommandId, null, null);
        return result;
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
    {
        End(eventData.CommandId, null, null);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<int> NonQueryExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Begin(command, eventData);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Begin(command, eventData);
        return ValueTask.FromResult(result);
    }

    public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result)
    {
        End(eventData.CommandId, result, null);
        return result;
    }

    public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        End(eventData.CommandId, result, null);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<object> ScalarExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        Begin(command, eventData);
        return result;
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
    {
        Begin(command, eventData);
        return ValueTask.FromResult(result);
    }

    public override object? ScalarExecuted(DbCommand command, CommandExecutedEventData eventData, object? result)
    {
        End(eventData.CommandId, null, null);
        return result;
    }

    public override ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData, object? result, CancellationToken cancellationToken = default)
    {
        End(eventData.CommandId, null, null);
        return ValueTask.FromResult(result);
    }

    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData) =>
        End(eventData.CommandId, null, eventData.Exception);

    public override Task CommandFailedAsync(DbCommand command, CommandErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        End(eventData.CommandId, null, eventData.Exception);
        return Task.CompletedTask;
    }

    public override void CommandCanceled(DbCommand command, CommandEndEventData eventData) =>
        End(eventData.CommandId, null, null);

    public override Task CommandCanceledAsync(DbCommand command, CommandEndEventData eventData, CancellationToken cancellationToken = default)
    {
        End(eventData.CommandId, null, null);
        return Task.CompletedTask;
    }

    private void Begin(DbCommand command, CommandEventData eventData)
    {
        if (command is ProfiledDbCommand profiled)
        {
            profiled.Adapter = AdapterName;
            return;
        }

        var activity = DbActivity.Start(command, AdapterName);
        if (activity is null) return;
        if (eventData.Context is { } context) activity.SetTag("wizelens.db.context", context.GetType().Name);
        _active[eventData.CommandId] = activity;
    }

    private void End(Guid commandId, int? rows, Exception? error)
    {
        if (_active.TryRemove(commandId, out var activity)) DbActivity.Stop(activity, rows, error);
    }
}
