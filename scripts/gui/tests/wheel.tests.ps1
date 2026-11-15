# Which way the Meno under test has a turn of the wheel zoom, as its
# settings.json says (MenoSettings.psm1), for Invoke-MenoZoom. Run by hand on
# either desktop (it loads that module, nothing else; no app is started):
#   pwsh -NoProfile -File scripts/gui/tests/wheel.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot ".." "MenoSettings.psm1") -Force

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
$dir = Join-Path ([System.IO.Path]::GetTempPath()) "meno-wheel-$PID"
New-Item -ItemType Directory -Force $dir | Out-Null
function Settings([string] $text) { $f = Join-Path $dir "settings.json"; [System.IO.File]::WriteAllText($f, $text); $f }

try {
    Write-Host "the wheel turned upwards"
    Check "no settings.json: Meno's default, in" (Read-MenoWheelUp -Path (Join-Path $dir "none.json")) "in"
    Check "Zooms in" (Read-MenoWheelUp -Path (Settings '{"pointer":{"wheelUp":"in"}}')) "in"
    Check "Zooms out" (Read-MenoWheelUp -Path (Settings '{"pointer":{"wheelUp":"out"},"style":{}}')) "out"
    Check "no pointer settings: the default" (Read-MenoWheelUp -Path (Settings '{"style":{}}')) "in"
    Check "something else there: the default, as Meno takes it" (Read-MenoWheelUp -Path (Settings '{"pointer":{"wheelUp":"sideways"}}')) "in"
    Check "a file that is not JSON: the default" (Read-MenoWheelUp -Path (Settings 'not json')) "in"
} finally {
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
