# Which running copies of Meno's executable the harness takes for the app
# (MenoModes.psm1): the command lines of its other modes are passed over, and
# the list of those modes holds every flag the Rust side starts one with. Run
# by hand on either desktop (it loads that module, nothing else; no app is
# started):
#   pwsh -NoProfile -File scripts/gui/tests/modes.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot ".." "MenoModes.psm1") -Force

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}

$mac = "/Users/someone/work/Meno/src-tauri/target/release/bundle/macos/Meno.app/Contents/MacOS/Meno"
$data = "/Users/someone/Library/Application Support/Meno"

Write-Host "the app"
Check "started bare" (Test-MenoWorkerLine $mac) $false
Check "started with a file to open" (Test-MenoWorkerLine "$mac /Users/someone/Desktop/run --pdf.meno") $false
Check "on Windows, quoted" (Test-MenoWorkerLine '"C:\Program Files\Meno\Meno.exe"') $false
Check "no command line to read (the process gone)" (Test-MenoWorkerLine "") $false

Write-Host "the executable's other modes"
Check "a job's runner" (Test-MenoWorkerLine "$mac --job $data/jobs/0042") $true
Check "the PDF reader" (Test-MenoWorkerLine "$mac --pdf $data/pdf-cache") $true
Check "the PDF reader of a build elsewhere, its folder with spaces" (Test-MenoWorkerLine "/Users/someone/papers/eval run/Meno-main.app/Contents/MacOS/Meno --pdf /Users/someone/papers/cache") $true
Check "a job's runner on Windows, quoted" (Test-MenoWorkerLine '"C:\Users\someone\AppData\Local\Meno\Meno.exe" --job C:\Users\someone\AppData\Roaming\Meno\jobs\7') $true
Check "the installer's Office registration" (Test-MenoWorkerLine 'C:\Program Files\Meno\Meno.exe --register-ole') $true
Check "and its removal" (Test-MenoWorkerLine 'C:\Program Files\Meno\Meno.exe --unregister-ole') $true
Check "but not another program's flag of the same name" (Test-MenoWorkerLine "/usr/bin/python3 worker.py --pdf x") $false

Write-Host "every flag the Rust side starts a mode with is in the list"
$src = Join-Path $PSScriptRoot ".." ".." ".." "src-tauri" "src"
$defined = @(Get-ChildItem $src -Filter *.rs -Recurse | ForEach-Object {
    $text = Get-Content -Raw $_.FullName
    # (a mode's flag as a constant - JOB_FLAG, PDF_FLAG - or compared with an argument directly, as the OLE flags are)
    [regex]::Matches($text, 'pub const \w+_FLAG: &str = "(--[a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
    [regex]::Matches($text, 'a == "(--[a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
} | Sort-Object -Unique)
Check "some found (the patterns still match the source)" ($defined.Count -ge 2) $true
foreach ($flag in $defined) { Check "$flag" ((Get-MenoWorkerFlags) -contains $flag) $true }

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
