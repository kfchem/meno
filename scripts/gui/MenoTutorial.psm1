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
#   New-TutorialHome -Ready [-Network]     a copy of the prepared home:
#                                          its plugins added and its first
#                                          questions answered by a person's
#                                          hand; taken away as the run ends
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
        Raw = $Raw; Dest = $Dest; Version = $Version; Needs = @(); Ready = $Ready; Repository = $Repository; Homes = @()
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
      A home for Start-Meno -HomeFolder, in the run's folder: empty - Meno
      as someone opening it the first time sees it, its first start's
      questions and all - or, with -Ready, a copy of the prepared home
      run.ps1 was given (-ReadyHome, or MENO_TUTORIAL_HOME): the plugins a
      person added there, and the first start's questions answered
      (Copy-ReadyHome). A copy is taken away as the run ends
      (Remove-TutorialHomes), unless run.ps1 was told -KeepOpen.

      .DESCRIPTION
      -Network carries the purposes the person allowed to use the network
      over into the copy - only where the person who prepared the home
      agreed that recordings use those hosts. Without it the copy allows
      none, and a run from it uses the network only as a fresh home would:
      by asking, which a run never answers yes. Keeping Meno up to date is
      never carried over.
    #>
    param([switch] $Ready, [switch] $Network)
    $n = $script:Tut.Steps.Count + 1
    if (-not $Ready) {
        $dir = Join-Path $script:Tut.Raw ("home-fresh-{0}" -f $n)
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        return $dir
    }
    if (-not $script:Tut.Ready) {
        throw "this tutorial starts Meno in a prepared home: give run.ps1 -ReadyHome <folder>, or set MENO_TUTORIAL_HOME (scripts/gui/README.md, The prepared home)"
    }
    $dir = Join-Path $script:Tut.Raw ("home-ready-{0}" -f $n)
    Copy-ReadyHome -From $script:Tut.Ready -To $dir -Run $script:Tut.Raw -Repository $script:Tut.Repository -Network:$Network | Out-Null
    $script:Tut.Homes += $dir
    return $dir
}

function Remove-TutorialHomes {
    # run.ps1's, as a tutorial's run ends with Meno closed: each copy of the prepared home taken away, inside the run's folder alone.
    if (-not $script:Tut) { return }
    foreach ($dir in @($script:Tut.Homes)) { Remove-InCopy -Path $dir -Copy $dir -Whole }
    $script:Tut.Homes = @()
}

function Resolve-ReadyHome {
    # The prepared home run.ps1 was given: -ReadyHome, else MENO_TUTORIAL_HOME, else none.
    param([string] $Given)
    if ($Given) { return $Given }
    if ($env:MENO_TUTORIAL_HOME) { return $env:MENO_TUTORIAL_HOME }
    return ""
}

# What a prepared home's Meno folder (Library/Application Support/Meno: on a
# Mac its data and local data are one, src-tauri/src/folders.rs) gives a copy:
# the plugins added, their environments' makers' folders with what they
# downloaded and the records of each plugin set up (uv, pixi), the tools Meno
# fetched, the list of plugins online, and settings made afresh
# (New-CopySettings). Anything else there - the log, the network log, the
# window's place, jobs and the jobs kept, the working folder chosen for jobs,
# presets saved, what a later Meno adds - is left out, and so is all of the
# home outside that folder.
$script:ReadyKeeps = @("plugins", "uv", "pixi", "tools", "catalogue.json", "catalogue.json.minisig", "catalogue-state.json")
# (the copy is cloned where the disk can, -c; links copied as links, -P, and then dealt with one by one)
$script:CloneArgs = @("-cRP")
# (keeping Meno up to date: never in a recording, whatever was allowed)
$script:NeverCarried = @("app-update")

