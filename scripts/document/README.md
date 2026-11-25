# A workspace built from a manifest

A development script, beside the figures' and the still picture's: it builds a
workspace (`.meno`) from a JSON manifest and the files it names - a title,
Markdown texts, structures drawn from MOL, SD and RXN files with their names
under them, and molecules in 3D from XYZ files with their energies - so that a
report another program writes can be opened in Meno and worked on there.

It is not part of the app, and its input is not a promised interface: **the
manifest's fields may change** from one version of Meno to the next.

## Running it

From the repository's root, with the dependencies installed (`npm install`):

    MENO_DOCUMENT_MANIFEST=path/to/report.json npm run build-document

(on Windows' command prompt: `set MENO_DOCUMENT_MANIFEST=path\to\report.json`,
then the `npm` line). It runs under Vitest, as the figures' script does, so that
the app's modules load as they do in its tests. The workspace is written where
the manifest's `out` says.

## The manifest

    {
      "title": "Three chains and a water",
      "out": "report.meno",
      "style": "meno",
      "width": 100,
      "entries": [
        { "text": "intro.md", "name": "Aim" },
        { "structure": "1.mol", "id": "1" },
        { "structure": "set.sdf", "record": 2, "id": "2" },
        { "structure": "3.mol", "id": "3", "keepLayout": true },
        { "structure": "scheme.rxn", "id": "Scheme 1" },
        { "break": true },
        { "molecule3d": "water.xyz", "name": "water conformers", "conformers": true },
        { "text": "notes.md" }
      ]
    }

Paths are from the manifest's folder. A key the manifest does not know is
refused, not passed over.

- `title` (needed): words over everything, at the page's top left.
- `out`: the `.meno` written; unset, the manifest's name with `.meno`.
- `style`: the workspace's drawing style, a preset's id as the app's styles list
  has them (`meno`, `acs1996`, `rsc`, `wiley`, `nature`); unset, Meno's own.
- `width`: how wide a row grows, in bond lengths (100 unless said).
- `entries`, in reading order, each one of:
  - `text`: a Markdown file (.md), put on the page as its sheet and listed in the
    text column; `name`, its name there (the file's name unless said). It is a
    Markdown text, shown formatted, whatever `name` says.
  - `structure`: a .mol, .sdf or .rxn file, drawn; `id`, its name, under it;
    `record`, an .sdf file's record (from 1; the first unless said);
    `keepLayout`, the file's own coordinates kept (scaled to the style's bond
    length) instead of Meno's layout. An .rxn file is drawn as it is, its arrow
    and "+" signs with it.
  - `molecule3d`: an .xyz file of one frame or several, a molecule in 3D; `name`,
    what its chip says (the file's name unless said); `conformers`, its frames
    marked a conformer set - each frame then as likely as its energy says. Each
    frame's energy is read where its comment line gives it as Meno writes it,
    `E = -76.400000 Eh` (in hartrees): every frame's, or none.
  - `break`: `true` - the row ends here.

## What it does

- Every file is read as Open reads it, a structure laid out as Clean-up lays it
  out, and each put down by the page's own actions - so the workspace is what a
  chemist would have made by opening the files one by one - and it is saved as
  Save saves a page (`workspaceFile`), the texts kept in the file.
- **Placing.** The title at the top left; under it the entries in rows, in the
  manifest's order, left to right, the tops of a row's entries level, two bond
  lengths between entries and between rows. A row ends where the next entry would
  make it wider than `width`, or at a `break`; an entry wider than that stands
  alone in its row. Each entry takes the room the app measures for a file opened
  onto a page (`footOf`: its atoms, labels, name, arrow and "+" signs; a molecule
  in 3D as it is first seen, its chip with it) and a text the room of its sheet
  and of its name under it - set at one size on the screen, so measured as the
  whole page draws it seen at once in the app's least window, 640 by 480 pixels -
  so that nothing lies over anything else. The names of a row's structures stand
  on one line under its tallest structure, each centred under its own, as the
  numbers of a scheme are set; the next row starts under that line.
- **Names.** Each structure's name is the text that belongs to it, as "Add text"
  on it makes one: in the app it moves, turns and is copied with its structure,
  keeping the place the build gave it, and "Free from its structure" frees it.
  A reaction's name (an .rxn file's `id`) names a scheme of several structures
  and stays free text.
- A mistake - a file missing, a key not known, a structure file that is not flat,
  frames of other atoms in a file marked `conformers` - stops the build with a
  sentence naming the entry. Nothing is skipped without saying so.

## What it does not do

- It does not read a calculation's output: a log's molecules are read in the app,
  by the plugin that reads its kind. Give the geometries as XYZ files.
- It does not make slides, keep other files in the workspace, or read SMILES.

## Tests

`npx vitest run scripts/document` (they are part of the whole run): a manifest
of invented files built, read back as Open reads a workspace, and loaded into a
page - its texts, structures, names, energies and the conformer mark, its ids and
counters - and wrong manifests refused.
