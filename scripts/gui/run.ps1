<#
.SYNOPSIS
Run a scenario against the built app and keep what it saw.

.DESCRIPTION
Starts Meno, puts its window at a fixed size, runs the named scenario and
writes its screenshots into a run folder. The scenario is an ordinary script
with the verbs of the platform module available - MenoGui.psm1 on Windows,
MenoGui.macOS.psm1 on a Mac - plus Start-Meno / Open-MenoFile / Save-MenoFile / Save-Step from
here.

This needs a desktop: a logged-in session that is unlocked. It cannot run in
CI, which is why nothing in the workflow calls it.

.EXAMPLE
pwsh scripts/gui/run.ps1 -Scenario drag-atoms
pwsh scripts/gui/run.ps1 -Scenario drag-atoms -Out .gui-runs/before
pwsh scripts/gui/run.ps1 -Scenario open-and-look -Guide
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Scenario,
    [string] $Out,
    # What `npm run tauri build` last produced by default; point this at
    # another build to test that one instead.
    [string] $Exe,
    [int] $Width = 1280,
    [int] $Height = 860,
    [switch] $KeepOpen,
    # Show the guides a fresh install shows (the first-run guide): by
    # default each run counts them as shown already, so that none is in the
    # way of a scenario.
    [switch] $Guide
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# The same verbs on either desktop. Everything below this line, and every
# scenario, is written against those and nothing platform-shaped.
$onMac = $PSVersionTable.PSEdition -eq "Core" -and $IsMacOS
Import-Module (Join-Path $PSScriptRoot $(if ($onMac) { "MenoGui.macOS.psm1" } else { "MenoGui.psm1" })) -Force
if (-not $Exe) { $Exe = Get-MenoBuild }

$scenarioPath = Join-Path $PSScriptRoot "scenarios/$Scenario.ps1"
if (-not (Test-Path $scenarioPath)) {
    $have = (Get-ChildItem "$PSScriptRoot/scenarios" -Filter *.ps1 |
        ForEach-Object { $_.BaseName }) -join ", "
    throw "no scenario '$Scenario'. There is: $have"
}
if (-not (Test-Path $Exe)) {
    throw "no app at '$Exe'. Build one with: npm run tauri build"
}

if (-not $Out) {
    $Out = Join-Path (Resolve-Path "$PSScriptRoot/../..") ".gui-runs/$Scenario-$(Get-Date -Format yyyyMMdd-HHmmss)"
}
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path

$script:StepNo = 0
$script:ShotFiles = @()

function Save-Step {
    <#
      .SYNOPSIS
      A screenshot, numbered in the order it was taken and named for what
      had just happened, so a run reads as a story rather than a heap.
    #>
    param([Parameter(Mandatory)] [string] $Name)
    $script:StepNo++
    $file = Join-Path $Out ("{0:d2}-{1}.png" -f $script:StepNo, $Name)
    Save-MenoShot -Path $file | Out-Null
    $script:ShotFiles += $file
    Write-Host "  shot $("{0:d2}" -f $script:StepNo): $Name"
}

function Get-MenoApp {
    <#
      .SYNOPSIS
      The copies of Meno running as the app - not those running a job
      (`Meno --job <folder>`, src-tauri/src/jobs.rs), which outlive the
      app and are left to finish.
    #>
    Get-Process -Name Meno -ErrorAction SilentlyContinue | Where-Object {
        $line = if ($IsWindows) { $_.CommandLine } else { (& /bin/ps -o command= -p $_.Id) -join " " }
        -not ($line -match "\s--job\s")
    }
}

# The guides a fresh install shows, by the id of the plugin each is part of
# (src-tauri/resources/plugins): the first-run guide, over the canvas.
$script:Guides = @("getting-started")

function Get-MenoSettingsPath {
    <#
      .SYNOPSIS
      Where the app keeps its settings: settings.json in its data folder,
      named for its identifier (src-tauri/tauri.conf.json).
    #>
    if ($IsWindows) { return Join-Path $env:APPDATA "com.kfchem.meno/settings.json" }
    return Join-Path $HOME "Library/Application Support/com.kfchem.meno/settings.json"
}