function Get-FullPath {
    # A path in full, a relative one from where PowerShell is (not the process's own folder), its name taken as written.
    param([Parameter(Mandatory, Position = 0)] [string] $Path)
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Get-RealPath {
    <#
      .SYNOPSIS
      Where a path is on the disk: links followed, by realpath, and the
      system volume's other spelling of the same folder taken away; where
      it is not there yet, its nearest folder that is, and the rest as
      written. Nothing for a path that cannot be followed (a loop, a link
      to nothing).
    #>
    param([Parameter(Mandatory)] [string] $Path)
    $full = (Get-FullPath $Path)
    if ($full.Length -gt 1) { $full = $full.TrimEnd("/") }
    $rest = @()
    $at = $full
    while (-not (Test-Path -LiteralPath $at) -and -not (Get-Item -LiteralPath $at -Force -ErrorAction SilentlyContinue)) {
        $rest = @([System.IO.Path]::GetFileName($at)) + $rest
        $at = [System.IO.Path]::GetDirectoryName($at)
        if (-not $at) { return $null }
    }
    $real = & /bin/realpath "$at" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $real) { return $null }
    $real = "$real" -replace "^/System/Volumes/Data(?=/)", ""
    foreach ($part in $rest) { $real = $real.TrimEnd("/") + "/" + $part }
    return $real
}

