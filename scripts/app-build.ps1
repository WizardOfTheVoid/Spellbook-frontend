$ErrorActionPreference = 'Stop'

npm run app:renderer:build
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

npm run app:renderer:verify
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$env:CHIV_SKIP_ELECTRON_RENDERER = '1'
npx electron-vite build
exit $LASTEXITCODE
