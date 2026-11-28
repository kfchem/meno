# The recorder of the manual's how-to pages (MenoTutorial.psm1): what a
# step keeps for the page to mark, and a drag's way point by point. (The
# guard that keeps a run from answering a question about the network yes is
# the platform modules', checked by consent.tests.ps1.)
# Run by hand on either desktop (it loads that module, nothing else; no app
# is started):
#   pwsh -NoProfile -File scripts/gui/tests/tutorial.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$tutorial = Import-Module (Join-Path $PSScriptRoot ".." "MenoTutorial.psm1") -Force -PassThru

$failed = 0
function Check([string] $what, $got, $want) {
    if ("$got" -ceq "$want") { Write-Host "  ok    $what" }
    else { Write-Host "  FAIL  $what - got '$got', want '$want'"; $script:failed++ }
}
# (a path as steps.json writes it: [x,y] [x,y] ...)
function Show($points) { ($points | ForEach-Object { "[" + (@($_) -join ",") + "]" }) -join " " }
function Part($name, [int] $x, [int] $y, [int] $w, [int] $h, $near) {
    [pscustomobject]@{ Role = "AXButton"; Name = $name; X = $x; Y = $y; Width = $w; Height = $h; CX = $x + [int]($w / 2); CY = $y + [int]($h / 2); Near = $near }
}
function Point([int] $x, [int] $y) { [pscustomobject]@{ X = $x; Y = $y; Width = 0; Height = 0; CX = $x; CY = $y } }

Write-Host "a drag's way"
$via = & $tutorial { Get-DragVia -Path @(@(300, 1150), @(400, 1200)) }
Check "two points: the first passed through, as a point" "$($via.Count) $(Show $via)" "1 [300,1150]"
$via = & $tutorial { Get-DragVia -Path @(, @(300, 1150)) }
Check "one point: none passed through" $via.Count 0
$via = & $tutorial { Get-DragVia -Path @(@(1, 2), @(3, 4), @(5, 6)) }
Check "three points: the first two" "$($via.Count) $(Show $via)" "2 [1,2] [3,4]"

Write-Host "what a step keeps"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(@(300, 1150), @(400, 1200)) } (Point 1490 1060)
Check "a drag of two points, from where it begins" "$($mark.kind) $(Show $mark.path)" "drag [1490,1060] [300,1150] [400,1200]"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(, @(300, 1150)) } (Point 1490 1060)
Check "a drag of one point" (Show $mark.path) "[1490,1060] [300,1150]"
$mark = & $tutorial { param($at) New-StepMark -Do Drag -At $at -Path @(@(1, 2), @(3, 4)) -Traced } (Point 0 0)
Check "a chain led: a trace" $mark.kind "trace"
$mark = & $tutorial { New-StepMark -Do Type -Text "OMe" }
Check "words typed where nothing is marked: no place kept" "$($mark.kind) $($mark.Contains('x')) $($mark.text)" "type False OMe"
$mark = & $tutorial { param($at) New-StepMark -Do Click -At $at } (Part "Go" 100 200 60 30 ([pscustomobject]@{ X = 40; Y = 150; Width = 300; Height = 120 }))
Check "a click on a part found within another: the part and what holds it" "$($mark.kind) $($mark.x),$($mark.y),$($mark.w),$($mark.h) $($mark.near -join ',')" "click 100,200,60,30 40,150,300,120"
$mark = & $tutorial { param($at) New-StepMark -Do RightClick -At $at } (Point 500 400)
Check "a right-click at a point: no size, nothing near" "$($mark.kind) $($mark.w) $($mark.Contains('near'))" "rightclick 0 False"

