# How do I draw a catalytic cycle? A cycle from Quick Add's Scheme group,
# three intermediates' words put on its line, and an arrow coming in and
# one going out from its right-click menu. Needs nothing but Meno: recorded
# in an empty home, the card Meno shows as it first starts answered
# "Not now" unrecorded, as the page is not about it.

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

# the cycle a little left of the middle and high in the window: its line four and a half bonds from its middle (432 pixels of the
# shot at this size). Every right-click on its line is high enough for the menu to open below it whole, so the page stays where it is
$cycleX = 1100; $cycleY = 680; $cycleR = 432

function Rest-Pointer {
    # the pointer moved over empty page, then off the page to the bar at the top, nothing pressed: no tip or hover mark left on the
    # drawing in the next picture
    Move-MenoPointer -X 300 -Y 1450
    Start-Sleep -Milliseconds 200
    Move-MenoPointer -X 1600 -Y 40
    Start-Sleep -Milliseconds 600
}
function OnLine([double] $deg) {
    $a = $deg * [math]::PI / 180
    Point ([int][math]::Round($cycleX + $cycleR * [math]::Cos($a))) ([int][math]::Round($cycleY + $cycleR * [math]::Sin($a)))
}

function Put-Words([string] $Id, [double] $Deg, [string] $Words) {
    # words on the line: Quick Add opened on it, its Text, the words typed and kept with Enter
    Rest-Pointer
    Step "$Id-open" DoubleClick -At (OnLine $Deg)
    Step "$Id-text" Click -At (Part Button "Text" -Within "Add")
    Step "$Id" Type -Text $Words
    Suspend-Steps
    Step "$Id-enter" Key -Text "Enter"
    Resume-Steps
}

function Put-Arrow([string] $Id, [double] $Deg, [string] $Item, [string] $Words) {
    # an arrow from the line's right-click menu, its words typed at once and kept with Enter
    Rest-Pointer
    Step "$Id-menu" RightClick -At (OnLine $Deg)
    Step "$Id" Click -At (Part MenuItem $Item)
    Step "$Id-words" Type -Text $Words
    Suspend-Steps
    Step "$Id-enter" Key -Text "Enter"
    Resume-Steps
}

Step open-quick-add DoubleClick -At (Point $cycleX $cycleY)
Step scheme Click -At (Part Button "Scheme" -Within "Add")
Step cycle Click -At (Part Button "Catalytic cycle" -Within "Scheme")

# clockwise, as the cycle's arrows run: the catalyst at the bottom, then the two intermediates at the upper left and upper right
# (in this order, so that the row of icons, which opens to the right of where it is asked for, never lies over words already there)
Put-Words catalyst 90 "L2Pd(0)"
Put-Words second 210 "L2Pd(Ar)X"
Put-Words third 330 "L2Pd(Ar)Ar'"

# what comes in between the catalyst and the second, what comes in and goes out between the second and the third, what goes out between the third and the catalyst
Put-Arrow arrow-in 190 "Arrow coming in" "Ar-X"
# between the second and the third, along the top: what comes in, then what goes out, on the same part of the line
Put-Arrow metal-in 250 "Arrow coming in" "Ar'-M"
Put-Arrow metal-out 290 "Arrow going out" "M-X"
Put-Arrow arrow-out 0 "Arrow going out" "Ar-Ar'"

# the cycle let go: as it will be copied into a document or slides
Rest-Pointer
Step let-go Click -At (Point 2100 1300)
