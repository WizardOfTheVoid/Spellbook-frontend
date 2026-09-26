using Microsoft.Extensions.Configuration;

namespace CoreHost.Options;

public sealed class CoreHostOptions
{
    [ConfigurationKeyName("QUEUE_GATE_NORMAL")]
    public int QueueGateNormal { get; set; } = 1900;
    [ConfigurationKeyName("QUEUE_GATE_LOW")]
    public int QueueGateLow { get; set; } = 1900;
    [ConfigurationKeyName("QUEUE_GATE_HIGH")]
    public int QueueGateHigh { get; set; }

    public int gateMs(string priority) => priority switch
    {
        "low" => QueueGateLow,
        "high" => QueueGateHigh,
        _ => QueueGateNormal
    };

    public WindowOptions Window { get; set; } = new();
    public InputOptions Input { get; set; } = new();
    public QueueOptions Queue { get; set; } = new();
    public ClipboardOptions Clipboard { get; set; } = new();
    public DebugOptions Debug { get; set; } = new();
    public CoreApiOptions Core { get; set; } = new();

    public ProcessOptions Process { get; set; } = new();

    public SnapshotOptions Snapshot { get; set; } = new();
}

public sealed class SnapshotOptions
{
    // Sizes and offsets are percentages of the game window so 1080p and 4K frame the same area.
    public double CropWidthPercent { get; set; } = 47;

    public double CropHeightPercent { get; set; } = 13;

    // Top/Center/Bottom paired with Left/Center/Right, for example Center or BottomLeft.
    public string CropAnchor { get; set; } = "Center";

    // Percentage nudge from the anchor; positive moves right and down.
    public double CropOffsetXPercent { get; set; }

    public double CropOffsetYPercent { get; set; }

    // The crop is upscaled to this pixel height before OCR. Windows OCR reads nothing at native
    // nameplate size, so this normalises glyph height across resolutions instead of a fixed multiplier.
    public int TargetHeight { get; set; } = 420;

    public int MaxScaleFactor { get; set; } = 8;

    // Levels curve applied to the crop before OCR; nameplate text is near white.
    public bool LevelsEnabled { get; set; } = true;

    public int LevelsBlackPoint { get; set; } = 145;

    public int LevelsWhitePoint { get; set; } = 204;

    public double LevelsGamma { get; set; } = 1.5;

    // Tesseract expects dark text on a light page, so the near-white glyphs are flipped.
    public bool LevelsInvert { get; set; } = true;

    // Windows or Tesseract. Tesseract survives the speckled background the levels curve leaves behind.
    public string Engine { get; set; } = "Tesseract";

    // Empty resolves to the tessdata folder beside the binary.
    public string TesseractDataPath { get; set; } = string.Empty;

    public string TesseractPageSegmentation { get; set; } = "SingleBlock";

    // Name matching runs in the overlay; Core only publishes the tuning so every snapshot knob
    // lives in one file. Pass 1 compares whole names, then the leading and trailing letters.
    public double MatchFullConfidence { get; set; } = 0.24;

    public int MatchPrefixLength { get; set; } = 4;

    public double MatchPrefixConfidence { get; set; } = 0.75;

    public int MatchSuffixLength { get; set; } = 4;

    public double MatchSuffixConfidence { get; set; } = 0.75;

    // Final pass: each whitespace or dash separated word from the OCR text.
    public double MatchWordConfidence { get; set; } = 0.6;

    // A recognised line with more spaces than this is scene noise, not a player name.
    public int MatchMaxSpaces { get; set; } = 7;

    public string Language { get; set; } = "en-US";

    public bool SaveDebugImages { get; set; } = true;

    // Empty resolves to src/core/temp.
    public string DebugFolder { get; set; } = string.Empty;

    public int DebugRetentionSeconds { get; set; } = 300;
}

public sealed class CoreApiOptions
{
    public string Host { get; set; } = "127.0.0.1";

    public int Port { get; set; } = 48125;

    public string AuthToken { get; set; } = "on-helluwa-magical-token";

    public string InstanceId { get; set; } = "development";

}

public sealed class ProcessOptions
{
    public List<string> AllowedNames { get; set; } =
    [
        "Chivalry2-Win64-Shipping.exe",
        "Chivalry2Modded-Win64-Shipping.exe"
    ];

    public List<string> DisallowedNames { get; set; } = ["Chivalry2Launcher.exe"];

    public bool RequireX64 { get; set; } = true;

    public string PathMustContain { get; set; } = "TBL\\Binaries\\Win64";

    public bool AllowMultipleMatches { get; set; }
}
