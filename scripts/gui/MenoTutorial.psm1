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
#   Set-Tutorial -Needs RDKit, Blender     what the page says it needs
#   New-TutorialHome [-Ready]              a home for Start-Meno -HomeFolder:
#                                          empty (as someone opening Meno the
#                                          first time), or with the plugins
#                                          set up - a clone of the tutorial
#                                          profile, MENO_TUTORIAL_HOME
#   Part Button "Add" -Row Blender         a part of the window, by name
#   Point 1200 800                         a point of the window, in shot pixels
#   Step <id> Click -At <part or point>    a step: shot, mark, and done
#   Suspend-Steps / Resume-Steps           steps done again unrecorded, as
#                                          after a change of profile

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Tut = $null

function Start-Tutorial {
    # run.ps1's, before the tutorial's script: where the raw shots go, where the page's pictures go
    param(
        [Parameter(Mandatory)] [string] $Raw,
        [Parameter(Mandatory)] [string] $Dest,
        [string] $Version = ""
    )
    $script:Tut = @{
        Raw = $Raw; Dest = $Dest; Version = $Version; Needs = @()
        Steps = [System.Collections.Generic.List[object]]::new(); Recording = $true
    }
}

function Set-Tutorial {
    <#
      .SYNOPSIS
      What the page says a reader needs before they begin: the plugins by
      their names in Settings, Plugins.
    #>
    param([string[]] $Needs = @())
    $script:Tut.Needs = @($Needs)
}

function New-TutorialHome {
    <#
      .SYNOPSIS
      A home for Start-Meno -HomeFolder, in the run's folder: empty, Meno as
      someone opening it the first time sees it; or -Ready, a clone of the
      tutorial profile - a home in which a Meno has had its plugins added
      once, named by MENO_TUTORIAL_HOME - so that every run begins from the
      same place and none changes it. A clone (APFS) costs nothing until
      written to.
    #>
    param([switch] $Ready)
    $dir = Join-Path $script:Tut.Raw ("home-{0}-{1}" -f $(if ($Ready) { "ready" } else { "fresh" }), ($script:Tut.Steps.Count + 1))
    if ($Ready) {
        $src = $env:MENO_TUTORIAL_HOME
        if (-not $src -or -not (Test-Path (Join-Path $src "Library/Application Support/Meno"))) {
            throw "no tutorial profile: MENO_TUTORIAL_HOME names a home in which a Meno, started there (Start-MenoProcess -HomeFolder), has had the plugins added"
        }
        & /bin/cp -c -R $src $dir
        if ($LASTEXITCODE -ne 0) { throw "could not clone the tutorial profile $src" }
    } else {
        New-Item -ItemType Directory -Force $dir | Out-Null
    }
    return $dir
}

function Part {
    <#
      .SYNOPSIS
      A part of Meno's window by its role and its name, as the reader sees it:
      Find-MenoPart, with -Row naming the words of the row it is in (the
      plugin "Blender" for its Add) and -Reveal scrolling it into view.
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

# A question about the network is the reader's to answer, never a run's:
# the yes of every one Meno asks (src/ui/network/ConsentDialog.tsx, "Allow
# and download") is recorded with -NotDone and left.
$script:ConsentYes = "Allow*"

function Test-PressesConsent {
    <#
      .SYNOPSIS
      Whether a step, done, would answer a question about the network yes:
      done at a part named as the yes is, or pressed where one of -Yes (the
      yeses on screen, in shot pixels) is; or keys sent while one is there,
      but Escape, which answers no.
    #>
    param([string] $Do, $At, [object[]] $Path = @(), [string] $Text, [object[]] $Yes = @())
    if ($At -and $At.PSObject.Properties["Name"] -and $At.Name -like $script:ConsentYes) { return $true }
    if (-not $Yes.Count) { return $false }
    if ($Do -in @("Type", "Key", "Shortcut")) { return -not ($Do -eq "Key" -and $Text -eq "Escape") }
    # (where the button goes down or comes up: a click's spot; a drag's first point and its last - a chain led ends in a click there)
    $presses = [System.Collections.Generic.List[object]]::new()
    $presses.Add(@($At.CX, $At.CY))
    if ($Do -eq "Drag") { $presses.Add(@($Path[-1])) }
    foreach ($p in $presses) {
        foreach ($y in $Yes) {
            if ($p[0] -ge $y.X - 4 -and $p[0] -le $y.X + $y.Width + 4 -and $p[1] -ge $y.Y - 4 -and $p[1] -le $y.Y + $y.Height + 4) { return $true }
        }
    }
    return $false
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
      network, which is the reader's to answer - and leaves it undone:
      the run goes on from a profile in which it was done. A step that
      would answer one yes without -NotDone stops the run: at a part
      named Allow..., pressed on one on screen, or keys sent while one is
      there (but Escape, a no).
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
    if (-not $NotDone -and (Test-PressesConsent -Do $Do -At $At -Path $Path -Text $Text -Yes (Get-MenoPartsLike -Role Button -Like $script:ConsentYes))) {
        throw "step $Id would answer a question about the network yes: that is the reader's - record it with -NotDone, and go on from a profile in which it was answered"
    }

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
