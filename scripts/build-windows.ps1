param([switch]$SelfContained)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'UI build failed.' }
    python scripts/fetch-windows-tools.py
    if ($LASTEXITCODE -ne 0) { throw 'Verified component download failed.' }
    dotnet run --project tests/Geronimo.PolicyTests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Sensor/frame regression checks failed.' }
    $outputFolder = if ($SelfContained) { 'artifacts/windows-win-x64' } else { 'artifacts/windows-win-x64-slim' }
    dotnet publish desktop/Geronimo.Desktop/Geronimo.Desktop.csproj -c Release -r win-x64 --self-contained $SelfContained.IsPresent -p:RestoreLockedMode=true -o $outputFolder
    if ($LASTEXITCODE -ne 0) { throw 'Desktop publish failed.' }
    Write-Host "Built: $projectRoot/$outputFolder/Geronimo.exe"
    Write-Host 'Keep the full output folder together. WebView2 Evergreen Runtime is required.'
} finally { Pop-Location }
