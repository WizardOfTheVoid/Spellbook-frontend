using System.ComponentModel;
using System.Diagnostics;

namespace CoreHost.Debug;

public sealed class CpuUsage(Func<double>? cpuMilliseconds = null, Func<long>? clock = null, int? processorCount = null)
{
    private readonly object sync = new();
    private readonly Func<double> cpuMilliseconds = cpuMilliseconds ?? readCpuMilliseconds;
    private readonly Func<long> clock = clock ?? (() => Environment.TickCount64);
    private readonly int processorCount = Math.Max(1, processorCount ?? Environment.ProcessorCount);
    private long? sampledAt;
    private double? previousCpu;
    private double? percent;

    public double? read()
    {
        lock (sync)
        {
            var now = clock();
            if (sampledAt is { } last && now - last < 1000) return percent;
            try
            {
                var cpu = cpuMilliseconds();
                percent = sampledAt is { } previous && previousCpu is { } baseline
                    ? Math.Clamp((cpu - baseline) / (now - previous) / processorCount * 100, 0, 100) : null;
                previousCpu = cpu;
            }
            catch (Win32Exception) { percent = null; previousCpu = null; }
            sampledAt = now;
            return percent;
        }
    }

    private static double readCpuMilliseconds()
    {
        using var process = Process.GetCurrentProcess();
        return process.TotalProcessorTime.TotalMilliseconds;
    }
}
