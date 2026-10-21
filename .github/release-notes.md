Download **Geronimo-Setup-win-x64.exe** for the updated Windows 10/11 x64 app.

This release adds **background monitoring in the Windows system tray**:

- Minimize or click × to hide the dashboard while sensor monitoring and an enabled overlay keep running.
- Double-click the tray icon to reopen; right-click for Open, Run in background, overlay visibility, Pause/Resume monitoring, and **Exit Geronimo**.
- Preferences has independent **Minimize to tray** and **Close to tray** switches, enabled by default, plus a Run in background button.
- Hidden dashboard updates and full process scans stop; WebView2 suspension is requested. A bounded native buffer keeps up to 1,800 utilization samples and restores their original timestamps on reopening.
- Launching Geronimo again restores the existing instance for your Windows user. Windows shutdown, tray Exit, and administrator restarts close the application normally.

Close the old Geronimo before installing. The installer preserves existing PawnIO 2.0+ and includes .NET, PresentMon, and WebView2/PawnIO setup components. Keep the existing sensor driver installed and continue using administrator access where needed for CPU/RAM/motherboard temperatures and ETW frame capture. This release retains the working sensor behavior from 0.2.0.

Background monitoring works while you are signed in and Windows is awake. Automatic launch at login is not configured. The app is not a Windows service. FPS/ping capture continues when a visible overlay requires it; capture used only by the hidden Studio preview stops. Optional ping contacts the selected host. No sensor or process data is uploaded.

Validation includes UI/native-message tests, bounded history and sensor/frame regression checks, native Windows tray lifecycle checks (minimize/close/restore, independent overlay, pause/resume, explicit exit and shutdown), Windows compilation, and installer packaging. WebView2 suspension/resource use and the actual tray appearance still need validation on the user's PC. The preview installer is unsigned; driver/bootstrapper signatures and pinned component hashes are verified during packaging. Hardware compatibility and exclusive-fullscreen overlays remain device/application-dependent.

Portable alternatives remain available as ZIPs. Extract the full folder including DLLs, Assets and Tools; the slim build additionally requires the .NET 10 Desktop Runtime. Both require WebView2 and PawnIO for full functionality. Component notices and corresponding PawnIO driver sources are included in Tools.
