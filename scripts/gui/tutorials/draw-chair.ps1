# How do I draw a chair and put groups axial or equatorial? A chair from
# Quick Add's Projections group, two groups added on one of its atoms by
# double-clicks - the first equatorial, the second axial - and one on the
# atom beside it, its R shown; the chair flipped, and laid out flat and back. Needs nothing but Meno: recorded in
# an empty home, the card Meno shows as it first starts answered "Not now"
# unrecorded, as the page is not about it.

Set-Tutorial -Needs @()

Start-Meno -HomeFolder (New-TutorialHome)
Suspend-Steps
Step not-now Click -At (Part Button "Not now" -TimeoutSec 20)
# a fresh home also asks, a while after the start, "Keep Meno up to date?": waited for (up to two minutes) and answered
# "Not now", unrecorded, so that no picture catches it; its yes is never pressed
# (the first card's going takes a moment; then the question is taken for there when its two buttons are)
Start-Sleep -Seconds 2
$asked = (Get-Date)
$until = $asked.AddSeconds(120)
$card = $false
while ((Get-Date) -lt $until) {
    if ((Get-MenoPartsLike -Role Button -Like "Keep up to date").Count -and (Get-MenoPartsLike -Role Button -Like "Not now").Count) { $card = $true; break }
    Start-Sleep -Milliseconds 500
}
if ($card) {
    Write-Host ("  the card 'Keep Meno up to date?' came {0:n0} s after the first was answered" -f (((Get-Date) - $asked).TotalSeconds + 2))
    Step not-now-update Click -At (Part Button "Not now")
    Start-Sleep -Seconds 1
    if ((Get-MenoPartsLike -Role Button -Like "Not now").Count) { throw "the card 'Keep Meno up to date?' is still there after Not now" }
} else {
    Write-Host "  no card 'Keep Meno up to date?' within two minutes"
}
Resume-Steps
Start-Sleep -Seconds 2

# the chair is put down centred where Quick Add was opened, high in the window, so that an atom's right-click menu opens below it
# whole and the page stays where it is; its atoms, read off a shot at this size
$chairX = 1200; $chairY = 340
$rightEnd = Point ($chairX + 116) ($chairY + 40)

function Rest-Pointer {
    # the pointer moved over empty page, then off the page to the bar at the top, nothing pressed: no tip or hover mark left on the
    # drawing in the next picture
    Move-MenoPointer -X 300 -Y 1450
    Start-Sleep -Milliseconds 200
    Move-MenoPointer -X 1600 -Y 40
    Start-Sleep -Milliseconds 600
}

Step open-quick-add DoubleClick -At (Point $chairX $chairY)
Step projections Click -At (Part Button "Projections" -Within "Add")
Step chair Click -At (Part Button "Chair" -Within "Projections")
Rest-Pointer
Step equatorial DoubleClick -At $rightEnd
Rest-Pointer
Step axial DoubleClick -At $rightEnd
# the atom beside it along the chair's lower edge: one group, at its equatorial place
Rest-Pointer
Step neighbour DoubleClick -At (Point ($chairX + 22) ($chairY + 24))
Rest-Pointer
Step flip-menu RightClick -At (Point ($chairX - 26) ($chairY - 18))
Step flip Click -At (Part MenuItem "Flip chair")
Start-Sleep -Seconds 1
# (flipped, the chair's atoms stand elsewhere: the one above the middle, read off a shot)
Rest-Pointer
Step flat-menu RightClick -At (Point ($chairX + 24) ($chairY - 17))
Step flat Click -At (Part MenuItem "Draw flat")
Start-Sleep -Seconds 1
Rest-Pointer
Step undo Shortcut -Text "Z"
Start-Sleep -Seconds 1

# the chair let go
Rest-Pointer
Step let-go Click -At (Point 1900 1200)
