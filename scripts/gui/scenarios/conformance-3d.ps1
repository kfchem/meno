# The maintainer's rulings on molecules in 3D, each turned into a step and a
# shot (docs/WORKSPACE.md; bug hunt A) - to run again on every release
# candidate. What each shot must show:
#
# - "ribbons-no-water": a protein from a PDB entry (1STP: streptavidin with
#   biotin, in 86 waters) drawn as ribbons, its ligand and the side chains
#   round it as atoms, and no water at all.
# - "frames-kcal": a set of conformers read from an XYZ file with energies:
#   the chip under it says "1 / 9 · 0.00 kcal/mol".
# - "chip-pointed": the pointer on the chip: it stays as it was, closed.
#   "chip-clicked": clicked, it opens (the bars and the slider).
#   "chip-chosen": a right-click on the molecule (which chooses it) leaves
#   the chip closed: it opens on a click only.
# - "chip-wheel": the wheel turned over the chip zooms the page, as it does
#   over the molecule: the molecule smaller.
# - "style-secondary": a double-click on the molecule turns it to the
#   secondary style (space-filling by default). "style-kept": after another
#   tab and back, it is still secondary - a molecule's own, not the page's
#   ("made-3d" shows another molecule in the primary style meanwhile).
# - "orthographic": the molecule, back in the primary style, turned end on:
#   atoms of one element are as large however near or far they are.
# - "stack-one": an SD file of 60 molecules in 3D opened as a stack: one
#   shown, its chip "1 / 60" and the record's title. "stack-next": the
#   chip clicked open and its slider dragged: another record, its title with
#   it. "stack-grid": "Lay out as a grid" (right-click) lays them all out.
# - "set-torsion": four atoms chosen in a row, "Set torsion angle…", 270
#   typed: -90°, gone round. "set-angle": three, 200 typed: 179°, the most.
#   "set-distance": two, 0.1 typed: 0.50 Å, the least.
# - "made-3d": a drawing's right-click "3D structure": conformers beside it,
#   their chip in kcal/mol with each one's share. "make-again": the drawing
#   changed - an atom added - the molecule says so and offers "Make again";
#   "made-again": clicked, made again from the drawing (seven carbons).
# - "hide-h-asked": Settings, Molecules in 3D, hydrogens on carbon Hidden:
#   the strong question first ("Hide hydrogens? This 3D picture will be
#   wrong.", "Keep hydrogens" the default, "Hide hydrogens anyway" only once
#   the box is ticked). "hide-h-enter": Enter keeps them (Shown still
#   chosen). "hide-h-marked": hidden, a molecule in that style says "C–H
#   hidden". "hide-h-export": its picture exported as SVG carries the mark
#   too: checked in the file, said as PASS or FAIL in the run's log.
# - "lone-ch4": a lone carbon (CH4) made 3D: methane. "lone-thf": a lone
#   atom labelled THF made 3D: tetrahydrofuran. "lone-ion": Na+ alone: a
#   message in words, no 3D.
#
# Places are read off a Mac's 2560x1720 shot of the 1280x860 window (2026-10-13;
# Windows wants its own). FRESH set in the environment: the run starts from an
# emptied settings.json (whoever runs it empties it, and puts it back after),
# which first asks about keeping Meno up to date - answered Not now.

$D = Join-Path (Resolve-Path "$PSScriptRoot/../../..") "dev-samples"

# a press held still for so long and let go where it was: a click as a hand gives it
function Hand([int] $X, [int] $Y, [int] $Ms = 110, [switch] $Right) {
  Invoke-MenoDrag -FromX $X -FromY $Y -ToX $X -ToY $Y -Steps 1 -StepMs 10 -PressMs ($Ms - 10) -Right:$Right
}
function Away { Move-MenoPointer -X 2400 -Y 1650; Start-Sleep -Milliseconds 500 }
function Calm { Send-MenoKey Escape; Start-Sleep -Milliseconds 250; Away }
function Opened([string] $Name, [int] $Ms = 3000) {
  Open-MenoFile (Join-Path $D $Name)
  Start-Sleep -Milliseconds $Ms
  Send-MenoShortcut 1
  Wait-MenoSettled | Out-Null
  Calm
}
# a tab of the strip, by its place (each 392 wide, the first's middle at x 365)
function Tab([int] $Index) { Invoke-MenoClick -X (365 + 392 * $Index) -Y 42; Start-Sleep -Milliseconds 1200; Away }
# atoms of a molecule in 3D chosen in order, each with a quick click, after a click on empty space lets go of what was
function Choose([int[][]] $Atoms) {
  Invoke-MenoClick -X 1280 -Y 220; Start-Sleep -Milliseconds 500
  foreach ($a in $Atoms) { Invoke-MenoClick -X $a[0] -Y $a[1]; Start-Sleep -Milliseconds 450 }
}
# a measurement's Set item from the right-click on the last atom chosen, and a value typed
function SetTo([int] $X, [int] $Y, [string] $Value) {
  Hand $X $Y -Right
  Start-Sleep -Milliseconds 700
  Invoke-MenoClick -X ($X + 142) -Y ($Y + 195)
  Start-Sleep -Milliseconds 800
  Send-MenoText $Value
  Send-MenoKey Enter
  Start-Sleep -Milliseconds 1200
  Away
}

