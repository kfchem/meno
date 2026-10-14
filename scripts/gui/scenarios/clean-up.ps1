# Clean-up by Meno's own layout engine, and a SMILES drawn by it.
#
# - A taxol drawn anyhow, its wedges on: cleaned up, it comes out as the
#   engine draws it, every stereocentre as it was, in one undo step.
# - Cocaine from its SMILES: its tropane cage in perspective, a bond broken
#   where it passes behind another; its centres shown by the drawing itself
#   (with R/S on, RDKit reads them as 1R,2R,3S,5S). The SMILES needs RDKit,
#   set up on first use.
#
# R/S labels show if they are on (Show R/S and E/Z in the menu on empty space;
# the setting stays), which this leaves alone. Clean-up is its key,
# Ctrl/Cmd+Shift+K, with nothing selected and the pointer on nothing:
# everything drawn.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/messy-taxol.mol"
Wait-MenoSettled | Out-Null
Save-Step "messy"

Move-MenoPointer -X 200 -Y 300            # on nothing: the key cleans up everything
Send-MenoShortcut K -Shift
Wait-MenoSettled | Out-Null
Save-Step "cleaned"

Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"
Send-MenoShortcut Z -Shift
Wait-MenoSettled | Out-Null

# (from Quick Add, in the empty space to the taxol's right, and fitted)
Add-MenoSmiles "CN1[C@H]2CC[C@@H]1[C@H]([C@H](C2)OC(=O)C3=CC=CC=C3)C(=O)OC" -X 2200 -Y 1200 -WaitSec 10
Send-MenoShortcut 1
Wait-MenoSettled | Out-Null
Save-Step "cocaine"
