# Quiz Corner — one-click launcher for Windows 10 / 11.
# Started by "START_QUIZ_CORNER.bat". It
#   1. makes sure the TV is a SEPARATE screen (Extend), asking the operator to press Windows+P if Windows will not switch,
#   2. tells the laptop screen from the TV (the laptop's own panel, else the main display),
#   3. opens the control window maximized on the laptop and the stage full screen on the TV, and checks both,
#   4. asks once "is it right?" — one click swaps the two screens, and the choice is remembered for next time.
# Both windows share one browser profile of their own, so they stay in sync, sound starts by itself
# and the event data stays in one place.  With no TV both windows open side by side on the laptop.
# A log of every start is kept in %LOCALAPPDATA%\QuizCorner\launcher_log.txt.

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
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

Say '----- start -----'
# Files downloaded from the internet carry a "blocked" mark; clear it for this folder.
Get-ChildItem -Path $here -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  ===  QUIZ CORNER  ===' -ForegroundColor Yellow
Write-Host ''

# --- the quiz file ---------------------------------------------------------
$html = Get-ChildItem -Path $here -Filter 'Quiz_Corner*Broadcast_Engine*.html' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $html) { $html = Get-ChildItem -Path $here -Filter 'Quiz_Corner*.html' -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1 }
if (-not $html) { Fail 'কুইজের HTML ফাইলটি এই ফোল্ডারে পাওয়া যায়নি। START_QUIZ_CORNER.bat, QuizCorner_Launcher.ps1 আর কুইজের HTML — তিনটে ফাইল একই ফোল্ডারে রাখুন।' 'The quiz HTML file is not in this folder.' }
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
  Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url", '--start-maximized'))
  Start-Sleep -Seconds 3
  Start-Process -FilePath $browser -ArgumentList ($common + @("--app=$url#stage", '--new-window'))
  [void](Box ("দুটো জানালা খোলা হয়েছে, কিন্তু এই কম্পিউটার নিজে থেকে জায়গামতো বসাতে দিচ্ছে না।`n`n" +
    "১. Windows + P চেপে 'Extend' বেছে নিন।`n" +
    "২. 'Quiz Corner — STAGE' জানালাটি মাউসে টেনে টিভিতে নিন (বা সেটায় ক্লিক করে Windows + Shift + → চাপুন)।`n" +
    "৩. টিভির ছবিতে একবার ডাবল-ক্লিক করুন — পুরো পর্দা হবে।") 'OK' 'Information')
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
    $ans = Box ("টিভিকে আলাদা পর্দা হিসেবে পাওয়া যাচ্ছে না।`n`n" +
      "১. HDMI তার ঠিকমতো লাগানো আছে কি না, আর টিভিতে HDMI ইনপুট বেছে নেওয়া আছে কি না দেখুন।`n" +
      "২. কীবোর্ডে Windows + P চাপুন ▸ 'Extend' (প্রসারিত) বেছে নিন।`n" +
      "   ('Duplicate' বা 'Second screen only' নয়)`n`n" +
      "তারপর 'Retry' চাপুন।`n" +
      "'Cancel' চাপলে শুধু ল্যাপটপে খুলবে (বাড়িতে মহড়ার জন্য)।") 'RetryCancel' 'Warning'
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
$ctl = NewWin '*Broadcast Engine*' @() 12
if ($ctl -ne [IntPtr]::Zero) { Say ('  control window: "' + [QCWin]::Title($ctl) + '"') } else { Say '  control window not found' }

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
  $f.StartPosition = 'Manual'; $f.ClientSize = New-Object System.Drawing.Size(720, 250); $f.BackColor = [System.Drawing.Color]::FromArgb(11, 33, 80)
  $f.Location = New-Object System.Drawing.Point(($lap.WL + [int](($lap.WW - 720) / 2)), ($lap.WT + [int](($lap.WH - 250) / 2)))
  $font = New-Object System.Drawing.Font('Nirmala UI', 15)
  $l = New-Object System.Windows.Forms.Label
  $l.Text = "ল্যাপটপে কন্ট্রোল প্যানেল আর টিভিতে স্টেজ (পুরো পর্দা) — ঠিকঠাক এসেছে?`n(২৫ সেকেন্ড পরে এই বাক্স নিজে বন্ধ হবে)"
  $l.Font = $font; $l.ForeColor = [System.Drawing.Color]::White; $l.SetBounds(20, 18, 680, 110)
  $yes = New-Object System.Windows.Forms.Button
  $yes.Text = 'হ্যাঁ, ঠিক আছে'; $yes.Font = $font; $yes.SetBounds(20, 150, 250, 70); $yes.BackColor = [System.Drawing.Color]::FromArgb(244, 210, 122); $yes.DialogResult = 'OK'
  $sw = New-Object System.Windows.Forms.Button
  $sw.Text = 'না, উল্টো হয়েছে — অদলবদল করো'; $sw.Font = $font; $sw.SetBounds(290, 150, 410, 70); $sw.BackColor = [System.Drawing.Color]::White; $sw.DialogResult = 'Retry'
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
    [void](Box ("স্টেজ জানালাটি খোলেনি।`n`nকন্ট্রোল প্যানেলে কীবোর্ডের O চাপুন — স্টেজ খুলবে। সেটাকে টেনে টিভিতে নিন (বা Windows + Shift + →), তারপর টিভির ছবিতে ডাবল-ক্লিক।") 'OK' 'Warning')
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
      [void](Box "স্টেজ টিভিতে এসেছে, কিন্তু নিজে থেকে পুরো পর্দা হয়নি।`n`nটিভির ছবির উপর মাউস দিয়ে একবার ডাবল-ক্লিক করুন — পুরো পর্দা হয়ে যাবে।" 'OK' 'Information')
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
  $sc.TargetPath = Join-Path $here 'START_QUIZ_CORNER.bat'
  $sc.WorkingDirectory = $here
  $sc.IconLocation = "$browser,0"
  $sc.Description = 'Quiz Corner - control on the laptop, stage on the TV'
  $sc.Save()
} catch { }

Write-Host ''
Say 'Ready. This window closes by itself.'
Start-Sleep -Seconds 2
exit 0
