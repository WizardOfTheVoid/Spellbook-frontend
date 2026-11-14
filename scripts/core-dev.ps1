$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$coreProject = Join-Path $repoRoot "src\core\CoreHost\CoreHost.csproj"
dotnet run --project $coreProject
exit $LASTEXITCODE
