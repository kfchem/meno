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
    model with no notion of separate molecules;
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
| 5. Structures from PDFs | Figures read as structures (candidates: MolScribe, DECIMER) in the sidecar, their weights fetched with consent; drawn by Meno's engine, tied to the figure they came from, for the chemist to check and correct. | 4 |
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
  Files; 600 dpi unless changed). A structure opened from Word or PowerPoint
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
  - **Held still, a press selects the molecule** (0.32 s, as in 2D), the
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
  - **The selection's handle turns molecules in 3D** (agreed 2026-10-03):
    - selected alone, as one body about their common centre, in 3D - as a
      drag on one turns it - so that molecules placed together, a complex
      say, stay as they are to one another. That moves them, so it is one
      undo step, and the undo puts their turns back too. Afterwards each
      stands as high as the turn left it, the whole resting on the page;
    - selected with a drawing, everything in the page's plane, the
      molecules carried round and turned with it;
    - with Shift, each molecule about its own centre, the drawing staying.

    Every turn by the handle is one undo step, Shift's and one molecule's
    alone too (agreed 2026-10-04), and the undo puts the turns back; a
    drag on a molecule itself turns only the view.
- **What a 3D molecule looks like** starts from the 3D viewer's look:
  - atom size and colour, material and light, and the turn's inertia,
    near enough;
  - held as a style, as the 2D drawing's is, so that it can be set the
    same way later.
  - Since 2026-10-04 it is set in Settings, under Molecules in 3D, as
    the drawing style is: a preset - Meno (the viewer's look), Glossy or
    Space-filling - and what was changed from it, each change marked and
    taken back alone or all at once. The settings are how molecules are
    drawn unless one has a look of its own, ball size, bond thickness and
    colour, the surface, the two lights, and how a molecule turns and
    coasts when let go. A molecule beside them shows the look and can be
    turned, to try the turning. The canvas, the selection's handle, a fit
    and the pictures for other programs all take the look from there. A
    document of its own look, as a drawing can have its own style, is not
    there yet.
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
    Hovered or selected, the chip opens to a slider.
  - The old viewer's ladder of energies became bars above the slider:
    each frame as high as it is above the lowest, and the chip says by
    how much in kcal/mol. One control serves both a trajectory and a
    conformer set.
  - Its atoms go over to another frame rather than jump.
- **What is the view's.** How a molecule is turned and which frame it
  shows are not undone, save a turn by the selection's handle. They are kept by a copy and by the workspace file,
  so that what is pasted or opened looks as it did.
- **Saving.**
  - `.meno` is JSON (`meno-workspace`, version 1).
  - An SD file holds each 3D molecule as a record in 3D beside the
    drawing.
  - With 3D molecules on the canvas, Save offers only what keeps them: a
    workspace or an SD file.
- **Calculation readers** (the maintainer): reading what calculation
  programs write is to be plugins, added and removed online. Meno itself
  reads geometry. The one reader so far, energies on an XYZ file's comment
  lines (CREST, xtb, ORCA), lives apart in `lib/calc`, and what it finds
  is plain data on the molecule.

Taken on 2026-10-04:

- **The structure canvas is the workspace** (named Workspace from 2026-10-10), and everything else is to be
  reached from it. The New Tab page is gone: Meno starts on a canvas, "+"
  makes another, and Open puts a file in a tab of its own. The New… menu
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
  The small previews on the page, decided on 2026-10-04, are not made yet.

Taken on 2026-10-10 (menus and gestures):

- **Meno's logo and its menu go.** Doing something to the whole workspace
  is Select all and a right-click, as for any selection: *Clean up all*
  and *3D structures* went with the menu. Save is a button in the title
  bar, by Settings (and Ctrl/Cmd+S); Export is the selection's; a SMILES
  is drawn from Quick Add; Open…, Save As…, New text and what concerns the
  view - fitting, R and S, the texts, the drawing style - and *Run all*
  are on the right-click menu on empty space, with their keys.
- **Quick Add opens at once.** The chain from empty space is one of its
  icons, so a double-click need not wait to see whether a third click
  comes (docs/EDITOR-2D.md, *Quick Add*).
- **A double-click on the canvas shuts the column** beside it: the work
  comes back to the canvas (docs/PDF.md, *One canvas*).

## Stage 2, as built

- **A drawing to 3D.** A structure's right-click menu, or a selection's,
  has *3D structure*; *3D structures* on the selection's menu makes
  everything selected (Select all first, for everything drawn). Stereo drawn without a configuration is ringed on
  the drawing while Meno asks what to make: every stereoisomer it gives,
  one, or none for now. Each is made as a conformer set (RDKit's ETKDG,
  then MMFF94) and comes onto the page as a molecule in 3D, its frames the
  conformers, lowest first. Of two enantiomers, one is made as the other's
  mirror image, so the two have the same conformers and shares.
- **Rising out of the drawing.** Turned to lie over the drawing (Horn's
  quaternion, `utils/align3d`), its atoms grow on the drawing's, go over
  to their places in 3D as it comes up off the page, and it moves to rest
  beside the drawing: to its right, its left, below or above - the first
  that is in view as it is seen - the view taking it in where none is.
  Several rise one after another, in a row.
- **Told apart.** Made with the other stereoisomers its drawing leaves
  open, a stereoisomer's centres that were left open carry their R and S
  always, every centre's while R and S are shown; made alone - one
  configuration chosen - it carries them only while they are shown, as
  the drawing does (the maintainer, 2026-10-10: hidden unless asked for). They are
  as large as the drawing's R and S, and written as the drawing's style
  writes them (bare, or in parentheses), in blue. Each is set clear of
  its atom - beyond its ball by as much as the drawing's style sets them
  off - in the widest gap between its bonds as it is seen - or the
  nearest way round that covers no other atom, no measurement's value
  and no bond (an atom hidden counts for more than a bond covered) - and
  a little way off the others (2026-10-05: on Windows, an (S) sat on a
  value or on a bond in some frames as the molecule turned).
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
  consent. Readers are added and removed in Settings, *Calculation
  readers*; opening a file that no installed reader reads says which
  would. Which readers there are is Meno's own list for now. A list
  fetched online needs a way to trust it (signing), and comes later.
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
  was, its results coming first - or else the first in Meno's order. What
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
  in hartrees, a charge in e, a wavenumber in cm⁻¹ (an imaginary one
  negative), a length in ångströms, a dipole in debye, a number, a text -
  and Meno writes it, the same way whichever plugin gave it. Any other
  gives its unit, and is written with it.
- **A list's row can point at atoms, a frame or a motion.** Pointed at,
  its atoms are marked; chosen, its frame is shown, or the molecule moves
  in it. Vibrations are a list whose rows move the molecule - no arrows
  and no spectrum. These are what Meno can do with a row, and more come
  as Meno learns them: a surface, for an orbital's row.
- **What the chip's line says:** a plugin ranks which of a molecule's
  results it says; Meno fits as many as the line holds, in that order,
  after what the calculation was and its energy.
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
   *Calculation readers* with the choice where they overlap, and cclib's.
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
  readers*, adds it - asking first for the network - and takes it away
  again, its environment and its record with it. A kind of output is told
  by what its file starts with. Where readers overlap, every one added
  reads the output and each one's results are kept, its own; the one
  chosen for that kind gives the geometries and what the calculation was.
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
  glides the view until the molecule and the list are both seen, and an
  opened chip rises to stay within the canvas. No colouring.
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
  one, seen through. The colours are the chemist's to choose in Settings;
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

## Styles in 3D

Built in lane L5 on 2026-10-10. The maintainer's ruling: a molecule in 3D
has two looks, a thin one and a thick one, and goes from one to the other
in a single step - seeing a molecule as ball and stick and as
space-filling side by side is better science than either alone.

- **A list of styles.** Ball and stick (the 3D viewer's look, Meno's
  first), Glossy and Space-filling. Each is set on its own in Settings,
  under Molecules in 3D: whether it draws balls and sticks or
  space-filling, ball size, bond thickness and colour, the surface, and
  whether the hydrogens on carbon are shown. Changes are kept per style,
  marked, and taken back one at a time or all at once.
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
  high as it now reaches - all on one 80 ms time constant.
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
- **Pointing.** A ribbon lights its outline as a molecule's does; pointed
  at, a residue says its name, number and chain. A click on a ribbon
  chooses the residue's backbone atom, which can be measured.
- **Pictures.** An exported picture draws the ribbons as the canvas does
  (the bitmap); where there is no WebGL, as sticks along each ribbon.
  NMR models and trajectories: the ribbon follows each frame.

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
