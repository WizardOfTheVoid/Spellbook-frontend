using System.Text.Json;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ListPlayersParserTests
{
    private const string ServerLine = "ServerName - [TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ] 5.83.168.223:10010";
    private const string HeaderLine = "Name -  PlayFabPlayerId - EOSPlayerId - Score - Kills - Deaths - Ping";

    [Fact]
    public void ParseAcceptsNullPlayfabColumnAndReturnsRawPlayerIdentity()
    {
        var result = new ListPlayersParser().Parse(string.Join('\n',
            ServerLine,
            HeaderLine,
            "ᵀᵁᴿᴷ TheForce - NULL - -1451974560 - 0 - 0 - 0 ms"));

        var player = Assert.Single(result.Players);
        Assert.Equal("ᵀᵁᴿᴷ TheForce", player.Name);
        using var serializedPlayer = JsonDocument.Parse(JsonSerializer.Serialize(player));
        Assert.False(serializedPlayer.RootElement.TryGetProperty("NormalizedName", out _));
        Assert.Equal("NULL", player.PlayfabId);
        Assert.Equal("-1451974560", player.EosPlayerId);
        Assert.Equal(0, player.Score);
        Assert.Equal(0, player.Kills);
        Assert.Null(player.Deaths);
        Assert.Equal(0, player.PingMs);
        Assert.DoesNotContain(result.ParseWarnings, warning => warning.Contains("Unrecognized ListPlayers line", StringComparison.Ordinal));

        Assert.Equal("[TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ]", result.ServerName);
        Assert.Equal("[TT]HOUSEOFTHETEMPLARSDUEL[DiscordggTheTemplars]", result.NormalizedServerName);
        Assert.Equal("5.83.168.223", result.ServerIp);
        Assert.Equal(10010, result.ServerPort);
        Assert.Equal("5.83.168.223:10010", result.ServerAddress);
    }

    [Fact]
    public void ParsePrefersCompleteRowsWithDeathsOverLegacyRows()
    {
        var result = new ListPlayersParser().Parse(string.Join('\n',
            ServerLine,
            HeaderLine,
            "Player One - 19CBAB2A3A16E567 - ABCDEF1234567890 - 250 - 5 - 2 - 44 ms"));

        var player = Assert.Single(result.Players);
        Assert.Equal("Player One", player.Name);
        Assert.Equal("19CBAB2A3A16E567", player.PlayfabId);
        Assert.Equal("ABCDEF1234567890", player.EosPlayerId);
        Assert.Equal(250, player.Score);
        Assert.Equal(5, player.Kills);
        Assert.Equal(2, player.Deaths);
        Assert.Equal(44, player.PingMs);
    }

    [Fact]
    public void ParseProvidedSampleWithoutUnrecognizedNullPlayerWarning()
    {
        var result = new ListPlayersParser().Parse(ProvidedSample);

        Assert.Equal(42, result.Players.Count);
        Assert.DoesNotContain(result.ParseWarnings, warning => warning.Contains("ᵀᵁᴿᴷ TheForce", StringComparison.Ordinal));
        Assert.Equal("ᵀᵁᴿᴷ TheForce", result.Players[0].Name);
        Assert.Equal("NULL", result.Players[0].PlayfabId);
        Assert.Equal("[TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ]", result.ServerName);
        Assert.Equal("[TT]HOUSEOFTHETEMPLARSDUEL[DiscordggTheTemplars]", result.NormalizedServerName);
        Assert.Equal("5.83.168.223", result.ServerIp);
        Assert.Equal(10010, result.ServerPort);
        Assert.Equal("5.83.168.223:10010", result.ServerAddress);
    }

    private const string ProvidedSample = """
ServerName - [TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ] 5.83.168.223:10010
Name -  PlayFabPlayerId - EOSPlayerId - Score - Kills - Deaths - Ping
ᵀᵁᴿᴷ TheForce - NULL - -1621442496 - 0 - 0 - 0 ms
iBrq-511 - 19CBAB2A3A16E567 - -1621442496 - 0 - 0 - 0 ms
MΔGIC. - 25F6D104A89A3070 - -1621442496 - 0 - 0 - 0 ms
FangedWizard44 - 1AD2A64B5CED91E4 - -1621442496 - 125 - 1 - 0 ms
ᴅʀ3 اوسين - 52684FADEF70C0EB - -1621442496 - 125 - 1 - 1 ms
sebaedu - 2FA55473E39E9C14 - -1621442496 - 0 - 0 - 0 ms
ṮṮᴷᴮ Đaɴɪʟɪχ † - A59A33DF7846CCA1 - -1621442496 - 125 - 1 - 2 ms
Schnucka5334 - D5135EB5EFCC79A3 - -1621442496 - 0 - 0 - 0 ms
Propagandalf - 5D0F5971CF112F0 - -1621442496 - 365 - 3 - 4 ms
Slman_QH10 - ACC11586F33195FA - -1621442496 - 110 - 1 - 2 ms
UZMAKI-NARUTO9 - 90DB341650FEEF38 - -1621442496 - 225 - 2 - 2 ms
NikitaSins - 2274C63FBAB3F9F0 - -1621442496 - 0 - 0 - 0 ms
yigitseferin - 6C6E46A3CB5AD93D - -1621442496 - 250 - 2 - 2 ms
ṮṮˢMark23s1 - 437E321410012CB9 - -1621442496 - 250 - 2 - 3 ms
ṮṮᴱ ytiu ﾒ - E12AC136413D567C - -1621442496 - 745 - 6 - 0 ms
SIFU_60Hz - 7246046FFD805546 - -1621442496 - 0 - 0 - 2 ms
ṮṮᴸ MVG † - D2272C8A301E7816 - -1621442496 - 375 - 3 - 1 ms
BKM Pain - B88267B75D251A90 - -1621442496 - 0 - 0 - 0 ms
JustMelon - 6FD576FB1B613B3A - -1621442496 - 325 - 3 - 3 ms
don't stress - 739BCBCB41E91CCB - -1621442496 - 110 - 1 - 5 ms
Kontakt - 904C3B88B239ED61 - -1621442496 - 0 - 0 - 0 ms
Dabi_965 - 277BDB78FCCCAAE0 - -1621442496 - 0 - 0 - 0 ms
BLXNK-I - 9FA4E498FE986A6B - -1621442496 - 0 - 0 - 0 ms
Rider_boy_ - A185D88532BA3711 - -1621442496 - 75 - 1 - 4 ms
ṮṮˢ S†orm † - EB8BE74BE1296CE5 - -1621442496 - 0 - 0 - 2 ms
BLUE EXTREME897 - 8FCB02C9E2BAA562 - -1621442496 - 635 - 6 - 3 ms
PK Zeús - 6DC61E0249B10CD2 - -1621442496 - 805 - 7 - 3 ms
Simple Sword Swooner - 1439C8CAD3EF479C - -1621442496 - -100 - 0 - 2 ms
CAPT SEVO - E270E7FC8AD52D3 - -1621442496 - 100 - 1 - 0 ms
tr_ky-9_1_1 - 94156327211B391B - -1621442496 - 325 - 3 - 4 ms
TRIGO - 28428E7B23F39CE8 - -1621442496 - 660 - 6 - 3 ms
ṮṮᴷᴮ Runic ﾒ - E31DB6BFA9EF432B - -1621442496 - 240 - 2 - 5 ms
Greed_Master1 - 91CB8FCF1E8787A6 - -1621442496 - 0 - 0 - 0 ms
MaxiBestOf8858 - C4A105C91590E458 - -1621442496 - 0 - 0 - 0 ms
Pierced Ballsack - 73B0F857910FC9A1 - -1621442496 - 0 - 0 - 0 ms
Abdelmalek0704 - A27C5F6FFBA3171E - -1621442496 - 425 - 4 - 0 ms
ok9t12 - 8434901940BE3F20 - -1621442496 - 0 - 0 - 3 ms
Ro_as_11 - 4C4B2A4466D8D085 - -1621442496 - 325 - 3 - 4 ms
Ȼ Kahj61 - C61658BFBD54B14F - -1621442496 - 125 - 1 - 1 ms
ÆT Samuil I - 605765AD773EC939 - -1621442496 - 125 - 1 - 0 ms
ṮṮˢ Zuko ﾒ - 5A29F62BB8DCFCCF - -1621442496 - 0 - 0 - 1 ms
Sparrow - 2A4BD487EF44164C - -1621442496 - 250 - 2 - 3 ms
""";
}
