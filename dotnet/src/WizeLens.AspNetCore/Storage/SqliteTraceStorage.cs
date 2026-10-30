using System.Text.Json;
using Microsoft.Data.Sqlite;
using WizeLens.Model;
using WizeLens.Web;

namespace WizeLens.Storage;

/// <summary>Writes traces to SQLite; not thread-safe, one flush loop calls it.</summary>
internal sealed class SqliteTraceStorage : IDisposable
{
    public const int SchemaVersion = 1;

    private const string Schema = """
        CREATE TABLE IF NOT EXISTS meta   (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS traces (
          trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, updated_ms REAL NOT NULL,
          remotes TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS spans  (
          trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
          name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, service TEXT NOT NULL,
          start_ms REAL NOT NULL, duration_ms REAL NOT NULL, status TEXT NOT NULL,
          session TEXT,
          json TEXT NOT NULL,
          PRIMARY KEY (trace_id, span_id)
        );
        CREATE TABLE IF NOT EXISTS logs   (
          trace_id TEXT NOT NULL, seq INTEGER NOT NULL, time_ms REAL NOT NULL, level TEXT NOT NULL,
          json TEXT NOT NULL,
          PRIMARY KEY (trace_id, seq)
        );
        CREATE INDEX IF NOT EXISTS ix_traces_start  ON traces(start_ms);
        CREATE INDEX IF NOT EXISTS ix_spans_session ON spans(session) WHERE session IS NOT NULL;
        CREATE INDEX IF NOT EXISTS ix_spans_cat_dur ON spans(category, duration_ms);
        """;

    private readonly SqliteConnection _connection;

    private SqliteTraceStorage(SqliteConnection connection) => _connection = connection;

    public string Path { get; private init; } = "";

