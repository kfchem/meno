# How do I draw a reaction scheme for a document or slides? Cyclohexanol
# drawn by hand - a ring led round with Chain, a bond out of it, an O typed
# on its end - copied beside itself and made cyclohexanone by making that
# bond double; a reaction arrow between the two with PCC over it and CH2Cl2
# under it; the workspace given the ACS 1996 style; everything chosen and
# copied for a document or slides. The product is drawn last, so that no row
# of Quick Add opened for the arrow or its words lies over it. Needs nothing but Meno: recorded in an
# empty home, where nothing is put down by SMILES or by name.

Set-Tutorial -Needs @()

Start-Meno -HomeFolder (New-TutorialHome)
# (the first start's questions - setting up chemistry, and keeping Meno up to date, which comes only after a first action - are not
# what this page is about: answered "Not now", unrecorded, before the first step; opening Settings is the first action, and changes nothing)
Suspend-Steps
Step chemistry-not-now Click -At (Part Button "Not now" -TimeoutSec 20)
Step settings Click -At (Part Button "Settings")
$asked = Get-Date
$no = Part Button "Not now" -TimeoutSec 90
Write-Host "  the update question came $([math]::Round(((Get-Date) - $asked).TotalSeconds, 1)) s after Settings was opened"
Step update-not-now Click -At $no
Step close-settings Click -At (Part Button "Close tab" -Within "Settings")
Resume-Steps
Start-Sleep -Seconds 2

# where things lie, in shot pixels of a 1200x780 window, read off runs. The scheme is drawn high and about the window's middle:
# the Styles column, opened at the right, keeps the view's middle in the middle of what is left, so all of it stays in view.
# The chain's first atom; the ring is led round the hexagon from there (a bond: 84 px across, 48 up or down, 97 straight down).
$ax = 666; $ay = 452
# the copy is pasted centred on its atoms where the pointer is, level with the first (whose atoms' middle is the first atom's height)
$pasteAt = @(1650, $ay)
# the arrow, at the rings' middle height, between the two; its words put down above and below it (the one above opened a
# little higher, so that Quick Add's row, opened there, stays clear of the arrow)
$arrowAt = @(1200, 500)
# empty space below the scheme, for the page's own menu (opened with the copy still chosen, its longer menu moved the view up,
# at 950 and at 750 alike: the copy is let go first)
$empty = @(1200, 950)

function Rest-Pointer {
    # the pointer moved over empty page, then to the bar at the top, nothing pressed: no tip or hover mark left on the drawing
    Move-MenoPointer -X 1200 -Y 1400
    Start-Sleep -Milliseconds 200
    Move-MenoPointer -X 1600 -Y 40
    Start-Sleep -Milliseconds 600
}

function Edge($x1, $y1, $x2, $y2) {
    # a bond's way, in eight moves
    $o = @()
    for ($i = 1; $i -le 8; $i++) { $o += , @([int]($x1 + ($x2 - $x1) * $i / 8), [int]($y1 + ($y2 - $y1) * $i / 8)) }
    return $o
}
$corners = @(@($ax, $ay), @(($ax + 84), ($ay - 48)), @(($ax + 168), $ay), @(($ax + 168), ($ay + 97)), @(($ax + 84), ($ay + 145)), @($ax, ($ay + 97)), @($ax, $ay))
$round = @()
for ($k = 0; $k -lt 6; $k++) { $round += Edge $corners[$k][0] $corners[$k][1] $corners[$k + 1][0] $corners[$k + 1][1] }

# the reactant: a ring led round with Chain, a bond out of its top atom, O typed on the bond's end
Step open-quick-add DoubleClick -At (Point $ax $ay)
Step chain Click -At (Part Button "Chain" -Within "Add")
Step ring Drag -At (Point $ax $ay) -Path $round -Traced
Rest-Pointer
Step bond DoubleClick -At (Point ($ax + 84) ($ay - 48))
Move-MenoPointer -X ($ax + 84) -Y ($ay - 145)
Start-Sleep -Milliseconds 500
Step oxygen Type -At (Point ($ax + 84) ($ay - 145)) -Text "O"
Rest-Pointer

# the arrow between them, and its words: the oxidant over it, the solvent under it
Step arrow-quick-add DoubleClick -At (Point $arrowAt[0] $arrowAt[1])
Step arrow Click -At (Part Button "Arrow" -Within "Add")
Rest-Pointer
Step over-quick-add DoubleClick -At (Point $arrowAt[0] ($arrowAt[1] - 90))
Step over-text Click -At (Part Button "Text" -Within "Add")
Step over-words Type -Text "PCC"
Step over-enter Key -Text "Enter"
Rest-Pointer
Step under-quick-add DoubleClick -At (Point $arrowAt[0] ($arrowAt[1] + 72))
Step under-text Click -At (Part Button "Text" -Within "Add")
Step under-words Type -Text "CH2Cl2"
Step under-enter Key -Text "Enter"
Rest-Pointer

# the product: the reactant chosen whole by holding it, copied, pasted where the pointer is, and its C-O bond made double
# (drawn after the arrow and its words, so that no row of Quick Add opened for them lies over it)
Step choose LongPress -At (Point $ax ($ay + 48))
Start-Sleep -Milliseconds 600
Rest-Pointer
Step copy Shortcut -Text "C"
Move-MenoPointer -X $pasteAt[0] -Y $pasteAt[1]
Start-Sleep -Milliseconds 500
Step paste Shortcut -At (Point $pasteAt[0] $pasteAt[1]) -Text "V"
Start-Sleep -Seconds 1
Rest-Pointer
Step double DoubleClick -At (Point $pasteAt[0] ($pasteAt[1] - 97))
Rest-Pointer
Step let-go-copy Click -At (Point $empty[0] $empty[1])
Start-Sleep -Milliseconds 600
Rest-Pointer

# a journal's style for the workspace, from the page's menu
Step page-menu RightClick -At (Point $empty[0] $empty[1])
Step styles Click -At (Part MenuItem "Styles…")
Start-Sleep -Seconds 2
Rest-Pointer
# (each style's card is named by its name and the words under it: found by its name's start)
$acs = Get-MenoPartsLike -Role RadioButton -Like "ACS 1996 *"
if ($acs.Count -ne 1) { throw "the style ACS 1996: $($acs.Count) found" }
Step acs Click -At (Part RadioButton $acs[0].Name)
Start-Sleep -Seconds 1
Rest-Pointer
Step close-styles Click -At (Part Button "Close")
Start-Sleep -Seconds 2
Rest-Pointer

# everything chosen and copied, then let go
Step choose-everything Shortcut -Text "A"
Step copy-everything Shortcut -Text "C"
Step let-go Click -At (Point $empty[0] $empty[1])
Start-Sleep -Seconds 1
Rest-Pointer
