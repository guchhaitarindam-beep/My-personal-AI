# Quiz Corner - one-click launcher for Windows 10 / 11.
# Started by "START_QUIZ_CORNER.bat". It
#   1. makes sure the TV is a SEPARATE screen (Extend), asking the operator to press Windows+P if Windows will not switch,
#   2. tells the laptop screen from the TV (the laptop's own panel, else the main display),
#   3. opens the control window maximized on the laptop and the stage full screen on the TV, and checks both,
#   4. asks once "is it right?" - one click swaps the two screens, and the choice is remembered for next time.
# Both windows share one browser profile of their own, so they stay in sync, sound starts by itself
# and the event data stays in one place.  With no TV both windows open side by side on the laptop.
# A log of every start is kept in %LOCALAPPDATA%\QuizCorner\launcher_log.txt.

# QC-LAUNCHER: 20261017-1200
$ErrorActionPreference = 'Continue'
$LauncherStamp = '20261017-1200'
# Bengali messages are kept as UTF-8 Base64 so this file is plain ASCII and reads the same in every Windows PowerShell
function T($b) { [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b)) }
$myPs1 = $MyInvocation.MyCommand.Path
# the folder of START_QUIZ_CORNER.bat (the .bat passes it; started on its own, the folder of this file)
$here = $(if ($env:QC_HERE) { $env:QC_HERE.Trim().TrimEnd('\', '/') } else { Split-Path -Parent $myPs1 })
$qcHome = Join-Path $env:LOCALAPPDATA 'QuizCorner'
New-Item -ItemType Directory -Force -Path $qcHome | Out-Null
$logFile = Join-Path $qcHome 'launcher_log.txt'
$cfgFile = Join-Path $qcHome 'screens.txt'
try { if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 200KB) { Remove-Item $logFile -Force } } catch { }

function Say($t) { Write-Host ('  ' + $t); try { Add-Content -Path $logFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $t) -Encoding UTF8 } catch { } }
function Box($text, $buttons, $icon) {
  try { Add-Type -AssemblyName System.Windows.Forms } catch { }
  try { return [System.Windows.Forms.MessageBox]::Show($text, 'Quiz Corner', $buttons, $icon) } catch { Write-Host $text; return 'OK' }
}
function Fail($bn, $en) { Say ('STOP: ' + $en); [void](Box ($bn + "`n`n" + $en) 'OK' 'Warning'); exit 1 }

Say ('----- start -----  launcher ' + $LauncherStamp + '  folder: ' + $here)
# an unexpected error is written to the log and the start goes on (the .bat opens its own windows only when this script stops early)
$script:opened = $false
trap { Say ('ERROR: ' + $_.Exception.Message); continue }
# Files downloaded from the internet carry a "blocked" mark; clear it for this folder.
Get-ChildItem -Path $here -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  ===  QUIZ CORNER  ===' -ForegroundColor Yellow
Write-Host ''

# --- stamps: every quiz file carries "QC-BUILD: yyyyMMdd-HHmm", every launcher file "QC-LAUNCHER: yyyyMMdd-n" near the top ---
function StampIn($path, $tag) {
  try { $r = New-Object System.IO.StreamReader($path); $buf = New-Object char[] 6000; $n = $r.Read($buf, 0, 6000); $r.Close()
        $m = [regex]::Match((New-Object string($buf, 0, $n)), $tag + ':\s*(\d{8}-\d{1,4})'); if ($m.Success) { return $m.Groups[1].Value } } catch { }
  return '00000000-0000'
}
function BuildOf($f) { return StampIn $f.FullName 'QC-BUILD' }
function Human($b) { if ($b -match '^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$') { return $Matches[3] + '-' + $Matches[2] + '-' + $Matches[1] + ' ' + $Matches[4] + ':' + $Matches[5] } return 'unknown (very old file)' }

# --- the launcher itself: keep only the newest copy under the plain names ---------------------------
# Files sent one by one (WhatsApp, e-mail) arrive as "START_QUIZ_CORNER (1).bat", "QuizCorner_Launcher (1).ps1" next to old ones;
# the newest copy is written over the plain names, older copies go to "old_versions", and the desktop shortcut points here,
# so whichever file is clicked next time, the newest launcher runs.
$oldDir = Join-Path $here 'old_versions'
function ToOld($f) {
  try { New-Item -ItemType Directory -Force -Path $oldDir | Out-Null; Move-Item -LiteralPath $f -Destination (Join-Path $oldDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '_' + (Split-Path -Leaf $f))) -Force; Say ('  old copy moved to old_versions: ' + (Split-Path -Leaf $f)) } catch { }
}
try {
  $canonPs1 = Join-Path $here 'QuizCorner_Launcher.ps1'
  $canonBat = Join-Path $here 'START_QUIZ_CORNER.bat'
  # PowerShell has read this whole file already, so the plain-named copy may be overwritten even when it is the one running
  if ($myPs1 -and $myPs1 -ne $canonPs1 -and (StampIn $canonPs1 'QC-LAUNCHER') -lt $LauncherStamp) { Copy-Item -LiteralPath $myPs1 -Destination $canonPs1 -Force; Say '  newest launcher copied to QuizCorner_Launcher.ps1' }
  Get-ChildItem -Path $here -Filter 'QuizCorner_Launcher*.ps1' -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $canonPs1 -and $_.FullName -ne $myPs1 -and (StampIn $_.FullName 'QC-LAUNCHER') -le (StampIn $canonPs1 'QC-LAUNCHER') } | ForEach-Object { ToOld $_.FullName }
  # a .bat is read line by line while it runs, so the running one is never overwritten or moved (older starters do not say which one runs: then it is the plain-named one)
  $runBat = $(if ($env:QC_BAT) { $env:QC_BAT } else { $canonBat })
  $bats = @(Get-ChildItem -Path $here -Filter 'START_QUIZ_CORNER*.bat' -File -ErrorAction SilentlyContinue | Sort-Object @{ Expression = { StampIn $_.FullName 'QC-LAUNCHER' }; Descending = $true })
  $newBat = $bats | Select-Object -First 1
  if ($newBat -and $newBat.FullName -ne $canonBat -and $runBat -ne $canonBat -and (StampIn $canonBat 'QC-LAUNCHER') -lt (StampIn $newBat.FullName 'QC-LAUNCHER')) { Copy-Item -LiteralPath $newBat.FullName -Destination $canonBat -Force; Say '  newest starter copied to START_QUIZ_CORNER.bat' }
  $canonStamp = StampIn $canonBat 'QC-LAUNCHER'
  $script:startBat = $(if ($newBat -and (StampIn $newBat.FullName 'QC-LAUNCHER') -gt $canonStamp) { $newBat.FullName } else { $canonBat })
  $bats | Where-Object { $_.FullName -ne $canonBat -and $_.FullName -ne $runBat -and $_.FullName -ne $script:startBat } | ForEach-Object { ToOld $_.FullName }
} catch { Say ('  launcher tidy-up skipped: ' + $_.Exception.Message) }

