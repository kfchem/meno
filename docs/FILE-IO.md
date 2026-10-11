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
| **Open** (Cmd/Ctrl+O; `<input type=file>`, `App.tsx`) | `openedAs` (`ui/views/openFile.ts`) tells a kind from text, from the extension, `detectFormat` and `outputKindOf`; the canvas then decides again (`processFileContent`, `Workspace/utils/io.ts`) | see the formats below | a new tab; text, a text in the column of the workspace in front (`ui/views/texts.ts`), or of a canvas of its own where none is |
| **A file dropped** on the canvas (`dropAppend`, `useStructureEvents.ts`) | the extension first (`STRUCTURE_FILE`), to know whether to look at the drag's clipboard flavours; then as Open | as Open; a `.meno` is pasted, not opened | added to the page; text (`opensAsText`), to the column |
| **An Office picture or object dragged** in | the drag's flavours, in order: Meno record or embedded object, Mac Office object, GVML, PNG, RXN, MOL (`fromClipboard.ts`); read by Rust (`drag_read`; on Windows an overlay window, `drop.rs`) | the record Meno put in it (EMF comment, PNG text chunk, OLE stream) | pasted |
| **Paste** (`clipboardActions.ts`) | the clipboard's flavours, in the order above, then plain text that looks like a molfile, then SMILES (`fromClipboard.ts`; Rust `clipboard_read`) | the record; CTfiles in TS; SMILES by RDKit (chem worker) | pasted |
| **Office re-edit** (Windows OLE: Word or PowerPoint opens Meno) | always a record; named `office.meno` to reach it (`App.tsx`) | `readRecord` | a tab linked to the object |
| **Calculation output**, through Open or a drop | `outputKindOf` (`lib/calc/catalog.ts`) - by content only, and only once `detectFormat` has found no structure format | every reader added that reads the kind (`readOutput`, `lib/calc/read.ts`) | a molecule in 3D with what the calculation found |
| **A promise asked for** (a list row chosen) | the result's key | the reader that gave the promise, sent the output again (`askFor`, `lib/calc/asks.ts`) | a grid, drawn as a surface |
| **`.meno`** (Open, drop) | the extension | `readWorkspace` (version 1 only); its results checked as a reader's answers are | the workspace, or pasted |
| **SMILES** typed or pasted | the panel; text that looks like SMILES | RDKit (chem worker), back as a molfile | added to the page |

### Structure formats

