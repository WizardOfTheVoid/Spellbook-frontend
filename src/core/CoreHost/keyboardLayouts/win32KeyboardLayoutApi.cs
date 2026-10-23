using System.Runtime.InteropServices;
using System.Text;
using CoreHost.Models;
using Microsoft.Win32;

namespace CoreHost.KeyboardLayouts;

public sealed class Win32KeyboardLayoutApi(IKeyboardLayoutPlatform? platform = null) : IKeyboardLayoutApi
{
    private readonly IKeyboardLayoutPlatform native = platform ?? new Win32KeyboardLayoutPlatform();
    private readonly object sync = new();
    private IntPtr[] handles = [];
    private IReadOnlyDictionary<IntPtr, KeyboardLayoutInfo> catalog = new Dictionary<IntPtr, KeyboardLayoutInfo>();

    public static bool validId(string? value) => value is { Length: 8 } && value != "00000000" && value.All(Uri.IsHexDigit);

    public IReadOnlyList<KeyboardLayoutInfo> getInstalled()
    {
        lock (sync) return refresh().Values.DistinctBy(layout => layout.Id).ToArray();
    }

    public GameKeyboardLayout read(GameProcessInfo game)
    {
        lock (sync)
        {
            var thread = native.thread(game.WindowHandle, out var process);
            if (thread == 0 || process != game.Id) throw new KeyboardLayoutException("KEYBOARD_LAYOUT_CHANGED", "The game window changed.");
            var handle = native.activeLayout(thread);
            if (!refresh().TryGetValue(handle, out var layout)) throw unavailable("The game's keyboard layout could not be resolved.");
            return new(game.Id, game.WindowHandle, thread, layout.Id, handle);
        }
    }

    public void request(GameKeyboardLayout owner, string layoutId)
    {
        lock (sync)
        {
            if (native.thread(owner.WindowHandle, out var process) != owner.ThreadId || process != owner.ProcessId)
                throw unavailable("The game window changed.");
            var matches = refresh().Where(pair => pair.Value.Id.Equals(layoutId, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (matches.Length != 1) throw unavailable("The selected keyboard layout is no longer configured.");
            if (!native.post(owner.WindowHandle, matches[0].Key))
                throw new KeyboardLayoutException("KEYBOARD_LAYOUT_SWITCH_FAILED", "Windows rejected the keyboard layout request.");
        }
    }

    private IReadOnlyDictionary<IntPtr, KeyboardLayoutInfo> refresh()
    {
        var current = native.handles();
        if (!current.SequenceEqual(handles))
        {
            var resolved = native.resolve(current);
            if (resolved.Count != current.Length || resolved.Values.Any(layout => !validId(layout.Id)))
                throw unavailable("Windows keyboard layouts could not be identified.");
            catalog = resolved;
            handles = current;
        }
        return catalog;
    }

    private static KeyboardLayoutException unavailable(string message) => new("KEYBOARD_LAYOUT_UNAVAILABLE", message);
}

internal sealed class Win32KeyboardLayoutPlatform : IKeyboardLayoutPlatform
{
    public IntPtr[] handles()
    {
        var count = GetKeyboardLayoutList(0, null);
        if (count <= 0) return [];
        var result = new IntPtr[count];
        var copied = GetKeyboardLayoutList(result.Length, result);
        return result.Take(copied).ToArray();
    }

    public IReadOnlyDictionary<IntPtr, KeyboardLayoutInfo> resolve(IntPtr[] handles)
    {
        var result = new Dictionary<IntPtr, KeyboardLayoutInfo>();
        Exception? failure = null;
        // Activation is thread-local; never leave a pool thread with another layout.
        var helper = new Thread(() =>
        {
            var original = GetKeyboardLayout(0);
            try
            {
                foreach (var handle in handles)
                {
                    if (ActivateKeyboardLayout(handle, 0) == IntPtr.Zero) throw new InvalidOperationException("Could not inspect a keyboard layout.");
                    var buffer = new StringBuilder(9);
                    if (!GetKeyboardLayoutNameW(buffer)) throw new InvalidOperationException("Could not identify a keyboard layout.");
                    var id = buffer.ToString().ToUpperInvariant();
                    result.Add(handle, new(id, displayName(id)));
                }
            }
            catch (Exception exception) { failure = exception; }
            finally { ActivateKeyboardLayout(original, 0); }
        }) { IsBackground = true, Name = "Keyboard layout catalog" };
        helper.Start();
        helper.Join();
        if (failure is not null) throw new KeyboardLayoutException("KEYBOARD_LAYOUT_UNAVAILABLE", failure.Message);
        return result;
    }

    public uint thread(IntPtr window, out uint processId)
    {
        processId = 0;
        return IsWindow(window) ? GetWindowThreadProcessId(window, out processId) : 0;
    }
    public IntPtr activeLayout(uint threadId) => GetKeyboardLayout(threadId);
    public bool post(IntPtr window, IntPtr handle) => PostMessageW(window, 0x0050, IntPtr.Zero, handle);

    private static string displayName(string id)
    {
        var key = $@"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Keyboard Layouts\{id}";
        var indirect = Registry.GetValue(key, "Layout Display Name", null) as string;
        if (indirect is not null)
        {
            var buffer = new StringBuilder(512);
            if (SHLoadIndirectString(indirect, buffer, (uint)buffer.Capacity, IntPtr.Zero) == 0 && buffer.Length > 0) return buffer.ToString();
        }
        return Registry.GetValue(key, "Layout Text", null) as string ?? id;
    }

    [DllImport("user32.dll")] private static extern int GetKeyboardLayoutList(int count, [Out] IntPtr[]? layouts);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint threadId);
    [DllImport("user32.dll")] private static extern IntPtr ActivateKeyboardLayout(IntPtr layout, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetKeyboardLayoutNameW(StringBuilder name);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)] private static extern int SHLoadIndirectString(string source, StringBuilder output, uint count, IntPtr reserved);
}