# --- the quiz file ---------------------------------------------------------
# Always the quiz file with the NEWEST build stamp - never the file date (a ZIP keeps old dates, a download gets today's date).
# This folder, Downloads, Desktop, Documents and WhatsApp's own folder are searched; a newer file found elsewhere is copied here,
# and older copies in this folder go to "old_versions" so they can never open by mistake.
$dl = Join-Path $env:USERPROFILE 'Downloads'
$places = @(
  @{ p = $here; d = 0 }, @{ p = $dl; d = 2 },
  @{ p = [Environment]::GetFolderPath('Desktop'); d = 1 }, @{ p = [Environment]::GetFolderPath('MyDocuments'); d = 1 }
)
# WhatsApp Desktop keeps the files it opens in its own folder
foreach ($w in @(Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter '*WhatsApp*' -ErrorAction SilentlyContinue)) { $places += @{ p = (Join-Path $w.FullName 'LocalState'); d = 6 } }
$seen = @{}; $cands = @(); $stamp = @{}
foreach ($pl in $places) {
  if (-not $pl.p -or -not (Test-Path -LiteralPath $pl.p)) { continue }
  foreach ($f in @(Get-ChildItem -LiteralPath $pl.p -Filter '*.html' -File -Recurse -Depth $pl.d -ErrorAction SilentlyContinue)) {
    if ($seen.ContainsKey($f.FullName) -or $f.Name -like '*LITE*' -or $f.FullName -like '*\old_versions\*' -or $f.Length -lt 1MB) { continue }
    $seen[$f.FullName] = 1
    $b = BuildOf $f
    if ($f.Name -like 'Quiz_Corner*' -or $b -ne '00000000-0000') { $cands += $f; $stamp[$f.FullName] = $b }
  }
}
$sorted = @($cands | Sort-Object @{ Expression = { $stamp[$_.FullName] }; Descending = $true }, @{ Expression = { (Split-Path -Parent $_.FullName) -eq $here }; Descending = $true }, @{ Expression = { $_.LastWriteTime }; Descending = $true })
Say ('Quiz files found: ' + $sorted.Count)
$k = 0; foreach ($f in $sorted) { if ($k -ge 8) { break }; Say ($(if ($k -eq 0) { '  >> ' } else { '     ' }) + 'build ' + (Human $stamp[$f.FullName]) + '   ' + $f.FullName); $k++ }
$best = $sorted | Select-Object -First 1
if ($best) {
  $bestBuild = $stamp[$best.FullName]
  $mine = @(Get-ChildItem -Path $here -Filter '*.html' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '*LITE*' -and $_.FullName -ne $best.FullName -and ($_.Name -like 'Quiz_Corner*' -or (BuildOf $_) -ne '00000000-0000') })
  foreach ($o in $mine) { ToOld $o.FullName }
  if ((Split-Path -Parent $best.FullName) -ne $here) {
    $dest = Join-Path $here 'Quiz_Corner_V66_FINAL_Broadcast_Engine.html'
    try { Copy-Item -LiteralPath $best.FullName -Destination $dest -Force; Say ('  copied into this folder from ' + (Split-Path -Parent $best.FullName)); $best = Get-Item -LiteralPath $dest } catch { Say ('  could not copy - opening it where it is: ' + $_.Exception.Message) }
  }
}
$html = $best
if (-not $html) { Fail (T '4KaV4KeB4KaH4Kac4KeH4KawIEhUTUwg4Kar4Ka+4KaH4Kay4Kaf4Ka/IOCmj+CmhyDgpqvgp4vgprLgp43gpqHgpr7gprDgp4cg4Kaq4Ka+4KaT4Kav4Ka84Ka+IOCmr+CmvuCmr+CmvOCmqOCmv+ClpCBTVEFSVF9RVUlaX0NPUk5FUi5iYXQsIFF1aXpDb3JuZXJfTGF1bmNoZXIucHMxIOCmhuCmsCDgppXgp4Hgpofgppzgp4fgprAgSFRNTCDigJQg4Kak4Ka/4Kao4Kaf4KeHIOCmq+CmvuCmh+CmsiDgpo/gppXgpocg4Kar4KeL4Kay4KeN4Kah4Ka+4Kaw4KeHIOCmsOCmvuCmluCngeCmqOClpA==') 'The quiz HTML file is not in this folder.' }
$url = ([System.Uri]$html.FullName).AbsoluteUri
$build = BuildOf $html
Say ('Quiz file : ' + $html.FullName + '  [build ' + $build + ', ' + [int]($html.Length / 1MB) + ' MB]')
# the folder for big, high-quality audio / video next to the quiz file (the quiz plays them straight from the disk)
$mediaDir = Join-Path (Split-Path -Parent $html.FullName) 'QuizCorner_Media'
if (-not (Test-Path -LiteralPath $mediaDir)) { try { [void](New-Item -ItemType Directory -Path $mediaDir -Force); Say ('Media folder created: ' + $mediaDir) } catch { Say ('Media folder could not be created: ' + $mediaDir) } } else { Say ('Media folder : ' + $mediaDir) }
Write-Host ''
Write-Host ('  OPENING THE QUIZ FILE OF ' + (Human $build)) -ForegroundColor Black -BackgroundColor Yellow
Write-Host ('  ' + $html.FullName)
Write-Host ''
# diagnosis only: show which file would open, then stop
if ($env:QC_PICK_ONLY -eq '1') { Write-Output ('PICKED=' + $html.FullName + '|' + $build); exit 0 }

