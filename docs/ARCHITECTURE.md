# Meno architecture

This document describes how Meno is put together today (pre-alpha). It is meant
as a map for contributors: where things live, which layer owns what, and how the
pieces talk to each other. For open problems and planned work see
[`AUDIT-2026-09.md`](./AUDIT-2026-09.md); for where the 2D canvas goes next -
a workspace holding 2D and 3D together - see [`WORKSPACE.md`](./WORKSPACE.md).

## Layers and responsibilities

| Layer | Location | Owns |
| --- | --- | --- |
| Tauri shell (Rust) | `src-tauri/src/` | Window, Tauri's plugins (`fs`, `os`, `opener`, `dialog`, `updater`, `single-instance`), and the only code that starts other processes: uv and pixi - fetched, not bundled, the first time an environment needs one (`tools.rs`) - making plugins' environments (`lib.rs`, `pixienv.rs`); plugins' workers (`lib.rs`); job runners and their programs (`jobs.rs`); the PDF reader, Meno itself (`pdf.rs`); and unpacking a plugin's downloads (`plugfiles.rs`). No chemistry logic lives here. |
| App shell (React) | `src/App.tsx`, `src/lib/core/`, `src/ui/layouts/`, `src/ui/views/` | Tab model (open/close/reorder/rename), mapping a tab's `kind` to a view component. |
| Features (React) | `src/ui/features/*` | One folder per view: the workspace (2D drawing, molecules in 3D, texts, PDFs, workflows) and settings, with the text and style editors they share. |
| Chemistry helpers (TS) | `src/lib/chem/`, `src/utils/` | File parsing (MOL/SDF/RXN/XYZ/PDB), editor model conversion, 2D depiction layout (bond lines, wedges, labels) and ACS-style sizing. Pure functions — no React, no Tauri. |
| Python workers | `src-tauri/resources/plugins/<id>/worker.py` | Each plugin's worker: JSON lines over stdio, run in the plugin's own environment, made by uv or pixi. (The Python Console, a REPL in a tab of its own, was removed from the UI on 2026-10-10, and its worker with it on 2026-10-13.) |

Rule of thumb: parsing and geometry are pure TypeScript (testable with Vitest),
rendering is React + react-three-fiber, and anything touching processes goes
through a Tauri command.

## Directory map

```
src/
  App.tsx                 tab reducer wiring, TopBar + Deck
  lib/core/               tab state: types.ts (TabKind, State, Action), state.ts (reducer)
  lib/chem/               layout2d.ts (2D depiction primitives), style.ts / styleFields.ts (drawing style),
                          labelFonts.ts (label typefaces, letter by letter), ctfile.ts (molfiles,
                          SDfiles and Rxnfiles read as CTfile Formats has them: docs/CTFILE.md),
                          pdb.ts (PDB files read and written as the wwPDB's format v3.3 has them)
  lib/net/                network.ts: the network's record, consent, offline mode
  lib/io/                 kinds.ts: every kind of file Meno takes in, and what a file is - one
                          decision, by content, for Open, a drop and pasted text (docs/FILE-IO.md);
                          structures.ts: Meno's own reading of MOL, SD, RXN, XYZ and PDB files, run in
                          its worker, and the page's checks of what comes back; writers.ts: who
                          writes each kind Export offers - Meno, or a plugin added - and what a
                          plugin's writer is given (`WrittenMolecule`, `knownOf`)
  lib/settings/           appSettings.ts: the app's settings and their file
  lib/input/              wheel.ts: a mouse wheel told from two fingers on a trackpad
  lib/pyEnv.ts            creates/validates the uv venv for a Python profile
  lib/options.ts          options in a general form: drawn by Meno, declared by Meno or a plugin
  lib/units.ts            Meno's units table (CODATA 2018): energies, temperatures, lengths, converted within a dimension only
  lib/boltzmann.ts        Meno's one Boltzmann distribution: the 3D view's shares and the Populations step
  lib/entry.ts            the entry record a workflow's molecule is (docs/WORKFLOWS-FOUNDATION.md, PR 1)
  lib/chem/identity.ts    a structure's identity (its canonical text, Kekulé-free) and symmetry: orbits from the
                          automorphisms Clean-up's canonical search finds, and the group they generate, capped
  lib/doc/                documents and undo; savers.ts; menoFile.ts: the workspace file, a zip
                          (mimetype, workspace.json, files kept by SHA-256), written off the page
                          (menoFileWorker.ts) - docs/FILE-IO.md, *The workspace file*
  lib/roles/              the roles' workers (RDKit's, for now): client, sidecar, the MOL blocks they are asked about
  lib/calc/               readers of calculation output: the catalog, reading, promises, Meno's own reading
  lib/plugins/            plugins' manifests (data), read and checked; the plugins Meno carries, found in their folders;
                          the roles and kinds of step Meno defines; each plugin's one worker (process.ts)
  lib/guide/              Meno's first steps (steps.ts) and the one shown (guide.ts)
  ui/guide/               the first steps, shown in Meno's own card beside the part each points at (GuideCard)
  lib/jobs.ts             jobs: programs run for a workflow's steps, apart from Meno (src-tauri/src/jobs.rs)
  lib/log.ts              the page's errors and warnings into Meno's log (see *Meno's log*)
  lib/chem/elements.ts    the one element table: symbol, number, name, colour, van der Waals and covalent radii, each column's source cited
  lib/chem/reactionMap.ts a reaction's full atom map in 3D, hydrogens included (accelMapper.ts: ACCeL's mapper, ported; docs/ATOM-MAPPING.md)
  lib/scene/              gltf.ts: a scene written as glTF 2.0, for a renderer; shapes.ts: the ball and stick it is made of (docs/RENDER.md)
  utils/structureParsers  parseSDF (V2000/V3000), parseXYZ (multi-frame, distance-based bonds)
  utils/importers         readMoleculesFromText, RXN grouping/layout, EditorModel conversion
  samples/                textbook structures and reactions for the tests and the workflow's 3D node
                          (see samples/README.md)
  ui/layouts/TopBar       custom title bar: tabs, "+" (a new workspace), online/offline, Save (the workspace in front), Settings,
                          and the window's buttons - Meno's own on Windows and Linux (WindowButtons), the system's
                          on a Mac, whose window keeps the system's frame, rounded corners and shadow with the
                          title bar laid over the page (tauri.macos.conf.json: titleBarStyle Overlay,
                          trafficLightPosition; SystemButtonsRoom keeps their room, none in full screen)
  ui/layouts/Tabs         the tab strip: reorder by dragging, the chosen tab's curved corners, the one line under
                          the tabs (the bar's, which a tab not chosen leaves showing)
  ui/layouts/commands     Open… asked for from inside a view (the menu on empty space), shown by App as Ctrl/Cmd+O is
  ui/layouts/ErrorBoundary a part that fails as it is drawn, and the card left in its place (see *When a part fails*)
  ui/fonts/               the typefaces labels are drawn in, read from their files; troika, which draws
                          them, takes each letter from the first font that has it and places letters
                          by GPOS's kerning and marks alone, as a browser does (scripts/patch-troika.mjs,
                          run after every install)
  ui/network/             consent dialog, activity cards, Settings › Network
  ui/views/registry       TabKind -> { Component, create } table
  ui/views/Deck           renders every open tab, hides inactive ones with CSS
  ui/views/openFile       a file to the tab it opens in: Open (Ctrl/Cmd+O)
  ui/features/
    Workspace/            the workspace: 2D editor, molecules in 3D, texts, PDFs, workflows (see below)
    TextEditor/           a text Meno draws: its editor, line pictures, and the field typed through
    StyleEditor/          every drawing setting, with a preview
    SettingsPanel/        Settings, a tab each: General, Drawing, 3D, Chemistry, Files, Calculations
                          and their jobs, Plugins, Dictionary, Network
src-tauri/
  src/lib.rs              Tauri commands (see table below)
  src/fonts.rs            the system's typefaces
  src/net.rs              the network: tasks, the proxy, the record
  src/jobs.rs             jobs: Meno's job mode (`--job <folder>`), the queue, logs, stopping
  src/logfile.rs          Meno's log, `<app data>/logs/meno.log` (see *Meno's log*)
  src/pinch.rs            Windows: the main window made with WebView2's pinch let through, before its page loads
                          (EDITOR-2D.md, *Touch and pinch*); elsewhere it is made from its config in setup
  capabilities/           permission sets for the main window
  resources/plugins/<id>/ a plugin, a folder of its own: manifest.json, its worker, its lock
                          (uv's requirements.lock, or pixi's pixi.toml and pixi.lock);
                          Meno names none of them (docs/PLUGINS.md). uv and pixi are not
                          bundled but fetched the first time an environment needs one,
                          pinned by version and SHA-256 (src/tools.rs)
  resources/licenses/     the licences of what Meno is built with and carries, shown in Settings (General,
                          Licences): THIRD-PARTY-NOTICES.txt, every npm package and crate built in, written
                          by scripts/licenses/notices.mjs (docs/RELEASING.md, *Third-party notices*); and
                          PDFium's, pdfium-render's, the typefaces' and ACCeL's, each in a file of its own
site/                     the website, kfchem.github.io/meno: plain HTML, CSS and JS, no build. The
                          Pages workflow (.github/workflows/pages.yml) writes the latest release
                          into it (scripts/site/release.mjs); scripts/site/wordmark.mjs draws the
                          wordmark; frames/ holds the app's pictures its story steps through
  manual/                 the manual, in English and Japanese, built from its Markdown into the
                          website by scripts/site/manual.mjs (docs/MANUAL.md)
```

## Tabs and views

`src/lib/core` holds a small reducer (`ADD_TAB`, `CLOSE_TAB`, `REPLACE_TAB`,
`SELECT_TAB`, `REORDER`, `SET_CONTENT`, `PATCH_DATA`, `RENAME_TAB`, `SET_DIRTY`). Each tab is
`{ meta: { id, label, dirty? }, content: { kind, data? } }`.

- `tabOrder` is the visual order in the title bar; `mountOrder` is the stable
  render order so reordering tabs never remounts a WebGL canvas.
- `Deck` renders **all** open tabs and hides the inactive ones; views receive an
  `active` flag and are expected to pause expensive work (e.g. set the R3F
  `frameloop` to `"never"`) while inactive. (Workflow tabs, whose nodes held
  canvases of their own, are gone: a workflow is drawn on the workspace's
  page.)
- What is drawn deep in a view and hears keys on the window - a question
  (`ui/layouts/asking`), a card over the canvas - asks `InFront`
  (`ui/layouts/inFront`), which `Deck` gives each tab: one left open in a
  tab behind waits, unanswered, the keys the tab's in front, Escape too,
  until its own tab comes back.
- Every live canvas holds a WebGL context, and `lib/core/limits.ts`
  budgets them, 16 in all: a workspace costs one, and opening past the
  limit is refused with a notice.
- Meno starts on a workspace, and "+" makes another: the canvas is
  the workspace (docs/WORKSPACE.md), so there is no start page.
- **Open** (Ctrl/Cmd+O, or the menu) reads the files picked in the system's
  dialog - Tauri's, which gives their paths - and opens each in a tab of its
  own, by what it is (`ui/views/openFile`, `lib/io/kinds`), told to the tab
  so that it is not asked again: in place of the tab in front if that is a
  canvas nothing is drawn on (`REPLACE_TAB`). A structure from an Office
  document opens the same way, as Meno's own record.
- **Closing the last tab quits Meno.**
- **Commands.** The canvas carries nothing but the drawing. Commands are
  on the right-click menus, with their keys: what is under the pointer, or
  the selection, has its own; on empty space, what the workspace does as a
  whole - Open…, Save As…, New text, Fit to content (Ctrl/Cmd+1), R/S and E/Z,
  the texts, Drawing style, Run all. Save is a button in the title bar, by
  Settings (`ctl.save`, the front tab's saver from `lib/doc/savers`), and
  Ctrl/Cmd+S; Export is the selection's (Select all first, for the whole
  page); a SMILES is drawn from Quick Add. Open… from the menu goes through
  `askToOpen` (`ui/layouts/commands.ts`) to App's file dialog. (Meno's
  menu, from its logo, held them all until 2026-10-10, when the maintainer
  found it full of what Select all and a right-click do already.) The
  system's own menu bar is left as the system has it.

## Documents and undo (`lib/doc`, being adopted)

A tab's content is a **document**: undoable, saveable, and readable by anything
holding the tab. Everything else a view needs - hover, drag previews, camera,
edit buffers - is **ephemeral**: owned by the view, never undone, never saved.
Drawing that line is what makes one undo mechanism work for every view, lets a
2D and a 3D view share one molecule, and keeps a new view to a small amount of
wiring.

`createDocument(initial)` returns a store with `edit(label, updater)`, `undo`,
`redo`, `reset`, `markSaved` and `history()`. History is snapshots: updates are
immutable, so untouched parts are shared rather than copied. Each document has
its own history (Ctrl+Z belongs to the active tab, not the whole app), edits
sharing a `coalesceKey` inside a short window collapse into one step (a drag
must not need one undo per frame), and the stack is capped.
`subscribe` matches React's `useSyncExternalStore`; nothing in `lib/doc`
imports React.

Adoption is incremental. The workspace, with its molecules in 3D
and the texts in its column, is on a document.

## When a part fails

A part of the window that throws as it is drawn takes nothing else with
it. Without a boundary React unmounts the whole tree, and the window goes
white - title bar, tabs and all - with no way back but quitting.
`ui/layouts/ErrorBoundary` puts a card in the failed part's place, drawn as
Meno's notices are (`StoppedCard`): what stopped, that what it showed is
kept, the error in grey beneath, and **Reload**, which makes the part again
from nothing. Each logs the error with `console.error`, naming the part
("Meno: the canvas stopped working.") and where in the tree it was - into
Meno's log too (*Meno's log*).

