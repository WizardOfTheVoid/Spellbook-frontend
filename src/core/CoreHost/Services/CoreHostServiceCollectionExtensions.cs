using System.Text.Json.Serialization;
using CoreHost.Actions;
using CoreHost.Chivalry2;
using CoreHost.Clipboard;
using CoreHost.Commands;
using CoreHost.Execution;
using CoreHost.Debug;
using CoreHost.Runtime;
using CoreHost.Input;
using CoreHost.Options;
using CoreHost.Snapshot;
using CoreHost.Status;
using CoreHost.Window;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

internal static class CoreHostServiceCollectionExtensions
{
    public static IServiceCollection AddCoreHostServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.ConfigureHttpJsonOptions(options => options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
        services.AddOptions<CoreHostOptions>().Bind(configuration)
            .Validate(RuntimeOptions.valid, "Core timing values and queue capacity must be valid.").ValidateOnStart();
        services.AddSingleton<DebugJournal>(_ => new(capacity: configuration.Get<CoreHostOptions>()?.Debug.EventLimit ?? 500));
        services.AddSingleton<OptionsMonitor<CoreHostOptions>>();
        services.AddSingleton<DebugTimingSettings>(provider => new(provider.GetRequiredService<OptionsMonitor<CoreHostOptions>>(),
            EnvFile.ActivePath, provider.GetRequiredService<DebugJournal>()));
        services.AddSingleton<IOptionsMonitor<CoreHostOptions>>(provider => provider.GetRequiredService<DebugTimingSettings>());
        services.AddSingleton<DebugShortcuts>(provider => new(provider.GetRequiredService<DebugJournal>(),
            () => provider.GetRequiredService<GameWindows>().isFocused("game"), leaseMs: provider.GetRequiredService<IOptionsMonitor<CoreHostOptions>>().CurrentValue.Debug.SessionLeaseMs));
        services.AddSingleton<CoreDebug>();
        services.AddSingleton<IWindowApi, Win32WindowApi>();
        services.AddSingleton<IKeyboardInputApi, Win32KeyboardInputApi>();
        services.AddSingleton<GameProcessService>();
        services.AddSingleton<IGameProcessTargetLocator>(provider => provider.GetRequiredService<GameProcessService>());
        services.AddSingleton<INativeGameProcessLocator>(provider => provider.GetRequiredService<GameProcessService>());
        services.AddSingleton<IReadOnlyProcessMemoryReader, ReadOnlyProcessMemoryReader>();
        services.AddSingleton<NativeListPlayersService>();
        services.AddSingleton<ForegroundWindowService>();
        services.AddSingleton<IWindowReadiness, NativeWindowReadiness>();
        services.AddSingleton<GameWindows>();
        services.AddSingleton<InputActivityTracker>(provider => new(journal: provider.GetRequiredService<DebugJournal>(),
            shortcuts: provider.GetRequiredService<DebugShortcuts>(),
            gameFocused: () => provider.GetRequiredService<GameWindows>().isFocused("game")));
        services.AddHostedService<PhysicalInputMonitor>();
        services.AddSingleton<KeyboardInput>();
        services.AddSingleton<IClipboardService, TextCopyClipboardService>();
        services.AddSingleton<CommandClipboard>();
        services.AddSingleton<ListPlayersTextNormalizer>();
        services.AddSingleton<ListPlayersParser>();
        services.AddSingleton<ConsoleCommandActivity>();
        services.AddSingleton<ConsoleCommandRunner>();
        services.AddSingleton<KeyCommandRunner>();
        services.AddSingleton<ActionQueue>();
        services.AddSingleton<GameActionRuntime>();
        services.AddSingleton<IActionRuntime>(provider => provider.GetRequiredService<GameActionRuntime>());
        services.AddHostedService<ActionWorker>();
        services.AddSingleton<CoreStatus>();
        services.AddSingleton<Chivalry2Config>();
        services.AddSingleton<SnapshotDebugWriter>();
        services.AddSingleton<SnapshotImageProcessor>();
        services.AddSingleton<GameWindowCapture>();
        services.AddSingleton<SnapshotOcrEngine>();
        services.AddSingleton<TesseractOcrEngine>();
        services.AddSingleton<ISnapshotOcrEngine>(provider =>
            provider.GetRequiredService<IOptionsMonitor<CoreHostOptions>>().CurrentValue.Snapshot.Engine.Equals("Windows", StringComparison.OrdinalIgnoreCase)
                ? provider.GetRequiredService<SnapshotOcrEngine>() : provider.GetRequiredService<TesseractOcrEngine>());
        services.AddSingleton<SnapshotService>();
        return services;
    }
}
