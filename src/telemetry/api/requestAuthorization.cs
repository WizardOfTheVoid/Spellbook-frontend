using System.Security.Cryptography;
using System.Text;
namespace SpellBook.Telemetry;
public static class RequestAuthorization
{
    public static bool Allowed(HttpRequest request, string token)
    {
        if (request.Host.Host != "127.0.0.1" || request.Headers.ContainsKey("Origin")) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(request.Headers.Authorization.ToString()), Encoding.UTF8.GetBytes($"Bearer {token}"));
    }
}
