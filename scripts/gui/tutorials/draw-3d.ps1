# How do I draw a structure and see it in 3D? The card Meno shows as it
# first starts, "Set up chemistry?" - the reader's to answer, so it is shot
# in an empty home and answered "Not now" there - then a ring led round with
# the pointer, and its 3D structure from its right-click menu, recorded in a
# copy of the prepared home, where a person added the plugin by hand: the 3D
# structure rising out of the drawing.
#
# The copy holds the plugin but not its environment, which Meno sets up
# again the first time the plugin is asked - over the network, under a yes
# the copy carries only with New-TutorialHome -Ready -PluginEnvironments
# (README, The prepared home). That switch is not given here until the
# person who prepared the home has agreed to it. Until then Meno asks at the
# first step that needs the plugin - make-3d, or lead-ring already where the
# drawing's checks ask it as the ring closes - and the run stops after
# make-3d, where it looks for a question, with nothing pressed: the steps
# from that question on, and the result, cannot be recorded.

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
Start-Meno -HomeFolder (New-TutorialHome -Ready)
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
# (the plugin's worker starts the first time it is asked, then the structure rises out of the drawing)
Start-Sleep -Seconds 10
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
# (a question here - to download, to allow, to set up - is the reader's: shot, never answered, and the run stops)
$asked = @()
foreach ($like in "Allow*", "Set up*") { $asked += Get-MenoPartsLike -Role Button -Like $like }
if ($asked.Count) {
    Save-MenoShot -Path (Join-Path $Out "asked.png") | Out-Null
    throw "Meno asks '$($asked[0].Name)' after 3D structure: that is the reader's to answer. Stopped; nothing pressed."
}
Wait-NoNotice
