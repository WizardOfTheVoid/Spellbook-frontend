using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class CommandTextBuilder
{
    internal const int UnbanSubmissionCount = 4;

    private readonly CoreTextSanitizer _textSanitizer;
    private readonly IOptionsMonitor<CoreHostOptions> _options;

    public CommandTextBuilder(CoreTextSanitizer textSanitizer, IOptionsMonitor<CoreHostOptions> options)
    {
        _textSanitizer = textSanitizer;
        _options = options;
    }

    public CommandBuildResult BuildBan(BanRequest request)
    {
        if (!TryGetRequestId(request.Id, out var requestId, out var requestIdFailure))
        {
            return requestIdFailure;
        }

        if (!RequestValidators.TryNormalizePlayfabId(request.PlayfabId, out var playfabId, out var playfabError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", playfabError!, requestId);
        }

        if (request.Hours is null or < 1 or > 999999)
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", "Ban hours must be between 1 and 999999.", requestId);
        }

        if (!_textSanitizer.TryNormalizeOutboundMessage(request.Reason, "Reason", out var reason, out var reasonError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", reasonError!, requestId);
        }

        return CommandBuildResult.Success(requestId, $"BanById {playfabId} {request.Hours.Value} \"{reason}\"");
    }

    public CommandBuildResult BuildKick(KickRequest request)
    {
        if (!TryGetRequestId(request.Id, out var requestId, out var requestIdFailure))
        {
            return requestIdFailure;
        }

        if (!RequestValidators.TryNormalizePlayfabId(request.PlayfabId, out var playfabId, out var playfabError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", playfabError!, requestId);
        }

        if (!_textSanitizer.TryNormalizeOutboundMessage(request.Reason, "Reason", out var reason, out var reasonError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", reasonError!, requestId);
        }

        return CommandBuildResult.Success(requestId, $"KickById {playfabId} \"{reason}\"");
    }

    public CommandBuildResult BuildUnban(UnbanRequest request)
    {
        if (!TryGetRequestId(request.Id, out var requestId, out var requestIdFailure))
        {
            return requestIdFailure;
        }

        if (!RequestValidators.TryNormalizePlayfabId(request.PlayfabId, out var playfabId, out var playfabError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", playfabError!, requestId);
        }

        return CommandBuildResult.Success(requestId, $"UnbanById {playfabId}");
    }

    internal static IReadOnlyList<string> BuildUnbanCommands(string playfabId)
    {
        return Enumerable.Repeat($"UnbanById {playfabId}", UnbanSubmissionCount).ToArray();
    }

    internal static IReadOnlyList<PreparedConsoleCommand>? BuildRawUnbanCommands(string command)
    {
        var parts = command.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2 || !parts[0].Equals("UnbanById", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!RequestValidators.TryNormalizePlayfabId(parts[1], out var playfabId, out _))
        {
            return null;
        }

        return BuildUnbanCommands(playfabId)
            .Select(value => new PreparedConsoleCommand("unban", value, 0))
            .ToArray();
    }

    public CommandBuildResult BuildWarn(WarnRequest request)
    {
        if (!TryGetRequestId(request.Id, out var requestId, out var requestIdFailure))
        {
            return requestIdFailure;
        }

        if (!_textSanitizer.TryNormalizeGeneralMessage(request.Message, "Message", out var message, out var messageError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", messageError!, requestId);
        }

        return CommandBuildResult.Success(requestId, $"Serversay \"{message}\"");
    }

    public CommandBuildResult BuildMessage(ConsoleMessageRequest request)
    {
        if (!TryGetRequestId(request.Id, out var requestId, out var requestIdFailure))
        {
            return requestIdFailure;
        }

        var command = request.Kind switch
        {
            "admin" => "Adminsay",
            "server" => "Serversay",
            _ => null
        };

        if (command is null)
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", "Message kind must be admin or server.", requestId);
        }

        if (!_textSanitizer.TryNormalizeGeneralMessage(request.Message, "Message", out var message, out var messageError))
        {
            return CommandBuildResult.Failure("INVALID_REQUEST", messageError!, requestId);
        }

        return CommandBuildResult.Success(requestId, $"{command} \"{message}\"");
    }

    public ConsoleBatchBuildResult BuildBatch(ConsoleBatchRequest request)
    {
        if (!RequestValidators.TryNormalizeRequestId(request.Id, out var requestId, out var requestIdError))
        {
            return ConsoleBatchBuildResult.Failure("INVALID_REQUEST", requestIdError!, requestId);
        }

        if (request.Commands is null or { Count: 0 })
        {
            return ConsoleBatchBuildResult.Failure("INVALID_REQUEST", "At least one command is required.", requestId);
        }

        var preparedCommands = new List<PreparedConsoleCommand>(request.Commands.Count);
        foreach (var commandRequest in request.Commands)
        {
            if (commandRequest is null)
            {
                return ConsoleBatchBuildResult.Failure("INVALID_REQUEST", "Command is required.", requestId);
            }

            var commandType = commandRequest.CommandType switch
            {
                "server_message" => "server_message",
                "warn" => "warn",
                "kick" => "kick",
                "ban" => "ban",
                "unban" => "unban",
                _ => null
            };

            if (commandType is null)
            {
                return ConsoleBatchBuildResult.Failure(
                    "INVALID_REQUEST",
                    "Command type must be server_message, warn, kick, ban, or unban.",
                    requestId);
            }

            if (commandRequest.DelayMs is null or < 0)
            {
                return ConsoleBatchBuildResult.Failure(
                    "INVALID_REQUEST",
                    $"Command delay must be between 0 and {int.MaxValue} milliseconds.",
                    requestId);
            }

            var build = commandType switch
            {
                "server_message" or "warn" => BuildWarn(new WarnRequest(requestId, commandRequest.Message, null)),
                "kick" => BuildKick(new KickRequest(requestId, commandRequest.PlayfabId, commandRequest.Message, null)),
                "ban" => BuildBan(new BanRequest(requestId, commandRequest.PlayfabId, commandRequest.Hours, commandRequest.Message, null)),
                "unban" => BuildUnban(new UnbanRequest(requestId, commandRequest.PlayfabId, null)),
                _ => throw new InvalidOperationException("Validated command type was not supported.")
            };

            if (!build.Ok)
            {
                return ConsoleBatchBuildResult.Failure(
                    build.ErrorCode ?? "INVALID_REQUEST",
                    build.ErrorMessage ?? "Invalid command request.",
                    requestId);
            }

            if (commandType == "unban")
            {
                var commands = BuildUnbanCommands(commandRequest.PlayfabId!.Trim());
                preparedCommands.AddRange(commands.Select((command, index) =>
                    new PreparedConsoleCommand(
                        commandType,
                        command,
                        index == 0 ? commandRequest.DelayMs.Value : 0)));
            }
            else
            {
                preparedCommands.Add(new PreparedConsoleCommand(
                    commandType,
                    build.Command!,
                    commandRequest.DelayMs.Value));
            }
        }

        return ConsoleBatchBuildResult.Success(requestId, preparedCommands);
    }

    private static bool TryGetRequestId(string? id, out string requestId, out CommandBuildResult failure)
    {
        if (RequestValidators.TryNormalizeRequestId(id, out requestId, out var errorMessage))
        {
            failure = null!;
            return true;
        }

        failure = CommandBuildResult.Failure("INVALID_REQUEST", errorMessage!, requestId);
        return false;
    }
}
