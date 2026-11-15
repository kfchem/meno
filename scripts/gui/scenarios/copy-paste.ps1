# Copy, cut and paste a structure, by the keys and from the menus.
#
# - Ibuprofen from its SMILES; Cmd+A (Ctrl+A on Windows) selects it and
#   Cmd+C copies it.
# - Cmd+V pastes a copy where the pointer is, selected; Cmd+X cuts it again,
#   and a paste from the empty space's menu brings it back there.
# - A SMILES another program put on the clipboard as plain text pastes as
#   the structure it says (RDKit reads it, as for Quick Add's SMILES).
# - The last copy is left on the clipboard, for a look at what it holds.
#
# The pointer is put over empty space by coordinates read off a Mac's shots
# (2560x1720); the keys need none.

Start-Meno
Wait-MenoSettled | Out-Null          # Meno starts on a workspace
Add-MenoSmiles "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O"   # from Quick Add, in the middle
Invoke-MenoZoom -X 1280 -Y 860 -Notches -3
Start-Sleep -Seconds 1
Wait-MenoSettled | Out-Null
Save-Step "loaded"

Send-MenoShortcut A
Send-MenoShortcut C
Send-MenoKey Escape
Move-MenoPointer -X 1900 -Y 1300
Send-MenoShortcut V
Wait-MenoSettled | Out-Null
Save-Step "pasted"

Send-MenoShortcut X
Wait-MenoSettled | Out-Null
Save-Step "cut"

Invoke-MenoClick -X 300 -Y 1000 -Right    # (high enough for the whole menu below it)
Wait-MenoSettled | Out-Null
Save-Step "canvas-menu"
Invoke-MenoClick -X 346 -Y 1046     # Paste, its first icon
Wait-MenoSettled | Out-Null
Save-Step "pasted-from-menu"

Set-Clipboard -Value "Oc1ccccc1"
Send-MenoKey Escape
Move-MenoPointer -X 1900 -Y 400
Send-MenoShortcut V
Start-Sleep -Seconds 3
Wait-MenoSettled | Out-Null
Save-Step "smiles-pasted"

Send-MenoShortcut C
Start-Sleep -Milliseconds 500
