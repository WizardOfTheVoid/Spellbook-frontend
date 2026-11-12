$ErrorActionPreference = 'Stop'
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'telemetry.ps1') publish
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$telemetryOutput = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../dist/telemetry/win-x64'))
Remove-Item -LiteralPath (Join-Path $telemetryOutput 'createdump.exe') -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath (Join-Path $telemetryOutput 'SpellBook.Telemetry.exe'))) { throw 'Telemetry publish did not produce its executable' }
if (Get-ChildItem -LiteralPath $telemetryOutput -Recurse -File -Force | Where-Object { $_.Name -like '.env*' -or $_.Extension -in '.pcapng','.etl','.sqlite' }) { throw 'Telemetry publish contains private data' }
$telemetryVersion = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
@{ version = $telemetryVersion; protocolVersion = 1 } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $telemetryOutput 'worker-version.json') -Encoding UTF8
