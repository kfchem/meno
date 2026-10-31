# The workspace

Where Meno goes after the 2D editor: the 2D canvas becomes a workspace in
which everything about a molecule and the work on it is laid out together.
Agreed with the maintainer on 2026-10-03; judge it, like everything else,
against [PURPOSE.md](PURPOSE.md).

## What the workspace is for

One place, built on today's 2D canvas, where an organic chemist works
without changing tools:

- a structure drawn in 2D becomes its 3D structure, and back;
- 3D structures from calculations come in and sit beside the drawing;
- text, and the PDF of a paper, its pages shown and its content read;
- structures read out of a PDF's figures and drawn by Meno, editable;
- procedures built as workflows and run, their results coming back as
  molecules in the same space;
- and what a 3D library makes possible that a structure editor has not
  offered: a 3D structure rising out of the flat formula where it is
  drawn, groups of molecules arranged in depth.

All of it should be easy for anyone to use. The ways of working agreed for
the 2D editor stay: hover, then act; the mouse alone is enough; the same
hands do the same things in 2D and 3D (`EDITOR-2D.md`, *Pointer and keys*);
the interface says what things are, not how Meno reads them.

## Where it starts from

Both views already draw with react-three-fiber, which is why one canvas can
hold both.

- **The 2D canvas** (`ui/features/Workspace`):
  - an orthographic camera, drawn only when something changes;
  - instanced bonds and pick targets, troika text, unlit materials;
  - its structure is the tab's document, with undo and saving: one flat
    model with no notion of separate molecules; undo goes back a thousand
    steps per document, held to about 100 MB - each step costing the atom
    and bond lists it copies (`stepCost`) - the oldest dropped first
    (`DEFAULT_HISTORY_LIMIT`, `DEFAULT_HISTORY_BUDGET`, lib/doc; the
    maintainer, 2026-10-13 - it was a hundred steps);
  - atoms carry a depth (`Atom.z`) only for cages Clean-up draws in
    perspective.
- **The 3D viewer** (`ui/features/MoleculeViewer`, retired in stage 1):
  - a perspective camera with trackball controls, redrawn continuously
    while shown;
  - one mesh per atom and per bond, and every bond drawn single;
  - ball-and-stick or space-filling, 2 to 4 atoms measured (distance,
    angle, dihedral), a slider through a file's frames, and a ladder of
    several files by energy (nothing supplies the energies yet);
  - its state is the component's own: nothing is saved, and it is lost
    when the tab closes.
- **3D coordinates.** Nothing makes them from a drawing: the chemistry
  worker gives 2D coordinates only. A MOL or SDF file's z is dropped as it
  opens in 2D, and only XYZ files reach the 3D viewer.
- **Graphics contexts.** Every canvas is one, and only about 16 can be
  live (`lib/core/limits.ts`). A workspace is one canvas.

The 3D viewer is simple enough that the canvas gets its own 3D layers,
built the way the 2D layers are, rather than the viewer moved in as it is.

## Principles

1. **One space.** The canvas is a 3D space whose page is the plane z = 0.
   - A 2D drawing lies on the page; a 3D molecule is an object in the
     space beside it.
   - A drawing can also be a card set in front of the page or behind it.
   - The camera looks straight down at the page. It was to see depth in
     perspective (stage 1's spike); since 2026-10-05 it is orthographic
     (see Decisions), and a view that is to show depth can still have a
     camera in perspective.
   - A molecule rising out of a drawing is seen in perspective for the
     moment of its rise, and back, by a dolly zoom that leaves the page as
     it was: it alone, the other molecules in 3D staying as they are (the
     maintainer's trial, 2026-10-07, and their choice of 2026-10-08:
     `utils/rise.ts` `dollyMatrix`, through which `Molecule3DView` draws it).
2. **The molecule relates everything.** A structure's 2D drawing, its 3D
   structures, its conformers and the results of its calculations are
   tied by which atom is which (a 2D atom's id, a 3D atom's index).
   - Any of them can be taken up from any view.
   - Hovering or choosing atoms in one shows the same atoms in the others.
3. **The workspace is a document.**
   - What is on the page - drawings, 3D molecules, text, PDFs, workflow
     steps - are items of one document. Each item has a place, and a 3D
     item an orientation.
   - Undo, saving and the clipboard work through it, as they do for the
     2D structure today (`lib/doc`).
   - 3D structures and PDFs do not fit in a molfile, so the workspace is
     saved in a file of Meno's own (`.meno`). It holds what the clipboard's
     record holds, and the document's own style and how each 3D molecule
     is turned and shown. MOL, SDF and RXN stay for exchange.
4. **One canvas, drawn only when needed.**
   - A 3D molecule's turning, with its inertia, requests frames while it
     moves, as panning does.
   - Atoms and bonds are instanced, so that a hundred conformers overlaid
     stay smooth.
5. **The rules already in place hold.**
   - Anything fetched from the network - models, programs - is a task of
     Meno's network, asked for and shown (`ARCHITECTURE.md`, *The
     network*).
   - Outside tools run in the sidecar, their licences checked one by one;
     no code is taken from other chemistry toolkits.

## Stages

