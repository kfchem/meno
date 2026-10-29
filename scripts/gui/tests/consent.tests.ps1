# The guard that keeps a GUI run from answering a question about the network
# yes (MenoConsent.psm1): what it takes for the yes, from what the platform
# modules read of the part a press lands on or the part with the keys; that
# a reading that failed - an error, or nothing read - stops the input as the
# yes does; and its override. The platforms' lookups are stood in for, so no
# app is started. Run by hand on either desktop (on a Mac it also loads the
# Mac module, for how it tells its errors apart):
#   pwsh -NoProfile -File scripts/gui/tests/consent.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot ".." "MenoConsent.psm1") -Force

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
function Stops([scriptblock] $do) { try { & $do 3>$null; $false } catch { $true } }
function Read($chain) { [pscustomobject]@{ Chain = $chain; Unread = $null } }

# (as the Mac's Accessibility reads Meno's question: the button, its words, the dialog)
$macYes = @("AXButton`tAllow and download", "AXGroup`t", "AXGroup`tDownload RDKit?", "AXWebArea`t")
$macWords = @("AXStaticText`tAllow and download", "AXButton`tAllow and download", "AXGroup`tDownload RDKit?")
$macNo = @("AXButton`tNot now", "AXGroup`t", "AXGroup`tDownload RDKit?")
# (as UI Automation reads it in WebView2)
$winYes = @("Button`tAllow and download", "Group`t", "Document`tMeno")
$canvas = @("AXGroup`t", "AXWebArea`t", "AXScrollArea`t")
$label = @("AXStaticText`tAllowed", "AXGroup`tNetwork")
Remove-Item Env:MENO_GUI_ANSWER_NETWORK_YES -ErrorAction SilentlyContinue

Write-Host "what is the yes"
Check "the yes, pressed on its button (Mac)" (Test-NetworkYes -Chain $macYes) $true
Check "the yes, pressed on its words inside the button" (Test-NetworkYes -Chain $macWords) $true
Check "the yes (Windows)" (Test-NetworkYes -Chain $winYes) $true
Check "Not now" (Test-NetworkYes -Chain $macNo) $false
Check "the page" (Test-NetworkYes -Chain $canvas) $false
Check "words that begin Allow but are no button (Settings, Network)" (Test-NetworkYes -Chain $label) $false

Write-Host "the run stops before the yes"
Check "a click on the yes stops" (Stops { Assert-NotNetworkYes -Look (Read $macYes) -What "a click" }) $true
Check "a click on Not now goes on" (Stops { Assert-NotNetworkYes -Look (Read $macNo) -What "a click" }) $false
Check "a key with nothing that has the keys goes on" (Stops { Assert-NotNetworkYes -Look (Read @()) -What "the Enter key" }) $false
$said = try { Assert-NotNetworkYes -Look (Read $winYes) -What "the Enter key"; "" } catch { $_.Exception.Message }
Check "saying what and which" ($said -like "the Enter key would answer a question about the network yes ('Allow and download')*nothing was sent.") $true

Write-Host "a reading that failed stops it too"
$look = Read-Part { throw "AXError -25204 asking what has the keys" }
Check "an error is kept, with why" $look.Unread "AXError -25204 asking what has the keys"
Check "and stops a key" (Stops { Assert-NotNetworkYes -Look $look -What "the Enter key" }) $true
$said = try { Assert-NotNetworkYes -Look $look -What "typing"; "" } catch { $_.Exception.Message }
Check "saying so" ($said -like "typing could not be told from the yes*(AXError -25204 asking what has the keys)*nothing was sent.") $true
Check "nothing given stops it" (Stops { Assert-NotNetworkYes -Look (Read-Part { $null }) -What "a click" }) $true
Check "a reading with no chain at all stops it" (Stops { Assert-NotNetworkYes -Look (Read-Part { [pscustomobject]@{ Other = 1 } }) -What "a click" }) $true

