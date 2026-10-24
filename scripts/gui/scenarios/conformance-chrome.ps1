# The maintainer's rulings on Meno's window, tabs, menus, page objects and
# files, each turned into a step and a shot or a film - to run again on every
# release candidate (bug hunt C, 2026-10-13; the 2D drawing's are
# conformance-2d.ps1). It is run in two parts: first
# with CONFORMANCE_PART=first from an emptied settings.json - a first run,
# which ends as its one tab is closed and Meno goes - then with
# CONFORMANCE_PART=rest, Meno started again on the settings the first part
# left (whoever runs it empties settings.json, and puts it back after).
# Run in one (no CONFORMANCE_PART), Meno is started again between them -
# which the system may not let come to the front. What each must show:
#
# - "first-start": the page alone - no guide opens of itself (Getting
#   started's is shown only when asked, from Settings, Plugins).
# - "update-asked": the question about keeping Meno up to date, a moment
#   after (declined with Escape).
# - "chrome": no buttons on the canvas, no logo menu; along the top the
#   tabs, +, the network's globe, Save and Settings - Save beside Settings.
# - "menu-bar" (a shot of the screen's menu bar, Meno in front): Meno's
#   name and nothing but the system's own - no File, Edit or View of
#   Meno's commands.
# - "stereo-hidden": a stereocentre and an E double bond drawn: no R/S, no
#   E/Z.
# - "settings-chemistry": one setting for both, named for R/S and E/Z.
# - "settings-colours": the colour sets, Meno's and Okabe-Ito, their
#   swatches in their exact colours (checked by pixel against
#   src/lib/chem/palette.ts after the run).
# - "selection-menu": a structure selected and right-clicked: Export among
#   what can be done with it.
# - "empty-menu", "menu-click-only-closes": the menu on empty space, then a
#   click on empty space - the menu closed, nothing else (no Quick Add, no
#   label begun).
# - "quick-add" (and the film "quick-add.mov"): a double-click on empty
#   space - Quick Add, at once, its row holding Chain and SMILES.
# - "paste-twice": a second paste at the same place lands a step down and
#   to the right of the first.
# - "escape-drag": a drag with Escape on the way - the atom back where it
#   was.
# - "open-adds-to-front": a file opened with something drawn -
#   added to the workspace in front, no tab made; only a .meno opens a tab
#   (the maintainer, 2026-10-13).
# - "chip-hover", "chip-click", "chip-wheel": a stack's chip stays shut
#   under the pointer, opens on a click; the wheel over it zooms the view.
# - "frames-hover", "frames-click", "frames-wheel": the same for a
#   trajectory's frames chip.
# - "column-open", "column-closed": a text read in the column; a
#   double-click on the canvas closes the column.
# - "unreadable": a file that is no molecule - its message,
#   naming no program and no mechanism, and no tab made for it.
# - "meno-own-tab": a .meno opened over a tab with something drawn - a tab
#   of its own, named for it (the tab strip shows each: tabs made or not).
# - films "tab-switch.mov", "settings-open.mov", "settings-close.mov",
#   "column-open.mov", "column-close.mov": no jumps (checked frame by frame
#   after the run: each change spread over frames, eased).
# - "last-tab-quits" (logged), right after the first run's shots: the one
#   tab closed - Meno gone; it is started again for the rest.
#
# Coordinates are a Mac's 2560x1720 shot's (read off it on 2026-10-13;
# Windows wants its own). Phenylethanol from a SMILES in the middle: its C2
# at 1238,996 (as conformance-2d.ps1 has it).

