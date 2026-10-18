using CoreHost.Debug;

namespace CoreHost.Tests.Debug;

public sealed class DebugShortcutsTests
{
    [Fact]
    public void removedNumpadPositionsDoNotTriggerTests()
    {
        var journal = new DebugJournal();
        var shortcuts = new DebugShortcuts(journal, () => true);
        shortcuts.setEnabled(true);
        foreach (var scanCode in new[] { 0x4C, 0x4D, 0x47, 0x48, 0x49 })
        {
            shortcuts.key(scanCode, true, false, false);
            shortcuts.key(scanCode, false, false, false);
        }
        Assert.DoesNotContain(journal.read(0).Events, item => item.Kind == "shortcut");
    }

    [Theory]
    [InlineData(0x4F, 1)]
    [InlineData(0x50, 2)]
    [InlineData(0x51, 3)]
    [InlineData(0x4B, 4)]
    public void physicalPositionsFireOncePerPressAcrossNumLock(int scanCode, int slot)
    {
        var journal = new DebugJournal();
        var shortcuts = new DebugShortcuts(journal, () => true);
        shortcuts.setEnabled(true);
        shortcuts.key(scanCode, true, injected: true, extended: false);
        shortcuts.key(scanCode, true, injected: false, extended: true);
        shortcuts.key(scanCode, true, injected: false, extended: false);
        shortcuts.key(scanCode, true, injected: false, extended: false);
        shortcuts.key(scanCode, false, injected: true, extended: false);
        shortcuts.key(scanCode, true, injected: false, extended: false);
        Assert.Single(journal.read(0).Events, item => item.Kind == "shortcut");
        shortcuts.key(scanCode, false, injected: false, extended: false);
        shortcuts.key(scanCode, true, injected: false, extended: false);
        Assert.Equal(new[] { slot, slot }, journal.read(0).Events.Where(item => item.Kind == "shortcut").Select(item => item.Slot!.Value));
    }

    [Fact]
    public void focusArmingAndHeartbeatPreventHeldAndStaleShortcuts()
    {
        long now = 0;
        var focused = false;
        var journal = new DebugJournal(() => now);
        var shortcuts = new DebugShortcuts(journal, () => focused, () => now);
        shortcuts.key(0x4F, true, false, false);
        focused = true;
        shortcuts.setEnabled(true);
        shortcuts.key(0x4F, true, false, false);
        Assert.DoesNotContain(journal.read(0).Events, item => item.Kind == "shortcut");
        shortcuts.key(0x4F, false, false, false);
        shortcuts.key(0x4F, true, false, false);
        now = 2000;
        Assert.False(shortcuts.heartbeat());
        Assert.DoesNotContain(shortcuts.events(0).Events, item => item.Kind == "shortcut");
        shortcuts.setEnabled(true);
        shortcuts.key(0x4F, true, false, false);
        Assert.DoesNotContain(shortcuts.events(0).Events, item => item.Kind == "shortcut");
        shortcuts.key(0x4F, false, false, false);
        now = 3000;
        Assert.True(shortcuts.heartbeat());
        shortcuts.key(0x4F, true, false, false);
        Assert.Single(shortcuts.events(0).Events, item => item.Kind == "shortcut");
    }

    [Theory]
    [InlineData(0x61, 0x4F)]
    [InlineData(0x23, 0x4F)]
    [InlineData(0x62, 0x50)]
    [InlineData(0x28, 0x50)]
    public void keysHeldWhenMonitoringStartsMustBeReleasedBeforeTheyCanTrigger(int virtualKey, int scanCode)
    {
        var journal = new DebugJournal();
        var shortcuts = new DebugShortcuts(journal, () => true);
        shortcuts.seedHeldKey(virtualKey);
        shortcuts.setEnabled(true);
        shortcuts.key(scanCode, true, false, false);
        Assert.DoesNotContain(shortcuts.events(0).Events, item => item.Kind == "shortcut");
        shortcuts.key(scanCode, false, false, false);
        shortcuts.key(scanCode, true, false, false);
        Assert.Single(shortcuts.events(0).Events, item => item.Kind == "shortcut");
    }
}