function Set-GuidesShown {
    <#
      .SYNOPSIS
      Count the guides a fresh install shows as shown already, in the
      settings the app is about to read (`plugins.guided`): the first-run
      guide would otherwise lie over the canvas and take the scenario's
      clicks - on every run, where settings.json is put back after each.
      The rest of the file is left as it is.
    #>
    $path = Get-MenoSettingsPath
    $settings = if (Test-Path $path) { Get-Content -Raw $path | ConvertFrom-Json -AsHashtable } else { $null }
    if ($null -eq $settings) { $settings = [ordered]@{} }
    if (-not $settings.Contains("plugins") -or $settings["plugins"] -isnot [System.Collections.IDictionary]) { $settings["plugins"] = [ordered]@{} }
    $plugins = $settings["plugins"]
    $guided = @(if ($plugins.Contains("guided")) { $plugins["guided"] } else { @() })
    $missing = @($script:Guides | Where-Object { $guided -notcontains $_ })
    if (-not $missing.Count) { return }
    $plugins["guided"] = @($guided + $missing)
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    $settings | ConvertTo-Json -Depth 64 | Set-Content -Path $path -Encoding utf8NoBOM
    Write-Host "  counting as shown: $($missing -join ', ') (-Guide shows them)"
}

function Start-Meno {
    <#
      .SYNOPSIS
      Start the app under test, and see off any copy already running: a
      second instance would put its window over the one being driven. The
      guides a fresh install shows are counted as shown first, unless the
      run was asked to show them (-Guide).
    #>
    Get-MenoApp | ForEach-Object {
        Write-Host "  closing a Meno that was already running (pid $($_.Id))"
        Close-MenoProcess -Process $_
    }
    Start-Sleep -Milliseconds 500
    if (-not $Guide) { Set-GuidesShown }
    Write-Host "  starting $Exe"
    Start-MenoProcess -Path $Exe
    Get-MenoWindow -ProcessName Meno -TimeoutSec 40 | Out-Null
    Set-MenoWindow -Width $Width -Height $Height
    # The first paint lands a moment after the window does.
    Start-Sleep -Milliseconds 1200
    Wait-MenoSettled -TimeoutMs 8000 | Out-Null
}

function Open-MenoFile {
    <#
      .SYNOPSIS
      Open a structure through the app's own Open: Ctrl+O (Cmd+O on a Mac).

      .DESCRIPTION
      The file opens in a tab of its own, or in place of the tab in front if
      that is a canvas nothing is drawn on - the first tab, as Meno starts.

      The file picker is the system dialog, so the path is typed into it
      rather than clicked for - how, is the platform module's business. The
      app takes no file on its command line yet; if it ever does, this becomes
      one argument to Start-Meno and the most brittle step in the harness goes
      away.

      With -All (macOS), every file in that file's folder is opened at once.
    #>
    param([Parameter(Mandatory)] [string] $Path, [switch] $All)
    $full = (Resolve-Path $Path).Path
    Send-MenoShortcut O
    if ($All) { Complete-FileDialog -Path $full -All } else { Complete-FileDialog -Path $full }
    # The dialog took the foreground with it; take it back.
    Get-MenoWindow -ProcessName Meno -TimeoutSec 10 | Out-Null
    Set-MenoWindow -Width $Width -Height $Height
    Wait-MenoSettled -TimeoutMs 8000 | Out-Null
}