$Fixtures = Join-Path $PSScriptRoot "../fixtures"
function Hand([int] $X, [int] $Y, [int] $Ms = 110, [switch] $Right) {
  Invoke-MenoDrag -FromX $X -FromY $Y -ToX $X -ToY $Y -Steps 1 -StepMs 10 -PressMs ($Ms - 10) -Right:$Right
}
function Calm { Send-MenoKey Escape; Start-Sleep -Milliseconds 250; Move-MenoPointer -X 1850 -Y 600; Start-Sleep -Milliseconds 300 }
function Undo([int] $Times = 1) { foreach ($i in 1..$Times) { Send-MenoShortcut Z; Start-Sleep -Milliseconds 400 } }
# (Open, tried again once where the system's panel did not take the path: the harness's, not Meno's)
function OpenFile([string] $Path) {
  try { Open-MenoFile $Path } catch {
    Write-Host "  (the open panel again: $_)"
    Send-MenoKey Escape; Start-Sleep -Milliseconds 1200
    Open-MenoFile $Path
  }
}
function Film([string] $Name, [int] $Secs, [scriptblock] $Act) {
  $wid = Get-MenoWindow
  $p = Start-Process -FilePath /usr/sbin/screencapture -ArgumentList @("-v", "-V$Secs", "-l$wid", "-x", (Join-Path $Out "$Name.mov")) -PassThru
  Start-Sleep -Milliseconds 500
  & $Act
  $null = $p.WaitForExit(($Secs + 4) * 1000)
}

$Part = if ($env:CONFORMANCE_PART) { $env:CONFORMANCE_PART } else { "all" }

# --- a first run --------------------------------------------------------------
if ($Part -ne "rest") {
Start-Meno
Start-Sleep -Milliseconds 1500
Save-Step "first-start"
Start-Sleep -Milliseconds 3000
Save-Step "update-asked"
Set-MenoWindow
Send-MenoKey Escape
Start-Sleep -Milliseconds 800
Move-MenoPointer -X 1850 -Y 600
Start-Sleep -Milliseconds 400
Save-Step "chrome"
& /usr/sbin/screencapture -x -R "0,0,900,25" (Join-Path $Out "menu-bar.png")
# (what each of its menus holds, as the system reads them; logged)
$menus = & /usr/bin/osascript -e 'tell application "System Events" to tell process "Meno" to get {name of every menu bar item of menu bar 1, name of every menu item of every menu of every menu bar item of menu bar 1}' 2>&1
Write-Host "  menu bar: $menus"

# the one tab closed - nothing drawn on it, nothing to ask - and Meno gone with it; then started again
Invoke-MenoClick -X 517 -Y 42
Start-Sleep -Milliseconds 2500
$left = @(Get-MenoApp)
Write-Host ("  last-tab-quits: " + $(if ($left.Count) { "NO - Meno still running" } else { "yes - Meno gone" }))
if ($Part -eq "first") { return }
}
# (started again: the system may have given the front to another program as Meno went - Meno is brought to it)
try { Start-Meno } catch {
  Write-Host "  (Meno started behind another program: brought to the front)"
  $again = @(Get-MenoApp)[0].Id
  & /usr/bin/osascript -e "tell application ""System Events"" to set frontmost of (first process whose unix id is $again) to true" | Out-Null
  Start-Sleep -Milliseconds 1000
  Get-MenoWindow | Out-Null
  Set-MenoWindow
}
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 1500

# --- drawing ------------------------------------------------------------------
Add-MenoSmiles "OCCc1ccccc1"
Wait-MenoSettled | Out-Null
Add-MenoSmiles "C[C@H](O)/C=C/C" -X 1280 -Y 1400
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 2500
Calm
Save-Step "stereo-hidden"

# --- Settings -----------------------------------------------------------------
Film "settings-open" 2 { Invoke-MenoClick -X 2515 -Y 40 }
Start-Sleep -Milliseconds 400
Save-Step "settings-colours"
Invoke-MenoClick -X 986 -Y 160
Start-Sleep -Milliseconds 800
Save-Step "settings-chemistry"
Film "settings-close" 2 { Invoke-MenoClick -X 269 -Y 42 }
Start-Sleep -Milliseconds 400
Calm

# --- menus, Quick Add, paste, Escape ---------------------------------------------
Hand 1404 804 -Ms 700
Start-Sleep -Milliseconds 400
Hand 1404 804 -Right
Start-Sleep -Milliseconds 600
Save-Step "selection-menu"
Calm
Hand 1800 560
Start-Sleep -Milliseconds 300

