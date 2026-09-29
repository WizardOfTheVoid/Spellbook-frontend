using CoreHost.Actions;
using CoreHost.Clipboard;
using CoreHost.Commands;
using CoreHost.Execution;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Window;
using CoreHost.Win32;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CoreHost.Tests.Execution;

public sealed class GameActionRuntimeTests
{
    [Fact]
    public void visibleCursorAloneDoesNotBlockCommands()
    {
        var fixture = new Fixture();
        fixture.Native.CursorFlags = 1;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
    }

    [Theory]
    [InlineData(true, 40000)]
    [InlineData(false, 10000)]
    public void keyboardUsedMouseVisibleRefreshesGateForCurrentMenuStateAndRespectsPriorityBypass(bool mainMenu, int cooldownMs)
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Input.setMainMenu(mainMenu);
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.activity("cursor");
        Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand().Reason);
        clock.Milliseconds = 40000;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.activity("cursor");
        Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand().Reason);
        fixture.Native.CursorFlags = 0;
        clock.Milliseconds = 40000 + cooldownMs - 1;
        foreach (var priority in new[] { "normal", "low" })
            Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand(priority).Reason);
        Assert.True(fixture.Runtime.canExecuteCommand("high").Allowed);
        fixture.Config.CurrentValue.QueueGateHigh = 150;
        Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand("high").Reason);
        clock.Milliseconds = 40000 + cooldownMs;
        foreach (var priority in new[] { "normal", "low", "high" })
            Assert.True(fixture.Runtime.canExecuteCommand(priority).Allowed);
    }

    [Fact]
    public async Task appFocusClearsKeyboardUsedMouseVisibleCooldownAndRoundTripSuppressesIt()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.activity("cursor");
        Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand().Reason);
        fixture.Native.Foreground = 1;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        fixture.activity("cursor");
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.Native.CursorFlags = 0;
        clock.Milliseconds = 2000;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.activity("cursor");
        Assert.Equal("KeyboardUsedMouseVisible", fixture.Runtime.canExecuteCommand().Reason);
    }

    [Theory]
    [InlineData(0u)]
    [InlineData(2u)]
    [InlineData(null)]
    public void hiddenSuppressedOrUnreadableCursorDoesNotStartCooldown(uint? flags)
    {
        var fixture = new Fixture();
        fixture.Native.CursorFlags = flags;
        fixture.Input.key(65, true, false);
        fixture.Input.key(65, false, false);
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.Native.Foreground = 3;
        fixture.activity("cursor");
        fixture.Input.snapshot(0);
        fixture.Native.CursorFlags = 0;
        fixture.Native.Foreground = 2;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
    }

    [Fact]
    public void injectedKeysAndReleaseAloneWithVisibleCursorDoNotStartGate()
    {
        var fixture = new Fixture();
        fixture.Native.CursorFlags = 1;
        fixture.Input.key(65, true, true);
        fixture.Input.key(65, false, true);
        fixture.Input.key(65, false, false);
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
    }

    [Theory]
    [InlineData("user", 1, true)]
    [InlineData("system", 1, false)]
    [InlineData("user", 2, false)]
    [InlineData("system", 2, false)]
    public async Task onlyManualAppRoundTripsSuppressClicks(string author, int foreground, bool blocked)
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = foreground;
        var request = fixture.request() with { Author = author };
        var action = new QueuedAction(request, Environment.TickCount64 + 30000, TestContext.Current.CancellationToken);
        Assert.True((await fixture.Runtime.prepare(action, TestContext.Current.CancellationToken)).Ok);
        Assert.Equal(blocked, fixture.Input.suppressMouseClick(1, true, false));
        Assert.Equal(blocked, fixture.Input.suppressMouseClick(1, false, false));
        await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);
        fixture.Native.Foreground = 2;
        Assert.False(fixture.Input.suppressMouseClick(1, true, false));
    }

    [Fact]
    public async Task appFocusAllowsQueuedBanAfterChatAndFreshGameInputStillBlocks()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Config.CurrentValue.QueueGateNormal = 1900;
        fixture.activity("chat");
        Assert.True(fixture.Input.gameSnapshot(1900).IsChatting);
        fixture.Input.key(0x72, true, false);
        fixture.Native.Foreground = 1;
        fixture.Input.key(0x72, false, false);
        fixture.Input.mouse(1, true, false);
        fixture.Input.mouse(1, false, false);
        var request = fixture.request(item: new("console", "Ban player-id 1 reason", "NumpadSubtract"));

        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.True(fixture.Runtime.eligibility(request).Allowed);
        var physical = fixture.Input.snapshot(1900);
        Assert.True(physical.CheckLockActive);
        Assert.False(physical.KeyboardActive);
        Assert.False(physical.MouseActive);
        Assert.False(physical.IsChatting);
        Assert.Equal(0, physical.ChatCooldownRemainingMs);
        Assert.True(fixture.Input.gameSnapshot(1900).CheckLockActive);
        var queue = new ActionQueue();
        using var worker = new ActionWorker(queue, fixture.Runtime, fixture.Config);
        var completion = queue.enqueue(request, Environment.TickCount64, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);

        Assert.True(completion.IsCompleted);
        Assert.True((await completion).Ok);
        Assert.Equal(new IntPtr(1), fixture.Native.Foreground);
        clock.Milliseconds = 2000;
        fixture.Native.Foreground = 2;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.Null(fixture.Input.gameSnapshot(1900).TimeSinceChattingMs);
        fixture.Input.key(87, true, false);
        Assert.Equal("KEYBOARD_ACTIVE", fixture.Runtime.canExecuteCommand().Reason);
        fixture.Input.key(87, false, false);
        fixture.activity("chat");
        clock.Milliseconds = 4000;
        Assert.Equal("CHAT_ACTIVE", fixture.Runtime.canExecuteCommand().Reason);
    }

    [Fact]
    public async Task appRoundTripDoesNotTurnOverlappingTypingIntoGameActivity()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Native.Foreground = 1;
        clock.Milliseconds = 10000;
        var request = fixture.request() with { Commands = [Fixture.command(), Fixture.command()] };
        fixture.Native.OnFocus = () =>
        {
            fixture.Input.key(0x59, true, false);
            fixture.Input.mouse(1, true, false);
        };
        fixture.Native.OnInput = _ =>
        {
            Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
            Assert.True(fixture.Runtime.eligibility(request).Allowed);
            var state = fixture.Input.gameSnapshot(1900);
            Assert.False(state.KeyboardActive);
            Assert.False(state.MouseActive);
            Assert.False(state.IsChatting);
        };
        var queue = new ActionQueue();
        using var worker = new ActionWorker(queue, fixture.Runtime, fixture.Config);
        var completion = queue.enqueue(request, Environment.TickCount64, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);

        Assert.True(completion.IsCompleted);
        Assert.True((await completion).Ok);
        Assert.Equal(new IntPtr(1), fixture.Native.Foreground);
        Assert.False(fixture.Input.snapshot(0).KeyboardActive);
        Assert.Contains(0x59, fixture.Input.diagnostics().HeldKeys);
        fixture.Input.key(0x59, false, false);
        fixture.Input.mouse(1, false, false);
        Assert.Empty(fixture.Input.diagnostics().HeldKeys);
        Assert.Empty(fixture.Input.diagnostics().HeldButtons);
        fixture.Native.Foreground = 2;
        Assert.Null(fixture.Input.gameSnapshot(0).TimeSinceChattingMs);
    }

    [Fact]
    public async Task appRoundTripLockExpiresWithoutRestoringOldChatOrLosingHeldKeys()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.activity("chat");
        clock.Milliseconds = 1000;
        fixture.Native.Foreground = 1;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        fixture.Input.key(0x59, true, false);
        fixture.Input.mouse(1, true, false);
        clock.Milliseconds = 2999;
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.False(fixture.Input.gameSnapshot(0).IsChatting);

        clock.Milliseconds = 3000;

        Assert.Equal("KEYBOARD_ACTIVE", fixture.Runtime.canExecuteCommand().Reason);
        fixture.Input.key(0x59, false, false);
        Assert.Equal("MOUSE_ACTIVE", fixture.Runtime.canExecuteCommand().Reason);
        fixture.Input.mouse(1, false, false);
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        Assert.Null(fixture.Input.gameSnapshot(0).TimeSinceChattingMs);
    }

    [Fact]
    public async Task roundTripPreservesMinimumIdleInsteadOfResettingItOrBypassingOtherActions()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Native.Foreground = 1;
        var command = new CoreCommand("keys", Presses: [new(78, 1)], MinimumIdleMs: 5000);
        var request = fixture.request(item: command);
        Assert.Equal("MINIMUM_IDLE_NOT_REACHED", fixture.Runtime.eligibility(request).Reason);
        clock.Milliseconds = 10000;
        Assert.True(fixture.Runtime.eligibility(request).Allowed);
        Assert.True((await fixture.Runtime.prepare(fixture.queued(command), TestContext.Current.CancellationToken)).Ok);
        fixture.activity("keyboard");
        fixture.activity("mouse");

        Assert.True(fixture.Runtime.eligibility(request).Allowed);
        Assert.Equal(10000, fixture.Input.snapshot(0).IdleMs);
        Assert.Equal("MINIMUM_IDLE_NOT_REACHED", fixture.Runtime.eligibility(
            fixture.request(item: command with { MinimumIdleMs = 20000 })).Reason);
    }

    [Theory]
    [InlineData("unavailable", "INPUT_MONITOR_UNAVAILABLE")]
    [InlineData("window", "WINDOW_NOT_READY")]
    [InlineData("focus", "WINDOW_NOT_FOREGROUND")]
    public async Task roundTripStillEnforcesNonActivityChecks(string failure, string expected)
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = 1;
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        if (failure == "unavailable") fixture.Input.setAvailable(false);
        else if (failure == "window") fixture.Native.Ready = false;
        else fixture.Native.Foreground = 3;

        Assert.Equal(expected, fixture.Runtime.canExecuteCommand().Reason);
    }

    [Fact]
    public async Task cancelledRestoreClearsRoundTripIntentAndCheckLock()
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = 1;
        var request = fixture.request() with { Author = "user" };
        var action = new QueuedAction(request, Environment.TickCount64 + 30000, TestContext.Current.CancellationToken);
        Assert.True((await fixture.Runtime.prepare(action, TestContext.Current.CancellationToken)).Ok);
        Assert.True(fixture.Input.SuppressMouseClicks);
        fixture.activity("keyboard");
        Assert.True(fixture.Input.WillPerformAppRoundTrip);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var warnings = await fixture.Runtime.cleanup(cancellation.Token);

        Assert.Contains(warnings, warning => warning.StartsWith("FOREGROUND_RESTORE_FAILED:", StringComparison.Ordinal));
        Assert.False(fixture.Input.SuppressMouseClicks);
        Assert.False(fixture.Input.suppressMouseClick(1, true, false));
        Assert.False(fixture.Input.WillPerformAppRoundTrip);
        Assert.False(fixture.Input.isCheckLockActive());
        Assert.Equal("KEYBOARD_ACTIVE", fixture.Runtime.canExecuteCommand().Reason);
    }

    [Fact]
    public void chatCooldownBlocksAfterKeyReleaseUntilItExpires()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Input.key(13, true, true);
        Assert.True(fixture.Runtime.canExecuteCommand().Allowed);
        fixture.activity("chat");
        clock.Milliseconds = 24999;
        foreach (var priority in new[] { "normal", "low" })
            Assert.Equal("CHAT_ACTIVE", fixture.Runtime.canExecuteCommand(priority).Reason);
        Assert.True(fixture.Runtime.canExecuteCommand("high").Allowed);
        fixture.Config.CurrentValue.QueueGateHigh = 150;
        Assert.Equal("CHAT_ACTIVE", fixture.Runtime.canExecuteCommand("high").Reason);
        clock.Milliseconds = 25000;
        foreach (var priority in new[] { "normal", "low", "high" })
            Assert.True(fixture.Runtime.canExecuteCommand(priority).Allowed);
    }

    [Fact]
    public void priorityGatesWaitIndependentlyAfterKeyRelease()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Config.CurrentValue.QueueGateNormal = 500;
        fixture.Config.CurrentValue.QueueGateLow = 1500;
        fixture.Input.key(87, true, false);
        fixture.Input.key(87, false, false);
        clock.Milliseconds = 1000;
        Assert.True(fixture.Runtime.eligibility(fixture.request("normal")).Allowed);
        Assert.False(fixture.Runtime.eligibility(fixture.request("low")).Allowed);
        Assert.True(fixture.Runtime.eligibility(fixture.request("high")).Allowed);
        clock.Milliseconds = 1500;
        Assert.True(fixture.Runtime.eligibility(fixture.request("low")).Allowed);

        fixture.Config.CurrentValue.QueueGateHigh = 1000;
        fixture.Input.key(87, true, false);
        clock.Milliseconds = 5000;
        Assert.False(fixture.Runtime.eligibility(fixture.request("high")).Allowed);
        fixture.Input.key(87, false, false);
        Assert.False(fixture.Runtime.eligibility(fixture.request("high")).Allowed);
        clock.Milliseconds = 6000;
        Assert.True(fixture.Runtime.eligibility(fixture.request("high")).Allowed);
    }

    [Theory]
    [InlineData("keyboard", "KEYBOARD_ACTIVE")]
    [InlineData("mouse", "MOUSE_ACTIVE")]
    [InlineData("unavailable", "INPUT_MONITOR_UNAVAILABLE")]
    public void highBypassesPhysicalActivityOnly(string activity, string reason)
    {
        var fixture = new Fixture();
        fixture.activity(activity);

        Assert.Equal(reason, fixture.Runtime.eligibility(fixture.request()).Reason);
        Assert.True(fixture.Runtime.eligibility(fixture.request("high")).Allowed);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void highStillRequiresForegroundWindowReadiness(int foreground)
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = foreground;
        fixture.Native.Ready = false;

        var result = fixture.Runtime.eligibility(fixture.request("high"));

        Assert.False(result.Allowed);
        Assert.Equal("WINDOW_NOT_READY", result.Reason);
    }

    [Fact]
    public void highDoesNotRunWhenAnotherApplicationIsForeground()
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = 3;

        Assert.Equal("WINDOW_NOT_FOREGROUND", fixture.Runtime.eligibility(fixture.request("high")).Reason);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void missingAppOrGameDisablesExecutionEvenForHigh(int handle)
    {
        var fixture = new Fixture();
        fixture.Native.Owners.Remove(handle);

        var result = fixture.Runtime.eligibility(fixture.request("high"));

        Assert.False(result.Allowed);
        Assert.True(result.Unavailable);
        Assert.Equal("PROCESS_NOT_RUNNING", result.Reason);
    }

    [Fact]
    public void highRejectsReplacedAppRegistration()
    {
        var fixture = new Fixture();
        Assert.True(fixture.Windows.register(new(3, "0x3")));

        var result = fixture.Runtime.eligibility(fixture.request("high"));

        Assert.False(result.Allowed);
        Assert.True(result.Unavailable);
        Assert.Equal("APP_SESSION_CHANGED", result.Reason);
    }

    [Theory]
    [InlineData("keyboard", "KEYBOARD_ACTIVE")]
    [InlineData("mouse", "MOUSE_ACTIVE")]
    [InlineData("chat", "CHAT_ACTIVE")]
    [InlineData("cursor", "KeyboardUsedMouseVisible")]
    public async Task physicalInputAfterPasteInterruptsBeforeEnter(string activity, string reason)
    {
        var fixture = new Fixture();
        fixture.Native.OnInput = events => { if (events.Any(item => item.VirtualKey == 86)) fixture.activity(activity); };

        var result = await fixture.execute();

        Assert.True(result.Paused);
        Assert.False(result.Sent);
        Assert.Equal(reason, result.ErrorCode);
        Assert.Equal(0, fixture.Submitted);
        Assert.DoesNotContain(fixture.Native.Inputs, input => input.Event.VirtualKey == 13);
        Assert.Equal("original", fixture.Clipboard.Text);
        Assert.True(fixture.Console.needsCleanup);
    }

    [Fact]
    public async Task highStillInterruptsWhenGameReadinessIsLostBeforeEnter()
    {
        var fixture = new Fixture();
        fixture.Native.OnInput = _ => fixture.Native.Ready = false;

        var result = await fixture.execute("high");

        Assert.True(result.Paused);
        Assert.Equal("WINDOW_NOT_READY", result.ErrorCode);
        Assert.False(result.Sent);
        Assert.DoesNotContain(fixture.Native.Inputs, input => input.Event.VirtualKey is 86 or 13);
    }

    [Fact]
    public async Task highCanSubmitWhilePhysicalKeysAreHeld()
    {
        var fixture = new Fixture();
        fixture.activity("keyboard");
        fixture.activity("mouse");

        var result = await fixture.execute("high");

        Assert.True(result.Sent);
        Assert.False(result.Paused);
        Assert.Null(result.ErrorCode);
        Assert.Equal(1, fixture.Submitted);
        Assert.Contains(fixture.Native.Inputs, input => input.Event.VirtualKey == 13);
    }

    [Fact]
    public async Task physicalInputCancelsDelayAndRetainsUnelapsedDelay()
    {
        var fixture = new Fixture();
        var command = Fixture.command() with { DelayMs = 10000 };
        var action = fixture.queued(command);
        var execution = fixture.Runtime.execute(action, command, () => fixture.Submitted++, TestContext.Current.CancellationToken);
        fixture.activity("keyboard");

        var result = await execution.WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);

        Assert.True(result.Paused);
        Assert.Equal("KEYBOARD_ACTIVE", result.ErrorCode);
        Assert.False(action.DelayComplete);
        Assert.InRange(action.DelayRemainingMs, 1, 10000);
        Assert.Empty(fixture.Native.Inputs);
        Assert.Equal("original", fixture.Clipboard.Text);
    }

    [Fact]
    public async Task interruptionStaysCancelledAfterPhysicalInputBecomesIdleDuringAwait()
    {
        var fixture = new Fixture();
        fixture.Clipboard.AfterWrite = async token =>
        {
            fixture.activity("keyboard");
            try { await Task.Delay(Timeout.Infinite, token); }
            catch (OperationCanceledException) { }
            fixture.Input.key(65, false, false);
        };

        var result = await fixture.execute().WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);

        Assert.True(fixture.Runtime.eligibility(fixture.request()).Allowed);
        Assert.True(result.Paused);
        Assert.Equal("KEYBOARD_ACTIVE", result.ErrorCode);
        Assert.False(result.Sent);
        Assert.Empty(fixture.Native.Inputs);
        Assert.Equal("original", fixture.Clipboard.Text);
    }

    [Theory]
    [InlineData(2, 1, true)]
    [InlineData(3, 3, false)]
    public async Task cleanupRestoresAppOnlyWhileGameStillOwnsForeground(int foreground, int expected, bool restored)
    {
        var fixture = new Fixture();
        fixture.Native.Foreground = 1;
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        fixture.Native.Foreground = foreground;
        fixture.Native.FocusRequests.Clear();

        var warnings = await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);

        Assert.Empty(warnings);
        Assert.Equal(new IntPtr(expected), fixture.Native.Foreground);
        Assert.Equal(restored ? new IntPtr[] { 1 } : [], fixture.Native.FocusRequests);
    }

    [Fact]
    public async Task cleanupDoesNotRestoreAppWhenExecutionStartedInGame()
    {
        var fixture = new Fixture();
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);

        await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);

        Assert.Equal(new IntPtr(2), fixture.Native.Foreground);
        Assert.Empty(fixture.Native.FocusRequests);
    }

    [Fact]
    public async Task pendingConsoleCleanupIsDeferredUntilGameIsReadyAgain()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Native.Foreground = 1;
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        clock.Milliseconds = 2000;
        fixture.Native.OnInput = _ => fixture.activity("keyboard");
        Assert.True((await fixture.execute()).Paused);
        fixture.Native.OnInput = null;
        fixture.Native.Foreground = 3;
        fixture.Native.Inputs.Clear();
        fixture.Native.FocusRequests.Clear();

        var warnings = await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);

        Assert.Contains("CONSOLE_CLEANUP_DEFERRED", warnings);
        Assert.True(fixture.Console.needsCleanup);
        Assert.Empty(fixture.Native.Inputs);
        Assert.Empty(fixture.Native.FocusRequests);
        fixture.Input.key(65, false, false);
        fixture.Native.Foreground = 2;
        fixture.Processes.Game = fixture.Processes.Game with { Name = "updated metadata", MainWindowTitle = "new title" };
        fixture.Runtime.refresh();

        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);

        Assert.False(fixture.Console.needsCleanup);
        Assert.Equal(4, fixture.Native.Inputs.Count);
        Assert.Equal(new uint[] { 8, 10, 8, 10 }, fixture.Native.Inputs.Select(input => input.Event.Flags));
        Assert.All(fixture.Native.Inputs, input => { Assert.Equal(74, input.Event.ScanCode); Assert.Equal(0, input.Event.VirtualKey); Assert.Equal(new IntPtr(2), input.Foreground); });
    }

    [Theory]
    [InlineData("NumpadSubtract", 74)]
    [InlineData("Backquote", 41)]
    public async Task interruptedConsoleClosesWithTwoPressesOfItsOwnKey(string key, int scanCode)
    {
        var fixture = new Fixture();
        var command = Fixture.command() with { ConsoleKey = key };
        fixture.Native.OnInput = _ => fixture.activity("keyboard");
        var result = await fixture.Runtime.execute(fixture.queued(command), command, () => fixture.Submitted++, TestContext.Current.CancellationToken);
        Assert.True(result.Paused);
        fixture.Native.OnInput = null;
        fixture.Native.Inputs.Clear();

        Assert.Empty(await fixture.Runtime.cleanup(TestContext.Current.CancellationToken));

        Assert.Equal(new uint[] { 8, 10, 8, 10 }, fixture.Native.Inputs.Select(input => input.Event.Flags));
        Assert.All(fixture.Native.Inputs, input => { Assert.Equal(scanCode, input.Event.ScanCode); Assert.Equal(0, input.Event.VirtualKey); });
        Assert.False(fixture.Console.needsCleanup);
        Assert.Equal(0, fixture.Submitted);
        fixture.Native.Inputs.Clear();
        await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);
        Assert.Empty(fixture.Native.Inputs);
    }

    [Fact]
    public async Task failedConsoleCleanupStillRestoresApp()
    {
        var clock = new Clock();
        var fixture = new Fixture(clock);
        fixture.Native.Foreground = 1;
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        clock.Milliseconds = 2000;
        fixture.Native.OnInput = _ => fixture.activity("keyboard");
        Assert.True((await fixture.execute()).Paused);
        fixture.Native.OnInput = null;
        fixture.Native.FailInput = true;

        var warnings = await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);

        Assert.Contains(warnings, warning => warning.StartsWith("CONSOLE_CLEANUP_FAILED:", StringComparison.Ordinal));
        Assert.True(fixture.Console.needsCleanup);
        Assert.Equal(new IntPtr(1), fixture.Native.Foreground);
    }

    [Theory]
    [InlineData(4, 2)]
    [InlineData(2, 4)]
    public async Task pausedProgressCannotResumeInAnotherGameProcessOrWindow(int processId, int handle)
    {
        var fixture = new Fixture();
        var queue = new ActionQueue();
        using var worker = new ActionWorker(queue, fixture.Runtime, new Options());
        fixture.Native.OnInput = events => { if (events.Any(item => item.VirtualKey == 13)) fixture.activity("keyboard"); };
        var request = fixture.request() with { Commands = [Fixture.command(), Fixture.command() with { Command = "Adminsay second" }] };
        var completion = queue.enqueue(request, Environment.TickCount64, 10000, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        Assert.False(completion.IsCompleted);
        Assert.Equal(1, queue.snapshot(Environment.TickCount64).Cursor);
        fixture.replaceGame(processId, handle);
        fixture.Input.key(65, false, false);
        fixture.Native.Foreground = 1;
        fixture.Native.Inputs.Clear();
        fixture.Native.FocusRequests.Clear();

        await worker.step(TestContext.Current.CancellationToken);

        Assert.True(completion.IsCompleted);
        var result = await completion;
        Assert.Equal("GAME_SESSION_CHANGED", result.ErrorCode);
        var data = JsonSerializer.SerializeToElement(result.Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal("cancelled", data.GetProperty("status").GetString());
        Assert.Equal(1, data.GetProperty("sentCommands").GetInt32());
        Assert.Empty(fixture.Native.Inputs);
        Assert.Empty(fixture.Native.FocusRequests);
    }

    [Theory]
    [InlineData(4, 2, false)]
    [InlineData(2, 4, false)]
    [InlineData(4, 2, true)]
    [InlineData(2, 4, true)]
    public async Task deferredConsoleCleanupIsDiscardedWhenGameIdentityChanges(int processId, int handle, bool prepareNext)
    {
        var fixture = new Fixture();
        Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        fixture.Native.OnInput = _ => fixture.activity("keyboard");
        Assert.True((await fixture.execute()).Paused);
        fixture.Native.OnInput = null;
        fixture.Native.Foreground = 3;
        Assert.Contains("CONSOLE_CLEANUP_DEFERRED", await fixture.Runtime.cleanup(TestContext.Current.CancellationToken));
        Assert.True(fixture.Console.needsCleanup);
        fixture.Input.key(65, false, false);
        fixture.replaceGame(processId, handle);
        fixture.Native.Inputs.Clear();

        if (prepareNext) Assert.True((await fixture.Runtime.prepare(fixture.queued(Fixture.command()), TestContext.Current.CancellationToken)).Ok);
        else await fixture.Runtime.cleanup(TestContext.Current.CancellationToken);

        Assert.False(fixture.Console.needsCleanup);
        Assert.Empty(fixture.Native.Inputs);
    }

    [Theory]
    [InlineData(4, 2)]
    [InlineData(2, 4)]
    public async Task executionRejectsGameIdentityChangeAfterPreparation(int processId, int handle)
    {
        var fixture = new Fixture();
        var command = Fixture.command();
        var action = fixture.queued(command);
        Assert.True((await fixture.Runtime.prepare(action, TestContext.Current.CancellationToken)).Ok);
        fixture.replaceGame(processId, handle);

        var result = await fixture.Runtime.execute(action, command, () => fixture.Submitted++, TestContext.Current.CancellationToken);

        Assert.Equal("GAME_SESSION_CHANGED", result.ErrorCode);
        Assert.False(result.Paused);
        Assert.False(result.Sent);
        Assert.Empty(fixture.Native.Inputs);
        Assert.Equal("original", fixture.Clipboard.Text);
    }

    private sealed class Fixture
    {
        internal readonly NativeApi Native = new();
        internal readonly ClipboardApi Clipboard = new();
        internal readonly InputActivityTracker Input;
        internal readonly Options Config = new();
        internal readonly Locator Processes = new();
        internal readonly GameWindows Windows;
        internal readonly ConsoleCommandRunner Console;
        internal readonly GameActionRuntime Runtime;
        internal int Submitted;
        internal Fixture(TimeProvider? clock = null)
        {
            var options = Config;
            var keyboard = new KeyboardInput(Native);
            var activity = new ConsoleCommandActivity();
            Windows = new(Processes, Native, Native, new(Native), options);
            Assert.True(Windows.register(new(1, "0x1")));
            Windows.refresh();
            Input = new(clock, gameFocused: () => Windows.isFocused("game"), appFocused: () => Windows.isFocused("app"), cursor: Native);
            Input.setAvailable(true);
            Console = new(keyboard, new CommandClipboard(Clipboard), new ListPlayersParser(), activity, options);
            Runtime = new(Windows, Input, keyboard, Console, new(keyboard, activity), options);
        }
        internal static CoreCommand command() => new("console", "Adminsay test", "NumpadSubtract");
        internal CoreActionRequest request(string priority = "normal", CoreCommand? item = null) =>
            new("id", "key", "test", priority, new(1, "0x1"), [item ?? command()]);
        internal QueuedAction queued(CoreCommand item, string priority = "normal") =>
            new(request(priority, item), Environment.TickCount64 + 30000, TestContext.Current.CancellationToken) { Game = Windows.gameProcess };
        internal Task<CommandOutcome> execute(string priority = "normal") =>
            Runtime.execute(queued(command(), priority), command(), () => Submitted++, TestContext.Current.CancellationToken);
        internal void activity(string value)
        {
            if (value == "keyboard") Input.key(65, true, false);
            else if (value == "mouse") Input.mouse(1, true, false);
            else if (value == "chat") { Input.key(13, true, false); Input.key(13, false, false); }
            else if (value == "cursor")
            {
                Native.CursorFlags = 1;
                Input.key(65, true, false);
                Input.key(65, false, false);
            }
            else Input.setAvailable(false);
        }
        internal void replaceGame(int processId, int handle)
        {
            Processes.Game = Processes.Game with { Id = processId, WindowHandle = handle, MainWindowHandle = $"0x{handle:x}" };
            Native.Owners[handle] = (uint)processId;
            Native.Foreground = handle;
            Runtime.refresh();
        }
    }

    private sealed class Clock : TimeProvider
    {
        internal long Milliseconds;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Milliseconds;
    }

    private sealed class Options : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new()
        {
            Window = new() { FocusTimeoutMs = 30, FocusSettleMs = 0, RestoreSettleMs = 0, ProcessPollMs = 0 },
            QueueGateNormal = 0, QueueGateLow = 0, Input = new() { SubmitSettleMs = 0 }, Queue = new() { RecheckMs = 5 }
        };
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    private sealed class Locator : IGameProcessTargetLocator
    {
        internal GameProcessInfo Game = new(2, 2, "game", null, true, "0x2", null, null);
        public GameProcessLookupResult GetTargetProcess() => GameProcessLookupResult.Found(Game, []);
    }

    private sealed class NativeApi : IWindowApi, IWindowReadiness, IKeyboardInputApi, ICursorApi
    {
        internal uint? CursorFlags;
        public uint? getFlags() => CursorFlags;
        internal readonly Dictionary<IntPtr, uint> Owners = new() { [1] = 1, [2] = 2, [3] = 3 };
        internal IntPtr Foreground = 2;
        internal bool Ready = true, FailInput;
        internal Action<IReadOnlyList<KeyboardInputEvent>>? OnInput;
        internal Action? OnFocus;
        internal readonly List<(KeyboardInputEvent Event, IntPtr Foreground)> Inputs = [];
        internal readonly List<IntPtr> FocusRequests = [];
        public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> events)
        {
            if (FailInput) return new(0, 5);
            Inputs.AddRange(events.Select(item => (item, Foreground)));
            OnInput?.Invoke(events);
            return new((uint)events.Count, 0);
        }
        public bool isReady(IntPtr handle) => Ready && Foreground == handle;
        public IntPtr GetForegroundWindow() => Foreground;
        public bool SetForegroundWindow(IntPtr handle) { FocusRequests.Add(handle); Foreground = handle; OnFocus?.Invoke(); return true; }
        public bool BringWindowToTop(IntPtr handle) => true;
        public bool AttachThreadInput(uint from, uint to, bool attach) => true;
        public bool IsIconic(IntPtr handle) => false;
        public bool ShowWindow(IntPtr handle, int command) => true;
        public bool IsWindow(IntPtr handle) => Owners.ContainsKey(handle);
        public bool IsWindowVisible(IntPtr handle) => true;
        public uint GetCurrentThreadId() => 10;
        public uint GetWindowThreadProcessId(IntPtr handle, out uint owner) { owner = Owners.GetValueOrDefault(handle); return owner; }
    }

    private sealed class ClipboardApi : IClipboardService
    {
        internal string Text = "original";
        internal Func<CancellationToken, Task>? AfterWrite;
        private uint sequence = 1;
        public uint GetSequenceNumber() => sequence;
        public Task<ClipboardTextResult> ReadTextAsync(CancellationToken token) => Task.FromResult(ClipboardTextResult.TextValue(Text));
        public async Task<OperationResult> SetTextAsync(string text, CancellationToken token, uint? expectedSequence = null)
        {
            if (expectedSequence is { } expected && expected != sequence) return OperationResult.Failure("CLIPBOARD_CHANGED", "Changed");
            Text = text;
            sequence++;
            if (expectedSequence is null && AfterWrite is not null) await AfterWrite(token);
            return OperationResult.Success();
        }
    }
}