if ($IsMacOS) {
    Write-Host "the Mac's lookups"
    $mac = Import-Module (Join-Path $PSScriptRoot ".." "MenoGui.macOS.psm1") -Force -PassThru
    Check "no error: none" ([MacGui]::LookupError(0, $false, "asking")) ""
    Check "nothing focused (kAXErrorNoValue) is no failure" ([MacGui]::LookupError(-25212, $true, "asking")) ""
    Check "but no value at a point is" ([MacGui]::LookupError(-25212, $false, "asking what is at the point")) "AXError -25212 asking what is at the point"
    Check "nor is the API unable to finish (kAXErrorCannotComplete)" ([MacGui]::LookupError(-25204, $true, "asking")) "AXError -25204 asking"
    Check "nor Accessibility turned off (kAXErrorAPIDisabled)" ([MacGui]::LookupError(-25211, $false, "asking")) "AXError -25211 asking"
    $stub = { param($l) & $mac { param($l) Read-MacPart { $l } } $l }
    Check "a click whose lookup failed stops" (Stops { Assert-NotNetworkYes -Look (& $stub ([pscustomobject]@{ Chain = @(); Error = "AXError -25204 asking what is at the point" })) -What "a click" }) $true
    Check "a key with nothing focused goes on" (Stops { Assert-NotNetworkYes -Look (& $stub ([pscustomobject]@{ Chain = @(); Error = $null })) -What "the Enter key" }) $false
    Check "a click on the yes, read, stops" (Stops { Assert-NotNetworkYes -Look (& $stub ([pscustomobject]@{ Chain = $macYes; Error = $null })) -What "a click" }) $true
    Write-Host "the page's parts, before the first lookup is trusted"
    Check "the page itself: not yet" (Test-PageReached -Chain @("AXWebArea`t", "AXScrollArea`t")) $false
    Check "what holds it: not yet" (Test-PageReached -Chain @("AXScrollArea`t", "AXWindow`tMeno")) $false
    Check "nothing: not yet" (Test-PageReached -Chain @()) $false
    Check "a part of the page: there" (Test-PageReached -Chain $canvas) $true
}

Write-Host "Windows' lookups (as UI Automation fails, stood in for)"
Check "FromPoint throwing stops a click" (Stops { Assert-NotNetworkYes -Look (Read-Part { throw [System.InvalidOperationException]::new("FromPoint failed") }) -What "a click" }) $true
Check "FromPoint giving nothing stops it" (Stops { Assert-NotNetworkYes -Look (Read-Part { $el = $null; if (-not $el) { throw "UI Automation gave nothing for the point" } }) -What "a click" }) $true
Check "FocusedElement throwing stops a key" (Stops { Assert-NotNetworkYes -Look (Read-Part { throw [System.Runtime.InteropServices.COMException]::new("focus") }) -What "the Enter key" }) $true
Check "a part gone while its chain is read stops it" (Stops { Assert-NotNetworkYes -Look (Read-Part { [pscustomobject]@{ Chain = @("Button`tNot now", (throw "element not available")) } }) -What "a click" }) $true
Check "Not now, read, goes on" (Stops { Assert-NotNetworkYes -Look (Read-Part { [pscustomobject]@{ Chain = @("Button`tNot now", "Group`t") } }) -What "a click" }) $false

Write-Host "the override"
$env:MENO_GUI_ANSWER_NETWORK_YES = "yes"
Check "must be exactly 1" (Stops { Assert-NotNetworkYes -Look (Read $macYes) -What "a click" }) $true
$env:MENO_GUI_ANSWER_NETWORK_YES = "1"
Check "set by hand, lets the yes through" (Stops { Assert-NotNetworkYes -Look (Read $macYes) -What "a click" }) $false
Check "and a failed reading" (Stops { Assert-NotNetworkYes -Look (Read-Part { throw "AXError -25204" }) -What "a click" }) $false
Remove-Item Env:MENO_GUI_ANSWER_NETWORK_YES -ErrorAction SilentlyContinue

Write-Host "nothing in the repository sets the override"
$root = Join-Path $PSScriptRoot ".." ".." ".."
$setters = @(Get-ChildItem $root -Recurse -File -Include *.ps1, *.psm1, *.sh, *.yml, *.ts, *.mjs, *.json -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "[\\/](node_modules|target|\.git)[\\/]" -and $_.Name -notin @("MenoConsent.psm1", "consent.tests.ps1") } |
    Select-String -Pattern "MENO_GUI_ANSWER_NETWORK_YES" -SimpleMatch -List | ForEach-Object { $_.Path })
Check "none ($($setters -join ', '))" $setters.Count 0

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
