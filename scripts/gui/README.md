# Driving the app on a real desktop

Everything else in this repository checks the drawing without drawing it: the
layout is a pure function, so a test can ask where a line ended up and an SVG
can be rendered from the same code and compared by eye. That catches geometry,
and it caught nearly all of it.

What it cannot see is the part of the app that only exists while a pointer is
down. The preview that carries an atom under the cursor is drawn by a
different layer from the picture at rest, and that is where the regressions
have been: a cap left behind at the old position, a cap appearing where the
drawing has none, a wedge that squares off until it is dropped, bonds
vanishing at high zoom. A screenshot taken after the release shows none of it.

This harness starts the built app, works it with real pointer and keyboard
input, and photographs the window - including in the middle of a drag. It runs
on Windows and on macOS: `run.ps1` and the scenarios are shared, and only the
module underneath them is the platform's own.

## Running one

```
npm run tauri build                          # the app under test
pwsh scripts/gui/run.ps1 -Scenario open-and-look
pwsh scripts/gui/run.ps1 -Scenario drag-atoms
```

The same lines on either platform; `run.ps1` picks `MenoGui.psm1` on Windows
and `MenoGui.macOS.psm1` on a Mac. On a Mac, `pwsh` comes from
`brew install powershell`.

Shots land in `.gui-runs/<scenario>-<timestamp>/`, numbered in the order they
were taken. `-Out` puts them somewhere chosen, which is how two builds are
compared: run the old one into `before/`, the new one into `after/`, and diff
the pairs.

`-Exe` points at a different build - on a Mac, an `.app` bundle or a bare
executable - `-KeepOpen` leaves the app running to poke at by hand, and
`-Width`/`-Height` change the window size the scenarios are written against -
if you change it, the coordinates in them no longer mean anything.

**Settings.** No guide opens of itself (a plugin's guide is shown only
when asked, from Settings, *Plugins*), so nothing lies over the canvas at
a first start. Back up `settings.json` before a run and put that copy back
after it. The file is `~/Library/Application Support/Meno/settings.json`
on a Mac and `%APPDATA%\Meno\settings.json` on Windows.

## What it needs

**A desktop.** A logged-in session, unlocked. So this cannot run in CI, and
nothing in the workflow calls it. It will also take over the pointer and
keyboard for the length of a run.

**On Windows, nothing covering the window.** The picture is taken off the
screen rather than out of the window, because `PrintWindow` hands back a black
rectangle wherever the page is drawn with the GPU - which here is everything
worth looking at.

**On a Mac, two permissions**, and the window in front. The picture comes out
of the window itself (`screencapture -l`), GPU-drawn canvas and all, so a
window over Meno's does not end up in the shot; the app even goes on drawing
while it is completely covered. Input is another matter: it goes to the app in
front and to whatever window is under the pointer, not to Meno by name. So the
module brings Meno forward, and every input verb checks it is still there
first - if something else has taken the front, the run stops rather than type
into it.

Meno can be the app in front with a window of the system's floating over it:
a password or authorization prompt (`SecurityAgent`, `coreauthd`), a
notification (`UserNotificationCenter`), an accessibility warning
(`universalAccessAuthWarn`), or anything set at layer 1000 or higher. A key
or a click sent then can answer it - on 2026-10-14 three clicks of a run
landed on an authorization prompt that something else had left up. So every
input verb also lists the windows on screen first (`Find-SystemWindow`; the
list is taken again at most every 200 ms, under 2 ms when it is), and if one
of those is up the run stops, naming it, with nothing sent. A click, a drag,
a wheel turn or a swipe also checks that its point lies on Meno's own window
and stops if it does not; a pointer only moved may go anywhere. The point is
asked of Accessibility (`[MacGui]::PidAt`), which sees through windows that
clicks go by - Notification Center keeps an empty one over the whole screen,
in front of every app's - and takes a web view's content process for the app
it draws for; where Accessibility cannot say, the window in front there
(`Find-WindowAt`, which leaves such a host out). Windows are matched by their
owners' executables, not their names, which are in the user's language
("Mitteilungszentrale" in German, say). The Window Server's own small marks at the top layer - the
recording dot, the pointer - no larger than 64x64 pt, are no such window. The two checks have tests
of their own, run by hand on a Mac with no app started:
`pwsh -NoProfile -File scripts/gui/tests/guard.tests.ps1`.

