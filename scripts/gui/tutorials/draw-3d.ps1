# How do I draw a structure and see it in 3D? The card Meno shows as it
# first starts, "Set up chemistry?" - the reader's to answer, so it is shot
# in an empty home and answered "Not now" there - then a ring led round with
# the pointer, and its 3D structure from its right-click menu, recorded in a
# copy of the prepared home, where a person added the plugin by hand: the 3D
# structure rising out of the drawing.
#
# The copy holds the plugin but not its environment, which Meno sets up
# again the first time the plugin is asked - over the network, under the
# yes the copy carries with New-TutorialHome -Ready -PluginEnvironments
# (README, The prepared home), which the person who prepared the home
# agreed to for recordings. The ring is cyclohexane: it has no
# stereoisomers, so the 3D structure asks nothing about them.

Set-Tutorial -Needs "RDKit"

# a ring of six, led round from where Quick Add opens: each bond about a bond's length, back to where it began
$bond = 100
# (high on the page: the atom's menu then opens below it whole, and the page stays where it is)
$start = @(1110, 320)
$turns = @(-30, 30, 90, 150, 210, 270)
$corners = @(, $start)
foreach ($a in $turns) {
    $last = $corners[-1]
    $r = $a * [math]::PI / 180
    $corners += , @(($last[0] + $bond * [math]::Cos($r)), ($last[1] + $bond * [math]::Sin($r)))
}
$ring = @()
for ($i = 1; $i -lt $corners.Count; $i++) {
    foreach ($t in 0.25, 0.5, 0.75, 1.0) {
        $a = $corners[$i - 1]; $b = $corners[$i]
        $ring += , @([int][math]::Round($a[0] + ($b[0] - $a[0]) * $t), [int][math]::Round($a[1] + ($b[1] - $a[1]) * $t))
    }
}

# Meno as someone opening it the first time sees it: the card, its yes shot and left, answered no
Start-Meno -HomeFolder (New-TutorialHome)
Step set-up Click -At (Part Button "Set up" -TimeoutSec 20) -NotDone
Suspend-Steps
Step not-now Click -At (Part Button "Not now")
Resume-Steps

function Wait-NoNotice {
    # Meno's own notices - keeping itself up to date, say - come and go as they will; a picture waits until none is there (up to a minute)
    param([int] $FirstSec = 0)
    if ($FirstSec) { Start-Sleep -Seconds $FirstSec }
    $until = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $until) {
        $seen = Get-MenoPartsLike -Role StaticText -Like "Keeping Meno up to date*"
        if (-not $seen.Count) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "a notice about keeping Meno up to date stayed for a minute: no picture taken with it"
}

# the rest where chemistry is set up: a copy of the prepared home
Start-Meno -HomeFolder (New-TutorialHome -Ready -PluginEnvironments)
Wait-NoNotice -FirstSec 8
Step open-quick-add DoubleClick -At (Point $start[0] $start[1])
Wait-NoNotice
Step chain Click -At (Part Button "Chain" -Within "Add")
Wait-NoNotice
Step lead-ring Drag -At (Point $start[0] $start[1]) -Path $ring -Traced
Wait-NoNotice
Step right-click RightClick -At (Point $start[0] $start[1])
Wait-NoNotice
Step make-3d Click -At (Part MenuItem "3D structure")
# (the first time, Meno sets the plugin's environment up again and starts its worker; then the structure rises out of the
# drawing)
# (the chip and the 3D structure are drawn on the page, out of Accessibility's sight: the run waits three minutes, any question
# to download, allow or set up - the reader's - stopping it unanswered, and the pictures are each looked at before they are kept)
$until = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $until) {
    $asked = @()
    foreach ($like in "Allow*", "Set up*") { $asked += Get-MenoPartsLike -Role Button -Like $like }
    if ($asked.Count) {
        Save-MenoShot -Path (Join-Path $Out "asked.png") | Out-Null
        throw "Meno asks '$($asked[0].Name)' after 3D structure: that is the reader's to answer. Stopped; nothing pressed."
    }
    Start-Sleep -Seconds 2
}
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
# (it rises and comes to rest: an eased move, given time to end)
Start-Sleep -Seconds 4
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
Wait-NoNotice

# the molecule let go: a click on empty page, low on the left
Move-MenoPointer -X 300 -Y 1300
Start-Sleep -Milliseconds 400
Step let-go Click -At (Point 400 1300)
Start-Sleep -Seconds 2
