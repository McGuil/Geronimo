# Geronimo

A Windows 10/11 PC monitoring application with a customizable dashboard and native desktop overlay. CPU, GPU, and RAM are the focus, with an inventory for every temperature sensor exposed by the hardware provider.

## Run the Windows application

The prepared x64 output is `artifacts/windows-win-x64/Geronimo.exe`. Extract the **entire** portable ZIP and launch `Geronimo.exe`; its DLLs and `Assets` directory must remain beside it. This build includes the .NET runtime.

Microsoft Edge **WebView2 Evergreen Runtime** must be installed. Obtain it from https://developer.microsoft.com/microsoft-edge/webview2/ if it is missing. The app displays a startup explanation if WebView2 cannot initialize.

Inside the desktop application, LibreHardwareMonitor enumerates Intel/AMD CPUs and NVIDIA/AMD/Intel graphics adapters automatically. Choose among detected GPUs in Hardware when there is more than one. Real readings replace all sample data before monitoring starts. The browser development preview explicitly uses simulated readings instead.

Sensor support depends on the device, firmware, driver, and access level. Some CPU/motherboard sensors require running as administrator; the app starts without elevation and never automatically requests administrator access. RAM temperature appears only when the provider exposes an identifiable RAM/DIMM temperature sensor. Missing readings show Unavailable, rather than an estimate. Windows RAM usage comes from `GlobalMemoryStatusEx`.

**Validation limit:** the Windows application builds and publishes successfully on this Linux cloud machine. Its UI and bridge contract are browser-tested. Launching the executable, real hardware compatibility, native overlay rendering, hotkey registration, and resource usage still require validation on Windows. No Windows CPU/RAM footprint has been measured or promised.

## Features in this first build

- CPU/GPU/RAM cards with utilization, available temperature, and recent history.
- Full available temperature inventory with current/min/max readings. Unsupported readings remain unavailable.
- Graphite, Midnight, and Light themes; four accents; comfortable/compact density; reduced motion.
- Show/hide/reorder dashboard widgets. Preferences persist locally in the WebView2 profile (or browser local storage for the preview).
- Celsius/Fahrenheit and 1/2/5-second update intervals. Read-only process CPU and working-set memory, search, and sorting. Protected processes may be inaccessible; per-process GPU usage is currently unavailable.
- Bounded current-session utilization history (up to 1,800 native samples) and CSV export with actual sample timestamps and source labels. History is not recorded across restarts.
- Separate, borderless **native WinForms overlay**, so it needs no second WebView2 instance. Stacked/horizontal layout, opacity, scaling, metric selection, saved position, and click-through mode.
- **Ctrl+Shift+O** toggles the desktop overlay when Windows grants the global shortcut. Drag the overlay with click-through off. Reset position in Overlay studio. Always-on-top is intended for desktop/windowed/borderless applications; exclusive-fullscreen game compatibility is not implemented or verified.
- The browser preview includes a draggable in-app overlay, including keyboard movement using its grip. It cannot float over other applications.

Temperature alert rules, system tray/start-at-login settings, permanent history, fan-speed displays, per-process GPU usage, and game-specific overlays are not implemented in this release.

## Development

The UI has **zero runtime JavaScript package dependencies**: TypeScript, CSS, inline SVG, and browser APIs. The native host uses .NET 10, WinForms, WebView2, and LibreHardwareMonitor. It reads sensors locally and performs no telemetry uploads. Process enumeration runs only while the Processes view is selected.

Frontend requires Node.js 22.12+ (Node 24 recommended) and npm:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

```sh
npm run build
npm test
```

Tests use `/usr/bin/chromium` when available. Otherwise run `npx playwright install chromium`, or supply `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Playwright starts the dev server automatically, or reuses an existing local server. Bridge tests use explicit fixtures; they do not validate real Windows sensors.

Build on Windows using the pinned .NET SDK in `global.json` and PowerShell:

```powershell
# Slim build: requires the .NET 10 Desktop Runtime on the target PC.
./scripts/build-windows.ps1

# Portable build: includes the .NET runtime.
./scripts/build-windows.ps1 -SelfContained
```

Portable output is `artifacts/windows-win-x64/`; slim output is `artifacts/windows-win-x64-slim/`. These builds target x64 Windows PCs, including Intel and AMD processors.

Cloud setup in this checkout:

```sh
bash scripts/setup-cloud.sh
```

This verifies/downloads the official pinned Linux .NET SDK if needed, installs frozen npm dependencies, builds the UI, restores locked NuGet dependencies, and publishes the Windows x64 application. It does not run Windows software on Linux. SDK downloads retain TLS and published SHA-512 verification. Each cloud task is already isolated; use this checkout without creating a worktree unless explicitly requested.

Source entry points: `src/main.ts` for UI, `src/telemetry.ts` for demo/native state, `src/bridge.ts` for WebView2 messaging, and `desktop/Geronimo.Desktop/` for the Windows host, sensor provider, and overlay. A bundled portable runtime increases download/disk size; the slim build shares installed runtimes. Actual application resource use needs Windows profiling.