Write-Host "a copy of a prepared home"
# (prepared homes made here, of invented files, in a folder of the system's for temporary ones)
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("meno-ready-test-" + [guid]::NewGuid().ToString("n"))
function Put([string] $rel, [string] $text = "x") {
    $path = Join-Path $scratch $rel
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    [System.IO.File]::WriteAllText($path, $text)
}
function Link([string] $rel, [string] $target) {
    $path = Join-Path $scratch $rel
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    & /bin/ln -s $target $path
}
function Listing([string] $root) {
    # (every entry under a folder, links not followed: what a file holds, its time, where a link goes)
    $base = [System.IO.Path]::GetFullPath($root).TrimEnd("/")
    (@(& /usr/bin/find $base) | Sort-Object | ForEach-Object {
        $i = Get-Item -LiteralPath $_ -Force
        $rel = $_.Substring($base.Length)
        if ($i.LinkType) { "$rel -> $($i.LinkTarget)" }
        elseif ($i.PSIsContainer) { "$rel/" }
        else { "$rel $((Get-FileHash -LiteralPath $_).Hash) $($i.LastWriteTimeUtc.Ticks)" }
    }) -join "`n"
}
function Copy-Of([string] $from, [string] $to, [switch] $Network, [switch] $PluginEnvironments, [string] $repo = "") {
    try { & $tutorial { param($f, $t, $r, $n, $e) Copy-ReadyHome -From $f -To $t -Repository $r -Network:$n -PluginEnvironments:$e } $from $to $repo $Network.IsPresent $PluginEnvironments.IsPresent | Out-Null; "" } catch { "$_" }
}
function Prepared([string] $name) {
    # (a prepared home: its settings, a plugin, uv's and pixi's folders, and what a run leaves out)
    $m = "$name/Library/Application Support/Meno"
    $settings = [ordered]@{
        format = 1
        network = [ordered]@{ offline = $false; granted = @("plugin-catalogue", "python-env:plugin-sketchkit", "python-env:plugin-gone", "app-update") }
        updates = [ordered]@{ asked = $false; notice = $true }
        plugins = [ordered]@{ removed = @("oldkit"); roles = @{ smiles = "sketchkit" }; programs = @{ "sketchkit:tool" = "/Users/someone/bin/tool" }; firstSetUp = "done"; usedBeforeAsked = $true }
        files = [ordered]@{ read = @{ xyz = "sketchkit" }; also = @{}; before = @{ xyz = @{ name = "Viewer"; path = "/Applications/Viewer.app" } } }
        drawingStyle = "own:Someone lab"; ownDrawingStyles = @(@{ name = "Someone lab" }); colours = @{ sets = @(@{ name = "Someone's set" }) }
        procedures = @(@{ name = "mine" }); abbreviations = @(@{ label = "Qq" }); options = @{ "role:conformers" = @{ n = 5 } }
        calculations = @{ cores = 6 }; pointer = @{ wheelUp = "out" }; recentFiles = @("/Users/someone/paper.meno")
    }
    Put "$m/settings.json" (ConvertTo-Json $settings -Depth 8)
    Put "$m/plugins/sketchkit/current" "0.1.0"
    Put "$m/plugins/sketchkit/0.1.0/manifest.json" "{}"
    Put "$m/plugins/.staging/half/manifest.json" "{}"
    Put "$m/uv/stamps/plugin-sketchkit.json" "{}"
    Put "$m/uv/cache/wheel.txt" "a wheel"
    Put "$m/uv/python/real/bin/python" "a python"
    Put "$m/uv/plugin-sketchkit/venv/pyvenv.cfg" "home = there"
    Put "$m/uv/plugin-sketchkit/files/data.txt" "downloaded"
    Put "$m/pixi/plugin-render/activation.json" "{}"
    Put "$m/pixi/plugin-render/.pixi/envs/default/x" "x"
    Put "$m/pixi/plugin-render/pixi.toml" "[project]"
    Put "$m/tools/uv/0.0.1/uv" "uv"
    Put "$m/plugins/catalogue-2.json" "{}"
    Put "$m/plugins/catalogue-2.json.minisig" "sig"
    Put "$m/plugins/catalogue-2-state.json" "{}"
    Put "$m/logs/Meno.log" "a log"
    Put "$m/network-log.jsonl" "{}"
    Put "$m/window-state.json" "{}"
    Put "$m/jobs/one/job.json" "{}"
    Put "$m/jobs-folder.json" "{}"
    Put "$name/Library/Caches/Meno/pdf/a.pdf" "%PDF"
    Put "$name/Library/WebKit/Meno/x" "x"
    return (Join-Path $scratch $name)
}
function NoLinks([string] $root) { @(& /usr/bin/find $root -type l).Count }
$menoIn = "Library/Application Support/Meno"

