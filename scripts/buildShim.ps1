$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot "src\core\Shim\ChivAdminShim.vcxproj"
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"

if (-not (Test-Path $vswhere)) {
    throw "vswhere.exe was not found. Install Visual Studio Build Tools with MSBuild and the MSVC x64 toolchain."
}

$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
if (-not $msbuild) {
    throw "MSBuild was not found. Install Visual Studio Build Tools with MSBuild and the MSVC x64 toolchain."
}

& $msbuild $project /p:Configuration=Debug /p:Platform=x64