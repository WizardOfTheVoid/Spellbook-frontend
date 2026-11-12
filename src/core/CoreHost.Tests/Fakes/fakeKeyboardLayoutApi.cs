using CoreHost.KeyboardLayouts;
using CoreHost.Models;

namespace CoreHost.Tests.Fakes;

public sealed class FakeKeyboardLayoutApi : IKeyboardLayoutApi
{
    public string current = "00000409";
    public uint thread = 42;
    public bool available = true, apply = true;
    public KeyboardLayoutException? readFailure;
    public List<string> requests = [];
    public Action<string>? onRequest;
    public IReadOnlyList<KeyboardLayoutInfo> getInstalled() => [new("00000409", "US"), new("00000414", "Norwegian"), new("00000809", "UK")];
    public GameKeyboardLayout read(GameProcessInfo game) => readFailure is not null ? throw readFailure : available ? new(game.Id, game.WindowHandle, thread, current, 1)
        : throw new KeyboardLayoutException("KEYBOARD_LAYOUT_CHANGED", "Game changed");
    public void request(GameKeyboardLayout owner, string layoutId)
    {
        requests.Add(layoutId);
        if (apply) current = layoutId;
        onRequest?.Invoke(layoutId);
    }
}
