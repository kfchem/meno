# File input and output

What comes into Meno and what goes out of it - files, the clipboard,
Office - and who reads and writes each kind. Written on 2026-10-06 at the
maintainer's request - to put all of it in order and make plain where a
reader stands - from main at #147 with the PySCF reader of #148.

The first half is how things are. The second is the plan, along the
maintainer's answers of the same day, built step by step in the order at
its end. Plugins
beyond files - SMILES, R/S, conformers, what comes later - are in
[`PLUGINS.md`](./PLUGINS.md).

## Words

- **Kind** - what a piece of data is: a molfile, an ORCA output, a cube
  file, a Meno record on the clipboard. Told by what it holds; a file's
  name is a hint.
- **Structure format** - a program-independent description of molecules
  or a drawing: MOL, SDF, RXN, XYZ, PDB, SMILES.
- **Calculation output** - what a program wrote about a calculation:
  ORCA, Gaussian and xTB output, Gaussian's formatted checkpoint, Molden
  and cube files. **Calculation input** - what a program is given to run
  one.
- **Reader, writer** - what reads or writes one kind for Meno, under one
  contract. Each is part of a plugin (cclib, PySCF) or one of Meno's own
  parts.
- **Plugin**, **Meno's own parts** - as in PLUGINS.md. A plugin is
  independent and added or removed; Meno's own parts come with Meno.
- **Meno's own formats** - `.meno` and the record (on the clipboard, in a
  picture, in an Office object): Meno's alone, never a plugin's.

## What comes in, as built

The inventory as it was when this plan was written (2026-10-06), before
any of its steps, and kept as it was: what is built now is in
ARCHITECTURE.md (*File format support*) and in each step's *As step ... was
built* below.

