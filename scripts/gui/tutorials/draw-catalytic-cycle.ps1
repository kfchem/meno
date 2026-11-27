# How do I draw a catalytic cycle? A cycle from Quick Add's Scheme group,
# three intermediates' words put on its line, and an arrow coming in and
# one going out from its right-click menu. Needs nothing but Meno: recorded
# in an empty home, the card Meno shows as it first starts answered
# "Not now" unrecorded, as the page is not about it.

Set-Tutorial -Needs @()

Start-Meno -HomeFolder (New-TutorialHome)
Suspend-Steps
Step not-now Click -At (Part Button "Not now" -TimeoutSec 20)
Resume-Steps
Start-Sleep -Seconds 2

# the cycle in the middle of the window: its line four and a half bonds from its middle (432 pixels of the shot at this size)
$cycleX = 1200; $cycleY = 760; $cycleR = 432
function OnLine([double] $deg) {
    $a = $deg * [math]::PI / 180
    Point ([int][math]::Round($cycleX + $cycleR * [math]::Cos($a))) ([int][math]::Round($cycleY + $cycleR * [math]::Sin($a)))
}

function Put-Words([string] $Id, [double] $Deg, [string] $Words) {
    # words on the line: Quick Add opened on it, its Text, the words typed and kept with Enter
    Step "$Id-open" DoubleClick -At (OnLine $Deg)
    Step "$Id-text" Click -At (Part Button "Text" -Within "Add")
    Step "$Id" Type -Text $Words
    Suspend-Steps
    Step "$Id-enter" Key -Text "Enter"
    Resume-Steps
}

function Put-Arrow([string] $Id, [double] $Deg, [string] $Item, [string] $Words) {
    # an arrow from the line's right-click menu, its words typed at once and kept with Enter
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

# clockwise, as the cycle's arrows run: the catalyst at the top, then the two intermediates
Put-Words catalyst -90 "L2Pd(0)"
Put-Words second 30 "L2Pd(Ar)X"
Put-Words third 150 "L2Pd(Ar)Ar'"

# what comes in between the catalyst and the second, what goes out between the third and the catalyst
Put-Arrow arrow-in -30 "Arrow coming in" "Ar-X"
Put-Arrow arrow-out 210 "Arrow going out" "Ar-Ar'"

# the cycle let go: as it will be copied into a document or slides
Step let-go Click -At (Point 2100 1300)
