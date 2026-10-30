# Driving the built app on a real desktop: find its window, take its picture,
# and work it with the pointer and keyboard the way a person would.
#
# Every function here speaks in the window's own client coordinates, so a
# scenario can be written against what a screenshot shows rather than against
# where the window happens to sit. See README.md for the verbs a sibling
# implementation on another platform has to provide.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public static class NativeGui {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder name, int size);
  [DllImport("kernel32.dll")] public static extern void Sleep(uint ms);

  // Windows hands a process that has not said otherwise a pretend desktop,
  // scaled down by the display's scaling factor, and window positions come
  // back in those pretend pixels while a screen grab is taken in real ones.
  // On a 175% display that is a capture offset by a third of the window.
  // Say we understand the real thing, before anything asks where a window is.
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  public static void BeDpiAware() {
    try {
      // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
      if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
    } catch (EntryPointNotFoundException) { }
    SetProcessDPIAware();
  }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int size);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public MOUSEINPUT mi;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }

  const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
  const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
  const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
  const uint MOUSEEVENTF_ABSOLUTE = 0x8000, MOUSEEVENTF_VIRTUALDESK = 0x4000, MOUSEEVENTF_WHEEL = 0x0800;
  const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;

  // Absolute mouse input is in 0..65535 over the whole virtual desktop, not
  // in pixels, and not over the primary screen alone.
  static void Normalise(int x, int y, out int nx, out int ny) {
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77);   // SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
    int vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);   // SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN
    nx = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
    ny = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
  }

  static void Send(INPUT[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != inputs.Length) throw new InvalidOperationException("SendInput sent " + sent + " of " + inputs.Length);
  }

  static INPUT Mouse(uint flags, int x, int y, uint data) {
    int nx, ny; Normalise(x, y, out nx, out ny);
    INPUT i = new INPUT(); i.type = INPUT_MOUSE;
    i.mi.dx = nx; i.mi.dy = ny; i.mi.mouseData = data;
    i.mi.dwFlags = flags | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    return i;
  }

  public static void MoveTo(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE, x, y, 0) }); }
  public static void LeftDown(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTDOWN, x, y, 0) }); }
  public static void LeftUp(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTUP, x, y, 0) }); }
  public static void RightDown(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_RIGHTDOWN, x, y, 0) }); }
  public static void RightUp(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_RIGHTUP, x, y, 0) }); }
  public static void Wheel(int x, int y, int notches) { Send(new[] { Mouse(MOUSEEVENTF_WHEEL, x, y, (uint)(notches * 120)) }); }
  // Two fingers on a precision touchpad reach a page as wheel messages of a
  // fraction of a notch each, sideways ones too - beginning with a step of
  // a pixel or two, however fast the stroke, which is how Meno tells them
  // from a wheel's notch (lib/input/wheel.ts reads a run by its first
  // step): so a stroke begins with one such step, 2 units, about 1.7 px.
  const uint MOUSEEVENTF_HWHEEL = 0x1000;
  public static void Swipe(int x, int y, int dx, int dy, int steps) {
    const int first = 2;
    if (dy != 0) Send(new[] { Mouse(MOUSEEVENTF_WHEEL, x, y, (uint)(dy > 0 ? -first : first)) });
    else if (dx != 0) Send(new[] { Mouse(MOUSEEVENTF_HWHEEL, x, y, (uint)(dx > 0 ? first : -first)) });
    Sleep(16);
    for (int i = 0; i < steps; i++) {
      int wy = -(dy / steps) * 120 / 100, wx = (dx / steps) * 120 / 100;
      if (wy != 0) Send(new[] { Mouse(MOUSEEVENTF_WHEEL, x, y, (uint)wy) });
      if (wx != 0) Send(new[] { Mouse(MOUSEEVENTF_HWHEEL, x, y, (uint)wx) });
      Sleep(16);
    }
  }

  // Text goes in as Unicode scan codes, so it does not depend on the
  // keyboard layout the machine happens to have.
  public static void TypeChar(char c) {
    INPUT down = new INPUT(); down.type = INPUT_KEYBOARD; down.ki.wScan = c; down.ki.dwFlags = KEYEVENTF_UNICODE;
    INPUT up = down; up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    Send(new[] { down, up });
  }

  // A shortcut: the modifiers down in order, the key, and the modifiers up
  // in reverse - the order a hand presses them - in one SendInput call.
  public static void Chord(ushort[] modifiers, ushort vk) {
    INPUT[] seq = new INPUT[modifiers.Length * 2 + 2];
    int n = 0;
    foreach (ushort m in modifiers) seq[n++] = Key(m, false);
    seq[n++] = Key(vk, false);
    seq[n++] = Key(vk, true);
    for (int i = modifiers.Length - 1; i >= 0; i--) seq[n++] = Key(modifiers[i], true);
    Send(seq);
  }

  static INPUT Key(ushort vk, bool up) {
    INPUT i = new INPUT(); i.type = INPUT_KEYBOARD; i.ki.wVk = vk;
    if (up) i.ki.dwFlags = KEYEVENTF_KEYUP;
    return i;
  }

  // Modifier keys pressed, in order, or let go, in reverse: held through a
  // click or a drag.
  public static void Hold(ushort[] vks, bool up) {
    if (vks.Length == 0) return;
    INPUT[] seq = new INPUT[vks.Length];
    for (int i = 0; i < vks.Length; i++) seq[i] = Key(vks[up ? vks.Length - 1 - i : i], up);
    Send(seq);
  }

  public static void TapKey(ushort vk) {
    INPUT down = new INPUT(); down.type = INPUT_KEYBOARD; down.ki.wVk = vk;
    INPUT up = down; up.ki.dwFlags = KEYEVENTF_KEYUP;
    Send(new[] { down, up });
  }

  // Windows only lets the process that owns the foreground put a window
  // there. A process that has just sent input counts as one the user is
  // driving, so a keystroke nobody uses buys the right to raise the window.
  public static bool Raise(IntPtr h) {
    INPUT nudge = new INPUT();
    nudge.type = INPUT_KEYBOARD; nudge.ki.wVk = 0x12; nudge.ki.dwFlags = KEYEVENTF_KEYUP;  // VK_MENU up
    Send(new[] { nudge });
    for (int i = 0; i < 20; i++) {
      SetForegroundWindow(h);
      if (GetForegroundWindow() == h) return true;
      Sleep(50);
    }
    return false;
  }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

