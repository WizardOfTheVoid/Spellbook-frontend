using CoreHost.Win32;

namespace CoreHost.Tests.Fakes;

internal sealed class FakeWindowApi : IWindowApi
{
    public bool WindowExists { get; set; } = true;
    public bool WindowVisible { get; set; } = true;
    public uint WindowThreadId { get; set; } = 42;
    public uint OwnerProcessId { get; set; }
    public IntPtr ForegroundWindowHandle { get; set; }
    public bool SetForegroundWindowResult { get; set; } = true;
    public bool BringWindowToTopResult { get; set; } = true;
    public bool AttachThreadInputResult { get; set; } = true;
    public bool IsIconicResult { get; set; }
    public bool ShowWindowResult { get; set; } = true;
    public uint CurrentThreadId { get; set; } = 7;
    public bool UpdateForegroundWindowOnSuccess { get; set; }
    public Exception? SetForegroundWindowException { get; set; }
    public List<string> Calls { get; } = [];
    public Queue<bool> SetForegroundWindowResults { get; } = [];
    public Dictionary<IntPtr, uint> WindowThreadIds { get; } = [];
    public List<(uint AttachThreadId, uint AttachToThreadId, bool Attach)> AttachThreadInputCalls { get; } = [];
    public List<(IntPtr WindowHandle, int Command)> ShowWindowCalls { get; } = [];

    public IntPtr GetForegroundWindow()
    {
        Calls.Add(nameof(GetForegroundWindow));
        return ForegroundWindowHandle;
    }

    public bool SetForegroundWindow(IntPtr windowHandle)
    {
        Calls.Add(nameof(SetForegroundWindow));

        if (SetForegroundWindowException is not null)
        {
            throw SetForegroundWindowException;
        }

        var result = SetForegroundWindowResults.TryDequeue(out var queuedResult)
            ? queuedResult
            : SetForegroundWindowResult;

        if (result && UpdateForegroundWindowOnSuccess)
        {
            ForegroundWindowHandle = windowHandle;
        }

        return result;
    }

    public bool BringWindowToTop(IntPtr windowHandle)
    {
        Calls.Add(nameof(BringWindowToTop));
        return BringWindowToTopResult;
    }

    public bool AttachThreadInput(uint attachThreadId, uint attachToThreadId, bool attach)
    {
        Calls.Add(nameof(AttachThreadInput));
        AttachThreadInputCalls.Add((attachThreadId, attachToThreadId, attach));
        return AttachThreadInputResult;
    }

    public bool IsIconic(IntPtr windowHandle)
    {
        Calls.Add(nameof(IsIconic));
        return IsIconicResult;
    }

    public bool ShowWindow(IntPtr windowHandle, int command)
    {
        Calls.Add(nameof(ShowWindow));
        ShowWindowCalls.Add((windowHandle, command));
        return ShowWindowResult;
    }

    public bool IsWindow(IntPtr windowHandle)
    {
        Calls.Add(nameof(IsWindow));
        return WindowExists;
    }

    public bool IsWindowVisible(IntPtr windowHandle)
    {
        Calls.Add(nameof(IsWindowVisible));
        return WindowVisible;
    }

    public uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId)
    {
        Calls.Add(nameof(GetWindowThreadProcessId));
        processId = OwnerProcessId;
        return WindowThreadIds.GetValueOrDefault(windowHandle, WindowThreadId);
    }

    public uint GetCurrentThreadId()
    {
        Calls.Add(nameof(GetCurrentThreadId));
        return CurrentThreadId;
    }
}
