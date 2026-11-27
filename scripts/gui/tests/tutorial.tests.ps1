# The recorder of the manual's how-to pages (MenoTutorial.psm1): what a
# step keeps for the page to mark, and a drag's way point by point. (The
# guard that keeps a run from answering a question about the network yes is
# the platform modules', checked by consent.tests.ps1.)
# Run by hand on either desktop (it loads that module, nothing else; no app
# is started):
#   pwsh -NoProfile -File scripts/gui/tests/tutorial.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$tutorial = Import-Module (Join-Path $PSScriptRoot ".." "MenoTutorial.psm1") -Force -PassThru

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
# (a path as steps.json writes it: [x,y] [x,y] ...)
function Show($points) { ($points | ForEach-Object { "[" + (@($_) -join ",") + "]" }) -join " " }
function Part($name, [int] $x, [int] $y, [int] $w, [int] $h, $near) {
    [pscustomobject]@{ Role = "AXButton"; Name = $name; X = $x; Y = $y; Width = $w; Height = $h; CX = $x + [int]($w / 2); CY = $y + [int]($h / 2); Near = $near }
}
function Point([int] $x, [int] $y) { [pscustomobject]@{ X = $x; Y = $y; Width = 0; Height = 0; CX = $x; CY = $y } }

Write-Host "a drag's way"
$via = & $tutorial { Get-DragVia -Path @(@(300, 1150), @(400, 1200)) }
Check "two points: the first passed through, as a point" "$($via.Count) $(Show $via)" "1 [300,1150]"
$via = & $tutorial { Get-DragVia -Path @(, @(300, 1150)) }
Check "one point: none passed through" $via.Count 0
$via = & $tutorial { Get-DragVia -Path @(@(1, 2), @(3, 4), @(5, 6)) }
Check "three points: the first two" "$($via.Count) $(Show $via)" "2 [1,2] [3,4]"

Write-Host "what a step keeps"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(@(300, 1150), @(400, 1200)) } (Point 1490 1060)
Check "a drag of two points, from where it begins" "$($mark.kind) $(Show $mark.path)" "drag [1490,1060] [300,1150] [400,1200]"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(, @(300, 1150)) } (Point 1490 1060)
Check "a drag of one point" (Show $mark.path) "[1490,1060] [300,1150]"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(@(1, 2), @(3, 4)) -Traced } (Point 0 0)
Check "a chain led: a trace" $mark.kind "trace"
$mark = & $tutorial { New-StepMark -Do Type -Text "OMe" }
Check "words typed where nothing is marked: no place kept" "$($mark.kind) $($mark.Contains('x')) $($mark.text)" "type False OMe"
$mark = & $tutorial { param($at) New-StepMark -Do Click -At $at } (Part "Go" 100 200 60 30 ([pscustomobject]@{ X = 40; Y = 150; Width = 300; Height = 120 }))
Check "a click on a part found within another: the part and what holds it" "$($mark.kind) $($mark.x),$($mark.y),$($mark.w),$($mark.h) $($mark.near -join ',')" "click 100,200,60,30 40,150,300,120"
$mark = & $tutorial { param($at) New-StepMark -Do RightClick -At $at } (Point 500 400)
Check "a right-click at a point: no size, nothing near" "$($mark.kind) $($mark.w) $($mark.Contains('near'))" "rightclick 0 False"

