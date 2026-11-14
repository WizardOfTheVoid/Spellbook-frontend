using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public sealed class PreparedCommands(SqliteConnection connection) : IDisposable
{
    private readonly Dictionary<string,SqliteCommand> commands = [];
    public void Execute(SqliteTransaction? transaction, string sql, params (string Name,object? Value)[] values)
    {
        if (!commands.TryGetValue(sql,out var command))
        {
            command=connection.CreateCommand();
            command.CommandText=sql;
            foreach(var value in values) command.Parameters.AddWithValue(value.Name,value.Value ?? DBNull.Value);
            command.Prepare();
            commands[sql]=command;
        }
        command.Transaction=transaction;
        foreach(var value in values) command.Parameters[value.Name].Value=value.Value ?? DBNull.Value;
        command.ExecuteNonQuery();
    }
    public void Dispose()
    {
        foreach(var command in commands.Values) command.Dispose();
    }
}
