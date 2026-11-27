# Recording one of the manual's "How do I...?" pages (docs/MANUAL.md): each
# step a shot of Meno's window taken just before the step is done, and the
# spot it is done at - found by name wherever the window names it - with what
# is done there, kept for the page to mark. The words are the manual's own
# (site/manual/how-to/<page>/en.md and ja.md), never written here; a run
# writes only the pictures and steps.json beside them.
#
# A tutorial is a script in scripts/gui/tutorials/, run by
# `run.ps1 -Tutorial <page>`, with these verbs besides the scenarios' own:
#
#   Set-Tutorial -Needs chemistry          what the page says it needs
#   New-TutorialHome                       an empty home for Start-Meno
#                                          -HomeFolder: Meno as someone
#                                          opening it the first time sees it
#   New-TutorialHome -Ready                a copy of the prepared home:
#                                          its questions answered and its
#                                          plugins added by a person's hand
#   Part Button "Add" -Row "Some plugin"   a part of the window, by name
#   Point 1200 800                         a point of the window, in shot pixels
#   Step <id> Click -At <part or point>    a step: shot, mark, and done
#   Suspend-Steps / Resume-Steps           steps done unrecorded, as
#                                          answering what a page is not about
#
# A question about the network is the reader's to answer, never a run's:
# its yes is recorded with Step -NotDone and left. Every input a step sends
# goes through the platform module's Invoke-*/Send-*, whose guard
# (MenoConsent.psm1) stops the run before one that would answer yes.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Tut = $null

function Start-Tutorial {
    # run.ps1's, before the tutorial's script: where the raw shots go, where the page's pictures go
    param(
        [Parameter(Mandatory)] [string] $Raw,
        [Parameter(Mandatory)] [string] $Dest,
        [string] $Version = "",
        # (the prepared home New-TutorialHome -Ready copies, and the repository it must lie outside)
        [string] $Ready = "",
        [string] $Repository = ""
    )
    $script:Tut = @{
        Raw = $Raw; Dest = $Dest; Version = $Version; Needs = @(); Ready = $Ready; Repository = $Repository
        Steps = [System.Collections.Generic.List[object]]::new(); Recording = $true
    }
}

function Set-Tutorial {
    <#
      .SYNOPSIS
      What the page says a reader needs before they begin, in the page's
      own words (kept in steps.json, for the page to list).
    #>
    param([string[]] $Needs = @())
    $script:Tut.Needs = @($Needs)
}

function New-TutorialHome {
    <#
      .SYNOPSIS
      A home for Start-Meno -HomeFolder, in the run's folder, thrown away
      with it: empty - Meno as someone opening it the first time sees it,
      its first start's questions and all - or, with -Ready, a copy of the
      prepared home run.ps1 was given (-ReadyHome, or MENO_TUTORIAL_HOME):
      Meno with its questions answered and its plugins added there by a
      person's own hand (Copy-ReadyHome). Nothing of the computer's own
      Meno is in either.
    #>
    param([switch] $Ready)
    $n = $script:Tut.Steps.Count + 1
    if (-not $Ready) {
        $dir = Join-Path $script:Tut.Raw ("home-fresh-{0}" -f $n)
        New-Item -ItemType Directory -Force $dir | Out-Null
        return $dir
    }
    if (-not $script:Tut.Ready) {
        throw "this tutorial starts Meno in a prepared home: give run.ps1 -ReadyHome <folder>, or set MENO_TUTORIAL_HOME (scripts/gui/README.md, Recording a how-to page)"
    }
    $dir = Join-Path $script:Tut.Raw ("home-ready-{0}" -f $n)
    Copy-ReadyHome -From $script:Tut.Ready -To $dir -Repository $script:Tut.Repository | Out-Null
    return $dir
}

# What a prepared home's Meno folder (Library/Application Support/Meno: on a
# Mac its data and local data are one, src-tauri/src/folders.rs) gives a copy:
# the settings, the plugins added, their environments' makers' folders with
# what they downloaded and the records of each plugin set up (uv, pixi), the
# tools Meno fetched, and the list of plugins online. Anything else there -
# the log, the network log, the window's place, jobs and the jobs kept, the
# working folder chosen for jobs, presets saved, what a later Meno adds - is
# left out, and so is all of the home outside that folder: the caches (PDFs'
# pages, ligand data, made again), the web view's own folders.
$script:ReadyKeeps = @("settings.json", "plugins", "uv", "pixi", "tools", "catalogue.json", "catalogue.json.minisig", "catalogue-state.json")

