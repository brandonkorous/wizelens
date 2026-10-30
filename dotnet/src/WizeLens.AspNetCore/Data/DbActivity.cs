using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using WizeLens.Capture;
using WizeLens.Web;

namespace WizeLens.Data;

/// <summary>Shared helpers that turn a <see cref="DbCommand"/> into a db span. Used by every DB adapter.</summary>
internal static partial class DbActivity
{
    /// <summary>Starts a db activity for <paramref name="command"/>, or returns null when nobody listens.</summary>
    public static Activity? Start(DbCommand command, string adapter)
    {
        if (WizeLensContext.Suppressed) return null;

        var sql = command.CommandText ?? "";
        var operation = OperationName(sql);
        var collection = CollectionName(sql);
        var name = collection is null ? operation ?? "db" : $"{operation} {collection}";

        var activity = WizeLensRuntime.DbSource.StartActivity(name, ActivityKind.Client);
        if (activity is null) return null;

        var connection = command.Connection;
        activity.SetTag("db.system.name", SystemName(connection));
        activity.SetTag("db.query.text", sql);
        if (operation is not null) activity.SetTag("db.operation.name", operation);
        if (collection is not null) activity.SetTag("db.collection.name", collection);
        if (!string.IsNullOrEmpty(connection?.Database)) activity.SetTag("db.namespace", connection.Database);
        if (command.CommandType == CommandType.StoredProcedure) activity.SetTag("db.stored_procedure.name", sql);
        activity.SetTag("wizelens.db.parameters", ParametersJson(command));
        activity.SetTag("wizelens.db.adapter", adapter);
        return activity;
    }

    public static void Stop(Activity? activity, int? rowsAffected = null, Exception? error = null)
    {
        if (activity is null) return;
        if (rowsAffected is >= 0) activity.SetTag("wizelens.db.affected_rows", rowsAffected.Value);
        if (error is not null)
        {
            activity.AddException(error);
            activity.SetTag("error.type", error.GetType().FullName);
            activity.SetStatus(ActivityStatusCode.Error, error.Message);
        }
        activity.Stop();
    }

    /// <summary>Sets <c>server.address</c> and <c>server.port</c> from a client's endpoint.</summary>
    public static void SetServer(Activity activity, EndPoint? endpoint)
    {
        var (host, port) = endpoint switch
        {
            DnsEndPoint dns => (dns.Host, dns.Port),
            IPEndPoint ip => (ip.Address.ToString(), ip.Port),
            _ => (null, 0),
        };
        if (host is null) return;
        activity.SetTag("server.address", host);
        if (port > 0) activity.SetTag("server.port", port);
    }

    /// <summary>Maps a connection type to an OTel <c>db.system.name</c> value.</summary>
    public static string SystemName(DbConnection? connection)
    {
        var inner = connection is ProfiledDbConnection p ? p.InnerConnection : connection;
        var type = inner?.GetType().Name ?? "";
        return type switch
        {
            "SqliteConnection" => "sqlite",
            "SqlConnection" => "microsoft.sql_server",
            "NpgsqlConnection" => "postgresql",
            "MySqlConnection" => "mysql",
            "OracleConnection" => "oracle.db",
            "FbConnection" => "firebirdsql",
            "DuckDBConnection" => "duckdb",
            "" => "other_sql",
            _ => type.Replace("Connection", "", StringComparison.Ordinal).ToLowerInvariant(),
        };
    }

    /// <summary>The parameters by name; a value is redacted by its name or by the column the command text binds it to.</summary>
    internal static string ParametersJson(DbCommand command) => JsonSerializer.Serialize(SqlParams.Redact(
        WizeLensRuntime.Redactor, command.CommandText ?? "", command.Parameters.Cast<DbParameter>().Select(p => ((string?)p.ParameterName, p.Value))), WizeLensJson.Text);

    internal static string? OperationName(string sql)
    {
        var match = OperationRegex().Match(sql);
        return match.Success ? match.Groups[1].Value.ToUpperInvariant() : null;
    }

    internal static string? CollectionName(string sql)
    {
        var match = CollectionRegex().Match(sql);
        return match.Success ? match.Groups[1].Value.Trim('"', '[', ']', '`') : null;
    }

    // Skips leading comments and session SETs: EF Core on SQL Server starts every save with "SET NOCOUNT ON;".
    [GeneratedRegex(@"^\s*(?:--[^\n]*\n\s*)*(?:SET\s[^;]*;\s*)*(\w+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex OperationRegex();

    [GeneratedRegex(@"\b(?:FROM|INTO|UPDATE|JOIN)\s+([""\[`]?[\w.]+[""\]`]?)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CollectionRegex();
}
