# The round trip

```
<chem python> scripts/figure/roundtrip/corpus.py          # 1. the structures, and the truth about each -> .roundtrip/corpus.json
npm run roundtrip -- draw                                  # 2. drawn by Meno, as MOL and as SVG in every style -> .roundtrip/svg
swift scripts/figure/roundtrip/topdf.swift .roundtrip      # 3. each SVG printed as PDF, three ways -> .roundtrip/pdf
<chem python> scripts/figure/roundtrip/rdkit_draw.py       # 2b. (also) drawn by RDKit's depictor, four ways, and the reactions two -> .roundtrip-rdkit/svg
swift scripts/figure/roundtrip/topdf.swift .roundtrip-rdkit #    printed likewise; copy its pdf/ into .roundtrip/pdf
npm run tauri build -- --bundles app                       #    (the app whose PDF reader reads them back)
npm run roundtrip -- read                                  # 4. each PDF read back as Read as structure reads it -> .roundtrip/read.json
<chem python> scripts/figure/roundtrip/compare.py          # 5. against the truth -> .roundtrip/report.md, report.json
```

`<chem python>` is the Python of the RDKit plugin's lock, as for
`scripts/layout`: the app's own environment for it, under its data folder at
`uv/plugin-rdkit/venv`, will do. `corpus.py --only=Name,Name` and
`ONLY=Name,Name` for steps 3 and 4 take just those; `MENO` names another
build's executable for step 4, `RT_READ` a folder under `.roundtrip` for
its reads (`compare.py --read=` that folder), and `RT_BOX=page` reads each
page in a box round all that is on it rather than round the figures found
there - the figure reader measured apart from finding figures.
`RT_VARIANTS=upright,serif` reads only those ways of printing. `RT_DPI=300`
reads each figure as a picture of it instead: its box drawn at that
resolution by the PDF reader, traced (`lib/figure/trace`, docs/PDF.md
*A picture traced*), and read from the traced shapes with the PDF's own
letters as written; a page turned is not traced. With
`RT_LETTERS=traced` no letters are given: the picture's own are traced
and matched against the system's letters (`known.json`, as for
`RT_OUTLINE`), as a picture's are where no text lies over it.
`RT_JPEG=50` saves each picture as JPEG at that quality and opens it again
before it is traced, and `RT_SCAN=1` makes a scan of it - turned a
little, blurred, black and white, speckled, the same for each figure
every time (`spoil.ts`; JPEG through libjpeg's `cjpeg` and `djpeg`, which
must be on the path). Each read records how many atoms and bonds it
marked unsure and what it said of them, a picture's line and bond in its
pixels, and `compare.py` prints, for each
style and way of printing, how many were read right, how many were said
(nothing read, or marked unsure) and how many were wrong with no mark.
`RT_PRESETS=rdkit,rdkitcg,rdkitacs,rdkitacscg` with `RT_READ=rdkit` reads
only the structures drawn by RDKit (stage 2b): real papers' figures come
from many programs, not Meno's alone.

The reactions of `reactions.json` - textbook reactions written as reaction
SMILES - are drawn by RDKit's reaction drawing (stage 2b: `rdkitrxn`, its
options as they come, and `rdkitrxnacs`, its ACS 1996 mode) and read back
as *Read as structure* reads a scheme: the molecules read before the
longest arrow's tail, along it and past its point are compared with the
reactants, agents and products, each side's molecules by canonical SMILES.
`RT_PRESETS=rdkitrxn,rdkitrxnacs` with `RT_READ=rxn` reads only them.

Many journals print a figure's labels as outlines - each letter a filled
path, or each word one path of all its letters - and none of these PDFs
does. `RT_OUTLINE=letter` or `RT_OUTLINE=word` draws every figure's words
as outlines before it is read (`outline.ts`, from the typeface each letter
was set in, as this Mac has it), and reads them against the system's
letters as the app does; `swift scripts/figure/roundtrip/glyphs.swift
.roundtrip` measures those first, into `.roundtrip/known.json` (without it,
step 4 reads no outline as a letter: the app draws them on a canvas). With
`RT_READ=outline-letter` and `RT_READ=outline-word`, these are the round
trip's stand-in for real papers' figures, which cannot be kept here.

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
