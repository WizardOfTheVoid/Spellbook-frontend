using System.Net;
using System.Runtime.InteropServices;
using static SpellBook.Telemetry.PktmonTypes;
namespace SpellBook.Telemetry;

public sealed class PktmonApi : IDisposable
{
    private nint library, handle, session, stream;
    private DataCallback? dataCallback;
    private EventCallback? eventCallback;
    private readonly RecordingClock clock = new();
    private readonly object disposeGate = new();
    private long ordinal;
    private Endpoint? endpoint;
    public long RejectedPackets { get; private set; }
    public PacketQueue Queue { get; } = new();
    public string? Error { get; private set; }
    private const string Dll = "pktmonapi.dll";
    private static readonly string[] Exports = ["PacketMonitorInitialize", "PacketMonitorCreateLiveSession", "PacketMonitorCreateRealtimeStream", "PacketMonitorAddCaptureConstraint", "PacketMonitorSetSessionActive", "PacketMonitorEnumDataSources", "PacketMonitorAddSingleDataSourceToSession", "PacketMonitorAttachOutputToSession", "PacketMonitorCloseSessionHandle", "PacketMonitorCloseRealtimeStream", "PacketMonitorUninitialize"];
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorInitialize(uint version, nint reserved, out nint handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true, CharSet = CharSet.Unicode)] private static extern int PacketMonitorCreateLiveSession(nint handle, string name, out nint session);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorCreateRealtimeStream(nint handle, in StreamConfiguration configuration, out nint stream);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern unsafe int PacketMonitorAddCaptureConstraint(nint session, Constraint* constraint);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorSetSessionActive(nint session, byte active);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorAttachOutputToSession(nint session, nint stream);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorEnumDataSources(nint handle, int kind, byte hidden, nuint capacity, out nuint needed, nint sources);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorAddSingleDataSourceToSession(nint session, nint source);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorCloseSessionHandle(nint session);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorCloseRealtimeStream(nint stream);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport(Dll, ExactSpelling = true)] private static extern int PacketMonitorUninitialize(nint handle);

    public static CaptureCapabilities Probe()
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess) return new(false, "Windows x64 is required");
        nint module = 0;
        try
        {
            module = NativeLibrary.Load(Path.Combine(Environment.SystemDirectory, Dll));
            foreach (var name in Exports) if (!NativeLibrary.TryGetExport(module, name, out _)) return new(false, $"Missing native export {name}");
            return new(true);
        }
        catch (Exception ex) when (ex is DllNotFoundException or BadImageFormatException) { return new(false, "Packet Monitor streaming API is unavailable"); }
        finally { if (module != 0) NativeLibrary.Free(module); }
    }
    private static void Check(int result)
    {
        if (result < 0) Marshal.ThrowExceptionForHR(result);
        if (result > 0) throw new System.ComponentModel.Win32Exception(result);
    }
    public unsafe DateTimeOffset Start(Endpoint endpoint, string id)
    {
        if (!endpoint.IsValid || !Guid.TryParse(id, out _)) throw new ArgumentException("Invalid capture request");
        if (session != 0) throw new InvalidOperationException("Capture already started");
        this.endpoint = endpoint;
        library = NativeLibrary.Load(Path.Combine(Environment.SystemDirectory, Dll));
        try
        {
            Check(PacketMonitorInitialize(0x00010000, 0, out handle));
            Check(PacketMonitorCreateLiveSession(handle, $"SpellBook-{id}", out session));
            var ip = IPAddress.Parse(endpoint.Host).GetAddressBytes();
            for (var direction = 0; direction < 2; direction++)
            {
                var constraint = new Constraint { TransportProtocol = 17, Present = (1u << 5) | (1u << (6 + direction)) | (1u << (11 + direction)) };
                var filterName = direction == 0 ? "server-source" : "server-destination";
                for (var i = 0; i < filterName.Length; i++) constraint.Name[i] = filterName[i];
                if (direction == 0) { for (var i = 0; i < 4; i++) constraint.Ip1[i] = ip[i]; constraint.Port1 = (ushort)endpoint.Port; }
                else { for (var i = 0; i < 4; i++) constraint.Ip2[i] = ip[i]; constraint.Port2 = (ushort)endpoint.Port; }
                Check(PacketMonitorAddCaptureConstraint(session, &constraint));
            }
            PacketMonitorEnumDataSources(handle, 1, 0, 0, out var needed, 0);
            if (needed is 0 or > 16_777_216) throw new InvalidOperationException("Invalid native data source list");
            var buffer = Marshal.AllocHGlobal((int)needed);
            try
            {
                Check(PacketMonitorEnumDataSources(handle, 1, 0, needed, out _, buffer));
                var count = Marshal.ReadInt32(buffer);
                if (count <= 0 || count > 4096 || 8L + count * 8L > (long)needed) throw new InvalidOperationException("No usable network interfaces");
                for (var i = 0; i < count; i++) Check(PacketMonitorAddSingleDataSourceToSession(session, Marshal.ReadIntPtr(buffer, 8 + i * 8)));
            }
            finally { Marshal.FreeHGlobal(buffer); }
            dataCallback = OnData;
            eventCallback = (_, _, kind) => { if (kind == 2) Fail("Packet Monitor stream failed"); };
            var config = new StreamConfiguration { DataCallback = Marshal.GetFunctionPointerForDelegate(dataCallback), EventCallback = Marshal.GetFunctionPointerForDelegate(eventCallback), BufferMultiplier = 10, TruncationSize = 9000 };
            Check(PacketMonitorCreateRealtimeStream(handle, in config, out stream));
            Check(PacketMonitorAttachOutputToSession(session, stream));
            var utc = DateTimeOffset.UtcNow;
            clock.Start(utc);
            Check(PacketMonitorSetSessionActive(session, 1));
            return utc;
        }
        catch { Dispose(); throw; }
    }
    private void OnData(nint context, nint descriptor)
    {
        try
        {
            var d = Marshal.PtrToStructure<Descriptor>(descriptor);
            if (d.Data == 0 || d.PacketLength > 9000 || (ulong)d.PacketOffset + d.PacketLength > d.DataSize || (ulong)d.MetadataOffset + (ulong)Marshal.SizeOf<Metadata>() > d.DataSize) { Fail("Invalid capture descriptor"); return; }
            var metadata = Marshal.PtrToStructure<Metadata>(d.Data + (int)d.MetadataOffset);
            var link = metadata.PacketType == 1 ? 1 : metadata.PacketType == 3 ? 101 : -1;
            if (link < 0) { RejectedPackets++; return; }
            var bytes = new byte[d.PacketLength];
            Marshal.Copy(d.Data + (int)d.PacketOffset, bytes, 0, bytes.Length);
            var packet = new PacketEnvelope(ordinal, clock.ElapsedUs, DateTimeOffset.FromFileTime(metadata.Timestamp).ToUniversalTime(), link, bytes.Length, bytes, (long)d.MissedRead + d.MissedWrite);
            if (endpoint is null || DatagramReader.Read(packet,endpoint) is null) { RejectedPackets++; return; }
            Queue.Accept(packet with { Ordinal = Interlocked.Increment(ref ordinal) - 1 });
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException) { RejectedPackets++; }
        catch (Exception ex) { Fail($"Capture callback failed ({ex.GetType().Name})"); }
    }
    private void Fail(string error) { Error = error; Queue.Fail(new IOException(error)); }
    public void Dispose()
    {
        lock (disposeGate)
        {
        if (session != 0) { PacketMonitorSetSessionActive(session, 0); PacketMonitorCloseSessionHandle(session); session = 0; }
        if (stream != 0) { PacketMonitorCloseRealtimeStream(stream); stream = 0; }
        if (handle != 0) { PacketMonitorUninitialize(handle); handle = 0; }
        Queue.Complete();
        if (library != 0) { NativeLibrary.Free(library); library = 0; }
        GC.KeepAlive(dataCallback); GC.KeepAlive(eventCallback);
        }
    }
}