# --- the browser: Google Chrome, else Microsoft Edge -----------------------
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Fail (T 'R29vZ2xlIENocm9tZSDgpqzgpr4gTWljcm9zb2Z0IEVkZ2Ug4Kaq4Ka+4KaT4Kav4Ka84Ka+IOCmr+CmvuCmr+CmvOCmqOCmv+ClpCDgpq/gp4fgppXgp4vgpqjgp4sg4KaP4KaV4Kaf4Ka/IOCmh+CmqOCmuOCnjeCmn+CmsiDgppXgprDgp4HgpqjgpaQ=') 'Install Google Chrome or Microsoft Edge.' }
Say ('Browser   : ' + (Split-Path -Leaf $browser))

# --- a browser profile of its own (sound allowed, no pop-ups, data kept in one place) ---
$qcProfile = Join-Path $qcHome 'BrowserProfile'
New-Item -ItemType Directory -Force -Path $qcProfile | Out-Null
$common = @(
  "--user-data-dir=`"$qcProfile`"", '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble',
  '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-pinch', '--overscroll-history-navigation=0'
)

# close windows left open by an earlier start (the quiz saves everything as it goes) and wait until they are really gone,
# otherwise the new start is handed to the dying browser and nothing opens
function OurProcs { @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*QuizCorner\BrowserProfile*' }) }
$old = OurProcs
if ($old.Count) {
  Say ('Closing the windows of the earlier start (' + $old.Count + ' processes) ...')
  $old | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch { } }
  for ($i = 0; $i -lt 20 -and (OurProcs).Count; $i++) { Start-Sleep -Milliseconds 300 }
  Start-Sleep -Milliseconds 1200
}
foreach ($lock in @('SingletonLock', 'SingletonCookie', 'SingletonSocket')) { Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $qcProfile $lock) }

# --- window helpers (Windows API) ------------------------------------------
$native = $true
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class QCMon { public int L, T, W, H, WL, WT, WW, WH; public bool Primary; public string Device = ""; public string DevId = ""; }
public static class QCWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFOEX {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey; }
  public delegate bool MonEnum(IntPtr h, IntPtr dc, ref RECT r, IntPtr d);
  public delegate bool WinEnum(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonEnum f, IntPtr d);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFOEX mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE dd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool EnumWindows(WinEnum f, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();

  public static void DpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
    try { SetProcessDPIAware(); } catch { }
  }
  static MONITORINFOEX Info(IntPtr hm) {
    var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX)); GetMonitorInfo(hm, ref mi); return mi;
  }
  // every screen in real pixels, with its Windows name (\\.\DISPLAY1) and the monitor's hardware id
  public static List<QCMon> Monitors() {
    var list = new List<QCMon>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr dc, ref RECT r, IntPtr d) => {
      var mi = Info(h);
      var m = new QCMon();
      m.L = mi.rcMonitor.L; m.T = mi.rcMonitor.T; m.W = mi.rcMonitor.R - mi.rcMonitor.L; m.H = mi.rcMonitor.B - mi.rcMonitor.T;
      m.WL = mi.rcWork.L; m.WT = mi.rcWork.T; m.WW = mi.rcWork.R - mi.rcWork.L; m.WH = mi.rcWork.B - mi.rcWork.T;
      m.Primary = (mi.dwFlags & 1) != 0; m.Device = mi.szDevice ?? "";
      for (uint i = 0; i < 8; i++) {
        var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
        if (!EnumDisplayDevices(m.Device, i, ref dd, 1)) break;
        if ((dd.StateFlags & 1) != 0 || m.DevId.Length == 0) m.DevId = dd.DeviceID ?? "";
        if ((dd.StateFlags & 1) != 0) break;
      }
      list.Add(m);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  // the visible browser windows (Chrome and Edge both use this window class)
  public static List<IntPtr> BrowserWindows() {
    var list = new List<IntPtr>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(256); GetClassName(h, cls, 256);
      if (cls.ToString() == "Chrome_WidgetWin_1" && Title(h).Length > 0) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static string ScreenOf(IntPtr h) { return Info(MonitorFromWindow(h, 2)).szDevice ?? ""; }
  // true when the window's page fills its whole screen (browser full screen)
  public static bool IsFull(IntPtr h) {
    RECT c; if (!GetClientRect(h, out c)) return false;
    var mi = Info(MonitorFromWindow(h, 2));
    return (c.R - c.L) >= (mi.rcMonitor.R - mi.rcMonitor.L) - 2 && (c.B - c.T) >= (mi.rcMonitor.B - mi.rcMonitor.T) - 2;
  }
  public static bool Front(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    uint pid; uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid); uint me = GetCurrentThreadId();
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // a tap of Alt lets us bring a window forward
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    BringWindowToTop(h); SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fgThread, false);
    return GetForegroundWindow() == h;
  }
  public static void F11() { keybd_event(0x7A, 0, 0, UIntPtr.Zero); keybd_event(0x7A, 0, 2, UIntPtr.Zero); }
}
"@
  [QCWin]::DpiAware()
} catch {
  $native = $false
  Say ('Window helpers not available (' + $_.Exception.Message + ') - the windows open without automatic placement.')
}

# --- simple mode: Windows does not allow the helpers (strict security software) ---
if (-not $native) {
  $script:opened = $true
  Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url", '--start-maximized'))
  Start-Sleep -Seconds 3
  Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url#stage", '--new-window'))
  [void](Box ((T '4Kam4KeB4Kaf4KeLIOCmnOCmvuCmqOCmvuCmsuCmviDgppbgp4vgprLgpr4g4Ka54Kav4Ka84KeH4Kab4KeHLCDgppXgpr/gpqjgp43gpqTgp4Eg4KaP4KaHIOCmleCmruCnjeCmquCmv+CmieCmn+CmvuCmsCDgpqjgpr/gppzgp4cg4Kal4KeH4KaV4KeHIOCmnOCmvuCmr+CmvOCml+CmvuCmruCmpOCniyDgpqzgprjgpr7gpqTgp4cg4Kam4Ka/4Kaa4KeN4Kab4KeHIOCmqOCmvuClpAoK') +
    (T '4KenLiBXaW5kb3dzICsgUCDgpprgp4fgpqrgp4cgJ0V4dGVuZCcg4Kas4KeH4Kab4KeHIOCmqOCmv+CmqOClpAo=') +
    (T '4KeoLiAnUXVpeiBDb3JuZXIg4oCUIFNUQUdFJyDgppzgpr7gpqjgpr7gprLgpr7gpp/gpr8g4Kau4Ka+4KaJ4Ka44KeHIOCmn+Cnh+CmqOCnhyDgpp/gpr/gpq3gpr/gpqTgp4cg4Kao4Ka/4KaoICjgpqzgpr4g4Ka44KeH4Kaf4Ka+4Kav4Ka8IOCmleCnjeCmsuCmv+CmlSDgppXgprDgp4cgV2luZG93cyArIFNoaWZ0ICsg4oaSIOCmmuCmvuCmquCngeCmqCngpaQK') +
    (T '4KepLiDgpp/gpr/gpq3gpr/gprAg4Kab4Kas4Ka/4Kak4KeHIOCmj+CmleCmrOCmvuCmsCDgpqHgpr7gpqzgprIt4KaV4KeN4Kay4Ka/4KaVIOCmleCmsOCngeCmqCDigJQg4Kaq4KeB4Kaw4KeLIOCmquCmsOCnjeCmpuCmviDgprngpqzgp4fgpaQ=')) 'OK' 'Information')
  exit 0
}

# --- the screens -------------------------------------------------------------
function Mons { @([QCWin]::Monitors()) }
function MonKey($m) { if ($m.DevId) { return $m.DevId.ToUpper() } else { return $m.Device.ToUpper() } }
function MonText($m) { return ($m.Device + ' ' + $m.W + 'x' + $m.H + ' at ' + $m.L + ',' + $m.T + $(if ($m.Primary) { ' (main display)' } else { '' })) }

$mons = Mons
Say ('Screens found: ' + $mons.Count)
if ($mons.Count -lt 2) {
  # Duplicate ("both screens show the same") or one-screen mode: ask Windows to extend to the TV
  Say 'Only one screen - asking Windows to EXTEND to the TV ...'
  try { Start-Process -FilePath "$env:WINDIR\System32\DisplaySwitch.exe" -ArgumentList '/extend' } catch { }
  for ($i = 0; $i -lt 20 -and $mons.Count -lt 2; $i++) { Start-Sleep -Milliseconds 700; $mons = Mons }
  while ($mons.Count -lt 2) {
    $ans = Box ((T '4Kaf4Ka/4Kat4Ka/4KaV4KeHIOCmhuCmsuCmvuCmpuCmviDgpqrgprDgp43gpqbgpr4g4Ka54Ka/4Ka44KeH4Kas4KeHIOCmquCmvuCmk+Cmr+CmvOCmviDgpq/gpr7gpprgp43gppvgp4cg4Kao4Ka+4KWkCgo=') +
      (T '4KenLiBIRE1JIOCmpOCmvuCmsCDgpqDgpr/gppXgpq7gpqTgp4sg4Kay4Ka+4KaX4Ka+4Kao4KeLIOCmhuCmm+CnhyDgppXgpr8g4Kao4Ka+LCDgpobgprAg4Kaf4Ka/4Kat4Ka/4Kak4KeHIEhETUkg4KaH4Kao4Kaq4KeB4KafIOCmrOCnh+Cmm+CnhyDgpqjgp4fgppPgpq/gprzgpr4g4KaG4Kab4KeHIOCmleCmvyDgpqjgpr4g4Kam4KeH4KaW4KeB4Kao4KWkCg==') +
      (T '4KeoLiDgppXgp4Dgpqzgp4vgprDgp43gpqHgp4cgV2luZG93cyArIFAg4Kaa4Ka+4Kaq4KeB4KaoIOKWuCAnRXh0ZW5kJyAo4Kaq4KeN4Kaw4Ka44Ka+4Kaw4Ka/4KakKSDgpqzgp4fgppvgp4cg4Kao4Ka/4Kao4KWkCg==') +
      (T 'ICAgKCdEdXBsaWNhdGUnIOCmrOCmviAnU2Vjb25kIHNjcmVlbiBvbmx5JyDgpqjgpq/gprwpCgo=') +
      (T '4Kak4Ka+4Kaw4Kaq4KawICdSZXRyeScg4Kaa4Ka+4Kaq4KeB4Kao4KWkCg==') +
      (T 'J0NhbmNlbCcg4Kaa4Ka+4Kaq4Kay4KeHIOCmtuCngeCmp+CngSDgprLgp43gpq/gpr7gpqrgpp/gpqrgp4cg4KaW4KeB4Kay4Kas4KeHICjgpqzgpr7gpqHgprzgpr/gpqTgp4cg4Kau4Ka54Kah4Ka84Ka+4KawIOCmnOCmqOCnjeCmryngpaQ=')) 'RetryCancel' 'Warning'
    if ("$ans" -ne 'Retry') { break }
    for ($i = 0; $i -lt 8 -and $mons.Count -lt 2; $i++) { Start-Sleep -Milliseconds 600; $mons = Mons }
  }
}
foreach ($m in $mons) { Say ('  screen : ' + (MonText $m)) }

# which screen is the laptop: 1) the one the operator chose last time, 2) the laptop's own panel, 3) the main display
$laptop = $null; $tv = $null; $why = ''
$saved = ''
try { if (Test-Path $cfgFile) { $saved = ((Get-Content $cfgFile -ErrorAction SilentlyContinue | Where-Object { $_ -like 'LAPTOP=*' } | Select-Object -First 1) -replace '^LAPTOP=', '').Trim().ToUpper() } } catch { }
if ($mons.Count -ge 2) {
  if ($saved) { $laptop = $mons | Where-Object { (MonKey $_) -eq $saved } | Select-Object -First 1; if ($laptop) { $why = 'chosen last time' } }
  if (-not $laptop) {
    try {
      $internal = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorConnectionParams -ErrorAction Stop |
        Where-Object { $v = [uint32]$_.VideoOutputTechnology; $v -eq [uint32]2147483648 -or $v -eq 11 -or $v -eq 13 } |
        ForEach-Object { ($_.InstanceName -replace '_\d+$', '').ToUpper() })
      foreach ($m in $mons) {
        $p = ($m.DevId -replace '^\\\\\?\\', '') -split '#'
        if ($p.Count -ge 3 -and $internal -contains (($p[0] + '\' + $p[1] + '\' + $p[2]).ToUpper())) { $laptop = $m; $why = "the laptop's own panel"; break }
      }
    } catch { }
  }
  if (-not $laptop) { $laptop = $mons | Where-Object { $_.Primary } | Select-Object -First 1; if ($laptop) { $why = 'main display' } }
  if (-not $laptop) { $laptop = $mons[0]; $why = 'first screen' }
  $tv = $mons | Where-Object { $_.Device -ne $laptop.Device } | Sort-Object { $_.W * $_.H } -Descending | Select-Object -First 1
} else {
  $laptop = $mons | Where-Object { $_.Primary } | Select-Object -First 1
  if (-not $laptop) { $laptop = $mons[0] }
}
Say ('Laptop    : ' + (MonText $laptop) + '  [' + $why + ']')
if ($tv) { Say ('TV        : ' + (MonText $tv)) } else { Say 'TV        : not connected - both windows side by side on the laptop (practice)' }

# --- open the two windows ----------------------------------------------------
$before = @([QCWin]::BrowserWindows())
function NewWin($want, $skip, $graceSec) {
  # a new browser window whose title has $want; after $graceSec seconds any new browser window will do
  $t0 = Get-Date
  for ($i = 0; $i -lt 160; $i++) {
    $fresh = @([QCWin]::BrowserWindows() | Where-Object { $before -notcontains $_ -and $skip -notcontains $_ })
    $hit = $fresh | Where-Object { [QCWin]::Title($_) -like $want } | Select-Object -First 1
    if ($hit) { return $hit }
    if ($fresh.Count -and ((Get-Date) - $t0).TotalSeconds -gt $graceSec) { return $fresh[0] }
    Start-Sleep -Milliseconds 250
  }
  return [IntPtr]::Zero
}

Say 'Opening the CONTROL window ...'
Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url"))
$script:opened = $true
$ctl = NewWin '*Broadcast Engine*' @() 12
if ($ctl -ne [IntPtr]::Zero) { Say ('  control window: "' + [QCWin]::Title($ctl) + '"') } else { Say '  control window not found' }
# the window title carries the build time: check that the file that opened is the one chosen
$script:wrongFile = $false
if ($ctl -ne [IntPtr]::Zero -and $build -ne '00000000-0000') {
  for ($i = 0; $i -lt 12 -and [QCWin]::Title($ctl) -notlike ('*' + (Human $build) + '*'); $i++) { Start-Sleep -Milliseconds 250 }
  if ([QCWin]::Title($ctl) -notlike ('*' + (Human $build) + '*')) { $script:wrongFile = $true; Say ('  WARNING: the control window does not show build ' + (Human $build)) } else { Say ('  checked: build ' + (Human $build) + ' is open') }
}

Say 'Opening the STAGE window ...'
Start-Sleep -Milliseconds 800
Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url#stage", '--new-window'))
$stage = NewWin '*STAGE*' @($ctl) 12
if ($stage -ne [IntPtr]::Zero) {
  # the page names itself "STAGE" a moment after it loads
  for ($i = 0; $i -lt 20 -and [QCWin]::Title($stage) -notlike '*STAGE*'; $i++) { Start-Sleep -Milliseconds 250 }
  Say ('  stage window: "' + [QCWin]::Title($stage) + '"')
} else { Say '  stage window not found' }

function Fullscreen($h, $on) {
  # F11 in the browser; checked by looking at the page size, tried up to 4 times
  for ($k = 0; $k -lt 4; $k++) {
    if ([QCWin]::IsFull($h) -eq $on) { return $true }
    if ([QCWin]::Front($h)) {
      [QCWin]::F11()
      for ($j = 0; $j -lt 14 -and [QCWin]::IsFull($h) -ne $on; $j++) { Start-Sleep -Milliseconds 250 } # wait for the change before pressing again
      Start-Sleep -Milliseconds 300
    } else { Start-Sleep -Milliseconds 500 }
  }
  return ([QCWin]::IsFull($h) -eq $on)
}
function PlaceAll($lap, $scr) {
  $ok = $true
  if ($stage -ne [IntPtr]::Zero) {
    if ([QCWin]::IsFull($stage)) { [void](Fullscreen $stage $false) }
    [void][QCWin]::ShowWindow($stage, 9)
    [void][QCWin]::SetWindowPos($stage, [IntPtr]::Zero, $scr.L, $scr.T, $scr.W, $scr.H, 0x0040)
    Start-Sleep -Milliseconds 900
    if ([QCWin]::ScreenOf($stage) -ne $scr.Device) { [void][QCWin]::SetWindowPos($stage, [IntPtr]::Zero, $scr.L, $scr.T, $scr.W, $scr.H, 0x0040); Start-Sleep -Milliseconds 700 }
    $full = Fullscreen $stage $true
    $onTv = ([QCWin]::ScreenOf($stage) -eq $scr.Device)
    Say ('  stage  -> ' + $scr.Device + ' : ' + $(if ($onTv) { 'OK' } else { 'NOT on that screen' }) + ', full screen: ' + $full)
    if (-not $onTv) { $ok = $false }
    if (-not $full) { $script:needDblClick = $true }
  } else { $ok = $false }
  if ($ctl -ne [IntPtr]::Zero) {
    [void][QCWin]::ShowWindow($ctl, 9)
    [void][QCWin]::SetWindowPos($ctl, [IntPtr]::Zero, $lap.WL + 20, $lap.WT + 20, [Math]::Max(800, $lap.WW - 40), [Math]::Max(560, $lap.WH - 40), 0x0040)
    Start-Sleep -Milliseconds 400
    [void][QCWin]::ShowWindow($ctl, 3)
    Start-Sleep -Milliseconds 400
    $onLap = ([QCWin]::ScreenOf($ctl) -eq $lap.Device)
    Say ('  control -> ' + $lap.Device + ' : ' + $(if ($onLap) { 'OK' } else { 'NOT on that screen' }))
    if (-not $onLap) { $ok = $false }
    [void][QCWin]::Front($ctl)
  }
  return $ok
}

function AskRight($lap) {
  # a small question on the laptop: is the control here and the stage on the TV?  (closes by itself after 25 s)
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'Quiz Corner'; $f.TopMost = $true; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
  $f.StartPosition = 'Manual'; $f.ClientSize = New-Object System.Drawing.Size(720, 280); $f.BackColor = [System.Drawing.Color]::FromArgb(11, 33, 80)
  $f.Location = New-Object System.Drawing.Point(($lap.WL + [int](($lap.WW - 720) / 2)), ($lap.WT + [int](($lap.WH - 280) / 2)))
  $font = New-Object System.Drawing.Font('Nirmala UI', 15)
  $l = New-Object System.Windows.Forms.Label
  $bt = $(if ($script:build -match '^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$') { $Matches[3] + '-' + $Matches[2] + '-' + $Matches[1] + '  ' + $Matches[4] + ':' + $Matches[5] } else { '?' })
  $l.Text = (T '4Kay4KeN4Kav4Ka+4Kaq4Kaf4Kaq4KeHIOCmleCmqOCnjeCmn+CnjeCmsOCni+CmsiDgpqrgp43gpq/gpr7gpqjgp4fgprIg4KaG4KawIOCmn+Cmv+CmreCmv+CmpOCnhyDgprjgp43gpp/gp4fgppwgKOCmquCngeCmsOCniyDgpqrgprDgp43gpqbgpr4pIOKAlCDgpqDgpr/gppXgpqDgpr7gppUg4KaP4Ka44KeH4Kab4KeHPwrgppXgp4Hgpofgppwg4Kar4Ka+4KaH4KayIOCmpOCniOCmsOCmv+CmsCDgprjgpq7gpq/gprw6IA==') + $bt + (T 'Cijgp6jgp6sg4Ka44KeH4KaV4KeH4Kao4KeN4KahIOCmquCmsOCnhyDgpo/gpocg4Kas4Ka+4KaV4KeN4Ka4IOCmqOCmv+CmnOCnhyDgpqzgpqjgp43gpqcg4Ka54Kas4KeHKQ==')
  $l.Font = $font; $l.ForeColor = [System.Drawing.Color]::White; $l.SetBounds(20, 14, 680, 150)
  $yes = New-Object System.Windows.Forms.Button
  $yes.Text = (T '4Ka54KeN4Kav4Ka+4KaBLCDgpqDgpr/gppUg4KaG4Kab4KeH'); $yes.Font = $font; $yes.SetBounds(20, 180, 250, 70); $yes.BackColor = [System.Drawing.Color]::FromArgb(244, 210, 122); $yes.DialogResult = 'OK'
  $sw = New-Object System.Windows.Forms.Button
  $sw.Text = (T '4Kao4Ka+LCDgpongprLgp43gpp/gp4sg4Ka54Kav4Ka84KeH4Kab4KeHIOKAlCDgpoXgpqbgprLgpqzgpqbgprIg4KaV4Kaw4KeL'); $sw.Font = $font; $sw.SetBounds(290, 180, 410, 70); $sw.BackColor = [System.Drawing.Color]::White; $sw.DialogResult = 'Retry'
  $f.Controls.AddRange(@($l, $yes, $sw)); $f.AcceptButton = $yes
  $timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 25000; $timer.Add_Tick({ $timer.Stop(); $f.DialogResult = 'OK' }.GetNewClosure()); $timer.Start()
  $r = $f.ShowDialog(); $timer.Stop(); $f.Dispose()
  return "$r"
}

$script:needDblClick = $false
if ($tv) {
  Say 'Placing: control on the laptop, stage full screen on the TV ...'
  $ok = PlaceAll $laptop $tv
  if (-not $ok) { Say 'Second try ...'; Start-Sleep -Milliseconds 800; $ok = PlaceAll $laptop $tv }
  if ($stage -eq [IntPtr]::Zero) {
    [void](Box ((T '4Ka44KeN4Kaf4KeH4KacIOCmnOCmvuCmqOCmvuCmsuCmvuCmn+CmvyDgppbgp4vgprLgp4fgpqjgpr/gpaQKCuCmleCmqOCnjeCmn+CnjeCmsOCni+CmsiDgpqrgp43gpq/gpr7gpqjgp4fgprLgp4cg4KaV4KeA4Kas4KeL4Kaw4KeN4Kah4KeH4KawIE8g4Kaa4Ka+4Kaq4KeB4KaoIOKAlCDgprjgp43gpp/gp4fgppwg4KaW4KeB4Kay4Kas4KeH4KWkIOCmuOCnh+Cmn+CmvuCmleCnhyDgpp/gp4fgpqjgp4cg4Kaf4Ka/4Kat4Ka/4Kak4KeHIOCmqOCmv+CmqCAo4Kas4Ka+IFdpbmRvd3MgKyBTaGlmdCArIOKGkiksIOCmpOCmvuCmsOCmquCmsCDgpp/gpr/gpq3gpr/gprAg4Kab4Kas4Ka/4Kak4KeHIOCmoeCmvuCmrOCmsi3gppXgp43gprLgpr/gppXgpaQ=')) 'OK' 'Warning')
  } else {
    $ans = AskRight $laptop
    if ($ans -eq 'Retry') {
      Say 'Operator: screens the wrong way round - swapping and remembering it.'
      $t = $laptop; $laptop = $tv; $tv = $t
      try { Set-Content -Path $cfgFile -Value ('LAPTOP=' + (MonKey $laptop)) -Encoding UTF8 } catch { }
      $script:needDblClick = $false
      [void](PlaceAll $laptop $tv)
    }
    if ($script:needDblClick) {
      [void](Box (T '4Ka44KeN4Kaf4KeH4KacIOCmn+Cmv+CmreCmv+CmpOCnhyDgpo/gprjgp4fgppvgp4csIOCmleCmv+CmqOCnjeCmpOCngSDgpqjgpr/gppzgp4cg4Kal4KeH4KaV4KeHIOCmquCngeCmsOCniyDgpqrgprDgp43gpqbgpr4g4Ka54Kav4Ka84Kao4Ka/4KWkCgrgpp/gpr/gpq3gpr/gprAg4Kab4Kas4Ka/4KawIOCmieCmquCmsCDgpq7gpr7gpongprgg4Kam4Ka/4Kav4Ka84KeHIOCmj+CmleCmrOCmvuCmsCDgpqHgpr7gpqzgprIt4KaV4KeN4Kay4Ka/4KaVIOCmleCmsOCngeCmqCDigJQg4Kaq4KeB4Kaw4KeLIOCmquCmsOCnjeCmpuCmviDgprngpq/gprzgp4cg4Kav4Ka+4Kas4KeH4KWk') 'OK' 'Information')
    }
    if ($ctl -ne [IntPtr]::Zero) { [void][QCWin]::Front($ctl) }
  }
} else {
  # laptop only: control on the left (58 %), stage on the right (42 %, a 16:9 picture at the top)
  $wx = $laptop.WL; $wy = $laptop.WT; $ww = $laptop.WW; $wh = $laptop.WH
  $cw = [int]($ww * 0.58); $sw = $ww - $cw; $sh = [Math]::Min($wh, [int]($sw * 9 / 16) + 40)
  if ($ctl -ne [IntPtr]::Zero) { [void][QCWin]::ShowWindow($ctl, 9); [void][QCWin]::SetWindowPos($ctl, [IntPtr]::Zero, $wx, $wy, $cw, $wh, 0x0040) }
  if ($stage -ne [IntPtr]::Zero) { [void][QCWin]::ShowWindow($stage, 9); [void][QCWin]::SetWindowPos($stage, [IntPtr]::Zero, $wx + $cw, $wy, $sw, $sh, 0x0040) }
  else { Say 'The stage window did not appear - press O in the control window.' }
  if ($ctl -ne [IntPtr]::Zero) { [void][QCWin]::Front($ctl) }
  Say 'Control on the left, stage on the right. Double-click the stage for full screen.'
}

# a desktop shortcut for next time
try {
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Quiz Corner START.lnk'
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = $(if ($script:startBat) { $script:startBat } else { Join-Path $here 'START_QUIZ_CORNER.bat' })
  $sc.WorkingDirectory = $here
  $sc.IconLocation = "$browser,0"
  $sc.Description = 'Quiz Corner - control on the laptop, stage on the TV'
  $sc.Save()
} catch { }

if ($script:wrongFile) {
  [void](Box ((T '4Kav4KeHIOCmleCngeCmh+CmnCDgpqvgpr7gpofgprLgpp/gpr8g4Kas4KeH4Kab4KeHIOCmqOCnh+Cmk+Cmr+CmvOCmviDgprngpq/gprzgp4fgppvgpr/gprIsIOCmuOCnh+Cmn+CmvyDgppbgp4HgprLgp4fgppvgp4cg4Kas4Kay4KeHIOCmruCmqOCnhyDgprngpprgp43gppvgp4cg4Kao4Ka+4KWkIOCmuOCmrCBRdWl6IENvcm5lciDgpongpofgpqjgp43gpqHgp4sg4Kas4Kao4KeN4KanIOCmleCmsOCnhyBTVEFSVF9RVUlaX0NPUk5FUi5iYXQg4KaG4Kas4Ka+4KawIOCmmuCmvuCmsuCmvuCmqOClpA==') + "`n`n" + $html.FullName) 'OK' 'Warning')
}
# --- the guard: during the whole show the control stays on the laptop and the stage full screen on the TV ---
# Windows moves windows about when the TV wakes up, changes input or is plugged in again, and a window can be dragged
# or put on the wrong screen by a key press. Every 2 seconds this puts them back. It ends by itself when the quiz is closed.
$lapKey = MonKey $laptop
$intKeys = @()
try { $intKeys = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorConnectionParams -ErrorAction Stop | Where-Object { $v = [uint32]$_.VideoOutputTechnology; $v -eq [uint32]2147483648 -or $v -eq 11 -or $v -eq 13 } | ForEach-Object { ($_.InstanceName -replace '_\d+$', '').ToUpper() }) } catch { }
function PickScreens($ms) {
  # the same choice as at the start: the laptop chosen then (by its hardware id), else its own panel, else the main display
  $l = $ms | Where-Object { (MonKey $_) -eq $lapKey } | Select-Object -First 1
  if (-not $l) { foreach ($m in $ms) { $p = ($m.DevId -replace '^\\\\\?\\', '') -split '#'; if ($p.Count -ge 3 -and $intKeys -contains (($p[0] + '\' + $p[1] + '\' + $p[2]).ToUpper())) { $l = $m; break } } }
  if (-not $l) { $l = $ms | Where-Object { $_.Primary } | Select-Object -First 1 }
  if (-not $l) { $l = $ms[0] }
  $t = $ms | Where-Object { $_.Device -ne $l.Device } | Sort-Object { $_.W * $_.H } -Descending | Select-Object -First 1
  return @($l, $t)
}
function QuizWins() { @([QCWin]::BrowserWindows() | Where-Object { $t = [QCWin]::Title($_); $t -like '*Broadcast Engine*' -or $t -like '*Quiz Corner*STAGE*' }) }
function IsStageWin($h) { return ([QCWin]::Title($h) -like '*STAGE*') }
function CtlToLaptop($h, $lap) {
  if ([QCWin]::IsFull($h)) { [void](Fullscreen $h $false) }
  [void][QCWin]::ShowWindow($h, 9)
  [void][QCWin]::SetWindowPos($h, [IntPtr]::Zero, $lap.WL + 20, $lap.WT + 20, [Math]::Max(800, $lap.WW - 40), [Math]::Max(560, $lap.WH - 40), 0x0040)
  Start-Sleep -Milliseconds 300
  [void][QCWin]::ShowWindow($h, 3)
}
function StageToTv($h, $scr) {
  if ([QCWin]::IsFull($h)) { [void](Fullscreen $h $false) }
  [void][QCWin]::ShowWindow($h, 9)
  [void][QCWin]::SetWindowPos($h, [IntPtr]::Zero, $scr.L, $scr.T, $scr.W, $scr.H, 0x0040)
  Start-Sleep -Milliseconds 700
  [void](Fullscreen $h $true)
}

Write-Host ''
Say ('Ready: build ' + (Human $build) + '.')
Write-Host ''
Write-Host '  KEEP THIS WINDOW OPEN (it goes to the taskbar by itself).' -ForegroundColor Black -BackgroundColor Yellow
Write-Host '  It keeps the CONTROL on the laptop and the STAGE on the TV for the whole show.'
Write-Host '  It ends by itself when the quiz windows are closed.'
Start-Sleep -Seconds 3
try { $cw = [QCWin]::GetConsoleWindow(); if ($cw -ne [IntPtr]::Zero) { [void][QCWin]::ShowWindow($cw, 6) } } catch { }
if ($ctl -ne [IntPtr]::Zero) { [void][QCWin]::Front($ctl) }

$gone = 0; $lastFix = Get-Date '2000-01-01'
while ($true) {
  Start-Sleep -Milliseconds 2000
  try {
    $wins = QuizWins
    if (-not $wins.Count) { $gone++; if ($gone -ge 3) { Say 'Quiz windows closed - the guard stops.'; break }; continue }
    $gone = 0
    $ms = Mons
    if ($ms.Count -lt 2) { continue } # no TV right now (sleeping, unplugged): nothing to put right
    $pair = PickScreens $ms; $lap = $pair[0]; $tvNow = $pair[1]
    if (-not $tvNow) { continue }
    $stages = @($wins | Where-Object { IsStageWin $_ }); $ctls = @($wins | Where-Object { -not (IsStageWin $_) })
    foreach ($c in $ctls) {
      if ([QCWin]::ScreenOf($c) -eq $tvNow.Device) {
        if ($ctls.Count -gt 1 -and -not $stages.Count) {
          # a stage window that lost its "#stage" and shows the control: close it and open the stage again
          Say 'GUARD: a control panel was showing on the TV (a lost stage window) - opening the stage again'
          [void][QCWin]::PostMessage($c, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
          Start-Sleep -Milliseconds 800
          $script:before = @([QCWin]::BrowserWindows())
          Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url#stage", '--new-window'))
          $ns = NewWin '*STAGE*' @() 10
          if ($ns -ne [IntPtr]::Zero) { StageToTv $ns $tvNow }
        } else {
          Say 'GUARD: the control panel was on the TV - moved back to the laptop'
          CtlToLaptop $c $lap
        }
        $lastFix = Get-Date
      }
    }
    foreach ($st in $stages) {
      if ([QCWin]::ScreenOf($st) -ne $tvNow.Device) {
        Say 'GUARD: the stage was not on the TV - moved back, full screen'
        StageToTv $st $tvNow
        $c0 = $ctls | Select-Object -First 1; if ($c0) { [void][QCWin]::Front($c0) }
        $lastFix = Get-Date
      }
    }
  } catch { Say ('GUARD: ' + $_.Exception.Message) }
}
exit 0
