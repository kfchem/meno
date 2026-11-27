# How do I take structures out of a paper and make slides of them? A paper
# made for these pages (fixtures/paper, drawn with lines and letters as
# papers draw structures) opened and read in the column beside the page; two
# of its structures dragged out onto the page, each chosen whole and given a
# slide of its own, and the talk begun. Meno reads such figures itself, with
# no plugin. Recorded in an empty home: Meno as someone opening it the first
# time sees it.

Set-Tutorial -Needs @()
$paper = (Resolve-Path (Join-Path $PSScriptRoot "../fixtures/paper/paper.pdf")).Path

# where things lie, in shot pixels of a 1200x780 window, read off a run
# the paper on the page, as it is put down in the middle of an empty page
$onPage = @(1200, 800)
# in the reading column: the bond from each ring to its C=O carbon, in scheme 1 of the paper (acid 1, ester 3)
$inColumn = @(@(1058, 1024), @(1902, 1024))
# where each is let go on the page, and where the bond it was taken by lies once both are down: the page moves up as the second
# is put down (read off the runs)
$dropAt = @(@(300, 450), @(300, 1200))
$lies = @(@(341, 147), @(312, 816))
# empty space on the page
$empty = @(300, 1450)

Start-Meno -HomeFolder (New-TutorialHome)
# (the first start's questions - setting up chemistry, then, after the first thing done, keeping Meno up to date - are not what this
# page is about: answered "Not now", unrecorded)
Suspend-Steps
Step chemistry-not-now Click -At (Part Button "Not now" -TimeoutSec 20)
Resume-Steps
Start-Sleep -Seconds 1

Step open Shortcut -Text O
# (the system's own window, which no shot of Meno's holds: the step's words say what to choose in it)
Complete-FileDialog -Path $paper
$until = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $until) {
    $asked = Get-MenoPartsLike -Role Button -Like "Not now"
    if ($asked.Count) {
        Suspend-Steps
        Step update-not-now Click -At (Part Button "Not now")
        Resume-Steps
        break
    }
    Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 2
Wait-MenoSettled -TimeoutMs 8000 | Out-Null

Step read DoubleClick -At (Point $onPage[0] $onPage[1])
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null

# each structure pointed at first, so that it lights up, then dragged onto the page
foreach ($i in 0, 1) {
    Move-MenoPointer -X $inColumn[$i][0] -Y $inColumn[$i][1]
    Start-Sleep -Milliseconds 800
    Step ("take-" + @("first", "second")[$i]) Drag -At (Point $inColumn[$i][0] $inColumn[$i][1]) -Path @(, $dropAt[$i])
    Start-Sleep -Seconds 2
}

# a slide round each: the structure chosen whole by holding it, then its menu's Slide around these
foreach ($i in 0, 1) {
    $which = @("first", "second")[$i]
    Step "choose-$which" LongPress -At (Point $lies[$i][0] $lies[$i][1])
    Start-Sleep -Milliseconds 600
    Step "menu-$which" RightClick -At (Point $lies[$i][0] $lies[$i][1])
    Step "slide-$which" Click -At (Part MenuItem "Slide around these")
    Start-Sleep -Seconds 2
}

# the talk, begun from the page's menu
Step present-menu RightClick -At (Point $empty[0] $empty[1])
Step present Click -At (Part MenuItem "Present")
# (the window fills the screen while the talk lasts, and no shot of it can be taken: ended with Escape, as the step's words say, before the last shot)
Start-Sleep -Seconds 6
Send-MenoKey Escape
Start-Sleep -Seconds 3
Wait-MenoSettled -TimeoutMs 8000 | Out-Null