# Before any window is measured or any pixel read.
[NativeGui]::BeDpiAware()

# (a question about the network is answered by the person at the computer,
# never by a run: MenoConsent.psm1 decides, from what UI Automation names
# the part a press lands on, or the part that has the keys)
Import-Module (Join-Path $PSScriptRoot "MenoConsent.psm1")
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase

$script:Window = [IntPtr]::Zero
# (Meno's process, for the guard's reading of its windows' buttons)
$script:MenoPid = 0

function Get-MenoBuild {
    # Where `npm run tauri build` leaves the app on this platform.
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../src-tauri/target/release/Meno.exe"))
}

function Get-MenoProfile {
    # The folder of the Meno under test's settings, its settings.json in it (src-tauri/src/folders.rs, data_dir: the roaming one).
    return Join-Path $env:APPDATA "Meno"
}

function Start-MenoProcess {
    param([Parameter(Mandatory)] [string] $Path)
    Start-Process -FilePath $Path | Out-Null
}

function Close-MenoProcess {
    <#
      .SYNOPSIS
      Ask a running copy to close its window, and put it down if it will not.
    #>
    param([Parameter(Mandatory)] [System.Diagnostics.Process] $Process)
    $Process.CloseMainWindow() | Out-Null
    if (-not $Process.WaitForExit(4000)) { $Process.Kill() }
}

function Complete-FileDialog {
    <#
      .SYNOPSIS
      The system's open dialog is on its way up: choose this file in it.

      .DESCRIPTION
      It opens with the focus in its name field, which takes a whole path.
      It is waited for, not slept for: a path typed before it is up goes to
      whatever has the keys - Meno's window - and the file is never opened,
      so everything after would be checked against the wrong drawing. It
      has to go again once Return is pressed; if it stays (a path it could
      not find brings a message up in the same kind of window), that fails
      too, rather than going on.
    #>
    param([Parameter(Mandatory)] [string] $Path, [int] $TimeoutMs = 15000)
    Wait-ForegroundClass -Class $DialogClass -What "the open dialog to come up" -TimeoutMs $TimeoutMs
    Start-Sleep -Milliseconds 400 # (it takes keys a moment after it is in front)
    Send-MenoText -Text $Path
    Send-MenoKey -Key Enter
    Wait-ForegroundClass -Class $DialogClass -Not -What "the open dialog to go" -TimeoutMs $TimeoutMs
    Start-Sleep -Milliseconds 800
}

