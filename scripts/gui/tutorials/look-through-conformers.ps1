# How do I look through a molecule's conformers? Pentane put down from its
# SMILES in Quick Add, its 3D structure made, the chip under it opened, a
# bar pressed, how the conformers were made unfolded, and all of them shown
# over one another. Recorded in a copy of the prepared home, where a person
# added the chemistry plugin by hand; its environment is set up again under
# the yes the copy carries with -PluginEnvironments (README, The prepared
# home), which the person who prepared the home agreed to for recordings.
# Pentane has no stereoisomers, so the 3D structure asks nothing about them.

Set-Tutorial -Needs "RDKit"

function Wait-NoNotice {
    # Meno's own notices come and go as they will; a picture waits until none is there (up to a minute)
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

function Rest-Pointer {
    # the pointer moved over empty page, then off the page to the bar at the top, nothing pressed: no tip or hover mark
    Move-MenoPointer -X 300 -Y 1450
    Start-Sleep -Milliseconds 200
    Move-MenoPointer -X 1600 -Y 40
    Start-Sleep -Milliseconds 600
}

# high on the left: the molecule's menu then opens below it whole, and the page stays where it is
$at = @(700, 330)

Start-Meno -HomeFolder (New-TutorialHome -Ready -PluginEnvironments)
Wait-NoNotice -FirstSec 8
Step open-quick-add DoubleClick -At (Point $at[0] $at[1])
Step type-smiles Type -Text "CCCCC"
Step put-down Key -Text "Enter"
# (the first time, the chemistry plugin starts - "Starting RDKit…" at the lower right - before the structure is put down:
# waited for, up to five minutes, until that note has been gone a while)
function Test-Starting {
    foreach ($role in "Button", "StaticText") { if ((Get-MenoPartsLike -Role $role -Like "Starting RDKit*").Count) { return $true } }
    return $false
}
Start-Sleep -Seconds 2
$until = (Get-Date).AddMinutes(5)
$clear = 0
while ((Get-Date) -lt $until -and $clear -lt 3) {
    if (Test-Starting) { $clear = 0 } else { $clear++ }
    Start-Sleep -Seconds 1
}
if ($clear -lt 3) { throw "RDKit still starting five minutes after Enter" }
# (and at least twenty seconds in all, should the note not be seen)
Start-Sleep -Seconds 20
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
Rest-Pointer
# (put down, the structure stays chosen: let go, so that its atom's own menu opens; its middle carbon, read off a shot)
Step let-go-drawing Click -At (Point 400 1300)
Start-Sleep -Seconds 1
Rest-Pointer
$middle = @(699, 301)
Step right-click RightClick -At (Point $middle[0] $middle[1])
Step make-3d Click -At (Part MenuItem "3D structure")
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
Start-Sleep -Seconds 4
Rest-Pointer
# the chip under the molecule in 3D, read off a shot
$chip = @(1244, 470)
Step open-chip Click -At (Point $chip[0] $chip[1])
Start-Sleep -Seconds 2
# the chip opened: a bar for each conformer, read off a shot (its columns, and a height inside every one)
$barY = 524
$bars = @(1080, 1136, 1190, 1244, 1300, 1356, 1410)
Rest-Pointer
Step press-bar Click -At (Point $bars[2] $barY)
Start-Sleep -Seconds 2
Rest-Pointer
# (from the last bar back to the first: the lowest shown again at the end, and the chip as tall as it was)
$along = @()
for ($x = $bars[6]; $x -ge $bars[0]; $x -= 10) { $along += , @($x, $barY) }
$along += , @($bars[0], $barY)
Step drag-bars Drag -At (Point $bars[6] $barY) -Path $along
Start-Sleep -Seconds 2
Rest-Pointer
# its fold at the foot of the chip: how they were made
Step how-made Click -At (Point 1244 700)
Start-Sleep -Seconds 2
Rest-Pointer
Save-MenoShot -Path (Join-Path $Out "probe-made.png") | Out-Null
# the molecule in 3D: its middle carbon
Step show-menu RightClick -At (Point 1244 312)
Step show-all Click -At (Part MenuItem "Show all conformers")
Start-Sleep -Seconds 2
Rest-Pointer
Step let-go Click -At (Point 400 1300)
Start-Sleep -Seconds 2
