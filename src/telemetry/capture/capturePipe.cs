using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Buffers.Binary;
using System.Security.AccessControl;
using System.Security.Principal;
namespace SpellBook.Telemetry;
public static class CapturePipe
{
    public static NamedPipeServerStream CreateServer(string name)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Capture requires Windows");
        using var identity = WindowsIdentity.GetCurrent();
        var user = identity.User ?? throw new UnauthorizedAccessException("Capture requires a Windows user");
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true,false);
        security.SetOwner(user);
        security.AddAccessRule(new PipeAccessRule(user,PipeAccessRights.FullControl,AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous | PipeOptions.FirstPipeInstance,0,0,security);
    }
    public static NamedPipeClientStream CreateClient(string name)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Capture requires Windows");
        return new(".",name,PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Identification);
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeClientProcessId(nint pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeServerProcessId(nint pipe, out uint pid);
    public static void ValidatePeer(PipeStream pipe, int expectedPid, bool server)
    {
        uint pid;
        var success = server ? GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out pid) : GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out pid);
        if (!success || pid != expectedPid) throw new UnauthorizedAccessException("Capture pipe peer mismatch");
    }
    public static async Task<string?> ReadLine(Stream stream, CancellationToken ct)
    {
        var prefix = new byte[4];
        var read = await stream.ReadAsync(prefix,ct);
        if (read == 0) return null;
        if (read < 4) await stream.ReadExactlyAsync(prefix.AsMemory(read),ct);
        var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
        if (length is < 1 or > 24000) throw new InvalidDataException("Capture message too large");
        var bytes = new byte[length];
        await stream.ReadExactlyAsync(bytes,ct);
        return new UTF8Encoding(false,true).GetString(bytes);
    }
    public static async Task Write<T>(Stream stream, T value, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(Wire.Serialize(value));
        if (bytes.Length > 24000) throw new InvalidDataException("Capture message too large");
        var prefix = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(prefix,bytes.Length);
        await stream.WriteAsync(prefix,ct);
        await stream.WriteAsync(bytes, ct);
        await stream.FlushAsync(ct);
    }
}
