using System.Text.Json;
using CoreHost.Models;

namespace CoreHost.Actions;

internal static class ActionResults
{
    public static ConsoleExecutionResult create(QueuedAction action, string status, string? code, string? message)
    {
        var data = new Dictionary<string, object?>();
        if (action.Request.Commands.Count == 1 && action.Results.FirstOrDefault()?.Data is { } output)
        {
            var json = JsonSerializer.SerializeToElement(output, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (json.ValueKind == JsonValueKind.Object)
                foreach (var property in json.EnumerateObject()) data[property.Name] = property.Value.Clone();
        }
        data["status"] = status;
        data["sent"] = status == "completed";
        data["sentCommands"] = action.Cursor;
        data["partialCommandKeyPresses"] = action.KeyCursor;
        data["failedCommandIndex"] = status == "completed" ? null : action.FailedCommandIndex ?? Math.Min(action.Cursor, action.Request.Commands.Count - 1);
        data["commandResults"] = action.Results.Select((result, index) => new { index, result.Sent, result.Data, result.ErrorCode, result.ErrorMessage }).ToArray();
        var warnings = action.Results.SelectMany(result => result.Warnings ?? []).Concat(action.Warnings).Distinct().ToArray();
        return status == "completed"
            ? ConsoleExecutionResult.Success(action.Request.Id, "action", data, warnings)
            : ConsoleExecutionResult.Failure(code ?? $"ACTION_{status.ToUpperInvariant()}",
                message ?? $"Action {status}.", action.Request.Id, status == "expired" ? 408 : 409, warnings, data);
    }
}