A question Meno asks before it uses the network - "Download RDKit?", "Keep
Meno up to date?" (`src/ui/network/ConsentDialog.tsx`) - is answered by the
person at the computer, never by a run, on either desktop. Every such
question has one yes, *Allow and download*; the card Meno shows as it
first starts, "Set up chemistry?", has *Set up*, as has Settings' *Set up
<plugin>*, and its question about keeping Meno up to date *Keep up to date*.
What fetches or applies again something allowed before is taken for a yes
too: the card's *Try again*, Settings' *Update all (n)* and *Update to
<version>* of a plugin, and *Restart now* into a newer Meno. A click or a drag whose press
or release would land on it, or a key, a shortcut or typing sent while it
has the focus, stops the run before anything is sent; Escape, which answers
no, always goes. The platform module reads the part at the point, or the
one with the focus, and what it sits in (`[MacGui]::ChainAt` and
`FocusedChain`, from the same hit test as `PidAt`, some 12 ms; UI Automation
on Windows), and `MenoConsent.psm1` decides: a button named `Allow...`,
`Set up`, `Set up ...`, `Keep up to date`, `Try again`, `Update all...`,
`Update to ...` or `Restart now`.
On Windows a press is told by the buttons themselves: Tauri lays a pane
for its resize borders over the whole page, which lets the mouse through
but stops UI Automation, so what is at any point reads as that pane. Every
button of Meno's windows is read instead (`FindAll`, some 40 ms), with its
bounds, and a press inside one named `Allow...` is stopped. A reading
is trusted once it holds the page's parts - the page itself (a Document)
with something in it, whatever it shows, during a talk too; never its
buttons, as the window frame's are named in the system's language - read
again for up to 5 s until it does, as the web view builds what it shows UI
Automation only once asked; one that fails, never holds them, or holds
the yes with no bounds stops the press. So does a point whose window is
not Meno's own or one of its own processes' (its web view's) - another
copy's, another app's - and a point read as that pane counts as unread.
What could not be read is never taken for "not the yes": a lookup that
fails - an error, or nothing given - stops the input as the yes does, and
only "nothing has the keys" (`kAXErrorNoValue` for the focus) lets a key
go. On a Mac the web view builds its page's parts for Accessibility only
once asked, so a run's first press or key waits, up to 5 s, until the hit
test at the window's middle reaches one; a hit test landing on the page
itself said nothing of what is on it.
`MENO_GUI_ANSWER_NETWORK_YES=1`, set by hand for one run, lets such input
through, saying so; nothing in the repository sets it, and
`tests/consent.tests.ps1` checks that, with what is taken for the yes:
`pwsh -NoProfile -File scripts/gui/tests/consent.tests.ps1`.

macOS will not let a process capture another app's window or post input until
it has **Screen & System Audio Recording** and **Accessibility**, both in
System Settings > Privacy & Security. They are granted not to `pwsh` but to
the app the run answers to: the terminal it was started from, or for a run
started by Claude Code, that CLI's own bundled `claude.app` (under
`~/Library/Application Support/Claude/claude-code/<version>/`), not the Claude
desktop app. The module checks both before it does anything and names the app
it needs them for. When macOS offers to quit and reopen that app, "Later" is
enough: the next `pwsh` picks the permission up.

## Writing a scenario

A scenario is a script in `scenarios/`, dot-sourced by `run.ps1` with these
available:

| | |
|---|---|
| `Start-Meno [-HomeFolder]` | start the app under test, sized and in front; on a Mac, `-HomeFolder` starts it as if that folder were the user's home, in a profile of its own there - settings, plugins and all - which is how a run sees Meno as someone opening it for the first time |
| `Find-MenoPart -Role -Name [-Within] [-Row] [-Reveal] [-TimeoutSec]` | a part of the window found by what Accessibility calls it, as a reader of the window sees it - `Find-MenoPart Button "Not now"`, or `-Within` the part it sits in, or `-Row` the words of its row, to tell two apart - with its `Role` and `Name`, in shot pixels: `X`, `Y`, `Width`, `Height` and its middle, `CX`, `CY`. Waited for, since the web view builds what Accessibility sees of its page only once asked; not there, the run stops and says what is. On a Mac only |
| `Get-MenoPartsLike -Role -Like` | every part of the window now of that role whose name is like a wildcard (`Button "Allow*"`), with its name, in shot pixels. On a Mac only |
| `Open-MenoFile -Path` | open a structure with Ctrl/Cmd+O: in place of the first tab's blank canvas, or in a tab of its own |
| `Invoke-MenoQuickAdd -X -Y -Item` | a double-click on empty space there, and one of Quick Add's icons, clicked where Quick Add is seen to stand in a shot (where it stands depends on the plugins added and procedures saved): `Chain` begins a chain at the point, `SMILES` opens its field, `Shapes` and `Calculations` theirs |
| `Add-MenoSmiles -Smiles [-X -Y] [-WaitSec]` | a structure from a SMILES, by Quick Add, centred at the point (the middle of the canvas unless told), and let go of |
| `Save-MenoFile -Path` | Save As (Ctrl/Cmd+Shift+S), under a path not already taken - a workspace (`.meno`), say |
| `Save-Step -Name` | a numbered screenshot |
| `Invoke-MenoClick -X -Y [-Count] [-Right] [-Hold]` | client coordinates, not screen; `-Right` for the other button; `-Hold Shortcut, Shift, Alt` holds those keys through it (Shortcut: Ctrl on Windows, ⌘ on a Mac) |
| `Invoke-MenoDrag -FromX -FromY -ToX -ToY [-Steps] [-PressMs] [-Count] [-AtStep] [-Right] [-Hold] [-Via]` | press, travel, release; `-PressMs 600` holds the button still first - a long press; `-Count 2` after an `Invoke-MenoClick` there is a double-click that drags, `-Count 3` after an `Invoke-MenoClick -Count 2` a triple; `-Right` with the other button; `-Hold` as for a click; `-Via @(@(x, y), ...)` passes through those points on the way - a lasso |
| `Move-MenoPointer -X -Y` | hover |
| `Move-MenoPointerAlong -Path @(@(x, y), ...) [-StepMs] [-AtStep]` | the pointer led through points with no button down - a chain traced with the button up |
| `Invoke-MenoWheel -X -Y -Notches` | the wheel turned over a point: positive upwards, as a page reads a turn (deltaY below 0), the same on every machine - which way that zooms is Meno's setting's to say; over what takes the wheel itself, a frames chip |
| `Invoke-MenoZoom -X -Y -Notches` | zoom the page with the wheel: positive in, negative out, on every machine - the wheel turned the way the Meno under test's Settings (General, The wheel turned upwards) have it zoom as meant, read from its `settings.json` |
| `Invoke-MenoSwipe -X -Y [-DX] [-DY] [-Steps] [-Held]` | two fingers on a trackpad: moves the view; positive DY scrolls down; `-Held` swipes where the pointer is without moving it there first - in a drag's `-AtStep`, with the button down |
| `Send-MenoText`, `Send-MenoKey` | typing (`Send-MenoKey Enter -Shift` for Shift+Enter) |
| `Send-MenoShortcut -Key [-Shift]` | Ctrl (Windows) or Cmd (Mac) with a key: `Z` is undo, `1` fits the drawing to the view |
| `Set-MenoHeldKeys -Hold [-Up]` | presses `Shortcut`, `Shift` or `Alt` and keeps it down - what the pointer shows with a key held, Option over an atom - until `-Up` lets it go; a scenario lets it go before it ends |
| `Close-MenoQuestion [-TimeoutSec]` | a question Meno asks as it starts (keeping it up to date, from an emptied `settings.json` that is not set offline) waited for in shots, however late it comes, and answered "Not now" with Escape; true where there was one |
| `Get-ClientSize`, `Wait-MenoSettled` | |

