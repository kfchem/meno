# The view moved under a pointer that does not move.
#
# What is under the pointer is found when the pointer moves - and the view
# moves without it: two fingers on a trackpad, the wheel, a glide. Whatever
# is lit or dragged has to follow what is under the pointer then. The
# coordinates are read off the fitted shot on a Mac, as drag-atoms' are:
# depiction-check's pentane chain has its second carbon at (626, 440).

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null

# A pointer resting on an atom, two fingers moving the view: the atom goes
# from under it, and its ring with it - nothing is lit at the pointer. Back
# again, the atom is lit again without the pointer moving.
Move-MenoPointer -X 610 -Y 425
Move-MenoPointer -X 626 -Y 440
Start-Sleep -Milliseconds 300
Save-Step "chain-carbon-lit"
Invoke-MenoSwipe -X 626 -Y 440 -DX 300
Wait-MenoSettled | Out-Null
Save-Step "swiped-away"
Invoke-MenoSwipe -X 626 -Y 440 -DX -300
Wait-MenoSettled | Out-Null
Save-Step "swiped-back"

# The atom dragged, and the view moved under the held button halfway: the
# atom stays under the pointer while the drawing goes, and goes on with the
# drag from there - no jump at the next move.
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
$swipeHalfway = { param($i) if ($i -eq 6) {
        Invoke-MenoSwipe -X 626 -Y 540 -DX 300 -Held
        Start-Sleep -Milliseconds 400
        Save-Step "dragged-and-swiped" } }
Invoke-MenoDrag -FromX 626 -FromY 440 -ToX 626 -ToY 640 -AtStep $swipeHalfway
Wait-MenoSettled | Out-Null
Save-Step "dropped"