| Way in | Kind decided by | Read by, where | Becomes |
| --- | --- | --- | --- |
| **Open** (Cmd/Ctrl+O; `<input type=file>`, `App.tsx`) | `openedAs` (`ui/views/openFile.ts`) tells a kind from text, from the extension, `detectFormat` and `outputKindOf`; the canvas then decides again (`processFileContent`, `Workspace/utils/io.ts`) | see the formats below | added to the workspace in front as a drop adds it (`ui/views/files.ts`, `openFilesAt`), in free space near the middle of the view (`utils/freePlace.ts`: clear of all on the page, a workflow's sets and steps' cards too, and each molecule in 3D's frames chip under it and notes over it, `shownBeside`), one step to undo. A molecule in 3D a file brings is first seen along its principal axes (2026-10-24, `utils/align3d` `principalTurn`, set as it is added: modelSlice `shownTurns`) - its longest extent across the screen, its least towards the viewer: HCN side-on, not end-on as one ball, a planar molecule face-on - its coordinates as the file has them, only the view turned; one tied to a drawing as the drawing lies. The same molecule is always seen the same way, whatever noise its coordinates carry: each axis pointing the way the lowest-numbered atom off it lies, and a symmetric top's axes (benzene, methane: their spread alike two or three ways, within 2%) taken through the lowest-numbered atoms off the rest. *Reset turn* goes back to that first view. An undo of a file opened over the canvas puts the molecules it replaced back turned as they were - by hand, or as first seen - and a redo the file's own (the turns go with the step: store/turnJournal) - only a `.meno` opens a tab of its own (the maintainer, 2026-10-13), untouched, beside the workspace in front where other files are opened with it; one that cannot be read says so there, and no tab is made; text, a text in its column (`ui/views/texts.ts`). With no workspace in front (Settings, say), the one last in front is brought forward; with none at all, a canvas is opened for it |
| **A file dropped** on the canvas (`dropAppend`, `useStructureEvents.ts`) | the extension first (`STRUCTURE_FILE`), to know whether to look at the drag's clipboard flavours; then as Open | as Open; a `.meno` opened as Open opens it, in a tab of its own (the maintainer, 2026-10-12) | added to the page; a `.meno`, a tab; text (`opensAsText`), to the column. While it is read, a small mark turns where it was dropped - coming after a moment, so that a quick one shows none - and fades as what it brings is placed, or as the card saying why not takes its place |
| **An Office picture or object dragged** in | the drag's flavours, in order: Meno record or embedded object, Mac Office object, GVML, PNG, RXN, MOL (`fromClipboard.ts`); read by Rust (`drag_read`; on Windows an overlay window, `drop.rs`) | the record Meno put in it (EMF comment, PNG text chunk, OLE stream) | pasted |
| **Paste** (`clipboardActions.ts`) | the clipboard's flavours, in the order above, then plain text that looks like a molfile, then SMILES (`fromClipboard.ts`; Rust `clipboard_read`) | the record; CTfiles in TS; SMILES by RDKit (chem worker) | pasted |
| **Office re-edit** (Windows OLE: Word or PowerPoint opens Meno) | always a record; named `office.meno` to reach it (`App.tsx`) | `readRecord` | a tab linked to the object |
| **Calculation output**, through Open or a drop | `outputKindOf` (`lib/calc/catalog.ts`) - by content only, and only once `detectFormat` has found no structure format | every reader added that reads the kind (`readOutput`, `lib/calc/read.ts`) | a molecule in 3D with what the calculation found |
| **A promise asked for** (a list row chosen) | the result's key | the reader that gave the promise, sent the output again (`askFor`, `lib/calc/asks.ts`) | a grid, drawn as a surface |
| **`.meno`** (Open, drop) | the extension | `readWorkspace` (versions 1 and 2); its results checked as a reader's answers are | the workspace, in a tab of its own - dropped too. Dropped from the Finder, or pasted from the Finder or Explorer, it is opened by its path, as from the system, and Save writes it back (`open_workspaces_from`, `src-tauri/src/clipboard.rs`); one already open in a tab, by where it is saved - its one true path, however the path it came by was written (*One file, one tab*) - brings that tab forward rather than a second one (`tabHolding`, `lib/doc/savers.ts`); a drop on Windows is read by what it holds, the webview naming no path, and Save asks where |
| **`.meno` from the system** (double-clicked, dropped on Meno's icon) | the extension (`src-tauri/src/opened.rs`) | as Open (`openPaths`, `App.tsx`) | a tab of its own, as Open opens a `.meno` |
| **SMILES** typed or pasted | the panel; text that looks like SMILES | RDKit (chem worker), back as a molfile | added to the page - and, where it leaves stereocentres or double bonds without a configuration, said where a paste says what it left out: "1 stereocentre not specified", "2 stereocentres and 1 double bond not specified", "1 axis not specified" - a run of cumulated double bonds one element, an allene's axis or a butatriene's cis or trans (`stereoOpenSaid`, by the worker's `stereo_left_open` - the one definition a step refusing a structure for open stereo uses; asked of the same worker as the structure is drawn, nothing said where it cannot be asked or has not answered within 3 s). Drawn as it is, nothing chosen for it; a word made into a structure from Meno's own dictionary is not looked at |

### Structure formats

| Format | Read by, where | Written | Notes |
| --- | --- | --- | --- |
| MOL (V2000/V3000) | `readSDfile` (`lib/chem/ctfile.ts`) via `parseSDF`, main thread | Save, Copy (`molWriter.ts`) | 3D when it says so or spreads in depth; written with no coordinates - every atom at one point - laid out as the file is read (`laidOutWhereUnplaced`) |
| SDF | the same | Save (drawing as one record, each molecule in 3D as one) each record with no coordinates laid out, the same |
| RXN (V2000/V3000) | `readRxnfile` via `buildEditorModelFromRXN` | Save, Copy a molecule with no coordinates laid out, the same, before the scheme is |
| XYZ, many frames | `xyzFrames` (`utils/structureParsers.ts`) via `readStructures`; bonds from covalent radii (their single-bond radii together and a fifth over - a tenth before 2026-10-22, which left out every peroxide's O-O - or 0.15 Å over where that is more, as for H2; none between atoms within 0.1 Å), the first frame's (frame by frame where drawn) | Export: molecules in 3D only (`writeXyz`, `lib/chem/xyzWriter.ts`; *XYZ written*, below); it holds elements and positions only, so the Export card says, with counts, the charges, radicals, isotopes and bonds not written (`xyzLeavesOut`, 2026-10-22) | each frame's energy from its comment line (`lib/calc/readers.ts`); an element in any case or as its atomic number; a frame cut short or with a place that does not read as a number (not Fortran's D, "nan", "Infinity" or hexadecimal) left out, with its energy, and the molecule says how many (`wholeXyzFrames`); blank lines between frames, and a line that is ">" alone (as in ORCA's .allxyz), passed over; a line after the frames that is no count of atoms (a separator, text at the end) ends the reading, and what follows is said as a frame left out (2026-10-14); a file a plugin knows as an optimisation's steps (`xyzSteps`: by its name - xtb's `xtbopt.log`, ORCA's `*_trj.xyz` - or, renamed, by its frames' comment lines) gives no entry, "No frame is an entry (convergence not stated in this file)" (docs/WORKFLOWS.md); none whole, the file refused, saying why of its first frame ("w.xyz could not be read: its first frame ends before its atoms do (it says 3, and gives 2).", "w.xyz could not be read: line 4 gives C a place that is not a number: …"); atoms in one place said too |
| SMILES | the plugin that fills the role (RDKit's, `plugin-rdkit`); abbreviations' SMILES by Meno's own `lib/chem/smiles.ts` | Copy as SMILES (the same plugin) | |
| `.meno` | `readWorkspace` (`workspace.ts`) | Save | version 2: each set's members - a structure by its atoms' ids, a molecule in 3D or a picture by its place in its list - and a result set kept out of the file by its count and collection hash (`notKept`). Version 1, whose sets kept no members, is read once: each set holds what lies inside its frame as it opens. A file of version 2 does not open in a Meno before it |
| Meno record | `readRecord` (`utils/copyPaste.ts`) | Copy, Office | in the clipboard's own flavour, an EMF comment, a PNG text chunk, OLE streams |
| PDB | `readPdb` (`lib/chem/pdb.ts`) via `readStructures`, in Meno's worker: every atom, MODELs as frames, bonds from CONECT and distances | Export: molecules in 3D only (`writePdb`); a mass number but hydrogen's D and T, and a charge past 9 either way, are left out, and the Export card says so before it is written, with how many atoms lose each (`pdbLeavesOut`, 2026-10-22) | wwPDB Format v3.3; see *As step 7 was built* |
| KET | not read | never | Open does not offer it; one dropped says "not supported yet" |

### Coordinates in a text

Built 2026-10-15 (`lib/io/coordinates.ts`; the maintainer's request: a
paper's supporting information, printed, made into 3D structures with no
tidying by hand). Text holding atoms' coordinates becomes the structures
it holds, shown first in a card - each its name, which can be changed, its
atoms, its formula, its notes and what looks wrong - and those ticked
placed in 3D as a set of their own, laid out as a step's results are, in
free space nearest where they were asked for, one step to undo
(`placeAsSet`, `workflow/run.ts`). The set is named for where they came
from - the PDF's name and its page or pages (*made-up-si.pdf, p. 2*), the
text's name, or *Pasted structures* - and can be renamed as a chemist's
set is (docs/WORKFLOWS.md). Each molecule is bonded by distance, its bonds'
orders unknown, as an XYZ file's; its chip says its name always, with its
energy where a note gives one in hartrees, and a click on it opens what
the text says of it - its charge and multiplicity and its notes (*In the
text*). Its energy is an electronic energy a note names as one - E (or
E_SCF, Etot, E_tot, E_el, E_elec), "SCF Done: E(...)", Energy, or the
electronic, total, SCF, final or final single-point energy, after "=" or ":",
and ORCA's "FINAL SINGLE POINT ENERGY" line - in hartrees, said after
it or in its bracket, or not said where the bracket names a method. A
bracket after the name says a method (its basis after a "/":
RB3LYP/6-31G(d), CCSD(T), B3LYP-D3(BJ)/def2-TZVP) or a unit, nothing
else: one with a space or a "+", a word of another quantity or a part
of one (ZPE, corr, thermal, solv, rel, gCP, CP, vdW, BSSE, XC, ...), a
dispersion correction alone (D3) or a lone
T, G, H or S is no electronic energy's. Its name is kept with it
("E(MP2)") as what its energies are, and is what worked its energy out
wherever its energy is read - a set's table, a diagram's ΔE - so that
energies named otherwise are never set against it. Any other quantity -
a zero-point energy, a correction, a free energy, an enthalpy, a sum of
them - is a note only, never its energy; and where two notes give two
that differ, it is given none, and says why.

- **Where from.** Pasted on the page, where nothing else on the clipboard
  reads as a structure (the card offers *Paste as text* as well, to put
  the words on the page instead); pasted in Quick Add's SMILES field; *3D
  structures* in a PDF's menu, on the words selected or in a box drawn; and
  in the menu of a text in the column, on what is selected or the whole
  text, and of a text's sheet. A text file opened or dropped opens as a
  text, as ever (the maintainer, 2026-10-15).
- **A calculation's output is no text of coordinates.** Where what is
  pasted, in Quick Add or on the page, or the text or part of it chosen
  for *3D structures*, begins as a program's output does - its program's
  banner, told as a file's is (*Open, drop, paste*) - it is read as that
  output opened is, by its reader, and put down there: its molecule, its
  energies and its calculation, as Open gives them. Where only a plugin
  not added reads it, Meno says so and names the plugin, as Open does;
  nothing of it is read as coordinates (2026-11-01; `lib/calc/probe`
  `outputKindIn`). A part of an output chosen without its banner - a
  geometry copied out of it - is coordinates in a text, as any.
- **An atom** is an element - its symbol as it is written, or its atomic
  number - and three numbers with a decimal point or an exponent, read from
  the words in turn rather than the lines, so a line broken anywhere reads
  whole: `C 1.2 3.4 5.6`; a label of up to four letters and digits
  (`C1`), a freeze code between (`C 0 x y z`, `C -1 x y z`), its items
  apart by spaces, tabs or commas, as Gaussian's manual has a molecule
  specification's line (*Molecule Specification*); `1 C x y z`, numbered;
  and a row of Gaussian's table of an orientation - centre, atomic number,
  type, x, y, z. A minus printed as a typographic minus or a dash reads as
  one.
- **Left out**: a page's number set alone ("S12", "Page 3 of 40", "- 4 -")
  and a line of words set again and again (a running head, a journal's
  foot); from a PDF, besides, a line near a page's top or foot set there on
  another page too, its numbers aside. And what only looks like atoms:
  a crystal structure's table - fractions of its cell, on lines with a
  value's uncertainty in brackets (`0.41270 (14)`) or a hydrogen's
  displacement starred (`0.037*`); a table of positions numbered 1, 2, 3
  with values beside them (an NMR table's shifts), atoms written by
  atomic numbers that count up one by one as no molecule's do; and a lone
  atom met among a text's words or another table's numbers (an elemental
  analysis, a peak list with the page's number in it) - one atom is a
  structure only where an energy, a charge and multiplicity, a count or a
  table's heads before it say it is one.
- **A structure's own**: its name, the line before its atoms nearest them
  that names something - not a note, a table's heads or numbers alone; its
  charge and multiplicity, on a line of their own ("0 1", "0,1") or said in
  words, on one line or two ("Charge = 1 Multiplicity = 2", "charge: -1",
  "spin multiplicity: 1") - never two numbers at the end of a title ("TS 2
  1", "Conformer 12 3"), unless the text's lines' ends were made spaces and
  they stand right before its first atom; its count of atoms, said ("52
  atoms") or set alone as an XYZ file sets it; and its notes, lines of
  energies, frequencies or its method ("E = -1234.5678 Hartree", "SCF
  Done", "Imaginary frequencies: 1") - those written after a structure's
  atoms and before the next's name are its. A number set alone is its count
  where it is as many as its atoms; otherwise, nearer its atoms than any
  other name, its name - a compound's number set over its coordinates.
- **Where one ends**: at words between atoms, and where numbered atoms
  begin again at 1, or a count set alone is followed by as many atoms. A
  page's number between two atoms is passed over, unless it counts the
  atoms after it. Two parts that words set once (a page's foot) part are one
  where together they bond as one and no atom of either stands where one
  of the other does: two structures each about the origin stand in each
  other's place.
- **Said, never guessed** (2026-10-23). The lines among a structure's atoms
  that are none of them - a page's number, a running head, a table's heads
  set again on the next page, a caption - are left out and listed on the
  card under it (*3 lines not read: S12 · Supporting Information S13 ·
  Atom X Y Z*). A line among them that looks like an atom's but does not
  read as one (an element and two numbers, a number with a letter in it),
  or one that names a charge or multiplicity that does not read, keeps the
  structure from being placed: the card names the line, and it cannot be
  ticked. So a molecule split over two pages comes out as one, its
  table's heads on the second page left out, and nothing is half-read.
- **Bohr**: where the text says so ("bohr", "a.u.", "atomic units",
  "Units=Bohr"), the lengths are turned into ångströms (CODATA 2018), and
  the card says so - but not where atomic units are said of an energy only
  ("SCF energy (a.u.) = -154.98"): that says nothing of the lengths.
- **Columns.** From a PDF, each word where it lies: line by line, a page's
  two columns one after the other, where the words either side of a gap in
  the page's middle half each make whole atoms on their lines - two at
  least each side - or one side's atoms stand beside the other's words (a
  column of each structure's energies beside its atoms), so that a table's
  x, y and z set far apart stay one. The gap is looked for between lines
  of numbers only, and a line run on across it as a line runs - a heading
  over both columns, a word set over the gap - is read whole where it
  comes.
  Pasted text has no places: two atoms whole on a line are two columns read
  across, each a structure, an atom alone on its line (one column run on
  past the other) given to the one it bonds to as an atom can (no H bonded
  twice, no two atoms closer than any bond); atoms of two structures taken
  in turn are parted every other one, where each part is then whole. Where
  neither tells them apart, the card says the columns came mixed and that
  structure cannot be ticked - nothing is guessed.
- **What looks wrong**, said in the card: a count the text gives that is
  not the atoms found; an atom more than 4 Å from every other; two atoms
  closer than 0.6 Å (H2's bond, the shortest, is 0.74).
- Tested on texts made up for the tests - water, methane, ethanol set out
  as a supporting information's pages set them, with page ends, two
  columns, running heads and feet and broken lines; no paper's text.

### Calculation output

| Kind | Told by | Read by |
| --- | --- | --- |
| ORCA, Gaussian, xTB output; Gaussian formatted checkpoint; since step 3, every program cclib reads | each program's banner, as the plugins added that read it bring it in their manifests | the ORCA interface (plugin, uv; ORCA's output), the Gaussian interface (plugin, uv; Gaussian's output and its checkpoint) and the xTB plugin (plugin, pixi; xtb's output, a job's log read the same way, and its frequencies in Gaussian's form), each for what its program writes; cclib (plugin, uv); PySCF (plugin, pixi; ORCA, Gaussian and the checkpoint only) |
| Molden file | `[Molden Format]`, as PySCF's manifest brings it | PySCF |
| Cube file | its layout: two comment lines, four lines of a count and three numbers (`CUBE_MARK`) | cube (built in, web worker) |

A reader is a process of its own - a Python sidecar for a plugin, a web
worker for a built-in - spoken to in JSON lines (`lib/calc/client.ts`,
`builtin.ts`). Every reader added that reads a kind reads it, and what each
finds is kept as its own (`combine`); Meno checks every answer (`checked`,
`readResults`) - the same checks a saved workspace's results go through.

## What goes out, as built

| Way out | Written by, where | Kinds | Carries |
| --- | --- | --- | --- |
| **Save, Save As** (`fileActions.ts`) | main thread, then Meno's writer of documents (`writeDocument`, `src-tauri/src/savefile.rs`) | `.meno` only | everything on the page, with the files it keeps |
| **Export…** (the selection's menu; `fileActions.ts`, `lib/io/writers.ts`) | main thread, or the plugin that writes the kind | MOL, SDF, RXN, PDB, XYZ and SVG by Meno; for molecules in 3D, what the added plugins write | the selection: the drawing; SDF each molecule in 3D at the frame shown, or every frame a record; PDB the molecules in 3D alone; XYZ the molecules in 3D alone, their atoms only, a block a frame; SVG the page as drawn, molecules in 3D as a picture, no record |
| **Copy, Cut** (`clipboardActions.ts`) | TS makes each flavour, Rust puts them on the clipboard (`clipboard.rs`) | Mac: the record, MOL, RXN, GVML (with EMF), PNG. Windows: the record, MDLCT and MOL, RXN, GVML, PNG, EMF, DIB, or an OLE object in place of GVML and PNG | the record carries molecules in 3D and their results; a surface promised stays a promise |
| **Copy as SMILES** | RDKit, then the clipboard as text | SMILES; a reaction SMILES, "reactants>agents>products", where the selection shows one reaction - its molecules in their roles as an RXN file has them (`reactionForSmiles`, the worker's `rxn_to_smiles`) - and refused, saying why, where it shows more than one arrow or nothing on one side of it: never its molecules as one mixture (2026-10-22) | the selection's structure |
| **Office live link** (Windows) | TS, then Rust `ole_update` | the record and EMF in the object | as `.meno` does, the surface shown included |

Every file a chemist chooses where to put - a workspace saved, an export,
a text, a style, a procedure, a picture or film, a PDF - is written by one
writer, whole or not at all (*Save and Export*, *A document is written
whole or not at all*). Meno's own files, kept in its folders - its
settings, its environments' notes - are not.

Never written: PNG or EMF as files, anything printed or dragged out.
Plugins write nothing that leaves them (a temporary copy of the output,
deleted); the chemistry worker answers over its pipe.

A saved workspace keeps each molecule's results and, for a promise, the
output's name and SHA-256: the value of the one shown is kept; the others
are asked for again only once that output is opened in the session, by the
reader that gave them, added.

### XYZ written

Export offers XYZ for molecules in 3D (the selection's menu, beside MOL,
SDF and PDB; molecules in 3D alone: the format holds no drawing and no
bonds). There is no official specification; Meno writes the common
definition (`writeXyz`, `lib/chem/xyzWriter.ts`):

- Line 1: the number of atoms. Line 2: a comment. Then one line for each
  atom: its element's symbol (padded to two), then x, y and z in ångströms,
  each with eight decimals, in columns. A file of several frames repeats
  the block, with no blank line between.
- The atoms are in the order the molecule has them (the numbering a
  calculation uses, counted from 1) - never reordered - hydrogens included.
  Charge, isotope and unpaired electrons are not written: the format has no
  place for them.
- The comment is the molecule's name (the file's own name where it has
  none), then, where there are several frames, `frame i/n`, then, where the
  frame's energy is known, `E = <hartrees to ten decimals> Eh`: for
  example `water frame 2/3 E = -76.0261000000 Eh`. On one line, and plain
  text, which programs that read the layout take as a comment. No method
  is written: Meno does not hold one for an energy.
- The writer's option *Molecules in 3D* says the frame shown (one block a
  molecule) or every frame (a block each, in order). Several molecules
  selected are written as SDF export writes them: one after another, each as
  it is in its file - not placed on the page as one system.
- Meno's own reader reads the file back: the same atoms in the same order,
  the coordinates to the eight decimals, and, of a file of more than one
  frame, each frame's energy by that `E = ... Eh` pattern - a pattern of
  Meno's own, which needs no plugin (a program's patterns are its plugin's;
  `utils/xyzEnergies.ts`). A one-frame file's energy is written but, as for
  any one-frame XYZ, not read.

### The settings file

Meno's settings are kept in `settings.json` in its data folder. Since
2026-10-21 it holds only what the user changed - what differs from the
defaults - and not every setting (the maintainer: so that a default changed
later reaches everyone who never touched it).
- Within a setting, only the part changed is written: one plugin's role,
  not the plugins' other settings.
- A drawing style chosen, and a 3D style chosen, are written whole where any
  part changed. A preset and its changes are read only together; a 3D
  style's two looks are never the same.
- What the file does not hold is the default as it is then. A file written
  before holds every setting; it is read as it is, and written back with
  only what differs from the defaults now. A value it held that is no
  longer the default - 2x drawing resolution, say - stays as it was.
- A value the user sets that is the default as it is then is not written:
  it is the default, and follows it if the default changes later. Only a
  value that differs from the default is kept as the user's own.

## What is unclear today

Each point is resolved by the plan below (see *Every point resolved*).

1. **"Reader" means two things.** `lib/calc/readers.ts` holds a
   `CalcReader`: two patterns for the energies CREST, xtb and ORCA write on
   an XYZ file's comment lines. It says these "are to become plugins".
   `lib/calc/catalog.ts` holds the reader plugins. The two share no code
   and meet only in `Molecule3D.energies`.
2. **What a file is, is decided in five places.**
   - `openedAs` decides the tab, from the extension, `detectFormat` and
     `outputKindOf`.
   - `processFileContent` decides again, and always asks `detectFormat`
     first. A calculation output that holds a `V2000`, a line ending
     `M  END`, or starts like an XYZ file is read as a structure.
   - The drop's `STRUCTURE_FILE` pattern decides by extension.
   - The clipboard's order decides by flavour.
   - Each reader detects again inside itself: cclib's `ccread`, and PySCF's
     own Molden test.

   The order goes by family - structure formats before outputs - not by
   how strong the evidence is.
3. **Built-in readers are listed twice:** in `READER_PLUGINS`, and in
   `builtinWorker.ts`'s own map, kept in step by hand.
4. **A reader is found by its shown name.** Results keep `from` as
   "name version", and `asks.ts` and `sources.ts` find the plugin by the
   name's start. A renamed reader would lose its results' promises.
5. **The cube reader is listed in Settings beside the plugins**, as
   "Comes with Meno", with an overlap row of one choice. MOL, SDF and XYZ,
   which Meno reads as it reads cube, are not listed.
6. **A calculation's geometries come in as XYZ text.** `calcResult` writes
   them as an XYZ file (`xyzOf`) and reads that back.
7. **Every reader added reads every output of its kind**, and opening
   waits for the slowest (`Promise.allSettled` in `readOutput`).
8. **A reader that fails is said only to the developer console.**
9. **Office's record reaches the canvas under a made-up name,
   `office.meno`**, so the `.meno` suffix stands for two formats.
10. **Open reads every file as text, through an `<input>`, and keeps no
    path.** As a result:
    - the first Save always asks for a name;
    - a saved workspace cannot find the output its promises came from
      (WORKSPACE.md planned to keep "where its output was");
    - a binary kind cannot be read.
11. **Closing a tab with unsaved changes offers no Save.**
    `ConfirmDiscard` still says that nothing can be saved yet.
12. **SMILES is copied two ways.** The menu goes through Meno's clipboard
    (Rust); the SMILES panel's button goes through the browser's.
13. **SMILES is parsed two ways.**
    - What the chemist types or pastes goes to RDKit.
    - The SMILES of abbreviations, ligands, reagents and counter-ions go to
      Meno's own parser (`lib/chem/smiles.ts`). It is a reader for part of
      OpenSMILES, made for the groups Meno's dictionary stands for:
      - the organic subset, and atoms in brackets (isotope, hydrogens,
        charge);
      - aromatic atoms, branches, ring closures and bonds;
      - `*`, and atom classes;
      - `@` and `@@` kept for the layout engine. Other stereo marks are
        read past.
    - The chemist's own abbreviations, typed in Settings, go to Meno's
      parser too.
    - Meno also writes SMILES itself, for an abbreviation made from a
      selection.
14. **The clipboard has gaps.** XYZ text is not recognised. The EMF and DIB
    flavours are written but never read.
15. **An RXN cannot be dragged in on Windows** (`drop.rs`'s kinds).
16. **PDB and KET are offered by Open and then refused.**
17. **Code no path reaches:** the RXN branch of `readMoleculesFromText`.
18. **Writing where the chemist chose relies on the dialog plugin** adding
    that path to the file scope. That is right, but it is said nowhere.
19. **ARCHITECTURE.md is out of date.** Its format table lacks
    calculation outputs and the writers, and it still calls `lib/calc`
    "energies, for now".

## The plan

### Decided by the maintainer, 2026-10-06

- **Meno is not a plugin.** Its own parts come with it. The Plugins tab
  lists plugins only, and a tab named for files holds who reads and
  writes each kind.
- **PDB and other formats are read too**, by a plugin or by Meno.
- **One reader reads a kind**, as assigned for that kind in a single
  table. Readers can still read together: others added for a kind read
  as well, and their results are combined.
- **A plugin's drawing comes in the record's form.** A writer's options
  are declared in a general form and drawn by Meno.
- **Save and Save As write `.meno` only.** Everything else is Export.
- **Meno's own readers sit behind the contract, all in a web worker.**
  What they give is handed back compactly, its coordinates in buffers -
  decided once the measurements were seen (see *Response*).
- **RDKit is a plugin.** No plugin is kept running ahead of need: each
  starts when first needed and stays for the session, as RDKit does now
  (PLUGINS.md). Since 2026-10-13 a worker unused for 15 minutes is
  stopped, and started again when next needed.

### The line

- **Meno's core keeps what is Meno's own.** That is:
  - the drawing, the molecules in 3D, what is known of them, and how
    they show;
  - `.meno` and the record;
  - the table of kinds;
  - putting answers together and checking them;
  - the files themselves: opening, saving, the clipboard, Office.
- **Every other format is read and written by a reader or a writer**, a
  plugin's or one of Meno's own parts, under one contract.
- **Only Meno touches files.** A reader is given a file's content, never
  its path. A writer gives back content, and Meno writes it where the
  chemist chose.

### The contract for files

PLUGINS.md's contract, with three requests for files:

- **`read {kind, name, text}`** gives any of:
  - **molecules in 3D** - atoms, geometries, each one's energy, and what
    the calculation was, with bonds where the file says them (an SDF's
    bond block, a PDB's `CONECT`). Where it does not, Meno finds the
    bonds as for an XYZ file;
  - **a drawing**, in the record's form, read by Meno's own record reader
    with its checks;
  - **results** in the general form, any of them a promise;
  - of a file of several jobs one after another - Gaussian's Link1,
    ORCA's `$new_job` - **one output for each job**, in order (`jobs`),
    each saying which job it is and what it did (`job: {number, of,
    kind}`): each opens as a molecule of its own, side by side, its
    geometries, energies and populations its own, and its job said in
    the line of what the calculation was ("job 1 of 2, optimisation").
    The answer's own fields are its last job's. A route run in steps -
    Gaussian's Opt Freq - is one job (the maintainer, 2026-10-13;
    PLUGINS.md, *The contract*). An ORCA job the program went on from to
    the next came to its end: ORCA says it once, at the end of the file,
    and each job before the last was said, until 2026-10-22, not to have
    come to its end. Gaussian's Link1 jobs each say their own end, and are
    held to it: one without it did not come to its end;
  - **`converged`**, of an optimisation's or a relaxed scan's geometries,
    each one's being one the run found converged; and **`unmarked`**,
    where all are false for a reason of their own: `error`, `cut`,
    `path`, `unstated` (docs/WORKFLOWS.md, *Compound sets and conformer
    sets*).
- **`ask {kind, key, name, text}`** gives a promise's value.
- **`write {kind, name, molecules, options}`** gives the file's content
  (`{text}`); Meno writes it where the chemist chose.

In each:

- **`text`** is the file's text: every kind a plugin reads so far is text (a binary kind, when one comes, will need its own field).
- **The kind is decided by Meno** before anyone is asked; a reader may
  answer that it cannot read the file.
- **Each reader and writer is known by its id.** Names kept by
  workspaces saved before are not read as ids: no reading of what was
  saved before, for now (the maintainer, 2026-10-06).

### Who reads and writes each kind

The tab named for files (PLUGINS.md, *Settings*) has a row for every kind
Meno knows of:

- **Read by:** one - Meno, or a plugin added that reads it.
- **Also read by:** none at first. The chemist may add any plugin that
  reads the kind; each then reads the file as well, and its results join
  under its name, as #147 keeps them. Example: a Gaussian output read by
  cclib, with PySCF added to draw its orbitals.
- **Written by:** one, where anything writes the kind.

How these behave:

- **Defaults.** A kind Meno reads stays Meno's when a plugin that reads it
  is added. A kind nothing read goes to the first plugin added that reads
  it.
- **Opening.**
  - The reader assigned reads the file, and what it gives shows as soon
    as it answers.
  - The others read alongside, and their results join as they come, so
    a slow one never holds the file up.
  - One that fails says so on the molecule, by name.
- **What Meno keeps one of** - the geometries, the drawing, what the
  calculation was - comes from the reader assigned. The others give
  results only.

### Open, drop, paste

- **One table of kinds** (`lib/io/kinds.ts`, built in #150) holds, for
  every kind:
  - its id, name and marks;
  - its extensions;
  - whether it is text or bytes.

  Readers and writers name kinds by these ids.
- **Kinds are registered, not only listed by Meno** (the maintainer,
  2026-10-06), so that a plugin can read a program Meno has never heard
  of:
  - **Meno registers its own kinds only**, by id: the workspace, the
    record, MOL, SDF, RXN, XYZ and cube. **It knows no program** (the
    maintainer, 2026-10-06, on seeing Gaussian and ORCA listed with no
    plugin added): every kind of a program's output comes from the
    plugins that read it.
  - **A plugin registers its kinds in its manifest.** That is data in its
    folder, beside its worker and its lock, and it lists the kinds the
    plugin reads and writes:
    - one of Meno's own kinds by its id;
    - a kind it brings, with its id, name, extensions and marks. A plugin
      knows of no other: two that read the same kind each bring it, by
      the same id. cclib brings every program it reads.
  - **The manifest is read when the plugin is added**, never asked of the
    running plugin, so nothing is started to learn what a plugin reads.
    Its kinds join the table then, and leave it when the plugin is taken
    away, unless another plugin added registers them too.
  - **Two plugins that register the same id** give one kind - the first's
    name, their marks put together - with both in its row in Files.
  - **A file no plugin added reads** opens as text - unless a plugin on
    offer, added or not, would read it: then Meno says which plugin to
    add (the maintainer, 2026-10-06: against the ideal, but needed for
    those new to Meno). The kinds of the plugins on offer are looked at
    for this only.
- **Marks are data.** A mark is text that a file's first 64 KiB holds,
  anywhere or at a line's start, with runs of spaces counted as one.
  - No code, and no regular expression, is taken from a plugin: a pattern
    can be written so that matching it never ends, and holds the page up.
  - **A kind told only by how it is laid out** is told by its plugin when
    asked: `probe {kind, name, head}`. Meno asks only where nothing
    stronger decided and the file's extension is one of the kind's.
    Asking starts the plugin, as opening the file needs it anyway.
  - **No plugin claims what is not its own.** When a plugin is added, each
    of its marks is tried on samples of Meno's own kinds, which Meno
    carries. A mark one of them would match is refused, and the plugin is
    added without it, as Settings says.
- **What a file is is decided once, by content, strongest evidence
  first:**
  1. Meno's own records;
  2. a program's banner, as a plugin brings it - the first in the file,
     where an output quotes another program's;
  3. CTfile and RXN markers;
  4. a PDB's records;
  5. a cube's layout;
  6. an XYZ file's layout;
  7. a plugin's `probe`.

  The extension decides only where the content does not; where neither
  does, the file opens as text. Open, a drop and pasted text all ask this
  one decision. The clipboard's flavours keep their own order, since a
  flavour is already a kind.
- **Open uses the system's dialog through Tauri**, so Meno has the file's
  path. It reads bytes, and decodes the text kinds. It offers `.meno`,
  text, and the kinds something reads: Meno, or a plugin added - and,
  the kinds the plugins Meno carries but not added read (PLUGINS.md, *A
  plugin to suggest for a file*). A file whose reader is not added says
  which plugins would read it, with Add. What a plugin added
  writes or colours - a Gaussian or ORCA input - it offers as text, to be
  read and changed in a workspace's column (2026-10-07).
- **A file's text is read as its bytes are written** (2026-10-13,
  `lib/io/text.ts`). Open, a drop, a file pasted and an output read again
  all read it so:
  - as UTF-8;
  - as UTF-16 where a byte order mark says so, either way round, or
    with no mark where its start has NULs - which no UTF-8 or Shift_JIS
    text has - nearly all on one side of each pair (the high byte of
    Latin letters, digits and line ends: a text mostly in Japanese has
    some, one in English half), and read that way round is nearly all
    letters a text holds;
  - bytes that are not UTF-8, as Shift_JIS, which Windows in Japanese
    writes text in;
  - those that are not Shift_JIS either, as Windows-1252.

  A file of no kind Meno reads is held as a text by Open as by a drop,
  unless it is bytes (a NUL in its start, once read as above) or of a kind
  Meno says it does not read yet: those are said so by both alike.

  A text is held with its lines ended "\n", however its file ended them.
  Text Meno puts on the clipboard on Windows has them ended "\r\n", as
  Windows programs take it - copied through the menu or with the keys
  (2026-10-14). Export writes a text beside its original as
  UTF-8, its lines ended "\n" and with no byte order mark, whatever its
  file was written in: Meno holds the text, not the bytes it was read from.
- **Office's record is handed to the canvas as the record**, not under a
  made-up name.

- **A PDF** opened or dropped goes onto the page of the workspace in front
  (docs/PDF.md), held in Meno's cache by its SHA-256; a workspace's file
  keeps it, stored as it was (`application/pdf`). A PDF copied in the
  Finder or Explorer and pasted goes there too, as a file dropped does.
- **A picture** - a PNG or a JPEG opened or dropped, or a picture pasted
  where nothing on the clipboard reads as a structure - goes onto the page
  likewise (docs/PDF.md, step 4a), held this session by its SHA-256
  (`lib/picture/held`); a workspace's file keeps it, stored as it was
  (`image/png`, `image/jpeg`).

### Save and Export

- **Save and Save As write `.meno`.**
  - A workspace opened from a `.meno` file is saved back to it.
  - Anything else asks for a name the first time, so the file it was
    opened from is never overwritten.
  - The workspace keeps, for each output, where it was as well as its
    SHA-256. A promise is asked for from there when the file is still
    there and unchanged, and Meno may still read it. Otherwise it asks
    for the file, as now.
- **Closing a tab with unsaved changes** asks, with Cancel, *Close
  without saving* and Save.
- **Export…** (on the selection's menu since 2026-10-10: what is
  selected, Select all first for the whole page) offers every kind a
  writer added writes, each written by the one assigned:
  - MOL, SDF, RXN, PDB, XYZ and SVG, by Meno;
  - Gaussian's input, by its plugin, where it is added (step 7).

  The writer says what it takes: what is selected on the page, or, for a
  plugin's, the molecules in 3D selected, as one molecule. Meno shows the
  writer's options, then asks for the file's name.

  The name it suggests is never the file the canvas was opened from, as
  Save's never is (the maintainer, 2026-10-07, after the v0.1.7 Windows
  check): where it would be, the first free name beside it, numbered from
  2 - `cholesterol-2.pdb`.
- **Copy stays as it is**: the record and the clipboard's flavours, not
  Export. The SMILES panel copies through the same clipboard as the menu.
- **A document is written whole or not at all** (2026-10-21; `writeDocument`,
  `lib/io/writeDocument.ts`, and `write_document`, `src-tauri/src/savefile.rs`).
  Every file the chemist chose where to put - Save, Save As, Export, a
  text exported, a style, a procedure, a picture, a PDF - is written beside
  where it goes first, under a hidden name of its own (`.work.meno.<id>.part`),
  made to reach the disk, then put in its place in one step. A save that fails
  part way - the disk full, the drive taken away - leaves the file that was
  there byte for byte as it was, and nothing of its own beside it; the
  failure is said. Meno stopped as it writes leaves the file as it was too,
  its hidden copy perhaps beside it; the next save of that file takes away
  such a copy left more than six hours before (`sweep_parts`): one can be as
  large as the file.
- **A workspace's file is never larger than Meno can open again** (#555).
  Opening reads the whole file into the page, and the reader takes no ZIP64
  (`lib/binary/zip.ts`), so a file of 4 GB or more would never open. On a
  Mac (32 GB, macOS 26) workspace files of 0.5, 1, 1.5 and 2 GB all opened
  (2026-10-22); a save of a `.meno` is held to half of that, 1 GB
  (`MOST_WORKSPACE_FILE`, `src-tauri/src/keptjobs.rs`, and
  `lib/doc/menoFile.ts`). Past it the save is refused before the new file
  takes the old one's place, which is left as it was, and the failure says
  how large it would have been. This holds whatever the workspace keeps:
  before #555 nothing held its total, and several files of up to 1 GB each
  could add up past it.
  - The file keeps what it had besides its bytes - it is the chemist's too
    - as far as the system lets it be kept: a new file takes the old one's
    place, and would else have the folder's defaults. Its permissions; on
    a Mac and Linux its owner and group, where the system lets the user
    give them (the user's own file; another's group the user is in); on a
    Mac its extended attributes - a Finder tag, where it was downloaded
    from - and its access list (copyfile(3), `COPYFILE_XATTR` and
    `COPYFILE_ACL`, and not `COPYFILE_STAT`: the file is new, and has its
    own time of change). On Windows it is put in place by ReplaceFileW,
    which keeps when the file was made, its short name, its object id, its
    access list, its security attributes, its being kept encrypted or
    compressed, and its other streams. Only the permissions failing fails
    the save; one of the rest that cannot be kept - another user's file, a
    file system that keeps none - is logged, and the new work saved, never
    lost for it.
  - What no save that puts a new file in place can keep: hard links. A
    file with a second name elsewhere has the new bytes under the name
    saved to; the other name still holds the bytes as they were. On Linux
    a file's extended attributes and access list are not carried over. A
    file whose access list forbids deleting it (on a Mac, `deny delete`)
    cannot be saved over: it is left as it was, and the failure said.
  - On Windows, a file held a moment by another program - an antivirus
    looking into the new file, a cloud drive syncing the old one - is tried
    again: five tries over a second (`ERROR_SHARING_VIOLATION`,
    `ERROR_LOCK_VIOLATION`, and `ERROR_ACCESS_DENIED`, as Windows says of a
    file open elsewhere without leave to delete it; whether the file may be
    written at all was looked at before). That look - the file opened to
    write it, and closed again - is tried again the same way while the file
    is held by one that lets no one else open it, as a spreadsheet program
    holds a file it saves (`ERROR_SHARING_VIOLATION`,
    `ERROR_LOCK_VIOLATION`); a file that may not be written
    (`ERROR_ACCESS_DENIED`, kept read-only) fails at once. ReplaceFileW is always given a
    hidden name to keep the old file under until the new one is in place,
    so the file is never gone: where the system leaves it under that name
    (`ERROR_UNABLE_TO_MOVE_REPLACEMENT_2`), it is named as it was again,
    and the save fails; where even that cannot be done, the failure says
    what it is now named. Done, the hidden copy is taken away. Where the
    access list cannot be merged - the user may not set it - the file is
    still saved, as a plain rename would have saved it
    (`REPLACEFILE_IGNORE_MERGE_ERRORS`, `REPLACEFILE_IGNORE_ACL_ERRORS`).
  - Saved through a link, the file the link points at is written, and the
    link stays a link.
  - A file that could not have been written to in place - kept read-only, a
    folder of that name - is not written over.
  - It writes only where the page may write through the file system plugin:
    a file picked in Open's or Save's dialog, dropped, or opened from outside
    Meno (that plugin's scope; for a link, the file it points at). A path
    that steps up (`..`) is refused, as the plugin refuses it.
  - **Meno's own files are written the same way** - `settings.json`, its
    environments' notes (`writeAppFile`, and `write_app_file`, which writes
    only a path inside Meno's data folder or its local one: never a whole
    path, one that steps up, or one a link leads out of the folder by), the
    window's size and place, and how a conda-forge environment is activated
    (`activation.json`). A settings file left half written would lose every
    setting. Not so written, as nothing is lost by them: the logs, which
    are added to; what is fetched and kept to be fetched no more (a PDF
    held, the wwPDB's components, the tools that make environments, a
    plugin's files), each written beside and put in place, and fetched
    again where it does not read; a job's own files, made before the job is
    named, and its state, written beside and put in place.
- **Never over a file another tab holds** (2026-10-21; `writtenWhere`,
  `fileActions.ts`, and `heldElsewhere`, `lib/doc/savers.ts`). A Save As
  onto the file another tab's workspace is saved to - known by its one
  true path, however it was written - would write it, and that tab's next
  save would overwrite it unseen. It is refused, as a save's failure is
  said, naming the tab as the tab bar does: "Save failed: that file is
  open in the tab "aspirin.meno"; save there, or close it first." Nothing
  is written. A tab saving to its own file, or to a file no tab holds, is
  saved.
- **One save at a time** (`lib/doc/saveTurns.ts`). Save or Save As asked for
  while a save of the same workspace is under way waits for it, then runs
  once - however many times it was asked for meanwhile - writing the
  workspace as it is when it begins; one that fails does not stop the next.
  Ctrl/Cmd+S held down saves once, as it is pressed. What changes while a
  save writes is still unsaved after it, as before.
- **One file, one tab** (2026-10-21; `true_path`, `src-tauri/src/truepath.rs`,
  and `lib/io/truePath.ts`). A workspace is known by its file's one true
  path: the path the file system itself has for it - every link followed,
  no step up (`..`), each name in the case it is kept in (and, on a Mac, in
  the form of its accents it is kept in), on Windows a long name for a
  short 8.3 one, and written plainly (`C:\...`, `\\server\share\...`) where
  that names the same file. So a file opened again through a path written
  otherwise - in another case, where the file system takes no notice of
  case, as Windows' and a Mac's as it comes do; through a link - brings
  forward the tab that holds it, never a second tab whose saves and the
  first one's overwrite each other (`tabHolding`, `lib/doc/savers.ts`).
  - Every way a workspace file comes in is given it: opened from outside
    Meno, dropped or pasted, in the app (`opened.rs`); picked in Open's
    dialog, by the page (`openEachOnce`). A save writes where the dialog
    said, then holds the file's one true path (`writtenWhere`,
    `fileActions.ts`): a file not there yet has its folder's, with its name
    as given.
  - The file system plugin's scope takes the one true path of a file
    picked, dropped or opened from outside as the file itself: it matches
    a path by its own one true path, and holds a file allowed by its path
    as given and by that.

As this part of step 5 was built (#155, from main beside step 3):

- **A workspace opened from its `.meno` is saved back to it.** Open hands
  the canvas the file's path, and Save writes there. The dialog put the
  file in the write scope as it was picked. Anything else opened is
  saved nowhere yet, and Save As suggests its name in its folder.
- **Export asks first, in a card over the canvas**, for the kind and its
  options, then for the file's name.
  - The kinds offered are those the canvas can be written as. The first
    is the kind of the file it came from, else the one chosen last time.
  - Each kind's options are declared by its writer in the general form
    (`lib/io/writers.ts`, `lib/options.ts`) and drawn by `OptionsForm`.
    An option about the drawing, or about the molecules in 3D, is shown
    only where the page holds them.
  - The last choices are remembered in the settings, by role
    (`options`: `export`, `write:sdf`, ...).
  - **MOL, SD and RXN files** may be written in V3000. Otherwise they are
    written in V2000, or in V3000 where they need more than V2000 holds,
    as before.
    In an SD file the choice holds for its records in 3D too, and is
    offered where the page holds molecules in 3D alone.
  - **An SD file** may hold every frame of each molecule in 3D, a record
    each, numbered, with its energy where it is known
    (`> <Energy (Eh)>`). Beside it: why a frame did not finish
    (`> <Failed>`); the charge and spin multiplicity every step is told -
    what it was given, by a calculation or the chemist, else what its atoms
    say - (`> <Charge>`, `> <Multiplicity>`; none of a skeleton); and its
    imaginary frequencies in cm-1 as its calculation gave them
    (`> <Imaginary frequencies (cm-1)>`), `none` where its vibrations were
    worked out and it has none, the item left out where they were not -
    frame by frame for a conformer set, each conformer's as its own job
    found them, as a step reads them.
    After them, what else was found of that frame - a model's value, a
    descriptor, what it was made from (`made_from.nll`) - each under its
    own name, as a structure drawn's record writes its properties (below):
    a number worked out with its unit beside its name (`mw (g/mol)`), one
    not worked out saying why in place of a value. None where the molecule
    does not hold them one for each frame, and the export says so ("2
    properties could not be written for ...: they are not one for each
    frame"). A property named as one of Meno's own items (`Charge`,
    `Multiplicity`, `Energy (Eh)`, `Failed`, `Imaginary frequencies
    (cm-1)`, and a record's `State`, `Set aside`, `Stale`, `From`) is
    written under that name and "(property)", here and in a structure
    drawn's record, and the export says so: read back, a second `Charge`
    would be taken for the species. A property whose value is a table - a
    conformer's vibrations, one row for each - is not written, here or in
    a record: on one line it passes the 200 characters an SD data line
    may hold at about 20 atoms. The export counts and names them ("3
    properties not written, "vibrations": an SD file does not hold a
    table"); the imaginary frequencies item above still says what they
    found. They are written only: opened
    again, an SD file's items other than `Charge` and `Multiplicity` are
    not read back into a molecule in 3D.
    Opened again, an SD file's `Charge` and `Multiplicity` are what a
    molecule in 3D was given, its atom block as it is - only where nothing
    speaks against them; each not taken is named ("Part of the file not
    taken"), never guessed at. Not taken: an item given twice, or not one
    whole number (a multiplicity, one or more); a charge other than the
    one its atoms carry, where they carry one (where they carry none - a
    radical cation from a calculation - it is taken); and both, where the
    electrons they leave cannot have the multiplicity.
    Each keeps its atoms' charges, radicals and
    isotopes, as a copy's MOL file does (docs/CTFILE.md). Each frame - the
    one shown, or every one - is written with the bonds it has, as the
    page shows them: a trajectory's bonds, found from distances, form and
    break as its frames go. A copy's MOL file, a PDB file and what a
    plugin's writer is given are the same.
  - **An SD file of a workflow's structures drawn** - a set selected,
    with the records it carries of them (a step's products, what was
    worked out of them) - has a record for each, titled with its number,
    its record after it as data items: `State` (finished, failed or set
    aside) and `Failed` or `Set aside`, why; `Stale` where the structure
    was edited since its values were worked out (none of them written
    then); `From`, what it was made from; and each property under its own
    name - a number worked out with its unit beside it as the page shows
    it (`mw (g/mol)`) - its number, `made.how`, the values of what it was
    made from (`made_from.nll`) among them: a number with every digit it
    is held to; one not worked out saying why in place of a value, under
    its bare name. A value worked out of the structure as it is is written
    whatever a later step did, beside its `State`: a step on structures
    drawn answers for a structure whole, and one it set aside or failed
    is given none of its values. A text value's lines never end its item
    nor begin another: a blank line is written as one space, and one
    beginning `>` or `$$$$` with a space before it. Every structure a set
    holds is written - those it shows, then those it holds off the page,
    in its order: holding is for the page alone - of a set selected, and,
    nothing selected, of every set on the canvas. The rest of what is
    drawn is one record, as before. A MOL or RXN file, one molfile, holds
    no records: what a set holds off the page is not written there, and
    Export says so ("N structures this set holds off the page were not
    written; export the set as SD to write them all").
  - **SVG** takes no options yet. Whatever a document gives it as text -
    labels, words, a typeface's name, a colour - is escaped, in elements
    and in attributes alike, and a character outside the range XML takes
    (the controls but tab and the line breaks, a surrogate without its
    pair, U+FFFE and U+FFFF) is drawn as the replacement character, so
    the file is well-formed whatever was pasted.
- **What a writer takes** is said by it (step 7): Meno's own take what is
  selected on the page; a plugin's, one molecule - the molecules in 3D
  selected, several as one system. A plugin's writer is offered only where
  the selection holds molecules in 3D.
- **Outputs are found again by path.**
  - A molecule read from an output keeps where the output was, where
    Open said (its `source.path`), with its SHA-256. A workspace saves it.
  - A promise asked for when the output is not open this session is
    asked for from the file there - read only where Meno may read it, and
    taken only if its SHA-256 is the same.
  - **Where it cannot be had** - Meno may no longer read it there after a
    restart, it has moved, or it has changed - the list says to open it
    again, with *Find <name>…*. That opens the system's dialog at where the
    output was, and the file chosen is taken only if it is the same output.
    Once taken, the promises that waited on it are asked for again.
  - A saved workspace holds an output's path only where it does not
    keep the output itself (*The workspace file*): where the file was on
    the computer that saved it.
- **Meno's writers behind the contract** came with the first writer that
  is not Meno's - Gaussian's input, in step 7 - so that the contract was
  shaped by both (*As step 7's writer was built*).

### The workspace file

Decided by the maintainer, 2026-10-06, with PDFs to be pasted later in
mind: `.meno` is a zip, laid out as EPUB and ODF lay theirs out - not
Word's OPC, whose content types and relationships Meno has no use for.

```
work.meno (zip)
  mimetype          first, stored: application/vnd.kfchem.meno+zip
  workspace.json    stored: the workspace, the JSON `.meno` was before
  files.json        stored: each file kept - name, kind, media type, size
  files/<sha256>    each file kept, as it was: text and a step's jobs' files
                    deflated, the rest stored
```

- **The workspace stays JSON, uncompressed.** Measured in Node before the
  decision (median of nine, with a 2.5 MB cube, a 0.4 MB output and 5 MB of
  PDF-like bytes kept beside it):

  | Workspace | As JSON | Zip, JSON stored | Zip, JSON deflated |
  | --- | --- | --- | --- |
  | 2000 atoms, 200 frames (0.55 MB) | 1.4 ms | 1.4 ms | 3.5 ms |
  | 2000 atoms, 2000 frames (3.2 MB) | 8.0 ms | 8.0 ms | 22.3 ms |

  Stored, it opens as fast as before and reads as it is once unzipped.
  Deflating it would cost 4 to 5 ms a megabyte to save a little room.
- **Files kept are read only when wanted**, each by its SHA-256 - the cube
  above in 9 ms - and taken only if they are what it says. Text (a
  calculation's output, a cube) is deflated; a PDF or a picture is kept as
  it was.
- **A calculation's output opened is kept in the workspace** (the
  maintainer: kept, and seen as needed). Saved, the workspace keeps every
  output its molecules were read from that is held this session - opened,
  or kept in a workspace opened - or can be read again, unchanged, where
  it was. Opened, a workspace holds what it keeps
  for the session. A molecule's menu shows its output in the workspace's
  column of texts (*Show <name>*); where it is held nowhere, it is read
  again where it was, or else the system's dialog asks for it
  (*Find <name>*).
- **A workspace's styles are kept in it**: its drawing style (`style`,
  docs/WORKSPACE.md, *Drawing style*) and its styles in 3D (`style3d`,
  *Styles in 3D*) - `primary` and `secondary`, each `{ id, name, look }`
  with the whole of its look (a built-in style's id, or one of the user's
  own, `own-` and a UUID), and `scene`, the light it is seen in
  (`ambientLight`, `keyLight`, `shadows`, `surfacePlus`, `surfaceMinus`,
  `ribbonColours`). So it opens the same on any computer. A file saved
  without `style3d` - before workspaces carried them, or a procedure's -
  opens in Settings' styles in 3D as they are then, and keeps them.
- **A workspace's texts are kept in it too** (the maintainer, 2026-10-07:
  held in the workspace, editable, written back by Export). Each is a file
  kept, `text/plain`, by its SHA-256 - one that is an output's words kept
  once - and `workspace.json` lists them in order (`texts`: each one's
  name and SHA-256 - and, a text with a sheet on the page, the sheet's top
  left, `at`, `icon: true` where it is made an icon, and `reading: false`
  where its column has no tab for it; a text with no sheet, what it is the
  text of, `of` - a step's log its step's id, an output its molecule's
  place among `molecules3d`;
  docs/PDF.md, step 5) with the one its column showed (`textShown`). Where a
  text was opened from is not saved, as an output kept is not. A text the
  file does not hold whole is named as the workspace opens, and kept as
  one that could not be read (below, *A file kept, damaged*). A PDF
  read in the column keeps where it was read (`reading`, in its entry in
  `pdfs`), and `pdfShown` names the one the column showed, in place of
  `textShown` (docs/PDF.md, step 2). Words on the page taken out of a PDF
  keep where they came from (`captions[].from`: the PDF's SHA-256 and two
  places in it; docs/PDF.md, step 3), and words given a size of their own
  or letters marked keep them (`captions[].size`, in points, and
  `captions[].marks`: ranges of their letters, each bold, italic, a colour
  or raised or lowered; docs/EDITOR-2D.md, *Text*). Pictures on the page are listed in
  `pictures`, each by its image's SHA-256 with its place, size and turn
  (docs/PDF.md, step 4a); one cut out of a PDF keeps where it came from
  (`pictures[].from`: the PDF's SHA-256, its page and the box on it;
  step 4b). Slides are listed in `slides`, in the order a talk shows
  them, each by its middle and its size, `around: true` where the page
  about it is shown while it is (docs/PRESENTING.md). Shapes are listed in
  `shapes`, from the back, each with its kind (a rectangle, an ellipse or a
  line - an arrow is in `arrows`), its corners or ends and what of its
  look is not as a shape is made: a rectangle's corners' `radius` and its
  line's `width`, in points (docs/PRESENTING.md, *Shapes*). Writing by hand
  is listed in `inks`, each piece with its pen, width, colour and strokes -
  each stroke's points as x, y and pressure, three numbers to a point
  (docs/PRESENTING.md, *Handwriting*); writing on a PDF's page is kept with
  the PDF (`pdfs[].inks`, each piece with its page, its points the page's
  from its top left).
- **Written off the page.** The files kept are compressed in a worker of
  their own as the workspace is saved (`lib/doc/menoFileWorker.ts`), so a
  long output never holds the canvas up.
- **Nothing is unpacked to the disk** - but a step's jobs' files, written
  back out when *Show files* asks for them (*A step's jobs*, below). What
  the file says of its sizes is held to limits before anything is inflated
  (`lib/doc/menoFile.ts`): its workspace at most 256 MB, any one file kept
  1 GB, and 10,000 files.
- **Nothing is taken for more, or other, than the file says.** What it
  says of a part's size is not trusted to set room aside by - a few bytes
  may say a gigabyte: each part is inflated a little at a time, stopped as
  soon as it comes to more than it says, and taken only if it comes to
  just that, and is what the CRC-32 the zip's central directory gives for
  it says (`lib/binary/zip.ts`) - so that a byte changed on the disk after
  the file was written, `"x":1` read as `"x":9`, is not taken for data.
  Office's clip format is read the same way. And each file kept - an
  output, a text, a PDF or a picture alike - is taken only if its bytes
  are what its SHA-256 says, so that no file can pass for another held
  this session.
- **A part it cannot open without, damaged, is said to be.** Its
  workspace (`workspace.json`), what it says it holds (`meno.json`) or
  what it is (`mimetype`) damaged, the file is not opened, and the part is
  named: "Its workspace is damaged, and cannot be read.", "It is a Meno
  file damaged where it says what it holds, and cannot be read." A style
  file whose styles are damaged likewise: "It is a style file whose styles
  are damaged, and cannot be read." (`DamagedMenoFile`, the part named,
  so that it can be told from a file that is no Meno file at all.)
- **A file kept, damaged, is that file alone.** The workspace opens with
  the rest; the one damaged - or not in the file at all - is named as it
  opens: a text or a picture in the canvas's alert ("figure.png could not
  be read from the workspace."), a PDF in a notice ("A PDF could not be
  opened"), an output on its molecule when it is asked for. A text that
  cannot be read stays in the workspace, after the texts in the column,
  as what it is - its tab marked, and shown, "notes.txt could not be read
  from the workspace." - never as a text: it has no words to edit, copy,
  export, find or read, and nothing that takes the workspace's texts sees
  it (`textsLost`, store/types `LostText`). Its sheet is not drawn on the
  page; where it lay, what it was the text of and its place in the column
  are kept in the workspace's JSON with its name and SHA-256. It goes when
  the chemist closes its tab, or when a text of the same words comes (the
  same SHA-256), which takes its place. A picture or a PDF stays where it
  lay, crossed from corner to corner (`lib/doc/notHad`), until it is had
  again - the same image or PDF put down afresh, or opened in another
  workspace's file - or is taken away: never healed unseen, never let drop
  unsaid. A PDF Meno holds whole already, where it keeps the PDFs it has
  opened, is not damaged: it is drawn and saved from there, unmarked. Its
  copy there is read back and checked by its SHA-256 before a save keeps
  it, as every file kept is. A save names each of them it could not keep (below); one it
  could - from the file saved to before, or a text's words held after all
  - is in the file saved, and opens as itself from it, the session going
  on with it marked as it was.
- **A list of the files kept that is damaged, gone or not a list is not
  believed.** The files are had without it, each by its SHA-256 and named
  as the workspace's JSON names it - its molecules' outputs, its texts,
  its PDFs and its pictures (`keptNamedIn`) - so that none is dropped by
  the next save; a notice says so ("Part of a workspace is damaged": its
  list of the files it keeps is damaged, and its files were opened without
  it). A file the list leaves out is had the same way. A broken list alone
  never keeps a workspace from opening.
- **Save never drops a file still to be had, and names what it could not
  keep.** A file the workspace has that is held nowhere this session - a
  PDF Meno could not open (one locked with a password), a picture or an
  output held nowhere, an output not where it was, a text that could not
  be read - is taken from the
  workspace file the canvas was last saved to, or opened from, where that
  holds it whole (its CRC-32 and its SHA-256 as they should be): read
  before the new file takes its place - by Save As too, which reads the
  file saved to before - and only where something would else be left
  out, through the same reach Open and Save gave Meno to that file. One to
  be had from nowhere - damaged there too, not in it, or there being no
  such file - does not keep the workspace from being saved, which would
  put new work at risk: it is saved without it, and Save says so, where
  its failures are said, until dismissed: "Saved, but figure.png is not in
  the file: it could not be read." Where the file saved over is the one
  it was last saved to, and that still has something of one in it,
  damaged - or does not read as a workspace at all, so that what it holds
  is not known - it may be the only copy, and partly to be had: it is first
  kept beside the new one, as it is, and Save says so: "... The file as it
  was is kept beside it as aspirin.meno.bak." (`lastHolds`, `workspaceFile`;
  `write_document` asked with `keep-old`). Never over a copy kept before,
  which may hold more: `aspirin.meno.bak`, else `aspirin.meno.1.bak`,
  `aspirin.meno.2.bak` and on. The same file under a second name where the
  file system has them (a hard link: everything it had with it), else a
  copy of its bytes; where it cannot be kept, the file is not saved over,
  and why is said. Kept once: the file saved then holds nothing of it, so
  the next save keeps no copy. A save that can keep everything keeps no
  copy. Its place in the
  workspace's JSON is kept - by what it is known by, which the file then
  does not hold, nor list - so that, opened again, it is named again,
  never taken for a file that is there.
- **What does not read is left out, counted and said - never silently.**
  A workspace's file, or Meno's own record of a copy, can hold something
  that does not read: damaged, or written by hand. Only an atom or a bond
  of the drawing keeps the whole file from opening (and that is said).
  Everything else that does not read is left out alone, and each kind is
  counted as it is read (`utils/readNotes`). Opening says so with the
  texts and pictures that could not be had: "1 picture, 1 step and 1 wire
  in the file could not be read and were left out." A paste says the same
  of the copy.
  - **What is counted.** Whole records: arrows, plus signs, shapes, words,
    electron-pushing arrows, molecules in 3D and their measurements,
    pictures, slides, catalytic cycles, handwriting and its strokes, texts,
    PDFs, their pages laid apart and the writing on them, sets, steps, wires,
    a step's earlier runs and jobs under way. Ties whose other end is not
    there: a set's member, a result set's step, a text's molecule and words
    tied to an arrow. Within a molecule in 3D: a calculation's record, its
    results and its notes of what could not be read, and each property of
    a frame (`Molecule3D.properties`) that does not read. Within a
    structure a step gave a set: each property of its record, and each
    entry it was made from. Within a set holding a table:
    a column that does not read (with its cells), a row not of the table's
    width, and a cell not of its column's kind - none in its row, and named
    among what the table says was not read; a table with no column that
    reads, whole. A number a set holds that is no finite number in a unit
    Meno knows; a field of what worked a value out, or where, that does
    not read.
  - **Marks of which frames failed, or are no minimum, fail closed.** A
    molecule's marks of failure or of imaginary frequencies that do not
    read - not one for each frame, or one that is neither a mark nor
    none - are left out, and said ("marks of a molecule's failed
    frames"). The molecule is kept whole - its geometry, frames, energies
    and the rest - and marked so (`marksUnread`), which is saved with it.
    Its frames are never taken for minima: *Populations* and *Energy
    window* refuse it, saying "its frames' marks could not be read, so
    whether it is a minimum is not known", its chip gives no shares, and
    each of its entries says it as its status. The mark, like each frame's
    failure and imaginary frequencies, goes with its frames wherever a
    molecule is made of some of them - a step's results (*Duplicates*,
    *Choose one*'s two exits, *Energy window*'s rest, *As conformers*) and
    rows of a set's table taken out (workflow/entries `marksOf`).
  - **Nothing more is left out than what does not read.** A conformer or
    frame that does not read is left out with its own energy, number, share
    and degeneracy. Every other frame keeps its own, and its results of
    frames stay its own; a row of a list of a frame left out is of none.
    It is counted with the frames its file left out (`framesLeftOut`). An
    R/S or E/Z label of an atom or bond the molecule does not have is
    left out alone, and so is a ligand atom of unknown orders that is not
    one of its own. Before 2026-10-22, one damaged frame lost every
    conformer's energy, and one label out of range lost every label.
    The shares are kept as they were saved, of the whole ensemble.
  - **What a file says by place is never taken for another.** A text's
    molecule and a set's members are matched to the molecules that read by
    their places in the file. The text and the PDF its column showed are
    matched by their places among those listed. One that did not read is of
    none, or shown none, and that is said. A PDF one of whose pages' sizes
    does not read is left out whole, because every page after it would
    otherwise be a place wrong.
  - **Presentation is put right silently.** A colour, a width or an angle
    out of range is read as its default, as before, and not counted.
  - **Save says it, every time.** None of what was left out is in a file
    saved since: "Saved, but 1 picture and 1 wire that could not be read
    when it opened are not in the file." The first save over the file it
    was opened from first keeps that file beside it, as above: "... The
    file as it was is kept beside it as aspirin.meno.bak." It is the only
    copy of what was left out.
- **Saved within the same limits.** A workspace that would come to more
  than a workspace file is read with is not written: Save says so, with
  the sizes, rather than leave a file that would not open again.
- **The JSON `.meno` of before is not looked for** (the maintainer: not
  needed). One still opens, the JSON being the same as `workspace.json`;
  nothing was added for it, and it is saved as a zip.
- **The clipboard and Office keep the record**, JSON as before: a copy
  carries no file.

### A step's jobs

Decided by the maintainer (docs/WORKFLOWS-FOUNDATION.md, *Keeping*): the
`.meno` is the whole record, raw outputs included, with a way not to keep
them. A step's runs, the current one and those it keeps, keep their jobs'
files in the `.meno`: the files the job was given, what its program wrote,
and its logs. A set's *Don't keep in the file* leaves out what the set held
(only how many, and their hash, are kept), never its step's job files. A
step's *Don't keep raw outputs* leaves out what its program wrote, except
the files Meno read back and the logs; each job's record names what was
left out, with its size.

- **What a job's files are.** Each job runs in a folder of its own in
  Meno's local data folder (`jobs/<id>/`, `src-tauri/src/jobs.rs`). Kept
  are its work folder (`work/...`: its input, as Meno wrote it, and all its
  program wrote) and its logs (`log.txt`, what its program said;
  `after.txt`, what the programs run after it said). Never kept: its
  `job.json`, which holds its program's path and environment on this
  computer, and `state.json`, Meno's own record of it. As a job is made,
  Meno writes beside it which files it was given and which its plugin
  reads back (`kept.json`, `src-tauri/src/keptjobs.rs`); a job made by an
  earlier Meno has none, and all its work folder counts as raw output.
- **Kept as they are, by their SHA-256**, each once however many jobs
  hold it, deflated, as `files/<sha256>` with the rest. A run's record in
  `workspace.json` lists, for each of its jobs (`steps[].ran.kept`, and
  `steps[].runs[].kept`), every file kept - its name in the job's folder,
  its SHA-256, size and what it is to the job (`input`, `read`, `log` or
  `raw`) - and every file left out, with its name, its size and why (`raw`,
  under *Don't keep raw outputs*; `not had`, where a job's folder is not on
  this computer and the file it was opened from did not hold it).
- **Written from the disk, not through the page.** A study's outputs come
  to hundreds of megabytes. The page writes the workspace and lists the
  jobs' files in `files.json`; Meno then adds their bytes from the jobs'
  folders, each checked against its SHA-256 as it is read, to the file
  being written, before it takes the place of the one saved before. A file
  changed since it was listed fails the save, and the file saved before
  stays as it was. Only a plain file inside its job's folder is read: never
  through a link, whatever the page's list says.
- **Kept again from the file it was opened from.** A workspace opened on
  another computer has its jobs' files in the `.meno` it was opened from.
  Saved again, Meno reads them from that file as the new one is written -
  each checked against its SHA-256 - while that file is still as it was
  opened (its size and when it was written). Where it has changed, or the
  workspace was opened with no path, they are kept from what was held of
  it as it was opened, through the page.
- **Raw outputs can name this computer.** A program's output and its logs
  often hold the user's name, the folders it ran in and the computer's
  name: Gaussian and ORCA print the host they ran on, for one. Meno never
  alters what a program wrote. *Don't keep raw outputs* leaves the raw
  outputs out; the files a job was given, what Meno read back and the logs
  are still kept.
- **A size warning, not a choice made for you.** When a save would take a
  workspace past a size (Settings, General: 500 MB unless changed, at most
  1 GB) - it was not past it before, it is new, or it has grown by half of
  that size or more since - Meno says about how large it will be, names its largest steps by what their jobs add, says that raw
  outputs can name this computer, and offers *Don't keep their raw
  outputs* for those steps, *Save it all*, or *Cancel*, which saves
  nothing. Meno never leaves anything out on its own. Past what a
  workspace's file may hold at all (1 GB, above), the card says it cannot
  be saved as it is, and offers only *Don't keep their raw outputs*, or
  *Cancel*.
- **Opened on another computer**, a workspace holds its jobs' files for
  the session, each read from it only when wanted. *Show files* on a step
  whose job's folder is not there writes the files kept of it back out, in
  Meno's local data folder (`jobs-kept/<id>/`), and shows them. A file
  there already is never written over: one changed since is left as it is,
  and named, as is each file the workspace's file does not hold. Saved
  again there, the workspace keeps them again from the file it was opened
  from.

### What a .meno holds

Decided by the maintainer, 2026-10-15: "Meno's file is .meno alone, and
that will never change. What it holds varies: a template, a style and so
on." A `.meno` says what it holds in `meno.json`, stored, after `mimetype`:

```
style.meno (zip)
  mimetype          first, stored: application/vnd.kfchem.meno+zip
  meno.json         stored: {"kind": "style"}
  style.json        stored: the styles - each its name and the whole of it
  picture.png       stored, where there is one: what they look like
```

- **Kinds.** `workspace` - the default: a `.meno` with no `meno.json`, as
  every file written before kinds were, is a workspace, and workspaces are
  written as before - and `style`. A template, later, will be a workspace
  opened as a new, untitled copy, with its own kind.
- **A style file** holds one or more drawing styles and styles for
  molecules in 3D (`style.json`: `drawing`, each `{name, style}`;
  `molecules3d`, each `{name, look}`), at most 100 of each, each setting
  read as the settings file reads it - one that does not read is Meno's
  own. *Export style…*, on a style's menu in Settings or in a workspace's
  Drawing style, writes one, with the 3D style's picture.
- **Opened** - by Open, a drop, or a double-click in the system - a style
  file asks: "Add the style X to your styles?". *Add* puts them below the
  built-in ones (renamed where a style has the name); *Add and use* also
  uses them - the drawing style in the workspace in front, eased in, an
  edit that can be undone; the 3D one as the primary. It never opens as a
  workspace.
- **A kind this Meno does not know** - a file from a newer Meno - is said
  so, "It was made by a newer Meno, and holds what this Meno cannot open",
  and nothing is opened. A `meno.json` that does not say a kind is a file
  that does not read.

### Opening a workspace file from the system

Decided by the maintainer, 2026-10-12: Meno is the app for `.meno`, and for
`.meno` alone - the other formats it reads stay with whatever opens them -
so a workspace file double-clicked opens in Meno, with an icon of its own.

- **Its icon** is a document's, not the app's: a sheet, its corner folded,
  carrying Meno's mark (`src-tauri/icons/document/`: `meno-document.svg`,
  and `meno-document-small.svg`, bolder, for 16 to 32 pixels). The
  `.icns` and the `.ico` are made from them by
  `scripts/icons/document_icon.py`: each size drawn by the Tauri CLI's own
  `tauri icon`, the `.icns` put together by `iconutil`, the `.ico` written
  with its images as PNGs.
- **macOS** (`src-tauri/Info.plist`, merged by Tauri into the app's own):
  Meno exports the type `dev.kfchem.meno.workspace` - extension `meno`,
  media type `application/vnd.kfchem.meno+zip`, described as "Meno
  workspace" - and opens it as its owner (`LSHandlerRank` Owner, role
  Editor), the document's icon in the app's `Resources`
  (`tauri.macos.conf.json`). The type conforms to `public.data` and
  `public.content`, not to `public.zip-archive`, though the file is a zip:
  a workspace is a document, not an archive to unpack, and an app that
  unpacks archives on its own - a browser opening "safe" downloads, the
  system's Archive Utility - would take one that said it was an archive
  apart.
- **Windows** (`tauri.windows.conf.json`, `fileAssociations`): the
  installer associates `.meno` with Meno under the ProgID `Meno.Workspace`,
  "Meno workspace", opened with `Meno.exe "%1"`; its hook gives the ProgID
  the document's icon, carried as `icons\document\meno-document.ico`
  (`windows/hooks.nsh`). Uninstalling takes the ProgID away, and gives
  `.meno` back what it was associated with before.
- **Offered for the files it reads, never their default** (the
  maintainer, 2026-10-19): Meno is in the system's Open With for the
  structure files and PDFs it reads - `.mol`, `.sdf`, `.rxn`, `.xyz`,
  `.pdb`, `.cube`, `.cub`, `.pdf` (`OPENED_WITH` in `opened.rs`; not
  calculations' outputs, `.out` and `.log`, which other programs use too) -
  and whatever opens them still does - on macOS. A test holds the list and
  `Info.plist` alike.
  - macOS (`Info.plist`): a document type for the structure files and one
    for PDF, each with `LSHandlerRank` Alternate - "a secondary viewer of
    files of this type", ranked after Owner and Default (Apple, Information
    Property List Key Reference) - and role Viewer. PDF by the system's
    type, `com.adobe.pdf`. The structure files by their extensions
    (`CFBundleTypeExtensions`), with no type of Meno's own declared: where
    another app declares a type for one of them, the system gives the file
    that type, and a claim on a type of Meno's would not reach it.
  - Not on Windows (2026-10-21). Registering Meno there - its ProgID in
    each extension's `OpenWithProgids`, its `Applications` entry and
    `SupportedTypes` - was built and tried on a real machine, and Windows
    then gave Meno the double-click for extensions that belonged to other
    programs: where a type has no choice of the user's, Windows takes the
    most recently used registered program, and registering Meno made the
    times it had been chosen before count. Microsoft's own pages say as
    much ("available as default ... apps for the file type"; ownership
    information in HKCU "used only when the application that it references
    is registered"). So nothing is registered for them until the user asks
    for a format in Meno's own Settings (*Meno as the default app*, below).
    A file opened with Meno by the user's own choice is taken as on macOS.
- **Each format's own icon** (2026-10-28): where Meno opens a format by
  default, its files show that format's icon - Meno's sheet and mark with
  the format's short name on a band (`src-tauri/icons/formats`, drawn for
  Meno; their words as outlines of IBM Plex Sans SemiBold, SIL OFL 1.1,
  `scripts/icons/outline_text.swift`; made by
  `scripts/icons/document_icon.py`) - not Meno's own app icon. One for
  each of the formats Meno can be made the default for (`OPENED_WITH`),
  a cube file's `.cube` and `.cub` sharing one. On macOS each format is a
  document type of its own in `Info.plist`, its icon named by
  `CFBundleTypeIconFile` and put in the app's Resources; on Windows each
  has its own ProgID (above), whose `DefaultIcon` is its `.ico`, installed
  in `icons\formats` beside Meno. A format chosen for Meno on Windows
  before this keeps earlier versions' one ProgID, and Meno's icon, until
  it is chosen again in Settings, Files.
- **Meno as the default app, chosen in Settings** (2026-10-21; Settings,
  Files, *Opening files*; `src-tauri/src/defaults.rs`, `lib/defaultApps.ts`):
  each of those formats with the app that opens it now, read again each
  time Meno comes to the front, so a default changed elsewhere shows as it
  is. Nothing changes until a format's button is pressed.
  - macOS 12 and later: *Use Meno* asks the system to make Meno the
    default for the type the system gives that extension
    (`NSWorkspace setDefaultApplicationAtURL:toOpenContentType:
    completionHandler:`, macOS 12; "If a change requires user consent, the
    system asks the user for consent", Apple's page for it). The app it
    replaced is kept by name and path (`files.before` in the settings), and
    offered back: *Use Some Viewer again*. Where that app is no longer
    there (moved to the Trash since), its record goes and the page says so;
    the format still opens with Meno. The call came with macOS 12; before
    it, the page says to choose in the Finder instead (Get Info, Open
    with, Change All); Meno's minimum stays 10.13. Only an installed Meno
    can be made the default, not one run from a build folder.
  - Windows: a default is the user's to choose, in Windows' own
    Settings. *Use Meno* offers Meno there for that format alone, then
    opens Meno's own page in Default apps - `ms-settings:defaultapps?
    registeredAppUser=Meno` on Windows 11 21H2 and 22H2 with the 2023-04
    update and 23H2 or later, Default apps itself before (Microsoft Learn,
    *Launch the Default Apps settings page*). What is written, under
    HKEY_CURRENT_USER only (Microsoft Learn, *Registering an Application
    for Use with Default Programs*): `Software\Meno\Capabilities` with
    `ApplicationDescription` (required) and `ApplicationName`; under its
    `FileAssociations`, one value for each format asked for, `.sdf` =
    `Meno.File.sdf`; that format's own ProgID, `Software\Classes\
    Meno.File.sdf`, with its `shell\open\command` and its icon (*Each
    format's own icon*, below); and one value, `Meno`, in the shared
    `Software\RegisteredApplications`. Then `SHChangeNotify`. Never
    `OpenWithProgids`, never `Applications\Meno.exe`.
  - What opens a format now is asked of Windows, never read from the
    registry: the default ProgID (`IApplicationAssociationRegistration::
    QueryCurrentDefault`) and the program and its name
    (`AssocQueryString`). The user's choice is not always under the
    `UserChoice` key: Windows 11 build 26300 (tried 2026-10-22) keeps it
    under `UserChoiceLatest`, and the page read it right because it asks
    Windows. Nothing in Meno reads `UserChoice` itself. Where the program
    is Windows' own *choose an app* (`OpenWith.exe`), named *Select an
    app* in the user's language, no app
    opens the format yet, and the row says *No app opens it yet*.
  - Tried on Windows 11 (2026-10-21) with exactly these keys: a
    double-click did not go to Meno, and Meno's own page in Default apps
    listed its formats with their defaults. But for each format claimed,
    Windows asked which app to use the next time such a file was opened,
    offering Meno beside the app that opened it. So a format is claimed
    only when the user asks for it, and the page says what Windows does
    next.
  - *Stop offering Meno* takes that format's value out; with the last,
    the rest goes too: each format's ProgID (and `Meno.File`, the one
    ProgID earlier versions wrote for all of them), the Capabilities, the value in
    `RegisteredApplications` (never the key), and `Software\Meno` where
    nothing is left in it. The uninstaller does the same with whatever is
    left (`--unregister-defaults`, `windows/hooks.nsh`). On the last
    format, where Meno is the default, the row says that stopping takes
    Meno out of Default apps, so Windows asks which app to use the next
    time such a file is opened: the choice it kept names the ProgID taken
    out.
- **Opened as Open opens a file** (`src-tauri/src/opened.rs`,
  `lib/openedFiles.ts`): each file is kept by the app until the page
  takes it, so that one opened as Meno starts - before the page is there -
  is not lost; then it is opened as Open opens it - a workspace file in a
  tab of its own (in place of a blank one in front), anything else added
  to the workspace in front - with the same words where it cannot be
  read. On macOS the system tells the running Meno (`RunEvent::Opened`) at
  its start or at any time after. On Windows a file comes as an argument:
  to the Meno it starts; or, where Meno is running already, to that one -
  the second Meno passes it on and goes again at once
  (`tauri-plugin-single-instance`), and the first comes to the front. A
  Meno Office starts to serve a structure (`-Embedding`, `ole.rs`) is not
  one of these: it stays, as it must.
- **Not yet:** the Windows MSI, which Meno does not ship, associates
  nothing.

### Response

The maintainer's condition: Meno's own readers go behind the contract, in
a web worker, only if the response does not suffer - and all of them the
same way, never some in the worker and some on the page.

**Measured on 2026-10-06**, in the built app on a Mac (WKWebView) and on
Windows (WebView2). The branch `agent/reader-bench` holds the measurement
and is not to be merged. Four cases were each run five times after a
first run:
- a small molfile, as from a paste;
- an SDF of 1000 records, laid out as a drawing;
- an XYZ file of 2000 frames;
- a cube's grid of 80³ points.

The figures are medians. Each cell gives the time until the result is in
hand / the longest the page went without a frame. A frame is about 17 ms
on the Mac and 10 ms on the Windows machine.

| Case | On the page | Worker, objects back | Worker, JSON back | Worker, coordinates in a buffer |
| --- | --- | --- | --- | --- |
| small MOL (Mac / Win) | 0 / -, 0.2 / - | 1-2 / -, 0.4 / - | 2 / -, 0.2 / - | |
| SDF, 1000 (Mac) | 37 / 37 | 61 / 18 | 52 / 18 | |
| SDF, 1000 (Win) | 20 / 10-20 | 43 / 10 | 32 / 10 | |
| XYZ, 2000 (Mac) | 41 / 41 | 124 / 24 | 78 / 28 | 48 / 17 |
| XYZ, 2000 (Win) | 38 / 30 | 129 / 50 | 76 / 10 | 38 / 10 |
| cube, 80³ (Mac) | 47 / 48 | 45-51 / 17 | 45 / 17 | |
| cube, 80³ (Win) | 47 / 40 | 50 / 10 | 51 / 10 | |

- **Read on the page,** a large file holds the page 20 to 48 ms.
- **Sent back as objects,** the worker is worst. The page rebuilds every
  object it is sent, and on Windows that held the page 50 ms for the XYZ
  file.
- **With the coordinates handed over in a buffer,** the worker takes as
  long as the page and holds nothing up. A small file costs at most 2 ms
  more.

**Decided by the maintainer, 2026-10-06:** all of Meno's readers run in a
web worker.
- What they give is handed back compactly: coordinates and other runs of
  numbers in buffers, handed over rather than copied, and the rest as
  small plain data.
- The content is the record's, as decided; only how Meno carries it
  inside itself differs.
- Plugins' answers stay JSON lines.

### Every point resolved

| # | Point | Resolved by | Step |
| --- | --- | --- | --- |
| 1 | "Reader" means two things | XYZ's comment-line energies become part of Meno's XYZ reader; `lib/calc/readers.ts` goes; "reader" means only a reader | 3 |
| 2 | Five places decide what a file is | one table of kinds, one decision by content, strongest evidence first, used by Open, drop and pasted text | 2 |
| 3 | Built-in readers listed twice | one list of Meno's readers and writers; the worker reads it | 3 |
| 4 | Readers found by name | known by id | 3 |
| 5 | Cube beside the plugins | Meno's parts show only in the tab for files, as "Meno"; the Plugins tab lists plugins only | 3 |
| 6 | Geometries through XYZ text | molecules in 3D made directly, bonds found by the function XYZ uses | 3 |
| 7 | Every reader reads; opening waits | one reader assigned per kind, others only where added; the first answer shows at once | 3 |
| 8 | Failures only in the console | said on the molecule, by the reader's name | 3 |
| 9 | `office.meno` | the record handed over as the record | 2 |
| 10 | Text only, no path | Open through Tauri's dialog: a path, bytes; Save back to an opened `.meno`; outputs found again by path and SHA-256 | 2, 5 |
| 11 | No Save when closing | Save offered beside Keep and Discard | 5 |
| 12 | SMILES copied two ways | one way, through Meno's clipboard | 5 |
| 13 | SMILES parsed two ways | what the chemist gives is read by the plugin chosen for SMILES (RDKit by default, PLUGINS.md). The dictionary's SMILES are Meno's own data and stay with Meno's own parser, which must answer while drawing. Both are said in the code and the docs | 6 |
| 14 | Clipboard gaps | pasted text asks the one decision, so XYZ is read. EMF and DIB stay written only, and are said to be: they are for programs that take only a metafile or a bitmap, and Meno reads neither back (`clipboard.rs` reads none on purpose); the record comes back through GVML, PNG or Meno's own flavour | 2 |
| 15 | RXN not dragged in on Windows | `drop.rs` takes the RXN flavour | 2 |
| 16 | PDB, KET offered then refused | Open offers only kinds something reads; PDB comes with its reader | 2, 7 |
| 17 | Code no path reaches | removed | 2 |
| 18 | Write scope unsaid | said in ARCHITECTURE.md (*What the backend accepts*) and beside the capability | 5 |
| 19 | ARCHITECTURE.md out of date | its format table drawn from the table of kinds; the stale lines rewritten | 8 |

### Also decided

1. **The tab for files is named "Files"**, and every kind Meno reads -
   its own, and those of the plugins added - has a row in it, so who
   reads what can always be seen.
2. **The defaults when a plugin is added:** Meno keeps its kinds, and a
   kind nothing read goes to the new plugin.
3. **"Also read with…" for one file** - from the molecule's menu, without
   changing the kind's row - comes later, if it is wanted.

## In order

Each step is a pull request from main.

1. **These documents** (#149).
2. **Kinds and Open** (built in #150):
   - the table of kinds and the one decision;
   - Open through Tauri's dialog;
   - the record from Office as the record;
   - pasted text through the decision;
   - RXN dragged in on Windows;
   - Open offering only what is read;
   - the dead branch removed;
   - tests for each misread case.
3. **Readers by the table** (built with this step's pull request):
   - kinds registered: Meno's own, and each added plugin's from its
     manifest while it is added; marks as data, tried on Meno's samples;
     `probe`; a file no plugin added reads naming the plugin that would
     (from what each plugin Meno carries says it reads: PLUGINS.md);
   - each plugin a folder of its own, found by Meno and named by none of
     its code;
   - ids, and the kind sent with each request;
   - one list of Meno's parts;
   - the Files and Plugins tabs;
   - one reader per kind and the others added, the first answer shown at
     once;
   - failures said;
   - `readers.ts` into the XYZ reader, and geometries made directly.
4. **Meno's readers in the worker** (built in #156): all of them behind the contract,
   in a web worker, giving back coordinates in buffers (*Response*).
5. **Save and Export** (in part in #151 - Save writing `.meno`, Save when closing, one SMILES copy, the write scope - and #155 - Save back to the file it came from, Export with the writer's options; the rest to come):
   - Save writing `.meno` only, back to the file it came from;
   - Save offered when closing;
   - Export with the writer's options;
   - Meno's writers behind the contract;
   - outputs found again by path;
   - one SMILES copy;
   - the write scope said.
6. **RDKit as a plugin** (PLUGINS.md; built with this step's pull
   request), with SMILES read through it: the SMILES the chemist gives are
   read by the plugin that fills the role; the dictionary's stay with
   Meno's own parser.
7. **New kinds:** reading PDB, and a first calculation's input. Which
   program, and whether Meno or a plugin reads PDB, are decided then:
   Meno reads and writes PDB itself (built with this step's first pull
   request, *As step 7 was built*), and Gaussian's input comes first,
   written by a plugin, with the writer contract (built with its second,
   *As step 7's writer was built*).
8. **ARCHITECTURE.md** drawn from the table of kinds (built with this
   step's pull request): its table of kinds of file lists every kind
   Meno has, writes, and the plugins it carries bring and write, by id,
   and a test (`src/lib/io/architecture.test.ts`) fails where the two part.

As step 7 was built - decided with the maintainer on 2026-10-06:

- **Meno reads PDB itself**, not a plugin: it is a file of structures and
  where their atoms are, as MOL and XYZ files are, and it opens with
  nothing added. Gaussian's input is the first calculation's input; a
  plugin writes it, since Meno knows no program.
- **Written from the specifications only** - the wwPDB's "Atomic
  Coordinate Entry Format Version 3.3" for PDB, gaussian.com's input
  reference for Gaussian - never from another program's code or from
  memory. The code says which part of the specification each rule comes
  from.
- **What is read, for now** (`lib/chem/pdb.ts`, `lib/io/structures.ts`):
  - every ATOM and HETATM record, all its fields kept - name, residue,
    chain, occupancy and the rest - though Meno shows only the atoms;
  - an atom's element from its element columns, or - where they are
    blank - from how its name is aligned, as the format says; D and T,
    deuterium and tritium, are hydrogen of mass 2 and 3, the mass number
    kept with the atom, as Meno's table holds elements, not isotopes
    (since 2026-10-13: before, such atoms were left out unsaid);
  - an ATOM or HETATM record that does not read is never passed over
    unsaid (since 2026-10-13: before, such atoms were left out without a
    word):
    - its coordinates no numbers: the file is damaged, and is not
      opened, the chemist told how many such records there are and the
      first by its line;
    - its element none Meno knows (columns 77-78, or its name where they
      are blank), in a residue named as water is - HOH, DOD, SOL, WAT,
      TIP (`namedWater`, lib/chem/biopolymer) - a TIP4P or TIP5P water
      model's massless site (MW, LP, EP, OM): no atom, and left out;
    - its element none Meno knows, anywhere else - a wwPDB entry's
      unknown atom (element X, residue UNX), an old file's name with
      its element columns blank: the atom is left out and the molecule
      says how many, *1 atom left out* (`atomsLeftOut`;
      docs/WORKSPACE.md, *Said over it*);
  - MODELs as one molecule's frames, where each holds the same atoms;
    else each model a molecule of its own;
  - a residue as the atoms listed one after another with the same chain,
    sequence number, insertion code and residue name: the format lists a
    residue's atoms together, its residues in order (ATOM, *Details*).
    Not every atom in the file of that number: the format numbers
    residues in four columns (ATOM, resSeq: 23-26), and a file of more
    than 9,999 of them, or of more than 99,999 atoms - a molecular
    dynamics frame in its water - numbers them over again, or past the
    columns. A HELIX or SHEET record's residue is the first so numbered;
  - where an atom is given in more than one place, its residue's first
    alternate location;
  - bonds from CONECT records, and - for pairs CONECT does not speak for
    both atoms of - from distances, as an XYZ file's: a standard
    residue's own bonds are in the Chemical Component Dictionary, not in
    the file. A serial number two atoms carry names neither, and a CONECT
    record that names one is not taken: the format numbers a model's atoms
    in five columns (ATOM, serial: 7-11) and so holds at most 99,999 of
    them (MODEL, *Details*), and a file of more - a molecular dynamics
    frame in its water - numbers them over again, or past the columns in
    a count of its own, or with stars. Those atoms' bonds are by distance;
  - HEADER's ID code and TITLE, kept for later;
  - HELIX and SHEET records (Secondary Structure Section, since
    2026-10-10), every field kept, and with them each atom's name and
    residue on the molecule in 3D: its chains drawn as ribbons
    (docs/WORKSPACE.md, *Ribbons*).
  mmCIF later. A big structure is read quickly: a 58,870-atom
  entry in about 0.2 s, its bonds found cube by cube
  (`bondsByDistance`).
- **What is read can grow.** Each record read has a handler of its own;
  every other record is counted by name. Reading one more - SEQRES, LINK
  and SSBOND - is a handler more, and what the atoms already keep is there
  for it.
- **What is written** (Export, molecules in 3D only): HETATM records, each
  molecule a residue of its own named UNL - the Chemical Component
  Dictionary's unknown ligand - in chain A; a MODEL for each frame where
  the writer's options ask; every bond the frame written has in CONECT
  records - one set of them serves every model, so with a MODEL for each
  frame, the first frame's; END. No HEADER, CRYST1 or MASTER: a file of
  coordinates, not an entry of the archive. A coordinate that rounds to
  nothing in its three decimals is written 0.000, never -0.000, as a MOL
  file's never has -0.0000. One molecule is written where
  its file had it; several, one system, as they stand on the page - each
  turned and placed as it is seen, its ångströms kept - as a plugin's
  writer is given them (utils/written `writtenAtoms`; *Which molecule*,
  below), not each where its file had it, on top of one another.

As step 7's writer was built - decided with the maintainer on
2026-10-06:

- **Gaussian's input is the first calculation's input**, written by a
  plugin of its own, `gaussian-input` (since the workflows' step 6,
  `gaussian`, whose steps run Gaussian as well): Meno knows no program. Its worker
  needs Python alone, no package; its environment is made by uv as any
  plugin's is, and where Meno has fetched Python before, adding it
  downloads nothing.
- **Written from Gaussian's own reference only** (gaussian.com: "About
  Gaussian 16 Input", "Link 0 Commands", "Molecule Specifications", the
  keywords' pages): Link 0 commands (%Chk named after the input, and
  %NProcShared and %Mem where given), the route section, the title
  without the characters the reference says to avoid, the charge and spin
  multiplicity, and each atom's element - an isotope as `(Iso=n)` - and
  Cartesian coordinates, each section ended as the reference says. A
  charge and multiplicity the molecule's electrons cannot have are
  refused before Gaussian would stop on them.
- **Its options' defaults**, the maintainer's: B3LYP/6-31G(d) with
  EmpiricalDispersion=GD3BJ, Opt Freq. The last chosen are remembered,
  but for the charge, the spin multiplicity and the title, which start
  from the molecule written each time (lib/options `Known`): its atoms'
  charges summed; one more than its unpaired electrons - its radicals',
  and one more where its electrons are odd without them; its name.
- **Offered only where the page holds molecules in 3D**: a drawing is
  made 3D first, by *3D structures*, so that the conformer written is the
  one seen.
- **Which molecule:** those selected - several are one system, written as
  they stand on the page, each turned and placed as it is seen, its
  ångströms kept. Export is for the selection (2026-10-10), so there is
  nothing else to ask.
  - **After a change of the drawing style** (utils/restyle3d
    `restyled3d`), molecules that touch - a complex put together on the
    page - are one body, moved as one, and are written in the same
    ångströms as before. Separate bodies move apart or closer with their
    places on the page, so the ångströms between them follow the page as
    it now stands.
- **The contract** (`lib/io/writers`): a writer, Meno's or a plugin's, is
  one `Writer` - the kind it writes, its name, its files' extensions,
  what it takes, its options in the general form, who writes it. A
  plugin's manifest declares its `writes` as data, checked as its kinds
  are (`acceptOptions`): an option is drawn by Meno, never run. The
  plugin's worker is asked `write {kind, name, molecules, options}` and
  gives back `{text}`; molecules cross as Meno's plain data
  (`WrittenMolecule`: each atom's element, place in ångströms, charge,
  isotope and radical; bonds by index with their orders; a name).
  Meno's own writers run on the page - an SVG picture of molecules in 3D
  needs the page's WebGL - and are given the page, as before.
- **Settings:** *Plugins* says what a plugin writes; *Files* lists the
  kinds the plugins added write, by who writes each.

As step 3 was built:

- **Each plugin is a folder of its own**, `src-tauri/resources/plugins/<id>/`:
  its manifest, its worker and its lock (uv's `requirements.lock`, or
  pixi's `pixi.toml` and `pixi.lock`). Meno finds the folders it carries
  and reads each manifest as data, by the same check a fetched one would
  meet; no code of Meno's names a plugin. Plugins fetched over the
  internet later will be folders of the same kind. The backend allows a
  lock and a worker in such a folder only (`src-tauri/src/lib.rs`).
- **Meno knows no program.** cclib's manifest brings every program cclib
  reads and has outputs of to test with - ADF, CFOUR, Dalton, GAMESS
  (Firefly too), GAMESS-UK, Gaussian and its formatted checkpoint,
  Jaguar, Molcas, Molpro, MOPAC, NWChem, ORCA, Psi4, Q-Chem, Turbomole,
  xTB - each told by its banner as cclib tells it; PySCF's brings the
  four it reads, Molden among them. With no plugin added, *Files* lists
  Meno's own kinds only.
  - Each program's banner is checked on a real output of it, one per
    program from cclib's regression data (`scripts/calc/samples.json`;
    kept out of the repository in `calc-samples/`), and cclib's worker
    gives each one's molecule. The tests skip a file that is not there.
  - Psi3 is left out: cclib has no output of it to test with.
  - `probe` is in place, and tested with made-up plugins.
- **An ORCA output is read by the ORCA plugin** (2026-10-31; PLUGINS.md,
  *Several plugins, one role*): its manifest declares ORCA's output as its
  own program's (`writtenBy`), and its `reader.py`, beside its worker,
  reads it - a job's output, which its `collect` hands Meno to read, and a
  file opened by hand alike. Written from the ORCA 6.1 manual and ORCA's
  own outputs (ORCA 6.1.1, `scripts/calc/test_reader_orca.py`), it gives:
  - **each geometry** ORCA wrote (*CARTESIAN COORDINATES (ANGSTROEM)*),
    point charges (`Q`) and ghost atoms (no nuclear charge or mass in the
    block in atomic units after it) left out; where a run of one geometry
    wrote none, the input's one `* xyz` block, where that is surely the
    geometry it worked at;
  - **each geometry's energy as ORCA states it**, its *FINAL SINGLE POINT
    ENERGY* - every term the method adds (dispersion, gCP, a composite
    method's others, a correlated method's correlation) - one to each
    geometry and in order, the same stated again unchanged counted once.
    Where they are not one to each geometry - a compound job, a nudged
    elastic band, a geometry with none, one stated where no geometry of its
    own stands - no energy is given, and that is said ("Energies not read:
    ..."), the geometries and the free energies kept. Each read says what
    its energies are: "ORCA final single-point energy (includes dispersion
    and gCP where the method has them)";
  - **the level**, each as the input names it: the functional or composite
    method ORCA says it recognised (its "omega" for the input's "w"), else
    one the input names that the ORCA 6.1 manual lists (3.3, Tables 3.1,
    3.2, 3.4, 3.6, 3.8 and 3.9) where ORCA ran DFT (it says it recognised
    none for a functional with no dispersion correction, "! B3LYP
    def2-SVP"), a correlated method the input names (the MP2 and MDCI keywords, the
    manual's Tables 3.34 and 3.43), Hartree-Fock, or a tight-binding method
    by the xtb program's name; the orbital basis it says it used where the
    input names it, none for a composite or tight-binding method; and the
    **solvation** the input asks for - its simple keyword or its `%cpcm`
    block, "CPCM(water)", "SMD(chloroform)" - or "none" where its input,
    echoed whole, asks for none;
  - the charge and multiplicity, **each atom's mass** as ORCA used it, how
    the run went and why it stopped where it did, which geometry an
    optimisation converged on (the one ORCA worked out once more at the
    stationary point), and its results: the thermochemistry with its point
    group, symmetry number, treatment of low vibrations and its correction
    to G (*G-E(el)*); the dipole as printed, with its components and the
    point it was taken about; each charge scheme it printed (Mulliken,
    Löwdin, Hirshfeld, MBIS, CHELPG) and spin populations; the vibrations
    with their IR intensities, Raman activities and motions; the orbitals,
    all it printed; each geometry's RMS gradient; and a file's jobs
    (`$new_job`) each an output of its own.
  - A value ORCA did not print is not given: none is worked out in its
    place - but the entropy, its printed *T S* term over the temperature
    it printed, in cal/(mol K). A path's own points - a band's images and the point it refined,
    a reaction path's - are in files of their own, which a job's `collect`
    reads with the same module; an output opened by hand says they are not
    in it.
- **The one exception is closed** (the maintainer, 2026-10-15): the
  energies on an XYZ file's comment lines are read by the patterns of the
  plugins added, not by Meno. Each plugin whose program writes XYZ files
  declares, in its manifest, how that program carries a frame's energy on a
  comment line (`xyzEnergies`: a pattern with one capture group, and the
  unit of its number, taken from the program's documentation); xtb's,
  CREST's and ORCA's plugins declare theirs. Meno reads an XYZ file's
  geometry always; a frame's energy only where an added plugin's pattern
  finds one on every frame of more than one - and where two patterns find
  different numbers on a line, none, and nothing said. With no such plugin
  added, an XYZ file gives its geometry alone (**a change**: XYZ energies
  now need the program's plugin added; no shim). The rest as it was: a place
  is read only where it is a number (2026-10-13): "1.19D-01" is not taken
  for 1.19, nor "nan" for a place, and the file is refused, saying which
  line. A frame the file ends in the middle of - a trajectory still being
  written, or cut short - is left out, with its comment line's energy; a
  trajectory of 10,000 frames reads in about a tenth of a second.
- **The cube reader became Meno's own reading.** It is the reader `meno`,
  under the same contract.
- **A reader's late findings join every molecule read from the output,**
  by its SHA-256 - opened, dropped or pasted, in any tab. They join
  through the document's `amend`, which writes them into the history too,
  so undo does not take them back.

As step 4 was built:

- **Every file Meno reads itself is read in its worker**, under the
  contract: MOL, SD, RXN and XYZ files (`lib/io/structures.ts`) beside the
  cube, in the one list (`lib/calc/menoReads.ts`).
  - What a structure's file holds comes back as `structures` in the
    reader's answer: the drawing, laid out, a reaction's arrow and "+"
    signs, and the molecules in 3D with their frames and energies.
  - The page checks it (`checkedStructures`), as it would a plugin's.
  - A structure's file goes to its reader through `whoReads`, as a
    calculation's output does: Meno's own, unless a plugin added is chosen
    for its kind. None is, yet.
- **The workspace and the record stay with Meno's core**, read on the
  page: they are Meno's own formats, no reader's (*The line*).
- **Answers come back compactly** (`lib/calc/packed.ts`). A list of
  numbers - a frame - goes as one buffer. A list of points - atoms, "+"
  signs - goes as its coordinates in one buffer and the rest of each as
  it is. Buffers are handed over, not copied. Short lists go as they are.
- **Everything that read a molfile on the page now asks the worker**: a
  SMILES made into a drawing (RDKit's molfile), and a molecule in 3D drawn
  as a formula, as well as Open, a drop and a paste.
- **The worker knows the label typefaces' ASCII tables only**, not the
  fonts the page reads. An RXN file's reaction laid out round a label of
  other letters is spaced by a capital's box for them. Nothing else it
  reads depends on letters.