Coordinates are pixels of the window's own screenshot, so they can be read
straight off one. Take `open-and-look` first on a new machine and read the
positions of the atoms you want out of `03-fitted.png`.

Two things worth knowing:

- **Drag in steps.** `Invoke-MenoDrag` breaks the travel up because the editor
  needs it: it waits a few pixels before it calls a press a drag at all, and
  the preview follows the moves rather than the release. `-AtStep` is where a
  mid-flight screenshot goes. On a Mac the poster says how many clicks a
  press is, so the drag of a double-click that drags wants `-Count 2`, as a
  real mouse would give it; Windows counts for itself.
- **A scenario shares `run.ps1`'s scope.** It is dot-sourced, so a variable
  named like one of that script's own quietly replaces it. Names in a scenario
  should be its own.
- **Jobs outlive the run.** A workflow's job runs as Meno's own executable
  (`Meno --job <folder>`); `run.ps1` closes only the app (`Get-MenoApp`),
  so that a job goes on as it would when the chemist closes Meno - and a
  scenario that starts jobs leaves them running, to be stopped or waited for.
- **Only the app is closed.** The executable has other modes besides jobs,
  each a flag as its first argument: the PDF reader the app starts for
  itself (`Meno --pdf <cache>`) and, on Windows, the installer's Office
  registration. Copies running in any of them may be another session's -
  another worktree's build reading PDFs, say - so `Get-MenoApp` passes them
  over, and so does everything that counts or closes Meno: the list is
  `MenoModes.psm1`'s, and `tests/modes.tests.ps1` checks it against the
  flags `src-tauri/src` defines. A new mode there wants its flag added.

## Recording a how-to page

`run.ps1 -Tutorial <page>` runs `tutorials/<page>.ps1` and records the
manual's page of that name (docs/MANUAL.md, *How do I...?*): before each
step, a shot of the window and where the step is done; after the last, the
window as the page leaves it. They go into `site/manual/how-to/<page>/`:
the shots as WebP (`cwebp`, from `brew install webp`) and `steps.json`,
with the build's version, which the page shows under its pictures. A shot
the same as the one there is written the same, byte for byte, so a run
that changes nothing changes nothing in git. The window is 1200x780 points
unless told otherwise. The verbs are MenoTutorial.psm1's:

| | |
|---|---|
| `Set-Tutorial -Needs chemistry` | what the page says a reader needs, in its own words |
| `New-TutorialHome` | an empty home for `Start-Meno -HomeFolder`, in the run's folder: Meno as someone opening it the first time sees it, its first start's questions and all; left in the run's folder with the shots |
| `New-TutorialHome -Ready [-PluginEnvironments] [-Network]` | a fresh copy of the prepared home (below) in the run's folder, for `Start-Meno -HomeFolder`: its plugins there and its first start's questions answered; taken away as the run ends, unless `-KeepOpen` |
| `Part Button "Not now" [-Within] [-Row] [-Reveal]` | a part of the window by its name (`Find-MenoPart`) |
| `Point 600 400` | a point of the window, for the drawing on the page |
| `Step <id> Click -At <part>` | a step: shot, mark kept, done. Also `DoubleClick`, `RightClick`, `LongPress`, `Drag -Path` (`-Traced`: led with the button up and ended by a click), `Type -Text`, `Key -Text`, `Shortcut -Text`. `-NotDone` records a step the run must not take - the yes of a question about the network, which is the reader's to answer - and leaves it undone. A step done goes through the verbs above, so the guard stops it before it would answer such a question yes |
| `Suspend-Steps`, `Resume-Steps` | steps done unrecorded: answering what the page is not about |

