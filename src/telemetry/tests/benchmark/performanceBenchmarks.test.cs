using System.Diagnostics;
using System.Text.Json;
using System.Threading.Channels;
namespace SpellBook.Telemetry;

[CollectionDefinition("Telemetry performance",DisableParallelization=true)]
public class TelemetryPerformanceCollection { }

[Collection("Telemetry performance")]
public class PerformanceBenchmarks(ITestOutputHelper output)
{
    public static bool Enabled=>Environment.GetEnvironmentVariable("TELEMETRY_PERFORMANCE")=="1";
    private static string Repository()
    {
        var directory=new DirectoryInfo(Directory.GetCurrentDirectory());
        while(directory is not null && !Directory.Exists(Path.Combine(directory.FullName,".git"))) directory=directory.Parent;
        return directory?.FullName??throw new InvalidOperationException("Run inside the repository");
    }
    private static double Percentile(IEnumerable<double> samples,double percentile)
    {
        var sorted=samples.Order().ToArray();
        return sorted.Length==0?0:sorted[Math.Min(sorted.Length-1,(int)Math.Ceiling(sorted.Length*percentile)-1)];
    }

    [Fact(Skip="Explicit offline CPU and history benchmark",SkipUnless=nameof(Enabled))]
    public async Task MeasuresFullRateHistoryAndPacedIngestion()
    {
        var outputRoot=Path.Combine(Repository(),".artifacts","qa","telemetry","integration20261020");
        Directory.CreateDirectory(outputRoot);
        var seconds=int.TryParse(Environment.GetEnvironmentVariable("TELEMETRY_BENCH_SECONDS"),out var duration)?duration:3600;
        var pacedSeconds=int.TryParse(Environment.GetEnvironmentVariable("TELEMETRY_BENCH_PACED_SECONDS"),out var paced)?paced:120;
        object? history=null;
        if(Environment.GetEnvironmentVariable("TELEMETRY_BENCH_PACED_ONLY")!="1")
        {
            history=await Measure(outputRoot,seconds,false);
            File.WriteAllText(Path.Combine(outputRoot,"storageHistoryBenchmark.json"),Wire.Serialize(history));
        }
        var sustained=await Measure(outputRoot,pacedSeconds,true);
        File.WriteAllText(Path.Combine(outputRoot,"storagePacedBenchmark.json"),Wire.Serialize(sustained));
        output.WriteLine(Wire.Serialize(new {history,sustained}));
    }

