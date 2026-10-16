# Chains only from Quick Add and an atom's menu.
#
# - Double-clicking an atom again and again, and a click then a
#   double-click, never begin a chain: what is drawn is what a
#   double-click draws, and no trace follows the pointer.
# - An atom's right-click menu offers "Chain from here"; chosen, the chain is
#   traced from the atom with the button up, a click ends it, and one undo
#   takes it back.
#
# Coordinates are read off the opened shot on a Mac (2560x1720).

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/ethanol.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# the OH: three quick clicks, then double-clicks again and again
Invoke-MenoClick -X $env:MENO_OX -Y $env:MENO_OY -Count 3
Start-Sleep -Milliseconds 700
Save-Step "three-clicks"
for ($i = 0; $i -lt 4; $i++) {
    Invoke-MenoClick -X $env:MENO_OX -Y $env:MENO_OY -Count 2
    Start-Sleep -Milliseconds 150
}
Move-MenoPointerAlong -Path @(@(([int]$env:MENO_OX + 60), [int]$env:MENO_OY), @(([int]$env:MENO_OX + 120), [int]$env:MENO_OY))
Save-Step "no-chain"
Send-MenoKey Escape
Wait-MenoSettled | Out-Null
