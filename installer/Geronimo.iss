#define AppVersion "0.3.0"
[Setup]
AppId={{47170367-DC26-4A99-9B8F-BE8D6C602575}
AppName=Geronimo
AppVersion={#AppVersion}
AppPublisher=Geronimo
AppPublisherURL=https://github.com/McGuil/Geronimo
DefaultDirName={autopf}\Geronimo
DefaultGroupName=Geronimo
UninstallDisplayIcon={app}\Geronimo.exe
OutputDir=..\artifacts
OutputBaseFilename=Geronimo-Setup-win-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
PrivilegesRequired=admin
WizardStyle=modern
CloseApplications=yes
SetupLogging=yes
InfoBeforeFile=install-notes.txt

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "pawnio"; Description: "Install PawnIO 2.1 sensor driver (needed for CPU, DIMM and motherboard temperatures)"; GroupDescription: "Hardware access:"; Check: NeedsPawnIO

[Files]
Source: "..\artifacts\windows-win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Geronimo"; Filename: "{app}\Geronimo.exe"
Name: "{autodesktop}\Geronimo"; Filename: "{app}\Geronimo.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Tools\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime (internet access may be required)..."; Flags: runhidden waituntilterminated; Check: NeedsWebView2
Filename: "{app}\Tools\PawnIO_setup.exe"; Parameters: "-install"; StatusMsg: "Setting up the PawnIO hardware sensor driver..."; Tasks: pawnio; Flags: waituntilterminated; Check: NeedsPawnIO
Filename: "{app}\Geronimo.exe"; Description: "Launch Geronimo"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
function NeedsPawnIO: Boolean;
var Version: String; Installed, Required: Int64;
begin
  Result := True;
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO', 'DisplayVersion', Version)
    or RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO', 'DisplayVersion', Version) then
  begin
    if StrToVersion(Version, Installed) and StrToVersion('2.0.0.0', Required) then
      Result := Installed < Required;
  end;
end;

function NeedsWebView2: Boolean;
var Version: String;
begin
  Result := not (
    RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)
    or RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)
    or RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version));
end;
