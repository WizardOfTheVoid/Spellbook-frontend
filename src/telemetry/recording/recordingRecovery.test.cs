using System.Security.Cryptography;
namespace SpellBook.Telemetry;

public class RecordingRecoveryTests
{
    [Fact] public async Task ReadOnlySavedLegacyRecordingDoesNotChangeOrBlockRecovery()
    {
        var root=TestWorkspace.Create();
        var legacyRoot=Path.Combine(root,Guid.NewGuid().ToString());
        Directory.CreateDirectory(legacyRoot);
        var database=Path.Combine(legacyRoot,"telemetry.sqlite");
        try
        {
            var legacy=new RecordingStatus(Path.GetFileName(legacyRoot),new("127.0.0.1",7777)){State="saved"};
            using(var connection=RecordingDatabase.Open(legacyRoot))
            using(var command=connection.CreateCommand())
            {
                command.CommandText="CREATE TABLE state(id INTEGER PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE records(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER,kind TEXT,entityId TEXT,event TEXT,entity TEXT,position TEXT); INSERT INTO state VALUES(1,$json); PRAGMA user_version=1";
                command.Parameters.AddWithValue("$json",Wire.Serialize(legacy));
                command.ExecuteNonQuery();
            }
            var original=SHA256.HashData(File.ReadAllBytes(database));
            File.SetAttributes(database,FileAttributes.ReadOnly);
            var options=new TelemetryOptions(root,"unused","test",Environment.ProcessId,"test"){FreeSpaceFloor=0};
            var active=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){State="recording"};
            using(var writer=new RecordingOrchestrator(Path.Combine(root,active.Id),active,options)) await writer.Flush(1000);
            var catalog=new RecordingCatalog(options);
            RecordingRecovery.Run(catalog);
            Assert.Equal(original,SHA256.HashData(File.ReadAllBytes(database)));
            Assert.Equal("saved",catalog.Get(legacy.Id).State);
            Assert.Equal("interrupted",catalog.Get(active.Id).State);
        }
        finally { File.SetAttributes(database,FileAttributes.Normal); Directory.Delete(root,true); }
    }
}