Hand 1800 600 -Right
Start-Sleep -Milliseconds 600
Save-Step "empty-menu"
Hand 900 1500
Start-Sleep -Milliseconds 900
Save-Step "menu-click-only-closes"
Calm

Film "quick-add" 2 { Invoke-MenoClick -X 1800 -Y 1300 -Count 2 }
Save-Step "quick-add"
Calm

Move-MenoPointer -X 700 -Y 500
Send-MenoShortcut A
Send-MenoShortcut C
Start-Sleep -Milliseconds 1500
Send-MenoShortcut V
Start-Sleep -Milliseconds 1200
Send-MenoShortcut V
Start-Sleep -Milliseconds 1200
Save-Step "paste-twice"
Undo 2
Calm
Hand 1800 560
Start-Sleep -Milliseconds 300

Invoke-MenoDrag -FromX 1238 -FromY 996 -ToX 1300 -ToY 1200 -Steps 16 -StepMs 40 -AtStep { param($i) if ($i -eq 8) { Send-MenoKey Escape } }
Start-Sleep -Milliseconds 600
Move-MenoPointer -X 1850 -Y 600
Save-Step "escape-drag"
Calm

# --- files and tabs -------------------------------------------------------------
# Open with something drawn: the file added to the workspace in front, no tab made (the maintainer, 2026-10-13)
OpenFile (Join-Path $Fixtures "depiction-check.mol")
Wait-MenoSettled | Out-Null
Save-Step "open-adds-to-front"
# (back to the first tab, where a tab was made for it; what was added taken back where it was not)
Invoke-MenoClick -X 300 -Y 42
Start-Sleep -Milliseconds 600
Calm

# a stack, opened on a blank tab: its chip, under the record, its middle at 1276,1160
Invoke-MenoClick -X 2313 -Y 40
Start-Sleep -Milliseconds 800
OpenFile (Join-Path $Fixtures "conformance-three.sdf")
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Save-Step "stack-opened"
Move-MenoPointer -X 1276 -Y 1160
Start-Sleep -Milliseconds 1200
Save-Step "chip-hover"
Hand 1276 1160
Start-Sleep -Milliseconds 700
Save-Step "chip-click"
Calm
Invoke-MenoWheel -X 1276 -Y 1160 -Notches 2
Start-Sleep -Milliseconds 800
Save-Step "chip-wheel"
Calm

# a trajectory, on a blank tab: its frames chip, its middle at 1280,1152
Invoke-MenoClick -X 2313 -Y 40
Start-Sleep -Milliseconds 800
OpenFile (Join-Path $Fixtures "conformance-frames.xyz")
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Move-MenoPointer -X 1280 -Y 1152
Start-Sleep -Milliseconds 1200
Save-Step "frames-hover"
Hand 1280 1152
Start-Sleep -Milliseconds 700
Save-Step "frames-click"
Calm
Invoke-MenoWheel -X 1280 -Y 1152 -Notches 2
Start-Sleep -Milliseconds 800
Save-Step "frames-wheel"
Calm

# back to the first tab, the structures drawn there; a text read in its column, the column closed by a double-click
Film "tab-switch" 2 { Invoke-MenoClick -X 300 -Y 42 }
Start-Sleep -Milliseconds 400
Calm
Film "column-open" 3 { OpenFile (Join-Path $Fixtures "conformance-notes.md") }
Save-Step "column-open"
Film "column-close" 2 { Invoke-MenoClick -X 400 -Y 400 -Count 2 }
Start-Sleep -Milliseconds 300
Save-Step "column-closed"
Calm

# a file that is no molecule: its message, and no tab made for it
OpenFile (Join-Path $Fixtures "conformance-nothing.mol")
Start-Sleep -Milliseconds 800
Save-Step "unreadable"
Invoke-MenoClick -X 300 -Y 42
Start-Sleep -Milliseconds 600
Calm

# a workspace file opened over the first tab, something drawn on it: a tab of its own, named for it
OpenFile (Join-Path $Fixtures "conformance-workspace.meno")
Wait-MenoSettled | Out-Null
Save-Step "meno-own-tab"
