# The maintainer's rulings on slides, talks, text boxes, shapes, guides and
# writing by hand (docs/PRESENTING.md), each turned into a step and a shot -
# to run again on every release candidate (2026-10-13; the 2D
# drawing's are conformance-2d.ps1, the window's conformance-chrome.ps1).
# Run it once from no settings.json - a fresh profile - put back after: the
# page is made from nothing but Quick Add, the menus and one sample file.
# What each must show (a shot, or a line in notes.txt):
#
# - "slides": two slides, 16:9, each its number at its upper left, a faint
#   dashed line from the one to the other (from number to number, the one
#   within the other).
# - "text-sized", "list": words a size up (Cmd+Shift+>), and a list - "- "
#   typed made "• ", Shift+Enter the next item, Tab a level down - laid to
#   the left, its lines hanging under its words.
# - "shape-under": a filled rectangle drawn over a chain: the bonds over the
#   fill, never under it.
# - "ink": a stroke written with Quick Add's Pen (a build without the pen
#   says so in notes.txt and goes on without it).
# - "before-talk": the side panel (Drawing style) open; "before-talk-2":
#   the shape's colour card; "before-talk-3": a menu.
# - "talk-begins" (F5), "talk-slide-1": the page in a window of the talk's
#   own over the whole screen - notes.txt: borderless, at 0,0 and the
#   screen's size, the window it came from behind it - the slide filling it
#   below the notch, black about it (notes.txt: the bands sampled black).
# - "talk-flight", "talk-slide-2": on the way to the next slide the page seen
#   whole within the slide's frame, the bands about the frame black all the
#   way (sampled black, 2026-10-19; before, they went white); come to it,
#   black about it; "2 / 2" for a moment in a corner.
# - "talk-dragged": a mouse drag in a talk moves the view - nothing written
#   (only a pen writes in a talk; the harness has no pen to try).
# - "talk-other-look": two clicks on the molecule in 3D - its other look.
# - "after-talk": the page back in its window as it was: the side panel
#   gone, the molecule in its look as before, the
#   tab not marked unsaved (the workspace saved just before the talk), no
#   stroke from the drag.
# - "hover-after", "keys-after": at once after Escape, with no click, what
#   is under the pointer lit, and Cmd+A taking everything.
# - "talk-2" (Shift+F5, begun with the card open) then "after-talk-2" -
#   the card gone - "hover-after-2", "keys-after-2"; "talk-3" (Cmd+Enter,
#   begun with the menu open), "after-talk-3" - the menu gone.
# - notes.txt "clipboard ...": words alone, a shape alone, a stroke alone,
#   each copied - pictures among what the clipboard holds (PNG, PDF or
#   SVG), not Meno's record alone.
# - "guide": words held, then moved, so that their middle lines up with the list's
#   within 6 px - a thin line in the attention colour; "guide-held-off": the
#   same with Cmd held - none.
#
# Coordinates are a Mac's 2560x1720 shot's (read off it on 2026-10-13, a
# 1710x1112-point screen with a notch; Windows wants its own), and those in
# a talk the screen's points made window ones (TalkClick).

