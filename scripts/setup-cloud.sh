#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Geronimo
npm ci
npm run build
python3 scripts/install-dotnet.py
export DOTNET_CLI_HOME=/workspace/.cache/dotnet
export NUGET_PACKAGES=/workspace/.cache/nuget
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_GENERATE_ASPNET_CERTIFICATE=false
mkdir -p "$DOTNET_CLI_HOME" "$NUGET_PACKAGES"
/workspace/.tools/dotnet/dotnet restore desktop/Geronimo.Desktop/Geronimo.Desktop.csproj --locked-mode -r win-x64
/workspace/.tools/dotnet/dotnet publish desktop/Geronimo.Desktop/Geronimo.Desktop.csproj -c Release -r win-x64 --self-contained true --no-restore -o artifacts/windows-win-x64