function Invoke-MenoQuickAdd {
    <#
      .SYNOPSIS
      Quick Add at a point of empty space, and one of its icons:
      Invoke-MenoQuickAdd -X 1300 -Y 1300 -Item Chain begins a chain there,
      which the pointer then leads with the button up until a click ends it.

      .DESCRIPTION
      A double-click at the point opens Quick Add, and the icon is clicked
      where Quick Add is seen to stand: its box found in a shot taken as it
      opens (Find-MenoQuickAdd), its icons from its top left (a border of 1
      and padding of 4, icons 36 wide and 2 apart, the Calculations button
      after a rule of 9 - CSS px, twice as many in a shot). Where it stands
      depends on how large it grows (src/ui/features/Workspace/
      quickAddPlace.ts), and so on the plugins added and the procedures
      saved on the computer the run is on - which a scenario cannot know.
      Should the box not be found, the icon is clicked where it would stand
      with -CalcRows rows of steps (and procedures) at most -CalcMost icons
      long - Meno's own, alone, by default - and a warning says so. SMILES
      opens the field below the row, which then takes the keys; Shapes, the
      shapes; Calculations, the calculations. A build whose row has Pen,
      after Slide, is told by the box's width (ten icons, not nine); where the
      box is not found - or always, where -Pen says it has one. -PassThru returns where the box
      stands, in shot pixels (Left, Top): a shape is drawn by a press on its
      icon in the row below (Get-MenoShapeIcon) and a drag.
    #>
    param(
        [Parameter(Mandatory)] [int] $X,
        [Parameter(Mandatory)] [int] $Y,
        [Parameter(Mandatory)] [ValidateSet("Bond", "Chain", "SMILES", "Text", "Reaction arrow", "Plus", "Electron-pushing arrow", "Slide", "Pen", "Shapes", "Calculations")] [string] $Item,
        [int] $CalcRows = 1,
        [int] $CalcMost = 4,
        [switch] $Pen,
        [switch] $PassThru
    )
    # (as src/ui/features/Workspace/QuickAdd.tsx's ROW has them, the Calculations button after them)
    $row = @("Bond", "Chain", "SMILES", "Text", "Reaction arrow", "Plus", "Electron-pushing arrow", "Slide", "Pen", "Shapes")
    Invoke-MenoClick -X $X -Y $Y -Count 2
    Start-Sleep -Milliseconds 350
    $box = Find-MenoQuickAdd -X $X -Y $Y
    # (a row of ten, with the pen: the rule before Calculations comes first, some 389 CSS px in - nine's right edge is at 379)
    if ($Pen -or ($box -and $box.Width -gt 768)) { $row = @("Bond", "Chain", "SMILES", "Text", "Reaction arrow", "Plus", "Electron-pushing arrow", "Slide", "Pen", "Shapes") }
    if ($Item -eq "Pen" -and $row -notcontains "Pen") { throw "this Meno's Quick Add has no Pen" }
    if ($box) {
        $left = $box.Left / 2; $top = $box.Top / 2 - 40
    } else {
        Write-Warning "Quick Add was not found as it opened at ($X, $Y): its icon is clicked where it would stand with $CalcRows row(s) of calculations"
        $size = Get-ClientSize
        $cw = $size.Width / 2; $ch = $size.Height / 2 - 40
        $px = $X / 2; $py = $Y / 2 - 40
        # (the row and the Calculations button after a rule, its height with its padding; and its largest, a panel open)
        $w = ($row.Count + 1) * 36 + 8 + 9; $h = 36 + 8
        $mostW = [Math]::Max($w, 84 + $CalcMost * 36 + 8)
        $mostH = [Math]::Max($h + $CalcRows * 36 + 9, $h + 32 + 9)
        $right = ($px + 14 + $mostW -le $cw - 4) -or ($px - 14 - $mostW -lt 4)
        $left = if ($right) { [Math]::Max(4, [Math]::Min($px + 14, $cw - 4 - $mostW)) } else { $px - 14 - $mostW }
        $top = if ($py - 14 - $h -ge 4) { $py - 14 - $h } else { $py + 14 }
        $top = [Math]::Max(4, [Math]::Min($top, $ch - 4 - $mostH))
    }
    $ix = if ($Item -eq "Calculations") { $left + 1 + 4 + $row.Count * 38 + 9 + 18 } else { $left + 1 + 4 + $row.IndexOf($Item) * 38 + 18 }
    $iy = $top + 1 + 4 + 18
    Invoke-MenoClick -X ([int](2 * $ix)) -Y ([int](2 * ($iy + 40)))
    Start-Sleep -Milliseconds 300
    if ($PassThru) { [pscustomobject]@{ Left = [int](2 * $left); Top = [int](2 * ($top + 40)) } }
}

