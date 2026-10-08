# Quiz Corner — one-click launcher for Windows 10 / 11.
# Started by "START_QUIZ_CORNER.bat". It
#   1. switches a connected TV to Extend mode (if it is only mirroring),
#   2. opens the control window on the laptop and the stage full screen on the TV,
#   3. uses its own browser profile, so sound starts by itself and the event data stays in one place.
# With no TV connected it opens only the control window (for preparing at home).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Say($t) { Write-Host ('  ' + $t) }
function Fail($bn, $en) {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($bn + "`n`n" + $en, 'Quiz Corner', 'OK', 'Warning')
  exit 1
}

# Files downloaded from the internet carry a "blocked" mark; clear it for this folder.
Get-ChildItem -Path $here -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class QCWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  public delegate bool MonEnum(IntPtr h, IntPtr dc, ref RECT r, IntPtr d);
  public delegate bool WinEnum(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonEnum f, IntPtr d);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFO mi);
  [DllImport("user32.dll")] public static extern bool EnumWindows(WinEnum f, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

  public static void DpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
    try { SetProcessDPIAware(); } catch { }
  }
  // each monitor as { left, top, width, height, isPrimary } in real screen pixels
  public static List<int[]> Monitors() {
    var list = new List<int[]>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr dc, ref RECT r, IntPtr d) => {
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (GetMonitorInfo(h, ref mi)) list.Add(new int[] { mi.rcMonitor.L, mi.rcMonitor.T, mi.rcMonitor.R - mi.rcMonitor.L, mi.rcMonitor.B - mi.rcMonitor.T, (int)(mi.dwFlags & 1) });
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static IntPtr Find(string part, string not) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512); var t = sb.ToString();
      if (t.Contains(part) && (not == null || not.Length == 0 || !t.Contains(not))) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static bool Front(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // a tap of Alt lets us bring a window forward
    SetForegroundWindow(h);
    return GetForegroundWindow() == h;
  }
}
"@
[QCWin]::DpiAware()

Write-Host ''
Write-Host '  ===  QUIZ CORNER  ===' -ForegroundColor Yellow
Write-Host ''

# --- the quiz file ---------------------------------------------------------
$html = Get-ChildItem -Path $here -Filter 'Quiz_Corner*Broadcast_Engine*.html' -File | Select-Object -First 1
if (-not $html) { $html = Get-ChildItem -Path $here -Filter 'Quiz_Corner*.html' -File | Sort-Object Length -Descending | Select-Object -First 1 }
if (-not $html) { Fail 'কুইজের HTML ফাইলটি এই ফোল্ডারে পাওয়া যায়নি। ZIP-এর সব ফাইল একই ফোল্ডারে রাখুন।' 'The quiz HTML file is not in this folder.' }
$url = ([System.Uri]$html.FullName).AbsoluteUri
Say ('Quiz file : ' + $html.Name)

# --- the browser: Google Chrome, else Microsoft Edge -----------------------
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Fail 'Google Chrome বা Microsoft Edge পাওয়া যায়নি। যেকোনো একটি ইনস্টল করুন।' 'Install Google Chrome or Microsoft Edge.' }
Say ('Browser   : ' + (Split-Path -Leaf $browser))

# --- the TV ----------------------------------------------------------------
$mons = [QCWin]::Monitors()
if ($mons.Count -lt 2) {
  Say 'Only one screen found - asking Windows to EXTEND to the TV ...'
  try { Start-Process -FilePath "$env:WINDIR\System32\DisplaySwitch.exe" -ArgumentList '/extend' -Wait } catch { }
  for ($i = 0; $i -lt 12 -and $mons.Count -lt 2; $i++) { Start-Sleep -Milliseconds 700; $mons = [QCWin]::Monitors() }
}
$primary = $null; $tv = $null
foreach ($m in $mons) { if ($m[4] -eq 1 -and -not $primary) { $primary = $m } elseif ($m[4] -ne 1 -and -not $tv) { $tv = $m } }
if (-not $primary) { $primary = $mons[0] }
if ($tv) { Say ('TV screen : ' + $tv[2] + ' x ' + $tv[3]) } else { Say 'TV screen : not connected  (preparation mode - laptop only)' }

# --- a browser profile of its own (sound allowed, no pop-ups, data kept in one place) ---
$qcProfile = Join-Path $env:LOCALAPPDATA 'QuizCorner\BrowserProfile'
New-Item -ItemType Directory -Force -Path $qcProfile | Out-Null
# close windows left open by an earlier start (the quiz saves everything as it goes)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*QuizCorner\BrowserProfile*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch { } }
Start-Sleep -Milliseconds 800

$common = @(
  "--user-data-dir=`"$qcProfile`"", '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
  '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate,TranslateUI', '--disable-pinch', '--overscroll-history-navigation=0'
)

function WaitWin($part, $not) {
  for ($i = 0; $i -lt 160; $i++) { $h = [QCWin]::Find($part, $not); if ($h -ne [IntPtr]::Zero) { return $h }; Start-Sleep -Milliseconds 250 }
  return [IntPtr]::Zero
}

# 1. control window on the laptop
Say 'Opening the CONTROL window on the laptop ...'
Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url", '--start-maximized'))
$ctl = WaitWin 'Broadcast Engine' 'STAGE'

# 2. stage window on the TV, full screen
if ($tv) {
  Say 'Opening the STAGE on the TV ...'
  Start-Sleep -Milliseconds 600
  Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url#stage", '--new-window'))
  $stage = WaitWin 'STAGE' ''
  if ($stage -ne [IntPtr]::Zero) {
    [void][QCWin]::ShowWindow($stage, 1)
    [void][QCWin]::SetWindowPos($stage, [IntPtr]::Zero, $tv[0], $tv[1], $tv[2], $tv[3], 0x0040)
    Start-Sleep -Milliseconds 900
    if ([QCWin]::Front($stage)) { [System.Windows.Forms.SendKeys]::SendWait('{F11}'); Start-Sleep -Milliseconds 700; Say 'Stage is full screen on the TV.' }
    else { Say 'Could not make the stage full screen - double-click the TV picture once.' }
  } else { Say 'The stage window did not appear - press O in the control window.' }
}

# 3. control window back in front, maximized on the laptop
if ($ctl -ne [IntPtr]::Zero) {
  [void][QCWin]::ShowWindow($ctl, 1)
  [void][QCWin]::SetWindowPos($ctl, [IntPtr]::Zero, $primary[0] + 20, $primary[1] + 20, [Math]::Max(900, $primary[2] - 40), [Math]::Max(600, $primary[3] - 80), 0x0040)
  [void][QCWin]::ShowWindow($ctl, 3)
  [void][QCWin]::Front($ctl)
}

# a desktop shortcut for next time
try {
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Quiz Corner START.lnk'
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = Join-Path $here 'START_QUIZ_CORNER.bat'
  $sc.WorkingDirectory = $here
  $sc.IconLocation = "$browser,0"
  $sc.Description = 'Quiz Corner - control on the laptop, stage on the TV'
  $sc.Save()
} catch { }

Write-Host ''
Say 'Ready. This window closes by itself.'
Start-Sleep -Seconds 3
exit 0