function Test-Within {
    # Whether one real path is another or inside it - in any case, as a Mac's disk takes names.
    param([string] $Path, [string] $Folder)
    if (-not $Path -or -not $Folder) { return $false }
    $f = $Folder.TrimEnd("/")
    return $Path.Equals($f, [System.StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith("$f/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-ReadyProblem {
    # Why a folder is no prepared home a copy can be made of at -To, in words - or nothing, where it is one. Every place compared as the disk has it.
    param([string] $From, [string] $To, [string] $Run, [string] $Repository)
    if (-not $From -or -not (Test-Path -LiteralPath $From -PathType Container)) { return "there is no folder '$From'" }
    $real = Get-RealPath $From
    if (-not $real) { return "'$From' cannot be followed to a folder" }
    $own = Get-RealPath ([Environment]::GetFolderPath("UserProfile"))
    if ($own -and $real.Equals($own, [System.StringComparison]::OrdinalIgnoreCase)) { return "'$From' is this account's own home: a prepared home is a folder of its own, made for recordings" }
    if ($Repository) {
        $repo = Get-RealPath $Repository
        if ((Test-Within $real $repo) -or (Test-Within $repo $real)) { return "'$From' is in the repository, or holds it: a prepared home is kept outside it" }
    }
    foreach ($place in @($To, $Run) | Where-Object { $_ }) {
        $p = Get-RealPath $place
        if ((Test-Within $p $real) -or (Test-Within $real $p)) { return "'$From' and the run's folder '$place' lie one inside the other: the run's folder is kept outside the prepared home" }
    }
    $meno = Join-Path $real "Library/Application Support/Meno"
    $settings = Join-Path $meno "settings.json"
    if (-not (Test-Path -LiteralPath $settings -PathType Leaf)) { return "'$From' holds no Meno started there (no Library/Application Support/Meno/settings.json): start Meno in it first" }
    if (-not (Test-Within (Get-RealPath $meno) $real)) { return "its Meno folder is a link out of '$From'" }
    try { $s = Get-Content -LiteralPath $settings -Raw | ConvertFrom-Json -AsHashtable } catch { return "its settings.json is not JSON: '$settings'" }
    if ($s -isnot [System.Collections.IDictionary]) { return "its settings.json is not Meno's: '$settings'" }
    $plugins = $s["plugins"]
    if (-not ($plugins -is [System.Collections.IDictionary] -and $plugins["firstSetUp"])) { return "the card Meno shows as it first starts was never answered in '$From': answer it there, by hand" }
    return $null
}

function New-CopySettings {
    <#
      .SYNOPSIS
      The copy's settings, made afresh: what a fresh home has, and of the
      prepared home's only what keeps its plugins where they are and the
      first start's questions from coming again - of `plugins`, how the
      card was answered (`firstSetUp`), whether the plugins set up before
      they came online were asked about (`usedBeforeAsked`), which plugin
      fills each role (`roles`) and those taken away (`removed`), all ids -
      and `updates.asked` set, so that Meno does not ask to keep itself up
      to date. With -Network, also the purposes allowed to use the
      network, less keeping Meno up to date.
    #>
    param([Parameter(Mandatory)] [string] $Text, [switch] $Network)
    $s = $Text | ConvertFrom-Json -AsHashtable
    $out = [ordered]@{ format = $(if ($s["format"] -is [long] -or $s["format"] -is [int]) { $s["format"] } else { 1 }) }
    $plugins = [ordered]@{}
    if ($s["plugins"] -is [System.Collections.IDictionary]) {
        $p = $s["plugins"]
        if ($p["firstSetUp"] -in @("yes", "no", "done")) { $plugins.firstSetUp = $p["firstSetUp"] }
        if ($p["usedBeforeAsked"] -eq $true) { $plugins.usedBeforeAsked = $true }
        if ($p["roles"] -is [System.Collections.IDictionary]) {
            $roles = [ordered]@{}
            foreach ($k in $p["roles"].Keys) { if ($p["roles"][$k] -is [string]) { $roles[$k] = $p["roles"][$k] } }
            $plugins.roles = $roles
        }
        if ($p["removed"] -is [array]) { $plugins.removed = @($p["removed"] | Where-Object { $_ -is [string] }) }
    }
    $out.plugins = $plugins
    $out.updates = [ordered]@{ asked = $true }
    if ($Network -and $s["network"] -is [System.Collections.IDictionary] -and $s["network"]["granted"] -is [array]) {
        $out.network = [ordered]@{ granted = @($s["network"]["granted"] | Where-Object { $_ -is [string] -and $script:NeverCarried -notcontains $_ }) }
    }
    return (ConvertTo-Json -InputObject $out -Depth 8)
}

function Remove-InCopy {
    <#
      .SYNOPSIS
      Take a path away from a copy, by its literal name: only where it lies
      inside the copy as the disk has it (-Whole: or is the copy), and is
      itself no link - a link is unlinked, never followed.
    #>
    param([Parameter(Mandatory)] [string] $Path, [Parameter(Mandatory)] [string] $Copy, [switch] $Whole)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return }
    $copyReal = Get-RealPath $Copy
    $parent = Get-RealPath ([System.IO.Path]::GetDirectoryName((Get-FullPath $Path).TrimEnd("/")))
    $real = "$parent/$([System.IO.Path]::GetFileName((Get-FullPath $Path).TrimEnd('/')))"
    $inside = (Test-Within $real $copyReal) -and ($Whole -or -not $real.Equals($copyReal, [System.StringComparison]::OrdinalIgnoreCase))
    if (-not $copyReal -or -not $parent -or -not $inside) { throw "'$Path' is not inside the copy '$Copy': nothing taken away" }
    if ($item.LinkType) { & /bin/rm -f -- "$real"; if ($LASTEXITCODE -ne 0) { throw "the link '$real' could not be taken away" }; return }
    Remove-Item -LiteralPath $real -Recurse -Force
}

function Copy-Entry {
    # One entry copied to a path not there yet: cloned where the disk can, else copied; a part copied before a failure taken away.
    param([string] $From, [string] $To, [string] $Copy)
    & /bin/cp @script:CloneArgs -- "$From" "$To" 2>$null
    if ($LASTEXITCODE -eq 0) { return }
    Remove-InCopy -Path $To -Copy $Copy
    & /bin/cp -RP -- "$From" "$To"
    if ($LASTEXITCODE -ne 0) { throw "'$From' could not be copied" }
}

function Copy-ReadyHome {
    <#
      .SYNOPSIS
      A fresh copy of a prepared home at -To, the prepared home only read:
      its Meno folder's entries that a run needs ($ReadyKeeps), cloned where
      the disk can (APFS), and settings made afresh (New-CopySettings).

      .DESCRIPTION
      The rule for links: a copy holds none. Each link in what is copied is
      followed in the prepared home; one that leads to a place inside the
      prepared home is replaced in the copy by a copy of what is there,
      one that leads to nothing (or round in a loop) is left out, and one
      that leads out of the prepared home stops the copy, saying which. So
      nothing a run's Meno does through the copy reaches the prepared home
      or anything outside the copy.

      Then, from the copy alone, what names the folder it was made in is
      taken away, as Meno itself leaves it out when its folder moves
      (folders.rs, unbind): uv's venv and pixi's .pixi and activation.json
      of each plugin's, and a plugin's set-up cut short. Meno makes each
      environment again at its first use, from the caches.
    #>
    param(
        [Parameter(Mandatory)] [string] $From,
        [Parameter(Mandatory)] [string] $To,
        [string] $Run,
        [string] $Repository,
        [switch] $Network
    )
    if ($IsWindows) { throw "a prepared home is for a Mac, where Meno's folders follow HOME" }
    if (-not $Run) { $Run = [System.IO.Path]::GetDirectoryName((Get-FullPath $To).TrimEnd("/")) }
    $problem = Get-ReadyProblem -From $From -To $To -Run $Run -Repository $Repository
    if ($problem) { throw "no prepared home to copy: $problem" }
    if (Get-Item -LiteralPath $To -Force -ErrorAction SilentlyContinue) { throw "'$To' is there already: a prepared home is copied into a new folder" }
    $fromReal = Get-RealPath $From
    $fromMeno = Get-RealPath (Join-Path $fromReal "Library/Application Support/Meno")
    [System.IO.Directory]::CreateDirectory((Join-Path $To "Library/Application Support/Meno")) | Out-Null
    $toReal = Get-RealPath $To
    $toMeno = "$toReal/Library/Application Support/Meno"

    $left = @()
    foreach ($entry in Get-ChildItem -LiteralPath $fromMeno -Force) {
        if ($entry.Name -eq "settings.json") { continue }
        if ($script:ReadyKeeps -notcontains $entry.Name) { $left += $entry.Name; continue }
        Copy-Entry -From "$fromMeno/$($entry.Name)" -To "$toMeno/$($entry.Name)" -Copy $toReal
    }
    $settings = Get-Content -LiteralPath "$fromMeno/settings.json" -Raw
    [System.IO.File]::WriteAllText("$toMeno/settings.json", (New-CopySettings -Text $settings -Network:$Network) + "`n")

    # (each link in the copy: what it stands for in the prepared home, followed there)
    $sources = [System.Collections.Generic.List[object]]::new()
    $sources.Add(@($toMeno, $fromMeno))
    for ($pass = 1; ; $pass++) {
        $links = @(& /usr/bin/find "$toReal" -type l 2>$null)
        if (-not $links.Count) { break }
        if ($pass -gt 32) { throw "the prepared home's links lead into each other more than 32 deep: no copy" }
        foreach ($link in $links) {
            $source = $sources | Where-Object { Test-Within $link $_[0] } | Sort-Object { $_[0].Length } -Descending | Select-Object -First 1
            $original = $source[1] + $link.Substring($source[0].Length)
            $target = Get-RealPath $original
            if ($target -and -not (Test-Path -LiteralPath $target)) { $target = $null }
            if (-not $target) { Remove-InCopy -Path $link -Copy $toReal; $left += "a link to nothing ($($link.Substring($toMeno.Length + 1)))"; continue }
            if (-not (Test-Within $target $fromReal)) {
                throw "no copy: '$original' is a link out of the prepared home, to '$target'. A prepared home holds what Meno needs itself: put it there, or take the link away"
            }
            $holder = Get-RealPath ([System.IO.Path]::GetDirectoryName($original))
            if (Test-Within $holder $target) { Remove-InCopy -Path $link -Copy $toReal; $left += "a link round to a folder it is in ($($link.Substring($toMeno.Length + 1)))"; continue }
            Remove-InCopy -Path $link -Copy $toReal
            Copy-Entry -From $target -To $link -Copy $toReal
            $sources.Add(@($link, $target))
        }
    }

    # (what names the folder it was made in, as Meno leaves it when its folder moves; a plugin's set-up cut short)
    $made = @()
    foreach ($maker in @{ uv = @("venv"); pixi = @(".pixi", "activation.json") }.GetEnumerator()) {
        $root = "$toMeno/$($maker.Key)"
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        foreach ($env in Get-ChildItem -LiteralPath $root -Force -Directory | Where-Object { $_.Name -like "plugin-*" }) {
            foreach ($name in $maker.Value) {
                $path = "$root/$($env.Name)/$name"
                if (Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue) { Remove-InCopy -Path $path -Copy $toReal; $made += "$($maker.Key)/$($env.Name)/$name" }
            }
        }
    }
    if (Get-Item -LiteralPath "$toMeno/plugins/.staging" -Force -ErrorAction SilentlyContinue) { Remove-InCopy -Path "$toMeno/plugins/.staging" -Copy $toReal; $made += "plugins/.staging" }

    Write-Host "  a copy of the prepared home: settings.json made afresh$(if ($Network) { ' (the network as allowed there)' }), $(@($script:ReadyKeeps | Where-Object { Test-Path -LiteralPath "$toMeno/$_" }) -join ', ')"
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

Export-ModuleMember -Function Start-Tutorial, Set-Tutorial, New-TutorialHome, Remove-TutorialHomes, Resolve-ReadyHome, Part, Point, Step, Suspend-Steps, Resume-Steps, Complete-Tutorial
