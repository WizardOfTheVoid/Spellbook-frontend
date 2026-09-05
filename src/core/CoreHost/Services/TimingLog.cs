using System.Diagnostics;
using System.Globalization;

namespace CoreHost.Services;

internal sealed class TimingLog
{
    private static readonly bool debug = false;
    private readonly Stopwatch _total = Stopwatch.StartNew();
    private readonly List<KeyValuePair<string, double>> _stages = [];

    public T Measure<T>(string stage, Func<T> action)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            return action();
        }
        finally
        {
            Add(stage, stopwatch.Elapsed.TotalMilliseconds);
        }
    }

    public async Task<T> MeasureAsync<T>(string stage, Func<Task<T>> action)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            return await action().ConfigureAwait(false);
        }
        finally
        {
            Add(stage, stopwatch.Elapsed.TotalMilliseconds);
        }
    }

    public async Task MeasureAsync(string stage, Func<Task> action)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await action().ConfigureAwait(false);
        }
        finally
        {
            Add(stage, stopwatch.Elapsed.TotalMilliseconds);
        }
    }

    public void Write(string category, params string[] fields)
    {
        if (!debug)
        {
            return;
        }

        Write(category, Console.WriteLine, fields);
    }

    public void Write(string category, Action<string>? writer, params string[] fields)
    {
        if (!debug && writer is null)
        {
            return;
        }

        _total.Stop();
        (writer ?? Console.WriteLine)(Format(category, fields, _stages, _total.Elapsed.TotalMilliseconds));
    }

    internal static string Format(
        string category,
        IEnumerable<string> fields,
        IEnumerable<KeyValuePair<string, double>> stages,
        double totalMs)
    {
        var parts = new List<string> { $"[{category}]" };
        parts.AddRange(fields.Where(field => !string.IsNullOrWhiteSpace(field)));

        var order = new List<string>();
        var totals = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var stage in stages)
        {
            if (string.IsNullOrWhiteSpace(stage.Key))
            {
                continue;
            }

            if (!totals.ContainsKey(stage.Key))
            {
                order.Add(stage.Key);
            }

            totals[stage.Key] = totals.GetValueOrDefault(stage.Key) + stage.Value;
        }

        parts.AddRange(order.Select(stage => $"{stage}={Milliseconds(totals[stage])}ms"));
        parts.Add($"total={Milliseconds(totalMs)}ms");
        return string.Join(' ', parts);
    }

    private void Add(string stage, double elapsedMs)
    {
        _stages.Add(new KeyValuePair<string, double>(stage, elapsedMs));
    }

    private static string Milliseconds(double value)
    {
        return value.ToString("0.###", CultureInfo.InvariantCulture);
    }
}
