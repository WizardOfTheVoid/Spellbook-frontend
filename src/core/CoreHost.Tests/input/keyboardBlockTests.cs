using CoreHost.Debug;
using CoreHost.Input;
using CoreHost.Tests.Fakes;

namespace CoreHost.Tests.Input;

public sealed class KeyboardBlockTests
{
    [Fact]
    public void blocksPhysicalDownsButPassesInjectedInputAndReleases()
    {
        var input = tracker();
        input.blockKeyboard(true);
        Assert.True(input.keyboardBlocked);
        Assert.True(input.suppressKeyboard(true, false));
        Assert.False(input.suppressKeyboard(false, false));
        Assert.False(input.suppressKeyboard(true, true));
        Assert.False(input.suppressMouseClick(1, true, false));
        input.blockKeyboard(false);
        input.blockKeyboard(false);
        Assert.False(input.keyboardBlocked);
        Assert.False(input.suppressKeyboard(true, false));
    }

    [Fact]
    public void expiresAtTwoSecondsWithoutRenewal()
    {
        var clock = new Clock();
        var input = tracker(clock);
        input.blockKeyboard(true);
        clock.Milliseconds = 1999;
        input.blockKeyboard(true);
        Assert.True(input.keyboardBlocked);
        clock.Milliseconds = 2000;
        Assert.False(input.suppressKeyboard(true, false));
        Assert.False(input.keyboardBlocked);
    }

    [Fact]
    public void clearsOnFocusLossOrMonitorShutdown()
    {
        var focused = true;
        var input = tracker(focused: () => focused);
        input.blockKeyboard(true);
        focused = false;
        Assert.False(input.suppressKeyboard(true, false));
        focused = true;
        Assert.False(input.keyboardBlocked);
        input.blockKeyboard(true);
        input.setAvailable(false);
        Assert.False(input.keyboardBlocked);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public void cannotArmWithoutMonitoringOrGameFocus(bool available, bool focused)
    {
        var input = tracker(focused: () => focused);
        input.setAvailable(available);
        Assert.Throws<InputException>(() => input.blockKeyboard(true));
        Assert.False(input.keyboardBlocked);
        input.blockKeyboard(false);
    }

    [Fact]
    public void blockedKeysUpdatePhysicalStateWithoutFiringShortcuts()
    {
        var journal = new DebugJournal();
        var shortcuts = new DebugShortcuts(journal, () => true);
        var input = new InputActivityTracker(journal: journal, shortcuts: shortcuts, gameFocused: () => true);
        input.setAvailable(true);
        shortcuts.setEnabled(true);
        input.blockKeyboard(true);
        input.physicalKey(0x61, 0x4F, true, false, false);
        Assert.Contains(0x61, input.diagnostics().HeldKeys);
        input.physicalKey(0x61, 0x4F, false, false, false);
        Assert.Empty(input.diagnostics().HeldKeys);
        Assert.DoesNotContain(journal.read(0).Events, item => item.Kind == "shortcut");
        input.blockKeyboard(false);
        input.physicalKey(0x61, 0x4F, true, false, false);
        Assert.Single(journal.read(0).Events, item => item.Kind == "shortcut");
    }

    [Fact]
    public void restoredPhysicalModifiersAreNotOwnedByGeneratedKeyCleanup()
    {
        var native = new FakeKeyboardInputApi();
        var keyboard = new KeyboardInput(native);
        keyboard.setModifiers([0xA0, 0xA3, 87], false);
        keyboard.setModifiers([0xA0, 0xA3, 87], true);
        Assert.Equal(new ushort[] { 0xA0, 0xA3, 0xA0, 0xA3 }, native.InputBatches.SelectMany(batch => batch).Select(item => item.VirtualKey));
        Assert.All(native.InputBatches[0], item => Assert.NotEqual(0u, item.Flags & 2));
        Assert.All(native.InputBatches[1], item => Assert.Equal(0u, item.Flags & 2));
        Assert.True(keyboard.releaseAll().Ok);
        Assert.Equal(2, native.SendCalls);
    }

    [Fact]
    public void partiallyRestoredModifiersAreReleasedBeforeReportingFailure()
    {
        var native = new FakeKeyboardInputApi { Sent = 1 };
        var keyboard = new KeyboardInput(native);
        Assert.Throws<InputException>(() => keyboard.setModifiers([17, 18], true));
        Assert.Contains(native.InputBatches.Skip(1).SelectMany(batch => batch), item => item.VirtualKey == 17 && (item.Flags & 2) != 0);
        Assert.DoesNotContain(native.InputBatches.Skip(1).SelectMany(batch => batch), item => item.VirtualKey == 18);
    }

    [Theory]
    [InlineData(0x62, 0x50, 2)]
    [InlineData(0x65, 0x4C, 5)]
    [InlineData(0x66, 0x4D, 6)]
    public void blockedShortcutHeldThroughUnblockNeedsAFreshPress(int key, int scanCode, int slot)
    {
        var journal = new DebugJournal();
        var shortcuts = new DebugShortcuts(journal, () => true);
        var input = new InputActivityTracker(shortcuts: shortcuts, gameFocused: () => true);
        input.setAvailable(true);
        shortcuts.setEnabled(true);
        input.blockKeyboard(true);
        Assert.True(input.physicalKey(key, scanCode, true, false, false));
        input.blockKeyboard(false);
        Assert.False(input.physicalKey(key, scanCode, true, false, false));
        Assert.DoesNotContain(journal.read(0).Events, item => item.Kind == "shortcut");
        input.physicalKey(key, scanCode, false, false, false);
        input.physicalKey(key, scanCode, true, false, false);
        Assert.Equal(slot, Assert.Single(journal.read(0).Events, item => item.Kind == "shortcut").Slot);
    }

    private static InputActivityTracker tracker(TimeProvider? clock = null, Func<bool>? focused = null)
    {
        var input = new InputActivityTracker(clock, gameFocused: focused ?? (() => true));
        input.setAvailable(true);
        return input;
    }

    private sealed class Clock : TimeProvider
    {
        internal long Milliseconds;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Milliseconds;
    }
}