| Stage | What | Needs |
| --- | --- | --- |
| 0. Groundwork | One molecule type (audit A1: bonds are still by id in the editor and by index elsewhere); typed tab data (A2); 3D files keep their z. | - |
| 1. 3D in the canvas | 3D molecules on the canvas, with everything the 3D viewer does, in the document and saved; the 3D tab retired. | 0, in part |
| 2. 2D and 3D joined | A drawing to 3D (RDKit's ETKDG and MMFF, the drawn stereochemistry kept); the 3D structure rising out of the drawing where it is, turned to match it, and back; hover and choice shared; a 3D structure drawn as a formula by Meno's engine; conformer sets (overlaid, by energy, Boltzmann weights). | 1 |
| 3. Calculation output | Geometries, optimisation paths, energies, vibrations (modes animated) and charges read from ORCA, Gaussian, xTB and CREST, attached to their molecule; later orbitals and densities (cube files) as surfaces. Each program's reader a plugin, added and removed online. | 2 |
| 4. Text and PDF | Notes on the page; a PDF on the page (pdf.js): its pages, its text searched, its figures cut out. Notes built (#172, #177); PDFs, pictures and texts as things on the page specified in [PDF.md](PDF.md) (2026-10-09). | can run beside 3 |
| 5. Structures from PDFs | Figures read as structures, drawn beside the figure they came from and tied to it atom by atom, for the chemist to check and correct: a figure drawn with lines and letters read from PDFium's paths and letters, in Meno itself (part A, built 2026-10-11); a figure that is a picture, or any picture, read by a model, as a plugin - MolScribe or MolNexTR, as the chemist chooses - its trained model fetched with consent (part B, built 2026-10-11). Specified in [PDF.md](PDF.md), *Stage 5*. | 4 |
| 6. Workflows that run | Workflow steps as items on the page, tied to molecules: RDKit conformers, xTB, CREST, and ORCA or Gaussian where installed. Jobs started, stopped and logged by the app. Procedures saved and shared with their results. Specified in [WORKFLOWS.md](WORKFLOWS.md) (2026-10-08): the workspace is the node editor. | 2, 3 |
| 7. Depth | Analogue series, conformers and reaction steps arranged in depth; detail that changes with zoom. Tried as prototypes and shown before anything is settled. | 1 on |

## Stage 1, in order

1. **A spike, not merged.**
   - The 2D canvas with the head-on perspective camera, compared pixel for
     pixel with today's orthographic one.
   - One 3D molecule on the same canvas, beside a drawing.
   - Shown to the maintainer as pictures; the camera and the turning
     gesture are decided on them.
2. **3D layers.**
   - Instanced spheres and cylinders, with double and triple bonds drawn
     as such.
   - Light that reaches the 3D layers only (the 2D layers are unlit, so
     they do not change).
   - Drawn on demand; atoms picked.
3. **In the document.** A 3D molecule's place, orientation, frames,
   energies and measurements, with undo, the clipboard and the workspace
   file.
4. **Opening.** XYZ files, and MOL or SDF files with real 3D coordinates,
   open as 3D molecules on the canvas, by the Open button or a drop.
5. **Working them.**
   - Turn, move, zoom and choose, as the pointer table has it.
   - Measurements from the right-click menu, holding across frames.
   - The frame slider and the energy ladder beside their molecule.
   - Ball-and-stick and space-filling.
6. **The old viewer retired.** Once everything it does is matched, the
   `3d` tab goes, and the workflow's 3D node uses the canvas's layers.

Steps 2 to 6 depend on each other, so they go in one pull request, a commit
for each topic (one pull request per dependent chain).

**Where it stands** (#112): every step is done.
- 3D layers: instanced, double and triple bonds as two and three lines,
  light of their own, drawn on demand.
- In the document: place, look, frames, energies and measurements, undone;
  the clipboard and the workspace file.
- Pictures: in a copy's EMF, SVG and PNG, molecules in 3D are drawn as the
  canvas draws them - lit, in depth - each seen from straight above its
  centre, a bitmap at the resolution copied pictures are made at (Settings,
  Files; 600 dpi unless changed) - drawn in tiles of at most 2048 pixels a
  side, each its part of the view, so that a picture is as sharp as asked
  however large (a GPU's canvas has its limits, and quietly draws a smaller
  picture past them; until lane L11, 2026-10-11, the bitmap was held to
  1600 pixels across for each 300 dpi). Only past 48 million pixels, as a
  copied picture is, is it made at a lower resolution. Its balls are as
  smooth as they are large in it - at 1200 dpi a ball can be hundreds of
  pixels across, and one of a fixed 48 sides showed them - within twenty
  million triangles for all of them. A structure opened from Word or PowerPoint
  goes back with its molecules in 3D, turned as they are, and one holding
  only molecules in 3D is updated too.
- Opening: XYZ files, and 3D MOL and SD records, by Open, a drop or a new
  tab.
- Working them: as the pointer table has it, with the right-click menu.
- The old viewer: retired, and the workflow's 3D node is a canvas.

Left for later:
- values of measurements that overlap each other on the canvas (a
  picture keeps them apart);
- energies only from XYZ comment lines, until stage 3's readers.

## Decisions

Taken on 2026-10-03:

- **3D molecules are objects on the page**, not a switch of the whole
  canvas between 2D and 3D. A drawing and its 3D structure sit side by
  side, which is also what lets the 3D structure rise out of the drawing
  later.
- **The 3D tab is retired** once the canvas does everything it does.
- **MOL and SDF files with 3D coordinates open as 3D molecules**; XYZ
  files too.
- **The workspace has a file of Meno's own**, `.meno`.

- **The camera looks at the page head-on, in perspective** (agreed on the
  spike's pictures). The spike compared the page pixel for pixel with
  today's orthographic camera:
  - identical at four zooms, and for taxol 8 pixels out by 1/255;
  - only the selection shading, which lies 0.04 behind the page, moved,
    by under a pixel at its edges, so every page layer is to lie on the
    page and be ordered by drawing order alone.

  The camera stands 60 bond-units from the page and keeps today's zoom:
  CSS pixels per world unit on the page.

  **Changed on 2026-10-05: the camera is orthographic.** On Windows the
  maintainer saw a camera standing so far off that it is nearly
  orthographic, and found it far better to look at. So the canvas's camera
  is orthographic:
  - a molecule in 3D is seen as large as it is, however high it stands, at
    the same scale as the drawing beside it (a 1.5 Å bond as long as a
    drawn one);
  - a picture of it for another program is exactly what the canvas shows.

  What goes is the molecule growing as it rises out of the drawing; depth
  for stage 7 is to be shown by other cues, tried when it is built. The
  perspective is kept, not deleted: everything that sees molecules follows
  the camera's eye (`utils/page#eyeOf` - none for an orthographic camera),
  and `PageCamera` sets up a perspective camera for a view that is to show
  depth, a workflow's view say.
- **Each 3D molecule turns by itself; the page never tilts.** With a
  drawing and its 3D structure side by side, turning the view would show
  the drawing askew. So what is under the pointer decides:

  | Under the pointer | Left drag | Right or middle drag | Wheel, pinch | Click |
  |---|---|---|---|---|
  | A 2D drawing | as today | moves the view | zooms the page | as today |
  | A 3D molecule | turns it about its centre, with inertia; selected, moves it and all that is selected with it | moves the view | zooms the page | on an atom or a bond, chooses it |
  | Empty page | moves the view | moves the view | zooms the page | chooses nothing |

  - **A 3D molecule's reach** follows its shape: its atoms, its bonds and
    within its rings, and a few pixels about them, so a drag between two
    atoms still turns it.
  - **Hovered, its outline lights up**, very faintly, and the atom under
    the pointer swells a little on a spring. No frame: the maintainer
    asked for a highlight along the outline, in a modern way, rather than
    a rectangle round it.
  - **Held still, a press selects the molecule** (a long press, as in 2D), the
    selection's outline spreading out from the atom pressed on as it is
    held; a drag from there moves it. A molecule selected moves when
    dragged, with all that is selected; one not selected turns. (Agreed
    on 2026-10-03, in place of a rim outside the outline that moved it:
    the maintainer expected to select and drag by reflex.)
  - **A structure rising out of its drawing** ends beside it, not on top,
    so that the drawing can still be edited.
  - **A drawing and its 3D structure.** Turning the 3D structure leaves
    the drawing as drawn. Hovering an atom in one lights the same atom in
    the other. *Turn like the drawing* is in the menu.
  - **The selection's handle turns molecules in 3D** (agreed 2026-10-03;
    in the page's plane since 2026-10-24, the maintainer: the handle turns
    round, so it turns them round, as it does a drawing):
    - selected alone, in the page's plane about the line of sight, in
      steps of 15 degrees or freely after a pause, as a drawing turns:
      several as one body about their common middle - so that molecules
      placed together, a complex say, stay as they are to one another -
      which moves them; one about its own centre, where it stands. Either
      is one undo step, the undo putting their turns back too, and Escape
      lets it go. (Until 2026-10-24 the handle turned them in 3D, as a
      drag on one does - and on a touch screen seemed to do nothing.) A
      drag on a molecule itself still turns it in 3D;
    - selected with a drawing, everything in the page's plane, the
      molecules carried round and turned with it;
    - with Shift, each molecule about its own centre, the drawing staying.

    Every turn by the handle is one undo step, Shift's and one molecule's
    alone too (agreed 2026-10-04), and the undo puts the turns back; a
    drag on a molecule itself turns only the view.
  - **Turn once** (the maintainer, 2026-10-16: the one motion Meno's
    own canvas makes of itself; every other is a renderer's - docs/RENDER.md).
    In a molecule's right-click menu, beside *Reset orientation*: it turns
    once round about the screen's up, through its centre - the near side
    going right - over 4 s along the quintic smootherstep
    (6t^5 - 15t^4 + 10t^3), so that it starts and stops with neither speed
    nor acceleration; and it comes to rest exactly as it was turned
    before. What goes with the molecule - its labels, its surfaces - turns
    with it. Several selected, chosen on one of them, turn together, each
    about its own centre. It is the view's, as a drag's turn is: no undo
    step, and nothing to undo, since it ends where it began. No setting:
    its length and its way round are fixed. Any press, Escape, or a turn
    given one of them meanwhile - a drag, *Reset orientation* - stops it
    gently: it slows to rest over 0.4 s from the speed it had, its speed
    falling along 1 - smoothstep, so nothing jumps, and is the chemist's
    from there (`utils/turnOnce`). In a talk, a right-press on a molecule
    turns it once (docs/PRESENTING.md).
- **What a 3D molecule looks like** starts from the 3D viewer's look:
  - atom size and colour, material and light, and the turn's inertia,
    near enough;
  - held as a style, as the 2D drawing's is, so that it can be set the
    same way later.
  - Since 2026-10-04 it is set in Settings, under 3D (named *Molecules in
    3D* until 2026-10-19), as
    the drawing style is: a preset - Ball and stick (the viewer's look;
    named Meno until 2026-10-10), Glossy or Space-filling - and what was
    changed from it, each change marked and taken back alone or all at
    once. The settings are how molecules are drawn unless one has a look
    of its own, ball size, bond thickness and colour, the surface, the two
    lights, and how a molecule turns and coasts when let go. A molecule
    beside them shows the look and can be
    turned, to try the turning. The canvas, the selection's handle, a fit
    and the pictures for other programs all take the look from there. A
    workspace of its own look, as a workspace has its own drawing style, is
    not there yet.
  - Since 2026-10-10 it is two looks, a primary and a secondary, each a
    style chosen from a list: *Styles in 3D* below.

Taken while stage 1 was built, on 2026-10-03:

- **Choosing and selecting.**
  - A click on an atom or a bond of a 3D molecule chooses it, or lets it
    go. Atoms are chosen in order, up to four, as in the old viewer, and
    bonds up to three; one in another molecule starts afresh. What is
    chosen makes a measurement: atoms in the order chosen, or along the
    bonds - one bond's length, two bonds' angle, three in a row their
    torsion angle - an atom besides going on from an end it is bonded to.
  - A long press selects the molecule whole. A click with Ctrl (⌘ on a
    Mac) takes it into the selection or out of it.
  - A box, a lasso or select all takes 3D molecules by their centres,
    with the drawing.
  - Delete, Cut, Copy and Escape include them. A drag on any of what is
    selected moves all of it, drawing and molecules, as one step.
- **The right-click menu on a 3D molecule:**
  - a measurement of what is chosen of it (two, three or four atoms);
  - its other look, the 3D style's secondary or back to the primary (since
    2026-10-10: *Styles in 3D*);
  - reset orientation;
  - cut, copy and delete.
- **Measurements** are the document's:
  - a dashed line for a distance, or an arc and a faint fan for an angle
    or a torsion angle (IUPAC's sign), with the value beside;
  - measured afresh in whatever frame is shown;
  - the pointer goes through a value to the molecule, but the menu and
    Delete over it are the measurement's.
  - pictures - SVG, PNG, and the EMF for Office - draw them too, as the
    canvas does: the line (a distance's dashed) and a faint fan in the
    measurement's blue, and the value on a white ground, as large as the
    drawing's R and S (agreed 2026-10-05). The frames chip is not drawn: it
    is a control.
  - The lines and fans are drawn into the molecules' image, with Meno's
    own drawing of them, so that they stand in depth among the atoms as on
    the canvas: a line running behind a ball is hidden by it (the
    maintainer, 2026-10-05: drawn over the image, they had come in front of
    atoms they pass behind). Only the values are written over the image,
    as text. Without WebGL to draw the image, the molecules are drawn as
    discs, and the lines over them.
  - In a picture, a value is written where the canvas writes it, when it
    covers no atom there. When it would, it moves off: beside its line,
    on the side away from the molecule's middle, clear of the atoms and of
    the values written before it. At that size, a value on a short
    distance - an O and an N across two bonds - covered the very atoms it
    measured (found on Windows, 2026-10-05).
- **Frames.**
  - A molecule with frames has a chip under it: which frame, of how many.
    Clicked, the chip opens to a slider; clicked again, or with a press
    anywhere else or Escape, it shuts (the maintainer, 2026-10-13: it
    opens on a click, not as its molecule is pointed at or selected).
  - The old viewer's ladder of energies became bars above the slider:
    each frame as high as it is above the lowest, and the chip says by
    how much in kcal/mol. One control serves both a trajectory and a
    conformer set.
  - Its atoms go over to another frame rather than jump.
- **What is the view's.** How a molecule is turned and which frame it
  shows are not undone, save a turn by the selection's handle. They are kept by a copy and by the workspace file,
  so that what is pasted or opened looks as it did.
- **Saving.**
  - `.meno` is a zip (since 2026-10-06, #158: docs/FILE-IO.md, *The
    workspace file*). Its `workspace.json` is the JSON `.meno` was at
    first (`meno-workspace`, version 1); the outputs, texts, PDFs and
    pictures it keeps are files beside it (`lib/doc/menoFile.ts`).
  - Save and Save As write `.meno`, and nothing else (since 2026-10-06,
    #151; before, with 3D molecules on the canvas, Save offered a
    workspace or an SD file). Other kinds are written by *Export…*, on
    the selection's menu: MOL, SDF, RXN, PDB and SVG, by Meno
    (`lib/io/writers.ts`), and, for molecules in 3D, what the plugins
    added write. An SD file holds each 3D molecule as a record in 3D
    beside the drawing, in the frame shown or every frame a record; a PDB
    file holds the molecules in 3D alone.
- **Calculation readers** (the maintainer): reading what calculation
  programs write is to be plugins, added and removed online. Meno itself
  reads geometry. The one reader so far, energies on an XYZ file's comment
  lines (CREST, xtb, ORCA), lives apart (`src/utils/xyzEnergies.ts`), and
  what it finds is plain data on the molecule.

Taken on 2026-10-04:

- **The structure canvas is the workspace** (named Workspace from 2026-10-10), and everything else is to be
  reached from it. The New Tab page is gone: Meno starts on a canvas, "+"
  makes another, and Open puts a file in a tab of its own (until
  2026-10-13: Open adds to the workspace in front, below). The New… menu
  goes too, later: the text editor, the Python console and the workflow
  builder are to be reached from the canvas. (Done 2026-10-10: "+" opens
  a workspace and nothing else, and the Python console was removed.)
- **Text files and PDFs on the page**: a small preview of each sits on the
  workspace, and is edited in a split view or in a window inside Meno's.
- **No buttons on the canvas.** The right-click menu has what concerns
  what is under the pointer, and the canvas as a whole on empty space;
  keys are kept to what is used most, and reachable by the left hand
  (Ctrl/Cmd+1 fits, not Ctrl/Cmd+0). (Commands were also in Meno's menu,
  from its logo, until 2026-10-10: see below.)
- **The system's menu bar stays as the system has it.** On a Mac, Meno's
  commands do not go into it. A Mac's window is to get its own controls
  (the close button and its neighbours) at some stage.
- **The system's right-click menu only where it edits words** (2026-10-13).
  In a text box - a field in Settings or Quick Add - it gives Cut, Copy and
  Paste; anywhere else - Settings, the tab bar, a tab, Quick Add's row, a
  dialog, the column's text, which Meno draws itself - all it gave was the
  webview's Reload, which starts the whole window afresh, unsaved work and
  all, so it is kept shut there (`keepSystemMenuShut`, lib/doc/shortcuts).
  Meno's own menus - the canvas's, a PDF's, a colour set's - open as they
  do.
- **Meno's own menu on words written or read in place** (the maintainer,
  2026-10-13). A right-click on the column's text, on words being written
  on the page or on an atom's label being written opens a small menu of
  Meno's, as the canvas's look: Cut, Copy, Paste and Select All, with their
  keys, each that does not apply now shown but not to be pressed - Cut and
  Copy with nothing selected, Paste with no text on the clipboard, Cut and
  Paste on a Markdown text read (`textMenu`, TextEditor). Where nothing is
  selected, the caret goes where the right-click was first. The words keep
  the keys while it is open: Escape closes it alone, and a press elsewhere
  only closes it.
- **Closing the last tab quits Meno.**

Taken on 2026-10-07:

- **Texts.** A workspace is a tab, and a tab is a workspace: text no
  longer opens in a tab of its own. A text file opened, or dropped on the
  canvas, a molecule's output shown and a new text (*New text*, on the
  menu on empty space) are held in the workspace in front - one
  of its own where none is in front - and shown in a column on the
  canvas's right (the maintainer chose the column over a window inside
  Meno's). It is the workspace's:
  - edited there, its typing undone as any edit, and saved with it in
    `.meno` (docs/FILE-IO.md, *The workspace file*);
  - written to a file by Export, the column's button: beside the file it
    came from, numbered from 2, never over it unasked;
  - closed from the workspace by its name's ×, and back with an undo; the
    column hidden (*Hide texts*, its own button) keeps them all, and
    *Show texts* on the menu on empty space brings it back;
  - the column slides open and shut as the panels beside the canvas do,
    and is as wide as its left edge is dragged;
  - since 2026-10-09 it lies over the canvas's right side, the view
    following it, and the PDFs read there are named among its texts
    (docs/PDF.md, step 2).
  - **it fills the workspace** (the maintainer, 2026-10-17): *Fill the
    workspace*, the column's button beside *Hide texts*, or Ctrl/Cmd+Shift+F,
    has the PDF or text it shows cover the whole canvas, easing out to it as
    the column opens - the tabs and the column's header kept; *Back beside
    the canvas* (the same button, or the key again, or Esc once Find is
    closed) eases it back to the width it had. It is the tab's while it is
    open, not saved; hiding the column ends it, and another PDF or text
    shown in it keeps it.
  The small previews on the page, decided on 2026-10-04, are made: each
  text has a sheet on the page with its first lines and its name under it,
  coming as an icon (docs/PDF.md, *A text*).

Taken on 2026-10-10 (menus and gestures):

- **Meno's logo and its menu go.** Doing something to the whole workspace
  is Select all and a right-click, as for any selection: *Clean up all*
  and *3D structures* went with the menu. Save is a button in the title
  bar, by Settings (and Ctrl/Cmd+S); Export is the selection's; a SMILES
  is drawn from Quick Add; Open…, Save As…, New text and what concerns the
  view - fitting, R/S and E/Z, the texts, the drawing style - and *Run all*
  are on the right-click menu on empty space, with their keys.
- **Quick Add opens at once.** The chain from empty space is one of its
  icons, so a double-click need not wait to see whether a third click
  comes (docs/EDITOR-2D.md, *Quick Add*).
- **A double-click on the canvas shuts the column** beside it: the work
  comes back to the canvas (docs/PDF.md, *One canvas*).

Taken on 2026-10-13:

- **Open adds to the workspace in front.** A structure's file, a
  calculation's output or a PDF opened (Ctrl/Cmd+O) is added to the
  workspace in front, as a drop on its canvas adds it: in free space near
  the middle of the view, one step to undo, an SD file as a stack. Free
  space is clear of all on the page - the page's labels as far as the
  layout sets their letters, as they are drawn, so that an NHBoc or a
  PO3H2 is not grazed (`pageBoxes`) - and of a workflow's sets and steps'
  cards - a structure put down in a set's frame would be taken as what the
  set holds - its own labels and "+" signs counted. Only a `.meno` opens a
  tab of its own, untouched: opened with other files at once, it opens
  beside the workspace in front, which takes the rest (the maintainer,
  2026-10-13). A file that cannot be read says so in the workspace, and no
  tab is made; where a plugin could read it, adding the plugin reads it
  again there. With no workspace in front, the one last in front is
  brought forward; with none, a canvas is opened for it.

## Stage 2, as built

- **A drawing to 3D.** A structure's right-click menu, or a selection's,
  has *3D structure*; *3D structures* on the selection's menu makes
  everything selected (Select all first, for everything drawn). Stereo
  drawn without a configuration is ringed on the drawing while Meno asks
  what to make: every stereoisomer it gives, one, or none for now. Each is
  made as a conformer set (RDKit's ETKDG, then MMFF94, MMFF94s or UFF as
  chosen - UFF where MMFF has no parameters for the molecule) and comes
  onto the page as a molecule in 3D, its frames the conformers, lowest
  first. Of two enantiomers, one is made as the other's mirror image, so
  the two have the same conformers and shares.
- **Conformers kept** (2026-10-26). Those within 30 kcal/mol of the
  lowest are kept; those above are set aside. The window is set in
  Settings, *Chemistry*, under *3D*, and is said with how they were made
  (*Energy window*, with how many it set aside). A force field can trap a
  ring in a minimum far above the rest: the MMFF94 search of cyclooctane
  finds two some 66 and 77 kcal/mol up, which nobody drawing a structure
  asks for. Nothing else is filtered out of what the plugin gives. Without
  energies, none is set aside, and that is said. A workflow's *Conformers*
  step keeps every one; there, only an *Energy window* step sets any aside
  ([WORKFLOWS.md](WORKFLOWS.md)).
- **A metal's bonds hold** (2026-10-17). A bond drawn to a d- or f-block
  metal is embedded at its covalent length (Pyykkö's radii, as Meno's own)
  with the metal's ligands kept apart where that is sound (PLUGINS.md, *A
  metal's ligands are kept apart*), and the metal is given UFF's own
  geometry for it: square planar for Ni, Pd, Pt and Au (their angles held
  at 90 and 180 degrees), tetrahedral or octahedral for the rest. Where UFF
  has no type for the metal - Ru, Os, Rh, Ir, W, Zr, Hf, Y - a lighter
  metal of its group stands in for its shape while its bonds are held at
  their own lengths, and no energies are given: the chip says so, and the
  conformers are not weighted. They are ordered by the stand-in's energies,
  as the line that says how they were made says. Before, UFF without terms for a
  metal pushed it 8 to 25 Å off its ring, or stopped.
- **A ring bound to a metal through all its atoms** (η; 2026-10-17) is
  asked about as the CTfile's multi-centre bond - a bond from the metal to a
  star at the ring's centre, ENDPTS its atoms, ATTACH=ALL - however it is
  drawn: a haptic bond; a label on the metal that names a ligand bound so
  in a complex (Cp, allyl - and CO, NH3 and the rest of the ligands named
  only in a complex, as those ligands); or a ring with a bond from the metal
  to each of its atoms (ferrocene by hand). The plugin holds each of its
  atoms at the covalent length plus 0.15 Å from the metal, counts a ring of
  five or a chain of three drawn neutral as the cyclopentadienide or allyl
  anion it is bound as (not a CH2, nor radical carbons), and gives no
  energies; the star is no atom of the molecule in 3D. Two rings of one
  metal are kept from overlapping, at least 2.9 Å apart atom from atom
  (RDKit plugin 0.1.4; before, Cp2ZrCl2's rings could fold onto each
  other, the force field counting nothing between fragments). Nothing more
  is held: the angle between a sandwich's rings is UFF's, and ferrocene
  comes out within about 6 degrees of straight, Cp*2Fe within about 10 -
  as it was made, and said so (below).
  - A label for a ligand bound through more pi systems than it has bonds
    drawn - cod, nbd: two C=C - bonded to a metal by one bond is bound
    through each of them, one multi-centre bond each, to that metal (the
    writer, `prepared`); no star is left unbound, as an atom of nothing.
  - A metal's valence as the drawing states it (a SMILES's bracket atom,
    [Fe] in C[Fe]C, or a file's VAL) is left out where its bonds bind
    ligand labels or rings so (etaBound): it counted them as plain bonds,
    and left in, the metal stays two-valent - each Cp bound by one carbon,
    an H on the metal. The drawing keeps it. (The other way, dropping it
    from the drawing as its bonds change, would lose it for a file written
    from the drawing; asking leaves the drawing as it was.)
  - Made so, the molecule in 3D is as drawn: a label at the place of a pi
    system's star - Cp, cod - is no atom of it, so no atom it is tied to,
    and what it was made from takes in the labels bonded to its atoms
    (utils/drawnLink `signatureOf`), on making and since. Before, Cp2Fe
    and PtCl2(cod) drawn with labels said *Its drawing has changed* at once.
- **A 3D structure made from a drawing is a starting geometry**
  (the maintainer, 2026-10-18): embedded and tidied by a force field, with
  only what that force field cannot say held - a metal's bonds at their
  covalent lengths, an eta ring at its distance over its metal, two rings
  apart, a square-planar metal's angles - never a shape it is expected to
  have. How it was made is said in one line with it, in the plugin's
  words (`method`: "ETKDG v3 + UFF; restrained: eta rings: metal-ring
  atom distances, rings ≥ 2.9 Å apart"), first under *How it was made*
  where it is pointed at, and kept with it in a workspace. Shut, *How it
  was made* takes no room: the card it is on is as wide as what it shows,
  no wider (the maintainer, 2026-10-28). Opened, the card first grows to
  it, wider and taller together in 160 ms, and only then do its lines fade
  in, in 120 ms, as gently at first as at the end; shut, they fade out
  first, the same way, and the card then shrinks back. It widens to the
  right only as *How it was made* opens, and back, so the toggle at its
  left stays under the pointer that pressed it.
  A frames chip opens to its details the same way. Opened or shut again
  part way, it goes back from where it is (the maintainer, 2026-10-29;
  `theme/opening`). An eta complex's
  shape most of all is held, not modelled: a real geometry comes from
  optimising it - an xTB or DFT step of a workflow.
- **A bond to a ring's centre is one stick** (eta; 2026-10-17): a molecule
  made in 3D from a drawing with a multi-centre bond - a Cp, an arene, an
  allyl, an alkene bound through both carbons - shows one stick from the
  metal to the centre of the atoms it binds, and no stick from the metal to
  each of them; the atoms keep their own bonds, and the star at the centre
  is no atom of it (`Molecule3D.centres`, utils/molecule3d `withCentres`).
  Every way the molecule is drawn - the canvas, its shading, a render and
  a picture of it - draws that stick; a press on it is a press on the
  molecule, and a calculation's pair results are not said of it.
- **A haptic bond binds its ring whole** (2026-10-13; 2026-10-17): where
  an atom of the ring it binds is deleted or merged onto another, or it is
  pasted or taken as part of a structure without its ring, it goes, and its
  star with it - rather than name atoms gone, bind the ring it was copied
  from, or leave its star on the drawing as an atom of its own (chem/eta
  `etaHeld`, on every edit; a part Clean-up lays out keeps the bond to its
  star, `endpointsHeld`).
- **A lone atom** (the maintainer, 2026-10-13) is made in 3D where it stands
  for a molecule: an element with the H it carries - C is methane, O water,
  N ammonia - or a label Meno knows, written out as the molecule it stands
  for (THF, DMSO, MeOH, Et3N). A bare atom - Na+, Cl-, a lone metal, a label
  of nothing known - is not: alone, Meno says that one atom alone has no 3D
  structure; beside others made - a salt's counter-ions - it is left out,
  and a notice names it (`standsForMolecule`, `bareWords`, chem/make3d).
- **Rising out of the drawing.** Turned to lie over the drawing (Horn's
  quaternion, `utils/align3d`), its atoms grow on the drawing's, go over
  to their places in 3D as it comes up off the page, and it moves to rest
  beside the drawing: to its right, its left, below or above - the first
  that is in view as it is seen - the view taking it in where none is.
  Several rise one after another, in a row.
- **Told apart.** Made with the other stereoisomers its drawing leaves
  open, a stereoisomer's centres that were left open carry their R and S
  until it is asked otherwise; made alone - one configuration chosen - it
  carries them only where they are asked for, on it, an atom of it or a
  selection holding it (the maintainer, 2026-10-10: hidden unless asked
  for; 2026-10-15: asked for on what they are shown on, docs/EDITOR-2D.md,
  *R and S*). They are
  as large as the drawing's R and S, and written as the drawing's style
  writes them (bare, or in parentheses), in blue. Each is set clear of
  its atom - beyond its ball by as much as the drawing's style sets them
  off - in the widest gap between its bonds as it is seen - or the
  nearest way round that covers no other atom, no measurement's value
  and no bond (an atom hidden counts for more than a bond covered) - and
  a little way off the others (2026-10-05: on Windows, an (S) sat on a
  value or on a bond in some frames as the molecule turned). As the
  molecule turns and the best way changes, a label glides round its atom
  to it, the shorter way, on a 70 ms time constant - never across the
  atom, never in a jump (the maintainer, 2026-10-15).
- **Measurements' values keep apart.** Each value stands on its point
  while that is clear of the values before it; where another is in its
  way it moves off - square to a distance's line, out from an angle's
  atoms - and stays where it went until its point is clear again by
  3 px, so that two side by side, the view turning, keep their places
  rather than trading them. It glides where it goes, as the R and S do.
- **Under what is beside and over the page.** R and S, values, chips and
  cards are drawn in the page's HTML layer: its own stacking context,
  clipped to the canvas. They are cut at the canvas's edge as the drawing
  is, and never stand over the panel beside it, the window bar, the
  tabs, the column, the cards or the menus (the maintainer, 2026-10-15).
- **Tied to the drawing.** An atom hovered in either lights in the other.
  Drawn otherwise since - atoms, bonds or wedges, not where they are - the
  molecule stays as it is and says so under its frames, with *Make
  again*, made where it stood. What the drawing leaves open is made as
  the molecule had it (so an (S) stays (S)), and Meno asks only about
  stereo that is new. An undo brings the molecule back as it was turned.
  *Turn like the drawing* is in its menu.
  Pasted with its drawing, it is tied to the pasted drawing.
- **And back.** *Draw as formula*: a molecule in 3D with no drawing is
  drawn by Meno's engine, wedged as it is in 3D, its bonds' orders found
  where a file of coordinates gave none, and tied to it.
- **Conformer sets.** Each conformer's share at room temperature
  (Boltzmann) stands beside its energy; *Show all conformers* draws the
  others over the one shown, each as dark as it is likely.

Taken on 2026-10-04, for stage 2:

- *3D structure* is on a structure's right-click menu and the selection's.
- A drawing changed after its molecule in 3D was made: the molecule stays,
  and is made again only when asked.
- What is made is a conformer set from the first.
- Stereo left open is asked about before anything is made, and *all the
  stereoisomers* is one of the answers.

## Stage 3, planned

Calculation output: what a program's output says besides the geometry,
read and attached to its molecule. Agreed with the maintainer on
2026-10-05.

### Readers are plugins

- **Meno's core knows no program's format.** It reads geometry itself -
  XYZ frames, MOL and SDF - and the energies CREST, xtb and ORCA write on
  an XYZ file's comment lines, needing nothing else. Everything else is
  handed to a reader, and comes back as plain data on the molecule.
- **A reader is a plugin.** Each runs as a worker in a Python environment
  of its own, as RDKit does: set up from a lock that Meno carries, every
  package pinned by its hash, and only when asked for, with the network's
  consent. Readers are added and removed in Settings, *Plugins*, and which
  reads a kind that several read is chosen in *Files*; opening a file that
  no reader added reads says which would. Which readers there are is
  Meno's own list for now. A list fetched online needs a way to trust it
  (signing), and comes later.
- **The first reader is cclib** (BSD-3), which reads ORCA, Gaussian, xTB
  and others. It is installed into its plugin's environment as a
  library. Meno does not copy its code, and a reader Meno writes itself is
  written from the programs' outputs and documentation, not from cclib's
  parsers.
- **Readers are alike, and several can read one output.** Every reader
  installed that reads a kind of output reads it, and what they find is
  put together: an NBO plugin, say, adds NBO's analysis to what cclib read
  from the same Gaussian output. No reader is set above another (the
  maintainer, 2026-10-05).
- **Each reader's results are its own.** A result belongs to the reader
  that gave it, and its name is that reader's own: names are never
  matched across readers, and two readers' results of the same name are
  two results, each shown as it says. Where two readers' results stand in
  one place - a card, the menu's lists - each reader's are under its name;
  with one reader, no name is said (the maintainer, 2026-10-06).
- **Where readers overlap, the chemist chooses** what Meno keeps one of:
  Settings lists, for each kind of output, the installed readers that read
  it, and the one chosen gives the geometries and what the calculation
  was, its results coming first - or else the plugin whose own program
  wrote it (PLUGINS.md, *Several plugins, one role*), or else the first in
  Meno's order. What
  a reader finds of atoms is kept only where its atoms are those of the
  geometries, in the same order.

### Where the line is

Agreed with the maintainer on 2026-10-05, so that what comes later - NBO,
orbitals, programs and analyses not yet thought of - needs a plugin, not
a change to Meno.

- **A plugin knows the file.** It reads the format, says what each thing
  it found is, in the terms chemists use for it (a Mulliken charge, a
  donor-acceptor interaction's E(2)), and gives it in Meno's units.
- **Meno knows where it shows, how, and what can be done with it:** where
  it goes, how it looks, how it shows when pointed at, how numbers are
  written, the motion, saving, and the link to the drawing.
- **What Meno does something with has a form of its own; what it only
  shows comes in one general form.**
  - Meno's own forms: the atoms and their geometries (the frames), each
    frame's energy (the bars, a conformer set's shares), and what the
    calculation was - program, method, basis, charge and multiplicity,
    which a procedure run again needs.
  - Everything else is a *result*, in the general form below: partial
    charges, spin densities, NBO's charges, bond indices and
    interactions, the dipole moment, thermochemistry, orbital energies,
    vibrations.
- **A plugin gives data, never code.** Nothing it gives is run, or shown
  as markup. A molecule's results are saved in `.meno` with it, and open,
  shown as they were, where the plugin is not installed.

### Results

Each result says what it belongs to, and Meno puts it there:

| Belongs to | For instance | Shown |
|---|---|---|
| The molecule | the dipole moment, ΔG, ⟨S²⟩ | its chip: in its line, and all of them when pointed at |
| Each frame | an optimisation step's gradient | its chip, for the frame shown |
| Each atom | partial charges by scheme, spin densities, shieldings | pointing at the atom, under its element and number |
| Pairs of atoms | bond indices, couplings | pointing at the bond |
| A list | vibrations, orbitals, NBO's interactions | from the molecule's menu, under the molecule |

- **A value says what quantity it is,** in Meno's unit for it - an energy
  in hartrees, a charge in e, a spin population in e (signed, as a charge
  is), a wavenumber in cm⁻¹ (an imaginary one
  negative), a length in ångströms, a dipole in debye, a number, a text,
  a symmetry - and Meno writes it, the same way whichever plugin gave it.
  Any other gives its unit, and is written with it.
- **A symmetry is in standard notation** (2026-10-31): a point group
  (C2v, D3h, C∞v, D∞h) or a Mulliken symbol (A1, Bu, B1g, A', E'', Σg,
  Πu) - a value of a symmetry, a list's column of them, and the
  thermochemistry's point group. A reader writes its program's own
  spellings in it (a word for a Greek letter, a letter for ∞); Meno puts
  the case right whatever it was printed in - the first letter upper, the
  rest lower: "c2v", "C2V" and "C2v" are one - for display and for every
  comparison, a barrier's of its two sides' point groups among them.
- **A charged molecule's dipole is taken about its centre of mass**
  (2026-10-14). An ion's dipole depends on the point it is taken about -
  H3O+ moved 6 Å from the origin its program took it about reads 28.9 D
  there, 2.1 D about itself - and programs take it about different points
  (the origin of the coordinates, the centre of nuclear charge, the centre
  of mass). Its reader gives it as the program printed it, with its
  components (`vector`, in debye) and the point it was taken about
  (`origin`, in ångströms), and the centre of mass where the program
  printed one (`centre`); and the output gives each atom's mass where the
  program printed them (`masses`, daltons). Meno takes it again about the
  centre of mass (2026-10-31: Meno's rule, once kept by each reader) - the
  one printed, else the one those masses give at the output's last
  geometry, else the one the elements' standard atomic weights give
  (NIST's, lib/chem/isotopes: an interval's midpoint, an element with no
  stable nuclide its listed nuclide's mass) - and calls it *Dipole moment about the centre of mass*
  wherever it is shown, its origin then that centre, so that a workspace
  read again takes it nowhere else. A neutral molecule's is the program's
  own; so is a charged one's where there is no centre to take it about.
- **A list's row can point at atoms, a frame or a motion.** Pointed at,
  its atoms are marked; chosen, its frame is shown, or the molecule moves
  in it. Vibrations are a list whose rows move the molecule - no arrows
  and no spectrum. Its columns are those the output holds: the reduced
  masses, IR intensities and Raman activities where it gives them, and
  no empty column where it does not (2026-10-14). These are what Meno can do with a row, and more come
  as Meno learns them: a surface, for an orbital's row.
- **A list that opens on a row keeps the rows about it** (2026-10-31):
  the ten up to that one, it among them, and the ten after - an orbitals'
  list, given in full and opening on the LUMO, keeps the ten virtual
  orbitals from it and the ten occupied below - and says so where it
  shows them: "rows 22–41 of 50". Read again, it is kept as it was.
- **What the chip's line says:** a plugin ranks which of a molecule's
  results it says; Meno fits as many as the line holds, in that order,
  after what the calculation was and its energy. One ranked 0 - how the
  run went, "Run ended with an error" - is said however long the line
  (2026-10-13). So is what geometries that are no optimisation's are -
  "Relaxed scan · 5 points" (a rigid one "Scan"), "Reaction path · 21 points" (a Gaussian
  reaction path's points in the order of its coordinate, as its summary
  lists them) - none of them called optimised; and "Excited state ·
  energies not read" where an excited state was optimised, whose energies
  at each geometry are not the ground state's that the output also gives
  (2026-10-14).
- **Of a job with excited states, a dipole, charges and the HOMO-LUMO gap
  say which state they are of** (2026-10-22): "Dipole moment, ground
  state", "Mulliken, excited state 1" - as the output says which density
  they were worked out from (Gaussian's "Population analysis using the SCF
  Density"; ORCA's dipole block's Method and State, and the root heading its
  relaxed density's population analysis). Before, the same words stood for
  either: Gaussian's TD optimisation gave the ground state's at the excited
  state's geometry, ORCA's its root's. Where the output does not say, they
  are left out. The orbitals are always the ground state's.
- **No colouring.** Results are seen by pointing at them; the look stays
  as it is.
- **Grouped and named by the plugin:** "Partial charges", "NBO".

### Asked for when wanted

A result can be too big to send with the rest - an orbital's values on a
grid, say. Any result, of whatever kind, can then be sent as a promise:
what it is, and a key to ask the plugin for it with. Meno asks for it when
it is wanted - its row chosen - and keeps it once it has it. Saved, a
molecule keeps every result it has, and every promise it has not yet been
given with where its output was, to be asked for from there.

### Tests

No program's output is committed (the maintainer, 2026-10-05). Gaussian's
carry Gaussian's own copyright notice, and the rest are kept out the same
way. Sample outputs - small ones from cclib's repository, ORCA's, xTB's
and Gaussian's - are kept on the developer's machine, in a folder git
ignores. The tests that read them run where they are there and are
skipped where they are not, as in CI. What a reader hands back is Meno's
own plain data, so CI tests Meno's side of it - opening, saving, showing -
with that data written by hand.

### In order

1. **3a.** The reader plugins: the worker, the environment, Settings'
   *Calculation readers* with the choice where they overlap, and cclib's
   (since then, the readers are in Settings' *Plugins* and the choice in
   *Files*).
   Geometries, an optimisation's steps, energies, and what the chip says.
2. **3b.** Vibrations.
3. **3c.** Results in the general form: what the calculation was in
   Meno's own, and everything else as results - partial charges pointed
   at, the dipole moment and thermochemistry on the chip, vibrations and
   orbitals as lists - with several plugins reading one output.
4. **Later.** Orbitals and densities drawn as surfaces, asked for when
   wanted.

## Stage 3, as built

Stages 3a to 3c, built in #143 and checked on a Mac and on Windows on
2026-10-05.

- **Readers.** cclib (1.9rc1) is the first. Settings, *Calculation
  readers* (now *Plugins*, the choice where readers overlap in *Files*),
  adds it - asking first for the network - and takes it away again, its
  environment and its record with it. A kind of output is told by what its
  file starts with. Where readers overlap, every one added reads the
  output and each one's results are kept, its own; the one chosen for that
  kind gives the geometries and what the calculation was.
- **Opening an output.** It opens on a canvas tab of its own, its last
  geometry shown, an optimisation's steps as its frames. With no reader
  added that reads it, Meno says which to add; an output with no geometry
  says so.
- **The general form.** What Meno does something with - atoms,
  geometries, each one's energy, what the calculation was - has a form of
  its own; everything else is a result belonging to the molecule, each
  frame, each atom, pairs of atoms or a list, its values quantities Meno
  writes or values with their own unit. cclib gives partial charges and
  spin populations, thermochemistry, the dipole moment, the HOMO-LUMO gap,
  each step's RMS gradient, the vibrations and the orbitals about the
  frontier.
- **Seen by pointing.** The chip says what the calculation was, its energy
  and the results ranked for it; its text pointed at, the molecule's and
  the frame's results stand above it. An atom or a bond pointed at a moment
  says its results on a card beside it. The molecule's menu opens each list
  under it: a row pointed at outlines its atoms, one chosen moves the
  molecule or shows its frame. A list opened with too little room below it
  glides the view until the molecule and the list are both seen. A chip
  stands only where its molecule puts it: opened at the window's edge, it
  goes past the edge rather than chase it, and moves with its molecule as
  the view moves (the maintainer, 2026-10-28: following the edge, it
  jittered). No colouring.
- **Vibrations** are a list whose rows move the molecule: the atom that
  moves most goes 0.3 Å, once every 1.2 s, eased in and out.
- **Found on Windows** and put right: the reader's tests read the samples
  in the system's encoding (now UTF-8, as the app does); a list long enough
  to scroll had its last column cut by its scroll bar, and its heading stood
  apart from its values (the heading is now the list's first row, held at
  its top).
- The wheel over a list zooms the canvas, as over the chip; scrolling a
  list with it waits until it is missed (the maintainer, 2026-10-05).

## Stage 3d, planned

Orbitals and densities drawn as surfaces. Agreed with the maintainer on
2026-10-05.

### The tools that make environments

- **Fetched when first needed, both of them.** uv and pixi are each
  downloaded the first time an environment needs it, the version and its
  hash pinned in Meno, under the network's consent for that environment.
  Neither is bundled: either alone does nothing without the network, and
  bundled, every update of Meno carried it again (uv was 37 MB of a 54 MB
  app).
- **uv** makes the environments PyPI fills, as now: the chemistry worker's
  and cclib's.
- **pixi** makes those that need conda-forge, which has builds PyPI has
  not - PySCF for Windows among them - from conda.anaconda.org (free of
  Anaconda's terms, which cover its own channels). A conda environment
  is started with its activation, as Windows needs for its libraries.

### Surfaces

- **A grid is a kind of value** a result can carry: an origin, three
  axes and the number of points along each, and a value at each point. A
  list's row can carry a surface, as one can carry a motion: chosen, Meno
  draws it.
- **Drawn by Meno.** The surface where the grid takes a value (marching
  cubes, worked out off the main thread), going over to another as the
  value changes. An orbital's two phases in two colours, a density's in
  one, seen through - a lobe behind another, of either phase, showing
  through it as it lies (since lane L11, 2026-10-11: before, the positive
  phase was laid over the negative wherever they crossed on the screen).
  A picture made of the molecule - copied or exported - shows the surface
  as the canvas does, and is as large as its lobes reach (before, pictures
  left surfaces out).
  The colours are the chemist's to choose in Settings;
  at first a muted blue and orange. The value is set by a slider under the
  list, the surface following it.
- **Asked for when wanted.** Any result, of whatever kind, can come as a
  promise: what it is, and a key to ask for it with. Meno asks the plugin
  for it when it is wanted - its row chosen - sending the output's text
  again, the plugin keeping nothing between. Saved, a molecule keeps the
  results it has been given and is showing; a promise not yet given is
  kept, with where its output was, to be asked for from there.

### Where grids come from

- **Cube files**, which the programs write themselves (Gaussian's cubegen,
  ORCA's orca_plot and others): read by a reader that comes with Meno - no
  download - under the same contract as the plugins, and as easily taken
  out. A cube's molecule comes with its grids as a list of surfaces.
- **The PySCF plugin** (Apache-2.0), in a pixi environment: orbitals and
  densities worked out on a grid from a molden file, or from an output
  that holds the basis set and the orbitals' coefficients - read by cclib,
  written as molden by cclib, worked out by PySCF - each grid a promise.
  No GPL library (iodata, gbasis).

### In order

1. **3d-1.** The tools fetched when first needed; pixi beside uv.
2. **3d-2.** Grids, promises, surfaces, the value's slider, the colours in
   Settings, and cube files.
3. **3d-3.** The PySCF plugin.

## Drawing style

- **Styles of the user's own** (the maintainer, 2026-10-15: "in both 2D and
  3D, I can't add new styles of my own"). *Save as style…*, under the
  presets in a workspace's Drawing style or Settings', keeps the style as
  it is set as one of the user's own, named, in Meno's settings - not in a
  workspace - and offered below the built-in presets in every workspace,
  marked *Your own*. A right-click on a style duplicates it into the user's
  own, exports it (*Export style…*, FILE-IO.md, *What a .meno holds*), and
  renames or deletes one of theirs; the built-in ones are only duplicated.
  A workspace drawn in an own style carries the whole of it
  (`StyleChoice.own`), so it opens the same where that style is not: there
  it is offered as *In this workspace*. An own style is known by "own-"
  and a random UUID, so that one carried from another computer is never
  taken for one made here; and where the workspace's copy is not the
  user's own of that id as it is now - changed or renamed since - it is a
  card of its own too, the one chosen, and picking or renaming the user's
  acts on theirs alone. Style files opened together are asked about in
  turn. Styles in 3D follow the same rules (*Styles in 3D*, *A workspace's
  styles in 3D*).

Planned on 2026-10-14 from the maintainer's decision, to be built in one
pull request (`agent/style-one-per-workspace`): L8 the change of style and
what it converts, hunter C the style's place and its card, hunter A the
molecules in 3D.

- **One style to a workspace.** The page's unit is the bond. A bond is 1.8
  units (`NOMINAL_BOND_LENGTH`) in every style, and the style says how long
  it prints (`bondLengthPt`), so a point is 1.8 / `bondLengthPt` units
  (`pointPx`): 0.125 in ACS 1996's 14.4 pt, more in a style of shorter
  bonds. Every structure in a workspace is drawn in its one style; no
  structure has a style of its own.
- **Fixed as the workspace is made.** A new workspace takes the style
  Settings has then, and keeps it; Settings' style is for new workspaces
  only. The fallback that let a workspace without a style follow Settings
  as it changed (`docStyle ?? drawingStyle`) goes: `style` is always set,
  in the document, the store and the saved file.
- **Settings changed while it is open: asked** (the maintainer,
  2026-10-19). A drawing style changed in Settings - another preset, or
  any value of it - or the 3D styles in their roles, while a workspace is
  open and not drawn in them, is offered to it by a question over its
  canvas, *Settings has a new style*, naming what differs: "Drawing: this
  workspace is drawn in ACS 1996; Settings now has RSC", "3D: this
  workspace shows Ball and stick and Space-filling; Settings now has …".
  *Apply to this workspace* (the default, Enter) takes them as one step to
  undo - the drawing style as a preset chosen in its card is, its bond
  eased in; its two looks as a slot's style is, its molecules eased over,
  its light its own; *Keep its style* - and Escape, or a press elsewhere -
  leaves it as it is. Asked in each workspace open, each its own answer,
  when it is in front - never in Settings itself, and never over a talk:
  it waits for the workspace to be in front after it. Asked once a
  change: kept, it is not asked again until Settings' styles change
  again. A workspace opened in a style of its own - someone else's, or
  saved in another - is never asked for that alone: only a change made in
  Settings while it is open asks (`styleOffer.ts`, `SettingsStyleAsk`).
- **Taken from its Styles card** (the maintainer, 2026-10-27). Wherever a
  workspace's styles differ from Settings' - its drawing style, or its 3D
  styles in their roles - its *Styles…* card shows *Use Settings' styles*
  under its words, coming and going eased as they differ or not. It does
  what *Apply to this workspace* does: those that differ taken as one step
  to undo, eased. A workspace opened in another style is offered it too:
  the card is opened to change its styles (`settingsDiffer`,
  `DocumentStylePanel`).
- **A change of style is one command,** from the canvas's Drawing style
  card. It sets the style and converts the page with it, so that every
  object on the page keeps its printed size and its place, and only the
  structures grow or shrink. With k = old bond pt / new bond pt:

  | On the page | Kept in units | How it converts |
  |---|---|---|
  | A structure in 2D: atoms joined by bonds, a stack's records as one | atoms' x, y | its middle (of its box) times k; its atoms keep their offsets from it, so it keeps its size in units and its bonds print at the new length. Bonds, abbreviations, brackets, ring circles and electron arrows go with its atoms |
  | A molecule in 3D | `at`, `turn` | bodies - molecules whose spheres (each its look's reach, about its place and height) touch or overlap, turned together or not - move by their middle times k, keeping their offsets, heights and turns; a molecule keeps its size in units (1.5 Å is a drawn bond in every style) |
  | A reaction arrow | x, y, length, corners' `across` | times k; its heads, weight and stroke are the style's as it is drawn |
  | A "+" | x, y | times k; its size is the style's |
  | Words | x, y, `width` | times k; their size in pt is kept - words given none, at the old style's labels' size, keep that as their own where the new style's labels differ |
  | A slide, a picture | x, y, w, h | times k; a picture's turn is kept |
  | A PDF | x, y; its own pages' places; `point` | times k, and the point its pages are laid at times k (below); ink on its pages is in its own points and kept |
  | A text's sheet on the page | `at`; `point` | times k, and its point times k |
  | A shape | x0, y0, x1, y1 | times k; its corners' radius and its line's width in pt are kept - a line as wide as the bonds' as wide as the new style's |
  | Ink | its strokes' points | x and y times k (not the pressure); its width in pt is kept |
  | A workflow step | x, y | times k |
  | A workflow set | its frame | fitted round what it holds once that has moved (`fitSets`) |
  | A print frame (later) | its frame | times k |

  What is given in points - words' sizes, shapes' weights, ink widths, a
  PDF's page sizes - is kept as it is: drawn at the new point, it prints
  as before. A structure's labels and lines are the style's own.
- **The page holds still on the screen.** The view follows every change of
  the bond's printed length - the command, its undo, its redo: the camera's
  place times k and its zoom divided by k. Slides, words and pictures stay
  where they are on the screen while the structures grow or shrink about
  their middles.
- **PDFs and texts at their own point.** A PDF's pages and a text's sheet
  were drawn at ACS 1996's point in every style (`POINT`, 1.8 / 14.4). Each
  now keeps the point it was laid at (`point`, units in a point: lib/pdf/layout
  `pointOf`): one put on the page takes the workspace's (`pointFor`), and a
  change of style multiplies it by k with the rest of the page, so a PDF
  prints at its own size in any style and keeps it through a change. Its
  icon, its name's room, the gaps between its pages and what is carried out
  of it (a picture, words) are laid at it too. A PDF or a text from before
  keeps none and stays at `POINT`, as large as it was.
- **One undo step.** The style and the converted page go together, in one
  edit ("drawing style"). A preset chosen is one step and does not jump:
  the new style is taken at once but its bond length eases from the old one
  over `DURATION.move` (`EASE`), each frame converting from the page as it
  was, coalesced, the preset itself set as the ease ends (the command
  centre, 2026-10-14). A slider in the card
  converts live at every tick, always from the page as it was when the drag
  began (the starting style to the current one, never tick upon tick, so no
  error builds up), and the ticks coalesce into one step as it is let go.
  Slides and words stay still while the structures change, with no jump on
  release; undo gives the page back exactly as it was.
- **Pasted from a workspace in another style.** A copy's record
  (`meno-structure`, still version 1) carries its style's bond in pt.
  Pasted where that differs, what it carries converts as above by k = its
  bond pt / this workspace's, about its middle, before it is put down: its
  structures keep their size in units, so they print at this workspace's
  bond, and words, shapes and pictures with them keep their size in pt. A
  record without it pastes as it is.
- **Structures can come closer.** In a style of longer bonds, the middles
  of structures come closer in units while the structures keep their size,
  so structures drawn close together may overlap after a change. Meno does
  not push them apart, which would be a jump; the chemist can, or undo.
- **Exports.** `exportPxPerWorld(style)` stays the style's bond at 96 px to
  the inch over 1.8. A unit prints `bondLengthPt` / 1.8 pt, so page objects
  export at their sizes in pt and structures at the style's bond: after a
  change, a slide or a picture exports as large as before, its structures
  at the new bond.
- **Office re-edit.** A structure placed in Word or PowerPoint keeps its
  record, now with its style. Opened from the document again, it opens in
  that style - not Settings' - so its picture comes back as it was. A
  record without a style opens in Settings' style, fixed into it then.
- **Files from before** (pre-alpha: no shims, the break noted).
  - A workspace saved without a style takes Settings' style as it is
    opened, kept from then on, without marking the tab changed. It looks
    different from when it was drawn if Settings has changed since.
  - A PDF or a text's sheet laid before keeps ACS 1996's point, so in a
    workspace of another style it prints as large as it did - not at its
    own size - until the style is changed and back, or it is laid again.
  - Copies made before carry no style and paste unconverted.
- **Magnified display, later.** A per-object display state (100% being true
  size, an "n%" mark, Back to 100%): a transform after the layout in 2D and
  after `solidOf` in 3D that never enters the document's units, Å readouts
  or writers. A change of style keeps each object's magnification: the
  conversion moves an object's middle and leaves its factor alone.
- **The functions.** `restyle.ts` (L8): `bondPtOf(style: StyleChoice)`, and
  `restyled(parts, k, about = { x: 0, y: 0 })`, which converts whatever
  page parts it is given - a whole document or a copy's parts, the fields
  of `WorkspaceDocument` that are there - and gives them back unchanged
  where k is 1. Molecules in 3D go through A's
  `restyled3d(molecules, k, about)`, called from it. `setDocumentStyle(doc,
  style)` (document.ts) converts by k = `bondPtOf(doc.style)` /
  `bondPtOf(style)`; the store's action keeps the document as a slider's
  drag began and converts from it at each tick (C).
- **Tested by** a change and back giving the same page (to 1e-9, where no
  molecules in 3D came to touch on the way: those then go back as one body;
  undo, a snapshot, is exact all the same); every
  page object's box in pt kept, and every structure's middle in pt kept and
  its size in units; undo exact; a slider's ticks converting from the
  start; a paste across styles; bodies in 3D kept together; page objects
  exporting at the same size.

## Magnified display

Planned on 2026-10-16 (agreed by the maintainer on 2026-10-14 as a special
state, for 2D and 3D alike; the command centre's defaults), and approved
with its three choices as proposed on 2026-10-16: the magnifications
below, a 3D molecule made from a magnified drawing taking its
magnification, and a selection's objects each about its own centre.
Molecules in 3D built first (`utils/magnified`), then structures in 2D.

**What it is.** A structure in 2D, or a molecule in 3D, may be *shown* larger
or smaller than it is - 100 % being its true size - without changing the
workspace's one style underneath. It brings back a bigger and a smaller
structure on one slide without mixing styles: the workspace's style still
says how long a bond is; the magnification says only how large this one
object is shown.

- **A display transform, per object.** It is held on the object, never in
  the style and never in k (the style change's factor, *Drawing style*):
  - a structure in 2D is held where it is shown - its atoms k times as far
    apart, about the middle of its box - and every atom of it says
    `magnified: k`, in the workspace's file too; it is laid out in the
    workspace's style with every length k times over (layoutStructures
    `magnifiedOptions`): lines, labels, wedges, marks and the gaps between
    them all scale together, as a zoomed copy of it would. (Planned at
    first as true places drawn through a transform; held as shown instead,
    with the command centre's agreement on 2026-10-16, so that the pointer,
    the selection, snapping and the page's boxes, which read where atoms
    are, need nothing new.) **All chemistry reads it at its true size**
    (lib/chem/magnified2d `atTrueSize`, in `writeMolfile`): MOL, SD and
    RXN files, a copy for another program, what a plugin or a job is
    given and so a workflow's inputs, the drawing a 3D structure rises
    from - a magnified drawing writes the very same MOL file as it does at
    100 %. Every structure says one magnification: an edit that leaves a
    structure saying several - two joined - gives it the one most of its
    atoms say;
  - a molecule in 3D carries `magnified: k`, applied after `solidOf`, about
    the molecule's own place: it is shown k times as large and stands k
    times as high (`poseOf`'s `scale`, `heightOf`, `reachOf`; on the canvas
    its turned group scaled, the lines round it as wide as it is shown, the
    widths in pixels of its highlights as they are). Its ångströms stay
    true - measurements, writers and Fit's units are untouched.
  Each kept with the object, in the workspace's file and in a copy.
- **Edited as at its true size.** What is drawn on a structure shown
  magnified - a bond, a chain, a ring - is drawn k times the style's bond
  long, as the rest of it (`bondLengthFrom`); what lays out by itself - a
  label drawn out, Clean-up, a group shown as a label - is done on the
  structure at its true size and shown as large again about the same
  middle (utils/trueSize `editAtTrueSize`): an edit at k is the same edit
  at 100 %, k times as large (tested, edit by edit). A drag moves it as it
  is shown. Joined to another structure, the one drawn from keeps its
  magnification and the other takes it; split, each part keeps it; pasted,
  it comes as large as it was copied. A stack's records share it.
- **What the page knows of it is what is shown**: hover, the selection's
  frame and handle, Fit, free places for what is opened or pasted, guides
  and snapping, a set round it, a slide over it - each from its shown box.
- **Exports follow what is shown**: pictures (PNG, SVG, the Office picture
  and its EMF), copies as pictures, a talk, a render *as the canvas draws
  it*. A structure file (MOL, SD, RXN, PDB, a plugin's writer) holds the
  structure as it is, at true size: magnification is not chemistry.
- **A style change keeps each object's magnification**: it is converted as
  the page is, its `about` moving with its structure, its k as it was.
- **Rising into 3D**, a magnified drawing's structure is made at its
  magnification, so it rises at the size it is shown.
- **No jumps** (*No abrupt changes*): a change of magnification is one step
  to undo - a drag along the mark's run of them one - and what is shown
  goes over to it eased, about `about` (a molecule's on a log scale, as the
  look's change is timed). A result set a molecule no longer fits as large
  is laid out again in the same step.

**How it is set (proposed).**
- In the right-click menu of a structure, a molecule in 3D, or a selection
  holding some: *Magnification* (saying how large it is shown now), which
  opens a row of 50 %, 75 %, 125 %, 150 %, 200 % and 300 %; and *Back to
  100 %* where it is not at 100 %. A selection's objects each take it,
  about their own centres.
- While one is not at 100 %, a small mark at its top right - *150 %* -
  shows on hover, while it is selected and while the mark is in use; a
  press on it opens the same choices and *Back to 100 %*, and a drag along
  it sets the magnification freely, 25 % to 400 % - doubling every 120
  pixels to the right, halving to the left, in whole percents - eased as
  it goes, one step to undo when let go.

**Built in one pull request, in two stages**: first molecules in 3D (the
transform after `solidOf`, the page's boxes, the menu and the mark, export),
then structures in 2D (a magnified structure drawn by the same layers in a
group scaled about its `about`, presses taken back through it, the page's
boxes, export). Tests at each: the transform and its inverse, editing
through it at the workspace's bond length, a style change keeping k, true
size in structure files, the shown size in pictures, undo.

## Drawing resolution

How finely the canvas is drawn: Settings, General, *Drawing resolution*
(the maintainer, 2026-10-17, from a comparison of the choices on 100 % and
150 % screens).
- **2×**: twice as many pixels each way as the canvas's size on the page,
  whatever the screen. The sharpest; on a screen that shows things once
  (100 %) the graphics card draws four times the screen's pixels.
- **Matching the screen** (the default since 2026-10-21, the maintainer; a
  choice saved before is kept, whichever it is): as finely as the screen itself shows things -
  once at 100 %, 1.25 at 125 %, 1.5 at 150 %, twice on a Retina screen -
  never finer than twice. Nothing is scaled between the canvas and the
  screen, so thin lines do not shimmer as the view moves; followed as the
  window goes to another screen.
- **1×**: once, whatever the screen: the lightest.

The comparison (2026-10-17), drawn and then shown on a screen as a
compositor shows it, against a drawing four times as fine: 1.25 times was
the least faithful on either screen; on a 100 % screen, 1.5 times was no
sharper than once and shimmered nearly twice as much as the view moved, a
3:2 scaling; on a 150 % screen, 1.5 times - its own - was sharp and still.
Hence the screen's own as the middle choice rather than a number.

The choice applies at once. Everything on the canvas that depends on its
pixels reads them as it is drawn: PDF pages' tiles, a text's or a
Markdown sheet's letters, molecules in 3D (how round their balls are drawn,
their shade and their key light). A line's least width, picking and the
pointer's reach are in the screen's own units and do not change. Pictures
made of the drawing - exported, copied, rendered, a talk's - are drawn at
their own sizes, whichever is chosen.

## Styles in 3D

Built in lane L5 on 2026-10-10. The maintainer's ruling: a molecule in 3D
has two looks, a thin one and a thick one, and goes from one to the other
in a single step - seeing a molecule as ball and stick and as
space-filling side by side is better science than either alone.

- **A list of styles.** Ball and stick (the 3D viewer's look, Meno's
  first), Glossy, Outlined, Print, Pastel, Model kit, Sticks and
  Space-filling. Each is set on its own in Settings, under Molecules in
  3D, every setting in every style (none is hidden or fixed by a style;
  one another setting makes moot is greyed out while it does): whether it
  draws balls and sticks, sticks alone or space-filling, ball size, bond thickness, its sticks in one colour or
  coloured by their atoms, its lines, the surface, whether the hydrogens
  on carbon are shown, and its atoms' colours. Changes are kept per style,
  marked, and taken back one at a time or all at once.
- **Lines** (the maintainer, 2026-10-15: "its mark is the lines"). A
  style may draw a thin line round every ball and every stick - in the
  molecule's own units (the maintainer, 2026-10-15: "the outline's
  thickness to change with zoom"), set in ångströms and shown in Settings
  in picometres, so that it grows and shrinks with the molecule as the
  balls and sticks do, never thinner on the screen than half a pixel, so
  that far out it does not shimmer away (`lineWidth`, `LINE_LEAST_PX`) -
  and in a colour of its own - and fade
  what lies further back in a molecule toward the page, from none to
  strong, so that its front reads first: nothing at the front, growing
  smoothly toward the back, at most 70% of the way to the page. The line
  is each ball and stick drawn again, only its back, pushed out along its
  normal by the line's width (utils/outlineMaterial): it shows round every
  edge, and where one part passes in front of another. It shares the
  balls' and sticks' own instances, so it costs the GPU their triangles
  again and the CPU nothing however many there are - measured on 10 648
  atoms and 30 492 bonds, 14.0 ms a frame with no line and 16.4 ms with
  one, its balls drawn coarser past 2000 atoms (19.7 ms as smooth as the
  balls). A pass over the finished picture finding its edges was set
  aside: it would draw lines round the page's drawing as well, and needs
  the scene drawn again for its normals.
- **Lines on the balls** (the maintainer, 2026-10-15: "the cross lines").
  A style may draw great circles on its balls - two or three, crossing as
  a globe's equator and meridians do, about the molecule's own axes, so
  that they turn with it and lie the same way on every atom - on every
  atom's ball, every one's but hydrogen's, or carbon's alone, in the same
  units as the outline - so the two keep their proportion at any zoom -
  and in a colour of their own. They are worked out
  in the ball's shader from its normal, which in the molecule's frame is
  the ball's own (a ball is never turned on its own): no geometry, and
  nothing on the CPU for each atom.
- **Ball sizes** (the maintainer, 2026-10-15). Ball and stick's balls
  are a fifth of each atom's van der Waals size, Outlined's 15%, and the
  other balls and sticks' - Glossy, Print, Pastel and Model kit - 18%.
- **Outlined.** Glossy balls - hydrogen's small - and thin near-black
  sticks, each ball and stick drawn round with a near-black line 1.5 pm
  wide, the back fading by half, in the Bright colours. Its lines on the
  balls are None (the maintainer, 2026-10-15), to be turned on in
  Settings: three, on every atom, 1 pm wide, as its settings keep them. At caffeine's fit in a window
  1280 pixels wide, a picometre is about a pixel: the widths were chosen
  to look there as they did when they were set in pixels.
- **Print.** Matt balls in Greys, black sticks, a black line 2 pm wide
  round each - a little bolder than Outlined's - and the back fading: for figures printed in black and white.
- **Pastel.** Soft matt balls in the Pastel colours, light grey sticks,
  the hollows gently shaded.
- **Model kit.** Glossy plastic balls in the Bright colours and thick
  sticks, each half in its atom's colour.
- **Sticks.** Sticks alone: each atom a ball exactly as thick as its
  sticks, so that they join smoothly, each half of a stick in its atom's
  colour. Its ball size is moot, and shown faint. Picked, measured and
  drawn in pictures as balls and sticks are.
- **Bond ends** (the maintainer, 2026-10-15). Where a double or triple
  bond ends at a lone atom - nothing else joins it - whose ball is
  thinner than the bond's lines reach, those lines' ends would stick out
  past it: in practice, sticks alone. Each style chooses how they end,
  *Double bond ends* and *Triple bond ends*, each one of:
  - *Curve* (Sticks' own): the lines run straight and side by side till
    as far short of the atom as they stand off the bond's axis, then turn
    round there as one tube - a half circle centred on the axis, its apex
    on the atom - as thick throughout, with no ball; a triple bond's two
    outer lines turn round so, its middle one running straight in, its
    end inside the turn. Each such stick is bent in its vertex shader
    (utils/stickBend): its rings swept round square to the curve, so that
    it stays as thick; its shading, its colours' halves, the line round it
    and its highlight follow the curve. Pictures draw it the same; a render
    plugin is given it as straight pieces along it.
  - *Joint*: the lines as they are, the atom's ball as large as takes all
    their ends in.
  - *Main stick*: one full stick on the axis, the others thinner beside it
    and short of both atoms.
  - *Fork*: each line from where it stands at the other atom straight to
    the lone atom's centre.
  - *Plain*: as they always were.

  The setting is faint where a style's balls cover the ends. **Hidden ends
  cost nothing** (the maintainer: "don't make it heavier for things that
  normally can't be seen"): for a style whose ends are Plain - every
  built-in style but Sticks - or whose balls take every such end in, no
  end is worked out and nothing is drawn apart. The sticks that bend are drawn apart from the others, in a
  material of their own and with rings close together toward their ends,
  so that straight sticks never pay for the bending: measured on 12 170
  atoms and 33 536 sticks (a 22-cube grid with 1 739 lone oxygens on double
  bonds) in ball and stick, 12.1 ms a frame before and 12.1-12.2 ms after,
  and the bond lines worked out in 9 ms either way.
- **Colour sets** (the maintainer, 2026-10-15: "each style decides a
  colour set"). A style draws its atoms in one set of element colours,
  chosen under it in Settings: *Jmol* - Jmol's default element colours
  (jmol.sourceforge.net, *Jmol Colors*; lib/chem/elements.ts), Meno's
  from its first release and its own styles' - *Bright*, Outlined's:
  carbon a mid grey, oxygen a bright red, sulfur yellow, fluorine and
  chlorine light green, the alkali metals lavender, the others as Jmol's -
  and *Greys*, each element a grey as light as its Jmol colour (its
  relative luminance), for figures printed in black and white - and
  *Pastel*, each element's Jmol colour taken two fifths of the way to
  white. Every set gives each of the 118 elements a colour; darmstadtium
  to oganesson (110 to 118) are a light grey (#cccccc, Pastel's paler) in
  every set. A style's sticks coloured by their atoms take each half's
  colour from its atom.
- **Atom colours** (the maintainer, 2026-10-16: every element, not a fixed
  few). Over its colour set, a style can give any element a colour of its
  own, under *Atom colours* in Settings: the periodic table of all 118, as
  the IUPAC's table lays it out (18 groups; group 3 of periods 6 and 7
  holding the lanthanoids' and the actinoids' places, the two series in
  rows of 15 below), each cell filled with the element's colour as the
  style draws it, its symbol in black or white, whichever reads more
  (lib/chem/periodicTable, `inkOn`); and the elements most drawn - H, C,
  N, O, F, P, S, Cl, Br, I, B, Si - in a row above it. A click on a cell
  opens the colour picker. A changed cell is ringed in the accent; it is
  set back to the colour set's from its right-click menu, or from the line
  under the table, which names the element last chosen (*Ruthenium (Ru,
  44)*, its colour) - and all at once from *Back to Jmol's colours (n)*
  beside the heading. Where the column is narrow, the table scrolls inside
  its own box; the page does not.
- **Multiple bonds** (the maintainer, 2026-10-15). A style draws a double
  or triple bond as two or three thinner lines side by side, or as one
  stick, as thick as a single bond - Outlined's, as its reference draws
  them. With one stick, the bond ends are moot, and shown faint. The
  change is eased: the side lines go into the middle one.
- **Settings' page** (the maintainer, 2026-10-15). At the top, two slots,
  Primary and Secondary, each with its molecule drawn live and turnable;
  below them every other style, built in and the user's own, each with a
  still picture (drawn once, a frame apart, all with one renderer - a
  context for each took the live ones' away). A style dragged onto a slot
  takes it, the one there going back to the list; one slot's dragged onto
  the other, the two change places - the card following the pointer, and
  each card going to its new place eased, not jumping. A slot's molecule
  is turned by a drag that begins on its atoms or bonds, the pointer the
  turning one only there; a drag anywhere else on the card moves the card
  (the maintainer, 2026-10-28: a drag on the card had always turned its
  molecule, and only its name moved it). A slot's molecule turns by itself
  all the time, slowly - a turn in about half a minute, about the screen's
  upright - but while it is turned by hand or coasting from it, taking up
  its own turn again eased after; its own turn is drawn 30 times a second,
  on every other of the screen's frames at 60 Hz, every slot in the same
  frame, and turning it - by hand or by itself - draws only the frame,
  nothing round it; nothing is drawn for it while the page is out of sight,
  and with no slot seen, nothing keeps time for it either. A card carried has the hand's pointer all the way,
  over the other slot's molecule too; the window left, or Escape, puts it
  back where it came from. A press, or Enter,
  sets a style below; a right-click, or the menu key, offers Use as
  primary, Use as secondary, Duplicate, Export style… - and, for the user's
  own, Rename and Delete. A built-in style's changes are kept apart,
  marked, and taken back by Reset; the user's own is set as a whole.
- **A workspace's styles in 3D** (the maintainer, 2026-10-16: as a
  workspace carries its drawing style). A workspace is drawn in its own
  primary and secondary, fixed as it is made - Settings' then, each whole:
  a built-in style with what was changed of it, or one of the user's own -
  and from then on changed only from it: Settings' are for new workspaces
  (lib/chem/workspaceStyle3d). Its file carries them whole (FILE-IO.md,
  *The workspace file*), so it opens the same on any computer. A
  right-click on empty space, *Styles…*, opens the workspace's styles: its
  drawing style (*Drawing*), and under *3D* the same slots and cards as
  Settings' page - its two in the slots, Settings' styles below, and one
  it carries that this computer's Settings has none like (made on another
  computer, or changed in Settings since) on a card of its own, *In this
  workspace*. A style dragged onto a slot, or given a role from its menu,
  becomes the workspace's as it is now, whole - one step to undo, a result
  set its molecules no longer fit laid out again in the same step - and
  the molecules go over to it: each number and colour of the looks eased
  from what it was (ball size, bond thickness, lines, atoms' colours), the
  rest at once, as a change of drawing style eases its bond (at once past
  20 000 atoms). Duplicate copies a style - a carried one too - into the
  user's own; Rename acts on the user's style alone; nothing is deleted
  from here. **What travels with it** (the lane's call, 2026-10-16): what
  changes the picture - the light from all round and from above right,
  the shadows, an orbital's colours and how ribbons are coloured, set
  under the cards, one step each; how a drag turns a molecule and how it
  coasts, and how a very large drawing is drawn lighter, are the
  viewer's, and stay in Settings. Talks, pictures and files exported, and
  a render asked for *as the canvas draws it* follow the workspace's
  styles. A workspace saved before they were carried opens in Settings'
  as they are then, and keeps them.
- **Two roles.** One style is the primary - every molecule's look to
  begin with - and one the secondary. Each style's card in Settings says
  which it is; giving a style the other's role swaps the two, so the
  secondary is never the primary again.
- **What they share.** The light (from all round and from above right),
  how a molecule turns and coasts, and an orbital's colours are set once
  for all styles: lights light the whole scene, so two molecules side by
  side cannot be lit two ways. Glossy is told apart by its surface and its
  grey bonds.
- **A molecule holds its role, not a style.** `look: "secondary"` in the
  document, unset for the primary: a style changed in Settings changes
  every molecule shown in it. Copies and the saved workspace carry it.
- **One step.** A double-click on a molecule switches it to its other
  look; with others selected with it, they all go to the clicked one's
  other look, in one undo step. What the double-click's first click chose
  is let go again. A double-click on a measurement's value is the
  measurement's. The right-click menu's icon row has the same switch,
  named after the style it goes to and drawn as balls or as spheres.
- **No jump.** Going over, each atom's ball grows or shrinks between its
  two radii, the bonds thicken or give way, the bond colour and the
  surface's gloss go over, and the molecule rises or sinks to stand as
  high as it now reaches - all on one 80 ms time constant. So do the
  atoms' colours, the lines' width and colour, the depth fade and the
  sticks' colouring, as the look or a setting changes.
- **A shader that does not compile.** Meno's own shaders - lines on the
  balls, the line round them, sticks that bend - each name themselves
  (utils/menoShader). One that a graphics card will not compile is said in
  Meno's log, with its name and the card's own words for what was wrong
  (nothing of the document), and from then on is drawn as its plain
  three.js material: a molecule loses a line or a shade, never its atoms.
  A test reads each of them for a word GLSL keeps back - the one that
  once made every ball vanish was `half` - and for brackets that do not
  close.
- **Pictures as the canvas.** A copied or exported picture of a molecule
  in 3D draws its style's colours, lines and depth fade as the canvas
  does - its lines in proportion to the molecule at any size, being in
  its units, and never thinner than half a pixel of the screen (a picture
  at 300 dpi, 300/96 of its own) - and a render plugin is given its atoms'
  colours.
- **Hydrogens on carbon, hidden only past a warning** (the maintainer's
  ruling and wording, 2026-10-10). Many synthetic chemists like them out
  of the way; but a molecule without them looks smaller, flatter and more
  open than it is, so a picture of it misleads. A style hides them only
  when set to in Settings, never by default, and only after a box in the
  way says so in strong words: a box ticked to say the chemist
  understands, before *Hide hydrogens anyway* can be pressed; *Keep
  hydrogens* is what Enter and Escape give. Only hydrogens on carbon go:
  those on a heteroatom take part in hydrogen bonds and in reactions.
  Every molecule drawn so says *C–H hidden* over it, on the canvas and in
  every picture made of it (SVG, PNG, EMF), for as long as it is. On the
  canvas it is not one of the page's chips, which go when their words are
  too small to read: it stays at any zoom, between three quarters and one
  and a half times its size, and folds away as the molecule goes over to a
  look that keeps the hydrogens.
- **Not read from before.** A settings file from before keeps none of
  its 3D look (pre-alpha: no migration).

## Depth in 3D

Built in lane L11 on 2026-10-11, the maintainer choosing each way from
pictures of it beside the others: a molecule's shape should read at a
glance, in the canvas where chemists look at molecules all day, without
slowing it - and in the pictures made of it.

- **Hollows shaded.** Where atoms crowd round, less of the light from all
  round reaches: grooves and pockets darker, a space-filling molecule's
  shape read in depth. Worked out for each atom once for each shape the
  molecule takes - a frame, in a look - never as it turns, which changes
  nothing of it: from each point of its ball a ray goes straight out, and
  how soon another atom stops it, within three ångströms, says how open
  that way is. Some dozens of rays are summed into nine numbers an atom
  (spherical harmonics to the second band, with the cosine every point
  of a surface weighs the sky above it with folded in), which the atom's
  own shading reads at each point; a bond has a number at each end.
  Worked out off the main thread, gone over to as it comes, and as the
  frame or the look changes; drawn at no cost a frame. How deep it is,
  is each style's (*Shade in hollows*): space-filling the deepest. The
  light from all round is taken by it, and a little of the light from
  above right. Chosen over shading worked out on the screen each frame,
  which would take the whole canvas - the page too - through another
  pass; atoms of other
  molecules, and ribbons, do not shade it.
- **Shadows.** The light from above right casts them, on the molecule and
  on others beside it, never on the page (the drawings and words on it
  stay as they are): soft-edged, a quarter of an ångström across, and
  only part of the way dark (*Shadows*, shared by all styles, as the
  lights are). Cast by balls and sticks coarser than those drawn, which
  stand where they do and draw nothing themselves; cast again only when a
  molecule moves, turns or changes - fitted round every molecule, so
  that panning and zooming leave it, until that would make it coarser
  than the screen's pixels, when it is fitted round what is in view.
- **Shade worked out on the screen** (lane L11, 2026-10-11, the
  maintainer finding it the prettier of the two): each style's *Shade in
  hollows* is *None*, *Per atom* (the first) or *Screen-space* - *None*
  the one way to have no shade, *How deep* beside it greyed out while it
  is. On the screen, the shade is three.js's GTAO (ground-truth ambient
  occlusion, worked out from the depth and the normals of what is seen)
  smoothed by its Poisson denoise: molecules shade one another too, and
  the creases where balls meet darken; worked out each frame, at half the
  canvas's resolution, over the molecules alone - their balls, sticks and
  ribbons drawn once more into a pass of their own - and laid over them
  by a sheet multiplying what is under it, one where no molecule is, so
  the page is drawn exactly as it was; close up, this shade is finely
  grained. A molecule shaded per atom still
  hides what is behind it in that pass, its own weight none. Going over to it,
  or from it, the one shade gives way to the other.
- **Very large drawings** (the maintainer's choice, 2026-10-11): past
  twenty thousand atoms on the canvas, drawn lighter - no shadows, and
  hollows shaded per atom where a style shades them on the screen - as
  casting shadows again and shading the screen as such a drawing turns
  cost more than turning it can spare. Said once on the canvas, in a
  notice in the corner (*Many atoms on the canvas*) with *Keep them*,
  which sets *Very large drawings* (Settings, every style) to *As set*
  for good. A picture made of it has its shade and shadows all the same.
  The atoms counted are those drawn and every atom of the residues
  ribbons stand for (the maintainer's choice, 2026-10-13), so a large
  protein in ribbons is drawn lighter as it would be as atoms; those a
  look leaves out otherwise (hydrogens on carbon, water) are not.
  Its balls are drawn with as many segments as their size on the screen
  wants (the maintainer, 2026-10-13): the style's 32 from about 40 pixels
  across, down to 8 under about 8 - within about 0.3 of a pixel of a
  circle at each, so that the change is not seen; more at once as balls
  grow, fewer once the zoom has settled (`utils/largeDrawing`
  `ballSegmentsFor`). A box of 33 000 waters (100 000 atoms) turned at
  183 ms a frame with 32, and turns at 33 ms.
- **In pictures too.** A picture of molecules in 3D shades their hollows
  and casts their shadows as the canvas does, with every ball and stick,
  in a finer shadow map, however many atoms; shaded on the screen, at the
  picture's own resolution, each tile drawn with a margin as wide as the
  shade looks round (cut off again), so that the tiles meet unseen.
- **No jump.** A change of any of them in Settings is gone over to; so is
  a frame's shade, or a look's, or the change a very large drawing makes.
- **Meno's own.** A render made elsewhere (Blender) finds its own hollows
  and shadows: neither setting is written into a scene handed over.
- **What it costs** (a MacBook Air M4, Chrome, a canvas 2796 by 1796
  pixels, the median frame turning a molecule, before and with both):
  taxol (113 atoms) 9.2 and 12.1 ms as ball and stick, 5.8 and 9.2
  space-filling; 1STP (1001 atoms) 12.5 and 14.4, space-filling 13.5 and
  16.6. Four hundred cholesterols as one molecule (29,600 atoms): 48 and
  49 ms as ball and stick, 51 and 52 space-filling - the hollows' shade
  costing nothing, the shadows, which would cost 22 to 44 ms more, faded
  there. Panning casts no shadow again.

## Editing in 3D

Built in lane L5 on 2026-10-10, as proposed to the maintainer and agreed:
a molecule in 3D is edited as a quantum-chemistry program's builder edits
one, by setting a distance, an angle or a torsion angle to a value. Only
its shape changes; what it is made of stays the drawing's business (draw
it, then *Make again*). Holding values fixed while a force field tidies
the rest is for later, through a plugin.

- **Picking.** As before: atoms (or bonds) clicked in order choose what is
  measured. With two, three or four chosen, the right-click menu has *Set
  distance…*, *Set angle…* or *Set torsion angle…* beside *Measure …*: it
  measures them, in the order chosen, and opens the value to be typed. A
  measurement right-clicked has the same item.
- **The value.** A double-click on a measurement's value opens it to type
  a number (a comma and a true minus are read too): Enter sets it, Escape
  or leaving the field lets it go. A drag across the value sets it as the
  pointer goes - a hundredth of an ångström, or half a degree, a pixel -
  in one undo step; the pointer turns to the sideways one over it.
  Distances go from 0.5 to 20 Å, angles from 1 to 179°, and a torsion
  angle goes round (IUPAC's sign, as it is measured).
- **What moves.** The side of the last atom chosen - for a torsion angle,
  of the third - cut off at the bond before it: along the bond for a
  distance, about the middle atom in the three atoms' plane for an angle,
  about the middle bond for a torsion angle. Where that bond is in a ring,
  and cutting it parts nothing, the last atom moves with only what hangs on
  it alone (a methyl's hydrogens); a torsion angle about a ring's bond is
  not offered. Atoms bonded to none of the others (a complex's two
  molecules) take their whole piece with them. Pointing at a value lights
  the atoms setting it would move, as does dragging it.
- **Which frame.** The frame shown, with the bonds that frame has.
- **Results are never edited.** A conformer set, a trajectory, what a
  calculation or a step gave, or a molecule whose file gives its energy is
  a result, and an edited result is no longer that result. The first edit
  of one makes a copy of the frame shown, beside it (out of any set it
  would fall in) and turned as it is: its own molecule, with no other
  frames, energies, populations, numbers or calculation, its drawing,
  look and measurements kept, saying *Edited from conformer 7* (or *frame
  12*, or the output's name) under it. A drag that began on the result
  goes on editing the copy, and the copy and the drag are one undo step.
  A molecule of its own is edited in place.
- **The copy is seen splitting off** (the maintainer, 2026-10-15). It
  starts over the result, the same shape and turned the same, and glides
  out to its place as the value set goes over from the old to the new -
  0.45 s, longer where its place is far, never faster than 14 bond
  lengths a second, at most 1.1 s. Where its place is out of view, the
  view glides as far as shows it and the result - or, where both do not
  fit, the copy - the zoom kept. Once there it is lit a moment, as
  anything just put down. Undone, it slides back into the result and is
  gone, and the view goes back where it was, unless it has been moved
  since; a redo splits it off again.
- **Stereo labels follow.** A centre turned inside out has its R and S
  swapped, and a double bond turned past square its E and Z (the
  priorities round them are as they were). The drawing is not told: a 3D
  turned to the other configuration no longer matches it, which the link
  to the drawing does not yet say.
- **Found on the way.** The measurements' values are in the page's HTML
  layer (the one cut off where the column begins) since the column came;
  the molecules looked for them where the canvas's events are, so the
  value under the pointer was never found - no highlight, no menu, no
  keeping values apart. They now look in that layer.

## Atom numbers

Asked for by the maintainer on 2026-10-17: a molecule in 3D can show each
atom's number on its ball. Hover alone showed it before. The number is on
the atom, never beside it: with many atoms, a number set beside its atom,
as R and S are, cannot be told from its neighbours'.

- **What is shown.** The right-click menu has *Show atom numbers* and
  *Hide atom numbers*, beside R/S, and acts as that does: on the molecule
  right-clicked, or on the atoms chosen in it, or on the selection there.
  Right-clicked on an atom with none chosen, the menu also has *Show this
  atom's number* (or *Hide*), for that atom alone. A molecule keeps which
  atoms show their numbers: saved with the workspace and carried by a copy,
  each change one undo step.
- **The kinds.** *Atom order*, the default, numbers the atoms from 1 in
  the molecule's own order - as calculations number them, and as files
  are written and read. *Atom map* shows each atom's atom-map number,
  where a reaction's map gives it one (docs/ATOM-MAPPING.md). Where a molecule
  showing numbers has both, the menu offers both, the one shown ticked.
  More kinds go in one list (`ATOM_NUMBER_KINDS`, utils/atomNumbers).
- **How they are drawn.** In the balls' own shader (utils/occlusionMaterial,
  `withBallNumbers`), from a picture of the digits 0 to 9: upright and
  facing the viewer whichever way the molecule is turned, so that they
  never turn with it nor shake. Each is sized to its ball - 0.78 of its
  radius high, at most 0.95 Å, and narrower when it has more digits - in
  dark ink on a light ball and white on a dark one, whatever the style's
  colours. They are drawn flat over the ball, its shading under them and
  never on them, so that they read as well in its shade as in its light
  (the maintainer's choice, 2026-10-17, of two tried by hand: the other
  printed them on the sphere, bent round it and lit with it, and its white
  ink went grey on a dark ball's shaded side).
- **Where on the ball.** In the largest part of the ball not hidden behind
  another ball or a stick, as it is seen now - its middle, where the whole
  ball is seen (`numberPlaces`). Where that part is too small, the number
  is drawn smaller, and not at all under half its size. While the molecule
  turns, a number keeps its place for as long as it still fits there, and
  glides to a new one rather than hopping. Past 600 atoms every number is
  set in its ball's middle.
- **Too small to read.** A number whose digits would be under 6 pixels
  high on the screen is not drawn, so that, zooming out, the hydrogens'
  go first. Numbers come and go eased (0.08 s), each on its own.
- **Pictures.** A picture of the molecule, or an export, shows the numbers
  it shows, drawn as the canvas draws them (render3d) - on its balls, or in
  Sticks where the sticks meet - with the 6 pixels counted in the picture's
  own pixels: a picture is drawn at its size in print, so 6 of the canvas's
  pixels would there be some 1.6 mm, and would leave out nearly every
  number (2026-10-21).
- **In 2D.** A drawing shows atom-map numbers, small beside each atom,
  where its reaction arrow's map is shown (*Show atom map* on the arrow's
  menu; lib/chem/layout2d `atomNotes`). The 3D menu's words follow it:
  *Show atom numbers*, and *Atom map* for that kind.

## Ribbons

Built in lane L5 on 2026-10-10, as proposed to the maintainer and agreed:
a protein's or a nucleic acid's chains drawn as ribbons, from what the PDB
entry itself says - written from the wwPDB's format (v3.3), as every PDB
reading in Meno is.

- **Read.** HELIX and SHEET records (Secondary Structure Section), every
  field kept (`lib/chem/pdb.ts`). Each atom's name and residue are kept
  on the molecule in 3D with each residue's secondary structure
  (`lib/chem/biopolymer.ts`): a helix's or a strand's residues are those
  from its first to its last, as the chain lists them. Meno does not work
  secondary structure out itself: an entry without HELIX or SHEET records
  is drawn as a tube all along (a plugin could assign it, later).
- **The chains.** A run is consecutive residues of one chain whose
  backbone atoms - a protein's alpha carbon (named CA, a carbon: calcium
  is named CA too), a nucleic acid's phosphorus - stand near enough (4.5
  and 8.5 Å); further apart, the chain is broken there. A lone residue is
  drawn as its atoms.
- **The ribbon** (`utils/ribbon.ts`). A smooth curve along a run's
  backbone atoms - a cubic B-spline they are the control points of, so a
  helix winds smoothly within its alpha carbons rather than corner to
  corner through them; round it a band, its face turned as each peptide's plane
  is (its carbonyl oxygen says which way, each turned as the one before so
  it never flips): flat and 1.6 Å wide through a helix, so it winds round
  the helix's axis; 1.7 Å through a strand, ending in an arrowhead to its
  C-terminal end; a 0.5 Å tube elsewhere, and all along a nucleic acid.
- **Colour.** By helix and strand (muted rose and yellow, the rest grey),
  by chain, or along the sequence from blue to red: Settings, Molecules in
  3D, *Every style*, *Ribbons*.
- **With the styles.** Each style says how it draws a PDB entry's chains:
  as ribbons - what is bound to them (ligands, ions) as atoms, with the
  side chains of the residues within 4.5 Å of them, drawn from their alpha
  carbons, so that what holds a ligand shows; water left out - or every
  atom. Ball and stick and Glossy draw ribbons;
  Space-filling every atom, so a double-click goes from the fold to the
  protein's surface and its pockets, and back. Going over, the ribbon
  shrinks to its line as the atoms grow, and back.
- **Water.** Water is a residue named HOH or DOD, as the wwPDB's Chemical
  Component Dictionary names water and heavy water - or one named as a
  molecular dynamics program writes water in a PDB file, where its atoms
  are a water's (one oxygen, otherwise at most two hydrogens; a TIP4P or
  TIP5P model's massless sites have no element and are not read): SOL,
  GROMACS's (its reference manual, *Topology file formats*:
  https://manual.gromacs.org/current/reference-manual/topologies/topology-file-formats.html;
  its `share/top/residuetypes.dat`); WAT, Amber's, as tleap writes it (its
  tutorial *Adding Water and Ions with tleap*:
  https://ambermd.org/tutorials/advanced/tutorial8/loop4.php;
  `residuetypes.dat`); and TIP, CHARMM's TIP3 as a PDB file's residue
  name (columns 18-20) reads it, and its TIP4 and TIP5 (CHARMM's *io*
  documentation: https://academiccharmm.org/documentation/version/c48b2/io;
  `residuetypes.dat`). The atoms are asked as well because SOL is also a
  dictionary component, L-sorbose. Names that are components and no
  program documents as water are never water: T3P (thymidine
  3'-phosphate), SPC, T4P, T5P, OHH and T3H (all in
  `residuetypes.dat`, all components: https://www.rcsb.org/ligand/T3P and
  so on); nor H2O, which no program's documentation gives (the maintainer,
  2026-10-13). A solvated frame of streptavidin (1STP in 3 778 waters)
  draws the same 103 atoms with its water named HOH, SOL, WAT or TIP3.
- **Pointing.** A ribbon lights its outline as a molecule's does; pointed
  at, a residue says its name, number and chain. A click on a ribbon
  chooses the residue's backbone atom, which can be measured.
- **Pictures.** An exported picture draws the ribbons as the canvas does
  (the bitmap); where there is no WebGL, as sticks along each ribbon.
  NMR models and trajectories: the ribbon follows each frame.

## Stacks

Asked for by the maintainer on 2026-10-12: many molecules opened from one
file are shown the way a molecule's frames are, one at a time.

- **What makes one.** A file that brings several molecules in 3D - an SD
  file's 3D records, a PDB entry's models of different atoms - opened,
  dropped or pasted as a file. They stand in one place, where the first
  stood in a row before, as a stack of their own (`Molecule3D.stack`,
  `utils/stacks.ts`), numbered after the document's own stacks. A file of
  one molecule, a calculation's output (one molecule and its frames) and a
  workflow's results are no stack. One pasted out of its stack, or left
  alone in it as the rest are deleted, is a molecule of its own.
- **One shown.** The stack shows one molecule. Its chip, just below it,
  says which of how many and the record's title where its file gives one
  (*3 / 60  aspirin*: an SD record's first line, kept on the molecule as
  `title`) and, clicked, is a slider
  through them, as a molecule's frames' chip is (`StackChip3D`). It is the
  stack's chip, not its molecules', so a drag along it goes on through the
  stack. Which one is shown is the view's (`stacksShown`), as a frame is,
  not an undo step. Workspace files keep it, as they keep frames.
- **Going over.** The molecule let go of comes towards the viewer, larger
  and fading out of sight, while the next rises from behind, smaller at
  first, fading in: 0.42 s, eased. Gone through quickly, only the last two
  let go of are still drawn as they go. The next is turned as the one let
  go of was, so that each is seen against the last as it was.
- **What it is to the rest.** What is out of sight is not drawn, not under
  the pointer, not taken by a box or a lasso, and not taken by Select all.
  Selected, the one shown is what is copied, cut or deleted. The one shown
  moved, the stack moves with it: it stands in one place.
- **A grid.** *Lay out as a grid*, on the molecule's menu, lays the stack's
  molecules out where it stood, in rows about as many as its columns, each
  cell as wide as the widest molecule and a bond's room between: every one
  shown, each a molecule as any other, one undo step. *Stack again*, on any
  of them, stacks them again where the grid was, that one shown.
- **Saved.** Each molecule says its stack and whether it is laid out as a
  grid; the one a stack shows says so.

### Stacks of drawings

Asked for by the maintainer on 2026-10-12, after the stacks of molecules:
a file's several records drawn flat - an SD file's 2D records - stack the
same way.

- **What makes one.** A file read as several records drawn flat (its
  reader says each record's atoms and its title: `StructureRead.records`).
  Each record's atoms say their stack, their record and its title
  (`Atom.stack`), and every record stands where the drawing's middle was;
  the file is centred on the first. Added to a canvas, a stack is numbered
  after the document's own. One record pasted out of its stack is a
  drawing of its own.
- **One shown.** The stack shows one record, with the chip a stack of
  molecules has (`StackChips2D`): which of how many and the title, and,
  clicked, a slider. Which is shown is the view's
  (`recordsShown`), not an undo step.
- **What is drawn and what is kept.** The canvas works on the drawing as
  shown: the store's `model` is the records shown and the rest, made from
  the document's whole drawing (`fullModel`), so drawing, the pointer, a
  box, Select all, Clean-up and the keys only ever meet what is in sight.
  Every edit goes to the document by atom and bond ids; nothing writes the
  store's `model` back, which would drop the records out of sight. Save,
  Export and a document's link carry the whole drawing, the record each
  stack shows marked (`carriedDrawing`).
- **Edits keep it whole** (the document's `settle`, `settledRecords`). An
  atom drawn onto a record - bonded to it, however far along - is of that
  record; records bonded together become one. A stack left with one record
  is that record alone, and one whose record shown is deleted shows its
  first. The record shown moved whole, every atom alike, takes its stack
  with it.
- **Going over.** As a stack of molecules goes over: the record let go of
  grows a little as it fades, the next comes up from smaller into view,
  0.42 s, eased (`StackSwap2D`). Each is drawn on a layer of its own in the
  drawing's style, and the drawing draws the next once it is there. The
  record shown is kept ready on that layer, out of sight, so its labels are
  set when it goes.
- **A grid.** *Lay out as a grid* on a record's menu lays the records out
  round their middle, in rows about as many as its columns, each cell as
  wide as the widest record and as tall as the tallest, two bonds' room
  between; the records come out of the stack to their places. *Stack again*
  stacks them where the grid stood, the record chosen shown; the others
  fade where they stood.
- **Out of the canvas.** A picture shows the record shown. An SD export
  writes every record as a record of its own, titled as its file titled
  it; MOL and RXN exports write the record shown.

## Hydrogens and bond orders

Built in lane L5 on 2026-10-11, as the maintainer asked: a file of
coordinates - XYZ, PDB, a calculation's output - gives no bond orders, and
an X-ray entry no hydrogens. A molecule drawn as if they were known
misleads as one with its hydrogens hidden does, so a molecule says what is
missing, and what can be found is found, through the RDKit plugin's own
requests (its worker's; the role that draws a molecule in 3D as a
formula). Pure logic in `utils/completeness.ts`, the requests in
`chem/bondOrders.ts`.

- **Said over it.** *No H in file* where the molecule - for a PDB entry,
  its chains while they are drawn as atoms, or a ligand - has no
  hydrogens and is a skeleton (below: `lib/chem/skeleton.ts`); *Bond
  orders estimated, protonation unknown* under it where a skeleton's
  orders were estimated from its distances; *Bond orders
  unknown* where they are - for a PDB entry, while a ligand's are, or
  while its chains are drawn as atoms, whose orders no entry gives (the
  side chains round a ligand, in a look with ribbons, among them); *3
  frames left out* where frames of its file were left out as it was read
  (cut short, or with a place that does not read: never without a word);
  *Atoms in one place* where atoms of it stood within 0.1 Å of another as
  it was read - a damaged file, or none of a molecule's - which are given
  no bond; *1 atom left out*, *3 atoms left out* where its file has atoms
  whose element does not read - a PDB entry's unknown atom (X, UNX) - and
  the molecule leaves them out. Said as *C–H hidden* is:
  over the molecule at any zoom, one over another, and in every picture
  made of it (SVG, PNG, EMF).
- **Found from its shape.** As a molecule comes in, opened or pasted,
  with its orders unknown, they are sought once - with the request its
  formula is drawn by (`drawing_of`, `perceive`: RDKit's
  `DetermineBondOrders`) - where the plugin is set up already: nothing is
  set up because a file was opened. What is found is learnt of the
  molecule, with no undo step of its own; the 3D view draws it. A PDB
  entry's ligands are each sought alone; its chains are not.
- **Only with its hydrogens.** RDKit's `DetermineBondOrders` works from
  a molecule's full set of atoms, hydrogens included (tried with RDKit
  2026.03): given biotin from entry 1STP with its hydrogens, it finds its
  orders; without them, it finds none, and given benzoic acid without
  them, it does not find benzoic acid's. So Meno does not seek the orders
  of a molecule, or a ligand, without hydrogens, and says they are
  unknown; nor of one of more than 400 atoms. Such a molecule's orders
  can be estimated from its distances, asked for (below).
- **Estimated from distances** (asked for by the maintainer, 2026-10-11:
  from the menu, worded as an estimate, and no mark once made). *Estimate
  bond orders from distances* on a ligand, or a molecule, works without
  its hydrogens and without the RDKit plugin
  (`lib/chem/ordersFromGeometry.ts`). It weighs three things. A bond's
  length is read as an order between one and three against the sums of
  its atoms' single-, double- and triple-bond covalent radii
  (`lib/chem/elements.ts`: Pyykkö's, as collected in J. Phys. Chem.
  A 2015, 119, 2326, from Pyykkö and Atsumi, Chem. Eur. J. 2009, 15, 186
  and 12770, and Pyykkö, Riedel and Patzschke, Chem. Eur. J. 2005, 11,
  3511). An atom's shape says how many double bonds it can have: a carbon
  with three neighbours in a plane has one; pyramidal, none; with two in
  a line, a triple or two doubles. A flat five- or six-membered ring
  whose double bonds and lone pairs make 4n+2 electrons is taken as
  aromatic, which is how such rings almost always are. The orders chosen
  are those, of all the shapes allow, that fit the lengths best with the
  most aromatic rings: a search over each conjugated part. A sulfonyl
  has two S=O and a phosphate one P=O, to its shortest oxygens; a nitro
  group's charges are N+ and O-. Bonds to metals stay single. Where an
  atom's shape asks for a double bond it cannot have, nothing is changed
  and the orders stay unknown. Otherwise they are drawn - with no mark
  but on a skeleton, which says its protonation is unknown (below) - and
  a later SMILES or CCD replaces them. Comparing lengths with bond-type
  radii, and counting a ring's electrons, are ideas from the maintainer's
  ACCeL; the code is Meno's own. Checked (2026-10-11) against 120
  molecules made in 3D by RDKit with their hydrogens taken away: all
  right; 98% with each coordinate shaken by 0.01 to 0.02 Å, 68% at
  0.05 Å. Against the CCD's 41 components on their ideal coordinates, all
  but heme. Against ligands as X-ray entries place them (1STP, 1HSG, 3PTB,
  1M17, 1IEP, 3ERT, 4HHB, 2RH1, 1ATP, 1F88, 1A6M): 21 of 24. The three
  wrong were two hemes (with which of the porphyrin's nitrogens carry
  hydrogens swapped, the same in a complex) and dioxygen, read as single.
  Tautomers are the estimate's weak point: which nitrogen of a histidine
  carries the hydrogen.
- **Given from a SMILES.** Right-click a ligand (for a PDB entry, the
  one under the pointer), *Bond orders from SMILES…*: a card over the
  canvas takes its SMILES, and RDKit's `AssignBondOrdersFromTemplate`
  gives each bond the order the SMILES has for it, and each atom its
  charge. The SMILES must be the ligand's heavy atoms and bonds, all of
  them; else the card says so and nothing changes. One undo step.
- **How it is protonated** (the maintainer's decisions, 2026-10-21 and
  2026-10-22). Its orders known, a molecule without hydrogens - for a PDB
  entry, the ligand under the pointer - has *Add hydrogens…* in the same
  menu: a card over the canvas, *How it is protonated*, with a row for
  each of its sites and the forms to choose from, the site lit on the
  molecule while the pointer is over its row; any other nitrogen, oxygen
  or sulfur can be given a charge of its own (*Charge another atom…*);
  and the charge and spin the molecule would have. Nothing is chosen for
  the chemist: a pH model may come later.
  - **The sites** (`lib/chem/protonation.ts`), each atom in one at most,
    the first that takes it: a lactam (a flat ring with a nitrogen and an
    oxygen on a carbon of it: 2-pyridone, 4-pyridone, uracil, a
    triazolone); an azole (a flat five-membered ring with two nitrogens or
    more: imidazole, pyrazole, a triazole, a tetrazole, an oxadiazole); a
    cyclic amidine (a flat ring's carbon beside a ring nitrogen, with an
    amino group on it: 2-aminopyridine, 2-aminothiazole, adenine); an
    amidine or a guanidine; a carboxyl; a phosphate and a sulfonate (a
    phosphorus or sulfur with four neighbours, two oxygens or more of them
    bonded to nothing else, named by what else it carries: a phosphonate,
    a phosphinate, a phosphoramidate, a sulfate, a sulfamate); a ring
    nitrogen (a flat six-membered ring's, with no substituent, or a flat
    five-membered ring's one nitrogen, doubly bonded: an oxazole's, a
    thiazole's); a phenol and a thiol; an imine (a nitrogen outside a flat
    ring doubly bonded to a carbon, on carbons alone - not an oxime's nor
    a hydrazone's); an amine (a nitrogen with single bonds only, outside a
    flat ring, and not an amide's, a sulfonamide's, a nitro group's, nor
    an amino group a cyclic amidine holds). A ring drawn with an imine on
    it - cytosine's or 2-aminothiazole's imino tautomer - is the same ring
    as drawn with its amine. Two sites that would move the
    hydrogens of one atom are one, their forms found together: a
    biguanide's two guanidines, cytosine's lactam and its amino group. A
    site is named by what it is made of - an azole or a ring nitrogen by
    the atoms round its ring (a thiazole's, a pyrimidine's).
  - **The forms.** A form is the hydrogens each atom of a site carries,
    and its charge - every tautomer one of them, by where its hydrogens
    are: imidazole with its hydrogen on N1 or on N3, a tetrazole's four,
    an amidine's two, a guanidine's three, 2-pyridone and
    2-hydroxypyridine, 2-aminopyridine's amino and imino forms, a
    carboxylic acid's hydrogen on either oxygen, a phosphate's on any of
    its oxygens. The orders of the bonds round a form - in a ring, its
    whole flat ring system's - are found again for it so that every atom's
    valence is met, and they follow the form chosen: a carboxylate's one
    C=O, imidazolium's and guanidinium's C=N+. Two ways of drawing the
    same hydrogens and charge are one form. A site's charge is of one
    sign, and a ring's is one at most. Every form carries as many
    hydrogens, less its charge, as the molecule is drawn with: a proton
    more with its charge, never two hydrogens added to the bonds (a
    dihydro tetrazole) nor two taken from them. Not among the forms: a
    hydrogen on a carbon (a pyrazolone's CH form). Not sites yet: acidic
    N-H groups - a sulfonamide's, an imide's, a barbiturate's - whose
    nitrogen can be given a charge of its own on the card.
  - **Bonds to metals.** A bond to a metal from an atom that cannot give
    it a pair of its own - a carbon's on tin or lithium, a chlorine's on
    mercury - counts in that atom's valence. One from an atom that can (a
    nitrogen, phosphorus, arsenic, oxygen, sulfur, selenium or tellurium)
    may be in place of a hydrogen or not: where the two leave it different
    hydrogens, it is a site of its own, *Bond to Zn*, its forms *Covalent
    bond* (as drawn: an amido, a thiolate, a sodium carboxylate, a
    pyrrolide) and *Dative bond* (an amine, a thiol, the acid), and no
    other site moves its hydrogens. A pyridine's nitrogen on a metal has
    none either way.
  - **A file whose rings are aromatic** (a molfile's bond type 4): its
    rings are drawn with single and double bonds, its nitrogens' hydrogens
    as few as Hückel's rule leaves (`lib/chem/kekulize.ts`); which nitrogen
    carries one the file does not say, so every site starts unchosen. Where
    a ring cannot be drawn so (a ring of five carbons), the card says which
    atoms, and nothing can be added.
  - **Where the card starts** (one function, `startingForms`). Where the
    orders and charges were given by a definition - the CCD's (*As the CCD
    defines it*), a SMILES' (*As the SMILES gives it*) or its own file's, a
    molfile's, whose hydrogens are those its valences leave room for (*As
    its file gives it*) - each site starts at the form they draw. Where
    they were estimated from distances, which say nothing of how it is
    protonated, or a file gives its rings as aromatic, every site starts
    unchosen, and *Add hydrogens* waits until each is chosen. A bond to a
    metal (*Bond to Zn*) starts unchosen whatever the source (the
    maintainer, 2026-10-23): a V2000 molfile has no dative bond, so a
    ligand such as water is often drawn with a single bond to its metal,
    which read as drawn would be a hydroxide.
  - **The hydrogens.** The forms chosen are drawn together - every site's
    bonds found again at once, the card saying so where they cannot all be
    drawn - and the hydrogens they leave room for are added by RDKit's
    `AddHs`, as many on each atom as its form gives (`add_hydrogens`'s
    `hydrogens`), where the atoms' geometry puts them, bonded to their
    atoms and in their residue. A PDB entry's ligand kept as the CCD defines it is
    given the CCD's own hydrogens instead, by their names, each where the
    component's ideal shape puts it beside its atom: the component's atom
    and its neighbours - and theirs, until three not in a line - fitted
    onto the entry's by Horn's closed-form quaternion fit
    (`lib/chem/ccdHydrogens.ts`), so that it stands as the component has
    it however the residue is turned and bent. A bond to another residue
    takes the place of a hydrogen of its atom - one that leaves as the
    residue bonds (an amino acid's H2), else the one nearest the atom it
    is bonded to (a sugar's HO4, in a chain of them) - unless it takes
    that of an atom that left (a peptide's carbon, its OXT gone). Where an atom of the
    component that does not leave is missing from the entry, it is not
    made whole: the card says which, and nothing is added.
  - **Checked before anything is written.** Each atom must then have the
    hydrogens its form gives it - its valence met by its bonds and its
    hydrogens, a donor's bond to a metal in place of a hydrogen or not
    (`hydrogensRooms`). Where not, nothing is changed, and the card says at
    which atoms. Nor is anything written where the molecule changed
    while the card was open (an undo, say), or an atom of it moved while
    its hydrogens were being placed, which puts them where the atoms were
    (by more than 0.0001 Å, under any digit a file writes): it is asked
    for again. Given other frames meanwhile, it says how many. HEM,
    as the CCD defines it, gives its O2A and O2D a
    charge and a hydrogen both: its hydrogens are not put on as they are,
    and the chemist chooses its carboxyls' forms on the card.
  - **Said over it.** A molecule so completed says *Hydrogens added*, or
    *Hydrogens from the CCD* (`hydrogensAdded`), as they were not in its
    file. One undo step. Not for a molecule with other frames (an NMR
    entry's models, a trajectory), which would be left without them; nor,
    yet, for a set of many in a workflow, which waits for the pH model.
- **Not done: protonating a protein.** A chain's hydrogens depend on each
  residue's protonation state - histidine's tautomer, the pH, what is
  near - which is a calculation of its own, not a completion of the file.
  Only ligands are given hydrogens; a plugin for proteins could come
  later.
- **From the Chemical Component Dictionary** (the maintainer's ruling,
  2026-10-11: asked for, from the menu, not on opening; standard residues
  too). A PDB entry's right-click menu has *Bond orders from the CCD*:
  each residue name it uses - amino acids, nucleotides, ligands, ions,
  water left out - is looked up in the wwPDB's dictionary (CC0), whose
  component files give each component's atoms by name, its bonds' orders
  and its atoms' formal charges (`lib/chem/ccd.ts`, read by the CIF 1.1
  syntax, `lib/chem/cif.ts`, and the PDBx/mmCIF dictionary's definitions
  of `_chem_comp_atom` and `_chem_comp_bond`). A residue takes the
  component's orders and charges where every atom of it is one of the
  component's, by name and element, and every bond within it is one of
  the component's, single, double or triple; any other residue is left as
  it was, and says so. Bonds between residues - a peptide's, a
  disulfide, a ligand's link - stay as they are. A ligand so given can be
  given its hydrogens as the CCD defines them (*How it is protonated*,
  above); chains whose every residue was given no longer say
  their orders are unknown, drawn as atoms. The charges are the
  dictionary's, as its components are drawn, not a protonation worked out
  for the entry. One undo step. The files come from files.wwpdb.org
  (`refdata/chem_comp/<last character>/<id>/<id>.cif`), fetched by the app
  as a task of its own on Meno's network (`src-tauri/src/ccd.rs`,
  `lib/net/components.ts`, purpose
  `ccd`, asked for the first time it is used) and kept in Meno's cache, so
  each is fetched once; only the components' names leave Meno. A PDB file
  with no chain (a ligand on its own) keeps no residue names, and is not
  looked up.
- **A skeleton is not a molecule** (the maintainer's ruling, 2026-10-21:
  "treating a structure without hydrogens as a molecule is itself
  wrong"). A file of coordinates without hydrogens gives a molecule's
  skeleton: how its atoms are protonated, and so its charge and spin, are
  not in it. Meno's one rule for a skeleton (`lib/chem/skeleton.ts`
  `lacksHydrogens`, for a molecule `utils/completeness.ts` `isSkeleton`):
  none of its atoms - a ligand's, a PDB entry's chains' - is a hydrogen,
  and some would carry one. Its orders known, an atom whose valence leaves
  room for one would. Its orders unknown, a carbon whose neighbours leave
  room would (none, or one, whatever it is bound to - hydrogen cyanide's
  heavy atoms are a cyanide ion's too; two not in a line; three whose
  angles at it sum to less than 350° with each bond a single bond's
  length: measured over 1,454 molecules laid out by ETKDG and MMFF, the
  833 such carbons with a hydrogen sum to 347.3° at most and have no bond
  shorter than order 1.28 by its length, the 4,005 without one sum to
  358.9° at least, and C60's - 348° - have a bond of order 1.63); and where no
  carbon says so but another atom could carry one - an oxygen with one
  bond, a nitrogen with two - the orders are estimated from the distances
  (above) and an atom other than carbon they leave room on would: a
  carboxylate's oxygen, an amine's nitrogen. Where they cannot be
  estimated, it cannot be told that none is missing: a skeleton. Carbon
  dioxide, SF6, CCl4, C60, N2 and a metal's carbonyls are whole by
  themselves. Some whole ones are taken for skeletons, the safe way: carbon
  monoxide and an isocyanide's end (one neighbour, as a cyanide's), ozone,
  SO2, SO3, NO2 and N2O (their orders not estimated as they are);
  these, and any other that is whole without hydrogens, are said so by the
  chemist - *Complete without hydrogens* on its menu (`wholeWithoutH`,
  one undo step; never a PDB entry's). A skeleton is given no charge or
  spin (`lib/io/writers` `speciesOf` gives none: before, H-less
  methylamine's 13 electrons made it a neutral doublet, and ethane's
  heavy atoms were C2); a step whose plugin needs the whole molecule -
  *Conformers*, *Optimise*, *Energy*, *Frequencies*, *NCI*, a plugin's
  *Duplicates* (`whole` in `workflow/kinds.ts`) - refuses it before
  anything is sent, saying what to do: a program's jobs each skeleton
  apart, out of the step's *Failed* exit (kind *refused*), the rest run
  (`skeletonEntries`, 2026-10-23); a step a plugin does at once, the step
  (`skeletonsRefused`). Meno's own steps on its shape and energies, and
  *Render*, take it; *Group* by constitution groups skeletons by their
  heavy atoms alone, however each would be protonated, and says how many.
  It is not drawn as a formula or in a large set's sample (`drawnOf`
  refuses it), which would say how every atom is protonated. A plugin's
  writer, given the molecule with its charge and spin, is not given it;
  Export says so before a file is asked for. An SD file or a copy writes
  it as a skeleton - each atom's valence its bonds' orders summed (the
  atom block's vvv, 15 for none; V3000's VAL, -1 for none, "CTfile
  Formats"), so that no reader adds hydrogens - and an XYZ or PDB file as
  it is, Export saying it has none. Estimated orders on a skeleton say so
  over it, their formal charges only those its heavy atoms set (a nitro
  group's, an azide's). The way on is its hydrogens added, the chemist
  choosing how it is protonated - or, for a PDB ligand, the CCD's (*How it
  is protonated*, above): a molecule with hydrogens is no skeleton.

## Risks

- **The 2D drawing changing.** The thinnest lines and the place of every
  letter must stay as they are: checked by comparing pictures pixel for
  pixel.
- **The page and 3D objects overlapping.** The page's layers are ordered
  by drawing order, not by depth, so what is in front of the page and
  what is behind it needs ordering of its own.
- **Size.** Conformer sets run to thousands of atoms: everything 3D is
  instanced from the start.
- **Testing.** The GUI harness sees a WebGL canvas only while its window
  is on screen.

## Putting things down

What is put on the page - a structure read from a figure, one opened or
dropped onto a page with something on it, molecules in 3D, a formula drawn
from one - is selected, and shown (utils/viewShow, `requestShow`): where it
is not seen whole, the view eases to it, as Fit eases. What can be seen is
the canvas the column beside it leaves: what lies under the column is not
in view. The view goes along first, as little as takes it in with a
margin; only where that is not enough, out as little as needed, it in the
middle of what can be seen - never in. What is seen whole already leaves
the view as it is. Opened onto an empty page, it is fitted, as a canvas
opens. Quick Add and a paste put what they make where the pointer is, in
view already (the maintainer, 2026-10-18).
