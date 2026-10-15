using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;

namespace WizeLens.Data;

/// <summary>
/// Wraps any ADO.NET connection so every command is recorded as a db span.
/// Works with raw ADO.NET and Dapper: <c>using var conn = new ProfiledDbConnection(new SqliteConnection(cs));</c>
/// </summary>
public sealed class ProfiledDbConnection(DbConnection inner) : DbConnection
{
    public DbConnection InnerConnection { get; } = inner ?? throw new ArgumentNullException(nameof(inner));

    [AllowNull]
    public override string ConnectionString
    {
        get => InnerConnection.ConnectionString;
        set => InnerConnection.ConnectionString = value;
    }

    public override int ConnectionTimeout => InnerConnection.ConnectionTimeout;
    public override string Database => InnerConnection.Database;
    public override string DataSource => InnerConnection.DataSource;
    public override string ServerVersion => InnerConnection.ServerVersion;
    public override ConnectionState State => InnerConnection.State;

    public override void ChangeDatabase(string databaseName) => InnerConnection.ChangeDatabase(databaseName);
    public override void Close() => InnerConnection.Close();
    public override void Open() => InnerConnection.Open();
    public override Task OpenAsync(CancellationToken cancellationToken) => InnerConnection.OpenAsync(cancellationToken);

    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) => InnerConnection.BeginTransaction(isolationLevel);

    protected override DbCommand CreateDbCommand() => new ProfiledDbCommand(InnerConnection.CreateCommand(), this);

    protected override void Dispose(bool disposing)
    {
        if (disposing) InnerConnection.Dispose();
        base.Dispose(disposing);
    }

    public override ValueTask DisposeAsync() => InnerConnection.DisposeAsync();
}

/// <summary>A command that records itself as a db span. Created by <see cref="ProfiledDbConnection"/>.</summary>
public sealed class ProfiledDbCommand : DbCommand
{
    private DbConnection? _connection;

    public ProfiledDbCommand(DbCommand inner, DbConnection? connection)
    {
        InnerCommand = inner;
        _connection = connection;
    }

    public DbCommand InnerCommand { get; }

    /// <summary>
    /// The adapter name recorded in <c>wizelens.db.adapter</c>. An ORM adapter (for example EF Core) can set this
    /// so a command is recorded once, with the richer adapter name.
    /// </summary>
    public string Adapter { get; set; } = "ado.net";

    [AllowNull]
    public override string CommandText
    {
        get => InnerCommand.CommandText;
        set => InnerCommand.CommandText = value;
    }

    public override int CommandTimeout
    {
        get => InnerCommand.CommandTimeout;
        set => InnerCommand.CommandTimeout = value;
    }

    public override CommandType CommandType
    {
        get => InnerCommand.CommandType;
        set => InnerCommand.CommandType = value;
    }

    public override bool DesignTimeVisible
    {
        get => InnerCommand.DesignTimeVisible;
        set => InnerCommand.DesignTimeVisible = value;
    }

    public override UpdateRowSource UpdatedRowSource
    {
        get => InnerCommand.UpdatedRowSource;
        set => InnerCommand.UpdatedRowSource = value;
    }

    protected override DbConnection? DbConnection
    {
        get => _connection;
        set
        {
            _connection = value;
            InnerCommand.Connection = value is ProfiledDbConnection p ? p.InnerConnection : value;
        }
    }

    protected override DbParameterCollection DbParameterCollection => InnerCommand.Parameters;

    protected override DbTransaction? DbTransaction
    {
        get => InnerCommand.Transaction;
        set => InnerCommand.Transaction = value;
    }

    public override void Cancel() => InnerCommand.Cancel();
    public override void Prepare() => InnerCommand.Prepare();
    protected override DbParameter CreateDbParameter() => InnerCommand.CreateParameter();

    public override int ExecuteNonQuery()
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var rows = InnerCommand.ExecuteNonQuery();
            DbActivity.Stop(activity, rows);
            return rows;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    public override async Task<int> ExecuteNonQueryAsync(CancellationToken cancellationToken)
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var rows = await InnerCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            DbActivity.Stop(activity, rows);
            return rows;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    public override object? ExecuteScalar()
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var result = InnerCommand.ExecuteScalar();
            DbActivity.Stop(activity);
            return result;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    public override async Task<object?> ExecuteScalarAsync(CancellationToken cancellationToken)
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var result = await InnerCommand.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            DbActivity.Stop(activity);
            return result;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var reader = InnerCommand.ExecuteReader(behavior);
            DbActivity.Stop(activity);
            return reader;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    protected override async Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken cancellationToken)
    {
        var activity = DbActivity.Start(this, Adapter);
        try
        {
            var reader = await InnerCommand.ExecuteReaderAsync(behavior, cancellationToken).ConfigureAwait(false);
            DbActivity.Stop(activity);
            return reader;
        }
        catch (Exception ex)
        {
            DbActivity.Stop(activity, error: ex);
            throw;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) InnerCommand.Dispose();
        base.Dispose(disposing);
    }
}
