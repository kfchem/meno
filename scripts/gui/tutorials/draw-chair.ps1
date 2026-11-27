# How do I draw a chair and put groups axial or equatorial? A chair from
# Quick Add's Projections group, two groups added on one of its atoms by
# double-clicks - the first equatorial, the second axial - the chair
# flipped, and laid out flat and back. Needs nothing but Meno: recorded in
# an empty home, the card Meno shows as it first starts answered "Not now"
# unrecorded, as the page is not about it.

Set-Tutorial -Needs @()

Start-Meno -HomeFolder (New-TutorialHome)
Suspend-Steps
Step not-now Click -At (Part Button "Not now" -TimeoutSec 20)
Resume-Steps
Start-Sleep -Seconds 2

# the chair is put down centred where Quick Add was opened; its atoms, read off a shot at this size
$chairX = 1200; $chairY = 700
$rightEnd = Point ($chairX + 116) ($chairY + 40)

Step open-quick-add DoubleClick -At (Point $chairX $chairY)
Step projections Click -At (Part Button "Projections" -Within "Add")
Step chair Click -At (Part Button "Chair" -Within "Projections")
Step equatorial DoubleClick -At $rightEnd
Step axial DoubleClick -At $rightEnd
Step flip-menu RightClick -At (Point ($chairX - 26) ($chairY - 18))
Step flip Click -At (Part MenuItem "Flip chair")
Start-Sleep -Seconds 1
# (flipped, the chair's atoms stand elsewhere: the one above the middle, read off a shot)
Step flat-menu RightClick -At (Point ($chairX + 24) ($chairY - 17))
Step flat Click -At (Part MenuItem "Draw flat")
Start-Sleep -Seconds 1
Step undo Shortcut -Text "Z"
Start-Sleep -Seconds 1

# the chair let go
Step let-go Click -At (Point 1900 1200)
