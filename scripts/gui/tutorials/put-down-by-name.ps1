# How do I put a structure down by its name or its SMILES? One structure put
# down from its SMILES typed in Quick Add, and one from its name, looked up
# at PubChem by the names plugin. Recorded in a copy of the prepared home,
# where a person added the plugins by hand; their environments are set up
# again under the yes the copy carries with -PluginEnvironments (README,
# The prepared home), which the person who prepared the home agreed to for
# recordings.
#
# A reader who has just installed Meno has no names plugin set up, and nor
# has a copy (it holds the plugin but not its environment): so the page
# begins where the reader does, adding it in Settings, Plugins. Its Add and
# the first look-up's question - whether Meno may look names up at PubChem's
# host - are the reader's yeses: each is shot as a step and never answered
# by the run. A person answers each by hand in this run's copy, as the
# person who prepared the home agreed: the run says which by a file
# (AT-QUESTION, in the folder MENO_TUTORIAL_SIGNAL names: the question or
# place on its first line, the button on its second) and waits, up to ten
# minutes, for that yes to go, then goes on.

Set-Tutorial -Needs @("RDKit", "PubChem")

function Wait-NoNotice {
    param([int] $FirstSec = 0)
    if ($FirstSec) { Start-Sleep -Seconds $FirstSec }
    $until = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $until) {
        $seen = Get-MenoPartsLike -Role StaticText -Like "Keeping Meno up to date*"
        if (-not $seen.Count) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "a notice about keeping Meno up to date stayed for a minute: no picture taken with it"
}

function Rest-Pointer {
    Move-MenoPointer -X 300 -Y 1450
    Start-Sleep -Milliseconds 200
    Move-MenoPointer -X 1600 -Y 40
    Start-Sleep -Milliseconds 600
}

$signal = $env:MENO_TUTORIAL_SIGNAL
if (-not $signal) { throw "MENO_TUTORIAL_SIGNAL names no folder for the file that says a yes is waiting" }
$flag = Join-Path $signal "AT-QUESTION"
Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue

function Wait-Answered {
    # A yes the reader gives, left to a person: said in the file, waited for (up to ten minutes) until -Gone says it is answered
    param([Parameter(Mandatory)] [string] $Asked, [Parameter(Mandatory)] [string] $Button, [Parameter(Mandatory)] [scriptblock] $Gone, [string] $Tag)
    Set-Content -LiteralPath $flag -Value @($Asked, $Button)
    Write-Host "  AT-QUESTION: $Asked / $Button"
    $until = (Get-Date).AddMinutes(10)
    $done = $false
    while ((Get-Date) -lt $until) {
        Start-Sleep -Seconds 2
        if (& $Gone) { $done = $true; break }
    }
    Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue
    if (-not $done) { Save-MenoShot -Path (Join-Path $Out "still-asked-$Tag.png") | Out-Null; throw "'$Button' ($Asked) not answered within ten minutes: stopped, nothing pressed" }
    Write-Host ("  answered: {0} at {1:HH:mm:ss}" -f $Button, (Get-Date))
}

function Get-Question {
    # a question about the network on the window now: its yes and its words (the texts ending in a question mark)
    $yes = @()
    foreach ($like in "Allow*", "Set up*", "Download*") { $yes += Get-MenoPartsLike -Role Button -Like $like }
    if (-not $yes.Count) { return $null }
    $words = (Get-MenoPartsLike -Role StaticText -Like "*?") | ForEach-Object { $_.Name }
    return [pscustomobject]@{ Button = $yes[0].Name; Words = ($words -join " / ") }
}

function Step-AnyQuestion([string] $Id, [string] $Press) {
    # where Meno asks about the network, the question is a step: its yes shot, not done, and answered by a person
    $q = Get-Question
    if (-not $q) { return }
    Step $Id Click -At (Part Button $q.Button) -NotDone
    Wait-Answered -Asked $q.Words -Button $(if ($Press) { $Press } else { $q.Button }) -Tag $Id -Gone { -not (Get-MenoPartsLike -Role Button -Like $q.Button).Count }
}

# both high and apart: the first on the left, the second on the right
$first = @(560, 420)
$second = @(1500, 420)

