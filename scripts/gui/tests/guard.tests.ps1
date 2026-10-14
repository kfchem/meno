# The Mac harness's guard against input landing where Meno is not: which
# windows are the system's, and which window a point is on. Run by hand on a
# Mac (it loads the platform module, nothing else; no app is started):
#   pwsh -NoProfile -File scripts/gui/tests/guard.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot ".." "MenoGui.macOS.psm1") -Force

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
function Win([string] $owner, [int] $layer, [double] $x, [double] $y, [double] $w, [double] $h, [int] $procId = 1) {
    [pscustomobject]@{ Owner = $owner; Layer = $layer; X = $x; Y = $y; Width = $w; Height = $h; Pid = $procId; Id = 0 }
}

$meno = Win "Meno" 0 40 40 1280 860 42
$menuBar = @(
    (Win "Window Server" 2147483630 1545 5 29 29),
    (Win "Control Center" 25 1224 0 40 39),
    (Win "Window Server" 24 0 0 1710 25)
)
$prompt = Win "SecurityAgent" 1000 725 218 260 360

Write-Host "a window of the system's"
Check "none, with Meno and the menu bar's (the Window Server's dot, at a layer past 1000)" ((Find-SystemWindow (@($menuBar) + $meno)) -eq $null) $true
Check "an authorization prompt, by its owner" (Find-SystemWindow (@($menuBar) + $prompt + $meno)).Owner "SecurityAgent"
foreach ($o in "UserNotificationCenter", "coreauthd", "universalAccessAuthWarn") {
    Check "$o, at any layer" (Find-SystemWindow @((Win $o 3 900 40 300 80), $meno)).Owner $o
}
Check "any owner's at layer 1000 or more" (Find-SystemWindow @((Win "Something" 1500 100 100 200 200), $meno)).Owner "Something"
Check "but not a small mark of the Window Server's own" ((Find-SystemWindow @((Win "Window Server" 2147483630 10 10 29 29))) -eq $null) $true
Check "nothing listed: none" ((Find-SystemWindow @()) -eq $null) $true

Write-Host "the window a point is on"
$stack = @($menuBar) + $prompt + $meno
Check "a point on Meno, clear of the prompt: Meno's" (Find-WindowAt $stack 300 500).Pid 42
Check "a point under the prompt: the prompt's" (Find-WindowAt $stack 805 221).Owner "SecurityAgent"
Check "a point off every window: none" ((Find-WindowAt $stack 1500 1000) -eq $null) $true
Check "Meno's edge, its right side left out" ((Find-WindowAt @($meno) 1320 500) -eq $null) $true
Check "the menu bar's Window Server mark left out" (Find-WindowAt (@((Win "Window Server" 2147483630 280 280 29 29)) + $meno) 290 290).Pid 42

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