| Part | Where | Its card | Reload also |
| --- | --- | --- | --- |
| The canvas | `Workspace.tsx`, `CanvasBoundary` round `WorkspaceContent` | in the middle of what the column leaves in view | lets go of what the canvas was in the middle of (`letGo`) |
| The column | `Workspace.tsx`, `ColumnBoundary` round `TextColumn` | at the column's top right; **Hide** closes the column, its texts and PDFs kept | slides the column back in |
| A tab | `ui/views/Deck.tsx`, round each tab's view | at the top of the tab | lets go of what its canvas was in the middle of |
| The window | `App.tsx`, round all it draws | at the top of the window, which can be dragged by any of it meanwhile; **Close Meno** | lets go of what every canvas was in the middle of |

Each part is caught by the nearest of them: the canvas's scene (react-three-
fiber passes an error inside its `<Canvas>` out to the tree round it) and
the canvas's own HTML by the canvas's; the panel beside the canvas and
Settings by their tab's; the title bar and the notices by the
window's. Errors thrown in event handlers, timers, promises and `useFrame`
reach no boundary and do not blank the window; they are not shown.

Nothing a part shows lives in the part, so a part made again shows the same:

- **Documents** are held by `App.tsx`, outside every boundary, and so are
  the tabs. The window's boundary sits inside App's root, so even its Reload
  keeps them; the dialog asking before closing, and the bridges that keep
  each tab's dirty marker, are drawn beside it, not in it.
- **The canvas's store** is kept with its document (`storeOf`), not made
  per provider: a canvas made again - at any of the three levels - finds the
  molecules in 3D turned as they were, the column as it was, the selection,
  and Save writing where it wrote.
- **What a canvas was opened with** - a file, a workspace - is taken into
  its store once (`takeOpening`), not once per mount: taken again, the file
  would stand in for everything done since.
- **A gesture under way** is let go as the canvas is made again (`letGo`:
  before it is made, when the canvas itself failed; as it is, with its tab
  or the window): the press that would have ended a drag, a lasso or a
  bond being drawn was lost with the canvas. Hover, the label and words
  being typed, words being carried out of a PDF, Quick Add, a workflow
  menu and a PDF's menu asked for go with it; what is selected (words in
  a PDF and pictures too), how the molecules in 3D are turned and the
  column stay. A gesture lost while the canvas stays - the window left,
  the pointer taken from it - is let go by its own Escape, and the flags
  it leaves are cleared (`endGestures`, `letLostGesturesGo` in
  store/gesture): a flag left set would take every undo after it.

A part that fails again as it is made shows its card again. The column's
Hide is the way on when the column itself is what fails. For the canvas
there is none yet, but its document is kept while Meno runs, and Save is
the tab's, not the canvas's (`TabFiles` round `CanvasBoundary`:
`useFileActions`, `setSaver`, Ctrl/Cmd+S): while the canvas is stopped,
the title bar's Save, Ctrl/Cmd+S and closing the tab with Save still write
the document, and a save that fails says so under the canvas's card.

## The main window's size and place (`windowstate.rs`)

The main window's frame - its size in logical pixels, its place in the
desktop's physical ones - and whether it was maximized or full screen (never
minimized) are kept in `window-state.json` in Meno's data folder, not in the
settings: written a moment after the last move or resize, and as it closes.
They are put back in setup, before the window is first shown: its config makes
it hidden, and `restore` shows it, so it never appears at the default size and
moves (the no-abrupt-changes rule). Where the kept frame is not mostly on a
monitor there is now - one unplugged, a resolution or scale changed - it is
brought onto the nearest, its title bar within reach, or centred at the default
size where there is none (`place`, with its tests). The size kept is the
inner one - what `set_size` takes - and the place the outer one, so that a
frameless window's larger outer frame on Windows does not grow it at every
start. On Windows the window's own placement is kept as it is
(`GetWindowPlacement`: the normal frame, maximized or not) and given back
with the window still hidden (`SetWindowPlacement`, `SW_HIDE`: the system's
own caption is never seen), maximized hidden where it was, and then shown by
Tauri as elsewhere, so that the frame it goes back to as it is unmaximized
round-trips exactly. Elsewhere the inner size is kept. The talk's window and any
other are not kept. Tauri's window API only; no crate of its own.

## Meno's log

