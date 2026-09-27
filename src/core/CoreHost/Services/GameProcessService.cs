using System.Diagnostics;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public interface INativeGameProcessLocator
{
    GameProcessLookupResult GetReadOnlyTargetProcess();
}

public interface IGameProcessTargetLocator
{
    GameProcessLookupResult GetTargetProcess();
}

public sealed class GameProcessService : INativeGameProcessLocator, IGameProcessTargetLocator
{
    private static readonly TimeSpan CommandLookupCacheTtl = TimeSpan.FromSeconds(30);
    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly object _cacheLock = new();
    private GameProcessLookupResult? _cachedSuccess;
    private DateTimeOffset _cachedSuccessUntil;

    public GameProcessService(IOptionsMonitor<CoreHostOptions> options)
    {
        _options = options;
    }

    public GameProcessLookupResult GetTargetProcess()
    {
        var cached = GetCachedSuccess();
        if (cached is not null)
        {
            return cached;
        }

        var result = FindTargetProcess(requireInteractiveTarget: true);
        if (result.Success)
        {
            CacheSuccess(result);
        }

        return result;
    }

    public GameProcessLookupResult GetReadOnlyTargetProcess()
    {
        return FindTargetProcess(requireInteractiveTarget: false);
    }

    private GameProcessLookupResult FindTargetProcess(bool requireInteractiveTarget)
    {
        var processOptions = _options.CurrentValue.Process;
        var matches = new List<GameProcessInfo>();
        var rejections = new List<(string Code, string Message)>();

        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                var processName = TryGetNormalizedProcessName(process);
                if (processName is null)
                {
                    continue;
                }

                if (ContainsProcessName(processOptions.DisallowedNames, processName))
                {
                    continue;
                }

                if (!ContainsProcessName(processOptions.AllowedNames, processName))
                {
                    continue;
                }

                var candidate = TryCreateProcessInfo(process, processName, processOptions, requireInteractiveTarget);
                if (candidate.Ok && candidate.Info is not null)
                {
                    matches.Add(candidate.Info);
                    continue;
                }

                if (candidate.ErrorCode is not null && candidate.ErrorMessage is not null)
                {
                    rejections.Add((candidate.ErrorCode, candidate.ErrorMessage));
                }
            }
        }

        if (matches.Count == 0)
        {
            if (rejections.Count > 0)
            {
                var rejection = rejections[0];
                return GameProcessLookupResult.Failure(rejection.Code, rejection.Message);
            }

            return GameProcessLookupResult.Failure("GAME_NOT_RUNNING", "No configured Chivalry 2 process is running.");
        }

        if (matches.Count > 1 && !processOptions.AllowMultipleMatches)
        {
            return GameProcessLookupResult.Failure("MULTIPLE_GAMES_FOUND", "Multiple configured Chivalry 2 processes are running.", matches);
        }

        return GameProcessLookupResult.Found(matches[0], matches);
    }

    private GameProcessLookupResult? GetCachedSuccess()
    {
        lock (_cacheLock)
        {
            if (_cachedSuccess is null || DateTimeOffset.UtcNow >= _cachedSuccessUntil)
            {
                return null;
            }

            var process = _cachedSuccess.Process;
            if (process is null || !IsCachedProcessUsable(process))
            {
                _cachedSuccess = null;
                return null;
            }

            return _cachedSuccess;
        }
    }

    private void CacheSuccess(GameProcessLookupResult result)
    {
        lock (_cacheLock)
        {
            _cachedSuccess = result;
            _cachedSuccessUntil = DateTimeOffset.UtcNow.Add(CommandLookupCacheTtl);
        }
    }

    private static bool IsCachedProcessUsable(GameProcessInfo process)
    {
        if (process.WindowHandle == IntPtr.Zero || !NativeMethods.IsWindowVisible(process.WindowHandle))
        {
            return false;
        }

        NativeMethods.GetWindowThreadProcessId(process.WindowHandle, out var processId);
        return processId == process.Id;
    }

    private static CandidateResult TryCreateProcessInfo(
        Process process,
        string normalizedName,
        ProcessOptions options,
        bool requireInteractiveTarget)
    {
        var path = TryGetProcessPath(process);
        var displayName = path is null ? normalizedName : System.IO.Path.GetFileName(path);

        if (!string.IsNullOrWhiteSpace(options.PathMustContain))
        {
            if (path is null)
            {
                return CandidateResult.Failure("PROCESS_NOT_ALLOWED", "Could not verify the configured Chivalry 2 process path.");
            }

            if (path.IndexOf(options.PathMustContain, StringComparison.OrdinalIgnoreCase) < 0)
            {
                return CandidateResult.Failure("PROCESS_NOT_ALLOWED", "The running process path does not match the configured Chivalry 2 binary path constraint.");
            }
        }

        var isX64 = requireInteractiveTarget ? TryGetIsX64(process) : null;
        if (requireInteractiveTarget && options.RequireX64 && isX64 != true)
        {
            return CandidateResult.Failure("PROCESS_ARCH_MISMATCH", "The configured Chivalry 2 process could not be verified as x64.");
        }

        var windowHandle = requireInteractiveTarget ? TryGetMainWindowHandle(process) : IntPtr.Zero;
        if (requireInteractiveTarget && windowHandle == IntPtr.Zero)
        {
            return CandidateResult.Failure("WINDOW_NOT_FOUND", "The configured Chivalry 2 process does not have a usable main window.");
        }

        var title = requireInteractiveTarget
            ? NativeMethods.GetWindowTitle(windowHandle) ?? TryGetMainWindowTitle(process)
            : null;
        var handleText = $"0x{windowHandle.ToInt64():X16}";

        var info = new GameProcessInfo(
            windowHandle,
            process.Id,
            displayName,
            path,
            isX64,
            handleText,
            title,
            GetBinaryInfo(path));

        return CandidateResult.Success(info);
    }

    private static string? TryGetNormalizedProcessName(Process process)
    {
        try
        {
            return NormalizeProcessName(process.ProcessName);
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static string NormalizeProcessName(string processName)
    {
        var fileName = System.IO.Path.GetFileName(processName.Trim());
        return fileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? fileName : $"{fileName}.exe";
    }

    private static bool ContainsProcessName(IEnumerable<string> names, string processName)
    {
        return names.Select(NormalizeProcessName).Any(name => string.Equals(name, processName, StringComparison.OrdinalIgnoreCase));
    }

    private static string? TryGetProcessPath(Process process)
    {
        try
        {
            return process.MainModule?.FileName ?? NativeMethods.TryGetProcessImagePath(process.Id);
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
        {
            return NativeMethods.TryGetProcessImagePath(process.Id);
        }
    }

    private static bool? TryGetIsX64(Process process)
    {
        if (!Environment.Is64BitOperatingSystem)
        {
            return false;
        }

        try
        {
            return NativeMethods.IsWow64Process(process.Handle, out var isWow64) ? !isWow64 : null;
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
        {
            return null;
        }
    }

    private static IntPtr TryGetMainWindowHandle(Process process)
    {
        try
        {
            if (process.MainWindowHandle != IntPtr.Zero)
            {
                return process.MainWindowHandle;
            }
        }
        catch (InvalidOperationException)
        {
        }

        return NativeMethods.FindMainWindow(process.Id);
    }

    private static string? TryGetMainWindowTitle(Process process)
    {
        try
        {
            return string.IsNullOrWhiteSpace(process.MainWindowTitle) ? null : process.MainWindowTitle;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static BinaryInfo? GetBinaryInfo(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        try
        {
            var version = FileVersionInfo.GetVersionInfo(path);
            return new BinaryInfo(version.FileVersion, version.ProductVersion, null);
        }
        catch (Exception ex) when (ex is FileNotFoundException or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private sealed record CandidateResult(bool Ok, GameProcessInfo? Info, string? ErrorCode, string? ErrorMessage)
    {
        public static CandidateResult Success(GameProcessInfo info)
        {
            return new CandidateResult(true, info, null, null);
        }

        public static CandidateResult Failure(string code, string message)
        {
            return new CandidateResult(false, null, code, message);
        }
    }
}