try {
    if ($IsWindows) {
        $home1 = Prepared "home"
        Check "on Windows: no copy, saying why" ((Copy-Of $home1 (Join-Path $scratch "run/h")) -like "*for a Mac*") $true
    } else {
        $home1 = Prepared "home"
        # (uv's link to the Python it got, at its full path in the prepared home)
        Link "home/$menoIn/uv/python/cpython-3" (Join-Path $scratch "home/$menoIn/uv/python/real")
        $before = Listing $home1
        $copy = Join-Path $scratch "run/home-ready-1"
        Check "a copy made" (Copy-Of $home1 $copy) ""
        $to = Join-Path $copy $menoIn
        Check "the prepared home untouched" ((Listing $home1) -ceq $before) $true
        $kept = @("plugins/sketchkit/0.1.0/manifest.json", "uv/stamps/plugin-sketchkit.json", "uv/cache/wheel.txt", "uv/plugin-sketchkit/files/data.txt", "pixi/plugin-render/pixi.toml", "tools/uv/0.0.1/uv", "plugins/catalogue-2.json", "plugins/catalogue-2.json.minisig", "plugins/catalogue-2-state.json")
        Check "the plugins, their makers' folders, the tools and the list copied" (@($kept | Where-Object { -not (Test-Path -LiteralPath (Join-Path $to $_)) }) -join ", ") ""
        $gone = @("logs", "network-log.jsonl", "window-state.json", "jobs", "jobs-folder.json", "plugins/.staging", "uv/plugin-sketchkit/venv", "pixi/plugin-render/.pixi", "pixi/plugin-render/activation.json")
        Check "the log, the window's place, jobs, a set-up cut short and what names where it was made left out" (@($gone | Where-Object { Test-Path -LiteralPath (Join-Path $to $_) }) -join ", ") ""
        Check "nothing outside Meno's folder: no caches, no web view's folders" (@(Get-ChildItem -LiteralPath (Join-Path $copy "Library") -Force).Name -join ", ") "Application Support"
        Check "a link into the prepared home: what it leads to, copied - no link in the copy" "$(Get-Content -LiteralPath (Join-Path $to 'uv/python/cpython-3/bin/python')) $(NoLinks $copy)" "a python 0"
        $s = Get-Content -LiteralPath (Join-Path $to "settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "settings: only the format, the plugins' answers and ids, and updates asked" (@($s.Keys) -join ",") "format,plugins,updates"
        Check "of plugins: the card's answer, the question before, roles and those removed" "$(@($s.plugins.Keys) -join ',') $($s.plugins.firstSetUp) $($s.plugins.roles.smiles) $($s.plugins.removed -join ',')" "firstSetUp,usedBeforeAsked,roles,removed done sketchkit oldkit"
        Check "keeping Meno up to date: asked, and never allowed" "$($s.updates.asked) $($s.Contains('network'))" "True False"
        Check "nothing else: no own style, colours, unknown key, program, network" ((Get-Content -LiteralPath (Join-Path $to "settings.json") -Raw) -match "Someone|recentFiles|/Users/|granted|wheelUp") $false
        Check "never over a copy already there" ((Copy-Of $home1 $copy) -like "*there already*") $true

        $copyN = Join-Path $scratch "run/home-ready-net"
        Copy-Of $home1 $copyN -Network | Out-Null
        $s = Get-Content -LiteralPath (Join-Path $copyN "$menoIn/settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "-Network: the purposes allowed there, less keeping Meno up to date" ($s.network.granted -join ",") "plugin-catalogue,python-env:plugin-sketchkit,python-env:plugin-gone"
        $copyE = Join-Path $scratch "run/home-ready-envs"
        Copy-Of $home1 $copyE -PluginEnvironments | Out-Null
        $s = Get-Content -LiteralPath (Join-Path $copyE "$menoIn/settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "-PluginEnvironments: the yes to set up the environment of each plugin in the copy, and nothing else" ($s.network.granted -join ",") "python-env:plugin-sketchkit"
        $homeC = Prepared "cased"
        $cased = Join-Path $homeC "$menoIn/settings.json"
        $c = Get-Content -LiteralPath $cased -Raw | ConvertFrom-Json -AsHashtable
        $c.network.granted = @($c.network.granted) + @("PYTHON-ENV:PLUGIN-SKETCHKIT", "Python-Env:plugin-sketchkit")
        [System.IO.File]::WriteAllText($cased, (ConvertTo-Json $c -Depth 8))
        $copyC = Join-Path $scratch "run/home-cased-envs"
        Copy-Of $homeC $copyC -PluginEnvironments | Out-Null
        $s = Get-Content -LiteralPath (Join-Path $copyC "$menoIn/settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "-PluginEnvironments: a purpose in other letters is not the plugin's environment (Meno compares exactly)" ($s.network.granted -join ",") "python-env:plugin-sketchkit"

        Write-Host "links in a prepared home"
        $home2 = Prepared "linked"
        $m2 = "linked/$menoIn"
        # (within Meno's own folders: an environment a link, a folder of plugins a relative link, a link to nothing, a relative link)
        Put "$m2/uv/store/plugin-other/venv/pyvenv.cfg" "home = there"
        Put "$m2/uv/store/plugin-other/files/f.txt" "f"
        Link "$m2/uv/plugin-other" (Join-Path $scratch "$m2/uv/store/plugin-other")
        Link "$m2/uv/nothing" (Join-Path $scratch "linked/gone")
        Link "$m2/tools/near" "uv"
        Move-Item -LiteralPath (Join-Path $scratch "$m2/plugins") (Join-Path $scratch "$m2/pixi/plugins-here")
        Link "$m2/plugins" "pixi/plugins-here"
        $before = Listing $home2
        $copy2 = Join-Path $scratch "run2/home-ready-1"
        Check "a prepared home of links: copied" (Copy-Of $home2 $copy2) ""
        $to2 = Join-Path $copy2 $menoIn
        Check "its links and what they lead to untouched: venvs, a set-up cut short" ((Listing $home2) -ceq $before) $true
        Check "the copy holds no link" (NoLinks $copy2) 0
        Check "what the links lead to copied, the venvs taken from the copy alone" "$(Test-Path -LiteralPath "$to2/uv/plugin-other/files/f.txt") $(Test-Path -LiteralPath "$to2/uv/plugin-other/venv") $(Test-Path -LiteralPath "$to2/plugins/sketchkit/current") $(Test-Path -LiteralPath "$to2/plugins/.staging")" "True False True False"
        Check "a link to nothing left out" (Test-Path -LiteralPath "$to2/uv/nothing") $false
        Check "a relative link: what it leads to in Meno's folder" (Test-Path -LiteralPath "$to2/tools/near/0.0.1/uv") $true

        # (each a prepared home with one link that stops the copy, and the copy then taken away)
        $refusals = [ordered]@{
            "a link out of the prepared home" = @{ link = "tools"; to = "elsewhere/disk"; says = "*is a link out of the prepared home*" }
            "a link elsewhere in the prepared home" = @{ link = "tools"; to = "{home}/Documents"; says = "*is a link elsewhere in the prepared home*" }
            "a link into Meno's folder, to what is not copied" = @{ link = "tools/logs"; to = "{meno}/logs"; says = "*is a link elsewhere in the prepared home*" }
            "a link back into a folder it is in" = @{ link = "uv/round"; to = "{meno}/uv"; says = "*leads back into a folder it is in*" }
            "two folders' links leading into each other" = @{ link = "uv/x/l"; to = "{meno}/uv/y"; also = @("uv/y/m", "{meno}/uv/x"); says = "*leads back into a folder it is in*" }
            "two links leading to each other" = @{ link = "uv/a"; to = "{meno}/uv/b"; also = @("uv/b", "{meno}/uv/a"); says = "*links that lead to each other*" }
        }
        $i = 0
        foreach ($case in $refusals.GetEnumerator()) {
            $i++
            $name = "refused$i"
            $h = Prepared $name
            Put "$name/Documents/letter.txt" "private"
            Put "elsewhere/disk/uv/0.0.1/uv" "uv"
            Put "$name/$menoIn/uv/x/f.txt" "x"
            Put "$name/$menoIn/uv/y/f.txt" "y"
            $fill = { param($t) $t.Replace("{home}", (Join-Path $scratch $name)).Replace("{meno}", (Join-Path $scratch "$name/$menoIn")).Replace("elsewhere/", (Join-Path $scratch "elsewhere") + "/") }
            if ($case.Value.link -eq "tools") { Remove-Item -LiteralPath (Join-Path $scratch "$name/$menoIn/tools") -Recurse }
            Link "$name/$menoIn/$($case.Value.link)" (& $fill $case.Value.to)
            if ($case.Value.ContainsKey("also")) { Link "$name/$menoIn/$($case.Value.also[0])" (& $fill $case.Value.also[1]) }
            $before = (Listing $h) + (Listing (Join-Path $scratch "elsewhere"))
            $at = Join-Path $scratch "run3-$i/home-ready-1"
            $err = Copy-Of $h $at
            Check "$($case.Key): no copy, saying which" ($err -like $case.Value.says) $true
            Check "  nothing there or in the prepared home touched, and the copy begun taken away" "$(((Listing $h) + (Listing (Join-Path $scratch 'elsewhere'))) -ceq $before) $(Test-Path -LiteralPath $at) $(Test-Path -LiteralPath (Join-Path $scratch "run3-$i"))" "True False True"
        }

        Write-Host "where a prepared home and a copy may be"
        $home4 = Prepared "inner"
        Check "a copy inside the prepared home: refused" ((Copy-Of $home4 (Join-Path $home4 "runs/home-ready-1")) -like "*one inside the other*") $true
        Check "a prepared home inside the run's folder: refused" ((Copy-Of $home4 (Join-Path $scratch "home-ready-9")) -like "*one inside the other*") $true
        Check "nothing made there" (Test-Path -LiteralPath (Join-Path $home4 "runs")) $false
        Check "a home in the repository, spelt in other case: refused" ((Copy-Of $home1 (Join-Path $scratch "run5/h") -repo $scratch.ToUpperInvariant()) -like "*in the repository*") $true
        Check "the repository inside a prepared home: refused" ((Copy-Of $home1 (Join-Path $scratch "run5/h") -repo (Join-Path $home1 "repo")) -like "*in the repository*") $true
        $own = [Environment]::GetFolderPath("UserProfile")
        Check "this account's own home: refused" ((Copy-Of $own (Join-Path $scratch "run5/h")) -like "*this account's own home*") $true
        Check "and by the system volume's other spelling of it" ((Copy-Of "/System/Volumes/Data$own" (Join-Path $scratch "run5/h")) -like "*this account's own home*") $true

        $homeB = Prepared "prep[1]"
        $homeP = Prepared "prep1"
        Put "prep1/marker" "the other one"
        Put "run[1]/keep.txt" "k"
        Put "run1/home-ready-1/keep.txt" "k"
        $before = (Listing $homeP) + (Listing (Join-Path $scratch "run1"))
        Check "names with [ and ]: the folder named, not one like it" (Copy-Of $homeB (Join-Path $scratch "run[1]/home-ready-1")) ""
        Check "copied from it, and nothing of the other" "$(Test-Path -LiteralPath (Join-Path $scratch 'run[1]/home-ready-1/Library/Application Support/Meno/settings.json')) $(((Listing $homeP) + (Listing (Join-Path $scratch 'run1'))) -ceq $before)" "True True"
        Check "a prepared home given with a slash at its end" (Copy-Of "$home1/" (Join-Path $scratch "run6/home-ready-1")) ""
        Push-Location -LiteralPath $scratch
        try { Check "a prepared home given relative to where the run is" (Copy-Of "home" (Join-Path $scratch "run7/home-ready-1")) "" } finally { Pop-Location }

        & $tutorial { $script:CloneArgs = @("-cRP", "-Z") }
        try {
            $before = Listing $home2
            Check "where the disk cannot clone: copied all the same" (Copy-Of $home2 (Join-Path $scratch "run8/home-ready-1")) ""
            Check "the same copy, the prepared home untouched" "$(Test-Path -LiteralPath (Join-Path $scratch "run8/home-ready-1/$menoIn/uv/plugin-other/files/f.txt")) $(NoLinks (Join-Path $scratch 'run8')) $((Listing $home2) -ceq $before)" "True 0 True"
        } finally { & $tutorial { $script:CloneArgs = @("-cRP") } }

        Write-Host "a run's copies"
        $raw = Join-Path $scratch "run9"
        [System.IO.Directory]::CreateDirectory($raw) | Out-Null
        Put "run9/01-shot.png" "png"
        & $tutorial { param($r, $h) Start-Tutorial -Raw $r -Dest $r -Ready $h } $raw $home1
        $made = & $tutorial { New-TutorialHome -Ready }
        Check "-Ready: a copy in the run's folder" (Test-Path -LiteralPath (Join-Path $made "$menoIn/settings.json")) $true
        $s = Get-Content -LiteralPath (Join-Path $made "$menoIn/settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "-Ready alone: the network allowed nothing" $s.Contains("network") $false
        $madeE = & $tutorial { New-TutorialHome -Ready -PluginEnvironments }
        $s = Get-Content -LiteralPath (Join-Path $madeE "$menoIn/settings.json") -Raw | ConvertFrom-Json -AsHashtable
        Check "-Ready -PluginEnvironments: the plugin's environment alone" ($s.network.granted -join ",") "python-env:plugin-sketchkit"
        $before = Listing $home1
        & $tutorial { Remove-TutorialHomes }
        Check "taken away as the run ends; the run's shots and the prepared home kept" "$((Test-Path -LiteralPath $made) -or (Test-Path -LiteralPath $madeE)) $(Test-Path -LiteralPath (Join-Path $raw '01-shot.png')) $((Listing $home1) -ceq $before)" "False True True"
    }

    $fail = { param($f) Copy-Of $f (Join-Path $scratch ("x-" + [guid]::NewGuid().ToString("n") + "/h")) }
    if (-not $IsWindows) {
        Check "no such folder: said so" ((& $fail (Join-Path $scratch "none")) -like "no prepared home to copy: there is no folder*") $true
        [System.IO.Directory]::CreateDirectory((Join-Path $scratch "empty")) | Out-Null
        Check "a folder Meno was never started in: said so" ((& $fail (Join-Path $scratch "empty")) -like "*holds no Meno started there*") $true
        Put "unanswered/$menoIn/settings.json" '{"plugins": {"removed": []}}'
        Check "a home whose first card was not answered: said so" ((& $fail (Join-Path $scratch "unanswered")) -like "*never answered*") $true
        # (a home a Meno before the card made: plugins set up there, the question about them answered, no card's answer)
        Put "before/$menoIn/settings.json" '{"plugins": {"removed": [], "usedBeforeAsked": true}}'
        Put "before/$menoIn/uv/stamps/plugin-sketchkit.json" "{}"
        Check "a home whose plugins were set up before the card, and asked about: copied" (Copy-Of (Join-Path $scratch "before") (Join-Path $scratch "run-before/h")) ""
        Put "notasked/$menoIn/settings.json" '{"plugins": {"removed": []}}'
        Put "notasked/$menoIn/uv/stamps/plugin-sketchkit.json" "{}"
        Check "plugins set up before, the question about them not answered: said so" ((& $fail (Join-Path $scratch "notasked")) -like "*never answered*") $true
        Put "nostamp/$menoIn/settings.json" '{"plugins": {"removed": [], "usedBeforeAsked": true}}'
        Check "asked about plugins set up before, none set up: said so" ((& $fail (Join-Path $scratch "nostamp")) -like "*never answered*") $true
        Put "odd/$menoIn/settings.json" '{"plugins": {"firstSetUp": "maybe"}}'
        Check "a card's answer Meno does not know: said so" ((& $fail (Join-Path $scratch "odd")) -like "*never answered*") $true
        # (a venv's Python, a link to the prepared home's own by its full path, as uv makes it: the venv left out, not followed)
        $outside = Join-Path $scratch "elsewhere/python3.12"
        Put "elsewhere/python3.12" "a python"
        $home3 = Prepared "home3"
        [System.IO.Directory]::CreateDirectory((Join-Path $home3 "$menoIn/uv/plugin-sketchkit/venv/bin")) | Out-Null
        Link "home3/$menoIn/uv/plugin-sketchkit/venv/bin/python" $outside
        Link "home3/$menoIn/pixi/plugin-render/.pixi/envs/default/python" $outside
        Link "home3/$menoIn/plugins/.staging/half/python" $outside
        $before3 = Listing $home3
        $was3 = Listing (Join-Path $scratch "elsewhere")
        $to3 = Join-Path $scratch "run3/h"
        Check "a venv's link out of the prepared home: the copy made" (Copy-Of $home3 $to3) ""
        Check "the venv, .pixi and the set-up cut short left out; the copy holds no link" "$(Test-Path -LiteralPath "$to3/$menoIn/uv/plugin-sketchkit/venv") $(Test-Path -LiteralPath "$to3/$menoIn/pixi/plugin-render/.pixi") $(Test-Path -LiteralPath "$to3/$menoIn/plugins/.staging") $(NoLinks $to3)" "False False False 0"
        Check "the prepared home and what its links lead to untouched" "$((Listing $home3) -ceq $before3) $((Listing (Join-Path $scratch 'elsewhere')) -ceq $was3)" "True True"
        Link "home3/$menoIn/uv/plugin-sketchkit/files/python" $outside
        Check "a link out of the prepared home elsewhere in uv: still refused" ((& $fail $home3) -like "*out of the prepared home*") $true
    }
    & $tutorial { param($raw) Start-Tutorial -Raw $raw -Dest $raw } (Join-Path $scratch "run10")
    $err = try { & $tutorial { New-TutorialHome -Ready } | Out-Null; "" } catch { "$_" }
    Check "-Ready with no prepared home given: where to give it" ($err -like "*-ReadyHome*MENO_TUTORIAL_HOME*") $true
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "run.ps1's prepared home"
$was = $env:MENO_TUTORIAL_HOME
try {
    $env:MENO_TUTORIAL_HOME = "/prepared/by/variable"
    Check "-ReadyHome given: that one" (& $tutorial { Resolve-ReadyHome -Given "/prepared/by/parameter" }) "/prepared/by/parameter"
    Check "none given: MENO_TUTORIAL_HOME" (& $tutorial { Resolve-ReadyHome -Given "" }) "/prepared/by/variable"
    $env:MENO_TUTORIAL_HOME = $null
    Check "neither: none" (& $tutorial { Resolve-ReadyHome -Given "" }) ""
} finally { $env:MENO_TUTORIAL_HOME = $was }
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot ".." "run.ps1"), [ref] $null, [ref] $null)
$calls = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
$start = @($calls | Where-Object { $_.GetCommandName() -eq "Start-Tutorial" })[0].Extent.Text
Check "run.ps1 hands Start-Tutorial -ReadyHome, else MENO_TUTORIAL_HOME" ($start -like '*-Ready (Resolve-ReadyHome -Given $ReadyHome)*') $true
Check "run.ps1 takes the copies away as a tutorial ends" (@($calls | Where-Object { $_.GetCommandName() -eq "Remove-TutorialHomes" }).Count) 1

if ($failed) { Write-Host "$failed failed"; exit 1 }
Write-Host "all passed"