function Complete-SaveDialog {
    <#
      .SYNOPSIS
      The system's save dialog is on its way up: save under this path in it.

      .DESCRIPTION
      Its name field takes a whole path, as the open dialog's does, with the
      name chosen in it, so the path is typed over it and Return saves.
      (Not yet run on Windows.)
    #>
    param([Parameter(Mandatory)] [string] $Path, [int] $TimeoutMs = 15000)
    Complete-FileDialog -Path $Path -TimeoutMs $TimeoutMs
}

# The window class of the system's dialogs, the open dialog among them.
$DialogClass = "#32770"

function Get-WindowClass([IntPtr] $Handle) {
    $name = New-Object System.Text.StringBuilder 256
    [void][NativeGui]::GetClassName($Handle, $name, $name.Capacity)
    $name.ToString()
}

function Get-ForegroundClass { Get-WindowClass ([NativeGui]::GetForegroundWindow()) }

function Wait-ForegroundClass {
    # Until the window in front is of this class (or, with -Not, is not).
    param([string] $Class, [switch] $Not, [string] $What, [int] $TimeoutMs)
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    while (((Get-ForegroundClass) -eq $Class) -eq [bool]$Not) {
        if ((Get-Date) -gt $deadline) { throw "waited $($TimeoutMs / 1000)s for $What" }
        Start-Sleep -Milliseconds 150
    }
}

function Get-MenoWindow {
    <#
      .SYNOPSIS
      The main window of a running process, waited for rather than assumed:
      a freshly started app has no window for a second or two.

      .DESCRIPTION
      Nor is the first window it has always the one on screen: Tauri's event
      loop makes a window of its own, and for a moment that is what Windows
      calls the process's main window. Placed, it moves nothing anyone sees -
      the app's window stays where it opened, and every click misses - so it
      is passed over until the app's own window is there.
    #>
    param(
        [string] $ProcessName = "Meno",
        [int] $TimeoutSec = 30
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and (Get-WindowClass $_.MainWindowHandle) -ne "Tao Thread Event Target" } |
            Select-Object -First 1
        if ($p) {
            $script:Window = $p.MainWindowHandle
            $script:MenoPid = $p.Id
            return $script:Window
        }
        Start-Sleep -Milliseconds 250
    }
    throw "no window for process '$ProcessName' after ${TimeoutSec}s"
}

function Set-MenoWindow {
    <#
      .SYNOPSIS
      Bring the window forward and put it at a known size, so that a
      screenshot taken now and one taken next week can be compared.
    #>
    param(
        [int] $Width = 1280,
        [int] $Height = 860,
        [int] $Left = 40,
        [int] $Top = 40
    )
    if ($script:Window -eq [IntPtr]::Zero) { throw "call Get-MenoWindow first" }
    if ([NativeGui]::IsIconic($script:Window)) { [NativeGui]::ShowWindow($script:Window, 9) | Out-Null }  # SW_RESTORE
    # SWP_NOZORDER is deliberately not set: the window has to be on top for
    # the screen to hold its picture at all.
    [NativeGui]::SetWindowPos($script:Window, [IntPtr]::Zero, $Left, $Top, $Width, $Height, 0x0040) | Out-Null
    if (-not [NativeGui]::Raise($script:Window)) {
        throw "the window would not come to the front. A capture would then show whatever is over it, so there is no point going on: check that the desktop is unlocked and that nothing is holding the foreground."
    }
    Start-Sleep -Milliseconds 400
}

function Get-ClientOrigin {
    # Where the window's drawing area starts on the screen.
    $p = New-Object NativeGui+POINT
    $p.X = 0; $p.Y = 0
    [NativeGui]::ClientToScreen($script:Window, [ref] $p) | Out-Null
    return @{ X = $p.X; Y = $p.Y }
}

function Get-ClientSize {
    $r = New-Object NativeGui+RECT
    [NativeGui]::GetClientRect($script:Window, [ref] $r) | Out-Null
    return @{ Width = $r.Right - $r.Left; Height = $r.Bottom - $r.Top }
}

