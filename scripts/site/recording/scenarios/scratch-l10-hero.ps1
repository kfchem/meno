# L10: the site's first picture - cholesterol drawn, and its 3D structure beside it, nothing else.
# SMILES: PubChem CID 5997, its InChIKey checked with RDKit.
# Run from scripts/gui/scenarios/ (copy it there; see scripts/site/recording/README.md).
# $env:MENO_REC: where the tools are built (bin/) and the recordings go.
if (-not $env:MENO_REC) { throw "set MENO_REC - see scripts/site/recording/README.md" }
$kit = Join-Path $PSScriptRoot "../../site/recording"
function Add-L10Smiles([string] $Smiles, [int] $X, [int] $Y, [int] $WaitSec = 8) {
    $size = Get-ClientSize
    $cw = $size.Width / 2; $ch = $size.Height / 2 - 40
    $px = $X / 2; $py = $Y / 2 - 40
    $w = 7 * 36 + 8 + 9; $h = 36 + 8
    $left = if ($px + 14 + $w -le $cw - 4) { $px + 14 } else { [Math]::Max(4, $px - 14 - $w) }
    $top = if ($py - 14 - $h -ge 4) { $py - 14 - $h } else { $py + 14 }
    $top = [Math]::Max(4, [Math]::Min($top, $ch - 4 - 268.5))
    $ix = $left + 1 + 4 + 2 * 38 + 18
    $iy = $top + 1 + 4 + 18
    Invoke-MenoClick -X $X -Y $Y -Count 2
    Start-Sleep -Milliseconds 350
    Invoke-MenoClick -X ([int](2 * $ix)) -Y ([int](2 * ($iy + 40)))
    Start-Sleep -Milliseconds 300
    Send-MenoText $Smiles -CharMs 10
    Send-MenoKey Enter
    Start-Sleep -Seconds $WaitSec
    Send-MenoKey Escape
}
Start-Meno
Start-Sleep -Seconds 32
Add-L10Smiles 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C' -X 900 -Y 700
Start-Sleep -Milliseconds 500
Move-MenoPointer -X 2400 -Y 1500
Send-MenoShortcut 1
Start-Sleep -Milliseconds 2500
Wait-MenoSettled | Out-Null
Save-Step "drawn"
# its 3D structure, from an atom's menu (C1), and both fitted
Invoke-MenoClick -X 594 -Y 922 -Right
Start-Sleep -Milliseconds 700
Save-Step "menu"
Invoke-MenoClick -X 865 -Y 966
Start-Sleep -Seconds 12
Wait-MenoSettled -TimeoutMs 20000 | Out-Null
Move-MenoPointer -X 2400 -Y 1500
Send-MenoShortcut 1
Start-Sleep -Milliseconds 2500
Wait-MenoSettled | Out-Null
Save-Step "both"
# a notch back, below the zoom at which the frames chip shows
Start-Sleep -Milliseconds 1500
Move-MenoPointer -X 1280 -Y 840
for ($k = 1; $k -le 3; $k++) {
    Move-MenoPointer -X 1280 -Y 840
    Invoke-MenoWheel -X 1280 -Y 840 -Notches 1
    Start-Sleep -Milliseconds 2500
    Move-MenoPointer -X 2400 -Y 1500
    Start-Sleep -Milliseconds 1500
    Save-Step "back-$k"
}
