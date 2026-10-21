using System.Globalization;
using CoreHost.Input;

namespace CoreHost.Actions;

public static class ActionValidation
{
    public static string? error(CoreActionRequest? action)
    {
        if (action is null || string.IsNullOrWhiteSpace(action.Id) || action.Id.Length > 96 ||
            string.IsNullOrWhiteSpace(action.Key) || action.Key.Length > 512) return "An Action id and replacement key are required.";
        if (action.Author is not ("user" or "system") || action.Priority is not ("low" or "normal" or "high"))
            return "Action author or priority is invalid.";
        if (action.TtlMs is <= 0) return "Action TTL must be positive.";
        if (action.App is null || action.App.ProcessId <= 0 || !tryHandle(action.App.WindowHandle, out _))
            return "A valid app process and window are required.";
        if (action.Commands is not { Count: > 0 and <= 999 }) return "An Action requires 1 to 999 Commands.";
        foreach (var command in action.Commands)
        {
            if (command is null || command.DelayMs < 0) return "Command delay is invalid.";
            if (command.Type == "console")
            {
                if (string.IsNullOrWhiteSpace(command.Command) || command.Command.Length > 4096 ||
                    command.Command.Any(char.IsControl)) return "Console text must be a single nonempty line.";
                if (!ConsoleKeys.contains(command.ConsoleKey)) return "Each console Command requires a supported consoleKey.";
            }
            else if (command.Type == "keys")
            {
                if (command.Presses is not { Count: > 0 and <= 999 } || command.MinimumIdleMs is < 0 ||
                    command.Presses.Any(press => press is null || press.VirtualKey is null or < 1 or > 254 || press.DurationMs is null or < 0 or > 60000))
                    return "Key presses or their minimum idle time are invalid.";
            }
            else return "Command type must be console or keys.";
        }
        return null;
    }

    public static bool tryHandle(string? text, out IntPtr handle)
    {
        handle = IntPtr.Zero;
        if (text is null || !text.StartsWith("0x", StringComparison.OrdinalIgnoreCase) || text.Length > 18 ||
            !ulong.TryParse(text.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var value) || value == 0)
            return false;
        handle = unchecked((IntPtr)(long)value);
        return true;
    }
}
