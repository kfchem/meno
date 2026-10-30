# A reaction arrow's end and corner dragged, photographed on the way: the
# arrow drawn going over to each place it snaps to (an end's 15-degree
# steps, a corner's right angle), never jumping there.
#
# Run first to see where the arrow lies (01-fitted.png); the drags below are
# read off that shot, at the window size run.ps1 fixes.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/arrow.rxn"
Send-MenoShortcut 1                          # fit to content
Wait-MenoSettled | Out-Null
Save-Step "fitted"
