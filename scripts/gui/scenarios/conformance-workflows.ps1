# The agreed rulings on workflows, each turned into a step and a shot
# (docs/WORKFLOWS.md) - to run again on every release candidate. Needs the
# xTB and CREST plugins added. What each shot must show:
#
# - "workspace": the workflow is on the workspace's own page, not a tab of
#   its own - the set of three molecules in 3D and its three steps (xTB
#   Optimise, Meno's Energy window, CREST Conformers), each "Ready". The set
#   is a frame holding what lies inside it, no list of members (sets, not
#   boxes), its name and count inside its frame: "Input 3 compounds".
# - "quick-add": a double-click on empty space opens Quick Add: its icons,
#   a thin rule, and one button for calculations, last.
# - "calculations": that button pressed: below the row, a line for each
#   plugin added that does steps, each with the kinds it does, then Meno -
#   kinds Meno defines only, plugins added only.
# - "card-open": a click on the xTB step's title opens its card in place:
#   Calculation, then its options (Method, Solvent, Converged to), drawn
#   over the cards below it.
# - "procedure-offered": the xTB step saved as a procedure ("Conformance"):
#   Quick Add's calculations then offer it.
# - "step-done": xTB run: its card "0:0n · 3 of 3", a tick; its result set,
#   "Optimised 3 compounds", put to its right.
# - "step-failed": Energy window run on molecules with no energies: its
#   card says why in red - "Not every entry has an energy".
# - "step-changed": the set's left edge drawn in past the water: "Input 2
#   compounds", and xTB, run on three, "Changed · run again".
# - "running": CREST run (after it was deleted and the deletion undone):
#   "Running" or "Waiting", its wire moving.
# - "redo-asks": Redo, which would take the running step away again, asks
#   first - it does not take it away.
# - "stopped": the question let go (Escape) and the step stopped from its
#   menu: "Stopped after ...", the step still there.
# - "results-fit": Fit to content: the set, the steps and the result set
#   all in view; each molecule's frames chip clear of the others.
# - "relaid": a result molecule double-clicked to its secondary 3D look,
#   larger: the result set's frame grown to hold it, the molecules re-laid.
# - "zoomed-out": zoomed out below 75%: the chips faded out, the cards and
#   frames drawn smaller with the page.
#
# The page as a Mac's 2560x1720 shot shows it (read off on 2026-10-13;
# Windows wants its own): after Fit and eight notches out, the set's left
# edge 722,870; the steps' titles at x 1960 - xTB 722, Energy window 1000,
# CREST 1280; a step's menu, right-clicked at 2120 on its card, has Run at
# 2108, 50 lower (Stop there while it runs), Delete at 2491, and "Save as
# procedure..." at 2215, 138 lower (before it has run: then Show log and
# Show files come first); Quick Add is found where it opens
# (Invoke-MenoQuickAdd), since it stands higher once procedures are saved.
#
# FRESH set in the environment: the run starts from an emptied settings.json
# (whoever runs it empties it, and puts it back after), which first asks
# about keeping Meno up to date.

$Fixtures = Join-Path $PSScriptRoot "../fixtures"

function Menu([int] $Y) { Move-MenoPointer -X 2120 -Y $Y; Start-Sleep -Milliseconds 300; Invoke-MenoClick -X 2120 -Y $Y -Right; Start-Sleep -Milliseconds 700 }
function Away { Move-MenoPointer -X 600 -Y 1500; Start-Sleep -Milliseconds 300 }
function QuickAdd { Invoke-MenoClick -X 600 -Y 1400 -Count 2; Start-Sleep -Milliseconds 900 }
function Calm { Send-MenoKey Escape; Start-Sleep -Milliseconds 300; Send-MenoKey Escape; Start-Sleep -Milliseconds 400; Away }

Start-Meno
Start-Sleep -Milliseconds 800
# from a fresh profile (settings.json emptied for the run): "Not now" to keeping Meno up to date
if ($env:FRESH) { Invoke-MenoClick -X 1257 -Y 1126; Start-Sleep -Milliseconds 800 }
Start-Sleep -Seconds 2
Open-MenoFile (Join-Path $Fixtures "conformance-workflows.meno"); Start-Sleep -Seconds 4
Send-MenoShortcut 1; Start-Sleep -Milliseconds 1500
Invoke-MenoWheel -X 1280 -Y 860 -Notches -8; Start-Sleep -Milliseconds 2000
Away
Save-Step "workspace"

QuickAdd
Save-Step "quick-add"
Calm
Invoke-MenoQuickAdd -X 600 -Y 1400 -Item Calculations; Start-Sleep -Milliseconds 900
Save-Step "calculations"
Calm

Invoke-MenoClick -X 1960 -Y 722; Start-Sleep -Milliseconds 900
Save-Step "card-open"
Calm

# (saved before any step has run: a step that has run has Show log and Show files on its menu, above it)
Menu 780
Invoke-MenoClick -X 2215 -Y 918; Start-Sleep -Milliseconds 900
Send-MenoShortcut A; Send-MenoText "Conformance"; Send-MenoKey Enter; Start-Sleep -Milliseconds 900
Invoke-MenoQuickAdd -X 600 -Y 1400 -Item Calculations; Start-Sleep -Milliseconds 900
Save-Step "procedure-offered"
Calm

Menu 780
Invoke-MenoClick -X 2108 -Y 830; Away; Start-Sleep -Seconds 6
Save-Step "step-done"

Menu 1060
Invoke-MenoClick -X 2108 -Y 1110; Away; Start-Sleep -Seconds 2
Save-Step "step-failed"

Invoke-MenoDrag -FromX 722 -FromY 870 -ToX 1000 -ToY 870 -Steps 12; Start-Sleep -Milliseconds 800
Away
Save-Step "step-changed"
Send-MenoShortcut Z; Start-Sleep -Milliseconds 800

# CREST deleted and the deletion undone, then run: a redo would take it away again
Menu 1340
Invoke-MenoClick -X 2491 -Y 1387; Start-Sleep -Milliseconds 900
Send-MenoShortcut Z; Start-Sleep -Milliseconds 900
Menu 1340
Invoke-MenoClick -X 2108 -Y 1387; Away; Start-Sleep -Milliseconds 1500
Save-Step "running"
Send-MenoShortcut Z -Shift; Start-Sleep -Milliseconds 900
Save-Step "redo-asks"
Send-MenoKey Escape; Start-Sleep -Milliseconds 600
# (running, its menu's first button is Stop, where Run was)
Menu 1340
Invoke-MenoClick -X 2108 -Y 1387; Away; Start-Sleep -Seconds 4
Save-Step "stopped"

Send-MenoShortcut 1; Start-Sleep -Milliseconds 1500
Away
Save-Step "results-fit"

# the result set's water, in the view Fit gives: double-clicked to its secondary look
Invoke-MenoClick -X 1756 -Y 860 -Count 2; Start-Sleep -Milliseconds 1500
Away
Save-Step "relaid"

Invoke-MenoWheel -X 1280 -Y 860 -Notches -12; Start-Sleep -Milliseconds 1500
Away
Save-Step "zoomed-out"
