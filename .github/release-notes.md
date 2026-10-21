Download **Geronimo-Setup-win-x64.exe** for the updated Windows 10/11 x64 application.

This update adds Geronimo's mint **G icon** to the Windows executable, title bar/taskbar, system tray, installer and shortcuts. The icon includes 16–256 pixel sizes for different Windows display scales.

Opening the dashboard now plays a short G-logo animation (under one second). Sensor monitoring starts immediately. Reduced Motion or the Windows reduced-motion preference skips it, and clicking or pressing a key dismisses it immediately. Restoring the existing dashboard from the tray does not replay the intro.

Background monitoring, tray controls, overlay customization, FPS/frame time/ping, and existing hardware monitoring remain available. Minimize or click × to keep monitoring in the tray; double-click its icon to reopen; right-click for overlay controls, Pause/Resume, or **Exit Geronimo**. Change minimize/close behavior in Preferences.

Before updating, right-click the existing tray icon and choose **Exit Geronimo**. Install the new build over the existing installation. Keep PawnIO installed and continue using administrator access where needed for CPU/RAM/motherboard temperatures and frame capture. Optional desktop shortcuts can be selected during setup. WebView2 setup needs internet only when its shared runtime is missing.

Validation covers UI/native-message tests, native Windows tray lifecycle with the embedded G icon, sensor/history/frame regression checks, and Windows app/installer packaging. The published download is verified against its SHA-256 file. Preview installers are unsigned; official driver/bootstrapper signatures and pinned hashes are verified during packaging. Hardware support and background resource use still depend on the PC and need real-PC validation.

Portable and slim ZIPs are also available; extract the entire package. The slim build requires the .NET 10 Desktop Runtime. Both need WebView2 and PawnIO for full functionality. Component licenses and corresponding PawnIO driver sources are included in Tools.
