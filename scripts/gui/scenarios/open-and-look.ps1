# Open a structure and photograph it. The plainest scenario there is, and the
# one to run first on a new machine: if this works, the harness is wired up.
#
# It is also where the coordinates the other scenarios use come from - open
# its shots and read off where the atoms landed.

Start-Meno
Save-Step "empty"

Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"
Save-Step "opened"

# Fit to content (Ctrl/Cmd+1), so the whole structure is in the picture at
# a size that does not depend on where the camera happened to be.
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Save-Step "fitted"

# Zoomed in far enough that a line width is several pixels: the joins this
# app is judged on are invisible at a fit-to-content size. (About the middle
# of the window, which the fit no longer needed the size of.)
$c = Get-ClientSize
Invoke-MenoZoom -X ([int]($c.Width / 2)) -Y ([int]($c.Height / 2)) -Notches 5
Wait-MenoSettled | Out-Null
Save-Step "zoomed"
