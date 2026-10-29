# Quick Add's SMILES field, given what the dictionary has: a molecule by
# its label drawn from the dictionary, no plugin asked, and a text that is
# both a SMILES and a label offered both ways, the SMILES first.
#
# - NBS typed: the SMILES and N-bromosuccinimide offered under the field,
#   the SMILES chosen; the down arrow chooses the other, and Enter draws
#   N-bromosuccinimide.
# - dmf typed in small letters: N,N-dimethylformamide offered alone, and
#   drawn; pdcl2: PdCl2, a formula, offered by its label and formula.
# - CCO typed: a SMILES alone, nothing said under the field.
#
# Nothing here needs the plugin that reads SMILES: nothing is drawn from one.
Start-Meno
Wait-MenoSettled | Out-Null
$size = Get-ClientSize
$cx = [int]($size.Width / 2); $cy = [int](80 + ($size.Height - 80) / 2)

# both readings offered, the SMILES first; the other chosen; drawn
Invoke-MenoQuickAdd -X ($cx - 400) -Y ($cy - 200) -Item SMILES
Send-MenoText "NBS" -CharMs 30
Start-Sleep -Milliseconds 400
Save-Step "nbs-offered"
Send-MenoKey Down
Start-Sleep -Milliseconds 300
Save-Step "nbs-chosen"
Send-MenoKey Enter
Wait-MenoSettled | Out-Null
Save-Step "nbs-drawn"

# a reagent typed small: offered alone, by its name, and drawn
Invoke-MenoQuickAdd -X ($cx + 300) -Y ($cy - 200) -Item SMILES
Send-MenoText "dmf" -CharMs 30
Start-Sleep -Milliseconds 400
Save-Step "dmf-offered"
Send-MenoKey Enter
Wait-MenoSettled | Out-Null
Save-Step "dmf-drawn"

# a complex's formula, typed small: offered by its label, not a made-up name
Invoke-MenoQuickAdd -X ($cx - 400) -Y ($cy + 250) -Item SMILES
Send-MenoText "pdcl2" -CharMs 30
Start-Sleep -Milliseconds 400
Save-Step "pdcl2-offered"
Send-MenoKey Escape
Start-Sleep -Milliseconds 300

# a SMILES alone: nothing under the field
Invoke-MenoQuickAdd -X $cx -Y ($cy + 250) -Item SMILES
Send-MenoText "CCO" -CharMs 30
Start-Sleep -Milliseconds 400
Save-Step "smiles-alone"
Send-MenoKey Escape
Start-Sleep -Milliseconds 300
Save-Step "end"
