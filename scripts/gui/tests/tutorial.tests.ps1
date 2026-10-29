# The recorder of the manual's how-to pages (MenoTutorial.psm1): what a
# step keeps for the page to mark, a drag's way point by point, and the
# guard that keeps a run from answering a question about the network yes.
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
function Part($name, [int] $x, [int] $y, [int] $w, [int] $h) {
    [pscustomobject]@{ Role = "AXButton"; Name = $name; X = $x; Y = $y; Width = $w; Height = $h; CX = $x + [int]($w / 2); CY = $y + [int]($h / 2); Near = $null }
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

Write-Host "a question about the network"
$allow = Part "Allow and download" 1300 900 220 60
$notNow = Part "Not now" 1180 900 100 60
$yes = @([pscustomobject]@{ Name = "Allow and download"; X = 1300; Y = 900; Width = 220; Height = 60 })
$guard = { param($do, $at, $path, $text, $yes) Test-PressesConsent -Do $do -At $at -Path $path -Text $text -Yes $yes }
Check "a click on Allow and download, found by its name" (& $tutorial $guard Click $allow @() "" @()) $true
Check "a double click on it" (& $tutorial $guard DoubleClick $allow @() "" $yes) $true
Check "a click on Not now" (& $tutorial $guard Click $notNow @() "" $yes) $false
Check "a click at a point over the yes on screen" (& $tutorial $guard Click (Point 1400 930) @() "" $yes) $true
Check "a click at a point away from it" (& $tutorial $guard Click (Point 400 300) @() "" $yes) $false
Check "a chain led to end on it" (& $tutorial $guard Drag (Point 400 300) @(@(900, 600), @(1410, 925)) "" $yes) $true
Check "Enter while it is asked" (& $tutorial $guard Key $null @() "Enter" $yes) $true
Check "Escape while it is asked (a no)" (& $tutorial $guard Key $null @() "Escape" $yes) $false
Check "words typed while it is asked" (& $tutorial $guard Type $null @() "OMe" $yes) $true
Check "Enter with no question asked" (& $tutorial $guard Key $null @() "Enter" @()) $false

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