function ConvertTo-Screen {
    param([int] $X, [int] $Y)
    $o = Get-ClientOrigin
    return @{ X = $o.X + $X; Y = $o.Y + $Y }
}

function Save-MenoShot {
    <#
      .SYNOPSIS
      The window's drawing area, as it is on screen.

      .DESCRIPTION
      Off the screen rather than out of the window, on purpose: PrintWindow
      hands back a black rectangle where the page is drawn with the GPU, which
      is every part of this app worth looking at. The window therefore has to
      be unoccluded, and the desktop unlocked.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    $o = Get-ClientOrigin
    $s = Get-ClientSize
    if ($s.Width -le 0 -or $s.Height -le 0) { throw "the window has no drawing area" }
    $bmp = New-Object System.Drawing.Bitmap $s.Width, $s.Height
    try {
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CopyFromScreen($o.X, $o.Y, 0, 0, (New-Object System.Drawing.Size $s.Width, $s.Height))
        } finally { $g.Dispose() }
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bmp.Dispose() }
    return $Path
}

function Get-HeldKeys {
    # -Hold's names as virtual keys: Shortcut is Ctrl here, Command on a Mac.
    param([string[]] $Hold)
    # The comma keeps the array whole: returned bare, an empty one unrolls to
    # $null and a single key to a scalar, and Hold() is handed neither.
    return , [uint16[]] @($Hold | ForEach-Object { @{ Shortcut = 0x11; Shift = 0x10; Alt = 0x12 }[$_] })
}

