First preview build of Geronimo for Windows 10/11 x64 PCs.

Download `Geronimo-windows-win-x64.zip`, extract the entire ZIP, and open `Geronimo.exe` in the extracted `Geronimo` folder. Keep its DLLs and `Assets` directory together. The portable build includes the .NET runtime. Both packages require Microsoft Edge WebView2 Evergreen Runtime: https://developer.microsoft.com/microsoft-edge/webview2/#download

The smaller `Geronimo-windows-win-x64-slim.zip` additionally requires the .NET 10 Desktop Runtime.

Includes automatic hardware enumeration using LibreHardwareMonitor, CPU/GPU/RAM monitoring, available temperature sensors, configurable themes and widgets, local session CSV export, and a native desktop overlay. Ctrl+Shift+O toggles the overlay when Windows grants the shortcut. Missing sensor readings remain unavailable. Some sensors require administrator access or supported hardware drivers.

The UI and native message contract have automated browser tests. Cross-compilation and archive checks passed in the development environment. Actual hardware compatibility, native overlay rendering, shortcut registration, and Windows resource usage still need real-PC validation. Exclusive-fullscreen game overlays, permanent history, temperature alert rules, and system-tray startup controls are not implemented in this preview.
