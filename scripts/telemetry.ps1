param([ValidateSet('build', 'test', 'publish', 'run')][string]$Action = 'build', [string[]]$ExtraArgs)
$ErrorActionPreference = 'Stop'
$telemetryDirectory = [IO.DirectoryInfo](Split-Path $PSScriptRoot -Parent)
while ($telemetryDirectory.Parent -and -not (Test-Path -LiteralPath (Join-Path $telemetryDirectory.FullName '.git'))) { $telemetryDirectory = $telemetryDirectory.Parent }
$telemetryRepo = $telemetryDirectory.FullName
$telemetryLocalSdk = Join-Path $telemetryRepo '.artifacts/tmp/telemetry/sdk/dotnet.exe'
$telemetryDotnet = if (Test-Path -LiteralPath $telemetryLocalSdk) { $telemetryLocalSdk } else { 'dotnet' }
$env:DOTNET_CLI_HOME = Join-Path $telemetryRepo '.artifacts/tmp/telemetry/dotnetHome'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
Push-Location (Join-Path $PSScriptRoot '../src/telemetry')
try {
  if ($Action -eq 'test') { & $telemetryDotnet run --project tests/telemetryWorker.Tests.csproj @ExtraArgs }
  elseif ($Action -eq 'publish') {
    $telemetryVersion = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
    & $telemetryDotnet publish telemetryWorker.csproj -c Release -r win-x64 --self-contained true -p:Version=$telemetryVersion -p:DebugType=None -p:DebugSymbols=false -o (Join-Path $PSScriptRoot '../dist/telemetry/win-x64') @ExtraArgs
  }
  elseif ($Action -eq 'run') { & $telemetryDotnet run --project telemetryWorker.csproj @ExtraArgs }
  else { & $telemetryDotnet build telemetryWorker.csproj @ExtraArgs }
  exit $LASTEXITCODE
} finally { Pop-Location }