$copyHome = New-TutorialHome -Ready -PluginEnvironments
Start-Meno -HomeFolder $copyHome
try {
Wait-NoNotice -FirstSec 8

# the names plugin added, as the reader does once
Step settings Click -At (Part Button "Settings")
Start-Sleep -Seconds 2
Step plugins Click -At (Part RadioButton "Plugins")
Start-Sleep -Seconds 2
$add = Part Button "Add" -Row "PubChem" -Reveal
Start-Sleep -Seconds 1
Move-MenoPointer -X 1200 -Y 40
Start-Sleep -Milliseconds 400
$add = Part Button "Add" -Row "PubChem"
Step add Click -At $add -NotDone
Wait-Answered -Asked "Settings, Plugins: the row 'PubChem 0.1.0', Not added" -Button "Add" -Tag add -Gone {
    $label = (Get-MenoPartsLike -Role StaticText -Like "PubChem *") | Select-Object -First 1
    $adds = Get-MenoPartsLike -Role Button -Like "Add"
    $q = Get-Question
    $q -or -not $label -or -not ($adds | Where-Object { [math]::Abs($_.Y - $label.Y) -lt 120 })
}
# (a click on an empty part of the Settings page, unrecorded, so that nothing is left pressed from the answer by hand)
Start-Sleep -Seconds 3
Suspend-Steps
Step clear Click -At (Point 2340 900)
Resume-Steps
Step-AnyQuestion add-asked
# (its set-up: given time, then the row as it is now)
$until = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $until) {
    Step-AnyQuestion add-asked-again
    $label = (Get-MenoPartsLike -Role StaticText -Like "PubChem *") | Select-Object -First 1
    $states = (Get-MenoPartsLike -Role StaticText -Like "*") | Where-Object { $label -and [math]::Abs($_.Y - $label.Y) -lt 20 -and $_.X -gt 1800 }
    if ($states | Where-Object { $_.Name -in @("Added", "Ready", "Set up") -or $_.Name -like "Added*" }) { break }
    Start-Sleep -Seconds 3
}
Save-MenoShot -Path (Join-Path $Out "pubchem-row.png") | Out-Null
Rest-Pointer
Step back Click -At (Part StaticText "Workspace")
Start-Sleep -Seconds 2
Wait-NoNotice

# a structure from its SMILES
Step open-quick-add DoubleClick -At (Point $first[0] $first[1])
Step type-smiles Type -Text "CC(=O)Oc1ccccc1C(=O)O"
Start-Sleep -Seconds 1
Step put-down-smiles Key -Text "Enter"
# (the first time, the chemistry plugin starts - "Starting RDKit…" - before the structure is put down)
function Test-Starting {
    foreach ($role in "Button", "StaticText") { if ((Get-MenoPartsLike -Role $role -Like "Starting RDKit*").Count) { return $true } }
    return $false
}
$until = (Get-Date).AddMinutes(5)
$clear = 0
while ((Get-Date) -lt $until -and $clear -lt 3) {
    if (Test-Starting) { $clear = 0 } else { $clear++ }
    Start-Sleep -Seconds 1
}
Start-Sleep -Seconds 20
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
Rest-Pointer

# a structure from its name
Step open-quick-add-again DoubleClick -At (Point $second[0] $second[1])
Step type-name Type -Text "morphine"
Start-Sleep -Seconds 3
Rest-Pointer
Save-MenoShot -Path (Join-Path $Out "probe-row.png") | Out-Null
# the look-up row is not seen by Accessibility: its place read off a shot (under the field, at its left)
$row = if ($env:MENO_LOOKUP_ROW) { $env:MENO_LOOKUP_ROW -split "," } else { @(($second[0] + 150), ($second[1] + 170)) }
Step look-up Click -At (Point ([int]$row[0]) ([int]$row[1]))
$until = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $until -and -not (Get-Question)) { Start-Sleep -Milliseconds 500 }
if (-not (Get-Question)) { Save-MenoShot -Path (Join-Path $Out "no-question.png") | Out-Null; throw "no question within 90 s of the look-up" }
Start-Sleep -Seconds 1
Step-AnyQuestion allow -Press "Allow BY KEYBOARD"
# (the structure lands: a picture a second for eight seconds beside the shots, nothing done in between)
for ($i = 0; $i -lt 8; $i++) {
    $t0 = Get-Date
    Save-MenoShot -Path (Join-Path $Out ("after-allow-{0:00}.png" -f $i)) | Out-Null
    $left = 1000 - ((Get-Date) - $t0).TotalMilliseconds
    if ($left -gt 0) { Start-Sleep -Milliseconds ([int]$left) }
}
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
Rest-Pointer
Step let-go Click -At (Point 400 1350)
Start-Sleep -Seconds 2
} finally {
    # Meno's own log of the copy, and its record of the network, kept beside the shots before the copy is taken away
    $kept = Join-Path $Out "log"
    New-Item -ItemType Directory -Force -Path $kept | Out-Null
    $m = Join-Path $copyHome "Library/Application Support/Meno"
    Copy-Item -LiteralPath (Join-Path $m "logs/meno.log") -Destination $kept -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $m "network-log.jsonl") -Destination $kept -ErrorAction SilentlyContinue
}
