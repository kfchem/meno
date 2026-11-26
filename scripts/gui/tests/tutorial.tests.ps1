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

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
