namespace SpellBook.Telemetry;
public class RecordingReprocessJobTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ImportsMetadataEndpointStartAndQuietTailInSelectedSegmentOrder(bool native)
    {
        var root=TestWorkspace.Create();
        try
        {
            var options=new TelemetryOptions(Path.Combine(root,"output"),"unused",Guid.NewGuid().ToString(),Environment.ProcessId,"test"){FreeSpaceFloor=0};
            var catalog=new RecordingCatalog(options);
            var start=DateTimeOffset.Parse("2026-10-19T20:00:00Z");
            var source=Path.Combine(root,"source");
            using(var packets=new PacketLog(source,64))
            {
                packets.Append(new(0,1_000_000,start.AddSeconds(1),1,0,[],0));
                packets.Append(new(1,2_000_000,start.AddSeconds(2),1,0,[],0));
            }
            var first=Path.Combine(source,"gameTraffic2.pcapng");
            var second=Path.Combine(source,"gameTraffic10.pcapng");
            File.Move(Path.Combine(source,"000001.pcapng"),first);
            File.Move(Path.Combine(source,"000002.pcapng"),second);
            var metadata=Path.Combine(source,native ? "manifest.json" : "capture.json");
            File.WriteAllText(metadata,native
                ? """{"endpoint":{"host":"5.101.165.14","port":10120},"startedAtUtc":"2026-10-19T20:00:00Z","head":{"elapsedUs":10000000},"stopReason":"requested"}"""
                : """{"serverIp":"5.101.165.14","gamePort":10120,"captureStartUtc":"2026-10-19T20:00:00Z","captureStopUtc":"2026-10-19T20:00:10Z","stopReason":"requested"}""");
            await using var runtime=new TelemetryOrchestrator(options,catalog);
            var jobs=new RecordingReprocessJob(options,catalog,runtime);
            var job=jobs.Import(jobs.Register(new([first,second],metadata,new("127.0.0.1",7777))));
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            while(job.State is "queued" or "running") await Task.Delay(10,timeout.Token);
            Assert.Equal("completed",job.State);
            var saved=catalog.Get(job.RecordingId);
            Assert.Equal(new Endpoint("5.101.165.14",10120),saved.Endpoint);
            Assert.Equal(start,saved.StartedAtUtc);
            Assert.Equal(10_000_000,saved.Head.ElapsedUs);
            Assert.Equal("requested",saved.StopReason);
            var replay=Directory.GetFiles(Path.Combine(catalog.DataPath(saved.Id),"packets")).Order().SelectMany(p=>PacketLog.Read(p)).ToArray();
            Assert.Equal([1_000_000L,2_000_000L],replay.Select(p=>p.ElapsedUs));
        }
        finally { Directory.Delete(root,true); }
    }

    [Fact] public async Task RetainsLossMonotonicTimeQuietTailAndOriginalBytes()
    {
        var root=TestWorkspace.Create();
        try
        {
            var options=new TelemetryOptions(root,"unused",Guid.NewGuid().ToString(),Environment.ProcessId,"test"){FreeSpaceFloor=0};
            var catalog=new RecordingCatalog(options);
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){StartedAtUtc=DateTimeOffset.UtcNow,State="recording"};
            using(var writer=new RecordingOrchestrator(catalog.PathFor(status.Id),status,options))
            {
                await writer.Append(new(0,2_000_000,status.StartedAtUtc.Value.AddSeconds(1),1,0,[],3),[]);
                await writer.Complete("requested",10_000_000);
            }
            var original=Directory.GetFiles(Path.Combine(catalog.PathFor(status.Id),"packets")).Single();
            var before=System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(original));
            await using var runtime=new TelemetryOrchestrator(options,catalog);
            var jobs=new RecordingReprocessJob(options,catalog,runtime);
            var job=jobs.Reprocess(status.Id);
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            while(job.State is "queued" or "running") await Task.Delay(10,timeout.Token);
            Assert.Equal("completed",job.State);
            var rebuilt=catalog.Get(status.Id);
            Assert.Equal(10_000_000,rebuilt.Head.ElapsedUs);
            Assert.Equal(3,rebuilt.LossCount);
            Assert.Equal("requested",rebuilt.StopReason);
            var packet=Assert.Single(PacketLog.Read(Directory.GetFiles(Path.Combine(catalog.DataPath(status.Id),"packets")).Single()));
            Assert.Equal(2_000_000,packet.ElapsedUs);
            Assert.Equal(3,packet.LossCount);
            Assert.Equal(before,System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(original)));
        }
        finally { Directory.Delete(root,true); }
    }
}