$Samples = Join-Path $PSScriptRoot "../../../src/samples"
$Notes = Join-Path $Out "notes.txt"
function Note([string] $Line) { Add-Content -Path $Notes -Value $Line; Write-Host "  $Line" }
function Windows([string] $What) {
  $ws = [MacGui]::Windows() | Where-Object { $_.Owner -eq "Meno" -and $_.Layer -eq 0 } | ForEach-Object { "id=$($_.Id) x=$($_.X) y=$($_.Y) w=$($_.Width) h=$($_.Height)" }
  Note ("windows {0}: {1}" -f $What, ($ws -join " | "))
}
# (the talk's window - Meno's largest - shot whole: never the screen)
function TalkShot([string] $Name) {
  $tw = [MacGui]::Windows() | Where-Object { $_.Owner -eq "Meno" -and $_.Layer -eq 0 } | Sort-Object { $_.Width * $_.Height } -Descending | Select-Object -First 1
  if (-not $tw) { Note "$Name - no window"; return $null }
  $png = Join-Path $Out "$Name.png"
  & /usr/sbin/screencapture -x -o -l $tw.Id $png
  return $png
}
# (a talk's shot sampled: its top band and its bottom one, black or not)
function Bands([string] $Png, [string] $Name) {
  if (-not $Png -or -not (Test-Path $Png)) { return }
  $px = Read-ShotPixels -Png $Png
  $at = { param($x, $y) $row = if ($px.BottomUp) { $px.Height - 1 - $y } else { $y }; $i = $px.Offset + $row * $px.Stride + $x * $px.Step; "{0},{1},{2}" -f $px.Bytes[$i + 2], $px.Bytes[$i + 1], $px.Bytes[$i] }
  Note ("bands {0}: top {1}, bottom {2} ({3}x{4})" -f $Name, (& $at 40 20), (& $at 40 ($px.Height - 20)), $px.Width, $px.Height)
}
# (a point of the screen, in points, as the main window's shot pixels: what a talk is clicked at)
function TalkClick([double] $Sx, [double] $Sy, [int] $Count = 1) {
  $w = Get-ClientOrigin
  Invoke-MenoClick -X ([int](($Sx - $w.X) * 2)) -Y ([int](($Sy - $w.Y) * 2)) -Count $Count
}
# (the pasteboard's count of changes, as AppKit keeps it)
function ClipCount { [int]((& /usr/bin/osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSPasteboard.generalPasteboard.changeCount' 2>&1) -join "") }
# (the types the pasteboard holds, as AppKit lists them - Meno's own among them)
function Types { (& /usr/bin/osascript -l JavaScript -e 'ObjC.import("AppKit"); const t = $.NSPasteboard.generalPasteboard.types; const out = []; for (let i = 0; i < t.count; i++) out.push(ObjC.unwrap(t.objectAtIndex(i))); out.join(", ")' 2>&1) -join "" }
# (copied - Cmd+C - and each change the pasteboard takes in the next 4 s, when, and what it holds after: under a second, as a rule - or that nothing reached it)
function CopyAndList([string] $What) {
  $before = ClipCount
  $t0 = Get-Date
  Send-MenoShortcut C
  $changes = @()
  $last = $before
  do {
    Start-Sleep -Milliseconds 150
    $c = ClipCount
    if ($c -ne $last) { $changes += "{0} ms" -f [int]((Get-Date) - $t0).TotalMilliseconds; $last = $c }
  } until (((Get-Date) - $t0).TotalSeconds -gt 4)
  if (-not $changes.Count) { Note "clipboard ${What}: NOTHING copied"; return }
  Note ("clipboard {0} (changed at {1}): {2}" -f $What, ($changes -join ", "), (Types))
}
function ShiftEnter { [MacGui]::Chord([uint16[]] @(56), [uint64[]] @(0x20000), [uint16] 36); Start-Sleep -Milliseconds 150 }
function SizeUp { [MacGui]::Chord([uint16[]] @(55, 56), [uint64[]] @(0x100000, 0x20000), [uint16] 47); Start-Sleep -Milliseconds 200 }
function Calm { Send-MenoKey Escape; Start-Sleep -Milliseconds 300; Move-MenoPointer -X 1280 -Y 1690; Start-Sleep -Milliseconds 400 }

Start-Meno
# (a fresh profile asks whether Meno may keep itself up to date after the first action - Settings opened here, then
# the workspace's tab brought back - so that it is not asked in the middle of what follows: declined)
Start-Sleep -Milliseconds 1500
Invoke-MenoClick -X 2515 -Y 40
Start-Sleep -Milliseconds 2000
Send-MenoKey Escape
Start-Sleep -Milliseconds 600
Invoke-MenoClick -X 240 -Y 40
Start-Sleep -Milliseconds 800
Note ("screen: " + (& /usr/bin/osascript -e 'tell application "Finder" to get bounds of window of desktop'))

# whether this Meno's Quick Add has the pen: its row's width, at a clean spot
Invoke-MenoClick -X 2200 -Y 400 -Count 2
Start-Sleep -Milliseconds 700
$probe = Find-MenoQuickAdd -X 2200 -Y 400
$HasPen = [bool]($probe -and $probe.Width -gt 768)
Note "quick add's pen: $HasPen"
Send-MenoKey Escape
Start-Sleep -Milliseconds 400

# --- the page: a molecule in 3D, a chain, a shape, words, a list, a stroke --------
Open-MenoFile (Resolve-Path (Join-Path $Samples "cholesterol.xyz")).Path
Wait-MenoSettled | Out-Null
Start-Sleep -Milliseconds 1500
Invoke-MenoQuickAdd -X 500 -Y 1400 -Item Chain -Pen:$HasPen
Move-MenoPointerAlong -Path @(@(560, 1360), @(620, 1400), @(680, 1360), @(740, 1400), @(800, 1360))
Start-Sleep -Milliseconds 300
Invoke-MenoClick -X 800 -Y 1360
Start-Sleep -Milliseconds 600
Send-MenoKey Escape
$box = Invoke-MenoQuickAdd -X 420 -Y 1300 -Item Shapes -Pen:$HasPen -PassThru
Start-Sleep -Milliseconds 500
$icon = Get-MenoShapeIcon -Box $box -Shape Rectangle
Invoke-MenoDrag -FromX $icon.X -FromY $icon.Y -ToX 900 -ToY 1470 -Steps 18
Start-Sleep -Milliseconds 600
# (filled from its menu: the second of its icons, then the light blue of the card's Fill row)
Invoke-MenoClick -X 420 -Y 1380 -Right
Start-Sleep -Milliseconds 600
Invoke-MenoClick -X 541 -Y 1232
Start-Sleep -Milliseconds 600
Save-Step "fill-card"
Invoke-MenoClick -X 800 -Y 1485
Start-Sleep -Milliseconds 500
Calm
Invoke-MenoQuickAdd -X 1900 -Y 1300 -Item Text -Pen:$HasPen
Start-Sleep -Milliseconds 400
Send-MenoText "Results"
Send-MenoShortcut A
SizeUp
SizeUp
Save-Step "text-sized"
Send-MenoKey Enter
Start-Sleep -Milliseconds 400
Invoke-MenoQuickAdd -X 1900 -Y 1520 -Item Text -Pen:$HasPen
Start-Sleep -Milliseconds 400
Send-MenoText "- first item"
ShiftEnter
Send-MenoText "second item"
ShiftEnter
[MacGui]::TapKey([uint16] 48)
Start-Sleep -Milliseconds 150
Send-MenoText "deeper"
Send-MenoKey Enter
Start-Sleep -Milliseconds 500
# (laid to the left, from its menu)
Invoke-MenoClick -X 1900 -Y 1560 -Right
Start-Sleep -Milliseconds 600
Invoke-MenoClick -X 1979 -Y 1317
Start-Sleep -Milliseconds 600
Calm
Save-Step "list"
if ($HasPen) {
  Invoke-MenoQuickAdd -X 2300 -Y 1450 -Item Pen -Pen
  Start-Sleep -Milliseconds 500
  Invoke-MenoDrag -FromX 2250 -FromY 1420 -ToX 2450 -ToY 1560 -Steps 20
  Start-Sleep -Milliseconds 300
  Send-MenoKey Escape
  Start-Sleep -Milliseconds 500
  Save-Step "ink"
} else { Note "ink: this Meno has no pen in Quick Add" }

# --- slides -------------------------------------------------------------------
Send-MenoShortcut 1
Start-Sleep -Milliseconds 1200
Invoke-MenoQuickAdd -X 2450 -Y 200 -Item Slide -Pen:$HasPen
Start-Sleep -Milliseconds 800
Invoke-MenoZoom -X 660 -Y 1385 -Notches 2
Start-Sleep -Milliseconds 1200
Invoke-MenoQuickAdd -X 2450 -Y 200 -Item Slide -Pen:$HasPen
Start-Sleep -Milliseconds 800
Send-MenoShortcut 1
Start-Sleep -Milliseconds 1500
Calm
Save-Step "slides"
Save-Step "shape-under"
# (saved, so that what a talk leaves unsaved shows on the tab)
Save-MenoFile -Path (Join-Path $Out "present.meno")
Start-Sleep -Milliseconds 800
Save-Step "saved"

# --- a talk -------------------------------------------------------------------
# (what a talk closes: the side panel before the first, a card before the second, a menu before the third)
Invoke-MenoClick -X 2470 -Y 1660 -Right
Start-Sleep -Milliseconds 600
Invoke-MenoClick -X 2185 -Y 1658
Start-Sleep -Milliseconds 900
Save-Step "before-talk"
Windows "before"
[MacGui]::TapKey([uint16] 96)
Start-Sleep -Milliseconds 350
$null = TalkShot "talk-begins"
Start-Sleep -Milliseconds 2200
Windows "talk (F5)"
Bands (TalkShot "talk-slide-1") "slide 1"
[MacGui]::TapKey([uint16] 124)
Start-Sleep -Milliseconds 300
Bands (TalkShot "talk-flight") "flight"
Start-Sleep -Milliseconds 2200
Bands (TalkShot "talk-slide-2") "slide 2"
# (a mouse drag in a talk: the view moved, nothing written)
$w = Get-ClientOrigin
Invoke-MenoDrag -FromX ([int]((900 - $w.X) * 2)) -FromY ([int]((560 - $w.Y) * 2)) -ToX ([int]((1150 - $w.X) * 2)) -ToY ([int]((640 - $w.Y) * 2)) -Steps 16
Start-Sleep -Milliseconds 600
$null = TalkShot "talk-dragged"
[MacGui]::TapKey([uint16] 123)
Start-Sleep -Milliseconds 2500
$null = TalkShot "talk-back-1"
TalkClick 632 347 -Count 2
Start-Sleep -Milliseconds 1200
$null = TalkShot "talk-other-look"
Send-MenoKey Escape
Start-Sleep -Milliseconds 2400
Windows "after"
Save-Step "after-talk"
Move-MenoPointerAlong -Path @(@(330, 1200), @(370, 1175), @(392, 1160))
Start-Sleep -Milliseconds 400
Save-Step "hover-after"
Send-MenoShortcut A
Start-Sleep -Milliseconds 700
Save-Step "keys-after"
Calm

# --- a second talk, from the slide in view (Shift+F5), begun with a card open; a third (Cmd+Enter) with a menu ---
# (the shape's colour card: its menu, then its second icon)
Invoke-MenoClick -X 99 -Y 1150 -Right
Start-Sleep -Milliseconds 600
Invoke-MenoClick -X 220 -Y 1190
Start-Sleep -Milliseconds 700
Save-Step "before-talk-2"
[MacGui]::Chord([uint16[]] @(56), [uint64[]] @(0x20000), [uint16] 96)
Start-Sleep -Milliseconds 2500
Windows "talk 2 (Shift+F5)"
Bands (TalkShot "talk-2") "talk 2"
Send-MenoKey Escape
Start-Sleep -Milliseconds 2400
Save-Step "after-talk-2"
Move-MenoPointerAlong -Path @(@(330, 1200), @(370, 1175), @(392, 1160))
Start-Sleep -Milliseconds 400
Save-Step "hover-after-2"
Send-MenoShortcut A
Start-Sleep -Milliseconds 700
Save-Step "keys-after-2"
Calm
Invoke-MenoClick -X 2470 -Y 1660 -Right
Start-Sleep -Milliseconds 600
Save-Step "before-talk-3"
[MacGui]::Chord([uint16[]] @(55), [uint64[]] @(0x100000), [uint16] 36)
Start-Sleep -Milliseconds 2500
Windows "talk 3 (Cmd+Enter)"
Bands (TalkShot "talk-3") "talk 3"
Send-MenoKey Escape
Start-Sleep -Milliseconds 2400
Save-Step "after-talk-3"
Calm

# --- pictures on the clipboard: words alone, a shape alone, a stroke alone ---------
# (words selected by a long press: a click on them is a hover, then a caret)
Invoke-MenoDrag -FromX 1827 -FromY 1048 -ToX 1827 -ToY 1048 -Steps 1 -StepMs 10 -PressMs 690
Start-Sleep -Milliseconds 400
Save-Step "copy-words"
CopyAndList "words"
Calm
Invoke-MenoClick -X 99 -Y 1150
Start-Sleep -Milliseconds 400
Save-Step "copy-shape"
CopyAndList "shape"
Calm
if ($HasPen) {
  Invoke-MenoClick -X 2279 -Y 1211
  Start-Sleep -Milliseconds 400
  Save-Step "copy-ink"
  CopyAndList "ink"
  Calm
}

# --- guides: words moved into line with the list, then the same with Cmd held ------
Invoke-MenoDrag -FromX 1827 -FromY 1048 -ToX 1853 -ToY 990 -Steps 14 -StepMs 40 -PressMs 650 -AtStep { param($i) if ($i -eq 12) { Save-Step "guide" } }
Start-Sleep -Milliseconds 500
Send-MenoShortcut Z
Start-Sleep -Milliseconds 600
Invoke-MenoDrag -FromX 1827 -FromY 1048 -ToX 1853 -ToY 990 -Steps 14 -StepMs 40 -PressMs 650 -AtStep {
  param($i)
  if ($i -eq 3) { [MacGui]::HoldKeys([uint16[]] @(55), [uint64[]] @(0x100000), $true) }
  if ($i -eq 12) { Save-Step "guide-held-off" }
}
[MacGui]::HoldKeys([uint16[]] @(55), [uint64[]] @(0x100000), $false)
Start-Sleep -Milliseconds 500
Send-MenoShortcut Z
Start-Sleep -Milliseconds 600
Calm
Save-Step "end"
