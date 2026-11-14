using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public sealed class ReadViewMismatchException():InvalidOperationException("Read view no longer belongs to this recording generation");
public static class ReadViews
{
    public static ReadView Resolve(RecordingStatus status,long atUs,ReadView? requested=null)
    {
        if(requested is not null && (requested.Generation!=status.Generation || requested.ThroughSequence<0 || requested.ThroughSequence>status.Head.Sequence || requested.AtUs<0 || requested.AtUs>status.Head.ElapsedUs))
            throw new ReadViewMismatchException();
        return requested ?? new(status.Generation,status.Head.Sequence,Math.Min(atUs,status.Head.ElapsedUs));
    }
    public static void Bind(SqliteCommand command,ReadView view)
    {
        command.Parameters.AddWithValue("$time",view.AtUs);
        command.Parameters.AddWithValue("$head",view.ThroughSequence);
    }
}
