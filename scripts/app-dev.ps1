$ErrorActionPreference = 'Stop'

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$escapedWorkspaceRoot = [Regex]::Escape($workspaceRoot)

function Stop-StaleWorkspaceProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $CommandPattern
    )

    Get-CimInstance Win32_Process -Filter "Name = '$Name'" |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $_.CommandLine -and
            $_.CommandLine -match $escapedWorkspaceRoot -and
            $_.CommandLine -match $CommandPattern
        } |
        ForEach-Object {
            Write-Host "Stopping stale $($_.Name) process $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

Stop-StaleWorkspaceProcess -Name 'electron.exe' -CommandPattern 'node_modules[\\/]electron[\\/]dist[\\/]electron\.exe'
Stop-StaleWorkspaceProcess -Name 'node.exe' -CommandPattern 'electron-vite[\\/]bin[\\/]electron-vite\.js"?\s+dev'

node -e "require('electron')"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

npx electron-vite dev
exit $LASTEXITCODE