# L10: chapters 1-3 recorded in one take. A simple structure drawn and
# labelled; pulled back to the page of natural products; into the taxol;
# its 3D structure risen and turned; closer, and its conformers stepped
# through on the frames chip. The window is recorded (winrec) throughout;
# each phase's start is marked for cutting.
# Run from scripts/gui/scenarios/ (copy it there; see scripts/site/recording/README.md).
# $env:MENO_REC: where the tools are built (bin/) and the recordings go.
if (-not $env:MENO_REC) { throw "set MENO_REC - see scripts/site/recording/README.md" }
$kit = Join-Path $PSScriptRoot "../../site/recording"
# the view must be the one the clicks below were measured on; the first run measures it
function Assert-L10View([string] $Ref) {
    Copy-Item $script:ShotFiles[-1] "$env:MENO_REC/now-body.png" -Force
    & /usr/bin/sips -c 1400 2560 --cropOffset 80 0 "$env:MENO_REC/now-body.png" | Out-Null
    if (-not (Test-Path $Ref)) { Copy-Item "$env:MENO_REC/now-body.png" $Ref; Write-Host "measured $Ref - check the clicks against this run"; return }
    & "$env:MENO_REC/bin/imgdiff" "$env:MENO_REC/now-body.png" $Ref
    if ($LASTEXITCODE -ne 0) { throw "the view is not the measured one ($Ref)" }
}
$marks = "$env:MENO_REC/r13/marks.csv"
function Mark([string] $name) { Add-Content $marks ("{0},{1}" -f $name, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
Start-Meno
Open-MenoFile "$kit/work/page2.meno"
Wait-MenoSettled | Out-Null
Start-Sleep -Seconds 32
Invoke-MenoWheel -X 1280 -Y 840 -Notches 2
Start-Sleep -Milliseconds 1500
Invoke-MenoWheel -X 260 -Y 840 -Notches -5
Start-Sleep -Milliseconds 1500
Invoke-MenoSwipe -X 1280 -Y 800 -DX -548 -DY 0
Start-Sleep -Milliseconds 1500
Wait-MenoSettled | Out-Null
Move-MenoPointer -X 1700 -Y 1100
Start-Sleep -Milliseconds 500
Save-Step "empty"
$rec = Start-Process -FilePath "$env:MENO_REC/bin/winrec" -ArgumentList @("$env:MENO_REC/r13", "240", "30") -PassThru -RedirectStandardOutput "$env:MENO_REC/r13.log" -RedirectStandardError "$env:MENO_REC/r13.err"
Start-Sleep -Milliseconds 1500
try {
    Mark "draw"
    Invoke-MenoQuickAdd -X 1100 -Y 800 -Item Chain
    $way = @()
    for ($i = 1; $i -le 16; $i++) { $way += , @((1100 + 12 * $i), 800) }
    for ($k = 0; $k -le 40; $k++) {
        $a = -[Math]::PI / 2 + 2 * [Math]::PI * 1.02 * $k / 40
        $way += , @([int](1292 + 80 * [Math]::Cos($a)), [int](880 + 80 * [Math]::Sin($a)))
    }
    for ($i = 1; $i -le 12; $i++) { $way += , @((1292 + 20 * $i), 800) }
    Move-MenoPointerAlong -Path $way
    Invoke-MenoClick -X 1532 -Y 800
    Start-Sleep -Milliseconds 700
    Mark "label"
    Move-MenoPointer -X 1538 -Y 763
    Start-Sleep -Milliseconds 400
    Send-MenoText "oh" -CharMs 220
    Start-Sleep -Milliseconds 500
    Send-MenoKey Enter
    Start-Sleep -Milliseconds 900
    Move-MenoPointer -X 1700 -Y 1100
    Mark "reveal"
    Send-MenoShortcut 1
    Start-Sleep -Milliseconds 3000
    Wait-MenoSettled | Out-Null
    Start-Sleep -Milliseconds 600
    Mark "to-taxol"
    Invoke-MenoSwipe -X 1280 -Y 800 -DX 328 -DY 43
    Start-Sleep -Milliseconds 1500
    Move-MenoPointer -X 1280 -Y 800
    Invoke-MenoWheel -X 1280 -Y 800 -Notches -1
    Start-Sleep -Milliseconds 1500
    Invoke-MenoWheel -X 1280 -Y 800 -Notches -1
    Start-Sleep -Milliseconds 1500
    Start-Sleep -Milliseconds 1500
    Move-MenoPointer -X 1280 -Y 120
    Start-Sleep -Milliseconds 1500
    Save-Step "taxol"
    Assert-L10View "$env:MENO_REC/ref-taxol-body.png"
    Move-MenoPointer -X 760 -Y 900
    Start-Sleep -Milliseconds 300
    Mark "3d"
    Invoke-MenoClick -X 922 -Y 626 -Right
    Start-Sleep -Milliseconds 900
    Invoke-MenoClick -X 1193 -Y 670
    Start-Sleep -Seconds 14
    Wait-MenoSettled -TimeoutMs 20000 | Out-Null
    Move-MenoPointer -X 1500 -Y 1250
    Start-Sleep -Milliseconds 800
    Mark "turn"
    Invoke-MenoDrag -FromX 1500 -FromY 800 -ToX 1800 -ToY 770 -Steps 40 -StepMs 40
    Start-Sleep -Seconds 2
    Mark "closer"
    Invoke-MenoWheel -X 1500 -Y 800 -Notches -1
    Start-Sleep -Milliseconds 2000
    Invoke-MenoWheel -X 1500 -Y 800 -Notches -1
    Start-Sleep -Milliseconds 2000
    Mark "chip"
    Move-MenoPointer -X 1590 -Y 1222
    Start-Sleep -Milliseconds 900
    Mark "conformers"
    Invoke-MenoDrag -FromX 1442 -FromY 1285 -ToX 1750 -ToY 1285 -Steps 84 -StepMs 60 -PressMs 200
    Start-Sleep -Milliseconds 1200
    Mark "end"
} finally {
    New-Item -ItemType File -Force "$env:MENO_REC/r13/STOP" | Out-Null
    $rec.WaitForExit(20000) | Out-Null
}
