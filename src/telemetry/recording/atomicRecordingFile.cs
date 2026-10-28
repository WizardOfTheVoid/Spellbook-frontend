namespace SpellBook.Telemetry;

public static class AtomicRecordingFile
{
    public static void Write(string path,string json)
    {
        var pending=path+".new";
        File.WriteAllText(pending,json);
        for(var attempt=0;;attempt++)
        {
            try { File.Move(pending,path,true); return; }
            catch(Exception error) when(attempt<3 && IsTemporaryReplacementDenial(error))
            {
                Thread.Sleep(10<<attempt);
            }
        }
    }

    public static string Read(string path)
    {
        using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);
        using var reader=new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static bool IsTemporaryReplacementDenial(Exception error)
    {
        if(!OperatingSystem.IsWindows() || error is not IOException and not UnauthorizedAccessException) return false;
        return (error.HResult&0xffff) is 5 or 32 or 33;
    }
}
