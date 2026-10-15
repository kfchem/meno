# Switching between the conformers of a molecule made in 3D (the numbering of equivalent hydrogens and branches across the conformers
# of RDKit's search): a drawing of 3-methyl-2-butanol with one more CH2 (a stereocentre, an isopropyl, a CH2), made in 3D, its frames
# stepped by the frames chip. Shots: "drawn", "menu", "made", then "frame-1" ... "frame-4".
$Fixtures = Join-Path $PSScriptRoot "../fixtures"
function Hand([int] $X, [int] $Y, [int] $Ms = 110, [switch] $Right) {
  Invoke-MenoDrag -FromX $X -FromY $Y -ToX $X -ToY $Y -Steps 1 -StepMs 10 -PressMs ($Ms - 10) -Right:$Right
}
function Film([string] $Name, [int] $Secs, [scriptblock] $Act) {
  $wid = Get-MenoWindow
  $p = Start-Process -FilePath /usr/sbin/screencapture -ArgumentList @("-v", "-V$Secs", "-l$wid", "-x", (Join-Path $Out "$Name.mov")) -PassThru
  Start-Sleep -Milliseconds 500
  & $Act
  $null = $p.WaitForExit(($Secs + 4) * 1000)
}
Start-Meno
Start-Sleep -Milliseconds 1500
Send-MenoKey Escape
Start-Sleep -Milliseconds 500
Add-MenoSmiles "CC[C@@H](C(C)C)[C@H](C)O" -X 900 -Y 700
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 1500
Save-Step "drawn"
Hand 900 700 -Right
Start-Sleep -Milliseconds 700
Save-Step "menu"
Invoke-MenoClick -X 1174 -Y 746
Start-Sleep -Seconds 11
Move-MenoPointer -X 1481 -Y 931
Start-Sleep -Milliseconds 700
Save-Step "made"
# the chip opened (a click), its bars one for each conformer, lowest on the left: four conformers visited and back, filmed
Move-MenoPointer -X 1560 -Y 931
Start-Sleep -Milliseconds 700
Hand 1560 931
Start-Sleep -Milliseconds 1200
$barY = 954
function BarX([int] $i) { [int](1303 + $i * 20.4) }
Save-Step "chip-open"
Film "switch" 16 {
  foreach ($i in 0, 3, 6, 9, 12, 9, 6, 3, 0) { Hand (BarX $i) $barY; Start-Sleep -Milliseconds 1500 }
}
foreach ($i in 3, 6, 9) {
  Hand (BarX $i) $barY
  Start-Sleep -Milliseconds 1300
  Save-Step ("conformer-" + ($i + 1))
}
