# The guard that keeps a GUI run from answering a question about the network
# yes (MenoConsent.psm1): what it takes for the yes - from what the platform
# modules read of the part a press lands on, or the part with the keys - and
# its override. Run by hand on either desktop (it loads that module, nothing
# else; no app is started):
#   pwsh -NoProfile -File scripts/gui/tests/consent.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot ".." "MenoConsent.psm1") -Force

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
function Stops([scriptblock] $do) { try { & $do; $false } catch { $true } }

# (as the Mac's Accessibility reads Meno's question: the button, its words, the dialog)
$macYes = @("AXButton`tAllow and download", "AXGroup`t", "AXGroup`tDownload RDKit?", "AXWebArea`t")
$macWords = @("AXStaticText`tAllow and download", "AXButton`tAllow and download", "AXGroup`tDownload RDKit?")
$macNo = @("AXButton`tNot now", "AXGroup`t", "AXGroup`tDownload RDKit?")
# (as UI Automation reads it in WebView2)
$winYes = @("Button`tAllow and download", "Group`t", "Document`tMeno")
$canvas = @("AXGroup`t", "AXWebArea`t", "AXScrollArea`t")
$label = @("AXStaticText`tAllowed", "AXGroup`tNetwork")

Write-Host "what is the yes"
Check "the yes, pressed on its button (Mac)" (Test-NetworkYes -Chain $macYes) $true
Check "the yes, pressed on its words inside the button" (Test-NetworkYes -Chain $macWords) $true
Check "the yes (Windows)" (Test-NetworkYes -Chain $winYes) $true
Check "Not now" (Test-NetworkYes -Chain $macNo) $false
Check "the page" (Test-NetworkYes -Chain $canvas) $false
Check "words that begin Allow but are no button (Settings, Network)" (Test-NetworkYes -Chain $label) $false
Check "nothing read (Accessibility could not tell)" (Test-NetworkYes -Chain @()) $false

Write-Host "the run stops before it"
Remove-Item Env:MENO_GUI_ANSWER_NETWORK_YES -ErrorAction SilentlyContinue
Check "a click on the yes stops" (Stops { Assert-NotNetworkYes -Chain $macYes -What "a click" }) $true
Check "a click on Not now goes on" (Stops { Assert-NotNetworkYes -Chain $macNo -What "a click" }) $false
$said = try { Assert-NotNetworkYes -Chain $winYes -What "the Enter key"; "" } catch { $_.Exception.Message }
Check "saying what and which" ($said -like "the Enter key would answer a question about the network yes ('Allow and download')*nothing was sent.") $true
Check "the override must be exactly 1" (& { $env:MENO_GUI_ANSWER_NETWORK_YES = "yes"; Stops { Assert-NotNetworkYes -Chain $macYes -What "a click" } }) $true
Check "the override, set by hand, lets it through" (& { $env:MENO_GUI_ANSWER_NETWORK_YES = "1"; Stops { Assert-NotNetworkYes -Chain $macYes -What "a click" 3>$null } }) $false
Remove-Item Env:MENO_GUI_ANSWER_NETWORK_YES -ErrorAction SilentlyContinue

Write-Host "nothing in the repository sets the override"
$root = Join-Path $PSScriptRoot ".." ".." ".."
$setters = @(Get-ChildItem $root -Recurse -File -Include *.ps1, *.psm1, *.sh, *.yml, *.ts, *.mjs, *.json -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "[\\/](node_modules|target|\.git)[\\/]" -and $_.Name -notin @("MenoConsent.psm1", "consent.tests.ps1") } |
    Select-String -Pattern "MENO_GUI_ANSWER_NETWORK_YES" -SimpleMatch -List | ForEach-Object { $_.Path })
Check "none ($($setters -join ', '))" $setters.Count 0

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