A part found `-Within` another (a dialog) or by its `-Row` keeps that one's
place as well: the page shows the picture near the spot wide enough to take
it in. A page's steps are its ids; its words, in `en.md` and `ja.md`, carry
the same ids in the same order, or the website's build refuses them.
`tests/tutorial.tests.ps1` checks what a step keeps, a drag's way and the
copy of a prepared home, with no app:
`pwsh -NoProfile -File scripts/gui/tests/tutorial.tests.ps1`.

### The prepared home

Most pages need a plugin, and Meno adds one only after the person's own
yes to a question about the network - which a run never gives, in any
home. So the steps a page records after such a question are recorded from a
**prepared home**: a folder a person made once, by hand, never a run, in
which Meno was started as if it were the home, its first questions answered
and the plugins the pages need added, and Meno quit. A run never starts
Meno in that folder and never writes in it: each `New-TutorialHome -Ready`
copies it into the run's folder and Meno is started on the copy.

- **Made** on a Mac, with the app that records:
  `open -n --env HOME=<folder> <Meno.app>`, in a new empty folder. In it:
  the card Meno shows as it first starts answered, the plugins the pages
  need added in Settings, *Plugins*, and each used once, so that it is set
  up. Nothing else is needed, and nothing else is copied (below).
- **Kept** outside the repository: nothing of the computer it was made on
  goes into git. A run is given it by `run.ps1 -ReadyHome <folder>`, or else
  `MENO_TUTORIAL_HOME=<folder>`; a tutorial asks for it with one line,
  `Start-Meno -HomeFolder (New-TutorialHome -Ready)`, and without it the
  run stops, saying where to give it. Refused, saying which, as the disk
  has each place (links followed, in any case): a folder that is not there,
  one Meno was never started in, one whose first card was never answered,
  this account's own home, one in the repository or holding it, and one in
  the run's folder or holding it. A home in which plugins were set up
  before Meno showed that card, and its question about them answered, keeps
  no answer to the card and never shows it: it is taken as answered, as
  Meno takes it.
- **Copied** (`Copy-ReadyHome`) from its Meno folder
  (`Library/Application Support/Meno`) alone - nothing of the prepared home
  outside the entries named here is read or copied - cloned where the disk can: the
  plugins added, with the list of plugins online Meno keeps beside them,
  its signature and state (`plugins`); uv's and pixi's folders - their caches, the
  Pythons, the plugins' downloaded files and the records of each set up
  (`uv`, `pixi`); the tools Meno fetched (`tools`). Left out: the log
  and the network log, the window's place, jobs, the jobs kept and the
  working folder chosen for them, presets, whatever else is there, and the
  rest of the home - the caches, the web view's folders, the fonts Meno puts
  in the home's own.