    /// <summary>Opens (and creates, if needed) the file, its folder and the schema.</summary>
    public static SqliteTraceStorage Open(string path, string serviceName)
    {
        var directory = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false,
        }.ToString());

        try
        {
            connection.Open();
            Execute(connection, "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=2000;");
            Execute(connection, Schema);
            Execute(connection,
                "INSERT INTO meta(key, value) VALUES ('schema', $schema), ('service', $service) " +
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                ("$schema", SchemaVersion.ToString(System.Globalization.CultureInfo.InvariantCulture)),
                ("$service", serviceName));
            return new SqliteTraceStorage(connection) { Path = path };
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    /// <summary>Deletes traces that started before <paramref name="cutoffMs"/>, then all but the newest <paramref name="maxTraces"/>.</summary>
    public void Prune(int maxTraces, double cutoffMs)
    {
        using var tx = _connection.BeginTransaction();
        Execute(_connection, tx, "DELETE FROM traces WHERE start_ms < $cutoff;", ("$cutoff", cutoffMs));
        Execute(_connection, tx,
            "DELETE FROM traces WHERE trace_id NOT IN (SELECT trace_id FROM traces ORDER BY start_ms DESC LIMIT $max);",
            ("$max", maxTraces));
        Execute(_connection, tx, "DELETE FROM spans WHERE trace_id NOT IN (SELECT trace_id FROM traces);");
        Execute(_connection, tx, "DELETE FROM logs WHERE trace_id NOT IN (SELECT trace_id FROM traces);");
        tx.Commit();
    }

    /// <summary>Reads the newest <paramref name="maxTraces"/> traces, oldest first.</summary>
    public List<StoredTrace> Load(int maxTraces)
    {
        var traces = new Dictionary<string, StoredTrace>(StringComparer.Ordinal);
        var order = new List<string>();

        using (var command = _connection.CreateCommand())
        {
            command.CommandText =
                "SELECT trace_id, start_ms, updated_ms, remotes FROM " +
                "(SELECT * FROM traces ORDER BY start_ms DESC LIMIT $max) ORDER BY start_ms ASC;";
            command.Parameters.AddWithValue("$max", maxTraces);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var id = reader.GetString(0);
                var remotes = JsonSerializer.Deserialize<List<string>>(reader.GetString(3), WizeLensJson.Options) ?? [];
                traces[id] = new StoredTrace(id, reader.GetDouble(1), reader.GetDouble(2), remotes, [], []);
                order.Add(id);
            }
        }

        if (traces.Count == 0) return [];

        using (var command = _connection.CreateCommand())
        {
            command.CommandText = "SELECT trace_id, json FROM spans ORDER BY trace_id, start_ms;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                if (!traces.TryGetValue(reader.GetString(0), out var trace)) continue;
                if (JsonSerializer.Deserialize<Span>(reader.GetString(1), WizeLensJson.Options) is { } span) trace.Spans.Add(span);
            }
        }

        using (var command = _connection.CreateCommand())
        {
            command.CommandText = "SELECT trace_id, json FROM logs ORDER BY trace_id, seq;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                if (!traces.TryGetValue(reader.GetString(0), out var trace)) continue;
                if (JsonSerializer.Deserialize<LogRecord>(reader.GetString(1), WizeLensJson.Options) is { } log) trace.Logs.Add(log);
            }
        }

        return [.. order.Select(id => traces[id])];
    }

    /// <summary>Writes the changes in one transaction.</summary>
    public void Write(IReadOnlyCollection<TraceChanges> batch)
    {
        if (batch.Count == 0) return;

        using var tx = _connection.BeginTransaction();

        using var traceCommand = Prepare(tx,
            "INSERT INTO traces(trace_id, start_ms, updated_ms, remotes) VALUES ($id, $start, $updated, $remotes) " +
            "ON CONFLICT(trace_id) DO UPDATE SET start_ms = min(start_ms, excluded.start_ms), " +
            "updated_ms = max(updated_ms, excluded.updated_ms), remotes = excluded.remotes;",
            "$id", "$start", "$updated", "$remotes");

        using var spanCommand = Prepare(tx,
            "INSERT INTO spans(trace_id, span_id, parent_span_id, name, kind, category, service, start_ms, duration_ms, status, session, json) " +
            "VALUES ($trace, $span, $parent, $name, $kind, $category, $service, $start, $duration, $status, $session, $json) " +
            "ON CONFLICT(trace_id, span_id) DO UPDATE SET parent_span_id = excluded.parent_span_id, name = excluded.name, " +
            "kind = excluded.kind, category = excluded.category, service = excluded.service, start_ms = excluded.start_ms, " +
            "duration_ms = excluded.duration_ms, status = excluded.status, session = excluded.session, json = excluded.json;",
            "$trace", "$span", "$parent", "$name", "$kind", "$category", "$service", "$start", "$duration", "$status", "$session", "$json");

        using var logCommand = Prepare(tx,
            "INSERT INTO logs(trace_id, seq, time_ms, level, json) VALUES ($trace, $seq, $time, $level, $json) " +
            "ON CONFLICT(trace_id, seq) DO UPDATE SET time_ms = excluded.time_ms, level = excluded.level, json = excluded.json;",
            "$trace", "$seq", "$time", "$level", "$json");

        foreach (var changes in batch)
        {
            Run(traceCommand, changes.TraceId, changes.StartMs, changes.UpdatedMs,
                JsonSerializer.Serialize(changes.Remotes, WizeLensJson.Options));

            foreach (var span in changes.NewSpans)
            {
                Run(spanCommand, changes.TraceId, span.SpanId, span.ParentSpanId, span.Name, span.Kind, span.Category,
                    span.Service, span.StartMs, span.DurationMs, span.Status, span.Attr(TraceStore.SessionAttribute),
                    JsonSerializer.Serialize(span, WizeLensJson.Options));
            }

            for (var i = 0; i < changes.NewLogs.Count; i++)
            {
                var log = changes.NewLogs[i];
                Run(logCommand, changes.TraceId, changes.FirstLogSeq + i, log.TimeMs, log.Level,
                    JsonSerializer.Serialize(log, WizeLensJson.Options));
            }
        }

        tx.Commit();
    }

    public void Dispose() => _connection.Dispose();

    private SqliteCommand Prepare(SqliteTransaction tx, string sql, params string[] names)
    {
        var command = _connection.CreateCommand();
        command.Transaction = tx;
        command.CommandText = sql;
        foreach (var name in names) command.Parameters.Add(new SqliteParameter { ParameterName = name });
        return command;
    }

    private static void Run(SqliteCommand command, params object?[] values)
    {
        for (var i = 0; i < values.Length; i++) command.Parameters[i].Value = values[i] ?? DBNull.Value;
        command.ExecuteNonQuery();
    }

    private static void Execute(SqliteConnection connection, string sql, params (string Name, object Value)[] parameters) =>
        Execute(connection, null, sql, parameters);

    private static void Execute(SqliteConnection connection, SqliteTransaction? tx, string sql, params (string Name, object Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = tx;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        command.ExecuteNonQuery();
    }
}
