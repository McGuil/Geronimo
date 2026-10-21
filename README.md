# Geronimo

A Windows 10/11 PC monitoring application with a customizable dashboard and native desktop overlay. CPU, GPU, and RAM are the focus, with an inventory for every temperature sensor exposed by the hardware provider.

Geronimo uses its mint **G** icon in the executable, window/taskbar, system tray, installer, and shortcuts. The Windows ICO contains sizes from 16 to 256 pixels, based on the existing vector favicon. A brief G-logo animation plays when the dashboard first opens, without delaying sensor startup. Reduced Motion or the Windows reduced-motion preference skips it; interacting with the window skips it immediately.

## Run the Windows application

Download **`Geronimo-Setup-win-x64.exe`** from [GitHub Releases](https://github.com/McGuil/Geronimo/releases). One installer sets up the dashboard, native overlay, .NET runtime, PresentMon collector, shortcuts and uninstaller. Keep the **PawnIO sensor driver** task selected for CPU, DIMM and motherboard access; complete its setup window and restart Windows if requested. Existing PawnIO 2.0+ installations are preserved. WebView2 setup needs internet access if that shared Microsoft runtime is missing.

Portable users can instead extract the **entire** `Geronimo-windows-win-x64.zip` and launch `Geronimo.exe`; keep its DLLs, `Tools` and `Assets` directories together. This build includes .NET. The slim ZIP additionally needs the .NET 10 Desktop Runtime.

Microsoft Edge **WebView2 Evergreen Runtime** must be installed. Obtain it from https://developer.microsoft.com/microsoft-edge/webview2/ if it is missing. The app displays a startup explanation if WebView2 cannot initialize.

Inside the desktop application, LibreHardwareMonitor enumerates Intel/AMD CPUs and NVIDIA/AMD/Intel graphics adapters automatically. Choose among detected GPUs in Hardware when there is more than one. Real readings replace all sample data before monitoring starts. The browser development preview explicitly uses simulated readings instead.

**Temperature troubleshooting:** LibreHardwareMonitor 0.9.6 requires **PawnIO 2.0+** for CPU registers and motherboard/SMBus access. The earlier preview omitted this prerequisite and could display failed Ryzen reads as `0°C`. This version explains the driver/access state on Overview and Hardware and offers **Install sensor driver** and **Restart as administrator**. After installing a driver, restart Geronimo. Normal app startup does not request elevation; those buttons deliberately invoke Windows UAC. If setup finds an incompatible old PawnIO installation, follow its instructions to remove that older installation first; do not disable Windows security features.

Intel/AMD CPU and Intel/AMD/NVIDIA GPU enumeration is automatic within the provider's supported hardware. RAM modules are enumerated over SPD/SMBus; each readable DIMM temperature appears separately, and the RAM summary shows the hottest exposed RAM sensor. Provider metadata such as thermal limits/resolution is excluded. Motherboard and storage temperatures appear in the complete inventory and can be selected individually for the overlay. RAM usage comes from `GlobalMemoryStatusEx`. Support still depends on the device, firmware, driver and access level: detection cannot guarantee every processor, board or DIMM sensor. Missing/invalid readings stay unavailable. If HWMonitor reads a sensor while Geronimo cannot, compare exact sensor names and provider support after installing PawnIO and restarting elevated; HWMonitor uses a different proprietary implementation.

The release workflow builds and packages the application on a GitHub-hosted Windows runner after UI, bridge, sensor-policy and frame-parser regression tests pass. It checks pinned component SHA-256 hashes and validates the driver/bootstrapper Authenticode signatures. **Validation limit:** actual hardware access, frame capture, installer component setup/UAC, native overlay rendering, hotkey registration and resource usage still need real-PC validation. No Windows CPU/RAM footprint is promised.

## Run in the background

Minimize or click **×** to hide Geronimo to the Windows system tray. Monitoring continues at the configured interval, and an enabled overlay stays visible. Double-click the tray icon to reopen the dashboard. Right-click it for **Open Geronimo**, **Run in background**, overlay visibility, **Pause/Resume monitoring**, or **Exit Geronimo**. Launching the shortcut again restores the existing instance for your Windows user.

Under **Preferences → Background monitoring**, switch **Minimize to tray** and **Close to tray** independently, or use **Run in background** directly. Both switches are enabled by default. Turn off Close to tray for ordinary ×-to-exit behavior. Windows shutdown, explicit tray Exit, and administrator restarts close the app normally. Exit Geronimo before replacing a portable installation or updating it manually.

While hidden, native sensors and the overlay continue; dashboard updates/full process lists stop, and Geronimo asks WebView2 to suspend. Up to 1,800 current-session utilization samples remain in a native memory buffer and are restored with their original timestamps when you reopen. Only the selected process is sampled in the background; FPS/ping capture continues when the overlay needs it. This runs while you are signed in and Windows is awake. It does not install a Windows service or automatically launch at login. Actual background resource use still needs profiling on your PC.

## Features

- CPU/GPU/RAM cards with utilization, available temperature, and recent history.
- Full available temperature inventory with current/min/max readings. Unsupported readings remain unavailable.
- Graphite, Midnight, and Light themes; four accents; comfortable/compact density; reduced motion.
- Show/hide/reorder dashboard widgets. Preferences persist locally in the WebView2 profile (or browser local storage for the preview).
- Celsius/Fahrenheit and 1/2/5-second update intervals. Read-only process CPU and working-set memory, search, and sorting. Protected processes may be inaccessible; per-process GPU usage is currently unavailable.
- Bounded current-session utilization history (up to 1,800 native samples) and CSV export with actual sample timestamps and source labels. History is not recorded across restarts.
- Separate, borderless **native WinForms overlay**, so it needs no second WebView2 instance. Stacked/horizontal layout, opacity, scaling, metric selection, saved position, and click-through mode.
- Overlay Studio supports up to 24 selected/reordered readings: combined CPU/GPU/RAM, individual usage/temperature/clock/power readings, RAM used, per-sensor temperatures, process name/CPU/working-set RAM, FPS, frame time and network ping. Text/background colors are configurable. Process selection is session-only to avoid reusing a saved PID on another launch.
- **FPS and frame time:** the bundled, unmodified PresentMon 2.6.0 console collects ETW presents for the selected process. Values use the busiest swap chain over a bounded two-second window; idle/stopped captures show unavailable. This is application present rate and time between presents, not display FPS, generated-frame rate, input latency or click-to-photon latency. Administrator access may be required. Capture runs only while Overlay Studio or the desktop overlay is active with FPS/frame time enabled; closing Geronimo stops its own uniquely named session.
- **Network ping:** enable it in Overlay Studio and enter an IP address or hostname. Geronimo sends an ICMP request about every five seconds while Studio/overlay is active. Timeout/blocked ICMP shows unavailable. It is round-trip time to that host, not an automatic measurement of the selected game's server. It uploads no sensor/process data.
- **Ctrl+Shift+O** toggles the desktop overlay when Windows grants the global shortcut. Drag the overlay with click-through off. Reset position in Overlay studio. Always-on-top is intended for desktop/windowed/borderless applications; exclusive-fullscreen game compatibility is not implemented or verified.
- The browser preview includes a draggable in-app overlay, including keyboard movement using its grip. It cannot float over other applications.

Temperature alert rules, launch-at-login settings, permanent history, fan-speed displays, per-process GPU usage, and game-specific overlays are not implemented in this release.

## Development

The UI has **zero runtime JavaScript package dependencies**: TypeScript, CSS, inline SVG, and browser APIs. The native host uses .NET 10, WinForms, WebView2, and LibreHardwareMonitor. It reads sensors locally and performs no telemetry uploads. Full process enumeration runs in Processes/Overlay Studio; otherwise only the selected process is sampled. Optional ping contacts the configured host.

Frontend requires Node.js 22.12+ (Node 24 recommended) and npm:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

```sh
npm run build
npm test
dotnet run --project tests/Geronimo.PolicyTests -c Release
# Windows only: real WinForms tray lifecycle checks.
dotnet run --project tests/Geronimo.TrayTests -c Release
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

The build script fetches checksum-pinned official PresentMon, PawnIO setup and Microsoft WebView2 bootstrapper binaries. It includes PawnIO 2.1.0 corresponding source with its pinned submodule and license. To compile the single installer after publishing/packaging the portable folder, install Inno Setup 6 and compile `installer/Geronimo.iss`. GitHub Actions also validates the two installers' signatures and produces SHA-256 sidecars for all downloads. Geronimo's own preview installer is unsigned.

Cloud setup in this checkout:

```sh
bash scripts/setup-cloud.sh
```

This verifies/downloads the official pinned Linux .NET SDK if needed, installs frozen npm dependencies, builds the UI, restores locked NuGet dependencies, and publishes the Windows x64 application. It does not run Windows software on Linux. SDK downloads retain TLS and published SHA-512 verification. Each cloud task is already isolated; use this checkout without creating a worktree unless explicitly requested.

Source entry points: `src/main.ts` for UI, `src/telemetry.ts` for demo/native state, `src/bridge.ts` for WebView2 messaging, and `desktop/Geronimo.Desktop/` for the Windows host, sensor provider, and overlay. A bundled portable runtime increases download/disk size; the slim build shares installed runtimes. Actual application resource use needs Windows profiling.
