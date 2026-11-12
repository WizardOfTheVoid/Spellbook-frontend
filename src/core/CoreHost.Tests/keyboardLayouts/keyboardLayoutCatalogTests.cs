using CoreHost.KeyboardLayouts;
using CoreHost.Models;

namespace CoreHost.Tests.KeyboardLayouts;

public sealed class KeyboardLayoutCatalogTests
{
    internal static readonly GameProcessInfo game = new(2, 22, "game", null, true, "0x2", null, null);

    [Fact]
    public void gameLayoutUsesGameThreadRatherThanCoreThread()
    {
        var native = new CatalogPlatform();
        var api = new Win32KeyboardLayoutApi(native);
        Assert.Equal("00000414", api.read(game).LayoutId);
        Assert.Equal(42u, native.lastThread);
        Assert.Contains(api.getInstalled(), layout => layout.Id == "00000409");
        Assert.Contains(api.getInstalled(), layout => layout.Id == "00000414");
        Assert.Empty(native.requests);
    }

    [Fact]
    public void englishLayoutsRemainDistinctAndHandlesCanChange()
    {
        var native = new CatalogPlatform();
        var api = new Win32KeyboardLayoutApi(native);
        native.layouts[3] = new("00000809", "UK");
        Assert.Equal(3, api.getInstalled().Count);
        native.layouts.Remove(2);
        native.layouts[12] = new("00000414", "Norwegian");
        native.active = 12;
        Assert.Equal("00000414", api.read(game).LayoutId);
    }

    [Fact]
    public void removedLayoutIsNotSilentlyReplaced()
    {
        var native = new CatalogPlatform();
        var api = new Win32KeyboardLayoutApi(native);
        var owner = api.read(game);
        native.layouts.Remove(1);
        Assert.Throws<KeyboardLayoutException>(() => api.request(owner, "00000409"));
        Assert.Empty(native.requests);
        native.owner = 99;
        Assert.Throws<KeyboardLayoutException>(() => api.read(game));
    }
}

internal sealed class CatalogPlatform : IKeyboardLayoutPlatform
{
    internal Dictionary<IntPtr, KeyboardLayoutInfo> layouts = new() { [1] = new("00000409", "US"), [2] = new("00000414", "Norwegian") };
    internal IntPtr active = 2;
    internal uint owner = 22, lastThread;
    internal List<IntPtr> requests = [];
    public IntPtr[] handles() => layouts.Keys.ToArray();
    public IReadOnlyDictionary<IntPtr, KeyboardLayoutInfo> resolve(IntPtr[] handles) => handles.ToDictionary(handle => handle, handle => layouts[handle]);
    public uint thread(IntPtr window, out uint processId) { processId = owner; return 42; }
    public IntPtr activeLayout(uint threadId) { lastThread = threadId; return active; }
    public bool post(IntPtr window, IntPtr handle) { requests.Add(handle); return true; }
}