- **Links**: a copy holds none. Each link in what is copied is followed in
  the prepared home: one leading into those entries is replaced in the copy
  by a copy of what is there; one leading to nothing is left out; one
  leading anywhere else - elsewhere in the prepared home or out of it - back
  into a folder it is in, or round with other links, stops the copy at
  once, saying which, and what was copied is taken away. A link inside
  what is taken out below (a venv's Python leads to the prepared home's own
  by its full path) is not followed: that part goes at once. Only then is
  anything taken out - of the
  copy alone, by its literal name, after checking that it lies inside the
  copy as the disk has it: what names the folder it was made in (each
  plugin's `venv`, `.pixi`, `activation.json`), which Meno leaves out itself
  when its folder moves and makes again at the first use, and a plugin's
  set-up cut short (`plugins/.staging`).
- **Settings** are made afresh, as a fresh home has them, with only this of
  the prepared home's: `format`; of `plugins`, `firstSetUp` (how the card
  was answered), `usedBeforeAsked`, `roles` and `removed` (plugins' ids) -
  so that the card and the question about plugins set up before do not come
  again; and `updates.asked`, set, so that Meno does not ask to keep itself
  up to date. Nothing else is carried: no style, colour set, program
  located, procedure, option or key Meno adds later.
- **The network**: a copy allows no purpose to use it, so a run from it
  asks as a fresh home would - and a run never answers yes. Keeping Meno up
  to date is never carried: with it not allowed, Meno does not look for a
  newer Meno, download one or show its notice.
- **The plugins' environments**: a copy holds each plugin but not its
  environment, which Meno sets up again the first time the plugin is
  asked, under the plugin's own purpose (`python-env:plugin-<id>`). So a
  recording that uses a plugin needs `New-TutorialHome -Ready
  -PluginEnvironments`, which carries over the prepared home's yes to that
  purpose for each plugin in the copy and nothing else (the purpose matched
  exactly, letter case included, as Meno matches it) - and may be used
  only where the person who prepared the home agreed that recordings set
  the plugins' environments up again, and fetch the plugins' own files,
  over the network. That one yes covers both: setting the environment up
  (`py_env_setup_uv`, `py_env_setup_pixi` in `src-tauri/src/lib.rs`) and
  downloading the files a plugin needs besides its packages
  (`plugin_files` in `src-tauri/src/plugfiles.rs`). Each goes out through
  Meno's own network, only to the hosts that set-up names
  (`src/lib/plugins/setUpSources.ts`):
  - uv, the first time, and Python itself: releases.astral.sh;
  - the packages a uv plugin takes from the Python Package Index: pypi.org
    and files.pythonhosted.org;
  - a pixi plugin's: pixi itself, the first time, from github.com and
    release-assets.githubusercontent.com; its packages from
    conda.anaconda.org; and pypi.org and files.pythonhosted.org where it
    takes some from the Python Package Index;
  - a package the plugin's lock fixes to a web address of its own, and the
    plugin's own files: the hosts in those addresses, which the plugin
    names (its lock and its manifest), so they are known only from that
    plugin - and, where such an address is on github.com, also
    codeload.github.com (a repository's archive) or
    release-assets.githubusercontent.com (a release's file), and, where it
    is on huggingface.co, any host under hf.co.

  It is not told to stay offline, so it may ask those hosts even where the
  copied caches hold all it needs. It reaches no other host, and the yes
  lets nothing else in Meno use the network: not the plugin catalogue, not
  keeping Meno up to date, and not another plugin's set-up.
  `-Network` carries every purpose allowed there over - only where that
  person agreed that recordings use all those hosts.
- **Taken away** as the run ends, with Meno closed (`Remove-TutorialHomes`),
  unless `-KeepOpen`: the shots stay in the run's folder.
- **Out of a copy's reach**: what macOS keeps for the account rather than in
  the home - a key kept in the keychain, the open and save panels' last
  folders, the apps chosen to open a kind of file. A page that would show
  any of them is not recorded from a prepared home, and its pictures are
  each looked at before they are committed.

## What a platform module provides

Besides the verbs above that come from it, `run.ps1` asks the module for:

| | |
|---|---|
| `Get-MenoBuild` | where `npm run tauri build` leaves the app on this platform |
| `Get-MenoProfile` | the folder of the Meno under test's settings (`settings.json`), for what a run reads of them - the wheel's way, `MenoSettings.psm1` |
| `Start-MenoProcess -Path` | start a build |
| `Close-MenoProcess -Process` | ask a running copy to quit, and put it down if it will not |
| `Get-MenoWindow`, `Set-MenoWindow` | find the main window; put it at a known size, in front |
| `Save-MenoShot -Path` | the window's picture |
| `Complete-FileDialog -Path` | the system's open dialog is up: choose this file in it |

Nothing else in `run.ps1` or a scenario should know which platform it is on.

## The coordinate spaces, and the one that bites

Windows hands a process that has not said otherwise a pretend desktop, scaled
down by the display's scaling factor. Window positions then come back in
pretend pixels while a screen grab is taken in real ones. On the 175% display
this was first written against, that put every capture a third of a window up
and to the left of where it should have been, with a strip of desktop down the
side - and a screenshot that looks *almost* right is worse than one that
obviously is not. `MenoGui.psm1` declares itself per-monitor DPI aware before
it measures anything, so every number here is a real pixel.

A Mac sizes windows and posts input in points, while a shot of a Retina
display comes out at two pixels to the point. Coordinates stay pixels of the
shot there too: `MenoGui.macOS.psm1` measures the ratio off a real shot when
it sizes the window, rather than asking the display, and converts to points at
the last moment. The window size is the one number in points - in pixels,
1280x860 would be under the app's minimum of 480 points high - so
`-Width 1280 -Height 860` is a 2560x1720 shot there. It follows that
coordinates read on one display do not carry over to another with a different
ratio, Windows at 175% included.

## On a Mac

What turned out not to be the same:

- **The open panel will not take a path until it has asked for one.** There is
  no name field to type into; `/` opens the "Go to the folder" sheet. The
  sheet takes a moment to arrive, and anything typed before it has does land
  in its field - but the sheet never looks it up, shows no suggestion, and
  Return then does nothing at all. `Complete-FileDialog` types `/`, waits for
  the sheet to exist as a window, types the rest, waits for the lookup to show,
  and presses Return twice: once to go there, which leaves the file selected,
  and once to open it. The panel and the sheet are windows of their own, so
  none of this is in a `Save-MenoShot` picture.
- **A click carries its own count.** Whoever posts it sets the click count, so
  a double click is two posts counted 1 and 2; left at 1, the page sees two
  single clicks and no `dblclick`.
- **A move with the button down is a drag event**, and posted as such.
- **A shortcut presses its modifier.** A key event that only carries the
  Command flag never reaches the page. Cmd goes down as a key of its own,
  then the key, then Cmd comes up.
- **A wheel notch is not a unit macOS has.** WebKit turns one line of scroll
  into 40 pixels, where Chromium, and so WebView2, gives a page 100 for a notch
  of a Windows wheel. A notch here is posted as 100 pixels, so `-Notches 5`
  asks the editor for the same zoom on both.
- **The picture is a WKWebView rather than WebView2**, so a shot from one
  platform is not a reference for the other: compare builds within a platform,
  not across.

## Known rough edges

- `Open-MenoFile` types a path into the system file dialog, which is the most
  brittle step here. `Save-MenoFile` does the same in the save dialog; on a
  Mac it types the name over the one offered and goes to the folder with
  Command-Shift-G, as a '/' would only go into the name there. It has not
  been run on Windows yet. The app takes no file on its command line; if it ever
  does, this becomes one argument to `Start-Meno` and the step goes away.
  On Windows it waits for the dialog to be in front before typing, and for
  it to go after Return, and fails if either does not happen: a path typed
  too early went to Meno instead, the file was never opened, and the rest
  of the scenario ran against an empty tab without saying so. (One way the
  dialog never came: `Get-MenoWindow` had taken the window Tauri's event
  loop makes for itself, which is briefly the process's main window, and
  placed that - so the app's own window stayed where it opened and the
  click on its Open button landed elsewhere. It now waits for the app's,
  and opens with Ctrl/Cmd+O.)
- `Wait-MenoSettled` compares whole screenshots, so a blinking cursor or a
  clock in shot would keep it waiting until it times out. Nothing in the app
  does that today.
- Scenario coordinates are written against one window size, one fixture and
  one display: the ones in `drag-atoms` were read on a Mac. A change to any of
  them means reading them off a fresh `open-and-look` run.
