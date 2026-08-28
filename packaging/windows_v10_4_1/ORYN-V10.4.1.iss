#define MyAppName "ORYN"
#define MyAppVersion "10.4.1"
#define MyAppPublisher "Studio Kinematics"
#define MyAppExeName "ORYN.exe"

[Setup]
; Reuse the established ORYN Windows AppId so an earlier ORYN Windows install
; upgrades cleanly instead of appearing as a second unrelated application.
AppId={{6C4FFBBF-B7DD-4DF0-9BD5-4B0315D9B7AC}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=ORYN — Designed to Move
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\ORYN
DefaultGroupName=ORYN
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\release
OutputBaseFilename=ORYN-Windows-Setup-V10.4.1
SetupIconFile=..\windows\ORYN.ico
UninstallDisplayIcon={app}\ORYN.exe
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
MinVersion=10.0
LicenseFile=..\..\LICENSE-GPL-3.0

[Files]
Source: "..\..\dist\ORYN\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\ORYN"; Filename: "{app}\ORYN.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\ORYN"; Filename: "{app}\ORYN.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\ORYN.exe"; Description: "Launch ORYN"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
