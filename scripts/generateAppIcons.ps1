$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$faviconSourcePath = Join-Path $projectRoot 'src\app\renderer\src\lib\resources\logo-pos-transp-padding.png'
$faviconPath = Join-Path $projectRoot 'src\app\renderer\static\favicon.png'
$iconSourcePath = Join-Path $projectRoot 'src\app\renderer\src\lib\resources\logo-discord.png'
$iconPath = Join-Path $projectRoot 'build\icon.ico'
$appBuilderPath = Join-Path $projectRoot 'node_modules\app-builder-bin\win\x64\app-builder.exe'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "spellbook-icon-$([guid]::NewGuid().ToString('N'))"
$temporaryIconDirectory = Join-Path $temporaryRoot 'icons'
$iconSizes = 16, 32, 64, 256
$source = $null

try {
  Copy-Item -LiteralPath $faviconSourcePath -Destination $faviconPath -Force

  New-Item -ItemType Directory -Path $temporaryIconDirectory | Out-Null
  Add-Type -AssemblyName System.Drawing
  $source = [System.Drawing.Image]::FromFile($iconSourcePath)
  $images = [System.Collections.Generic.List[object]]::new()

  foreach ($size in $iconSizes) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $pngStream = [System.IO.MemoryStream]::new()

    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $bitmap.Save((Join-Path $temporaryIconDirectory "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
      $images.Add([pscustomobject]@{ Size = $size; Bytes = $pngStream.ToArray() })
    } finally {
      $pngStream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  & $appBuilderPath icon --root $temporaryRoot --input 'icons' --format 'ico' --out (Split-Path -Parent $iconPath)
  if ($LASTEXITCODE -ne 0) { throw "app-builder failed with exit code $LASTEXITCODE" }

  $iconStream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($iconStream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)

    $imageOffset = 6 + (16 * $images.Count)
    foreach ($image in $images) {
      $encodedSize = if ($image.Size -eq 256) { 0 } else { $image.Size }
      $writer.Write([byte]$encodedSize)
      $writer.Write([byte]$encodedSize)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$image.Bytes.Length)
      $writer.Write([uint32]$imageOffset)
      $imageOffset += $image.Bytes.Length
    }

    foreach ($image in $images) { $writer.Write($image.Bytes) }
    [System.IO.File]::WriteAllBytes($iconPath, $iconStream.ToArray())
  } finally {
    $writer.Dispose()
    $iconStream.Dispose()
  }
} finally {
  if ($source) { $source.Dispose() }
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    Write-Output "Cleaned $temporaryRoot"
  }
}
