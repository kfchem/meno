# A result set's molecules' chips (an xTB run's): pointed at and clicked, they say what the calculation found.
# Shots: "ran", "results-fit", "hover", "click".
$Fixtures = Join-Path $PSScriptRoot "../fixtures"
function Menu([int] $Y) { Move-MenoPointer -X 2120 -Y $Y; Start-Sleep -Milliseconds 300; Invoke-MenoClick -X 2120 -Y $Y -Right; Start-Sleep -Milliseconds 700 }
function Away { Move-MenoPointer -X 600 -Y 1500; Start-Sleep -Milliseconds 300 }
Start-Meno
Start-Sleep -Seconds 3
Open-MenoFile (Join-Path $Fixtures "conformance-workflows.meno"); Start-Sleep -Seconds 4
Send-MenoShortcut 1; Start-Sleep -Milliseconds 1800
Away
Move-MenoPointer -X 2061 -Y 512; Start-Sleep -Milliseconds 300
Invoke-MenoClick -X 2061 -Y 512 -Right; Start-Sleep -Milliseconds 800
Save-Step "xtb-menu"
Invoke-MenoClick -X 2106 -Y 559; Away; Start-Sleep -Seconds 9
Send-MenoShortcut 1; Start-Sleep -Milliseconds 1800
Away
Save-Step "ran-fit"
# the third result molecule's chip: pointed at, then clicked
Move-MenoPointer -X 2275 -Y 901; Start-Sleep -Milliseconds 1200
Save-Step "chip-hover"
Invoke-MenoClick -X 2275 -Y 901; Start-Sleep -Milliseconds 1200
Save-Step "chip-click"