function Get-ReadyProblem {
    # Why a folder is no prepared home a copy can be made of, in words - or nothing, where it is one.
    param([string] $From, [string] $Repository)
    if (-not $From -or -not (Test-Path -PathType Container $From)) { return "there is no folder '$From'" }
    $full = [System.IO.Path]::GetFullPath($From).TrimEnd("/", "\")
    $own = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath("UserProfile")).TrimEnd("/", "\")
    if ($full -eq $own) { return "'$full' is this account's own home: a prepared home is a folder of its own, made for recordings" }
    if ($Repository) {
        $repo = [System.IO.Path]::GetFullPath($Repository).TrimEnd("/", "\")
        if ($full -eq $repo -or $full.StartsWith($repo + [System.IO.Path]::DirectorySeparatorChar)) { return "'$full' is in the repository: a prepared home is kept outside it" }
    }
    $settings = Join-Path $full "Library/Application Support/Meno/settings.json"
    if (-not (Test-Path -PathType Leaf $settings)) { return "'$full' holds no Meno started there (no Library/Application Support/Meno/settings.json): start Meno in it first" }
    try { $s = Get-Content -Raw $settings | ConvertFrom-Json -AsHashtable } catch { return "its settings.json is not JSON: '$settings'" }
    if ($s -isnot [System.Collections.IDictionary]) { return "its settings.json is not Meno's: '$settings'" }
    $plugins = $s["plugins"]
    if (-not ($plugins -is [System.Collections.IDictionary] -and $plugins["firstSetUp"])) { return "the card Meno shows as it first starts was never answered in '$full': answer it there, by hand" }
    return $null
}

function Get-ScrubbedSettings {
    <#
      .SYNOPSIS
      A prepared home's settings as a copy has them: what was allowed and
      set up kept; what is of the person or of the computer emptied - where
      each separately installed program was located (a path with the home's
      name), the apps formats opened with before Meno, procedures saved,
      abbreviations and options remembered, and the cores and memory
      chosen for calculations.
    #>
    param([Parameter(Mandatory)] [string] $Text)
    $s = $Text | ConvertFrom-Json -AsHashtable
    if ($s["plugins"] -is [System.Collections.IDictionary] -and $s["plugins"].Contains("programs")) { $s["plugins"]["programs"] = @{} }
    if ($s["files"] -is [System.Collections.IDictionary]) { $s["files"].Remove("before") }
    foreach ($key in "procedures", "abbreviations") { if ($s.ContainsKey($key)) { $s[$key] = @() } }
    foreach ($key in "options", "calculations") { if ($s.ContainsKey($key)) { $s[$key] = @{} } }
    return (ConvertTo-Json -InputObject $s -Depth 32)
}

function Copy-ReadyHome {
    <#
      .SYNOPSIS
      A fresh copy of a prepared home at -To, the prepared one only read:
      its Meno folder's entries that a run needs ($ReadyKeeps), cloned where
      the disk can (APFS), the settings scrubbed (Get-ScrubbedSettings).

      .DESCRIPTION
      Of the environments, what names the folder it was made in is left
      out, as Meno itself leaves it when its folder moves (folders.rs,
      unbind): uv's venv and pixi's .pixi and activation.json of each
      plugin's; Meno makes each again at its first use, from the caches
      and with no question, what was allowed being in the settings. A link
      into the prepared home is pointed at the same place in the copy, so
      that nothing a run does reaches the prepared home.
    #>
    param([Parameter(Mandatory)] [string] $From, [Parameter(Mandatory)] [string] $To, [string] $Repository)
    $problem = Get-ReadyProblem -From $From -Repository $Repository
    if ($problem) { throw "no prepared home to copy: $problem" }
    if (Test-Path $To) { throw "'$To' is there already: a prepared home is copied into a new folder" }
    if ($IsWindows) { throw "a prepared home is for a Mac, where Meno's folders follow HOME" }
    $fromFull = [System.IO.Path]::GetFullPath($From).TrimEnd("/")
    $fromMeno = Join-Path $fromFull "Library/Application Support/Meno"
    $toMeno = Join-Path $To "Library/Application Support/Meno"
    New-Item -ItemType Directory -Force $toMeno | Out-Null
    $toFull = [System.IO.Path]::GetFullPath($To).TrimEnd("/")

    $left = @()
    foreach ($entry in Get-ChildItem -Force $fromMeno) {
        if ($script:ReadyKeeps -notcontains $entry.Name) { $left += $entry.Name; continue }
        if ($entry.Name -eq "settings.json") { continue }
        # (cloned, -c, where the disk can - nothing written twice; links copied as links, -P)
        & /bin/cp -cRP $entry.FullName $toMeno 2>$null
        if ($LASTEXITCODE -ne 0) {
            Remove-Item -Recurse -Force (Join-Path $toMeno $entry.Name) -ErrorAction SilentlyContinue
            & /bin/cp -RP $entry.FullName $toMeno
            if ($LASTEXITCODE -ne 0) { throw "'$($entry.FullName)' could not be copied" }
        }
    }
    $settings = Get-Content -Raw (Join-Path $fromMeno "settings.json")
    [System.IO.File]::WriteAllText((Join-Path $toMeno "settings.json"), (Get-ScrubbedSettings -Text $settings) + "`n")

    # (what names the folder it was made in, as Meno leaves it when its folder moves; and a plugin's set-up cut short)
    $made = @()
    foreach ($maker in @{ uv = @("venv"); pixi = @(".pixi", "activation.json") }.GetEnumerator()) {
        $root = Join-Path $toMeno $maker.Key
        if (-not (Test-Path $root)) { continue }
        foreach ($env in Get-ChildItem -Force -Directory $root | Where-Object { $_.Name -like "plugin-*" }) {
            foreach ($name in $maker.Value) {
                $path = Join-Path $env.FullName $name
                if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force; $made += "$($maker.Key)/$($env.Name)/$name" }
            }
        }
    }
    $staging = Join-Path $toMeno "plugins/.staging"
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging; $made += "plugins/.staging" }

    # (a link into the prepared home: to the same place in the copy)
    # (the prepared home as given and as the disk has it, /var for /private/var: a link may name either)
    $fromNames = @($fromFull, "$(& /bin/realpath $fromFull 2>$null)".TrimEnd("/")) | Where-Object { $_ } | Select-Object -Unique
    $links = @(& /usr/bin/find $toFull -type l 2>$null)
    foreach ($link in $links) {
        $target = & /usr/bin/readlink $link
        $under = $fromNames | Where-Object { $target -and ($target -eq $_ -or $target.StartsWith("$_/")) } | Select-Object -First 1
        if ($under) {
            & /bin/ln -sfn ($toFull + $target.Substring($under.Length)) $link
            if ($LASTEXITCODE -ne 0) { throw "the link '$link' could not be pointed into the copy" }
        }
    }

    Write-Host "  a copy of the prepared home: $(@($script:ReadyKeeps | Where-Object { Test-Path (Join-Path $toMeno $_) }) -join ', ')"
    if ($left) { Write-Host "    left out: $($left -join ', '), and everything outside Meno's folder" }
    if ($made) { Write-Host "    left out as Meno leaves them when its folder moves (made again at their first use): $($made -join ', ')" }
    return $To
}

