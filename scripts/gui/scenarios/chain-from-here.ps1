# Chains only from Quick Add and an atom's menu.
#
# - Double-clicking an atom again and again, and a click then a
#   double-click, never begin a chain: what is drawn is what a
#   double-click draws, and no trace follows the pointer.
# - An atom's right-click menu offers "Chain from here"; chosen, the chain is
#   traced from the atom with the button up, a click ends it, and one undo
#   takes it back.
#
# Coordinates are read off the opened shot on a Mac (2560x1720): the OH of
# ethanol at (1331, 911), the CH3 at (1165, 911).

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/ethanol.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# the OH: a click then a double-click, and double-clicks again and again
Invoke-MenoClick -X 1331 -Y 911
Invoke-MenoClick -X 1331 -Y 911 -Count 2
Start-Sleep -Milliseconds 700
Save-Step "click-then-double"
for ($i = 0; $i -lt 3; $i++) {
    Invoke-MenoClick -X 1331 -Y 911 -Count 2
    Start-Sleep -Milliseconds 700
}
Save-Step "after-double-clicks"
Move-MenoPointerAlong -Path @(@(1400, 940), @(1480, 960), @(1560, 980))
Start-Sleep -Milliseconds 300
Save-Step "no-chain"
Send-MenoKey Escape
Wait-MenoSettled | Out-Null
Save-Step "escaped"

# the CH3's menu, and Chain from here
Invoke-MenoClick -X 1165 -Y 911 -Right
Start-Sleep -Milliseconds 500
Save-Step "menu"
Invoke-MenoClick -X 1289 -Y 1041
Start-Sleep -Milliseconds 300
# traced with the button up: led down and to the left, then right
$way = @()
for ($i = 1; $i -le 12; $i++) { $way += , @((1165 - 18 * $i), (911 + 8 * $i)) }
Move-MenoPointerAlong -Path $way -AtStep { param($i) if ($i -eq 12) { Start-Sleep -Milliseconds 200; Save-Step "tracing" } }
Invoke-MenoClick -X 950 -Y 1007
Wait-MenoSettled | Out-Null
Save-Step "chain-drawn"
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"
