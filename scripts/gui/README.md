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

**The guides a fresh install shows.** The first-run guide (the
`getting-started` plugin) lies over the middle of the canvas and takes
clicks, and it would come back on every run where `settings.json` is put
back afterwards. So `Start-Meno` counts it as shown before it starts the
app: it adds its id to `plugins.guided` in the app's `settings.json` and
leaves the rest of the file as it is. `-Guide` skips that, to see the
guide itself. Back up `settings.json` before a run and put that copy back
after it, as before: the copy is the one without the change, so the guide
is still to come in the real settings. The file is
`~/Library/Application Support/com.kfchem.meno/settings.json` on a Mac and
`%APPDATA%\com.kfchem.meno\settings.json` on Windows.

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
| `Start-Meno` | start the app under test, sized and in front |
| `Open-MenoFile -Path` | open a structure with Ctrl/Cmd+O: in place of the first tab's blank canvas, or in a tab of its own |
| `Invoke-MenoQuickAdd -X -Y -Item` | a double-click on empty space there, and one of Quick Add's icons: `Chain` begins a chain at the point, `SMILES` opens its field |
| `Add-MenoSmiles -Smiles [-X -Y] [-WaitSec]` | a structure from a SMILES, by Quick Add, centred at the point (the middle of the canvas unless told), and let go of |
| `Save-MenoFile -Path` | Save As (Ctrl/Cmd+Shift+S), under a path not already taken - a workspace (`.meno`), say |
| `Save-Step -Name` | a numbered screenshot |
| `Invoke-MenoClick -X -Y [-Count] [-Right] [-Hold]` | client coordinates, not screen; `-Right` for the other button; `-Hold Shortcut, Shift, Alt` holds those keys through it (Shortcut: Ctrl on Windows, ⌘ on a Mac) |
| `Invoke-MenoDrag -FromX -FromY -ToX -ToY [-Steps] [-PressMs] [-Count] [-AtStep] [-Right] [-Hold] [-Via]` | press, travel, release; `-PressMs 600` holds the button still first - a long press; `-Count 2` after an `Invoke-MenoClick` there is a double-click that drags, `-Count 3` after an `Invoke-MenoClick -Count 2` a triple; `-Right` with the other button; `-Hold` as for a click; `-Via @(@(x, y), ...)` passes through those points on the way - a lasso |
| `Move-MenoPointer -X -Y` | hover |
| `Move-MenoPointerAlong -Path @(@(x, y), ...) [-StepMs] [-AtStep]` | the pointer led through points with no button down - a chain traced with the button up |
| `Invoke-MenoWheel -X -Y -Notches` | zoom; positive is away from you, in |
| `Invoke-MenoSwipe -X -Y [-DX] [-DY] [-Steps]` | two fingers on a trackpad: moves the view; positive DY scrolls down |
| `Send-MenoText`, `Send-MenoKey` | typing (`Send-MenoKey Enter -Shift` for Shift+Enter) |
| `Send-MenoShortcut -Key [-Shift]` | Ctrl (Windows) or Cmd (Mac) with a key: `Z` is undo, `1` fits the drawing to the view |
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

## What a platform module provides

Besides the verbs above that come from it, `run.ps1` asks the module for:

| | |
|---|---|
| `Get-MenoBuild` | where `npm run tauri build` leaves the app on this platform |
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
