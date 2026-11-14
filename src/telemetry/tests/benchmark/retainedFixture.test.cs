namespace SpellBook.Telemetry;

public class RetainedFixtureTests(ITestOutputHelper output)
{
    public static bool Enabled=>Environment.GetEnvironmentVariable("TELEMETRY_BUILD_QA_RECORDINGS")=="1";
    [Fact(Skip="Explicit retained offline QA fixture",SkipUnless=nameof(Enabled))]
    public async Task BuildsCausalPlayerFixture()
    {
        var directory=new DirectoryInfo(Directory.GetCurrentDirectory());
        while(directory is not null && !Directory.Exists(Path.Combine(directory.FullName,".git"))) directory=directory.Parent;
        var qa=Path.Combine(directory!.FullName,".artifacts","qa","telemetry","integration20261020");
        var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){StartedAtUtc=DateTimeOffset.Parse("2026-10-20T12:00:00Z"),State="recording"};
        var root=Path.Combine(qa,"recordings",status.Id);
        using var writer=new RecordingOrchestrator(root,status,new(root,"fixture","fixture",Environment.ProcessId,"fixture"));
        var tracker=new TrackingOrchestrator();
        long ordinal=0;
        ObservationSource Evidence(long at)=>new("fromServer",1,100,104,"Synthetic.StatsComponent",0,64,64,at,"syntheticFixture");
        async Task Apply(long at,params DecodedRecord[] decoded)
        {
            var bytes=System.Text.Encoding.UTF8.GetBytes(Wire.Serialize(decoded));
            var packet=new PacketEnvelope(ordinal++,at,status.StartedAtUtc!.Value.AddTicks(at*10),147,bytes.Length,bytes);
            var rows=decoded.SelectMany(record=>tracker.Apply(record,packet)).ToArray();
            await writer.Append(packet,rows);
        }
        await Apply(0,
            new("actorOpened",1,100,Detail:"pawn"),
            new("actorOpened",2,200,Detail:"pawn"),
            new("actorOpened",3,300,Detail:"pawn"));
        for(var tick=0;tick<360;tick++)
        {
            var at=tick*500_000L;
            if(tick==10)
            {
                await Apply(at,new DecodedRecord("properties",1,100,Fields:new(){["playerStateGuid"]=1000u},Detail:"pawn"));
                await Apply(at,new DecodedRecord("properties",10,1000,Fields:new(){["playFabIdentity"]=new UniqueNetId("PlayFab","AAAA")},Detail:"playerState"));
            }
            if(tick==12)
                await Apply(at,new DecodedRecord("properties",1,100,Fields:new(){["health"]=125d,["stamina"]=100d,["inventory"]=new SparseValues(3,[new(0,400u),new(2,402u)])},Detail:"pawn",Evidence:Evidence(at)));
            if(tick%20==0 && tick>0 && tick<180)
                await Apply(at,new DecodedRecord("damage",2,200,Fields:new(){["damageTakerGuid"]=200u,["damageInstigatorGuid"]=100u,["amount"]=15f,["resultingValue"]=80f},Detail:"pawn",Evidence:Evidence(at)));
            if(tick==50)
                await Apply(at,new DecodedRecord("healing",1,100,Fields:new(){["amount"]=25f},Detail:"pawn",Evidence:Evidence(at)));
            if(tick==140)
                for(uint item=1;item<=100;item++)
                {
                    var actor=10_000+item;
                    await Apply(at+item,new("actorOpened",(int)item+100,actor,"/Game/Inventory/Weapons/Weapon_Sword.Default__Weapon_Sword_C",Detail:"item"),
                        new("properties",(int)item+100,actor,Fields:new(){["ownerGuid"]=100u}));
                }
            if(tick==160)
                await Apply(at,new DecodedRecord("death",2,200,Fields:new(){["killerGuids"]=new uint[]{100,300,999},["reasonCode"]=0},Detail:"pawn",Evidence:Evidence(at)));
            if(tick==180)
                await Apply(at,new DecodedRecord("captureGap",0,Detail:"Synthetic continuity boundary"),
                    new("actorOpened",1,100,Detail:"pawn"),new("actorOpened",2,200,Detail:"pawn"),new("actorOpened",3,300,Detail:"pawn"));
            await Apply(at,Enumerable.Range(1,3).Select(index=>new DecodedRecord("position",index,(uint)index*100,Location:new(index*500+Math.Sin(tick/15d)*200,Math.Cos(tick/15d)*200,0),Source:"syntheticFixture",Detail:"pawn")).ToArray());
            if(tick%20==0) await writer.Flush(at);
        }
        await writer.Complete("syntheticFixture",180_000_000);
        writer.AppendNames([new("AAAA","Fixture player","spellbookProduction",status.StartedAtUtc!.Value)]);
        var frame=await new PlaybackOrchestrator(root).GetFrame(status,70_000_000,TestContext.Current.CancellationToken);
        Assert.NotEmpty(frame.Players!);
        File.WriteAllText(Path.Combine(qa,"syntheticFixture.json"),Wire.Serialize(new {
            status.Id,root,status.Head,
            kind="Synthetic decoded-observation QA fixture",
            rawFormat="PCAPNG USER0 payloads contain the decoded observations used by this fixture. These are reproducible fixture inputs, not live game packets; use retained real captures to validate worker reprocessing.",
            checkpoints=new[]{new {atUs=0L,note="anonymous players"},new {atUs=6_000_000L,note="identity, stats and inventory"},new {atUs=70_000_000L,note="100 item burst"},new {atUs=80_000_000L,note="multi-contributor death"},new {atUs=90_000_000L,note="continuity reset"}}
        }));
        output.WriteLine($"Retained synthetic fixture: {root}");
    }
}
