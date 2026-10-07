# Builds « Coulisses.exe » (the app) and « Coulisses Setup.exe » (the installer) into the workshop's
# root folder, with the C# compiler of the .NET Framework that comes with Windows (no SDK, nothing to install).
# usage: pwsh -File app\build.ps1     (then: node install.mjs, or double-click the Setup)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4.*\csc.exe" | Sort-Object FullName | Select-Object -Last 1
if (-not $csc) { throw 'csc.exe (.NET Framework 4) introuvable' }
if (-not (Test-Path "$here\coulisses.ico")) { & pwsh -NoProfile -File "$here\make-icon.ps1" }
$common = @('/nologo', '/optimize+', '/platform:anycpu', '/codepage:65001', "/win32icon:$here\coulisses.ico", "/win32manifest:$here\app.manifest")
& $csc.FullName @common /target:winexe "/out:$root\Coulisses.exe" /r:System.Management.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll "$here\Launcher.cs"
if ($LASTEXITCODE) { throw "échec de la compilation de Coulisses.exe" }
& $csc.FullName @common /target:winexe "/out:$root\Coulisses Setup.exe" /r:System.Drawing.dll /r:System.Windows.Forms.dll "$here\Setup.cs"
if ($LASTEXITCODE) { throw "échec de la compilation de Coulisses Setup.exe" }
Get-Item "$root\Coulisses.exe", "$root\Coulisses Setup.exe" | ForEach-Object { "{0}  ({1:N0} Ko)" -f $_.FullName, ($_.Length / 1KB) }
