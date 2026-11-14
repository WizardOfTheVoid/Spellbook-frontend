namespace SpellBook.Telemetry;

public record TelemetryOptions(string Root, string Token, string InstanceId, int ParentPid, string Version)
{
    public long SessionLimit { get; init; } = 2L * 1024 * 1024 * 1024;
    public long TotalLimit { get; init; } = 10L * 1024 * 1024 * 1024;
    public long FreeSpaceFloor { get; init; } = 512L * 1024 * 1024;
    public long SegmentSize { get; init; } = 64L * 1024 * 1024;
    public static TelemetryOptions FromEnvironment()
    {
        string Read(string key) => Environment.GetEnvironmentVariable($"TELEMETRY_{key}") ?? throw new InvalidOperationException($"Missing TELEMETRY_{key}");
        var version = typeof(TelemetryOptions).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false).Cast<System.Reflection.AssemblyInformationalVersionAttribute>().Single().InformationalVersion.Split('+')[0];
        if (version != Read("VERSION")) throw new InvalidOperationException("Telemetry binary version mismatch");
        var options = new TelemetryOptions(Path.GetFullPath(Read("ROOT")), Read("TOKEN"), Read("INSTANCE"), int.Parse(Read("PARENT_PID")), version);
        if (options.Token.Length < 32 || !Guid.TryParse(options.InstanceId, out _) || options.ParentPid <= 0) throw new ArgumentException("Invalid worker bootstrap");
        return options;
    }
}
