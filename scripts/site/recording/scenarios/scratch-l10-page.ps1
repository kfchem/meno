# L10 frames, chapter 1: a rough taxol among six natural products famous in
# total synthesis, cleaned up; the page then saved for the later chapters.
# SMILES: PubChem's isomeric SMILES (CIDs 441071, 5288826, 3034034, 68827,
# 448013, 5280363), each checked against PubChem's InChIKey with RDKit.
# Run from scripts/gui/scenarios/ (copy it there; see scripts/site/recording/README.md).
# $env:MENO_REC: where the tools are built (bin/) and the recordings go.
if (-not $env:MENO_REC) { throw "set MENO_REC - see scripts/site/recording/README.md" }
$kit = Join-Path $PSScriptRoot "../../site/recording"
$SaveTo = $env:L10_SAVE

# Quick Add's SMILES at a point, as Invoke-MenoQuickAdd, but with the clamp
# placeQuickAdd applies low on the canvas: its top no lower than the canvas
# height - 4 - its largest panel's height (268.5 CSS px, measured here).
function Add-L10Smiles([string] $Smiles, [int] $X, [int] $Y, [int] $WaitSec = 6) {
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
Open-MenoFile "$PSScriptRoot/../fixtures/messy-taxol.mol"
Wait-MenoSettled | Out-Null
Invoke-MenoWheel -X 1280 -Y 840 -Notches 4
Wait-MenoSettled | Out-Null
Save-Step "zoomed"
$mols = @(
    @('C1CN2CC3=CCO[C@H]4CC(=O)N5[C@H]6[C@H]4[C@H]3C[C@H]2[C@@]61C7=CC=CC=C75', 380, 380),
    @('CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O', 2250, 300),
    @('COC1=CC2=C(C=CN=C2C=C1)[C@H]([C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)O', 380, 1250),
    @('C[C@@H]1CC[C@H]2[C@H](C(=O)O[C@H]3[C@@]24[C@H]1CC[C@](O3)(OO4)C)C', 2250, 1420),
    @('CCCCC[C@@H](/C=C/[C@H]1[C@@H](C[C@@H]([C@@H]1C/C=C\CCCC(=O)O)O)O)O', 1250, 250),
    @('C[C@H]1CCC[C@@]2([C@@H](O2)C[C@H](OC(=O)C[C@@H](C(C(=O)[C@@H]([C@H]1O)C)(C)C)O)/C(=C/C3=CSC(=N3)C)/C)C', 1250, 1400)
)
foreach ($m in $mols) {
    Add-L10Smiles $m[0] -X $m[1] -Y $m[2]
    Wait-MenoSettled | Out-Null
}
Invoke-MenoClick -X 1950 -Y 900
Wait-MenoSettled | Out-Null
Save-Step "page"

Move-MenoPointer -X 1950 -Y 900
Start-Sleep -Milliseconds 300
Send-MenoShortcut K -Shift
Wait-MenoSettled | Out-Null
Save-Step "cleaned"
if ($SaveTo) { Save-MenoFile $SaveTo; Wait-MenoSettled | Out-Null }
