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
    #>
    param([Parameter(Mandatory)] [string] $Path)
    $full = (Resolve-Path $Path).Path
    Send-MenoShortcut O
    Complete-FileDialog -Path $full
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
      where src/ui/features/Workspace/quickAddPlace.ts puts it: up and to
      the right of the point, or below it or to its left where the canvas
      has no room for it at its largest - its calculations or its SMILES
      field open - held there by its top left corner (OFF 14, SIZE 36, a
      border of 1 and padding of 4, icons 2 apart - CSS px, twice as many in
      a shot; the canvas begins under the 40 px title bar). Its
      calculations' size depends on the plugins added: -CalcRows rows of
      steps (and procedures), at most -CalcMost icons in one - Meno's three,
      alone, by default. Change this with that. SMILES opens the field below
      the row, which then takes the keys.
    #>
    param(
        [Parameter(Mandatory)] [int] $X,
        [Parameter(Mandatory)] [int] $Y,
        [Parameter(Mandatory)] [ValidateSet("Bond", "Chain", "SMILES", "Text", "Reaction arrow", "Plus")] [string] $Item,
        [int] $CalcRows = 1,
        [int] $CalcMost = 3
    )
    $row = @("Bond", "Chain", "SMILES", "Text", "Reaction arrow", "Plus")
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
    $ix = $left + 1 + 4 + $row.IndexOf($Item) * 38 + 18
    $iy = $top + 1 + 4 + 18
    Invoke-MenoClick -X $X -Y $Y -Count 2
    Start-Sleep -Milliseconds 350
    Invoke-MenoClick -X ([int](2 * $ix)) -Y ([int](2 * ($iy + 40)))
    Start-Sleep -Milliseconds 300
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