function Invoke-MenoClick {
    <#
      .SYNOPSIS
      Click - or right-click - at a point, with the modifier keys -Hold names
      held: Shortcut (Ctrl here, Command on a Mac), Shift, Alt.
    #>
    param(
        [Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Count = 1, [switch] $Right,
        [ValidateSet("Shortcut", "Shift", "Alt")] [string[]] $Hold = @()
    )
    $keys = Get-HeldKeys $Hold
    [NativeGui]::Hold($keys, $false)
    try { Invoke-WinClick $X $Y $Count $Right } finally { [NativeGui]::Hold($keys, $true) }
}

function Get-UiaChain($Element) {
    # A part as UI Automation names it, and what it sits in: "role<TAB>name" each, itself first, a few levels up.
    $links = @()
    $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
    $e = $Element
    for ($i = 0; $i -lt 6 -and $e; $i++) {
        $role = $e.Current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
        $links += "$role`t$($e.Current.Name -replace "`t", ' ')"
        $e = $walker.GetParent($e)
    }
    return , $links
}

function Read-WinButtons {
    # Every button of Meno's windows, as UI Automation names them, with where each is, in screen pixels - the guard's reading: the part at a point is Tauri's resize-border pane, over the whole page.
    $pidIs = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$script:MenoPid)
    $isButton = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $pidIs)
    if (-not $windows -or $windows.Count -eq 0) { throw "UI Automation gave no window of Meno's (pid $script:MenoPid)" }
    $isDocument = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
    # (the page itself, with something in it: built for UI Automation, whatever it shows - a talk hides the top bar's buttons)
    $page = $false
    foreach ($win in $windows) {
        $doc = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $isDocument)
        if ($doc -and [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetFirstChild($doc)) { $page = $true }
    }
    $buttons = foreach ($win in $windows) {
        foreach ($b in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isButton)) {
            $r = $b.Current.BoundingRectangle
            # (one with no bounds kept as such: a yes read so stops a press - MenoConsent.psm1)
            if ($r.IsEmpty) { [pscustomobject]@{ Name = $b.Current.Name; X = 0; Y = 0; Width = 0; Height = 0 }; continue }
            [pscustomobject]@{ Name = $b.Current.Name; X = $r.X; Y = $r.Y; Width = $r.Width; Height = $r.Height }
        }
    }
    [pscustomobject]@{ Buttons = @($buttons); Page = $page }
}

$script:MenoFamily = @()
function Get-MenoFamily {
    # Meno's own processes under it - its web view's (WebView2) - for a point UI Automation answers with one of theirs; read again where a pid is not among them.
    # (it holds whatever Meno started too - a calculation's program, a window of its own: a press there counts as on Meno's. No harm to the
    # guard: the yes it stops is told by Meno's buttons, read apart from this, and only Meno asks a question about the network)
    param([int] $Root, [switch] $Again)
    if ($Again -or -not $script:MenoFamily.Count -or $script:MenoFamily[0] -ne $Root) {
        $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)
        $family = [System.Collections.Generic.List[int]]::new(); $family.Add($Root)
        for ($i = 0; $i -lt $family.Count; $i++) { foreach ($p in $all) { if ($p.ParentProcessId -eq $family[$i] -and -not $family.Contains([int]$p.ProcessId)) { $family.Add([int]$p.ProcessId) } } }
        $script:MenoFamily = $family.ToArray()
    }
    return $script:MenoFamily
}

function Assert-NotYesAt {
    # A press at a point, in screen pixels, that would land on the yes of a question about the network - or whose buttons could not be read - stopped before it is sent.
    param([Parameter(Mandatory)] $At, [string] $What = "a press")
    $label = "$What at ($($At.X), $($At.Y)) px"
    # (the window at the point: Meno's, the one whose buttons are read - not another copy's; UI Automation's own answer there, Tauri's pane included, is the window's process)
    $readAt = {
        $el = [System.Windows.Automation.AutomationElement]::FromPoint([System.Windows.Point]::new($At.X, $At.Y))
        if (-not $el) { throw "UI Automation gave nothing for the point" }
        [int]$el.Current.ProcessId
    }
    $family = Get-MenoFamily -Root $script:MenoPid
    # (a process of Meno's started since its family was last read: read again once)
    $atPid = try { & $readAt } catch { $null }
    if ($atPid -is [int] -and $atPid -ne $script:MenoPid -and $family -notcontains $atPid) { $family = Get-MenoFamily -Root $script:MenoPid -Again }
    Assert-OnMeno -MenoPid $script:MenoPid -Family $family -What $label -Read $readAt
    Assert-NotPressingYes -Look (Read-PageButtons -Read { Read-WinButtons }) -At $At -What $label
}

function Assert-NotYesKeys {
    # Keys sent while a question about the network has its yes in focus - or while what has the keys could not be read - stopped before they are sent.
    param([Parameter(Mandatory)] [string] $What)
    $look = Read-Part {
        $el = [System.Windows.Automation.AutomationElement]::FocusedElement
        if (-not $el) { throw "UI Automation gave nothing for what has the keys" }
        [pscustomobject]@{ Chain = (Get-UiaChain $el) }
    }
    Assert-NotNetworkYes -Look $look -What $What
}

function Invoke-WinClick([int] $X, [int] $Y, [int] $Count, [bool] $Right) {
    $p = ConvertTo-Screen $X $Y
    Assert-NotYesAt -At $p -What "a click"
    if ($Right) {
        [NativeGui]::RightDown($p.X, $p.Y)
        Start-Sleep -Milliseconds 30
        [NativeGui]::RightUp($p.X, $p.Y)
        Start-Sleep -Milliseconds 120
        return
    }
    for ($i = 0; $i -lt $Count; $i++) {
        [NativeGui]::LeftDown($p.X, $p.Y)
        Start-Sleep -Milliseconds 30
        [NativeGui]::LeftUp($p.X, $p.Y)
        if ($i -lt $Count - 1) { Start-Sleep -Milliseconds 90 }
    }
    Start-Sleep -Milliseconds 120
}

function Invoke-MenoDrag {
    <#
      .SYNOPSIS
      Press, travel, release - with the travel broken into steps.

      .DESCRIPTION
      A jump straight from one point to the other is a single pointermove, and
      the editor asks for several: it waits a few pixels before it calls a
      press a drag at all, and the preview it draws follows the moves rather
      than the release.

      -Count is there for the Mac's sake: Windows counts the clicks itself,
      so a drag straight after an Invoke-MenoClick on the same point is
      already the second click of a double-click.

      -Hold names the modifier keys held through it, as Invoke-MenoClick's;
      -Via, points it passes through on its way, @(@(x, y), ...) - a lasso's;
      -PressMs, how long the button is held still before it travels: 600
      makes the press a long press.
    #>
    param(
        [Parameter(Mandatory)] [int] $FromX, [Parameter(Mandatory)] [int] $FromY,
        [Parameter(Mandatory)] [int] $ToX, [Parameter(Mandatory)] [int] $ToY,
        [int] $Steps = 12,
        [int] $StepMs = 25,
        [int] $PressMs = 80,
        [int] $Count = 1,
        [scriptblock] $AtStep,
        [switch] $Right,
        [ValidateSet("Shortcut", "Shift", "Alt")] [string[]] $Hold = @(),
        [int[][]] $Via = @()
    )
    $path = Get-DragPath $FromX $FromY $Via $ToX $ToY $Steps
    $keys = Get-HeldKeys $Hold
    [NativeGui]::Hold($keys, $false)
    try { Invoke-WinDrag $FromX $FromY $ToX $ToY $path $StepMs $PressMs $AtStep $Right } finally { [NativeGui]::Hold($keys, $true) }
}

function Get-DragPath {
    # The points a drag passes through, in client coordinates: -Steps of them
    # on each leg, from the start through each of -Via to the end.
    param([int] $FromX, [int] $FromY, [int[][]] $Via, [int] $ToX, [int] $ToY, [int] $Steps)
    $corners = @(, @($FromX, $FromY)) + @($Via | Where-Object { $_ }) + @(, @($ToX, $ToY))
    $path = @()
    for ($k = 1; $k -lt $corners.Count; $k++) {
        $p = $corners[$k - 1]; $q = $corners[$k]
        for ($i = 1; $i -le $Steps; $i++) {
            $t = $i / $Steps
            $path += , @([int]($p[0] + ($q[0] - $p[0]) * $t), [int]($p[1] + ($q[1] - $p[1]) * $t))
        }
    }
    return , $path
}

function Invoke-WinDrag([int] $FromX, [int] $FromY, [int] $ToX, [int] $ToY, $path, [int] $StepMs, [int] $PressMs, [scriptblock] $AtStep, [bool] $Right) {
    $a = ConvertTo-Screen $FromX $FromY
    # (where the button goes down and where it comes up)
    Assert-NotYesAt -At $a -What "a drag's press"
    Assert-NotYesAt -At (ConvertTo-Screen $ToX $ToY) -What "a drag's end"
    [NativeGui]::MoveTo($a.X, $a.Y)
    Start-Sleep -Milliseconds 80
    if ($Right) { [NativeGui]::RightDown($a.X, $a.Y) } else { [NativeGui]::LeftDown($a.X, $a.Y) }
    Start-Sleep -Milliseconds $PressMs
    for ($i = 1; $i -le $path.Count; $i++) {
        $p = ConvertTo-Screen $path[$i - 1][0] $path[$i - 1][1]
        [NativeGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds $StepMs
        if ($AtStep) { & $AtStep $i }
    }
    $b = ConvertTo-Screen $ToX $ToY
    if ($Right) { [NativeGui]::RightUp($b.X, $b.Y) } else { [NativeGui]::LeftUp($b.X, $b.Y) }
    Start-Sleep -Milliseconds 200
}

function Move-MenoPointer {
    <#
      .SYNOPSIS
      Put the pointer over a point and leave it there: hover.

      .DESCRIPTION
      It arrives from a few pixels to the left, so the page sees a move over
      the point rather than a pointer that was simply found there.
    #>
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y)
    $p = ConvertTo-Screen $X $Y
    [NativeGui]::MoveTo($p.X - 4, $p.Y)
    Start-Sleep -Milliseconds 60
    [NativeGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 200
}

function Move-MenoPointerAlong {
    <#
      .SYNOPSIS
      Lead the pointer through points with no button down, as a hand would:
      a chain traced with the button up.

      .DESCRIPTION
      Each point is one move, straight on from the one before - not arrived
      at from the side, as Move-MenoPointer's is, which would make the way
      traced a zigzag. -AtStep is called after each, with its number: where
      a screenshot on the way goes.
    #>
    param([Parameter(Mandatory)] [int[][]] $Path, [int] $StepMs = 25, [scriptblock] $AtStep)
    for ($i = 1; $i -le $Path.Count; $i++) {
        $p = ConvertTo-Screen $Path[$i - 1][0] $Path[$i - 1][1]
        [NativeGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds $StepMs
        if ($AtStep) { & $AtStep $i }
    }
    Start-Sleep -Milliseconds 200
}

function Invoke-MenoSwipe {
    param(
        [Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y,
        [int] $DX = 0, [int] $DY = 0, [int] $Steps = 10, [switch] $Held
    )
    $p = ConvertTo-Screen $X $Y
    # (-Held: where the pointer is, a button held down - in a drag's -AtStep)
    if (-not $Held) {
        [NativeGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds 60
    }
    [NativeGui]::Swipe($p.X, $p.Y, $DX, $DY, $Steps)
    Start-Sleep -Milliseconds 200
}

function Invoke-MenoWheel {
    # Turn the wheel over a point: positive notches upwards, as a page reads a
    # turn (deltaY below 0), negative downwards. Which way that zooms is Meno's
    # Settings' to say: to zoom by what is meant, Invoke-MenoZoom (run.ps1).
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Notches = 1)
    $p = ConvertTo-Screen $X $Y
    [NativeGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 60
    [NativeGui]::Wheel($p.X, $p.Y, $Notches)
    Start-Sleep -Milliseconds 200
}

function Send-MenoText {
    param([Parameter(Mandatory)] [string] $Text, [int] $CharMs = 8)
    Assert-NotYesKeys -What "typing"
    foreach ($c in $Text.ToCharArray()) {
        [NativeGui]::TypeChar($c)
        Start-Sleep -Milliseconds $CharMs
    }
}

function Send-MenoKey {
    param([Parameter(Mandatory)] [ValidateSet("Enter", "Escape", "Tab", "Backspace", "Up", "Down")] [string] $Key, [switch] $Shift)
    # (Escape answers a question no: always let through)
    if ($Key -ne "Escape") { Assert-NotYesKeys -What "the $Key key" }
    $vk = @{ Enter = 0x0D; Escape = 0x1B; Tab = 0x09; Backspace = 0x08; Up = 0x26; Down = 0x28 }[$Key]
    # (with Shift, if asked: Shift+Enter)
    if ($Shift) { [NativeGui]::Chord([uint16[]] @(0x10), [uint16] $vk) }
    else { [NativeGui]::TapKey([ushort] $vk) }
    Start-Sleep -Milliseconds 150
}

function Send-MenoShortcut {
    <#
      .SYNOPSIS
      The platform's shortcut key - Ctrl here, Cmd on a Mac - with a letter
      or a digit, and Shift if asked: Send-MenoShortcut Z is undo.
    #>
    param([Parameter(Mandatory)] [ValidatePattern("^[A-Za-z0-9]$")] [string] $Key, [switch] $Shift)
    Assert-NotYesKeys -What "a shortcut"
    $mods = @([uint16] 0x11)                  # VK_CONTROL
    if ($Shift) { $mods += [uint16] 0x10 }    # VK_SHIFT
    # A letter's or digit's virtual key is its upper-case ASCII code.
    [NativeGui]::Chord([uint16[]] $mods, [uint16][char] $Key.ToUpperInvariant())
    Start-Sleep -Milliseconds 150
}

function Wait-MenoSettled {
    <#
      .SYNOPSIS
      Wait until the drawing stops changing, rather than sleeping a guess.
      Animations here run for a few hundred milliseconds after a gesture.
    #>
    param([int] $TimeoutMs = 4000, [int] $QuietMs = 400)
    $tmp = Join-Path $env:TEMP "meno-settle"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $a = Join-Path $tmp "a.png"
    $b = Join-Path $tmp "b.png"
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    Save-MenoShot -Path $a | Out-Null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds $QuietMs
        Save-MenoShot -Path $b | Out-Null
        if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { return $true }
        Copy-Item $b $a -Force
    }
    Write-Warning "the drawing was still changing after ${TimeoutMs}ms"
    return $false
}

Export-ModuleMember -Function Get-MenoBuild, Get-MenoProfile, Start-MenoProcess, Close-MenoProcess, Complete-FileDialog, Complete-SaveDialog,
    Get-MenoWindow, Set-MenoWindow, Get-ClientOrigin, Get-ClientSize,
    ConvertTo-Screen, Save-MenoShot, Invoke-MenoClick, Invoke-MenoDrag, Move-MenoPointer, Move-MenoPointerAlong, Invoke-MenoWheel, Invoke-MenoSwipe,
    Send-MenoText, Send-MenoKey, Send-MenoShortcut, Wait-MenoSettled
