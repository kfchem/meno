# The maintainer's rulings on 2D drawing, each turned into a step and a shot
# (docs/EDITOR-2D.md; bug hunt B, PR #279) - to run again on every release
# candidate. What each shot must show:
#
# - "drag-moves-atom": a plain drag on an atom moves it (not a bond drawn).
# - "long-press-selects": a press held still on an atom selects the whole
#   structure, the shade spread from the atom.
# - "double-click-bond": a double-click on an atom draws one bond.
# - "triple-click-chain": three clicks on an atom begin a chain the pointer
#   leads; a click ends it.
# - "double-click-empty": a double-click on empty space opens Quick Add.
# - "long-press-box": held still on empty space and dragged: a box.
# - "charge-plus": + over an atom: O+ drawn with a circled plus; - takes it
#   back. "charge-carbon": a charged carbon shows its sign, no "C".
# - "stereo-hidden": a stereocentre and an E double bond: no R/S, no E/Z.
# - "stereo-shown": after Show R/S and E/Z (menu on empty space): S and E,
#   italic, bare (no parentheses), in the drawing's ink (no colour).
# - "escape-drag": an atom dragged, Escape on the way: back where it was.
# - "menu-click-only-closes": with an atom's menu open, a click on another
#   atom only closes the menu - no label begins.
# - "paste-twice": a second Cmd+V at the same place lands a step down and
#   to the right.
# - "h-of-ho": a double-click on the H of HO draws a bond from the O.
# - "ho-typed": ho typed over an atom reads as a hydroxy (OH or HO).
#
# Phenylethanol from a SMILES, in the middle of a Mac's 2560x1720 shot (read
# off it on 2026-10-13; Windows wants its own): its
# atoms O 1066,998 (HO, its H about 1036,998); C1 1156,948; C2 1238,996;
# ipso 1321,948; the ring 1321,851, 1404,804, 1487,851, 1487,948, 1404,996.
#
# FRESH set in the environment: the run starts from an emptied settings.json
# (whoever runs it empties it, and puts it back after), which first asks
# about keeping Meno up to date.

# a press held still for so long and let go where it was: a click as a hand
# gives it (Invoke-MenoClick's is quicker than a hand's, too quick for what
# shows while the button is down), or a long press
function Hand([int] $X, [int] $Y, [int] $Ms = 110, [switch] $Right) {
  Invoke-MenoDrag -FromX $X -FromY $Y -ToX $X -ToY $Y -Steps 1 -StepMs 10 -PressMs ($Ms - 10) -Right:$Right
}
function Calm { Send-MenoKey Escape; Start-Sleep -Milliseconds 250; Hand 1800 560; Start-Sleep -Milliseconds 700; Move-MenoPointer -X 1850 -Y 600; Start-Sleep -Milliseconds 300 }
function Undo([int] $Times = 1) { foreach ($i in 1..$Times) { Send-MenoShortcut Z; Start-Sleep -Milliseconds 400 } }

Start-Meno
Start-Sleep -Milliseconds 800
# from a fresh profile (settings.json emptied for the run): "Not now" to keeping Meno up to date
if ($env:FRESH) { Invoke-MenoClick -X 1257 -Y 1126; Start-Sleep -Milliseconds 800 }
Add-MenoSmiles "OCCc1ccccc1"
Wait-MenoSettled | Out-Null
Calm

Invoke-MenoDrag -FromX 1238 -FromY 996 -ToX 1238 -ToY 1110 -Steps 12
Start-Sleep -Milliseconds 600
Save-Step "drag-moves-atom"
Undo

Hand 1404 804 -Ms 700
Start-Sleep -Milliseconds 400
Save-Step "long-press-selects"
Calm

Invoke-MenoClick -X 1404 -Y 804 -Count 2
Start-Sleep -Milliseconds 700
Save-Step "double-click-bond"
Undo
Calm

Invoke-MenoClick -X 1487 -Y 948 -Count 3
Move-MenoPointerAlong -Path @(@(1540, 980), @(1600, 1020), @(1680, 1000), @(1760, 1040)) -StepMs 40
Start-Sleep -Milliseconds 300
Hand 1760 1040
Start-Sleep -Milliseconds 700
Save-Step "triple-click-chain"
Undo
Calm

Invoke-MenoClick -X 1800 -Y 1300 -Count 2
Start-Sleep -Milliseconds 700
Save-Step "double-click-empty"
Calm

Invoke-MenoDrag -FromX 1000 -FromY 700 -ToX 1600 -ToY 1100 -PressMs 600 -Steps 16
Start-Sleep -Milliseconds 500
Save-Step "long-press-box"
Calm

Move-MenoPointer -X 1066 -Y 998; Start-Sleep -Milliseconds 300
Send-MenoText "+"
Start-Sleep -Milliseconds 600
Save-Step "charge-plus"
Send-MenoText "-"
Start-Sleep -Milliseconds 400
Move-MenoPointer -X 1238 -Y 996; Start-Sleep -Milliseconds 300
Send-MenoText "+"
Start-Sleep -Milliseconds 600
Move-MenoPointer -X 1800 -Y 600
Start-Sleep -Milliseconds 400
Save-Step "charge-carbon"
Move-MenoPointer -X 1238 -Y 996; Start-Sleep -Milliseconds 300
Send-MenoText "-"
Calm

Add-MenoSmiles "C[C@H](O)/C=C/C" -X 1280 -Y 1400
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 2500
Calm
Save-Step "stereo-hidden"
Hand 700 700 -Right
Start-Sleep -Milliseconds 600
Hand 800 1104
Start-Sleep -Milliseconds 2500
Move-MenoPointer -X 1850 -Y 600
Start-Sleep -Milliseconds 500
Save-Step "stereo-shown"
Hand 700 700 -Right
Start-Sleep -Milliseconds 600
Hand 800 1104
Start-Sleep -Milliseconds 800
Calm

Invoke-MenoDrag -FromX 1238 -FromY 996 -ToX 1300 -ToY 1200 -Steps 16 -StepMs 40 -AtStep { param($i) if ($i -eq 8) { Send-MenoKey Escape } }
Start-Sleep -Milliseconds 600
Move-MenoPointer -X 1850 -Y 600
Save-Step "escape-drag"
Calm

Hand 1156 948 -Right
Start-Sleep -Milliseconds 500
Move-MenoPointer -X 1380 -Y 820; Move-MenoPointer -X 1404 -Y 804
Hand 1404 804
Start-Sleep -Milliseconds 900
Save-Step "menu-click-only-closes"
Calm

Move-MenoPointer -X 700 -Y 500
Send-MenoShortcut A
Send-MenoShortcut C
Start-Sleep -Milliseconds 1500
Send-MenoShortcut V
Start-Sleep -Milliseconds 1200
Send-MenoShortcut V
Start-Sleep -Milliseconds 1200
Save-Step "paste-twice"
Undo 2
Calm

Move-MenoPointer -X 1030 -Y 990; Move-MenoPointer -X 1036 -Y 998
Invoke-MenoClick -X 1036 -Y 998 -Count 2
Start-Sleep -Milliseconds 700
Move-MenoPointer -X 1850 -Y 600
Save-Step "h-of-ho"
Undo
Calm

Hand 1238 996
Start-Sleep -Milliseconds 900
Send-MenoText "ho"
Send-MenoKey Enter
Start-Sleep -Milliseconds 800
Move-MenoPointer -X 1850 -Y 600
Save-Step "ho-typed"
Undo
Calm
