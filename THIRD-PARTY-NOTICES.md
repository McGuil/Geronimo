# Third-party components

Geronimo uses unmodified binary packages restored from NuGet, with versions and integrity hashes recorded in `desktop/Geronimo.Desktop/packages.lock.json`.

- **LibreHardwareMonitorLib 0.9.6** — Mozilla Public License 2.0. Source and notices: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor . Obtain the covered library source from that project; Geronimo has not modified it. License text: https://www.mozilla.org/MPL/2.0/ .
- **Microsoft.Web.WebView2 1.0.4258.31** — Microsoft package license: https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31 . Uses the separately installed Microsoft Edge WebView2 Runtime.
- Transitive sensor-library packages include DiskInfoToolkit, RAMSPDToolkit-NDD, HidSharp, BlackSharp.Core, and Mono.Posix.NETStandard. Their respective NuGet package metadata contains license and source information; consult the generated `dependency-notices.txt` distributed with the Windows package.
- **.NET runtime and Windows Desktop runtime** — Microsoft and contributors. License and notices: https://github.com/dotnet/runtime and https://github.com/dotnet/winforms . The portable build includes these runtimes. The slim build uses the separately installed .NET 10 Desktop Runtime.

Frontend runtime code has no third-party JavaScript package dependencies. Vite, TypeScript, and Playwright are development tools and are not shipped as runtime libraries.
