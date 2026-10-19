using System.Collections.Concurrent;
using System.Data.Common;
using System.Diagnostics;
using WizeLens.Capture;
using WizeLens.Data;

namespace WizeLens.AutoInstrumentation;

/// <summary>Records EF Core commands from EF's diagnostic listener: what <c>UseWizeLens()</c> on the DbContext does, with no code.</summary>
internal sealed class EfCoreObserver(WizeLensInstall install, WizeLensOptions options)
    : DiagnosticObserver(install, options, "Microsoft.EntityFrameworkCore")
{
    private const string Prefix = "Microsoft.EntityFrameworkCore.Database.Command.";
    private readonly ConcurrentDictionary<Guid, Activity> _open = new();

    protected override bool Wants(string name) => name.StartsWith(Prefix, StringComparison.Ordinal);

    protected override void OnEvent(string name, object? payload)
    {
        switch (name[Prefix.Length..])
        {
            case "CommandExecuting": Begin(payload); break;
            case "CommandExecuted": End(payload, Read<object>(payload, "Result") as int?, null); break;
            case "CommandError": End(payload, null, Read<Exception>(payload, "Exception")); break;
            case "CommandCanceled": End(payload, null, null); break;
        }
    }

    private void Begin(object? payload)
    {
        // Outside a request, or already traced by ProfiledDbConnection: skip.
        if (Activity.Current is not { } current || current.Source.Name == WizeLensRuntime.DbSourceName) return;
        if (Read<DbCommand>(payload, "Command") is not { } command || Read<Guid?>(payload, "CommandId") is not { } id) return;
        if (EfInterceptorCheck.HasWizeLens(Read<object>(payload, "Context"))) return;
        var activity = DbActivity.Start(command, "efcore");
        if (activity is not null) _open[id] = activity;
    }

    private void End(object? payload, int? rows, Exception? error)
    {
        if (Read<Guid?>(payload, "CommandId") is { } id && _open.TryRemove(id, out var activity)) DbActivity.Stop(activity, rows, error);
    }
}