Start-Meno
Start-Sleep -Milliseconds 800
if ($env:FRESH) { Save-Step "fresh-first"; Invoke-MenoClick -X 1257 -Y 1126; Start-Sleep -Milliseconds 800 }

# -- tab 0: a protein in water
Opened "1STP.pdb" 4000
Save-Step "ribbons-no-water"

# -- tab 1: conformers with energies
Opened "ethyl-pentanoate-conformers.xyz"
Save-Step "frames-kcal"
Move-MenoPointer -X 1222 -Y 1430
Start-Sleep -Milliseconds 900
Save-Step "chip-pointed"
Hand 1222 1430
Start-Sleep -Milliseconds 900
Save-Step "chip-clicked"
Calm
Hand 1280 900 -Right
Start-Sleep -Milliseconds 900
Save-Step "chip-chosen"
Calm
Invoke-MenoWheel -X 1222 -Y 1430 -Notches 3
Start-Sleep -Milliseconds 900
Save-Step "chip-wheel"
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Calm
Invoke-MenoClick -X 1150 -Y 900 -Count 2
Start-Sleep -Milliseconds 1500
Away
Save-Step "style-secondary"

# -- tab 2: a stack of 60 records
Opened "many3d.sdf"
Save-Step "stack-one"
# (cholesterol's O, the carbon it is on (C1), the next (C2) and C2's H; the H on the O)
$O = @(202, 887); $C1 = @(381, 896); $C2 = @(506, 989); $HO = @(128, 829); $H2 = @(460, 1130)
Choose @($C2, $C1, $O, $HO)
SetTo $HO[0] $HO[1] "270"
Save-Step "set-torsion"
Choose @($C2, $C1, $O)
SetTo $O[0] $O[1] "200"
Save-Step "set-angle"
Choose @($C2, $H2)
SetTo $H2[0] $H2[1] "0.1"
Save-Step "set-distance"
Invoke-MenoClick -X 1280 -Y 220; Start-Sleep -Milliseconds 500
Hand 1322 1400
Start-Sleep -Milliseconds 900
Save-Step "stack-chip-open"
Invoke-MenoDrag -FromX 946 -FromY 1404 -ToX 1300 -ToY 1404 -Steps 12
Start-Sleep -Milliseconds 1200
Away
Save-Step "stack-next"
Calm

# -- the conformers again: their style kept; back to the primary one, turned end on
Tab 1
Save-Step "style-kept"
Invoke-MenoClick -X 1150 -Y 900 -Count 2
Start-Sleep -Milliseconds 1500
Away
# (a drag on the molecule turns it; held still before it is let go, it stops there)
Invoke-MenoDrag -FromX 1164 -FromY 1032 -ToX 1764 -ToY 1032 -Steps 30 -StepMs 30 -AtStep { param($i) if ($i -eq 30) { Start-Sleep -Milliseconds 700 } }
Start-Sleep -Milliseconds 2500
Away
Save-Step "orthographic"

# -- tab 3: a drawing made 3D, changed, and made again; a lone carbon
Opened "hexane2d.mol" 2500
Add-MenoSmiles "C" -X 1280 -Y 1400
Wait-MenoSettled | Out-Null
Calm
Hand 1156 972 -Right
Start-Sleep -Milliseconds 700
Invoke-MenoClick -X (1156 + 273) -Y (972 + 46)
Start-Sleep -Milliseconds 15000
Away
Save-Step "made-3d"
Invoke-MenoClick -X 960 -Y 724 -Count 2
Start-Sleep -Milliseconds 1500
Away
Save-Step "make-again"
Invoke-MenoClick -X 2163 -Y 1177
Start-Sleep -Milliseconds 15000
Away
Save-Step "made-again"

