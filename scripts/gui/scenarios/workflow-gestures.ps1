# A workflow's input made by pulling a wire out of a selection's port, then
# the structure in it dragged out: what bug hunt B (PR #262) found and fixed.
#
# - "quick-add": the wire let go on empty space opens Quick Add at the
#   calculations; Escape shuts it, the Input set staying.
# - "dragged-out": a long press on the structure and a drag down takes it out
#   of the set (Input: Empty). It used to stay where it was: the port's press
#   had begun a selection of the page's text, and the drag became the
#   system's own drag-and-drop, which took the pointer's moves and release.
# - "pointer-moved": the pointer moved with the button up - the structure
#   stays where it was dropped (it used to follow the pointer).
#
# Phenylethanol from a SMILES (RDKit, set up on first use), in the middle of
# a Mac's 2560x1720 shot: its ipso carbon at 1321,948; the selection's port,
# once the whole structure is selected, at about 1515,890.
Start-Meno
Add-MenoSmiles "OCCc1ccccc1"
Wait-MenoSettled | Out-Null
Invoke-MenoDrag -FromX 1321 -FromY 948 -ToX 1321 -ToY 948 -Steps 1 -PressMs 700
Invoke-MenoDrag -FromX 1515 -FromY 890 -ToX 1800 -ToY 900 -Steps 12
Start-Sleep -Milliseconds 700
Save-Step "quick-add"
Send-MenoKey Escape
Start-Sleep -Milliseconds 500
Invoke-MenoDrag -FromX 1321 -FromY 948 -ToX 1321 -ToY 1300 -PressMs 700 -Steps 14
Start-Sleep -Milliseconds 400
Save-Step "dragged-out"
Move-MenoPointer -X 700 -Y 500
Start-Sleep -Milliseconds 400
Save-Step "pointer-moved"
