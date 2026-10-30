# How do I draw a structure and see it in 3D? A ring led round with the
# pointer, and its 3D structure from its right-click menu - RDKit's question
# the first time, the reader's to answer - then, from a profile with RDKit
# set up, the 3D structure rising out of the drawing.

Set-Tutorial -Needs "RDKit"

# a ring of six, led round from where Quick Add opens: each bond about a bond's length, back to where it began
$bond = 100
$start = @(1110, 770)
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

Start-Meno -HomeFolder (New-TutorialHome)
# (the first thing done asks about keeping Meno up to date: that question is Installing's, so it is answered first, unrecorded)
Suspend-Steps
Step settings Click -At (Part Button "Settings")
Step not-now Click -At (Part Button "Not now")
Step close Click -At (Part Button "Close tab" -Within "Settings")
Resume-Steps

Step open-quick-add DoubleClick -At (Point $start[0] $start[1])
Step chain Click -At (Part Button "Chain" -Within "Add")
Step lead-ring Drag -At (Point $start[0] $start[1]) -Path $ring -Traced
Step right-click RightClick -At (Point $start[0] $start[1])
Step make-3d Click -At (Part MenuItem "3D structure")
Step allow Click -At (Part Button "Allow and download" -Within "Download RDKit?") -NotDone
# (Escape answers it no: nothing is downloaded, and a no is not remembered - src/lib/net/network.ts - in a home thrown away after the run)
Send-MenoKey Escape

if (-not $env:MENO_TUTORIAL_HOME) {
    Write-Host "  (no tutorial profile: the page stops at RDKit's question, and its result is the drawing)"
    return
}

# the rest from a profile in which RDKit was added: the same ring, the same choice, and the 3D structure it makes
Start-Meno -HomeFolder (New-TutorialHome -Ready)
Suspend-Steps
Step open-quick-add DoubleClick -At (Point $start[0] $start[1])
Step chain Click -At (Part Button "Chain" -Within "Add")
Step lead-ring Drag -At (Point $start[0] $start[1]) -Path $ring -Traced
Step right-click RightClick -At (Point $start[0] $start[1])
Step make-3d Click -At (Part MenuItem "3D structure")
Resume-Steps
# (RDKit's worker starts the first time it is asked, then the structure rises out of the drawing)
Start-Sleep -Seconds 8
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