Write-Host "a copy of a prepared home"
# (a prepared home made here, of invented files, in a folder of the system's for temporary ones)
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("meno-ready-test-" + [guid]::NewGuid().ToString("n"))
function Put([string] $rel, [string] $text = "x") {
    $path = Join-Path $scratch $rel
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    [System.IO.File]::WriteAllText($path, $text)
}
function Listing([string] $root) {
    # (every entry under a folder, with what a file holds and where a link goes: the same listing, the same folder)
    (Get-ChildItem -Recurse -Force $root | Sort-Object FullName | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length)
        if ($_.LinkType) { "$rel -> $($_.LinkTarget)" }
        elseif ($_.PSIsContainer) { "$rel/" }
        else { "$rel $((Get-FileHash $_.FullName).Hash) $($_.LastWriteTimeUtc.Ticks)" }
    }) -join "`n"
}
$meno = "home/Library/Application Support/Meno"
$settings = [ordered]@{
    network = [ordered]@{ offline = $false; granted = @("plugin-catalogue") }
    plugins = [ordered]@{ removed = @(); roles = @{ smiles = "sketchkit" }; programs = @{ "sketchkit:tool" = "/Users/someone/bin/tool" }; firstSetUp = "done" }
    files = [ordered]@{ read = @{}; also = @{}; before = @{ xyz = @{ name = "Viewer"; path = "/Applications/Viewer.app" } } }
    procedures = @(@{ name = "mine" }); abbreviations = @(@{ label = "Qq" }); options = @{ "role:conformers" = @{ n = 5 } }
    calculations = @{ cores = 6 }; pointer = @{ wheelUp = "out" }
}
Put "$meno/settings.json" (ConvertTo-Json $settings -Depth 8)
Put "$meno/plugins/sketchkit/current" "0.1.0"
Put "$meno/plugins/sketchkit/0.1.0/manifest.json" "{}"
Put "$meno/plugins/.staging/half/manifest.json" "{}"
Put "$meno/uv/stamps/plugin-sketchkit.json" "{}"
Put "$meno/uv/cache/wheel.txt" "a wheel"
Put "$meno/uv/python/real/bin/python" "a python"
Put "$meno/uv/plugin-sketchkit/venv/pyvenv.cfg" "home = there"
Put "$meno/uv/plugin-sketchkit/files/data.txt" "downloaded"
Put "$meno/pixi/plugin-render/activation.json" "{}"
Put "$meno/pixi/plugin-render/.pixi/envs/default/x" "x"
Put "$meno/pixi/plugin-render/pixi.toml" "[project]"
Put "$meno/tools/uv/0.0.1/uv" "uv"
Put "$meno/catalogue.json" "{}"
Put "$meno/logs/Meno.log" "a log"
Put "$meno/network-log.jsonl" "{}"
Put "$meno/window-state.json" "{}"
Put "$meno/jobs/one/job.json" "{}"
Put "$meno/jobs-folder.json" "{}"
Put "home/Library/Caches/Meno/pdf/a.pdf" "%PDF"
Put "home/Library/WebKit/Meno/x" "x"
$home1 = Join-Path $scratch "home"
if (-not $IsWindows) {
    # (uv's link to the Python it got, at its full path in the prepared home)
    New-Item -ItemType SymbolicLink -Path (Join-Path $scratch "$meno/uv/python/cpython-3") -Target (Join-Path $scratch "$meno/uv/python/real") | Out-Null
}
$before = Listing $home1
$copy = Join-Path $scratch "run/home-ready-1"
try {
    if ($IsWindows) {
        $err = try { & $tutorial { param($f, $t) Copy-ReadyHome -From $f -To $t } $home1 $copy; "" } catch { "$_" }
        Check "on Windows: no copy, saying why" ($err -like "*for a Mac*") $true
    } else {
        & $tutorial { param($f, $t) Copy-ReadyHome -From $f -To $t } $home1 $copy | Out-Null
        $to = Join-Path $copy "Library/Application Support/Meno"
        Check "the prepared home untouched" ((Listing $home1) -ceq $before) $true
        $kept = @("plugins/sketchkit/0.1.0/manifest.json", "uv/stamps/plugin-sketchkit.json", "uv/cache/wheel.txt", "uv/plugin-sketchkit/files/data.txt", "pixi/plugin-render/pixi.toml", "tools/uv/0.0.1/uv", "catalogue.json")
        Check "the plugins, their makers' folders, the tools and the list copied" (@($kept | Where-Object { -not (Test-Path (Join-Path $to $_)) }) -join ", ") ""
        $gone = @("logs", "network-log.jsonl", "window-state.json", "jobs", "jobs-folder.json", "plugins/.staging", "uv/plugin-sketchkit/venv", "pixi/plugin-render/.pixi", "pixi/plugin-render/activation.json")
        Check "the log, the window's place, jobs, a set-up cut short and what names where it was made left out" (@($gone | Where-Object { Test-Path (Join-Path $to $_) }) -join ", ") ""
        Check "nothing outside Meno's folder: no caches, no web view's folders" (@(Get-ChildItem -Force (Join-Path $copy "Library")).Name -join ", ") "Application Support"
        $link = Get-Item (Join-Path $to "uv/python/cpython-3")
        Check "a link into the prepared home points into the copy" $link.LinkTarget ([System.IO.Path]::GetFullPath($copy) + "/Library/Application Support/Meno/uv/python/real")
        $s = Get-Content -Raw (Join-Path $to "settings.json") | ConvertFrom-Json -AsHashtable
        Check "what was allowed and set up kept" "$($s.network.granted -join ',') $($s.plugins.firstSetUp) $($s.plugins.roles.smiles) $($s.pointer.wheelUp)" "plugin-catalogue done sketchkit out"
        Check "programs located, apps before, procedures, abbreviations, options and cores emptied" "$($s.plugins.programs.Count) $($s.files.Contains('before')) $(@($s.procedures).Count) $(@($s.abbreviations).Count) $($s.options.Count) $($s.calculations.Count)" "0 False 0 0 0 0"
        $err = try { & $tutorial { param($f, $t) Copy-ReadyHome -From $f -To $t } $home1 $copy; "" } catch { "$_" }
        Check "never over a copy already there" ($err -like "*there already*") $true
    }

    $fail = { param($f, $repo) try { & $tutorial { param($f, $t, $r) Copy-ReadyHome -From $f -To $t -Repository $r } $f (Join-Path $scratch ("x-" + [guid]::NewGuid().ToString("n"))) $repo; "" } catch { "$_" } }
    Check "no such folder: said so" ((& $fail (Join-Path $scratch "none") "") -like "no prepared home to copy: there is no folder*") $true
    New-Item -ItemType Directory -Force (Join-Path $scratch "empty") | Out-Null
    Check "a folder Meno was never started in: said so" ((& $fail (Join-Path $scratch "empty") "") -like "*holds no Meno started there*") $true
    Put "unanswered/Library/Application Support/Meno/settings.json" '{"plugins": {"removed": []}}'
    Check "a home whose first card was not answered: said so" ((& $fail (Join-Path $scratch "unanswered") "") -like "*never answered*") $true
    Check "a home in the repository: refused" ((& $fail $home1 $scratch) -like "*is in the repository*") $true
    Check "this account's own home: refused" ((& $fail ([Environment]::GetFolderPath("UserProfile")) "") -like "*this account's own home*") $true
    & $tutorial { param($raw) Start-Tutorial -Raw $raw -Dest $raw } (Join-Path $scratch "run2")
    $err = try { & $tutorial { New-TutorialHome -Ready } | Out-Null; "" } catch { "$_" }
    Check "-Ready with no prepared home given: where to give it" ($err -like "*-ReadyHome*MENO_TUTORIAL_HOME*") $true
} finally {
    Remove-Item -Recurse -Force $scratch -ErrorAction SilentlyContinue
}

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
