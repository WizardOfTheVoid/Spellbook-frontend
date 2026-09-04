using System.Text.Json.Serialization;
using CoreHost.Options;
using CoreHost.Snapshot;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

internal static class CoreHostServiceCollectionExtensions
{
    public static IServiceCollection AddCoreHostServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        });

        services.AddOptions<CoreHostOptions>()
            .Bind(configuration)
            .Validate(
                options => options.Movement.MovingWindowMs > 0,
                "Movement__MovingWindowMs must be a positive integer.")
            .ValidateOnStart();
        services.AddSingleton<IWindowApi, Win32WindowApi>();
        services.AddSingleton<IKeyboardInputApi, Win32KeyboardInputApi>();
        services.AddSingleton<GameProcessService>();
        services.AddSingleton<IGameProcessTargetLocator>(provider => provider.GetRequiredService<GameProcessService>());
        services.AddSingleton<INativeGameProcessLocator>(provider => provider.GetRequiredService<GameProcessService>());
        services.AddSingleton<IReadOnlyProcessMemoryReader, ReadOnlyProcessMemoryReader>();
        services.AddSingleton<ForegroundWindowService>();
        services.AddSingleton<RestoreTargetValidator>();
        services.AddSingleton<IConsoleExecutionTargetResolver, ConsoleExecutionTargetResolver>();
        services.AddSingleton<SendInputService>();
        services.AddSingleton<IConsoleCleanupInput>(provider => provider.GetRequiredService<SendInputService>());
        services.AddSingleton<ConsoleCommandCleanupService>();
        services.AddSingleton<ClipboardService>();
        services.AddSingleton<IClipboardService>(provider => provider.GetRequiredService<ClipboardService>());
        services.AddSingleton<ListPlayersTextNormalizer>();
        services.AddSingleton<ListPlayersParser>();
        services.AddSingleton<NativeListPlayersService>();
        services.AddSingleton<MouseClickSuppression>();
        services.AddHostedService<Win32MouseClickSuppressor>();
        services.AddSingleton<ConsoleCommandGate>();
        services.AddSingleton<MovementActivityTracker>();
        services.AddSingleton<GameInputActivityGate>();
        services.AddSingleton<IGameInputActivityGate>(provider =>
            provider.GetRequiredService<GameInputActivityGate>());
        services.AddHostedService<Win32MovementInputMonitor>();
        services.AddSingleton<ConsoleCommandService>();
        services.AddSingleton<IKeyPressRuntime, KeyPressRuntime>();
        services.AddSingleton<KeyPressService>();
        services.AddSingleton<IConsoleBatchRuntime, ConsoleBatchRuntime>();
        services.AddSingleton<ConsoleCommandBatchService>();
        services.AddSingleton<SymbolNormalization>();
        services.AddSingleton<CoreTextSanitizer>();
        services.AddSingleton<CommandTextBuilder>();
        services.AddSingleton<SnapshotDebugWriter>();
        services.AddSingleton<SnapshotImageProcessor>();
        services.AddSingleton<GameWindowCapture>();
        services.AddSingleton<SnapshotOcrEngine>();
        services.AddSingleton<TesseractOcrEngine>();
        services.AddSingleton<ISnapshotOcrEngine>(provider =>
        {
            var engine = provider.GetRequiredService<IOptionsMonitor<CoreHostOptions>>().CurrentValue.Snapshot.Engine;

            return engine.Equals("Windows", StringComparison.OrdinalIgnoreCase)
                ? provider.GetRequiredService<SnapshotOcrEngine>()
                : provider.GetRequiredService<TesseractOcrEngine>();
        });
        services.AddSingleton<SnapshotService>();
        return services;
    }
}
