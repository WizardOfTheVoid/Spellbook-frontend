using System.Runtime.InteropServices;
namespace SpellBook.Telemetry;

internal static class PktmonTypes
{
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] internal delegate void DataCallback(nint context, nint data);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] internal delegate void EventCallback(nint context, nint info, int kind);
    [StructLayout(LayoutKind.Sequential)] internal struct StreamConfiguration
    {
        public nint Context, EventCallback, DataCallback;
        public ushort BufferMultiplier, TruncationSize;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct Descriptor
    {
        public nint Data;
        public uint DataSize, MetadataOffset, PacketOffset, PacketLength, MissedWrite, MissedRead;
    }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] internal struct Metadata
    {
        public ulong Group;
        public ushort Count, Appearance, Direction, PacketType, Component, Edge, Reserved;
        public uint DropReason, DropLocation;
        public ushort Processor;
        public long Timestamp;
    }
    [StructLayout(LayoutKind.Explicit, Size = 216)] internal unsafe struct Constraint
    {
        [FieldOffset(0)] public fixed char Name[64];
        [FieldOffset(128)] public uint Present;
        [FieldOffset(150)] public byte TransportProtocol;
        [FieldOffset(152)] public fixed byte Ip1[16];
        [FieldOffset(168)] public fixed byte Ip2[16];
        [FieldOffset(186)] public ushort Port1;
        [FieldOffset(188)] public ushort Port2;
    }
}
