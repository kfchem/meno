# How do I take structures out of a paper and make slides of them? A paper
# made for these pages (fixtures/paper, drawn with lines and letters as
# papers draw structures) opened and read in the column beside the page; two
# of its structures dragged out onto the page, each chosen whole and given a
# slide of its own, and the talk begun. Meno reads such figures itself, with
# no plugin. Recorded in an empty home: Meno as someone opening it the first
# time sees it.

Set-Tutorial -Needs @()
$paper = (Resolve-Path (Join-Path $PSScriptRoot "../fixtures/paper/paper.pdf")).Path

# where things lie, in shot pixels of a 1200x780 window, read off runs
# the paper on the page, as it is put down in the middle of an empty page
$onPage = @(1200, 800)
# the column's edge is led to here, so that the page has room for the work and for its menus
$columnTo = 1500
# in the narrowed column: the bond from each ring to its C=O carbon, in scheme 1 of the paper (acid 1, ester 3)
$inColumn = @(@(1734, 594), @(2145, 594))
# where each is let go on the page - high on its left, side by side, clear of the paper - and lies when chosen
$dropAt = @(@(350, 380), @(900, 380))
# empty space, clear of the slides and of the paper, where a menu opens with room below it
$empty = @(400, 700)
# where the pointer rests between steps, so that no tip or hover mark lies over the work
$rest = @(1200, 1300)

Start-Meno -HomeFolder (New-TutorialHome)
# (the first start's questions - setting up chemistry, and keeping Meno up to date, which comes only after a first action - are not
# what this page is about: answered "Not now", unrecorded, before the first step; opening Settings is the first action, and changes nothing)
Suspend-Steps
Step chemistry-not-now Click -At (Part Button "Not now" -TimeoutSec 20)
Step settings Click -At (Part Button "Settings")
$asked = Get-Date
$no = Part Button "Not now" -TimeoutSec 90
Write-Host "  the update question came $([math]::Round(((Get-Date) - $asked).TotalSeconds, 1)) s after Settings was opened"
Step update-not-now Click -At $no
Step close-settings Click -At (Part Button "Close tab" -Within "Settings")
Resume-Steps
Start-Sleep -Seconds 2
Move-MenoPointer -X $rest[0] -Y $rest[1]

Step open Shortcut -Text O
# (the system's own window, which no shot of Meno's holds: the step's words say what to choose in it)
Complete-FileDialog -Path $paper
Start-Sleep -Seconds 4
Wait-MenoSettled -TimeoutMs 8000 | Out-Null

Step read DoubleClick -At (Point $onPage[0] $onPage[1])
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null

$edge = Part Splitter "Width of the texts"
Step narrow Drag -At $edge -Path @(, @($columnTo, $edge.CY))
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null

# each structure pointed at first, so that it lights up, then dragged onto the page
foreach ($i in 0, 1) {
    Move-MenoPointer -X $inColumn[$i][0] -Y $inColumn[$i][1]
    Start-Sleep -Milliseconds 1500
    Step ("take-" + @("first", "second")[$i]) Drag -At (Point $inColumn[$i][0] $inColumn[$i][1]) -Path @(, $dropAt[$i])
    Start-Sleep -Seconds 2
    Move-MenoPointer -X $rest[0] -Y $rest[1]
    Start-Sleep -Milliseconds 800
}

# a slide round each: the structure chosen whole by holding it, then its menu's Slide around these
foreach ($i in 0, 1) {
    $which = @("first", "second")[$i]
    Step "choose-$which" LongPress -At (Point $dropAt[$i][0] $dropAt[$i][1])
    Start-Sleep -Milliseconds 600
    Step "menu-$which" RightClick -At (Point $dropAt[$i][0] $dropAt[$i][1])
    Step "slide-$which" Click -At (Part MenuItem "Slide around these")
    Start-Sleep -Seconds 2
    Move-MenoPointer -X $rest[0] -Y $rest[1]
    Start-Sleep -Milliseconds 800
}

# the talk, begun from the page's own menu, with nothing chosen
Step clear Click -At (Point $empty[0] $empty[1])
Start-Sleep -Seconds 1
Step present-menu RightClick -At (Point $empty[0] $empty[1])
Step present Click -At (Part MenuItem "Present")
# (the window fills the screen while the talk lasts, and no shot of it can be taken: ended with Escape, as the step's words say)
Start-Sleep -Seconds 6
Send-MenoKey Escape
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
Move-MenoPointer -X $rest[0] -Y $rest[1]

# all of the page in view again
Step fit Shortcut -Text 1
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
