using System.Diagnostics;
using System.Text.Json;
namespace SpellBook.Telemetry;

public class AtomicManifestTests
{
    public static bool Windows=>OperatingSystem.IsWindows();

    [Theory(Skip="Windows file replacement semantics",SkipUnless=nameof(Windows))]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FlushSurvivesBriefReplacementDenialAndPublishesCompleteManifest(bool readOnly)
    {
        var root=TestWorkspace.Create();
        var path=Path.Combine(root,"manifest.json");
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){State="recording"};
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"){FreeSpaceFloor=0});
            await writer.Append(new(1,1000,DateTimeOffset.UtcNow,1,1,[1]),[new(new(0,1000,1,"captureGap",null,"test gap"))]);
            FileStream? reader=null;
            if(readOnly) File.SetAttributes(path,FileAttributes.ReadOnly);
            else reader=new(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);
            var release=new Thread(()=>{
                Thread.Sleep(20);
                if(readOnly) File.SetAttributes(path,FileAttributes.Normal);
                else reader!.Dispose();
            });
            release.Start();
            try { await writer.Flush(1000); }
            finally { release.Join(); reader?.Dispose(); }
            var saved=JsonSerializer.Deserialize<RecordingStatus>(File.ReadAllText(path),Wire.Json)!;
            Assert.Equal(new CommittedHead(1,1000),saved.Head);
            Assert.False(File.Exists(path+".new"));
            Assert.Equal(1,(await new PlaybackOrchestrator(root).GetFrame(status,1000,TestContext.Current.CancellationToken)).CommittedHead.Sequence);
        }
        finally { if(File.Exists(path)) File.SetAttributes(path,FileAttributes.Normal); Directory.Delete(root,true); }
    }

    [Fact(Skip="Windows file replacement semantics",SkipUnless=nameof(Windows))]
    public async Task PersistentDenialThrowsWithinBoundAndPreservesBothCompleteVersions()
    {
        var root=TestWorkspace.Create();
        var path=Path.Combine(root,"manifest.json");
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){State="recording"};
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"){FreeSpaceFloor=0});
            var original=File.ReadAllText(path);
            await writer.Append(new(1,1000,DateTimeOffset.UtcNow,1,1,[1]),[new(new(0,1000,1,"captureGap",null,"test gap"))]);
            File.SetAttributes(path,FileAttributes.ReadOnly);
            var watch=Stopwatch.StartNew();
            var error=await Assert.ThrowsAsync<UnauthorizedAccessException>(()=>writer.Flush(1000));
            Assert.Equal(5,error.HResult&0xffff);
            Assert.InRange(watch.Elapsed.TotalSeconds,0,1);
            Assert.Equal(original,File.ReadAllText(path));
            var pending=JsonSerializer.Deserialize<RecordingStatus>(File.ReadAllText(path+".new"),Wire.Json)!;
            Assert.Equal(new CommittedHead(1,1000),pending.Head);
        }
        finally { if(File.Exists(path)) File.SetAttributes(path,FileAttributes.Normal); Directory.Delete(root,true); }
    }
}