    private static async Task<object> Measure(string outputRoot,int seconds,bool paced)
    {
        var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){StartedAtUtc=DateTimeOffset.UtcNow,State="recording"};
        var root=Path.Combine(outputRoot,"benchmarkRecordings",status.Id);
        var options=new TelemetryOptions(root,"benchmark","benchmark",Environment.ProcessId,"benchmark"){SessionLimit=32L*1024*1024*1024,TotalLimit=64L*1024*1024*1024,FreeSpaceFloor=0};
        var ids=Enumerable.Range(0,64).Select(index=>$"pawn:{index}").ToArray();
        var entities=ids.Select((id,index)=>new TelemetryEntity(id,(uint)index+1,index,"pawn",true)).ToArray();
        var process=Process.GetCurrentProcess();
        var cpuStart=process.TotalProcessorTime;
        var allocationStart=GC.GetTotalAllocatedBytes();
        var collections=Enumerable.Range(0,3).Select(GC.CollectionCount).ToArray();
        var watch=Stopwatch.StartNew();
        var cpuSamples=new List<double>();var liveFrames=new List<double>();var liveGroups=new List<double>();
        var lastCpu=cpuStart;var lastSecond=0d;long peakWorkingSet=0;long peakQueued=0;
        var queue=Channel.CreateBounded<int>(new BoundedChannelOptions(256){SingleReader=true,SingleWriter=true,FullMode=BoundedChannelFullMode.Wait});
        var producer=Task.Run(async()=>{
            for(var tick=0;tick<seconds*30;tick++)
            {
                if(paced)
                {
                    var target=TimeSpan.FromSeconds((double)tick/30);
                    var delay=target-watch.Elapsed;
                    if(delay>TimeSpan.Zero) await Task.Delay(delay,TestContext.Current.CancellationToken);
                }
                await queue.Writer.WriteAsync(tick,TestContext.Current.CancellationToken);
                peakQueued=Math.Max(peakQueued,queue.Reader.Count);
            }
            queue.Writer.Complete();
        });
        var playback=new PlaybackOrchestrator(root);
        using(var writer=new RecordingOrchestrator(root,status,options))
        {
            await writer.Flush(0);
            await foreach(var tick in queue.Reader.ReadAllAsync(TestContext.Current.CancellationToken))
            {
                var elapsed=tick*1_000_000L/30;
                var rows=new List<TrackedRecord>(64);
                var lifetime=tick/(60*30);
                var changed=tick%(60*30)==0;
                for(var index=0;index<64;index++)
                {
                    if(changed)
                    {
                        if(tick>0)
                        {
                            var closed=new PlayerStateSnapshot($"player{index}",ids[index],ids[index],(uint)index+1,false,elapsed,0,Health:100,Stamina:100);
                            rows.Add(new(new(0,elapsed,tick,"actorClosed",ids[index],"lifetime ended"),entities[index] with {Active=false},Player:closed));
                        }
                        ids[index]=$"pawn:{index}:{lifetime}";
                        entities[index]=entities[index] with {EntityId=ids[index]};
                    }
                    var location=new Vec3(index*200+Math.Sin((double)tick/30)*100,Math.Cos((double)tick/30)*100,0);
                    var point=new PositionObservation(ids[index],elapsed,tick,0,location,location,"synthetic","world",0,"benchmark");
                    var player=changed?new PlayerStateSnapshot($"player{index}",ids[index],ids[index],(uint)index+1,true,elapsed,0,Health:100,Stamina:100):null;
                    rows.Add(new(new(0,elapsed,tick,"position",ids[index],"synthetic"),entities[index],point,player));
                }
                if(tick==0)
                    for(uint item=1;item<=10_000;item++)
                        rows.Add(new(new(0,elapsed,tick,"itemObserved",$"item:{item}","synthetic item burst",new("Sword",item,1,Attribution:"owner"))));
                if(tick%30==0)
                    for(var index=0;index<64;index++)
                        rows.Add(new(new(0,elapsed,tick,"attackStart",ids[index],"synthetic attack",Player:new(Actor:new($"player{index}",ids[index],ids[index],(uint)index+1)))));
                await writer.Append(new(tick,elapsed,status.StartedAtUtc!.Value.AddTicks(elapsed*10),1,64,new byte[64]),rows);
                if(writer.ShouldFlush) await writer.Flush(elapsed);
                if(paced && tick%6==0)
                {
                    var query=Stopwatch.StartNew();await playback.GetFrame(status,elapsed,TestContext.Current.CancellationToken);liveFrames.Add(query.Elapsed.TotalMilliseconds);
                    query.Restart();await playback.GetEvents(new(status.Id,0,elapsed,NewestFirst:true),TestContext.Current.CancellationToken);liveGroups.Add(query.Elapsed.TotalMilliseconds);
                }
                if(watch.Elapsed.TotalSeconds-lastSecond>=1)
                {
                    var now=process.TotalProcessorTime;
                    cpuSamples.Add((now-lastCpu).TotalSeconds/(watch.Elapsed.TotalSeconds-lastSecond));
                    lastCpu=now;lastSecond=watch.Elapsed.TotalSeconds;
                    process.Refresh();peakWorkingSet=Math.Max(peakWorkingSet,process.WorkingSet64);
                }
                if(tick%(30*60)==0)
                    File.WriteAllText(Path.Combine(outputRoot,paced?"pacedProgress.json":"historyProgress.json"),Wire.Serialize(new {status.Id,tick,seconds,wallSeconds=watch.Elapsed.TotalSeconds,sequence=status.Head.Sequence,status.SizeBytes}));
            }
            await producer;
            await writer.Complete("benchmark",seconds*1_000_000L);
        }
        var ingestWall=watch.Elapsed.TotalSeconds;
        var ingestCpu=(process.TotalProcessorTime-cpuStart).TotalSeconds;
        var allocated=GC.GetTotalAllocatedBytes()-allocationStart;
        var gc=Enumerable.Range(0,3).Select(index=>GC.CollectionCount(index)-collections[index]).ToArray();
        var warmFrames=new List<double>();var warmGroups=new List<double>();var seeks=new List<double>();
        for(var i=0;i<40;i++)
        {
            var query=Stopwatch.StartNew();await playback.GetFrame(status,status.Head.ElapsedUs,TestContext.Current.CancellationToken);warmFrames.Add(query.Elapsed.TotalMilliseconds);
            query.Restart();await playback.GetEvents(new(status.Id,0,status.Head.ElapsedUs,NewestFirst:true),TestContext.Current.CancellationToken);warmGroups.Add(query.Elapsed.TotalMilliseconds);
            query.Restart();await playback.GetFrame(status,seconds*1_000_000L*(i+1)/41,TestContext.Current.CancellationToken);seeks.Add(query.Elapsed.TotalMilliseconds);
        }
        var paths=await playback.GetTrajectories(new(status.Id,Math.Max(0,status.Head.ElapsedUs-10_000_000),status.Head.ElapsedUs,ids,2048),TestContext.Current.CancellationToken);
        Assert.InRange(paths.Paths.Sum(path=>path.Points.Count),1,2048);
        return new {
            scenario=paced?"pacedSyntheticCaptureQueue":"acceleratedOneHourHistory",recordingId=status.Id,root,
            simulatedSeconds=seconds,players=64,frequencyHz=30,positions=(long)seconds*30*64,packets=status.PacketCount,
            wallSeconds=ingestWall,cpuSeconds=ingestCpu,averageCpuCores=ingestCpu/ingestWall,
            cpuPerSimulatedSecond=ingestCpu/seconds,oneSecondCpuP95=Percentile(cpuSamples,.95),oneSecondCpuSamples=cpuSamples.Count,
            allocatedBytes=allocated,gcCollections=gc,peakWorkingSetBytes=peakWorkingSet,peakQueueDepth=peakQueued,lossCount=status.LossCount,
            liveFrameP95Ms=Percentile(liveFrames,.95),liveGroupP95Ms=Percentile(liveGroups,.95),
            warmFrameP95Ms=Percentile(warmFrames.Skip(1),.95),warmGroupP95Ms=Percentile(warmGroups.Skip(1),.95),seekP95Ms=Percentile(seeks.Skip(1),.95),
            totalMapPoints=paths.Paths.Sum(path=>path.Points.Count),databaseBytes=new FileInfo(Path.Combine(root,"telemetry.sqlite")).Length,
            limitations=new[]{"Synthetic generator and worker storage/query CPU share this process; native capture helper and game decoder are measured separately.","Accelerated CPU is saturation throughput, not the paced CPU acceptance result."}
        };
    }
}
