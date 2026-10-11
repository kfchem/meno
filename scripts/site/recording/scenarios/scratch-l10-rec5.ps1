# L10: chapter 5 recorded. The sample paper beside the page's molecules;
# read in the column; its figure taken whole and carried out onto the page;
# the column closed and everything fitted.
# Run from scripts/gui/scenarios/ (copy it there; see scripts/site/recording/README.md).
# $env:MENO_REC: where the tools are built (bin/) and the recordings go.
if (-not $env:MENO_REC) { throw "set MENO_REC - see scripts/site/recording/README.md" }
$kit = Join-Path $PSScriptRoot "../../site/recording"
$marks = "$env:MENO_REC/r5/marks.csv"
function Mark([string] $name) { Add-Content $marks ("{0},{1}" -f $name, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
Start-Meno
Open-MenoFile "$kit/work/page.meno"
Wait-MenoSettled | Out-Null
Start-Sleep -Seconds 32
Invoke-MenoSwipe -X 1280 -Y 800 -DX 640 -DY 0
Wait-MenoSettled | Out-Null
Open-MenoFile "$env:MENO_REC/taxol-sample-paper.pdf"
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 600
Send-MenoShortcut 1
Start-Sleep -Milliseconds 2500
Wait-MenoSettled | Out-Null
Move-MenoPointer -X 1700 -Y 1300
Start-Sleep -Milliseconds 600
Save-Step "pdf-beside"
$rec = Start-Process -FilePath "$env:MENO_REC/bin/winrec" -ArgumentList @("$env:MENO_REC/r5", "120", "30") -PassThru -RedirectStandardOutput "$env:MENO_REC/r5.log" -RedirectStandardError "$env:MENO_REC/r5.err"
Start-Sleep -Milliseconds 1500
try {
    Mark "read"
    Move-MenoPointer -X 2300 -Y 800
    Start-Sleep -Milliseconds 500
    Invoke-MenoClick -X 2300 -Y 800 -Count 2
    Start-Sleep -Milliseconds 2500
    Move-MenoPointer -X 1580 -Y 1150
    Start-Sleep -Milliseconds 600
    Mark "take"
    Invoke-MenoClick -X 1580 -Y 1280
    Start-Sleep -Milliseconds 900
    Invoke-MenoDrag -FromX 1580 -FromY 1280 -ToX 580 -ToY 1380 -Steps 50 -StepMs 45
    Start-Sleep -Milliseconds 1200
    Move-MenoPointer -X 320 -Y 300
    Start-Sleep -Milliseconds 500
    Mark "close"
    Invoke-MenoClick -X 320 -Y 300 -Count 2
    Start-Sleep -Milliseconds 1500
    Send-MenoShortcut 1
    Start-Sleep -Milliseconds 2500
    Mark "end"
} finally {
    New-Item -ItemType File -Force "$env:MENO_REC/r5/STOP" | Out-Null
    $rec.WaitForExit(20000) | Out-Null
}
