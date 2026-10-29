# Move and zoom the view the ways the pointer and key map gives them.
#
# A right-click that stays put opens the menu of what is under it, and a
# right drag from the same place moves the view instead; a mouse wheel zooms
# and two fingers on a trackpad move the view, though both reach the page as
# the same event. Coordinates are read off the opened shot on a Mac, as
# delete-parts' are.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# The first bond of the pentane chain, top left: a right-click opens its menu.
Move-MenoPointer -X 535 -Y 492
Move-MenoPointer -X 539 -Y 489
Start-Sleep -Milliseconds 300
Invoke-MenoClick -X 539 -Y 489 -Right
Wait-MenoSettled | Out-Null
Save-Step "menu"
Send-MenoKey Escape

# A right drag from it: the view moves (and glides on a little after the
# release), no menu opens, and the bond is no longer the one under the
# pointer.
Invoke-MenoDrag -FromX 539 -FromY 489 -ToX 939 -ToY 689 -Right
Wait-MenoSettled | Out-Null
Save-Step "right-dragged"

# Two fingers, down and to the right: the drawing goes up and left, as a
# page would, and stays the size it was.
Invoke-MenoSwipe -X 1280 -Y 860 -DX 300 -DY 200
Wait-MenoSettled | Out-Null
Save-Step "swiped"

# The wheel, two notches in: bigger.
Invoke-MenoZoom -X 1280 -Y 860 -Notches 2
Wait-MenoSettled | Out-Null
Save-Step "wheeled"