function Get-MenoShapeIcon {
    <#
      .SYNOPSIS
      Where a shape's icon stands in the row Shapes opens below Quick Add's
      (src/ui/features/Workspace/QuickAdd.tsx, SHAPE_KINDS), in shot pixels,
      for Quick Add's box as Invoke-MenoQuickAdd returned it: its row 4 + 1
      + 4 CSS px below the first.
    #>
    param([Parameter(Mandatory)] $Box, [Parameter(Mandatory)] [ValidateSet("Rectangle", "Rounded rectangle", "Ellipse", "Line", "Callout")] [string] $Shape)
    $kinds = @("Rectangle", "Rounded rectangle", "Ellipse", "Line", "Callout")
    [pscustomobject]@{ X = $Box.Left + 2 * (1 + 4 + $kinds.IndexOf($Shape) * 38 + 18); Y = $Box.Top + 2 * (1 + 4 + 36 + 4 + 1 + 4 + 18) }
}

function Find-MenoQuickAdd {
    <#
      .SYNOPSIS
      Where Quick Add stands, just opened at (X, Y): the top left of its box
      in shot pixels, or nothing where it is not to be seen.

      .DESCRIPTION
      The window is shot, and a column of the shot walked a little to the
      right of the point - then to its left, where Quick Add opens to the
      left of it: its box is the pair of hairline edges (App.css
      --color-gh-line) 44 CSS px apart that cross it, the row of icons alone
      as it opens; its left edge is walked to along the row's middle, and
      its right edge looked for as wide as the row away.
    #>
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y)
    $png = Join-Path ([System.IO.Path]::GetTempPath()) "meno-quick-add-$PID.png"
    Save-MenoShot -Path $png | Out-Null
    try { $px = Read-ShotPixels -Png $png } finally { Remove-Item $png -ErrorAction SilentlyContinue }
    foreach ($cx in @(($X + 68), ($X - 68))) {
        if ($cx -lt 0 -or $cx -ge $px.Width) { continue }
        $edges = @()
        for ($y = 80; $y -lt $px.Height; $y++) {
            if ((Test-ShotHairline $px $cx $y) -and -not (Test-ShotHairline $px $cx ($y - 1))) { $edges += $y }
        }
        foreach ($top in $edges) {
            if ($null -eq ($edges | Where-Object { [Math]::Abs($_ - $top - 86) -le 6 } | Select-Object -First 1)) { continue }
            $mid = $top + 44
            for ($x = $cx; $x -gt 0; $x--) {
                if (-not (Test-ShotHairline $px $x $mid)) { continue }
                # (as wide as its row as it opens - nine icons and Calculations, with their gaps, some 397 CSS px - or not
                # its left edge: the rule before Calculations, say, walked on past)
                for ($r = $x + 720; $r -le [Math]::Min($x + 860, $px.Width - 1); $r++) {
                    if (Test-ShotHairline $px $r $mid) { return [pscustomobject]@{ Left = $x; Top = $top; Width = $r - $x } }
                }
            }
        }
    }
    return $null
}

function Read-ShotPixels {
    # A shot's pixels, read through a BMP of it - sips's on a Mac, System.Drawing's on Windows: what Test-ShotHairline looks at.
    param([Parameter(Mandatory)] [string] $Png)
    $bmp = [System.IO.Path]::ChangeExtension($Png, ".bmp")
    if ($IsWindows) {
        Add-Type -AssemblyName System.Drawing
        $image = [System.Drawing.Bitmap]::new($Png)
        try { $image.Save($bmp, [System.Drawing.Imaging.ImageFormat]::Bmp) } finally { $image.Dispose() }
    } else {
        & sips -s format bmp $Png --out $bmp *> $null
    }
    try { $b = [System.IO.File]::ReadAllBytes($bmp) } finally { Remove-Item $bmp -ErrorAction SilentlyContinue }
    $w = [BitConverter]::ToInt32($b, 18)
    $h = [BitConverter]::ToInt32($b, 22)
    $bpp = [BitConverter]::ToInt16($b, 28)
    [pscustomobject]@{
        Width = $w; Height = [Math]::Abs($h); Bytes = $b; Offset = [BitConverter]::ToInt32($b, 10)
        Stride = [int]([Math]::Floor(($bpp * $w + 31) / 32) * 4); Step = $bpp / 8; BottomUp = $h -gt 0
    }
}

