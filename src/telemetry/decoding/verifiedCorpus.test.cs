using System.Text.Json;
using System.Diagnostics;

namespace SpellBook.Telemetry;

public class VerifiedCorpusTests
{
    public static bool HasCorpus => Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_CORPUS") is not null;
    public static bool HasCaptures => Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_CAPTURES") is not null;

    [Fact(Skip = "Explicit saved-capture integration acceptance", SkipUnless = nameof(HasCaptures))]
    public async Task SavedCapturesProjectPlayersAndNotifications()
    {
        var root = Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_CAPTURES")!;
        var summaries = new List<object>();
        var totalKinds = new Dictionary<string, int>();
        long packets = 0, positions = 0, playerUpdates = 0, anonymousPositions = 0;
        foreach (var directory in Directory.GetDirectories(root).Order())
        {
            var metadata = Path.Combine(directory, "capture.json");
            if (!File.Exists(metadata)) continue;
            var files = Directory.GetFiles(directory, "gameTraffic*.pcapng").Order().ToArray();
            if (files.Length == 0) continue;
            var capture = JsonDocument.Parse(File.ReadAllText(metadata)).RootElement;
            var decoder = new DecodingOrchestrator(new(capture.GetProperty("serverIp").GetString()!, capture.GetProperty("gamePort").GetInt32()));
            var tracker = new TrackingOrchestrator();
            var start = capture.GetProperty("captureStartUtc").GetDateTimeOffset();
            var output = Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_RECORDINGS");
            var selected = Path.GetFileName(directory) is "20261019T190949Z-krt" or "20261019T203930Z-replay-c3f392";
            var status = new RecordingStatus(Guid.NewGuid().ToString(), new(capture.GetProperty("serverIp").GetString()!, capture.GetProperty("gamePort").GetInt32()))
            { StartedAtUtc = start, State = "recording" };
            using var writer = output is not null && selected ? new RecordingOrchestrator(Path.Combine(output, status.Id), status,
                new(output, new string('x', 32), Guid.NewGuid().ToString(), Environment.ProcessId, "offlineAcceptance")) : null;
            var kinds = new Dictionary<string, int>();
            var unknowns = new Dictionary<string, int>();
            long capturePositions = 0, capturePlayers = 0, capturePackets = 0, captureAnonymous = 0, decodeTicks = 0, decodeAllocated = 0, lastElapsed = 0;
            var cpuStart = Process.GetCurrentProcess().TotalProcessorTime;
            foreach (var file in files)
            foreach (var original in PacketLog.Read(file, start))
            {
                var packet = original with { Ordinal = capturePackets, ElapsedUs = Math.Max(lastElapsed, original.ElapsedUs) };
                capturePackets++;
                var allocated = GC.GetAllocatedBytesForCurrentThread();
                var tick = Stopwatch.GetTimestamp();
                var rows = decoder.Accept(packet).SelectMany(decoded => tracker.Apply(decoded, packet)).ToArray();
                decodeTicks += Stopwatch.GetTimestamp() - tick;
                decodeAllocated += GC.GetAllocatedBytesForCurrentThread() - allocated;
                foreach (var tracked in rows)
                {
                    kinds[tracked.Event.Kind] = kinds.GetValueOrDefault(tracked.Event.Kind) + 1;
                    totalKinds[tracked.Event.Kind] = totalKinds.GetValueOrDefault(tracked.Event.Kind) + 1;
                    if (tracked.Position is not null)
                    {
                        capturePositions++;
                        if (tracked.Position.PlayFabId is null) captureAnonymous++;
                    }
                    if (tracked.Player is not null)
                    {
                        capturePlayers++;
                        Assert.Null(tracked.Player.MaxHealth);
                        Assert.NotEmpty(tracked.Player.TrackId);
                        Assert.NotEmpty(tracked.Player.LifetimeId);
                    }
                    if (tracked.Event.Kind == "decoderUnsupported")
                        unknowns[tracked.Event.Detail] = unknowns.GetValueOrDefault(tracked.Event.Detail) + 1;
                    if (tracked.Event.Player?.Source is { } source)
                    {
                        if (source.Coverage == "retainedPlayerStateIdentity") Assert.True(source.CompletionOrdinal <= packet.Ordinal);
                        else Assert.Equal(packet.Ordinal, source.CompletionOrdinal);
                    }
                }
                lastElapsed = packet.ElapsedUs;
                if (writer is not null)
                {
                    await writer.Append(packet, rows);
                    if (writer.ShouldFlush) await writer.Flush(lastElapsed);
                }
            }
            if (writer is not null)
                await writer.Complete("offlineAcceptance", Math.Max(lastElapsed, (capture.GetProperty("captureStopUtc").GetDateTimeOffset() - start).Ticks / 10));
            positions += capturePositions; playerUpdates += capturePlayers; packets += capturePackets; anonymousPositions += captureAnonymous;
            summaries.Add(new { capture = Path.GetFileName(directory), packets = capturePackets, positions = capturePositions,
                anonymousPositions = captureAnonymous, playerUpdates = capturePlayers, kinds,
                decodeElapsedMs = decodeTicks * 1000d / Stopwatch.Frequency, decodeAllocatedBytes = decodeAllocated,
                replayCpuMs = (Process.GetCurrentProcess().TotalProcessorTime - cpuStart).TotalMilliseconds, includesStorage = writer is not null,
                recordingId = writer is null ? null : status.Id, unknowns = unknowns.OrderByDescending(pair => pair.Value).Take(10).ToArray() });
        }
        var report = new { packets, positions, anonymousPositions, playerUpdates, kinds = totalKinds, captures = summaries };
        if (Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_CAPTURE_REPORT") is { } path) File.WriteAllText(path, Wire.Serialize(report));
        Assert.True(packets > 40000);
        Assert.True(positions > 60000);
        Assert.Equal(58557, anonymousPositions);
        Assert.Equal(34, totalKinds.GetValueOrDefault("damage"));
        Assert.Equal(8, totalKinds.GetValueOrDefault("healing"));
        Assert.Equal(8, totalKinds.GetValueOrDefault("death"));
    }

    [Fact(Skip = "Explicit retained offline corpus acceptance", SkipUnless = nameof(HasCorpus))]
    public void ProfilesAcceptEveryRetainedVerifiedBody()
    {
        var root = Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_CORPUS")!;
        var counts = new Dictionary<string, int>();
        IEnumerable<JsonElement> Rows(string file) => File.ReadLines(Path.Combine(root, file)).Select(line => JsonDocument.Parse(line).RootElement);
        BitReader Body(JsonElement row) => new(Convert.FromHexString(row.GetProperty("dataHex").GetString()!), row.GetProperty("dataBits").GetInt32());
        foreach (var (file, kind, expected) in new[]
        {
            ("items/statsFields.jsonl", "stats", 283), ("items/inventoryFields.jsonl", "inventory", 68),
            ("combat/combatProperties.jsonl", "combat", 526), ("identity/extendedPlayerState.jsonl", "playerState", 533)
        })
        {
            foreach (var row in Rows(file))
            {
                var reader = kind == "playerState" ? Body(row) : new BitReader(Convert.FromBase64String(row.GetProperty("base64").GetString()!), row.GetProperty("sizeBits").GetInt32());
                var decoded = ReplicationReader.Read(reader, kind, new());
                Assert.True(decoded.Complete, $"{file}: {decoded.StopReason}");
                Assert.Equal(0, reader.Remaining);
                counts[kind] = counts.GetValueOrDefault(kind) + 1;
            }
            Assert.Equal(expected, counts[kind]);
        }
        foreach (var file in new[] { "items/damageBodies.jsonl", "items/statsRpcBodies.jsonl" })
            foreach (var row in Rows(file))
            {
                var decoded = StatsNotifications.Read(row.GetProperty("index").GetInt32(), Body(row));
                Assert.NotNull(decoded);
                counts[decoded.Value.Kind] = counts.GetValueOrDefault(decoded.Value.Kind) + 1;
            }
        Assert.Equal(34, counts["damage"]);
        Assert.Equal(8, counts["healing"]);
        Assert.Equal(8, counts["death"]);
        foreach (var row in Rows("combat/componentRpc.jsonl"))
        {
            var component = ComponentDecoder.Kind(row.GetProperty("component").GetString()!)!;
            var decoded = CombatNotifications.Read(component, row.GetProperty("index").GetInt32(), row.GetProperty("direction").GetString()!, Body(row), new());
            Assert.NotNull(decoded);
            counts["combatMessages"] = counts.GetValueOrDefault("combatMessages") + 1;
        }
        Assert.Equal(97, counts["combatMessages"]);
        if (Environment.GetEnvironmentVariable("TELEMETRY_VERIFIED_REPORT") is { } report)
            File.WriteAllText(report, Wire.Serialize(counts));
    }
}
