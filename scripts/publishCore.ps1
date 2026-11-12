$ErrorActionPreference = 'Stop'

$frontendRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $frontendRoot 'src/core/CoreHost/CoreHost.csproj'
$outputPath = Join-Path $frontendRoot 'dist/core/win-x64'

Remove-Item -LiteralPath $outputPath -Recurse -Force -ErrorAction SilentlyContinue

dotnet publish $projectPath `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    --output $outputPath `
    -p:DebugType=None `
    -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Remove-Item -LiteralPath (Join-Path $outputPath 'createdump.exe') -Force -ErrorAction SilentlyContinue

$executablePath = Join-Path $outputPath 'SpellBook.CoreHost.exe'
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Core publish did not produce SpellBook.CoreHost.exe."
}

$environmentFiles = Get-ChildItem -LiteralPath $outputPath -Recurse -Force -File |
    Where-Object { $_.Name -like '.env*' }
if ($environmentFiles) {
    throw "Core publish contains a forbidden environment file."
}