function Test-ShotDimmed($px) {
    # (a question over the page: its white under App's bg-black/20, some 204 each - looked for near both lower corners of
    # the window, where a fresh page has nothing drawn; the BMP's bytes blue first)
    foreach ($x in @(40, ($px.Width - 40))) {
        $y = $px.Height - 40
        $row = if ($px.BottomUp) { $px.Height - 1 - $y } else { $y }
        $i = $px.Offset + $row * $px.Stride + $x * $px.Step
        foreach ($c in @($px.Bytes[$i], $px.Bytes[$i + 1], $px.Bytes[$i + 2])) { if ($c -lt 180 -or $c -gt 225) { return $false } }
    }
    return $true
}

function Close-MenoQuestion {
    <#
      .SYNOPSIS
      A question Meno asks as it starts - keeping it up to date, on a fresh
      profile - waited for, however long it takes to come, and answered no.

      .DESCRIPTION
      The window is shot every quarter second until the page is seen dimmed
      under a question (Test-ShotDimmed), or `TimeoutSec` has passed; then
      Escape answers it - "Not now", which fetches nothing - wherever its
      button stands. A fixed wait clicked "Not now" before the question came
      (it comes some 3 s after the start). Whether there was one.
    #>
    param([int] $TimeoutSec = 12)
    $png = Join-Path ([System.IO.Path]::GetTempPath()) "meno-question-$PID.png"
    $until = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $until) {
        Save-MenoShot -Path $png | Out-Null
        try { $px = Read-ShotPixels -Png $png } finally { Remove-Item $png -ErrorAction SilentlyContinue }
        if (Test-ShotDimmed $px) {
            Send-MenoKey Escape
            Start-Sleep -Milliseconds 600
            return $true
        }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Test-ShotHairline($px, [int] $x, [int] $y) {
    # (Meno's hairline grey, App.css --color-gh-line 209, 217, 224 - give or take; the BMP's bytes blue first)
    $row = if ($px.BottomUp) { $px.Height - 1 - $y } else { $y }
    $i = $px.Offset + $row * $px.Stride + $x * $px.Step
    return [Math]::Abs($px.Bytes[$i + 2] - 209) -le 14 -and [Math]::Abs($px.Bytes[$i + 1] - 217) -le 14 -and [Math]::Abs($px.Bytes[$i] - 224) -le 14
}

function Add-MenoSmiles {
    <#
      .SYNOPSIS
      A structure from a SMILES, by Quick Add's SMILES field, centred at a
      point of empty space - the middle of the canvas unless told - and let
      go of (it comes in selected, as a paste does). The first one waits
      for the plugin that reads SMILES to start.
    #>
    param([Parameter(Mandatory)] [string] $Smiles, [int] $X = 0, [int] $Y = 0, [int] $WaitSec = 8)
    if (-not $X -and -not $Y) {
        $size = Get-ClientSize
        $X = [int]($size.Width / 2); $Y = [int](80 + ($size.Height - 80) / 2)
    }
    Invoke-MenoQuickAdd -X $X -Y $Y -Item SMILES
    Send-MenoText $Smiles -CharMs 10
    Send-MenoKey Enter
    Start-Sleep -Seconds $WaitSec
    Send-MenoKey Escape
}

function Save-MenoFile {
    <#
      .SYNOPSIS
      Save the canvas in front under a path, through Save As
      (Ctrl/Cmd+Shift+S).

      .DESCRIPTION
      Save As asks where whatever the canvas was saved as before, so a
      scenario says where. The dialog is the system's, so the path is typed
      into it - how, is the platform module's business.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    if (Test-Path $Path) { throw "'$Path' is there already: save under a new name, or the system asks whether to replace it" }
    Send-MenoShortcut S -Shift
    Complete-SaveDialog -Path $Path
    Get-MenoWindow -ProcessName Meno -TimeoutSec 10 | Out-Null
    Set-MenoWindow -Width $Width -Height $Height
    Wait-MenoSettled -TimeoutMs 8000 | Out-Null
}

Write-Host "scenario '$Scenario' -> $Out"
try {
    . $scenarioPath
    Write-Host "done: $($script:ShotFiles.Count) shots in $Out"
} finally {
    if (-not $KeepOpen) {
        Get-MenoApp | ForEach-Object {
            Close-MenoProcess -Process $_
        }
    }
}
