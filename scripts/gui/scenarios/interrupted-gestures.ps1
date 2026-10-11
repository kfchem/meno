# Gestures broken into by another: what bug hunt B (PR #262) found and fixed
# in the built app, each where it could only be seen there.
#
# - "undo-under-pointer": a bond drawn by a double-click on the ring's top
#   atom, the pointer resting on its new atom, Cmd+Z. Nothing is lit where
#   the atom was, and the letter typed there begins no label.
# - "click-then-pan": a click on an atom, then at once a drag of the view.
#   No label editor comes up on the atom, during the drag or after it.
# - "click-then-type": a click on one atom, then at once a letter typed over
#   another (the ring's top atom). The letter is the second atom's label: a
#   pyridine, and nothing begun on the first.
#
# (A right press in the middle of a drag, the fourth, opens no menu either:
# its press needs a chorded button the shared verbs do not post, and was
# checked with the Mac's own poster.)
#
# Phenylethanol from a SMILES (RDKit, set up on first use), in the middle of
# a Mac's 2560x1720 shot: its atoms O 1066,998; C1 1156,948; C2 1238,996;
# ipso 1321,948; the ring 1321,851, 1404,804, 1487,851, 1487,948, 1404,996.
Start-Meno
Add-MenoSmiles "OCCc1ccccc1"
Wait-MenoSettled | Out-Null

# an undo taking away what the pointer rests on
Invoke-MenoClick -X 1404 -Y 804 -Count 2
Start-Sleep -Milliseconds 700
Move-MenoPointer -X 1404 -Y 708
Send-MenoShortcut Z
Send-MenoText "N"
Start-Sleep -Milliseconds 500
Save-Step "undo-under-pointer"
Send-MenoKey Escape

# a click on C2, then at once the view dragged (it ends 60, 40 px further on)
Invoke-MenoClick -X 1238 -Y 996
Start-Sleep -Milliseconds 100
Invoke-MenoDrag -FromX 700 -FromY 500 -ToX 760 -ToY 540 -Steps 20 -StepMs 50
Move-MenoPointer -X 300 -Y 300
Start-Sleep -Milliseconds 400
Save-Step "click-then-pan"
Send-MenoKey Escape

# a click on C1, then at once N typed over the ring's top atom (all 60, 40 on)
Invoke-MenoClick -X 1216 -Y 988
Start-Sleep -Milliseconds 80
Move-MenoPointer -X 1464 -Y 844
Send-MenoText "N"
Start-Sleep -Milliseconds 700
Send-MenoKey Enter
Move-MenoPointer -X 300 -Y 300
Start-Sleep -Milliseconds 400
Save-Step "click-then-type"
