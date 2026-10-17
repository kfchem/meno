# A long press, and chains on their honeycomb.
#
# - A long press on an atom selects its whole structure - the selection
#   spreading out from the atom as it is held - and a drag from there moves
#   the structure; one undo puts it back. Let go where it was held, it
#   selects and that is all: no label is edited once the double-click
#   time is over.
# - Chain from an atom's menu, led by the pointer: a chain out of it along the
#   honeycomb that opens out from the atom; led back - a little beside the
#   way it went - it takes its bonds back, and closes no ring for that.
# - Quick Add's chain on empty space, then the pointer led with the button
#   up: a chain from that point; led round in a loop back to it, the ring the
#   honeycomb makes that way - a chain draws no other (0.1.8); a click ends it.
# - Escape lets a chain go: nothing is drawn.
# - A long press on empty space: a ring spreads where it is held, and a drag
#   from there is a box.
#
# Coordinates are read off the opened shot on a Mac (2560x1720), as
# draw-strokes' are: a bond there is about 97 pixels.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/strokes.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# the right ethane, held and then dragged down
Invoke-MenoDrag -FromX 1924 -FromY 877 -ToX 1924 -ToY 1027 -PressMs 600 -Steps 12 -AtStep {
    param($i) if ($i -eq 1) { Save-Step "held" }
}
Wait-MenoSettled | Out-Null
Save-Step "held-and-moved"
Send-MenoShortcut Z
Send-MenoKey Escape
Wait-MenoSettled | Out-Null

# the right ethane held, and let go where it was: past the double-click
# time, the structure is selected and no label is being edited
Invoke-MenoDrag -FromX 1924 -FromY 877 -ToX 1924 -ToY 877 -PressMs 600 -Steps 1
Start-Sleep -Milliseconds 1200
Save-Step "held-let-go"
Send-MenoKey Escape
Wait-MenoSettled | Out-Null

# the left ethane's upper carbon: Chain from here, led out to the right and
# partly back, a little lower
Invoke-MenoChainFromHere -X 772 -Y 877 -Via @(,@(1172, 900)) -ToX 960 -ToY 905 -Steps 20 -AtStep {
    param($i)
    if ($i -eq 3) { Save-Step "chain-opening" }
    if ($i -eq 20) { Save-Step "chain-out" }
    if ($i -eq 40) { Save-Step "chain-back" }
}
Wait-MenoSettled | Out-Null
Save-Step "chain-drawn"

# Quick Add's chain on empty space; led right, round a loop about five bonds long
# back to the chain - round a hexagon of the honeycomb, its six-membered
# ring - and on; a click to end
Invoke-MenoQuickAdd -X 1300 -Y 1300 -Item Chain
$way = @()
for ($i = 1; $i -le 16; $i++) { $way += , @((1300 + 12 * $i), 1300) }
for ($k = 0; $k -le 40; $k++) {
    $a = -[Math]::PI / 2 + 2 * [Math]::PI * 1.02 * $k / 40
    $way += , @([int](1492 + 80 * [Math]::Cos($a)), [int](1380 + 80 * [Math]::Sin($a)))
}
for ($i = 1; $i -le 10; $i++) { $way += , @((1492 + 20 * $i), 1300) }
Move-MenoPointerAlong -Path $way -AtStep {
    param($i) if ($i -eq 16) { Start-Sleep -Milliseconds 200; Save-Step "tracing" }
}
Save-Step "traced-ring"
Invoke-MenoClick -X 1692 -Y 1300
Wait-MenoSettled | Out-Null
Save-Step "chain-with-ring"

# a chain begun and let go
Invoke-MenoQuickAdd -X 400 -Y 1450 -Item Chain
Move-MenoPointerAlong -Path @(@(450, 1450), @(500, 1450), @(550, 1450), @(600, 1450), @(650, 1450))
Save-Step "before-escape"
Send-MenoKey Escape
Wait-MenoSettled | Out-Null
Save-Step "escaped"

# a long press on empty space, then a box round the left ethane
Invoke-MenoDrag -FromX 560 -FromY 700 -ToX 860 -ToY 1060 -PressMs 600 -Steps 12 -AtStep {
    param($i) if ($i -eq 12) { Save-Step "box" }
}
Wait-MenoSettled | Out-Null
Save-Step "boxed"