A release started from the Finder or Explorer has no terminal, so what
Meno says of itself is written to a file as well, `<app data>/logs/meno.log`
(on a Mac in `~/Library/Application Support/Meno/logs/`, on
Windows in `%APPDATA%\Meno\logs\`). Everything still goes where it
went before, to stderr and the page's console.

- **What goes in**: a line saying which Meno started (its version, the
  system and the processor); the backend's own lines (`logfile::logged!`,
  where `eprintln!` was) and a panic, with where it happened; and the
  page's `console.error` and `console.warn`, and errors thrown and never
  caught (`lib/log.ts`, set going by the first module `main.tsx` imports,
  through `log_page`). Each line has the time in UTC and what it came
  from: `meno`, `page error` or `page warn`.
- **Nothing from documents, nor files' names**: a line says what went
  wrong. Of an error it has the name and the stack's frames; the message
  only of a `TypeError`, `ReferenceError` or `RangeError` - the engine's,
  about the code that ran - and of that, what it quotes in double or single
  quotes left out (a single quote only with no letter or digit on its outer
  side, so that the apostrophe of can't or Meno's is kept), as any other
  message may quote what was read (a file's text, a SMILES, a name); and,
  failing closed, a line with any quote mark left after that - one never
  closed, one after a letter that is no contraction's, a curly quote, a
  backtick - cut from its first quote mark to its end. Of
  words logged it has only Meno's own messages (`KNOWN` in `lib/log.ts`, a
  tab's name in them left out), any others as `[text]`;
  a number as it is; and of any other thing only what it is (`[Object]`,
  `[Map]`). A message newly logged by Meno's code is added to `KNOWN`.
- **Under 5 MB**: past that the log is begun again, the one before kept as
  `meno.log.1`, one only. Where it cannot be moved there it is emptied,
  and where it cannot be emptied either nothing more is written until Meno
  starts again. The file is opened for each line and closed, its size read
  from it each time, as another Meno - one Office started, on Windows - may
  write to it too. The page sends at most 100 lines a minute; those past
  that are counted, and the next line says how many were left out. A line
  from the page is cut at 4000 bytes.
- The log is begun before Tauri is built, in Meno's data folder as
  `folders.rs` finds it - the one Tauri has too (*Where Meno keeps what*) -
  so that a panic as Meno starts is in it; where Tauri has the folder
  elsewhere it carries on there. Lines from before either, in the first moments, are
  kept, up to 200, and written once it is begun.
- **Settings > General, *Open log folder*** shows the log in the Finder or
  Explorer (`log_spot`: the log itself, or its folder, made first where
  there is none yet), to send with a report. Meno shows no log of its own.

## How things move

Nothing on screen changes at a jump (asked for by the maintainer, for all
of Meno): a highlight eases in and out, a menu, a card or a mark comes into
view and goes out of it, and the drawing and the view go where they are
sent rather than appear there. Short and understated; what belongs together
moves together, in the same time and the same way.

- **One place** for how long and how: `ui/theme/motion.ts` - `DURATION`
  (quick 0.12 s for colours and highlights, base 0.16 s for things coming
  and going, move 0.22 s for the drawing and the view), one easing (CSS's
  `--ease-meno`) - save a panel sliding beside the canvas, which moves the
  drawing and so starts as gently as it ends (`EASE_SLIDE`), and anything
  going out of view, which starts as gently too (`EASE_LEAVE`, CSS's
  `--ease-meno-leave`: quick out of the start, a closing menu was half
  gone in its first frame and read as gone at once) - `TAU` for following
  a moving target, the spring, and motion's `FADE` and `RISE`, whose exits
  go with `LEAVE`.
- **The page's elements**: motion's `AnimatePresence` for what mounts and
  unmounts (menus, dialogs, notices, cards, panels, tabs); CSS
  `meno-fade-in` for what comes into view as a class goes on, and
  `meno-fade-out` with `ui/theme/presence.ts#usePresence` for what has just
  gone; every button's colours ease (one rule in `App.css`). What goes does
  nothing more as it fades (`ui/theme/leaving.ts`: `useLeaving`, or
  `Leaving` under a component's own `AnimatePresence`): its presses and
  clicks are its own and its window listeners off, so a double-click's
  second click does not do the first's again; a question - a consent, a
  discard - takes no click for `QUESTION_ARRIVING_MS` as it comes, or as
  Meno's window comes back in front with it up, nor while the window is
  not in front (`arrival`: on Windows the click that brings Meno back
  reaches the page), and
  each consent is a dialog of its own (`ui/network/questionKey.ts`), so a
  click meant for the one just answered is not the next one's answer.
- **The canvas**: each layer eases its own parts in `useFrame` - each
  part its own way in and out, so one can go while the next comes - and
  invalidates only while something moves (see *Frame loop*). The drawing
  itself goes from shape to shape in `DrawnLayout` (`utils/glide.ts`), and
  a fit goes there through `components/viewGoal.ts`.
  A layer of many parts - shapes, writing by hand, words on the page - has
  one frame callback for them all (`components/partFrames.ts`): a part has
  work at each frame (`usePartFrame`) only while something of it moves - a
  light coming and going, a press held (`HeldGlow`) - and none at rest. Its
  parts are drawn again only as they change (`memo`), share what they draw
  with where they can (`SQUARE`, `UNSEEN`; the selected shapes' handles in
  one set of instances), and take a press by the box they give as it comes
  (`boxRaycast`), at the zoom of the press, not by a plane made again as
  the view zooms. What of them is sized on the screen - a light, a
  handle, a caption's edge - is there only while it is shown, and drawn at
  the zoom the drawing is taken up at (`useDrawnZoom`), so a part at rest
  is not drawn again as the view zooms. `manyParts.test.tsx` counts what
  they make.

## Pointers

Meno draws its own pointers wherever it shows one other than the plain
arrow (asked for by the maintainer, 2026-10-07). Each says
what a drag there does, not what grabs it, and none is a hand:

| Pointer | Where | The system's behind it |
| --- | --- | --- |
| `turn`, a ring with its arrowhead | over a molecule in 3D, which a drag turns | `grab` |
| `turning`, the same in Meno's base colour (#317689) | while it turns | `grabbing` |
| `move`, four arrowheads | over a molecule in 3D selected, which a drag moves, and while it moves | `move` |
| `sideways`, a double arrowhead | a slider, and a chip's bars, dragged along | `ew-resize` |
| `corner-down`, `corner-up`, a double arrowhead aslant | a selected picture's corner, which a drag makes larger or smaller, as the corner points on the screen | `nwse-resize`, `nesw-resize` |

- **One place**: `ui/theme/cursors.ts` draws each as SVG on a 24-pixel
  grid, dark with a white edge to be seen on anything, its spot in the
  middle, and writes their rules once as Meno starts (`installCursors`).
  An element asks for one with `data-cursor` (`setCursor`).
- **Held for a drag**: `holdCursor` puts one over the whole page until
  the drag lets it go (`data-cursor-held` on the root, its rule
  `!important`), so that the pointer stays what the drag does wherever
  it runs - over words, whose text cursor would otherwise take its place.
  A drag lost (the window left, the pointer cancelled) lets it go too,
  and each release lets go only its own hold.
- **Sharp on any screen**: each rule gives the SVG at 1x, then
  `-webkit-image-set` at 1x, 2x and 3x, which WebKit and Chromium read;
  the system's pointer stands behind it.
- **The arrow and the text cursor stay the system's**, as the chemist has
  set them up (size, colour). Clickable rows and buttons show the arrow,
  as a desktop program's do, not a pointing hand.

## 2D structure editor (`ui/features/Workspace`)

What is left before the editor counts as finished, and in what order, is in
[`EDITOR-2D.md`](./EDITOR-2D.md).

- **State**: the structure itself - atoms, bonds, arrows, aromatic circles and
  the id counters - lives in the tab's document (`document.ts`), which is what
  undo, redo and saving act on. A Zustand store per document (`store/index.tsx`,
  `storeOf`: a canvas made again after it failed finds it as it was) holds the ephemeral half (hover, drag and extend gestures, fit requests, the
  label edit buffer) **and mirrors the document**, so components keep reading
  `model` and `arrows` from the store with `useEditor(selector)`.
  `connectStoreToDocument` maintains that mirror; the slices never write model
  state directly, they call `document.edit()` with the pure operations from
  `document.ts`. A gesture is one undo step: extending a bond adds the atom and
  its bond together, an import replaces the model in one go, and repeated moves
  of one atom coalesce.
- **Rendering**: a react-three-fiber `<Canvas>` whose page is the plane z = 0,
  seen straight from above by an orthographic camera (since 2026-10-05):
  `camera.zoom` is CSS pixels per world unit on the page, and a molecule in
  3D is seen as large as it is, however high it stands. What sees molecules
  - picking, a fit, the selection's handle, where made molecules come to
  rest, pictures - follows the camera's eye (`utils/page.ts#eyeOf`, none
  for an orthographic camera; `seenAt`), so a view that is to show depth
  can have a perspective camera instead (`PageCamera`, which keeps
  `camera.zoom`'s meaning on the page). A point of the screen is taken to
  the page with `utils/page.ts#pageAt`, never by unprojecting alone. Page layers keep to the page (z within a few
  thousandths) and are ordered by drawing order. Each visual layer
  is its own component in `components/` (`Bonds2D`, `Atoms2D`, `Wedges2D`,
  `Labels2D`, previews, hover overlays, `PanZoom2D`, `FitToContent2D`, …).
  `DrawnLayoutProvider` lays the drawing out once - the model, with an atom
  being dragged or a bond being drawn out where the gesture has them - and
  the drawing layers read that one layout (`useDrawnLayout`), with the zoom
  it was laid out at, which changes only as the layout does. The view's
  zoom is read apart from it (`useDrawnZoom`), each layer taking only what
  it needs of it - a line kept as wide as the screen's least, say - and
  drawn again only as that changes: a zoom draws again what it changes, not
  every layer at every frame of it. The move and
  extend previews only work out where the atom goes and publish it
  (`moveDrag.preview`, `extend.preview`); they draw nothing of the molecule
  themselves, so a gesture looks exactly as its result will. Model bonds
  reach the layout through `layoutBond(s)` in `layoutOptions.ts`.
  A drawing of tens of thousands of atoms - an SD file of a thousand
  records - has to come up in well under a second, so nothing in the
  layout or the layers goes over every atom or bond for each atom or bond:
  rings are found ring system by ring system (`lib/layout/rings.ts`), a
  bond's neighbours from its atoms' own bonds. A zoom does not lay the
  drawing out again while the layout made at the zoom it was laid out at
  is the same drawing at this one (`sameAtZooms`: world units, lines wider
  than the least they are kept at, a wave's turns in as many steps). Nor
  does a change lay out what it does not touch: the drawing is laid out a
  structure at a time (`lib/chem/layoutStructures.ts`), each atom and bond
  reaching the layout as the same object while it is unchanged, and what a
  structure was laid out to is taken again while all of its atoms and bonds
  are; structures are laid out together where a name's letters, a note on
  a bond or a bond in perspective reaches from one to the other, and a
  drawing with a bracket (an S-group) is laid out whole. A glide moves only
  the structures that changed. The round caps are one instanced mesh; the hit areas of atoms and bonds are
  never drawn (picking does not ask whether a material is); the ring
  circles the canvas offers are found without a second layout
  (`ringCircles`), when the pointer looks for one; R, S, E and Z are placed
  against what is near them (`MarkObstacles`) and shown in one HTML layer.
- **Depiction**: `lib/chem/layout2d.ts` turns atoms/bonds into line segments,
  polygons, text and circles. How big everything is comes from a drawing
  style (`lib/chem/style.ts`): each length in points or as a fraction of the
  bond length, layered from a default up, with ACS 1996 as the preset.
  `lib/chem/acs.ts` turns that preset into layout options at
  `NOMINAL_BOND_LENGTH` world units. Labels are set in IBM Plex Sans by
  default (`lib/chem/labelFonts` `DEFAULT_LABEL_FAMILY`), or in the style's
  own typeface: `lib/chem/labelFonts.ts` holds each typeface's advance
  widths and the outline of each letter (Arimo's for Arial), so
  `placeLabel` places every run and bonds stop the label margin clear of
  the letters without measuring anything at run time. The canvas draws the
  runs where `placeLabel` puts them, in that typeface's own font file - the
  one the layout measures - and draws nothing until it is in
  (`Labels2D`, `useLabelFontUrl`); the SVG names the typeface.
- **Hover, then act**: `hovered.atomId` / `hovered.bondId` is the subject
  of a key (Delete, the clean-up key) and of the menu a right-click opens at
  the pointer (`PartMenu.tsx`), which offers the same actions to the mouse
  alone. Only the main button works atoms and bonds; the other is the
  menu's. Over a button or a card nothing counts as hovered.
- **A press keeps its hover**: a handler that stops a press lets R3F take
  back the hover of the object it is on, where the mesh pressed is not the
  mesh the object was first hovered by - a PDF's page drawn finer since the
  pointer came to it is another of its meshes - and the object is told the
  pointer is out. What is pressed is under the pointer, so a PDF pressed is
  hovered again (`components/keptHover`); its hover goes at the next move
  unless the canvas hovers it again by then.
- **Strokes**: bonds drawn in one gesture are a stroke (`utils/stroke.ts`,
  with the angles in `utils/extendSnap.ts`) - a bond, or a chain - held in
  `extend.stroke` while it is drawn. A chain walks a honeycomb
  (`utils/honeycomb.ts`, `utils/chain.ts`) and may start on empty space
  (`NEW_ATOM`) or be traced with the button up (`extend.tracing`,
  `ChainGuide2D`). The store, `ExtendPreview2D`, `SnapArc2D` and the drawn
  layout all read the same stroke, so what is shown is what is added;
  `addStroke` (or `addStrokeAt`) adds it in one edit when it ends.
- **Long presses**: a press held still is `pressHold` in the store, which
  `HoldProgress2D` shows; `Atoms2D`, `BondsPick2D` and `Selection2D` time it
  (`LONG_PRESS_MS`) and select the structure, or begin a box.
- **Import**: what a file is, `lib/io/kinds.ts#kindOf` (once, by whoever
  takes it in) → `utils/io.ts#processFileContent` → `utils/importers.ts`, or
  the calculation readers (`lib/calc`).
- **Chemistry**: RDKit's marks on the structure, in `chem/` and
  `ChemMarks2D` (see the chemistry worker below); clean-up and a SMILES's
  layout by Meno's own engine (`src/lib/layout`), run in a web worker
  (`chem/layoutWorker.ts`), what it is given read out of the drawing
  (`chem/engineLayout.ts`, `lib/layout/drawn.ts`).
- **Frame loop**: the canvas runs `frameloop="demand"` at a fixed `CANVAS_DPR`
  (2x). React commits (store changes) request a frame automatically; anything
  that animates or mutates the scene imperatively must call `invalidate()`
  while it is still moving — see `PanZoom2D` (inertia), the hover layers and
  the drag/extend previews. A new animated layer that forgets this will appear
  frozen; a layer that invalidates unconditionally brings back the old
  always-on loop.

- **Molecules in 3D** (`Molecules3D`, `Molecule3DView`, `Frames3D`,
  `utils/molecule3d.ts`, `utils/measure3d.ts`, `utils/edit3d.ts` - a
  distance, an angle or a torsion angle set: docs/WORKSPACE.md, *Editing
  in 3D*):
  - What they are: the document's `molecules3d`. Each has its atoms in
    ångströms, its other frames and their energies, its look (the 3D
    style's primary, or its secondary), its measurements, and where on the page its
    centre stands. How each is turned and which frame it shows are the
    store's (`turns3d`, `frames3d`), not the document's, and so are what
    is selected of them (`sel3d`) and the atoms and bonds chosen in one
    (`chosen3d`). A turn of several as one body moves them, so it is the
    document's too: `store/turnJournal.ts` keeps the turns with that undo
    step, which stays one step however long the hand pauses in it. A turn
    by the selection's handle where they stand moves nothing, but is a
    step all the same (`keepTurns3d`), for the turns to go with.
  - How they are drawn: a molecule stands as high as it reaches, so no
    turn takes it behind the page - or where a turn of several as one body
    put it (`at.z`). It is instanced, lit, drawn after the
    page and depth-tested; double and triple bonds are two and three
    lines. Another frame, another look, or a place set by an undo is gone
    over to, not jumped to. Its look is a style (`lib/chem/style3d.ts`):
    a list of styles, the old 3D viewer's first, two of them given the
    roles of primary and secondary, each with its own changes, and the
    light and turning they share - kept in the app's settings (`style3d`)
    and edited in Settings by `StyleEditor/Style3DEditor`; the canvas
    reads it through `Workspace/style3d.ts`. `solidOf` works out each
    atom's radius in both looks (none for an atom a look leaves out), and
    the view eases between them (docs/WORKSPACE.md, *Styles in 3D*). A 1.5 Å bond is as long as a drawn one.
    Its depth (docs/WORKSPACE.md, *Depth in 3D*): each atom's ambient
    occlusion as nine spherical-harmonic terms and each bond line's two
    ends (`utils/occlusion3d.ts`), worked out for the frame shown in both
    looks by a worker and kept by what they were worked out from
    (`utils/occlusions.ts`, `occlusionWorker.ts`), read by the atoms' and
    bonds' material (`utils/occlusionMaterial.ts`) from instance
    attributes that `components/shading3d.ts` eases; and the key light's
    shadow (`components/KeyLight3D.tsx`, one for the canvas, as the
    settings' preview has its own), cast by coarse instanced balls and
    sticks sharing the drawn ones' instance matrices and drawn as none on
    the canvas (`utils/shadows3d.ts`), the shadow map cast again only when
    they move or the box it is fitted to changes. A style may shade on
    the screen instead (`utils/screenShade.ts`, `components/ScreenShade3D.tsx`):
    three.js's `GTAOPass` given a pass camera on the molecules' own layer
    (`SCREEN_LAYER`) and a normal material whose alpha is each mesh's
    weight (`shadeWith`), run each frame any molecule wants it, at half
    resolution, and a full-screen sheet drawn just after the molecules
    (`renderOrder` `OVER_PAGE + 0.5`) multiplying the canvas by the shade
    where a molecule is. `KeyLight3D` counts the atoms and marks a very
    large drawing (`utils/largeDrawing.ts`), which the molecules read, and
    says so once through `src/ui/notices.ts` (shown beside the network's
    cards). `render3d` draws a picture's the same way, instanced, with
    every ball and stick casting, and a screen shade at full resolution
    per tile, each tile drawn with a margin as wide as the shade looks.
  - The pointer: hovered, its outline lights up faintly and the atom under
    the pointer swells on a spring. A drag on it - its atoms, bonds or
    within its rings - turns it, with inertia; on one selected, it moves
    it and all that is selected. A long press selects it, the outline
    spreading from the atom pressed on; a click chooses an atom or a
    bond. The selection's handle (`Selection2D`) turns molecules alone as
    one body in 3D, and with a drawing in its plane.
  - The rest: measurements, made from its menu, are measured afresh in
    whatever frame is shown. Its frames are a chip under it that opens to
    a slider, with each frame's energy as a bar.
  - See [`WORKSPACE.md`](./WORKSPACE.md).
- **The workspace file** (`.meno`; `lib/doc/menoFile.ts`, FILE-IO.md, *The
  workspace file*): a zip, its `mimetype` first. Inside, `workspace.json`
  holds everything on the canvas (`utils/workspace.ts`: the molecules in 3D
  turned and shown as they are, the document's own style) and `files/`
  each file it keeps by its SHA-256 - calculations' outputs opened, PDFs,
  pictures - listed in `files.json`. Save writes `.meno` alone; every other
  format is Export's.

## Workflows

Calculations built as workflows are on the page itself - the workspace is
the node editor - as [`WORKFLOWS.md`](./WORKFLOWS.md) specifies (stage 6).
The Workflow Builder tab, a prototype on React Flow, was removed with
React Flow on 2026-10-08: the workspace's editor is written anew, its code
not taken from either.

- **The document holds it** (`Workspace/document.ts`): `sets`,
  `steps` and `wires`, numbered from `nextWorkflowId`; each change is an
  edit (`workflow/model.ts`), so undo takes it back and the workspace file
  keeps it (`utils/workspace.ts`, read back by `workflow/saved.ts`).
- **What a set holds is what lies inside its frame** (`workflow/entries.ts`):
  never a list of ids, so moving a molecule in or out is all it takes, and
  a workspace opened again needs no ids mapped. A set the chemist makes is
  a compound set; a set a step made says what it holds (`made.holds`).
- **How parts join** (`workflow/flow.ts`): what a port gives, what may be
  wired to what (`canWire`), what comes into a step, and its state - the
  key of what it ran on, kept with the run, tells *Changed*.
- **Kinds and who does them** (`workflow/kinds.ts`, `workflow/doers.ts`):
  Meno's table of kinds; Meno does the steps on entries alone
  (`workflow/meno.ts`, the RMSD in `workflow/rmsd.ts`), and a run
  (`workflow/run.ts`) puts what it gave in a result set to the right of
  its step, in one edit. What came in, worked out by a program (*Optimise*,
  *Energy*, *Frequencies*), is then turned in the view (`turns3d`) to lie
  over what it was worked out from (`laidOver`, Horn's quaternion in
  `utils/align3d`), room made for it so turned: a program may hand a
  molecule back turned (Gaussian's standard orientation).
- **Drawn** by `components/Workflow2D.tsx`: wires are the canvas's own
  ribbons; sets, step cards (`workflow/SetFrame.tsx`, `StepCard.tsx`) and
  ports are HTML on **one** layer laid on the page at its scale (drei's
  `Html` in transform mode, `workflow/look.ts` `PX`). One layer, not one
  per part: WebKit finds what is under the pointer among layers in their
  order, and a part's layer covered the parts on the layers below it.
  Lines are a hair on the screen at any zoom: the layer's `--hair` is set
  each frame from the zoom, and wires are made as wide on the screen for
  it. The layer is laid out in its own pixels, which Chromium rounds to
  before it scales them: ports are laid out in the screen's, the layer's
  `--scale` undone on them, and the cards' and sets' hairlines are inset
  shadows, not borders (WORKFLOWS.md, *Laid out in the screen's pixels*).
  Colours, cards and icons are Meno's own (WORKFLOWS.md, *How it
  looks*): its palette, its cards' hairlines, Heroicons' outline
  icons (`workflow/icons.tsx`).
- **Who does a step** (`workflow/doers.ts`): a step is a plugin's - or
  Meno's, which stands among them for the steps on entries alone - and
  of one of the kinds its manifest's `steps` fill (`kindsOf`); who does
  it says what options it takes (`optionsFor`); their defaults are set in
  Settings alone, by plugin and kind (`step:<who>:<kind>`), and a step
  starts with them, its own changes never written back. Quick Add offers
  the plugins added, each with its kinds (`workflow/offered.ts`).
- **Running** (`store/slices/stepRuns.ts`): the steps to run - those
  asked for, and before each the furthest back that has not run or has
  changed, and every step from it on (`chainTo`: a step done takes anew
  what one changed before it gives) - each started once the step before
  it has ended well, those that do not wait on one another at once
  (`runSteps`; *Run from here* adds the steps after, *Run all* every step
  not done and every step after one); each run - Meno's at once, as
  one edit; a plugin's conformer search on structures drawn in its worker
  (RDKit's, through the roles' `conformers`, with the step's options); a
  plugin's step on entries alone at once, `run`
  asked of its worker and the entries it kept brought in, the rest set
  aside (none of the bundled plugins does one); a plugin's
  program as jobs: `prepare` asked of its worker, a job started for each
  (lib/jobs), the run kept in the document as `running` - amended in, so
  that undo does not take a run back, but the workspace is unsaved until
  saved, and saved keeps it - its jobs looked at each second while there
  are any (Workflow2D), and, all ended, `collect` asked for each and the
  results brought in as one edit - a conformer search's as a conformer
  set, each geometry it gave a conformer of its entry's compound, and on
  a conformer set one job for each compound (`jobEntries`,
  `conformersWorked`) - or, where its plugin says so (`collect`'s `read`),
  read by Meno's readers as an output opened is, every reader of its kind
  added put together, and kept by its kind as what the molecules were read
  from (`readWithReaders`): ORCA's and Gaussian's. A step whose program
  installed separately is found nowhere says so on its card, and its *Run*
  opens Settings, Plugins. A workspace opened with steps running
  is looked at the same way, and picks them up. What a plugin sends and
  reads back is checked as data (`workflow/programs.ts`). A step keeps
  the run before its last and every run kept, with what each gave
  (`keepRun`, `dropsOnRun`, `keptRun`, `showRun` in `workflow/run.ts`), as
  a new run's results come in. What a run would drop is said before it
  (`workflow/earlierRuns.ts`).
- **A workflow's parts in the selection** (`selFlow`, beside `sel` and
  `sel3d`): taken by a box or a lasso by their middles (`workflow/parts.ts`
  `flowIn`), by Ctrl or ⌘ and a click, or *Select all*; deleted, moved
  (`utils/dragSelection.ts`, `placeMarks`) and copied with the rest - a
  copy's record carries them as `flow`, read back as a workspace's
  workflow is (`readWorkflow`), pasted numbered on and wired as they were
  (`appendParts`). What a step did never goes with it.
- **Procedures** (`workflow/procedures.ts`): a whole flow (`flowOf`) as
  `procedureParts` - its steps, the sets the chemist drew, emptied, the
  wires among them - kept in Settings (`procedures`) as data, read as a
  workflow each time; put down from Quick Add (`putDownProcedure`), listed
  and written as a workspace in `SettingsPanel/ProcedureSettings.tsx`.
- Settings, Calculations, is `SettingsPanel/CalculationSettings.tsx` - by
  plugin, each with its kinds' options - and its jobs
  `SettingsPanel/JobSettings.tsx`.

### Jobs

A program a step runs - xTB's, say - runs as a job (`src-tauri/src/jobs.rs`,
`lib/jobs.ts`): in a folder of its own, `<local app data>/jobs/<id>/`, apart from
Meno, so that it goes on when Meno closes (WORKFLOWS.md, *When Meno
closes*).

- **Meno's own executable runs it.** `job_start` writes the job's folder -
  `job.json` (the program, its arguments, its environment), its input in
  `work/` - and starts Meno's executable as its runner, `Meno --job
  <folder>`: `run()` hands that to `jobs::job_mode` before anything else, so
  it opens no window and needs no webview. The runner is started in a
  process group of its own (detached, on Windows), in the jobs' folder -
  never Meno's own, which it would hold, nor its job's, which is taken away
  as soon as the job is over - and nothing of Meno's waits on it.
- **Jobs wait their turn.** A runner takes its turn under `jobs/.queue.lock`
  (`File::lock`): the earliest asked for among those waiting starts where
  its cores and memory (`JobSpec.cores`, `.memory`) fit beside those of
  the jobs running within what jobs may use (`jobs/.limits.json`, written
  by Meno from Settings; this computer's cores and three quarters of its
  memory where there is none) - or where none runs, whatever its size.
  One behind it never starts first. How often a waiting job looks is
  reckoned as if as many of its size ran at once as fit.
- **Looked at often while young** (2026-10-13). The runner looks for its
  turn every 400 ms, and at its program every 200 ms - but every 50 ms
  for the first 3 s of a program, and of a job at the head of the queue,
  easing back to its old step by 6 s (`step_at`). The page looks at a
  run's jobs every 100 ms for its newest run's first 3 s, easing back to
  once a second by 6 s (`workflow/lookEvery`). A step whose program takes
  0.2 s is seen done within a few tenths of a second, and what runs on, or
  waits behind others, is watched no more often than before.
- **Its program** runs in `work/`, its output and errors in `log.txt` -
  given one of its input files as what it reads, where its plugin says so
  (`stdin`: Gaussian's, run as `g16 <input`), else nothing - in a
  process group of its own (macOS, Linux) or a job object that kills what
  is in it when it closes (Windows; the program started held, put in the
  job object, then let go, so that nothing it starts at once is outside
  it - one that cannot be put in a job object is ended before it runs, and
  its job fails, saying so), so that *Stop* - a `stop` file the
  runner looks for - stops it and everything it started: asked, then made
  to after 3 s (macOS, Linux); at once (Windows). The runner writes how it
  ended in `state.json`, whole each time (written beside it, then renamed).
- **A runner asked to go** - SIGTERM, SIGINT or SIGHUP (macOS, Linux: a
  logout, `kill`, Activity Monitor's *Quit*) - stops its program as *Stop*
  does, writes the job stopped, and goes (`run_as_runner`): its program,
  in a group of its own, is never left running with the job read as gone.
  On Windows the job object takes it with the runner, however it goes.
- **A finished job's folder is taken away** (*Remove*, *Clear finished
  jobs' files*) by moving it out of the jobs' way first, under a name no
  job has (`.taken-…`), then removing it: one a program still holds a file
  in (Windows) is never left half there as a job - nor read as one in the
  queue; what was left goes at the next clearing.
- **What a finished job made can be taken out of its folder** alone
  (`job_trim`): every file in its work folder it was not given - its
  spec lists those (`given`) - and the folders that leaves empty; its
  log, its record and its input stay, to be read. A failed render's is,
  as it fails: a film's frames, which the job can make again, are
  hundreds of megabytes at 1080p. Settings says how much the finished
  jobs' folders hold (`jobs_finished_bytes`).
- **Gone is told by a lock, not a process id.** The runner holds
  `runner.lock` for as long as it is there; a record that says waiting or
  running whose lock nobody holds was left by a runner that went without
  saying how it ended - the computer restarted - and reads as *gone*. A
  process id would be another program's after a restart.
- **A program installed separately** - ORCA, Gaussian - is one a plugin's
  manifest declares in `installed`: its name, its file on each system, the
  folders put first where programs are looked for, and the variables it is
  given, each a place in its installation (`{folder}`, where its file is;
  `{parent}`, the folder above). `installed_found` lists every copy there
  is: where the chemist located it, where that is still a program of that
  file's name (that alone, for one just picked); each where PATH finds it;
  then the folders it is usually installed in, newest first.
  `installed_choice` asks each its version where the manifest says how,
  and takes the one located where it is new enough, else the newest that
  is, else the first with why it will not do ("Meno needs ... 5.0 or
  later"). `installed_program` gives the one chosen its folders and
  variables (`installed_env`) - never one that loads code into it, nor
  PATH itself, nor what Meno sets. `program_where` answers the page's
  question of where it is (`lib/plugins/installed.ts`, which keeps the
  answers for the step cards and Settings, Plugins, and what was located
  in the settings' `plugins.programs`).

## Python sidecars

```
worker ──ensurePyEnv(profile)──▶ py_env_python_path_uv / py_env_setup_uv (Rust)
       │                          ├─ tools::ensure(Uv): <data>/tools/uv/<version>/uv[.exe], fetched once
       │                          └─ runs it: `uv venv`, `uv pip install -r <lock>`
       │                             stdout/stderr → events uv:log / uv:err
       └─ext_spawn_sidecar({ entry: <venv python>, args: ["-u", <worker.py>] }) → id
          ext_stdin(id, JSON line) ─▶ worker ─▶ events ext:stdout / ext:stderr / ext:exit
          ext_kill(id)
```

Each plugin has one worker, its one process (`lib/plugins/process.ts`),
asked for its roles (`lib/roles/worker.ts`) and for the files it reads and
writes and the steps it does (`lib/calc/workers.ts`), each through a client
of its own sharing the process's question ids.

The roles (`lib/plugins/roles.ts`: SMILES; the checks - hydrogens, valence,
aromatic rings, R and S, E and Z, one role since R and S were folded into
it; structures read from pictures; stereoisomers; conformers; a formula of
a molecule in 3D; and pictures and films rendered) are filled by plugins
that say so in their manifests - RDKit the chemistry roles, MolScribe and
MolNexTR the pictures, Blender the renders - each a folder of its own like
any plugin (`resources/plugins/rdkit/`, its environment `plugin-rdkit`).
A worker is a sidecar, started by `lib/roles/worker.ts` (`chemWorker(role)`:
the plugin chosen for the role in Settings, else the first that fills it)
and asked through `lib/roles/client.ts`: JSON lines, a fixed set of
requests (to_smiles, rxn_to_smiles, from_smiles, analyse, read_picture, and for 3D
open_stereo, conformers, drawing_of, orders_from_smiles and add_hydrogens;
a render is a job, `render/renders.ts`; the worker says its version in its
first line, ready), MOL blocks in (written by
`lib/roles/molblock.ts`, a label that is not an element as `*`) and V3000
blocks or coordinates out. It is set up the first time a role it fills is
needed, asking first, unless the chemist took it away in Settings, Plugins
(`plugins.removed` in the settings); then the role says to add it. It runs
no code it is sent, and the app keeps it off the network. Its tests need
RDKit and run by hand (`scripts/chem/test_chem_worker.py`).

Reader plugins (docs/FILE-IO.md, docs/PLUGINS.md) are sidecars too, one
profile each, named `plugin-<id>` as every plugin's is. Each is a folder
of its own, `resources/plugins/<id>/`, and stands alone: it knows of no
other plugin, and Meno names none of them. Its manifest (`lib/plugins/manifest.ts`;
the folders found by `lib/plugins/known.ts`, the plugins Meno carries for
now) is data saying what it is, what makes its environment (its lock and
`worker.py` in its folder), every kind of file it knows - each it reads
told by marks, text, never a pattern - and the kinds it reads by id, its
own or Meno's; it is checked as data however it came (docs/PLUGINS.md,
*The manifest*).
`lib/calc/catalog.ts` makes the readers of the manifests, with Meno's own
reading (`MENO`) first. Meno's core knows no program (the maintainer,
2026-10-06): `lib/io/kinds.ts` knows Meno's own kinds only, and registers
the kinds of the plugins added - while they are added (`lib/calc/workers.ts`)
- refusing a mark that one of Meno's own sample files holds. A plugin not
added is never started or asked: a file no plugin added reads is told by
the kinds the plugins Meno carries but not added say they read, by their
own marks (`offeredKinds`, `catalogued`), to say which plugins would read
it (`lib/calc/probe.ts` `kindOfFile`, `lib/calc/read.ts` `whoReads`).
- A plugin is added in Settings, *Plugins*: `ensurePyEnv`, with the
  network's consent under `python-env:plugin-<id>`. It is taken away there
  too: `py_env_remove`, which removes only its own folder.
- *Files* in Settings says who reads each kind: one reader (`readerFor`:
  the one chosen, else Meno where Meno reads it, else the plugin added whose
  own program writes it - its manifest's `writtenBy` - else the first
  added), and
  the readers chosen to read it as well (`alsoReadersFor`), kept as
  `files` in the settings.
- `lib/calc/workers.ts` starts a reader's worker the first time it is asked
  to read, as `lib/roles/worker.ts` does, and asks it through
  `lib/calc/client.ts`: `{"op": "read", "kind", "name", "text"}` - Meno has
  told the kind already; the file's text, never a path - and back Meno's
  own plain data (`lib/calc/output.ts` `ReaderOutput`); `ask` for a
  promise, `probe` for a kind its plugin tells itself (`lib/calc/probe.ts`).
  Like the chemistry worker, it runs no code it is sent and is kept off the
  network. A reader is known by its id: a molecule keeps its readers as
  "id version" (`readerIdOfLine`), its results their reader's id.
- A plugin that writes a kind declares it in its manifest's `writes` (one
  of its `kinds`, by id - its name and files' extensions the kind's - and
  its options as data, checked by `acceptOptions`). Export offers it while the plugin is added, for
  molecules in 3D: the molecules chosen become one `WrittenMolecule`
  (`Workspace/utils/written.ts`; several as they stand on the page),
  the worker is asked `{"op": "write", "kind", "name", "molecules",
  "options"}` through the same client, and the text it gives back is
  written where the chemist chose. The first is Gaussian's input
  (`resources/plugins/gaussian/`, Python alone, whose steps run Gaussian
  as well; its tests, `scripts/calc/test_plugin_gaussian.py`, run in CI).
- Where the line is between a plugin and Meno: a plugin knows the file,
  Meno where and how what it found shows, and what can be done with it.
  What Meno does something with has a form of its own in `ReaderOutput` -
  the atoms, each geometry, each one's energy in hartrees, and what the
  calculation was (program, method, basis, charge, multiplicity). Every
  thing else is a result, in one general form (`lib/calc/results.ts`): it
  belongs to the molecule, each frame, each atom, pairs of atoms or a list;
  it has a group and a name; and its values are numbers or texts, each as a
  quantity Meno knows - an energy in hartrees, a charge, a spin population
  (signed, as a charge is), a wavenumber (an
  imaginary one negative), a length, an angle, a dipole - or with its own
  unit. `readResults` keeps those that read as results for the molecule
  (the right count, indices it has, no markup), and `valueText` writes
  them, the same whoever gave them. A list's row can be of atoms, a frame or
  a motion; a molecule's result can rank for the chip's line (`chipLine`).
- One reader reads a kind (`lib/calc/read.ts` `readOutput`): the molecule
  stands on the page as soon as it answers, with its geometries and what
  the calculation was. The readers chosen to read it as well read it
  alongside; what each finds - or that it could not read it - is put out by
  the output's SHA-256 (`lib/calc/readings.ts`) and joined to each molecule
  read from that output wherever it stands (`withReadings`, applied by the
  document's `amend`: learnt of the document, not done to it, so nothing
  to undo), a reader that could not read it said in the chip's card.
  `combine` puts findings together as they are joined: the geometries are
  the reader's, a reader whose atoms are not those is left out, and every
  reader's results are kept, each with the reader it came from: a result is
  known by its reader and its name with that reader (`resultKey`), and
  names are never matched across readers. Where two
  readers' results stand in one place, each reader's are under its name
  (`lib/calc/sources.ts`: `cardGroupsOf` for cards and the chip's details,
  `titled` for the menu's lists); the chip's line is the first's that
  ranked any. Where none is added, opening the file says which plugin to add.
- An opened file that is no structure file but a kind of output
  (`openedAs`, `processFileContent`) is read so, and its geometries come in
  as an XYZ file's frames do (`calcResult`), its last shown; what the
  calculation was, the readers that read it and its results are kept on
  the molecule (`calc`, saved in `.meno` and read back by `readCalc` as a
  plugin's are), so that they show as they were where no reader is
  added. A record with any one-value field not as Meno writes it (a charge
  that is not a whole number, a program that is no words) is refused whole
  and counted among those that could not be read, never read back without
  that field.
- Where results show (3c), as the look stays as it is: the molecule's -
  and the frame's shown - above the frames chip, as its text is pointed at,
  its line saying the ranked ones (`Frames3D`); an atom's, or a bond's, on a
  card beside it once it has been pointed at a moment (`PointedCard3D`,
  placed each frame by `Molecule3DView`); and each list from the
  molecule's menu, under it (`CalcList3D`; the view's `lists3d`, by
  molecule, with the row chosen and the row pointed at). Opened with too
  little room below it, a list asks for room, and the view glides - zooming
  out, where it must - until the molecule and the list are both seen. A
  row pointed at outlines its atoms; one chosen shows its frame or moves the
  molecule. No colouring (the maintainer).
- Vibrations (3b) are a list whose rows move the molecule: one chosen, its
  atoms move in it each frame (`Molecule3DView`): what the motion added is taken
  off the atoms' places before the frame is placed and put on again after
  (`utils/vibration3d` `vibrationOffsets`), so frames, measurements and
  labels follow as for any motion; its swing eases in and out, and another
  chosen waits for the one moving to come to rest. The atom that moves most
  goes 0.3 Å, once every 1.2 s, whatever the frequency. No arrows and no
  spectrum (the maintainer).
- A program's output is read by that program's own plugin, where it is
  added (PLUGINS.md, *Several plugins, one role*): ORCA's by the ORCA
  plugin, Gaussian's by the Gaussian plugin and xtb's by the xTB plugin
  (each its `reader.py`; FILE-IO.md) - each written from its program's
  manual and its own outputs - and a job's output and a file opened by
  hand alike.
- The cclib plugin (`resources/plugins/cclib/worker.py`) gives cclib's
  reading of many programs' outputs, as a reading of its own: chosen in
  Settings, *Files*, never the default where the program's own plugin is
  added. cclib is used as a library, its version pinned in its folder's
  `requirements.lock`, its manifest bringing every program cclib reads,
  each told by its own banner. It is an adapter, and no more
  (2026-10-31): the output is given to cclib as it
  is, and what cclib returns is mapped into Meno's form - the atoms, each
  geometry, each one's energy, what the calculation was, each atom's mass,
  and its results in the general form - with nothing read from the text
  besides, and nothing cclib returns changed but the vibrations: the
  translations and rotations an output lists among them, at a frequency
  of naught (under 1 cm-1), are left out and the rest numbered from one,
  as the ORCA and xTB plugins' readers do. Its tests read sample outputs
  from `calc-samples/`, which git ignores - no program's output is
  committed - and run by hand (`scripts/calc/test_reader_cclib.py`); the
  app's side is tested with the plain data written by hand. An answer
  never holds a number that is not one (JSON has none).
- The PySCF reader (`resources/plugins/pyscf/worker.py`, in a pixi
  environment: PySCF from conda-forge, which has it for Windows; cclib
  from PyPI) is a plugin of its own, sharing no code with another
  (the maintainer, 2026-10-06). It gives the molecule - read with cclib as
  a library, or a Molden file with PySCF - and its orbitals and densities;
  charges, vibrations and the like it leaves to other readers. A Molden
  file gives no charge or multiplicity, so they are worked out from its
  own sections (`species_of`, 2026-10-14), each left unsaid where the file
  does not settle it. The charge is the nuclei's - each atom's atomic
  number in [Atoms], or the charge its pseudopotential leaves it where
  [Pseudo] gives one, as ORCA's orca_2mkl writes it - less the electrons
  its [MO] occupations hold; with no [Pseudo], unsaid where an atom past
  neon is there (its inner orbitals cannot be told from another's 1s), or,
  from lithium to neon, other than one occupied orbital below -2 hartree
  for each such atom (its 1s; two where alpha and beta are listed apart);
  unsaid past 8 either way,
  where the occupations come to no whole number, or where a restricted
  file has no orbital of 2. A centre named as one with no nucleus (X, Bq,
  Gh) adds none. The multiplicity is one more than
  the alpha occupations' excess over the beta's; with no Spin= said, a
  singlet or a doublet where every occupation is 0, 1 or 2 and at most one
  is 1, and unsaid otherwise (natural orbitals; two of 1, which a triplet
  and a singlet diradical share; Spin= given for some orbitals only). A
  file that breaks the format - an occupation that is not a number, [MO]
  given twice - gives neither, and never fails the read. It is tested alone
  (`scripts/calc/test_reader_pyscf_species.py`, in CI).
  Where an output
  holds the basis set and the orbitals' coefficients, cclib writes them as
  a Molden file (each p shell's functions put in x, y, z order, as ORCA's
  are not) for PySCF to read back, and the orbitals are checked
  orthonormal in their basis before any surface is promised - where they
  are not, it says to open a Molden file the program wrote. Its lists'
  rows promise each orbital's surface and the densities' (`orbital:<spin>:
  <index>`, `density:total`, `density:spin`); asked for, it works the grid
  out from the file sent again: 4 Å past the atoms, points 0.2 Å apart (at
  most 90 to a side), the basis functions' values a chunk of points at a
  time. Its tests (`scripts/calc/test_reader_pyscf.py`) run by hand in an
  environment made from its lock.
- Meno's own reading under the same contract (`MENO` in the catalog,
  `lib/calc/menoReads.ts`, the one list of what it reads so) is asked as a
  plugin's worker is - the same `Reader`: what it makes of a file, and a
  promise it gave - but runs in the app, in a web worker of its own
  (`lib/calc/builtin.ts`, `builtinWorker.ts`, which reads that list): always
  there, nothing downloaded. It reads every file Meno reads but its own
  workspace and record, which are Meno's core's (docs/FILE-IO.md, step 4):
  - MOL, SD, RXN, XYZ and PDB files (`lib/io/structures.ts`): what each holds -
    the drawing, laid out, a reaction's arrow and "+" signs, and the
    molecules in 3D with their frames and energies - as `structures` in its
    answer. The page checks it (`checkedStructures`) as it would a plugin's.
  - The cube (`lib/calc/cube.ts`), from the layout Gaussian's documentation
    gives: a cube's molecule, in ångströms, and its grids as a list, each a
    promise, shown as it comes (a list's `shown`, opened by `shownLists` as
    a file is opened).

  Its answers come back with their runs of numbers - frames, atoms'
  coordinates - in buffers handed over, not copied (`lib/calc/packed.ts`),
  as measured (docs/FILE-IO.md, *Response*). Where there is no worker - the
  tests - it answers in place, carried the same way. The worker has the
  label typefaces' ASCII tables only, not those the page reads from font
  files: an RXN file's reaction laid out round a label of other letters is
  spaced by a capital's box for them.
- Promises (stage 3d): a row's motion or surface may be `{ "ask": key }`.
  Chosen, it is asked for of the reader that gave it (`lib/calc/asks.ts`
  `askFor`), the output's text and kind sent again - each opened output is
  kept for the session by its SHA-256, which the molecule keeps, with its
  name and kind, as its `source` -
  and kept once given; a promise whose output is not open says to open it
  again. A workspace saves the shown row's promise given, as what it came
  to (`calcShowing`, from `carriedOf`), and the open list - its row and its
  surface's value - with the molecule (`Carried3D.list`).
- Surfaces (stage 3d): a grid (`lib/calc/results.ts` `Grid`) is an origin,
  three axes and counts in ångströms, and its values as little-endian
  32-bit floats in base 64; `signed`, drawn at the value and at its
  negative. `Surface3D`, in its molecule, asks the surfaces' worker
  (`utils/surfaces.ts`, `surfaceWorker.ts`) for the surface at the value:
  marching cubes over axes that may lean (`utils/isosurface.ts`, three.js's
  tables), each point's normal down the values' slope; the grid sent once,
  the value as often as it changes, one at a time, the last value asked
  for winning. Placed about the shown frame's centre, as the atoms are; in
  the 3D style's two colours (`surfacePlus`, `surfaceMinus`; at first a
  muted blue and orange), seen through, fading in and out. Both phases
  are one mesh, each point coloured by its phase, its triangles drawn in
  one go from the farthest to the nearest as seen (`utils/backToFront.ts`,
  a counting sort by depth), put in order again only as the molecule turns:
  drawn as two meshes, the positive one was laid over the other wherever
  they crossed on the screen, whichever was in front. The atoms are drawn
  before it and keep their depth, so one inside a lobe shows through it.
  A picture (`render3d`) draws the surface a carried molecule shows - its
  open list's chosen row's, given (`utils/surfaceMesh.ts` `shownSurface`) -
  the same way, worked out at once and kept (`surfaces.ts` `surfaceNow`),
  and keeps room for where it reaches (`pictureSurface`).
  The value is
  set by a slider under the list (from 0.0001 to 0.5, by its logarithm),
  kept in `lists3d` as `iso`.

On the 2D canvas (`Workspace/chem/`), `analyse` feeds the marks -
valence problems, R/S and E/Z - which `ChemMarks2D` lays over the drawing
as HTML, outside the drawing and so outside any export; they run only
while RDKit is set up (`pyEnvReady`), so drawing never starts a download.
`analyse` makes sense of each fragment on its own only where something is
wrong somewhere; otherwise of the whole at once, which comes out the same.
`clean` lays each fragment out afresh and then over the drawing - turned,
turned over, and its chains turned over their single bonds, whichever
lies closest - keeping the drawn wedges when they still say the same
stereochemistry and otherwise giving RDKit's; the editor applies it as one
undo step.

A drawn structure made in 3D (`Workspace/chem/make3d.ts`, stage 2 of
docs/WORKSPACE.md): `open_stereo` says what its drawing leaves open, which
Meno asks about first; `conformers` makes each stereoisomer asked for
(ETKDG, then MMFF94 or UFF, on every core - a metal's bonds embedded at
their covalent lengths and the metal typed for UFF, or, where UFF has no
type for it, a lighter metal of its group standing in, its energies given
as the model's and none as the molecule's; a ring bound through all its
atoms, written as a multi-centre bond by `chem/etaBound.ts`, held over its
metal; every conformer as made, in the order made, with every centre's CIP
label; of two enantiomers, the one whose SMILES comes first is made and the
other is its mirror image), and the page keeps each once, lowest first,
laid over the first, equivalent atoms in the first's places
(`chem/pageConformers`; WORKSPACE.md, *The page's conformers*). Both take
`like`, a molecule in 3D made before from the
drawing - where it has the block's atoms - so that what the drawing leaves
open is made as it was (*Make again*). The molecule in 3D that comes of it
keeps which drawing atom each of its atoms is and what the drawing was (`drawnFrom`, `drawnAs`;
`utils/drawnLink`), so that hover is shared and a changed drawing is seen.
`drawing_of` goes the other way: a molecule in 3D's heavy atoms in their
order, wedged as they are in 3D, its bonds' orders found where a file of
coordinates gave none - where it has its hydrogens, which the method
works from (docs/WORKSPACE.md, *Hydrogens and bond orders*) - for Meno's
engine to draw; it says whether it found them (`perceived`), which the
3D view takes too (`chem/bondOrders.ts`). `orders_from_smiles` and
`add_hydrogens` complete a ligand there: its orders from a SMILES, its
hydrogens added. These take as long as
they take (`CONFORMERS_MS`, fifteen minutes at most since 2026-10-20, the
molecule now saying how many conformers are sought; Stop, while a 3D
structure is being made, stops the worker and lets the question go at
once). What the worker lays out
in 2D (`from_smiles`, `drawing_of`) it lays out by Meno's rule for which of
RDKit's two depictors runs (`lay_out_2d` in the worker): CoordGen, except
for a structure with a ring of 34 atoms or more, or 25 rings or more, which
RDKit's own depictor lays out. The rule is by how long CoordGen takes:
measured on 2026-11-01 (RDKit 2026.03.6, Apple M4), its time grows unevenly
past some 25 rings or a ring of some 30 atoms - 9.0 s for a chain of 35
para-linked benzene rings, 18.9 s for a ring of 37 carbons - where RDKit's
own took 0.01 s at most; the bounds are those set on 2026-10-11. A SMILES
whose CoordGen layout does not read back as the SMILES - (E)-cyclooctene's,
its double bond drawn cis - is laid out by RDKit's own depictor instead.
Meno lays both drawings out again with its own engine; only their
stereochemistry and scale come from these coordinates.

The venv lives under the local app data dir at `uv/<profile>/venv`; a stamp
file (`uv/stamps/<profile>.json`) stores the lock-file hash so setup reruns only
when the lock or Python version changes. uv runs with its Python downloads
(`uv/python`) and cache (`uv/cache`) under the local app data dir too, only
uv-managed Pythons, and no user uv configuration (`uv_command` in `lib.rs`):
nothing of Meno's environments lands in the user's own directories.

### Where Meno keeps what

Meno's folders are named `Meno` in the system's folders for applications'
data, local data and caches (`folders.rs`; tauri.conf.json's
`appDirectoriesOverride`, so that Tauri's `app_*_dir`, the webview's
`BaseDirectory`, the file scopes and the job runner all find the same ones):

| | Mac | Windows | Linux |
| --- | --- | --- | --- |
| data: settings, the log, the window's place | `~/Library/Application Support/Meno` | `%APPDATA%\Meno` | `$XDG_DATA_HOME/Meno` |
| local data: environments, tools, jobs, plugins' downloads | the data folder | `%LOCALAPPDATA%\Meno\data` | the data folder |
| caches: PDFs' pages, ligand data | `~/Library/Caches/Meno` | the local data folder | `$XDG_CACHE_HOME/Meno` |

The local app data dir (`local_data_dir` in `lib.rs`, `BaseDirectory.AppLocalData`
in the webview) holds what is large and of this computer alone: uv's and pixi's
environments, caches and Pythons, the tools (`tools.rs`), jobs and what plugins
download. On Windows it is in the local application data folder, not the
roaming `%APPDATA%` one, which a domain may copy to a server and back at each
sign-in and keep within a quota; the settings and the network log stay in the
roaming one. It is a folder of its own in `%LOCALAPPDATA%\Meno`, where Meno is
installed for one user: the page may write in its local data folder (the file
scopes in `capabilities/main.json`), and never over Meno itself, its PDF
library or the plugins' scripts it runs. The installer writes only its own
files there, so an update leaves the folder as it is; the uninstaller takes
it away only when asked to delete Meno's data as well. On a Mac and on Linux
the data and local data folders are one.

**From before 0.1.14.** A Meno before 0.1.14 named its folders by its
identifier then, `com.kfchem.meno`. At a start, before anything uses them,
what is in those is moved into Meno's folders (`folders::move_old`), entry by
entry: renamed (the same volume), or copied and then taken away where it
cannot be renamed; never over a file already in Meno's folder - each entry is
renamed whole, so one there was moved already, and what is in the old folder
after the first move was written by an earlier Meno started since, whose
fresh settings must not replace the real ones (the old copy is dropped, and
the log says so; folders merge entry by entry, so an earlier Meno's new jobs
still come across); links moved as links. Cut short, it is done again from
where it stopped at the next start, and the old folder goes once it is
empty. What the move does goes in Meno's log. Not moved:

- the webview's data (`EBWebView`, Windows): caches, made again;
- the Python environments made (`uv/<name>/venv`, and pixi's `.pixi` and
  `activation.json`), which name the folder they were made in, and links in
  `uv/python` left pointing nowhere: each environment is set up again at its
  first use, from uv's and pixi's caches and Pythons, which move, so that
  little or nothing is downloaded - and nothing asked, as the settings with
  what was allowed move, and each plugin's record of being set up (its
  stamp) and its downloaded files stay;
- while a job of the old folder waits or runs: the environments, tools and
  jobs, as its program may be using them; they move at a start after it has
  ended (where meanwhile uv's or pixi's was made again in the new folder,
  that one is kept and the old one taken away);
- on a Mac and on Linux, of the old caches folder only Meno's own (`pdf`,
  `ccd`): the rest is the system's.

A Meno before 0.1.13 kept all of it in the roaming folder on Windows; nothing
of that is moved - plugins are set up again as they are next used - and what
was left there is taken away (`roaming.rs`), by name only: `uv`, `pixi` and
`tools` at each start while they are there, and a plugin's environment there
as the plugin is removed; `jobs` only where it holds no job. While a job there
still waits or runs, everything there is left, as its program may be using its
environment; jobs kept there are left with their files - said in Meno's log
at the start the rest is moved, or something is taken away, not again at every
start. The rest of that folder - the settings, the log, the window's place -
moves as above, and the folder goes once it is empty. What is left, and why,
goes in Meno's log.

### PDFs

A PDF on the page (docs/PDF.md) is read and drawn by PDFium, in a process of
its own (`src-tauri/src/pdf.rs`, `lib/pdf`).

- **Held by its SHA-256.** A PDF opened or dropped is written once to Meno's
  cache, `<app cache>/pdf/<sha256>.pdf` (`pdf_hold_path`, `pdf_hold_bytes`),
  and is known by that hash from then on: the document's `PdfItem` names
  it, a workspace's file keeps its bytes (`pdf_bytes`, `utils/workspace`),
  and a workspace's file opened writes them to the cache again
  (`holdPdfsOf`).
- **The reader** is Meno's own executable started as `Meno --pdf <cache>`,
  as a job's runner is (`run()` hands it to `pdf::pdf_mode` first). It binds
  PDFium's library - inside the app on a Mac, beside the program among the
  resources elsewhere (`scripts/fetch-pdfium.mjs` fetches it for the build)
  - opens a PDF from the cache when first asked about it, and answers a
  line of JSON at a time on its standard output: a frame of JSON, then
  bytes. Meno starts it when a PDF is first wanted and again if it has
  gone, so that a PDF that stops the reader stops that process alone.
- **Parts of pages drawn** (`pdf_render`) come back as PNGs - a page is
  mostly white, so a 512-pixel tile is a quarter of its pixels or less, and
  carrying bytes is what takes the time - and are taken apart off the main
  thread (`createImageBitmap`) as WebGL textures. `lib/pdf/reader` queues
  them, three at a time, nearest the middle of the view first, and drops
  those the view has moved on from.
- **On the page** (`components/Pdfs2D.tsx`, `lib/pdf/layout`): each PDF a
  stack at the size it is printed - a 14.4-point bond is a bond - or its
  pages spread, in rows or each in a place of its own kept from the PDF's
  (`placed`); a small picture of each page shown at once, tiles at the
  screen's resolution asked for once the view is still, each fading in.
  The pictures are the canvas's, shared by the stacks and the column
  (`components/pdfPictures.tsx`): a tile drawn for one is drawn for both.
- **In the column** (`components/PdfColumn.tsx`, `lib/pdf/column`): the
  column of texts lies over the canvas's right side (`TextColumn.tsx`, which
  says how much it covers: `cover`), and a PDF read there is drawn by the
  canvas under its header. While one is, the canvas is drawn in three goes:
  the page; the column's part, its own scene and camera, cut off where the
  column is (a scissor); and a page on its way between them. Where the
  column is read lives in its reader (`components/pdfColumnReader.ts`), one
  a canvas, which the column's HTML moves - the wheel, a pinch, the keys, a
  link - and the canvas eases and draws; it is kept with the PDF
  (`reading`) once it rests, by amending the document rather than editing
  it, so that it is no step to undo.
- **A text in the column** (`components/ColumnText.tsx`): drawn in the
  column's pass as a PDF's pages are, on a white sheet of its own, from the
  text's editor (`TextEditor/editor.ts`: its lines, what is selected, how
  far it is scrolled, what the IME composes), which its HTML half
  (`TextEditor/TextBody.tsx`) shares, kept for each workspace by the text's
  id (`TextEditor/columnText.ts`). Each line is a picture drawn by the
  system's type (`TextEditor/linePictures.ts`), only those in view,
  coloured by what the text is (`lib/text/colouring.ts`: Lezer's grammars
  for Python, JSON and XML; a plugin's grammar, made into a parser as it
  is first wanted, `lib/text/grammars.ts`, for a calculation's input or
  output), what does not read as its grammar says underlined. Typing
  goes through a field kept out of sight (`TextEditor/typingField.ts`): an
  EditContext on Windows, a textarea elsewhere; what it holds and how a
  change in it is read is `lib/text/field.ts`, an editor's keys
  `lib/text/keys.ts`, moving and selecting `lib/text/editing.ts`.
- **A Markdown text read formatted** (`components/MarkdownText.tsx`, docs/
  PDF.md, *Markdown*): read into blocks by `lib/text/markdown.ts` (Lezer's
  Markdown parser with GitHub's extensions), laid out in rows at the
  column's width by `TextEditor/markdownLayout.ts` - its words measured by
  the canvas in IBM Plex (`TextEditor/markdownType.ts`), its code coloured
  as a text is (`TextEditor/markdownCode.ts`) - and each row in view drawn
  as a picture (`TextEditor/markdownPictures.ts`). Its HTML half
  (`TextEditor/MarkdownBody.tsx`) and the canvas share its reader
  (`TextEditor/markdownReader.ts`: where it is read, what is selected).
  *Source* in the column's header shows it written, as any text
  (`TextEditor/columnText.ts`, `showsSource`). Its sheet on the page, and
  its way between the sheet and the column, draw the same layout in
  troika's type (`components/MarkdownRows.tsx`).
- **Texts' sheets on the page** (`components/TextSheets2D.tsx`,
  `utils/textSheets.ts`): a text with a place (`WorkspaceText.at`) lies on
  the page, its first lines in troika's signed-distance type (IBM Plex Mono,
  bundled). Selected with the rest (`selTexts`), moved with a dragged
  selection (`MarkPlaces.texts`); whether it is read in the column is the
  text's (`reading`), amended as a PDF's is. Read or closed, its lines go
  between its sheet - or an output's molecule - and the column
  (`textFlight`, drawn in the column's last pass by
  `components/TextFlight.tsx`, set at either end as `textFlightSetting.ts`
  says), handing over to the column's own lines once settled.
- **Words** (`pdf_text`, `lib/pdf/text`): each page's letters, read by
  PDFium when first wanted, each with its box in points from the page's
  top left. The place nearest the pointer, words, lines, the marks of a
  selection, the words to copy and a search are all worked out from them
  in the window. A selection (`pdfSel`) and a search (`pdfFind`,
  `components/pdfFind.ts`) are the view's, marked on the pages by
  `components/pdfMarks.ts`. Words carried out of a PDF
  (`components/wordsDrag.ts`) become words on the page that keep where
  they came from (`Caption.from`), set as wide and lying as their lines
  did (`blockOf`). As they are carried (`pdfWords`), the column's last
  pass draws them (`components/WordsFlight.tsx`): each word a text of its
  own, from the box it had on the page (`wordBoxesBetween`) to its place
  in the words as they will be set (`captionWords`).
- **Links** (`pdf_links`): each page's, read by PDFium when first wanted -
  where each lies, in points from the page's top left as it is drawn
  (`FPDF_PageToDevice`), and where it goes: a page and how far down it, or
  a web page's address.
- **Figures** (`pdf_objects`, `lib/pdf/figures`): what each page is made
  of - its words, paths, pictures, shadings and forms - each with its box,
  read by PDFium when the page's words are first wanted; the figures are
  worked out from them in the window (`figuresOf`) and kept a page at a
  time. A box on a page (`pdfBox`, the view's, as `pdfSel` is) is marked
  by `components/pdfMarks.ts`. Carried out (`components/boxDrag.ts`), it
  is drawn again by PDFium at the copy resolution (`boxPicture`) and
  becomes a picture that keeps where it came from (`PictureItem.from`); as
  it is carried (`pdfPicture`), the column's last pass draws it
  (`components/PictureFlight.tsx`), its shadow worked out in a shader.
- **Figures read as structures** (`pdf_figure`, `lib/figure`; docs/PDF.md,
  *Stage 5*): what a figure within a box is drawn with - its paths' steps,
  filled or stroked and how thick, and its letters with where their lines
  start and their sizes, read through forms under their matrices - read in
  the window as bonds and labels (`lib/figure/read.ts`) - letters drawn as
  outlines matched against the system's own letters, drawn once on a
  canvas (`lib/figure/glyphs.ts`, `utils/glyphShapes.ts`) - then as a
  structure in Meno's units (`lib/figure/structure.ts`), its labels read
  as typed ones are (`utils/figures.ts` `figureLabels`). Each atom keeps
  where it was drawn (`Atom.seen`), and what was unsure of a part keeps
  what the part was then (`unsure.as`), so that its mark goes once it is
  changed (`readMarks`, drawn by `ChemMarks2D`). The place an atom under
  the pointer was read from is ringed on the PDF's pages and on pictures
  cut out of it (`components/figureTie.ts`), and an atom whose place is
  under the pointer there is lit in the drawing (`figureLit`, drawn by
  `LinkedHover2D`).
- **Pictures read as structures** (docs/PDF.md, *A picture read*): a
  figure that is a picture, drawn by PDFium (`boxPicture`), or a picture
  on the page, sent to the plugin that fills the role *Structures read
  from pictures* (`read_picture`, `lib/roles/client.ts`), and its answer
  read as a figure read is (`lib/figure/picture.ts`) - the same structure,
  marks and tie, the tie in the picture's own pixels where it came from
  no PDF (`FigureSpot` without a page). The plugin's trained model is
  fetched by Meno as the plugin is set up (`plugfiles.rs`, its manifest's
  `downloads`), into its environment's folder, which its worker is given.

### Pictures

A picture on the page (docs/PDF.md, *A picture*, step 4a) is an image the
window decodes; nothing of it goes through Rust but the clipboard.

- **Held by its SHA-256** for the session (`lib/picture/held`): its bytes,
  what the document's `PictureItem` names, what a workspace's file keeps,
  and what a copy carries. `lib/picture/image` reads what it is, its size
  in pixels and its resolution from its headers, and the size it would be
  printed at; `utils/pictures` decodes it as the window shows it
  (`createImageBitmap`), and makes a PNG of a JPEG or of a Windows bitmap
  read off the clipboard (`lib/binary/dib` `rgbaOfDib`).
- **Drawn** by `components/Pictures2D.tsx`: a texture each, shared by
  SHA-256 and let go once nothing draws it (`components/pictureTextures`),
  on a plane turned and scaled as the picture is; under the drawing and
  over the PDFs, each one put there later a step over the one before in
  depth. Its frame and corner handles, and its hold's light
  (`components/HeldLight.tsx`, shared with the PDFs), are drawn in its own
  turned frame.
- **A film** (docs/RENDER.md) is a picture whose media is `video/mp4`, held
  as its bytes are (`lib/picture/held` `holdFilm`): drawn from a video
  element playing it, over and over and muted, its texture a
  `VideoTexture`, a frame of the canvas drawn for each of the film's
  (`requestVideoFrameCallback`) - none while it is paused.

### Renders

A render (docs/RENDER.md) is the molecules in 3D asked for, written as a
glTF 2.0 scene (`lib/scene/gltf.ts`, its shapes `lib/scene/shapes.ts`;
built from the canvas's own geometry by
`ui/features/Workspace/render/renderScene.ts`), given to the plugin that
fills the role *Render* and run as a job (`render/renders.ts`: prepared by
the plugin, the scene put into the job's folder, looked at each second,
its `progress` lines read, and what it made read from the job's folder and
put on the page with `putPicture`). The card asking for one is
`render/RenderCard.tsx` (Meno's own choices in `render/renderOptions.ts`),
the frames standing where renders will put what they make
`render/Renders2D.tsx`, and Save picture or film `render/savePicture.ts`.
Renders are kept for each workspace's store, not in its document, so its
tab closing stops them (`App.tsx`'s `closeTab`, through `letGoOf`:
`stopRenders` on the store `madeStoreOf` finds) - their jobs stopped, the
wait between looks cut short, nothing put on the page; the last tab's
closing quits Meno once they have been asked to stop.
- **Selected** with the rest (`selPictures`): a box or a lasso takes those
  whose middle it holds (`molecules3dIn`), a dragged selection carries
  them (`utils/dragSelection`, `MarkPlaces.pictures`), and the selection's
  handle turns them about its middle with it (`Selection2D`).

### Tauri commands

| Command | Called from | Purpose |
| --- | --- | --- |
| `log_page` | `lib/log.ts` | A line of the page's errors or warnings into Meno's log (`logfile.rs`), cut at 4000 bytes. |
| `py_env_python_path_uv` | `lib/pyEnv.ts` | Resolve the venv's Python path under app data. |
| `py_env_setup_uv` | `lib/pyEnv.ts` | Create the venv and install the lock file with `uv`. |
| `py_env_setup_pixi` | `lib/pyEnv.ts` | Make a plugin's environment with pixi from its `pixi.toml` and `pixi.lock` - pixi itself first, where it is not here - and keep what activation sets (`pixienv.rs`). |
| `py_env_remove` | `lib/pyEnv.ts` | A plugin's environment and its record of being set up taken away as it is removed in Settings, *Plugins* - and, with the last pixi made, pixi's cache and home. |
| `plugin_files` | `lib/pyEnv.ts` | A plugin's files besides its environment (its manifest's `downloads`): where they stand, and - asked to - fetched under its setting-up purpose, checked by their SHA-256, kept in `files` beside its environment (`plugfiles.rs`; `plugin-files:progress` as they come). |
| `ext_spawn_sidecar` | `lib/plugins/process.ts` | Spawn a process with piped stdio; returns an id. |
| `ext_stdin` | `lib/plugins/process.ts` | Write to a sidecar's stdin. |
| `ext_kill` | `lib/plugins/process.ts` | Kill a sidecar and emit `ext:exit`. |
| `pdf_hold_path`, `pdf_hold_bytes` | `lib/pdf/reader.ts` | A PDF held in Meno's cache by its SHA-256; its pages' sizes (`pdf.rs`). |
| `pdf_bytes` | `utils/workspace.ts` | A PDF held, as its bytes, for a workspace's file. |
| `pdf_render` | `lib/pdf/reader.ts` | A part of a page drawn by PDFium, as a PNG. |
| `pdf_links` | `lib/pdf/reader.ts` | A page's links: where each lies, and where it goes. |
| `pdf_text` | `lib/pdf/text.ts` | A page's letters, each with its box. |
| `pdf_objects` | `lib/pdf/figures.ts` | What a page is made of - words, paths, pictures, shadings, forms - each with its box. |
| `pdf_figure` | `ui/features/Workspace/utils/figures.ts` | What a figure within a box is drawn with: its paths' steps, its letters, its pictures' boxes. |
| `write_document` | `lib/io/writeDocument.ts` | A document the chemist chose where to put - saved, exported, a picture, a PDF - written whole or not at all: beside it first, then put in its place, the file there left as it was where anything fails, and what it had besides its bytes kept; with `keep-old`, the file there kept beside it first as `<name>.bak`; only where the fs plugin's scope lets the page write (`savefile.rs`; docs/FILE-IO.md, *Save and Export*). |
| `write_app_file` | `lib/io/writeDocument.ts` | One of Meno's own files - its settings, its environments' notes - written whole or not at all, as a document is; only a path inside Meno's data folder or its local one (`savefile.rs`). |
| `font_families` | `ui/fonts/typefaces.ts` | Every typeface installed (fontdb), for the label typeface picker. |
| `font_file` | `ui/fonts/typefaces.ts` | One family's regular face as a font file of its own - out of its collection, its character map made plain (`fonts.rs`). |
| `clipboard_write`, `clipboard_read`, `clipboard_takes` | `lib/clipboard.ts` | The system clipboard, for structures: what a copy puts on it, in place of what was there; the first of the kinds asked for that it holds; the kinds a copy may put on it on this platform (`clipboard.rs`). |
| `clipboard_file_names`, `clipboard_file` | `lib/clipboard.ts` | The files copied in the Finder or Explorer: their names, in order, and one's bytes by its place - the page names no path. |
| `drag_read` | `lib/clipboard.ts` | The first of the kinds asked for in what was just dropped - a picture or an object dragged out of Word or PowerPoint - read as the clipboard is: on a Mac the drag pasteboard, on Windows what Meno's window over the page read (`drop.rs`). |
| `drop_catch`, `drop_release`, `drop_takes` | `lib/drop.ts` | Windows: a drag from another program, not of files, over a part of the page that takes such drags, taken from the webview by a window of Meno's laid over it (`native-drag` tells the page where it is); that window taken away once the page can read the drag; whether the page takes it where it now is. `drop_catch` says whether this platform does so - a Mac's page reads drags as they are. |
| `ole_started_for_office`, `ole_in_use` | `lib/ole.ts` | Windows: whether Windows started this Meno for Office, and whether Office still holds any of its structures (`ole.rs`); elsewhere, no. |
| `ole_take_pending`, `ole_update`, `ole_close` | `lib/ole.ts` | Windows: the structures Office has asked to have opened since the page last looked; one drawn afresh, given back to its document; one done with, its tab closed. |
| `net_state` | `lib/net/network.ts` | Offline or not, what is allowed, tasks under way, recent connections. |
| `net_set_offline`, `net_grant`, `net_revoke` | `lib/net/network.ts` | Offline mode; a purpose's leave to use the network, given or withdrawn. |
| `net_note_blocked` | `lib/net/network.ts` | Records a connection the window was kept from making. |
| `ccd_components` | `lib/net/components.ts` | Chemical components by id: those kept, and - asked to - the rest fetched from the wwPDB under the purpose `ccd` and kept, else listed as missing (`ccd.rs`). |
| `present_window` | `ui/presenting.ts` | The window made to cover its screen for a talk, or back; whether that changed it (`present.rs`). |
| `opened_files` | `lib/openedFiles.ts` | The workspace files opened from outside Meno that the page has not taken yet, taken (`opened.rs`; `opened-files` as one comes). |
| `update_state`, `update_check`, `update_restart_after_quit` | `lib/update.ts` | Where keeping Meno up to date is; a look (and download) through the proxy; a restart into the update downloaded. |
| `job_start` | `lib/jobs.ts` | A job's folder made, its input written, its runner started; returns its id. |
| `program_where` | `lib/plugins/installed.ts` | Where a plugin's program installed separately is, as a job would take it - where the chemist located it (that alone, `exact`, for one just picked), where the system finds programs, or where it is usually installed - with its version and, where it is too old for Meno, why; none, where it is found nowhere. |
| `job_state`, `jobs_list` | `lib/jobs.ts` | A job's record, or every job's - *gone* where its runner went without saying how it ended. |
| `job_log`, `job_files`, `job_read`, `job_folder` | `lib/jobs.ts` | A job's log from a byte on; the files in its folder, one read; where they are. |
| `job_stop`, `job_remove`, `jobs_clear_finished` | `lib/jobs.ts` | A job asked to stop; a finished job's folder taken away, or every finished one's. |
| `job_trim`, `jobs_finished_bytes` | `lib/jobs.ts` | What a finished job made taken out of its folder, its log and input kept; the bytes every finished job's folder holds. |

Events: `uv:log`, `uv:err` (plain strings); `ext:stdout`, `ext:stderr`,
`ext:exit` (JSON strings `{ id, line? }`). `ext:exit` is emitted exactly once
per sidecar, whether it exits by itself or through `ext_kill`. `net:task` and
`net:connection` carry the network's record (see below); `update:state`, where
keeping Meno up to date is; `plugin-files:progress` (`{ plugin, done, total }`,
in bytes), how far a plugin's files have come as they download; `opened-files`
(no payload), that a workspace file was opened from outside Meno - the page
takes it with `opened_files`. On Windows only: `native-drag` (`{ phase, x, y }`,
to the main window: `enter`, `over`, `leave`, `drop` or `gone`, and where the
drag is, in the page's coordinates); `ole-open` and `ole-close` (a structure's
id), as Office opens one of Meno's structures or closes it; `ole-idle` (no
payload), once Office has let go of the last of them in a Meno it started.

The tools that make the environments - uv, and pixi for those that need
conda-forge - are not bundled (docs/WORKSPACE.md, stage 3d): `tools.rs`
pins each one's version and its archive's SHA-256 for every computer Meno is
built for, and fetches it the first time an environment needs it - through
that environment's network task, under its consent - checks the archive
against the hash, and keeps the program in `<data>/tools/<tool>/<version>/`,
taking away a version no longer pinned. uv comes from Astral's host
(releases.astral.sh), as the Pythons it installs do; pixi from its releases
on GitHub. A new pin is a change to `tools.rs`, its hashes the release's
own, checked against the archives (`cargo test -- --ignored` fetches and
runs both for the computer it runs on).

An environment pixi makes (`pixienv.rs`, `py_env_setup_pixi`) comes from the
manifest and the lock in a plugin's folder, `resources/plugins/<id>/pixi.toml`
and `pixi.lock` - every package for every platform pinned by its SHA-256 -
copied into `<data>/pixi/plugin-<id>/`, where `pixi install --frozen` makes it
(`.pixi/envs/default`). pixi keeps its cache and home under `<data>/pixi/`
and reads no configuration of the user's (`PIXI_NO_CONFIG`). A conda
environment expects to be activated - on Windows its libraries are found
only on the PATH activation sets - so what activation sets is asked of
pixi once, as the environment is made (`shell-hook --json`, a mark put
before the PATH), and kept beside it (`activation.json`): a worker
started in it (`ext_spawn_sidecar`, which takes an interpreter of
`<data>/uv` or `<data>/pixi`) is given the variables, and the folders before
its PATH. The consent says what the lock downloads on the computer - its
packages, and their size (`lib/pixiLock.ts`) - and from where: pixi, the
first time, from GitHub; conda-forge (conda.anaconda.org); PyPI.

Every consent to set a plugin up names every host the set-up contacts
(`lib/plugins/setUpSources.ts`): the tool's own (releases.astral.sh for uv
and the Pythons it installs; github.com for pixi), the index or channel
its lock takes packages from, each package its lock fixes to a URL of its
own, and each file besides that it downloads. Each host is named with
where it hands a fetch on: a repository's archive on github.com goes on to
codeload.github.com, a release's file to
release-assets.githubusercontent.com, and a file on huggingface.co to
Hugging Face's content delivery network (hosts under hf.co). A test reads
every plugin's lock and downloads and checks that the consent names each
host they fetch from. Each line is made together with the hosts it names
(`SetUpReach`), and those go with the set-up (`py_env_setup_uv`,
`py_env_setup_pixi`) and with the fetch of its files (`plugin_files`): the
proxy lets each reach those alone (net.rs). Another test reads the hosts
back from every consent's words and checks they are the ones its task is
kept to, both ways. The proxy carries a connection both ways until both have
ended, and ends it where nothing came either way for two minutes (`carry`):
a download's client says nothing for minutes while the file comes to it,
and until 0.1.18 that way alone was ended after two minutes of its own
silence, the host told the client was done - every download longer than
that cut short. The record says how each connection ended ("the server
closed it", "the connection to the client broke", "nothing came either way
for 120 s"), and a task that failed, why. A reader
plugin says it is made so by `environment: "pixi"` in its manifest; its record of being set up is
`pixi/stamps/<profile>.json`, and taking it away removes `pixi/<profile>` -
and, with the last environment pixi made, its cache and home, which nothing
else uses (pixi itself stays, in `tools/`).

### What the backend accepts

The webview is not trusted with process execution, so `lib.rs` validates every
path it is given:

- `py_env_*`: the webview names no tool - uv is the one `tools.rs` pins;
  `lockPath` must be a plugin's own lock in its folder,
  `resources/plugins/<id>/`: uv's `requirements.lock`, made in exactly
  `<local app data>/uv/plugin-<id>/venv` (`venvHome`), or pixi's `pixi.lock`, made in
  `<local app data>/pixi/plugin-<id>` - Meno has no Python environment of its own
  (2026-10-13: the console's and the workflows' locks are gone); relative paths may not contain `..`, `.` or absolute/drive
  prefixes; `pythonVersion` must look like `3.12` or `3.12.4`; `purpose` must
  be `python-env:<name>` - never a purpose that needs no asking.
- Every Python Meno starts - a sidecar, or a job's program - reads and writes UTF-8
  (`python_in_utf8`: `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`), whatever the
  system's code page, so that a request naming a file in Japanese reaches a worker
  whole, and comes back so, on a Windows in any language. What a sidecar or a setup says is read a line at a time,
  a line not UTF-8 read as near as it can be (`each_line`) - never taken for its end.
- `ext_spawn_sidecar`: `entry` must be an absolute `python`/`python3`/`python.exe`
  inside `<local app data>/uv/` or `<local app data>/pixi/`; `args` may start with `-u` / `-B`, followed by an
  absolute `.py` script that is a plugin's `worker.py` in `resources/plugins/<id>/`, in that
  plugin's own environment (`SIDECAR_SCRIPTS`); later arguments go to the script unchanged.
- A worker is pointed at the proxy with no task, so what it reaches for is
  refused and on the record. Every purpose waits on the user's yes: the
  Python Console, whose worker ran the user's own code as a `python-code`
  task that needed no asking, was removed from the UI on 2026-10-10, and its
  worker and that purpose on 2026-10-13.
- `job_start`: the webview names a plugin and a program, not a path. The
  program must be one the plugin's manifest names (`steps[].programs`),
  never a shell or an interpreter that takes code in its arguments, found
  in that plugin's environment - the folders its activation puts on the
  PATH (pixi), or its venv's `bin`/`Scripts` (uv) - or, one installed
  separately that its manifest declares (`installed`: ORCA, Gaussian),
  where `installed_program` finds it, or Meno's own copy of a program the
  plugin fetched (`downloads[].provides`: Blender; PLUGINS.md, *A program
  Meno fetches*); and, where it is Python, with the rules of
  `ext_spawn_sidecar`, a script in the plugin's folder. Its input files must lie inside its folder. A program
  installed separately, and each program beside it, is given as arguments
  only the files written for its job (or one by its name without its
  extension, as orca_2mkl takes `input`), options (`-nt`) and numbers
  (`names_only_written`). It is given its
  environment's activation, and is pointed at the proxy with no task, as
  a worker is. A job's id must be one of Meno's (a UUID) whose folder holds
  a `job.json`; a file read from it must lie inside it, reached by no
  link, and be no larger than 256 MB (one larger fails its step, saying
  its size); the file its program reads as its input (Gaussian's) is
  opened by the same rules. Its files are listed without following links,
  32 folders deep, and no more than 10,000 files and folders are looked
  at. The runner (`Meno --job <folder>`) checks it all again before it
  runs anything, whoever started it: its folder must be
  `<local app data>/jobs/<id>`, links resolved (`runner_folder`, which runs the
  job in the folder it checked), and what it is to run - the program, the programs after it, their arguments against
  the files in its work folder, their environment - what `job_start`
  would give (`spec_allowed`). Otherwise it writes a Failed record into
  the folder, saying why, and runs nothing.
- A known boundary: the text of a job's input files is not checked on the
  Rust side. What a plugin writes into a program's input is checked by
  the plugin's worker (PLUGINS.md: a text option names no program and no
  file), and `job_start` writes the files as the page gives them. A page
  that ran script of its own could give ORCA an input that names another
  program (`%method ProgExt`). The webview's content security policy runs
  no script but Meno's own; the input texts are not checked again in Rust.
- A lock with hashes (`--hash=`) is installed with `--require-hashes`.
- Sidecars are reaped when their stdout closes or on `ext_kill`, and all of
  them are killed when the app exits.
- A sidecar's stdin is written to with its own lock, the table of
  sidecars let go first (`write_stdin`), and off the commands' threads.
  A worker that stops reading holds up only what is written to it until
  it is killed, which fails the write; every other sidecar is written
  to, started and stopped meanwhile (2026-10-13: the table was held
  through the write, and one stuck worker, sent a file bigger than its
  pipe holds, held up every plugin's).

Adding a new worker or interpreter flag means extending these rules
(`PYTHON_FLAGS`, `SIDECAR_SCRIPTS`) together with the unit tests in
`lib.rs`.

Files the chemist's own: the webview's file scope (`capabilities/main.json`)
reaches only the app's data (roaming and local) and resources. A file is written elsewhere only
where the system's save dialog was answered - Save, Save As, Export - since
the dialog plugin adds the path it gives back to the file scope, for that
path alone and for the session; nothing else outside the app's own folders
can be written.

## The network

Every connection Meno makes is seen, recorded and answerable for. It is a
research tool: what it sends out, and when, has to be knowable, and it has
to be able to work with nothing going out at all.

- **The window reaches nothing.** Its content security policy
  (`tauri.conf.json`) keeps it to the app: fonts, workers and pictures come
  from the app or from blobs it made. Anything it is kept from reaching is
  put on the record (`securitypolicyviolation`). A letter no typeface of
  Meno's has - an emoji - is drawn on the canvas as a white square, and
  measured as one (`lib/chem/labelFonts` `STAND_IN`), so that the canvas's
  text renderer never looks for it on the network, which the window does
  not reach.
- **Everything else goes through the app's proxy** (`src-tauri/src/net.rs`),
  on the loopback address. A child process that may use the network - uv
  or pixi setting up a plugin's environment - is begun as a *task* with a
  *purpose* (`python-env:plugin-<id>`) and pointed at the proxy with the
  task's token in its proxy credentials. The proxy carries a connection
  only for a task under way, only for a purpose the user has allowed
  (every one is asked for), only to a host the task's consent named, only
  over HTTPS, and never in offline mode. Each task is begun with the hosts
  its consent named (`ConsentRequest.hosts`, made with the consent's lines
  from one list and sent with what begins the task), each exact or with a
  leading dot for any host under one (`.hf.co`), at HTTPS's port, 443,
  unless one is named with another (`host:port`); a task that names none
  is not begun, and a connection elsewhere is refused (403) and on the
  record as blocked, "not a host its consent named" or "not a port its
  consent named". Each connection - host, bytes each way, times, outcome -
  goes to the window as it happens (`net:connection`, every half second
  while open) and to `network-log.jsonl` in the app's data folder when it
  ends; like Meno's log, it is kept under 5 MB, begun again past that with
  the one before kept as `network-log.jsonl.1`, one only. A child that may
  not use the network - a plugin's worker, a job - is pointed at the proxy
  with no task, so whatever it reaches for is
  refused and on the record. What Meno fetches itself is a task too, under
  the purpose of what asked for it: uv and pixi the first time an
  environment needs one (`tools.rs`), a plugin's downloads as it is set up
  - a model's weights, Blender (`plugfiles.rs`, under the plugin's
  setting-up purpose, each checked by its SHA-256 and size and kept in
  `files` beside its environment) - and a chemical component looked up
  (`ccd.rs`).
  What comes back is read up to a bound: a tool's archive 256 MiB, a
  chemical component's file 4 MiB (`tools.rs` `body_within`); a plugin's
  downloads, the `bytes` its manifest gives.
  The proxy is bound, and offline mode and the purposes allowed are read
  from the saved settings, as the app starts: before the window has loaded,
  nothing can be started that would go out on its own.
- **The proxy holds what honours proxy variables** - uv, pip, Python's
  `urllib`, `requests`; what opens a socket of its own, or ignores those
  variables, is not held by it. The Python Console, which ran the user's
  own code without a sandbox, was removed from the UI on 2026-10-10.
- **The window asks and shows** (`lib/net/network.ts`, `ui/network/`): a
  purpose's first use of the network waits on the user's yes
  (`askToConnect`, remembered in the settings until withdrawn); each task
  has a card in the corner while it runs; the top bar switches offline mode;
  Settings › Network holds the allowed purposes and the record. While a
  talk is given in the window (docs/PRESENTING.md), the cards and the
  question wait until it ends; the record is kept as ever.

- **Meno keeping itself up to date** (`src-tauri/src/update.rs`,
  `lib/update.ts`) is such a task, of its own: its requests - latest.json
  on the project's GitHub Releases, then the update itself - are the
  app's own (tauri-plugin-updater), sent through the proxy with the task's
  token (`TaskHandle::proxy_url`). Its purpose, `app-update`, is asked for
  once of Meno's own accord (remembered as `updates.asked` in the settings)
  and after that only when the user turns it on in Settings › Network. That
  once is after the user's first action - a workspace's first edit, a file
  opened, Settings opened (`lib/firstAction.ts`) - once it has ended (the
  pointer let go, no guide open), never on a timer: with no action, it is
  not asked. Each look shows its notice in the corner as every task does,
  unless the user turned that off (`updates.notice`, Settings › Network) -
  the one notice of the network that can be; the record keeps it either
  way. The
  update is checked against the updater's public key (`tauri.conf.json`)
  before it is installed, which is as Meno quits; a development build, and
  a Meno Windows started for Office, neither look nor install. On Windows
  it waits while jobs wait or run (`held`, `INSTALL_STOPS_JOBS`): the
  installer ends every process of Meno's executable, the jobs' runners
  among them, so it is installed neither as Meno quits nor by *Restart
  now* until none do (docs/WORKFLOWS.md, *When Meno closes*). On Windows
  the installer is left in a folder of the temporary directory
  (`Meno-<version>-updater-…`), which Meno takes away as it starts once it
  is some minutes old (`tidy_after_updates`). Releases:
  `docs/RELEASING.md`.

- **Chemical components** (`src-tauri/src/ccd.rs`, `lib/net/components.ts`; read by `lib/chem/ccd.ts`):
  a PDB entry's residues looked up in the wwPDB's Chemical Component
  Dictionary, asked for from its menu (docs/WORKSPACE.md, *Hydrogens and
  bond orders*). Each component's file is fetched from files.wwpdb.org
  by the app itself (reqwest, through the proxy with the task's token),
  under the purpose `ccd`, and kept in the app's cache (`ccd/<id>.cif`),
  so that each is fetched once; the window asks for those kept first, and
  for the network only when some are not.

Anything new that needs the network begins a task in `net.rs` and routes
its process, or its own requests, through the proxy; nothing may reach the
network another way.

## File format support

Every way into Meno and out of it - files, the clipboard, Office - and
who reads and writes each kind: [`FILE-IO.md`](./FILE-IO.md); what plugins
do beyond files, and which are kept running: [`PLUGINS.md`](./PLUGINS.md).

The kinds, as the table of kinds has them (`lib/io/kinds.ts`, `MENO_KINDS`),
with the kinds Meno writes (`lib/io/writers.ts`, `WRITERS`) and every kind
the plugins Meno carries know - those they read, write, or only colour as
text (their manifests' `kinds`, `src-tauri/resources/plugins/*/manifest.json`).
A plugin's kinds are registered only while it is added. `src/lib/io/architecture.test.ts` checks
that every kind of these is in this table, by its id, and no other.

| Kind | Id | Files | Told by | Read by | Written by | Becomes |
| --- | --- | --- | --- | --- | --- | --- |
| Meno workspace | `meno-workspace` | `.meno` | a zip whose first entry is its mimetype (`isMenoFile`) | Meno's core (`readMenoFile`, `readWorkspace`) | Save, Save As (`menoFileWorker.ts`) | the workspace, outputs it keeps held for the session |
| Meno structure | `meno-record` | none: the clipboard, a picture, an Office object | its JSON's `format` | Meno's core (`readRecord`) | Copy, Office | pasted |
| RXN file | `rxn` | `.rxn` | `$RXN` | Meno, in its worker (`readStructures`) | Export (`reactionFileText`), Copy | a drawing with its arrow and "+" signs |
| MOL file | `mol` | `.mol` | `V2000` / `V3000`, `M  END` | Meno, in its worker | Export, Copy (`molWriter.ts`) | a drawing; a molecule in 3D where it says it is 3D or spreads in depth |
| SD file | `sdf` | `.sdf` | the same, and its name | Meno, in its worker | Export: the drawing as one record, each molecule in 3D as one, or each frame | a drawing, and each 3D record a molecule in 3D beside it |
| XYZ file | `xyz` | `.xyz` | its layout: an atom count, a comment, atoms | Meno, in its worker | never | a molecule in 3D, its frames and their energies (`utils/xyzEnergies.ts`); bonds from covalent radii (`bondsByDistance`: a fifth over, or 0.15 Å, the more; none within 0.1 Å), frame by frame - forming and breaking as the frames go (`frameBondsOf`) |
| PDB file | `pdb` | `.pdb` | its records (`RECORD_NAMES`), an atom's coordinates in their columns | Meno, in its worker (`lib/chem/pdb.ts`) | Export: molecules in 3D as HETATM and CONECT records, a MODEL for each frame where asked | a molecule in 3D: every atom, MODELs as frames, bonds from CONECT and distances (FILE-IO.md, *As step 7 was built*) |
| Cube file | `cube` | `.cube`, `.cub` | its layout (`CUBE_MARK`) | Meno, under the readers' contract, in its worker (`lib/calc/cube.ts`) | never | a molecule in 3D, its grids promises drawn as surfaces |
| SVG picture | `svg` | `.svg` | - | never | Export (`drawingSvg`) | - |
| Calculation programs' outputs | `adf`, `cfour`, `dalton`, `gamess`, `gamess-uk`, `gaussian`, `gaussian-fchk`, `jaguar`, `molcas`, `molpro`, `mopac`, `nwchem`, `orca`, `psi4`, `qchem`, `turbomole`, `xtb` | each its own: `.out`, `.log`, `.fchk`... | each program's banner, as the manifest of each plugin that reads it brings it | each program's own plugin, where one is added, by default - the ORCA interface for `orca`, the Gaussian interface for `gaussian` and `gaussian-fchk` (plugin, uv), the xTB plugin for `xtb` (plugin, pixi); cclib (plugin, uv) for every kind listed, as a reading of its own where chosen; `orca`, `gaussian` and `gaussian-fchk` also PySCF | never | a molecule in 3D, each geometry a frame - its bonds by distance, frame by frame - and what the calculation found |
| xTB's frequencies in Gaussian's form | `xtb-g98` | `.out` (xtb's `g98.out`) | "frequency output generated by the xtb code", as the xTB plugin's manifest brings it | the xTB plugin (pixi) | never | a molecule in 3D, its vibrations and their motions |
| Molden file | `molden` | `.molden`, `.mld` | `[Molden Format]`, as PySCF's manifest brings it | PySCF (plugin, pixi) | never | a molecule in 3D, its orbitals and densities promises |
| AIM extended wavefunction | `wfx` | `.wfx` | `<Number of Primitives>` at a line's start, as the WFX reader's manifest brings it | the WFX reader (plugin, uv: Python, with NumPy for the orbitals' values), as the format's specification has it | never | a molecule in 3D, its energy, charge and spin, its virial ratio, its orbitals' energies and occupations, each orbital's surface on asking (its values on a grid, worked out from the file's primitives); given to Multiwfn's NCI as its wavefunction |
| Gaussian input | `gaussian-input` | `.gjf`, `.com` | - | never | Export, by the Gaussian plugin (uv, Python alone) | - |
| ORCA input | `orca-input` | `.inp` | its name, and what its lines begin with (`!`, `%`, `*`), as the ORCA interface's manifest brings it | the workspace, as text coloured by the plugin's grammar, while it is added | never | a text in the workspace's column |
| KET | - | `.ket` | - | not read | never | Open does not offer it; one dropped says "not supported yet" |
| Text | - | anything not told otherwise | its name, or nothing else telling it; dropped, no NUL in its start (`opensAsText`) | the workspace, as it is | Export, from the column of texts (`TextColumn.tsx`) | a text the workspace holds, in its column; saved in `.meno` |

## Verification commands

See the README "Development" section. In short: `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build` for the frontend, and
`cargo check` / `cargo clippy` / `cargo test` in `src-tauri/`. How long
a test may take before it fails: docs/TESTING.md, *Timeouts*.