function Part {
    <#
      .SYNOPSIS
      A part of Meno's window by its role and its name, as the reader sees it:
      Find-MenoPart, with -Row naming the words of the row it is in (the
      plugin's name for its Add) and -Reveal scrolling it into view.
    #>
    param(
        [Parameter(Mandatory, Position = 0)] [string] $Role,
        [Parameter(Mandatory, Position = 1)] [string] $Name,
        [string] $Within,
        [string] $Row,
        [switch] $Reveal,
        [double] $TimeoutSec = 8
    )
    $found = Find-MenoPart -Role $Role -Name $Name -Within $Within -Row $Row -Reveal:$Reveal -TimeoutSec $TimeoutSec
    return $found
}

function Point {
    # A point of the window in shot pixels, for what Accessibility cannot see: the drawing on the page.
    param([Parameter(Mandatory, Position = 0)] [int] $X, [Parameter(Mandatory, Position = 1)] [int] $Y)
    return [pscustomobject]@{ X = $X; Y = $Y; Width = 0; Height = 0; CX = $X; CY = $Y }
}

function New-StepMark {
    # What steps.json keeps of a step for the page to mark: its kind, the part or point it is done at, a drag's way from there, what is typed or pressed.
    param([string] $Do, $At, [object[]] $Path = @(), [string] $Text, [switch] $Traced)
    $mark = [ordered]@{ kind = $Do.ToLowerInvariant() }
    if ($At) { $mark.x = $At.X; $mark.y = $At.Y; $mark.w = $At.Width; $mark.h = $At.Height }
    # (what tells where it is - the dialog it is in, its row's words - for the page's picture of round about it)
    if ($At -and $At.PSObject.Properties["Near"] -and $At.Near) { $mark.near = @($At.Near.X, $At.Near.Y, $At.Near.Width, $At.Near.Height) }
    if ($Do -eq "Drag") {
        $mark.kind = if ($Traced) { "trace" } else { "drag" }
        $mark.path = @(, @($At.CX, $At.CY)) + @($Path | ForEach-Object { , @([int]$_[0], [int]$_[1]) })
    }
    if ($Text) { $mark.text = $Text }
    return $mark
}

function Get-DragVia {
    # A drag's points between its first and its last, each a point of its own (two points or a hundred: never unrolled into bare numbers).
    param([object[]] $Path = @())
    return , @(for ($i = 0; $i -lt $Path.Count - 1; $i++) { , $Path[$i] })
}

function Suspend-Steps { $script:Tut.Recording = $false }
function Resume-Steps { $script:Tut.Recording = $true }

function Step {
    <#
      .SYNOPSIS
      One step of the page: the window's shot as it is, the spot marked and
      what is done there kept, and then it done.

      .DESCRIPTION
      Click, DoubleClick, RightClick and LongPress at -At; Drag from -At
      through -Path, the last point where it is let go, or with -Traced led
      there with the button up and ended by a click (a chain); Type -Text
      into what has the keys, -At marking it; Key -Text, a key (Enter);
      Shortcut -Text, a key with Cmd on a Mac and Ctrl on Windows (1: fit).
      While steps are suspended it is only done. -NotDone records a step
      the run must not take itself - Allow on a question about the
      network, which is the reader's to answer - and leaves it undone.
      A step done goes through the platform module's input, whose guard
      (MenoConsent.psm1) stops the run before it would answer such a
      question yes.
    #>
    param(
        [Parameter(Mandatory, Position = 0)] [ValidatePattern("^[a-z0-9-]+$")] [string] $Id,
        [Parameter(Mandatory, Position = 1)] [ValidateSet("Click", "DoubleClick", "RightClick", "LongPress", "Drag", "Type", "Key", "Shortcut")] [string] $Do,
        [object] $At,
        [object[]] $Path = @(),
        [string] $Text,
        [switch] $Traced,
        [switch] $NotDone
    )
    if (-not $script:Tut) { throw "Step is for a tutorial: run.ps1 -Tutorial" }
    if ($Do -notin @("Type", "Key", "Shortcut") -and -not $At) { throw "step $Id - $Do where? (-At)" }
    if ($Do -eq "Drag" -and $Path.Count -lt 1) { throw "step $Id - a drag goes somewhere (-Path)" }
    if ($Do -in @("Type", "Key", "Shortcut") -and -not $Text) { throw "step $Id - $Do what? (-Text)" }
    foreach ($p in $Path) { if (@($p).Count -ne 2) { throw "step $Id - each point of -Path is a pair, @(x, y): wrap one point as @(, @(x, y))" } }

    if ($script:Tut.Recording) {
        if ($script:Tut.Steps | Where-Object { $_.id -eq $Id }) { throw "a second step $Id" }
        $n = $script:Tut.Steps.Count + 1
        $file = "{0:d2}-{1}.png" -f $n, $Id
        Save-MenoShot -Path (Join-Path $script:Tut.Raw $file) | Out-Null
        $mark = New-StepMark -Do $Do -At $At -Path $Path -Text $Text -Traced:$Traced
        $script:Tut.Steps.Add([ordered]@{ id = $Id; shot = $file; mark = $mark })
        Write-Host "  step $("{0:d2}" -f $n): $Id ($($mark.kind))$(if ($NotDone) { ', not done' })"
    }
    if ($NotDone) { return }

    switch ($Do) {
        "Click" { Invoke-MenoClick -X $At.CX -Y $At.CY }
        "DoubleClick" { Invoke-MenoClick -X $At.CX -Y $At.CY -Count 2 }
        "RightClick" { Invoke-MenoClick -X $At.CX -Y $At.CY -Right }
        "LongPress" { Invoke-MenoDrag -FromX $At.CX -FromY $At.CY -ToX $At.CX -ToY $At.CY -PressMs 600 }
        "Drag" {
            $last = $Path[-1]
            if ($Traced) {
                Move-MenoPointerAlong -Path (@(, @($At.CX, $At.CY)) + $Path)
                Invoke-MenoClick -X $last[0] -Y $last[1]
            } else {
                Invoke-MenoDrag -FromX $At.CX -FromY $At.CY -ToX $last[0] -ToY $last[1] -Via (Get-DragVia -Path $Path)
            }
        }
        "Type" { Send-MenoText $Text }
        "Key" { Send-MenoKey $Text }
        "Shortcut" { Send-MenoShortcut -Key $Text }
    }
    Start-Sleep -Milliseconds 400
    Wait-MenoSettled -TimeoutMs 4000 | Out-Null
}

function Read-PngSize {
    param([Parameter(Mandatory)] [string] $Path)
    $b = [System.IO.File]::ReadAllBytes($Path)
    $int = { param($at) ([int] $b[$at] -shl 24) -bor ([int] $b[$at + 1] -shl 16) -bor ([int] $b[$at + 2] -shl 8) -bor [int] $b[$at + 3] }
    return @{ Width = (& $int 16); Height = (& $int 20) }
}

function Complete-Tutorial {
    <#
      .SYNOPSIS
      run.ps1's, after the tutorial's script: the window as the tutorial
      leaves it - what the page makes - shot last; every shot made WebP
      into the page's folder (shots/), those of steps no longer there taken
      away; and steps.json written beside them.

      .DESCRIPTION
      A picture the same as the one there is written the same, byte for
      byte, so a run that changes nothing changes nothing in git.
    #>
    if ($script:Tut.Steps.Count -eq 0) { throw "the tutorial recorded no step" }
    Save-MenoShot -Path (Join-Path $script:Tut.Raw "result.png") | Out-Null
    if (-not (Get-Command cwebp -ErrorAction SilentlyContinue)) { throw "the shots are made WebP by cwebp (brew install webp)" }
    $shots = Join-Path $script:Tut.Dest "shots"
    New-Item -ItemType Directory -Force $shots | Out-Null

    $kept = @()
    foreach ($png in @($script:Tut.Steps | ForEach-Object { $_.shot }) + "result.png") {
        $name = [System.IO.Path]::ChangeExtension($png, ".webp")
        $made = Join-Path $script:Tut.Raw $name
        # (twice the width the page shows it at: the marks stay in the shot's own pixels, steps.json's size)
        & cwebp -quiet -q 82 -metadata none -resize 1760 0 (Join-Path $script:Tut.Raw $png) -o $made
        if ($LASTEXITCODE -ne 0) { throw "cwebp could not make $name" }
        $there = Join-Path $shots $name
        $same = (Test-Path $there) -and ((Get-FileHash $there).Hash -eq (Get-FileHash $made).Hash)
        if (-not $same) { Copy-Item $made $there -Force }
        $kept += $name
    }
    Get-ChildItem $shots -Filter *.webp | Where-Object { $kept -notcontains $_.Name } | Remove-Item

    $size = Read-PngSize -Path (Join-Path $script:Tut.Raw "result.png")
    $steps = @($script:Tut.Steps | ForEach-Object {
        [ordered]@{ id = $_.id; shot = [System.IO.Path]::ChangeExtension($_.shot, ".webp"); mark = $_.mark }
    })
    $doc = [ordered]@{
        meno = $script:Tut.Version
        size = [ordered]@{ width = $size.Width; height = $size.Height }
        needs = @($script:Tut.Needs)
        steps = $steps
        result = "result.webp"
    }
    $json = ($doc | ConvertTo-Json -Depth 8) -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText((Join-Path $script:Tut.Dest "steps.json"), $json + "`n")
    Write-Host "  page's pictures: $($kept.Count) in $shots, steps.json beside them"
}

Export-ModuleMember -Function Start-Tutorial, Set-Tutorial, New-TutorialHome, Part, Point, Step, Suspend-Steps, Resume-Steps, Complete-Tutorial
