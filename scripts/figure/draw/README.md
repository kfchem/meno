# Figures of structures drawn from a manifest

A development script, beside the round trip's: it draws a figure - several
structures in a row or a grid, a caption under each, a reaction arrow with
words over and under it, atoms and bonds highlighted - as SVG, with Meno's own
drawing code and without the app. The use is a report's figures and tables of
structures.

It is not part of the app, and its input is not a promised interface: **the
manifest's fields may change** from one version of Meno to the next.

## Running it

From the repository's root, with the dependencies installed (`npm install`):

    MENO_DRAW_MANIFEST=path/to/manifest.json npm run draw-figures

(on Windows' command prompt: `set MENO_DRAW_MANIFEST=path\to\manifest.json`, then
the `npm` line). It runs under Vitest, as the round trip's stages do, so that the
app's modules load as they do in its tests. Each figure is written as
`<name>.svg` in the manifest's `out` folder.

## The manifest

    {
      "style": "meno",
      "out": "figures",
      "figures": [
        {
          "name": "table-1",
          "columns": 3,
          "items": [
            { "file": "1a.mol", "id": "1a", "value": "85 %" },
            { "file": "1b.mol", "id": "1b", "value": "72 %", "highlight": { "atoms": [4], "bonds": [3], "color": "#ffd400" } },
            { "file": "1c.sdf", "id": "1c", "record": 2, "keepLayout": true }
          ]
        },
        {
          "name": "scheme-1",
          "style": "acs1996",
          "items": [
            { "file": "1a.mol", "id": "1a", "arrowAfter": { "over": "Pd/C, H2", "under": "rt, 2 h" } },
            { "file": "2a.mol", "id": "2a" }
          ]
        }
      ]
    }

Paths are from the manifest's folder.

- `style` (manifest, and a figure's own over it): a style preset's id as the
  app's styles list has them (`meno`, `acs1996`, `rsc`, `wiley`, `nature`); the
  first where none is given.
- `out`: the folder the SVG files go to, from the manifest's folder.
- A figure: `name` (the file's name: letters, digits, `_`, `-`, `.`), `items`, and
  `columns` to put the items in a grid of that many to a row; without it they stand
  in one row.
- An item: `file` (.mol, .sdf or .rxn), `id` and `value` (the caption's first and
  second line, centred under the structure), `record` (an .sdf file's record, from
  1; the first unless said), `keepLayout`, `highlight` and `arrowAfter`.
- `highlight`: `atoms` and `bonds`, by number from 1 in the file's order (a MOL
  file's atom block and bond block; in an .rxn file, its molecules one after the
  other), and `color` (#rrggbb; yellow where not given).
- `arrowAfter`: an arrow from this item to the next one of a row, with its words
  `over` and `under` it. The arrow is as long as its words need. Arrows are for
  rows: an item of a grid, or the last item of a row, cannot have one.

## What it does

- Every structure is drawn at one bond length, the style's: a file's own scale is
  not kept (the reader makes a file's mean bond length the drawing's), so a file
  drawn small and one drawn large come out alike.
- Without `keepLayout`, Meno lays each structure out itself, as the app does for a
  file opened. With it, the file's coordinates are kept as they are, scaled
  and shifted and nothing else. An .rxn file is always drawn as it is: its
  own layout, arrow and plus signs.
- The items of a grid stand in cells as wide as the widest item and as tall as the
  tallest; the captions all lie at the one level under a row's structures, each
  centred on its own.
- A figure with a mistake - a missing file, an atom or bond number the file does
  not have, an unknown style, a file that is not a flat structure - stops the
  run with a message naming the figure and the item. Nothing is skipped without
  saying so.

## What it does not do

- It does not write PNG or PDF: only SVG, so that no dependency is added. Turn the
  SVG into either with a tool of your own.
- It does not read SMILES: its input is files.
- It does not turn a structure onto a reference structure.
- A 3D file (a molfile with depth, an XYZ file) is refused, not drawn.

Fonts: the SVG's texts name the style's typeface, then Arial and Helvetica; a
viewer without the first draws a metric match or what it has. Captions are centred
by Meno's own measure of the text.

## Tests

`npx vitest run scripts/figure/draw` (they are part of the whole run). Their
answers are worked by hand, in their comments, from small molfiles typed in
`fixtures.ts`.