# -- Settings: hydrogens on carbon hidden, behind its question
Invoke-MenoClick -X 2515 -Y 38
Start-Sleep -Milliseconds 1200
Invoke-MenoClick -X 762 -Y 160
Start-Sleep -Milliseconds 1000
$Hidden = @(1466, 1338); $Box = @(884, 1049); $Anyway = @(1272, 1193)
Invoke-MenoClick -X $Hidden[0] -Y $Hidden[1]
Start-Sleep -Milliseconds 900
Save-Step "hide-h-asked"
Send-MenoKey Enter
Start-Sleep -Milliseconds 900
Save-Step "hide-h-enter"
# (the box ticked, Enter still keeps them)
Invoke-MenoClick -X $Hidden[0] -Y $Hidden[1]
Start-Sleep -Milliseconds 900
Invoke-MenoClick -X $Box[0] -Y $Box[1]
Start-Sleep -Milliseconds 400
Send-MenoKey Enter
Start-Sleep -Milliseconds 900
Save-Step "hide-h-ticked-enter"
Send-MenoKey Escape
Start-Sleep -Milliseconds 500
Invoke-MenoClick -X $Hidden[0] -Y $Hidden[1]
Start-Sleep -Milliseconds 900
Invoke-MenoClick -X $Box[0] -Y $Box[1]
Start-Sleep -Milliseconds 400
Invoke-MenoClick -X $Anyway[0] -Y $Anyway[1]
Start-Sleep -Milliseconds 900
Save-Step "hide-h-hidden"

# -- the drawing's molecule, its hydrogens on carbon hidden: marked, and exported with the mark
Tab 3
Save-Step "hide-h-marked"
Hand 1899 694 -Ms 800
Start-Sleep -Milliseconds 600
Hand 1899 694 -Right
Start-Sleep -Milliseconds 700
Invoke-MenoClick -X (1899 + 78) -Y (694 + 278)
Start-Sleep -Milliseconds 1200
Invoke-MenoClick -X 1272 -Y 206
Start-Sleep -Milliseconds 800
Save-Step "export-svg"
$svg = Join-Path $Out "c-h-hidden.svg"
Invoke-MenoClick -X 1552 -Y 306
try {
  Complete-SaveDialog -Path $svg
  Get-MenoWindow -ProcessName Meno -TimeoutSec 10 | Out-Null
  Set-MenoWindow -Width $Width -Height $Height
  Wait-MenoSettled -TimeoutMs 8000 | Out-Null
} catch { Write-Host "  hide-h-export: no save panel came ($_)" }
Start-Sleep -Milliseconds 1500
if ((Test-Path $svg) -and ((Get-Content -Raw $svg) -match "C–H hidden")) { Write-Host "  hide-h-export: PASS - the SVG says C-H hidden" }
else { Write-Host "  hide-h-export: FAIL - $(if (Test-Path $svg) { 'the SVG has no C-H hidden mark' } else { 'no SVG written' })" }
Calm

# -- tab 5: lone atoms, in a drawing of their own: Na+, a carbon labelled THF, and a carbon (CH4);
# the ion first, which makes nothing, and methane last (each made moves the view)
Opened "hexane2d.mol" 2500
Add-MenoSmiles "[Na+]" -X 700 -Y 1400
Wait-MenoSettled | Out-Null
Calm
Add-MenoSmiles "C" -X 1280 -Y 1400
Wait-MenoSettled | Out-Null
Calm
Add-MenoSmiles "C" -X 1860 -Y 1400
Wait-MenoSettled | Out-Null
Calm
Hand 1860 1410
Start-Sleep -Milliseconds 900
Send-MenoText "THF"
Send-MenoKey Enter
Start-Sleep -Milliseconds 800
Calm
Save-Step "lone-drawn"
foreach ($lone in @(@(700, "lone-ion", 8000), @(1860, "lone-thf", 12000), @(1280, "lone-ch4", 12000))) {
  Hand $lone[0] 1410 -Right
  Start-Sleep -Milliseconds 700
  Invoke-MenoClick -X ($lone[0] + 273) -Y (1410 + 46)
  Start-Sleep -Milliseconds $lone[2]
  Away
  Save-Step $lone[1]
}

# -- tab 6: the stack again, laid out as a grid
Opened "many3d.sdf"
Hand $C1[0] $C1[1] -Right
Start-Sleep -Milliseconds 700
Invoke-MenoClick -X ($C1[0] + 125) -Y ($C1[1] + 132)
Start-Sleep -Milliseconds 2500
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Away
Save-Step "stack-grid"
