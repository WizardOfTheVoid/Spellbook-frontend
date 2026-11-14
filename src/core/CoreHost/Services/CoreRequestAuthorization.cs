using System.Security.Cryptography;
using System.Text;

namespace CoreHost.Services;

internal static class CoreRequestAuthorization
{
    internal static bool IsAuthorized(string? suppliedToken, string expectedToken)
    {
        if (string.IsNullOrWhiteSpace(suppliedToken) || string.IsNullOrWhiteSpace(expectedToken))
        {
            return false;
        }

        var suppliedBytes = Encoding.UTF8.GetBytes(suppliedToken);
        var expectedBytes = Encoding.UTF8.GetBytes(expectedToken);
        return suppliedBytes.Length == expectedBytes.Length &&
            CryptographicOperations.FixedTimeEquals(suppliedBytes, expectedBytes);
    }
}