# L10: chapter 4 recorded. A taxol alone; a wire out of it, three steps put
# down and wired (Quick Add's lists of plugins are cut out by the marks),
# run from the first, and everything fitted once the results are in.
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
$marks = "$env:MENO_REC/r4/marks.csv"
function Mark([string] $name) { Add-Content $marks ("{0},{1}" -f $name, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/messy-taxol.mol"
Wait-MenoSettled | Out-Null
Start-Sleep -Seconds 32
Move-MenoPointer -X 1280 -Y 120
Send-MenoShortcut K -Shift
Wait-MenoSettled | Out-Null
Invoke-MenoWheel -X 1280 -Y 840 -Notches 3
Wait-MenoSettled | Out-Null
Invoke-MenoSwipe -X 1280 -Y 800 -DX 330 -DY 0
Wait-MenoSettled | Out-Null
Move-MenoPointer -X 1280 -Y 120
Start-Sleep -Milliseconds 600
Save-Step "alone"
Assert-L10View "$env:MENO_REC/ref-alone-body.png"
$rec = Start-Process -FilePath "$env:MENO_REC/bin/winrec" -ArgumentList @("$env:MENO_REC/r4", "200", "30") -PassThru -RedirectStandardOutput "$env:MENO_REC/r4.log" -RedirectStandardError "$env:MENO_REC/r4.err"
Start-Sleep -Milliseconds 1500
try {
    Mark "select"
    Move-MenoPointer -X 810 -Y 724
    Start-Sleep -Milliseconds 300
    Invoke-MenoDrag -FromX 810 -FromY 724 -ToX 810 -ToY 724 -PressMs 700 -Steps 1
    Start-Sleep -Milliseconds 1200
    Mark "wire1"
    Invoke-MenoDrag -FromX 1044 -FromY 870 -ToX 1500 -ToY 870 -Steps 24 -StepMs 45
    Mark "panel1"
    Start-Sleep -Milliseconds 900
    Invoke-MenoClick -X 1740 -Y 800
    Start-Sleep -Milliseconds 400
    Mark "placed1"
    Start-Sleep -Milliseconds 700
    Invoke-MenoDrag -FromX 1756 -FromY 870 -ToX 1920 -ToY 870 -Steps 14 -StepMs 45
    Mark "panel2"
    Start-Sleep -Milliseconds 900
    Invoke-MenoClick -X 2376 -Y 800
    Start-Sleep -Milliseconds 400
    Mark "placed2"
    Start-Sleep -Milliseconds 700
    Invoke-MenoDrag -FromX 2176 -FromY 870 -ToX 2290 -ToY 870 -Steps 12 -StepMs 45
    Mark "panel3"
    Start-Sleep -Milliseconds 900
    Invoke-MenoClick -X 2074 -Y 728
    Start-Sleep -Milliseconds 400
    Mark "placed3"
    Move-MenoPointer -X 1500 -Y 1200
    Start-Sleep -Milliseconds 900
    Mark "run"
    Invoke-MenoClick -X 1628 -Y 882 -Right
    Start-Sleep -Milliseconds 900
    Invoke-MenoClick -X 1750 -Y 928
    Move-MenoPointer -X 1500 -Y 1200
    Start-Sleep -Seconds 50
    Mark "fit"
    Send-MenoShortcut 1
    Start-Sleep -Seconds 3
    Mark "end"
} finally {
    New-Item -ItemType File -Force "$env:MENO_REC/r4/STOP" | Out-Null
    $rec.WaitForExit(20000) | Out-Null
}
