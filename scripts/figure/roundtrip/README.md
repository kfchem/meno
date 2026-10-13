# The round trip

```
<chem python> scripts/figure/roundtrip/corpus.py          # 1. the structures, and the truth about each -> .roundtrip/corpus.json
npm run roundtrip -- draw                                  # 2. drawn by Meno, as MOL and as SVG in every style -> .roundtrip/svg
swift scripts/figure/roundtrip/topdf.swift .roundtrip      # 3. each SVG printed as PDF, three ways -> .roundtrip/pdf
npm run tauri build -- --bundles app                       #    (the app whose PDF reader reads them back)
npm run roundtrip -- read                                  # 4. each PDF read back as Read as structure reads it -> .roundtrip/read.json
<chem python> scripts/figure/roundtrip/compare.py          # 5. against the truth -> .roundtrip/report.md, report.json
```

`<chem python>` is the Python of the RDKit plugin's lock, as for
`scripts/layout`: the app's own environment for it, under its data folder at
`uv/plugin-rdkit/venv`, will do. `corpus.py --only=Name,Name` and
`ONLY=Name,Name` for steps 3 and 4 take just those; `MENO` names another
build's executable for step 4.

## What it is for

*Read as structure* (docs/PDF.md, *Stage 5*) has to give back the structure
the figure shows: wrong atoms, a charge lost, a wedge read the wrong way
round or a double bond's geometry turned are the worst it can do, because
nothing on the page shows them. This checks it the one way that has a
truth to check against: structures whose SMILES is known - the layout
benchmark's (`scripts/layout/molecules.json`, `heldout.json`) and the
charges, isotopes, stereochemistry, radicals and metals of `cases.json` -
drawn by Meno as a SMILES typed in is drawn, exported as Export writes SVG
in each drawing style, printed to PDF, read back, and compared by RDKit's
canonical SMILES, stereochemistry, isotopes and charges kept.

- **Drawn** (step 2): the plugin's MOL block for the SMILES read and laid
  out by Meno's engine (`structureFromSmiles`), written as Export writes a
  MOL file. Compared too, so that what is wrong in the drawing is told from
  what is wrong in the reading.
- **Printed** (step 3): by WebKit, as a browser prints a page - words kept
  as words, in their typeface (IBM Plex Sans from the app's own fonts) -
  at the drawing's size, on an A4 page. Each three ways: as it is; the
  page turned a quarter (`/Rotate 90`); and every word in Times New Roman,
  as a PDF made where the drawing's typeface was missing has them.
- **Read** (step 4): the page's figures found as a click in the column finds
  them (`lib/pdf/figures`), all taken in one box - or, where none is found,
  a box round all that is on the page, as one drawn by hand - read by the
  built app's PDF reader (`Meno --pdf`) and Meno's figure reader
  (`utils/figures` `figureFrom`). Each figure's data is kept in
  `.roundtrip/figures`, to look into a read without the reader.
- **Compared** (step 5): where a read differs from the truth, what differs -
  the formula, the bonds, the charges, the isotopes, or the
  stereochemistry alone.

Nothing it makes is committed: every PDF is printed from Meno's own
drawings, here, each time.
