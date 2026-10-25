namespace CoreHost.Models;

public sealed record OperationResult(bool Ok, string? ErrorCode, string? ErrorMessage)
{
    public static OperationResult Success()
    {
        return new OperationResult(true, null, null);
    }

    public static OperationResult Failure(string code, string message)
    {
        return new OperationResult(false, code, message);
    }
}

public sealed record ClipboardTextResult(bool Ok, bool HasText, string? Text, string? ErrorCode, string? ErrorMessage)
{
    public static ClipboardTextResult NoText()
    {
        return new ClipboardTextResult(true, false, null, null, null);
    }

    public static ClipboardTextResult TextValue(string text)
    {
        return new ClipboardTextResult(true, true, text, null, null);
    }

    public static ClipboardTextResult Failure(string code, string message)
    {
        return new ClipboardTextResult(false, false, null, code, message);
    }
}