| Format | Read by, where | Written | Notes |
| --- | --- | --- | --- |
| MOL (V2000/V3000) | `readSDfile` (`lib/chem/ctfile.ts`) via `parseSDF`, main thread | Save, Copy (`molWriter.ts`) | 3D when it says so or spreads in depth |
| SDF | the same | Save (drawing as one record, each molecule in 3D as one) | |
| RXN (V2000/V3000) | `readRxnfile` via `buildEditorModelFromRXN` | Save, Copy | |
| XYZ, many frames | `parseXYZ` (`utils/structureParsers.ts`), main thread; bonds from covalent radii | never | each frame's energy from its comment line (`lib/calc/readers.ts`) |
| SMILES | the plugin that fills the role (RDKit's, `plugin-rdkit`); abbreviations' SMILES by Meno's own `lib/chem/smiles.ts` | Copy as SMILES (the same plugin) | |
| `.meno` | `readWorkspace` (`workspace.ts`) | Save | version 1, no migration |
| Meno record | `readRecord` (`utils/copyPaste.ts`) | Copy, Office | in the clipboard's own flavour, an EMF comment, a PNG text chunk, OLE streams |
| PDB | `readPdb` (`lib/chem/pdb.ts`) via `readStructures`, in Meno's worker: every atom, MODELs as frames, bonds from CONECT and distances | Export: molecules in 3D only (`writePdb`) | wwPDB Format v3.3; see *As step 7 was built* |
| KET | not read | never | Open does not offer it; one dropped says "not supported yet" |

### Calculation output

| Kind | Told by | Read by |
| --- | --- | --- |
| ORCA, Gaussian, xTB output; Gaussian formatted checkpoint; since step 3, every program cclib reads | each program's banner, as the plugins added that read it bring it in their manifests | cclib (plugin, uv); PySCF (plugin, pixi; ORCA, Gaussian and the checkpoint only) |
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
| **Save, Save As** (`fileActions.ts`) | main thread, then the fs plugin | `.meno`; MOL, SDF, RXN - offered by what is on the page (3D molecules: `.meno` or SDF only) | `.meno` everything; the others the drawing, SDF each molecule in 3D at the frame shown |
| **Export as SVG** | main thread | SVG | the page as drawn; molecules in 3D as a picture; no record |
| **Copy, Cut** (`clipboardActions.ts`) | TS makes each flavour, Rust puts them on the clipboard (`clipboard.rs`) | Mac: the record, MOL, RXN, GVML (with EMF), PNG. Windows: the record, MDLCT and MOL, RXN, GVML, PNG, EMF, DIB, or an OLE object in place of GVML and PNG | the record carries molecules in 3D and their results; a surface promised stays a promise |
| **Copy as SMILES** | RDKit, then the clipboard as text | SMILES | the selection's structure |
| **Office live link** (Windows) | TS, then Rust `ole_update` | the record and EMF in the object | as `.meno` does, the surface shown included |

Never written: XYZ, PNG or EMF as files, anything printed or dragged out.
Plugins write nothing that leaves them (a temporary copy of the output,
deleted); the chemistry worker answers over its pipe.

A saved workspace keeps each molecule's results and, for a promise, the
output's name and SHA-256: the value of the one shown is kept; the others
are asked for again only once that output is opened in the session, by the
reader that gave them, added.

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
  (PLUGINS.md).

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
  - **results** in the general form, any of them a promise.
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
  since 2026-10-10, the kinds the catalogues of the plugins added name
  (PLUGINS.md, *A plugin's catalogue*). A file whose reader is not added
  says which plugin the catalogue suggests, with Add. What a plugin added
  writes or colours - a Gaussian or ORCA input - it offers as text, to be
  read and changed in a workspace's column (2026-10-07).
- **Office's record is handed to the canvas as the record**, not under a
  made-up name.

- **A PDF** opened or dropped goes onto the page of the workspace in front
  (docs/PDF.md), held in Meno's cache by its SHA-256; a workspace's file
  keeps it, stored as it was (`application/pdf`). Pasting a PDF copied in
  the Finder or Explorer is not taken yet.
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
- **Closing a tab with unsaved changes** offers Save, beside Keep and
  Discard.
- **Export…** (on the selection's menu since 2026-10-10: what is
  selected, Select all first for the whole page) offers every kind a
  writer added writes, each written by the one assigned:
  - MOL, SDF, RXN, PDB and SVG, by Meno;
  - Gaussian's input, by its plugin, where it is added (step 7).

  The writer says what it takes: the page, the molecules, or one
  molecule. Meno asks which where it must, then shows the writer's
  options, then asks for the file's name.

  The name it suggests is never the file the canvas was opened from, as
  Save's never is (the maintainer, 2026-10-07, after the v0.1.7 Windows
  check): where it would be, the first free name beside it, numbered from
  2 - `cholesterol-2.pdb`.
- **Copy stays as it is**: the record and the clipboard's flavours, not
  Export. The SMILES panel copies through the same clipboard as the menu.

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
    written in V2000, or in V3000 where V2000 cannot hold them, as before.
  - **An SD file** may hold every frame of each molecule in 3D, a record
    each, numbered, with its energy where it is known
    (`> <Energy (Eh)>`).
  - **SVG** takes no options yet.
- **What a writer takes** is said by it (step 7): Meno's own take the
  page, as before; a plugin's, one molecule - the molecules in 3D
  selected (several, one system), else the one there is, else the one
  Export asks for.
- **Outputs are found again by path.**
  - A molecule read from an output keeps where the output was, where
    Open said (its `source.path`), with its SHA-256. A workspace saves it.
  - A promise asked for when the output is not open this session is
    asked for from the file there - read only where Meno may read it, and
    taken only if its SHA-256 is the same.
  - **Where it cannot be had** - Meno may no longer read it there after a
    restart, it has moved, or it has changed - the list says to open it
    again, with *Find it…*. That opens the system's dialog at where the
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
  files/<sha256>    each file kept, as it was: text deflated, the rest stored
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
  or kept in a workspace opened. Opened, a workspace holds what it keeps
  for the session. A molecule's menu shows its output in the workspace's
  column of texts (*Show <name>*); where it is held nowhere, it is read
  again where it was, or found (*Find…*).
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
  file does not hold is left out as the workspace opens, and named. A PDF
  read in the column keeps where it was read (`reading`, in its entry in
  `pdfs`), and `pdfShown` names the one the column showed, in place of
  `textShown` (docs/PDF.md, step 2). Words on the page taken out of a PDF
  keep where they came from (`captions[].from`: the PDF's SHA-256 and two
  places in it; docs/PDF.md, step 3). Pictures on the page are listed in
  `pictures`, each by its image's SHA-256 with its place, size and turn
  (docs/PDF.md, step 4a); one cut out of a PDF keeps where it came from
  (`pictures[].from`: the PDF's SHA-256, its page and the box on it;
  step 4b).
- **Written off the page.** The files kept are compressed in a worker of
  their own as the workspace is saved (`lib/doc/menoFileWorker.ts`), so a
  long output never holds the canvas up.
- **Nothing is unpacked to the disk.** What the file says of its sizes is
  held to limits before anything is inflated (`lib/doc/menoFile.ts`).
- **The JSON `.meno` of before is not looked for** (the maintainer: not
  needed). One still opens, the JSON being the same as `workspace.json`;
  nothing was added for it, and it is saved as a zip.
- **The clipboard and Office keep the record**, JSON as before: a copy
  carries no file.

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
| 14 | Clipboard gaps | pasted text asks the one decision, so XYZ is read. EMF and DIB stay written only, and are said to be: they are for programs that take only a metafile or a bitmap, and an EMF Office hands back is drawn afresh, without Meno's record in it (`clipboard.rs` reads none on purpose); the record comes back through GVML, PNG or Meno's own flavour | 2 |
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
     (since 2026-10-10, as a catalogue suggests: PLUGINS.md);
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
    blank - from how its name is aligned, as the format says;
  - MODELs as one molecule's frames, where each holds the same atoms;
    else each model a molecule of its own;
  - where an atom is given in more than one place, its residue's first
    alternate location;
  - bonds from CONECT records, and - for pairs CONECT does not speak for
    both atoms of - from distances, as an XYZ file's: a standard
    residue's own bonds are in the Chemical Component Dictionary, not in
    the file;
  - HEADER's ID code and TITLE, kept for later;
  - HELIX and SHEET records (Secondary Structure Section, since lane L5,
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
  Dictionary's unknown ligand - in chain A; every bond in CONECT records;
  a MODEL for each frame where the writer's options ask; END. No HEADER,
  CRYST1 or MASTER: a file of coordinates, not an entry of the archive.

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
  ångströms kept - else the one there is; else Export asks which.
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
- **One exception stays in Meno:** the energies on an XYZ file's comment
  lines (`utils/xyzEnergies.ts`), as agreed on 2026-10-05 - part of
  reading XYZ, which Meno does itself.
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

