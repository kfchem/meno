# Tuning Meno's 2D layout

For whoever adjusts the layout engine next, a person or an agent.
[`LAYOUT-2D.md`](LAYOUT-2D.md) says what a good drawing is and the rules
the engine keeps; this says where those rules live, how a change is made
and judged, what has gone wrong before, and what the maintainer has
decided. Read both before changing anything.

## Where things are

`src/lib/layout/`:

| File | What it does |
|---|---|
| `perceive.ts` | the graph: rings (smallest set of smallest rings), ring systems, pieces, stereo as given |
| `ringSystem.ts` | each ring system laid out on its own: fused and spiro rings, a ring's shape before its bond lengths, macrocycles fitted to a shape (`macrocycleFit`: heavy groups outside, a macrolide's lactone at the lower left), rings of rings, chains through a hub ring |
| `macrocycle.ts` | the shapes a macrocycle can take on the lattice |
| `cage.ts`, `bridge.ts` | a cage drawn as the solid it is (a chair or boat seen from above); a bridge drawn across a flat ring |
| `hapto.ts` | a ring bound face-on to a metal (η⁵-Cp, η⁶-arene), in perspective; a metal with its rings as one system; a metal's slots (section 7) |
| `assemble.ts` | the structure grown out from its root system in one frame: each bond's direction, zigzags, a cis double bond as a step, a phosphate as a cross, an amino acid's backbone |
| `engine.ts` | `layout2D`: the steps below, and the local search (`improve`, `rejoin`, `untangle`, `faceSugars`, `roomForHydrogens`, `squareUp`) |
| `stereo.ts` | wedges and hashes, and the H's drawn to carry them |
| `drawn.ts` | a drawing's stereochemistry read back out of it - wedges read flat, depth or none; a centre a cage in perspective shows by itself from the cage, a bridgehead drawn all but flat from the cage's solid as fitted - which is what the app gives the engine; and the wedges a flat reader needs for such a cage |
| `metrics.ts` | the measure: every rule as a number, `SCORE_WEIGHTS`, and where the drawing sets a label's H (`hydrogenSpot`) |

Tests: `engine.test.ts`, `metrics.test.ts`, `stereo.test.ts`, `rings.test.ts`, `drawn.test.ts`; and `readBack.benchmark.test.ts`, `readBack.heldout.test.ts` and `readBack.diastereomers.test.ts`, which read back every drawing the engine makes with depth - of the molecules on both lists, and of every diastereomer that can exist one centre inverted makes of the bridged ones (`scripts/layout/diastereomers.py`) - as Meno reads a drawing, and by its depth where a centre has three bonds into its ring system: each stereocentre as given.

In the app, `src/ui/features/Workspace/chem/engineLayout.ts` turns a
drawing into what the engine is given and its layout back into edits, and
`cleanUp.ts` runs it - in a web worker - for Clean-up and for a SMILES.

`scripts/layout/` (see its [README](../scripts/layout/README.md)):
`sheet.ts` draws the benchmark sheet, `labels.ts` checks the labels as
drawn, `compare.ts` compares two runs, and `molecules.json` lists the
molecules with their references.

## How a drawing is made

1. **Perceive** the molecule.
2. **Each ring system on its own** (`layoutSystem`): a cage in perspective,
   the rest flat; a bridged system tried both ways, the better kept.
3. **A macrocycle's shape**: each shape offered is grown in its best few
   frames, improved and untangled, and the best shape is kept.
4. **Each piece**:
   - grown from its root system in every frame (`framesFor`: 12, or 24 for
     a frame of squares alone);
   - improved: single bonds turned over, a ring atom's two groups swapped,
     then small sides turned over with a bond inside them turned back as
     well (on every frame for a piece of up to 40 atoms, the best three
     otherwise);
   - rejoined (parts drawn on their own, joined) and untangled (branches
     turned or stretched out of each other's way, never ending with more
     bonds crossing than at the start).

   All of this is scored as a **draft**: with a label's H and a hung
   sugar's face not counted.
5. **Last, locally, scored in full**:
   - `faceSugars` turns a sugar hung on a macrolide over to its face,
     leaving the aglycone as it is;
   - `roomForHydrogens` turns or lengthens a bond a little so that each
     label's H has room, and each label on a bare vertex (`labelRoom`) and
     each pair of labels whose ink comes near (`inkRoom`); or sets a
     branch on the other side of the chain atom it hangs from, the other
     way a zigzag goes. It takes no move that leaves a stereocentre of a
     solid, shown by the drawing for sure, unsure (`byAHair`).

   Neither takes a move that crosses bonds.
6. `squareUp` (a piece with no square ring), by the bonds as they lay
   before step 5; the pieces set side by side,
   the largest first, a bond and a half of paper between their ink
   (`inkReach`: how far each atom's label reaches left and right); the
   depth of a bridge seen from its other side; and `placeStereo`.

The engine proposes and the measure judges. Every convention is a term in
`metrics.ts`; the engine's part is to offer drawings in which the term can
be met. A new convention usually needs both: the term, and a way for the
engine to reach it (a frame, a flip, a fit, a nudge).

## The measure

`layoutMetrics` returns each measure; `SCORE_WEIGHTS` turns them into one
score, lower better. In order of weight:

- **faults**: wrong cis/trans (50), overlaps (10), crossings and crowded
  labels (5), atoms on bonds (3);
- **reading**: reading order (3 per breach), which face is shown (3),
  ring order (2);
- **shape and lattice**: bond lengths, rings, angles, tilt, askew, chains
  level.

A fault must outweigh anything it would clear, and a convention must
outweigh the shape it costs. Where a new term fights an old one, decide
which comes first and weigh them so.

Four options set a draft apart from the final score:

- `hydrogenRoom`: what a label's H running into something counts, in
  crowdings - 0 while drafting, 1 in `roomForHydrogens`, and a quarter on
  the sheet (a leftover shows, but never outweighs a drawing's shape);
- `sugarFaces`: false while drafting, so that a hung sugar's face does not
  pull the aglycone round;
- `labelRoom`: what a label on a bare vertex counts (`labelsOnVertices`) -
  0 while drafting and in choosing a cage's drawing, 1 in
  `roomForHydrogens`, and a half on the sheet. Counted while drafting, it
  moved the metal complexes and the cages; on the sheet alone it moves
  nothing (2026-10-17);
- `inkRoom`: what two labels whose ink comes near counts
  (`labelsCrowding`: symbol on symbol, or H on H, where the drawing puts
  them, with less than half a bond of paper between, fully at a fifth) -
  0 while drafting and in choosing a cage's drawing, and a half in
  `roomForHydrogens` and on the sheet alike, so that what the last step
  clears shows on the sheet (2026-10-18).

A rule for where something goes belongs in `readingOrder`; one for how a
fused system lies in `ringOrder`; which face a system is seen from in
`face`; one about labels in `crowdedLabels`.

Distances are in bond lengths. The font is 0.694 of a bond; an H set
beside its symbol is half a bond off, one under or over it 0.6.

## How to make a change

```
cp .layout/scores.json /tmp/before.json      # the sheet as it was
# ...change the engine or the measure...
npm run layout-bench                         # or --only=Name,Name
npm run layout-compare -- /tmp/before.json   # what moved, and why
npm run layout-labels                        # labels, as drawn
npm run layout-stereo                        # then, in the chem environment:
<chem python> scripts/layout/stereo.py       # the stereochemistry, as RDKit reads it
npx vitest run src/lib/layout
npm run typecheck
```

Then look at every molecule that moved on the sheet (`.layout/index.html`),
not only the one aimed at: the score is a guide, the drawings decide. Add
a test with a small molecule built by hand, and a line to `LAYOUT-2D.md`.

## What has gone wrong before

- **A tie decided by rounding** (2026-10-14). Cyclotetracosane, nothing
  on it, came out a triangle of zigzags, as tall as wide (hunter B): its
  five shapes all read 0 on the measure, but the sums differed in the
  fourteenth place, and the smallest was the fifth shape, the triangle.
  Shapes alike on the measure now keep the order they are offered in, the
  one that lies best first; a shape is taken over an earlier one only
  where it reads better by more than rounding.
- **The search is greedy and follows a path.** A new kind of move, or a
  new term, can send it to a worse drawing elsewhere (vancomycin and
  azithromycin both did). Compare the whole sheet.
- **A small concern weighed too early pulls the whole drawing.** An H's
  room and a sugar's face, counted while the drawing was being set, moved
  a peptide's chain and a macrolide's aglycone. Settle the drawing first,
  then fix such things locally, last.
- **A local fix must never buy itself with a crossing.** Every late step
  checks crossings.
- **An H is a letter, not a point.** The measure keeps bonds 0.3 of a bond
  from an H's middle; a bond at a slant 0.4 off can still touch a corner
  of it (ginkgolide B's tert-butyl, by its OH). Widening that for every
  bond moved bilobalide's OH onto a wedge; the tert-butyl's own settling
  measures the H by its letter instead.
- **A ring turned over across a bond lies askew.** Offer the turn that sets
  it square on the lattice again.
- **Rules made for one case can be wrong in another.** A sugar's anomeric
  carbon on the right and ring O at the top hold for a chain of sugars read
  left to right, not for a sugar hung on an aglycone. For that, only the
  face was kept.
- **A wedge read from its angles lies.** The engine once read its own
  wedges from the angles as drawn. At a centre whose three bonds in the
  page lie within 180 degrees of each other, that says the opposite of
  what a reader - and RDKit - reads: artemisinin's ketal carbon, the one
  with the peroxide and a methyl on it, came out the wrong way while
  looking right, and so did an H of sirolimus's. The reading
  (`drawnVolume`) now goes by the way the bonds run round the centre, and
  `layout-stereo` with `stereo.py`, which has RDKit read every drawing on
  the sheet, is the check. With it, artemisinin is drawn from its other
  face: its angular methyl is in front only that way.
- **A drawing that says nothing reads by luck.** A cage's bond out,
  drawn straight out from the cage's bonds, is where neither of its
  corners is: which it read as turned on how the view fell. Palytoxin's
  ketals read right under node and wrong in the app, where the last bits
  of the same sums came out otherwise. Such a bond now goes along its
  corner. A test turns every bond
  out of a cage 15 degrees each way and asks for the same reading.
- **A ring fused flat onto a cage can stand on the wrong face.** The cage
  is drawn in perspective and the rings fused to it laid flat beside the
  bonds they share with it; a ring so laid stands on one face of the cage
  or the other. Only the cage's own atoms were checked, so scopolamine's
  epoxide was laid towards its three-carbon bridge rather than its N and
  drew another isomer, and tetrodotoxin's guanidine ring turned one of the
  atoms it joins the cage at. `stereo.py` passed both: the wedges were
  right for a reader that reads them flat, and the perspective said the
  opposite. Every atom of such a system is now checked as drawn, and the
  read-back tests read every drawing with depth on both lists as Meno
  does, the perspective with the wedges.
- **One isomer drawn well, the next one wrong.** The read-back tests
  passed on every molecule listed, but of the one-centre diastereomers of
  the bridged ones, 13 of 62 read wrong. Three faults:
  - a bridge across a ring was put in front or behind as the solid from
    bond distances had it, which can have a ring fusion the wrong way
    (morphine's and codeine's 5-epimers, an artemisinin isomer);
  - the reader took the depth of a ring laid across another's face for a
    place in space, so that a centre on the bridge, shown by its wedge,
    read the other way (gibberellic acid's 3-epimer);
  - it read a centre with three bonds into a cage partly from where the
    fourth would be in the solid fitted to a drawing that is not quite its
    projection (paeoniflorin with another sugar), and a bridgehead drawn
    all but flat by a hair (camphor's skeleton with one centre given).
  The diastereomers are a test now. And the engine reads back every solid
  it draws as Meno reads a drawing, last: one whose centres do not read as
  given (a bond out of it drawn nearer the other of the two ways the
  solid leaves free) is drawn again, without its view from the other
  side, then flat - three tetrodotoxin and ibogaine isomers were so.
- **Measure a drawing as it is drawn.** Choosing between a solid and a
  flat drawing on a measure that left out the H's its wedges stand on
  took aconitine's crowded solid over its flat drawing; the sheet, which
  draws them, scored it 48 against 24.
- **A better solid moves the view.** The solid found with real angles and
  flat double bonds (2026-10-12) is nearer the molecule, and changed which
  textbook view of a cage scored best, and which of flat, cage alone and
  whole won: ginkgolide B went to a whole solid with its OHs on each
  other, ibogaine's isoquinuclidine to a view that crowded its indole.
  The choice among them is now made on the whole drawing, and a cage's
  next best views are tried with what hangs from it.
- **A cage eased onto its template keeps its atoms apart** (2026-10-13).
  The atoms of a cage not on its template ring were eased toward bonds of
  one length with nothing keeping them off each other: seen from the
  template's side, scopolamine's epoxide landed by its N, and its solid
  lost to a flat drawing. The easing is run again with atoms not bonded
  to each other kept 0.7 of a bond apart, and that taken where it leaves
  fewer pairs of atoms nearer than 0.6 of a mean bond and has a lower
  `viewCost` at its defaults (0.6 and 0.3, no depth: the measure flat and
  solid are weighed by, not the one views are ranked by). Kept apart
  always, adamantane's bonds came out uneven - its back CH2 0.62 from a
  front bridgehead is how it is drawn - and tetrodotoxin's C4 mark moved
  onto a ring bond. Taken wherever `viewCost` alone fell (hunter B's
  review), every bicyclo[2.2.2] view counted as crowded - its back bridge
  0.52 from the back bridgehead, eased only to 0.54 with its bonds uneven -
  and of 1230 bridged molecules 37 read worse by more than 0.5 (a
  chlorobicyclo[2.2.2]octanol 4.3 to 8.4, a 3-aryl nortropane 2.4 to 7.5).
  A centre the easing turns is put back where it was put, again while any
  reads wrong. Scopolamine (12.2 to 2.1), gelsemine (9.5 to 6.9) and
  tetrodotoxin (16.31 to 16.26) read better; nothing else on the two lists
  changes. Ibogaine, 20.3 to 17.1 by `viewCost` alone, is left as it was.
- **A solid read with no configuration.** Meno's reader (`drawn.ts`)
  fits a cage drawn in perspective to its solid, to find the corners a
  centre's bonds out of the cage can take. It found that solid from the
  bonds alone, no configuration held, and for tetrodotoxin that is
  another isomer's - fitted to the page, its atoms 0.37 of a bond (root
  mean square) from where they are drawn, against 0.14 for the solid the
  engine drew - with C4's two free corners drawn
  on one side of it: C4 read as given only by a hair, and kept its wedge
  when the maintainer ruled it should have none (2026-10-17). The solid
  is now found again with the centres the cage fixes itself held - each
  with three bonds into the cage, read from those bonds as drawn - and
  taken where the drawing is the nearer picture of it. C4 reads for sure,
  and nothing else on the benchmark, held-out and organometallic lists is
  drawn differently.
- **A double bond is stereo too.** The read-back guards read the
  stereocentres only, and huperzine A's bridge drew a ring's C=C trans
  unnoticed. They read every drawn double bond now (2026-10-13): one the
  molecule gives cis or trans as given, one in a ring of seven atoms or
  fewer cis. Meno's SMILES reader keeps a double bond's cis or trans from
  its / and \ marks for that. A chain drawn round a block of rings had
  its double bonds' cis or trans checked only as its turns were chosen,
  which leaves out those at its two ends and the last two (hunter B,
  2026-10-13: an E bond beside a naphthalene drawn cis), and easing it to
  close moved the last chain atom across a ring atom's bond. Every one is
  checked on the whole chain now, and the chain kept as found where easing
  would turn one.
- **A solid found once.** A cage's solid was found once for each
  molecule object, but a drawing read back is perceived anew, and every
  read-back found it again: half of tetrodotoxin's Clean-up. It is kept by
  what it is found from now - the atoms, bonds and configurations
  (2026-10-13) - and cages are drawn in about half the time, the
  drawings the same.
- **A wedge that reads by luck.** At a centre with two of its bonds in a
  line, or every bond in one half of the page, a wedge says the
  configuration only as the bonds happen to fall, and RDKit read two
  held-out natural products the other way (ibogaine's bridgehead,
  bilobalide's carbon between its lactones). A wedge is now first taken
  only where it reads the same with any bond in the page turned 12 degrees
  either way, and with the bonds spread round the centre; an H drawn and
  wedged, or another bond, before that. Bilobalide was still read the
  other way, its four bonds all in half the page, until its groups at the
  36-degree gap beside its C4 leant out of the gap (2026-10-12,
  `LAYOUT-2D.md` *At a ring atom*); now every reader reads it as given.
  Its tert-butyl then ran through C9's OH, the two atoms 0.62 of a bond
  apart: the gap is now eased open as well (`LAYOUT-2D.md` *Rings of three
  to eight*), and the molecule stands with C4 above C9, its tert-butyl up.
  For a centre with no such answer, the canvas marks it (EDITOR-2D.md, *Stereochemistry drawn by luck*);
  checking every centre of the bench's 700 takes about 5 ms.
- **Speed.** One measure takes 0.1 to 0.3 ms; the calls multiply by frames,
  shapes and passes. The sheet takes about 8 s; ciclosporin, at about 1 s,
  is the slowest.

## What the maintainer has decided

These are judgements, not things that follow from the rules, and each is
now kept by a rule in `LAYOUT-2D.md`:

- **Acids and amino acids**: an acid's C=O up, except on a saturated
  ring's carbon (penicillin's points down). An amino acid has its side
  chain on the left, the COOH on the right and the NH2 below.
- **Sugars**:
  - the anomeric carbon on the right, the ring numbered clockwise from it
    (the Haworth projection seen from above);
  - on a glycoside, the aglycone upper left and the sugars lower right;
  - a macrolide's sugars face the aglycone, but are still seen from their
    face, whatever the references do.
- **Macrocycles**:
  - never round, with each substituent on the 240-degree side;
  - E/Z exact, and no ring trans double bond or fused ring set in an
    indentation;
  - a macrolide's lactone at the lower left, the ring numbered
    counterclockwise from the carbonyl carbon;
  - vancomycin not round.
- **Stereo**:
  - no run of wedges (an H instead);
  - a steroid's fusion H drawn clear of the rings;
  - an H hemmed in by rings goes where there is room;
  - (2026-10-11) an H pointing into a ring's middle reads badly
    (lovastatin's, yohimbine's), but a steroid's straight up or down
    stays as it is;
  - both of a ring atom's two groups marked.
  - (2026-10-17) no wedge at a centre of a solid that the perspective,
    read with its depth, shows for sure (tetrodotoxin's C4), as R/S is
    read from the perspective; a file is given a wedge for it.
- **A tert-butyl** fanned, its methyls 60 degrees apart, not a cross; and
  so a trimethylsilyl, a trimethylammonium, a CF3 and a CCl3. A molecule
  grown from one (tert-butanol) has its other bond level, the fan to one
  side (the maintainer, 2026-10-12).
- **Chains**: gem-dimethyls drawn close together; symmetry kept. Lipids
  are straight, a cis double bond a step; prostaglandins drawn as their
  fatty acid folded, the acid's chain on top.
- **Cages and bridged systems**:
  - cages built from the chair and boat, always seen from above (the
    back edge at the top), axial bonds exactly upright;
  - artemisinin drawn flat;
  - taxol's parts each drawn well, then joined;
  - a ring hemmed in by others keeps its shape before its bond lengths;
  - solids (2026-10-12): a solid keeps its centres the shape does not show
    wedged, not drawn flat; no wedge where the drawn conformation shows the
    configuration (a chair's or boat's bonds, a bicyclic skeleton), and a
    mark that is needed on the substituent rather than the ring-fusion
    atom; a group axial on a chair upright; a ring with a double bond in it
    flat, a double bond's atoms and all their neighbours in one plane;
    fusions drawn as they are, trans or cis; chair or boat as the molecule
    is - all read from Meno's own solid, not set molecule by molecule.
    Cocaine and camphor are drawn right.
- **Orientation**:
  - Clean-up gives the right drawing in one go (turning a drawing over is
    a feature of its own, not the answer);
  - a ring system is seen from its front face, by rules drawn from how
    IUPAC orients its stereoparents;
  - morphinan turned 60 degrees from its reference is acceptable;
  - penicillin as its reference;
  - griseofulvin's aromatic ring on the left;
  - diazepam fine as it is;
  - (2026-10-11) berberine's ring N at the bottom, as its reference, before
    the O's of its methylenedioxy; colchicine fine as it is, its
    trimethoxyphenyl ring on the left (its reference has the tropolone
    there).
- **Phosphates** drawn in a straight line, by a general rule.
- **Labels**: no H is ever hidden. The layout makes room by moving bonds
  a little, never by writing the H under its symbol, and the drawing code
  is not changed for it.
- **Metals** (section 7):
  - dppf's and Cp's rings drawn flattened, in perspective, their near
    edges bold; a Cp with its circle, never as a diene;
  - PPh3 crowded round a metal drawn with its phenyls flattened, their
    near edges bold, so that it looks three-dimensional;
  - (2026-10-02) the bold on the near side - it was on the far side of a
    lone Cp - and the bonds running toward the viewer drawn as wedges,
    not one bond bold alone; the phenyls alike; where the bold edge and a
    wedge meet, no dent;
  - (2026-10-02) cod's C=C both cis - one was drawn trans - (a tub);
    =C= and CO straight;
  - by rules, not templates, and without losing anything on the organic
    molecules;
  - Clean-up drawing a complex as writing out its label does.

Licences: a reference image (Wikipedia, IUPAC) is linked, never copied or
traced into the repository, and no code is taken from RDKit, CoordGen or
CDK.

## Held out

`scripts/layout/heldout.json` lists natural products nothing is tuned for
(2026-10-11), drawn with `--list=heldout` (the bench's README). The
maintainer found the engine much worse on them than on the benchmark:
3.4 against 16.0 on main 2fde77d. Run it beside the benchmark after each
change; a molecule that comes to be tuned for moves to `molecules.json`,
and the held-out list takes new ones. What it showed, by kind:

- cages and bridged systems beyond the chair and the boat (tetrodotoxin,
  ginkgolide B, gelsemine, paeoniflorin, picrotoxinin, aconitine) - in
  part: a system that will not lie flat is drawn as a solid, or its cage
  so and the rest flat onto it (`cageCore`, `keepsConfigurations`); a
  solid is taken only with its stereocentres as given. Gelsemine,
  paeoniflorin and galantamine now read as their references; ibogaine is
  whole but small and close; ginkgolide B, aconitine and gibberellic acid
  still flat, their solids failing the stereo test or not clearly better.
  Part 2: a flat drawing that leaves an atom's substituent no room is not
  one without a fault - huperzine A (a bridge across a ring's face, its
  ethylidene on that ring) now a solid, picrotoxinin's rings laid with
  room (counted in choosing a bridged system's regular ring, not in easing
  it: paclitaxel worsened). Scopolamine and tetrodotoxin are flat: their
  cages with a ring fused flat onto them showed another isomer (*What has
  gone wrong before*), scopolamine's on its epoxide's face (the
  maintainer, 2026-10-11). Tetrodotoxin, carried over, is now a solid as a
  whole, its C4a turned the way it is given (*Open*);
- two rings fused on neighbouring sides of a third, squeezed flat
  (saxitoxin) - fixed: the run's clash test beside a shared atom, and the
  fused system eased once it has a fault;
- large molecules of two parts, or a macrocycle round an aromatic system
  (vinblastine, rifampicin), crammed - rifampicin done (2026-10-13): its
  naphthofuranone drawn first and regular, the ansa chain round it with
  its E/Z as given, its hydrazone outside;
- orientation: a flavonoid's ring O (the maintainer, 2026-10-11: up, as
  drawn everywhere - done, by the 2- or 3-aryl chromane it is); lovastatin
  (done: the turn is chosen counting the fusion H it will carry, which
  `layoutMetrics` places as `placeStereo` will before it is drawn);
  berberine (done: heteroatoms below counted by the ring); colchicine as
  it is.

## Open

- **Two double bonds in a ring of ten or twelve** (hunter B's sweep of
  cycloalkadienes, 2026-10-13): one of them still comes out the other way
  round in 12 of the 126 rings of 8 to 16 atoms - four of eight atoms
  (drawn regular; hunter B's 8-ring dent is a PR of its own), and eight of
  10 and 12, where the lattice has one shape or none that holds both (a
  twelve has a single shape with no dents, and no dented one without a
  turn of five). Rings of 11, 14 and 16 take a shape from further down
  now, and every ring of 14 to 24 with two comes out as given (14 of 358
  wrong on main). With three, two of them trans, 27 of 1820 in rings of
  14 to 20 (not 19) still come out wrong, against 130 on main: 24 in a
  ring of 14, and the all-trans conjugated triene of 16, numbered three
  ways. Not yet checked: the macrolides of 16 to 43 atoms the sweep found.
- **Tetrodotoxin**, carried over from part 2 (the maintainer, 2026-10-11:
  the perspective drawing read better than the flat one, and both faced
  the wrong way). Its whole solid now reads as given, its centres the
  shape does not show wedged (the maintainer chose wedges over a solid
  only where chairs show every centre, 2026-10-12). Still open: its
  guanidine ring, with its C=N, is to be drawn flat, but laid flat onto
  the cage on either side of the bond it shares it shows one of the two
  ring-junction carbons the other way round, from every view tried; and
  the OH in the middle of the cage reads O|H: a label's H goes on the
  side away from its own bond, and a cage bond passes there; nudging the
  OH round its bond finds no better place, and placing the H by the bonds
  around it is the drawing's rule, not the engine's. Its orientation is
  done (2026-10-13): of the template views alike, the level one, its
  guanidine ring beside the cage as in the usual drawing.
- **The solids' rules still open** (the maintainer, 2026-10-12): quinine's
  OH on C9, which is no ring atom, drawn straight down (asked in #269).
  Fused chairs are drawn decalin style inside a solid, but no
  molecule on either list has a solid with such a pair: strychnine and
  artemisinin are drawn flat as decided, sparteine and aconitine read
  better flat.
- **Paeoniflorin's carbocycle as a boat** (the maintainer, after #269: the
  leftmost ring of its cage, C1-C6, is to be drawn as the boat its
  bridges fold it into). Its solid has that ring as a boat (bow and stern
  C2 and C5) and its dioxane as a chair; the template draws the dioxane,
  which reads best by every measure. Tried and not taken: the boat by the
  template, seen from above, puts C7 in the middle of the drawing, and the
  CH2OBz on it crosses the cage; the boat seen from its side, bow and
  stern the ends and the bridges above, as norbornane is drawn, is the
  reference's view, but an orthographic projection of it crowds C1, O9
  and O10 together. The reference draws the back of the boat about twice
  as wide as its front, which no projection gives. A template for a boat
  seen from its side, built that way, is not wanted (the maintainer,
  2026-10-13): paeoniflorin stays as it is drawn now.
- **How a ring system is turned once its face is right**: morphinan is
  60 degrees from its reference. IUPAC's stereoparent orientations are
  the candidate knowledge, if no general rule gives it.
- **Aspartame** is not drawn as a peptide read left to right, and
  **vancomycin** is not the level backbone its reference is.
- **Clearing an H** may draw a bond up to 45% longer (taxol's benzoate).
- **POPC's glycerol carbon** has no configuration in its graph
  (`baselines.py` leaves it out), so `stereo.py` reports it unread.
- **C60 from SMILES** (Quick Add, seen by hunter B, 2026-10-13) comes out
  a tangled flat projection, bonds crossing and the second lines of its
  double bonds floating inside its faces.
- **Ginkgolide B** (2026-10-13). No two of its rings share three atoms,
  so it is no cage; three share the bond C7-C12, a propellane, which no
  flat drawing can lay out without a crossing. The whole is drawn as a
  solid seen down an axis, and loses to the flat drawing (61 against 32):
  its four O's, tert-butyl, methyl and seven centre H's crowd any view of
  so compact a solid. Lean-away does not apply: it opens narrow gaps
  between groups, and here the rings themselves cannot lie flat. The
  usual drawing lays its lactone and first cyclopentane flat, draws the
  ether O27 as a one-atom bridge from C7 to C26, and the rest in
  perspective. Tried and not taken: the propellane treated as a bridged
  system (a lactone becomes the bridge, its C=O inside a flat ring); the
  ether O as the bridge, its bonds drawn longer (the flat rings crowd it);
  the spiro lactone turned to bring C26 within reach (no placement fits).
  Choosing the flat rings and two bridges as the usual drawing does is
  the likely way.
- **Aconitine** (2026-10-13): two cages fused - the bicyclo[3.2.1] C/D
  rings onto the core of rings A, B, E and F - drawn as one solid by a
  projection, since no template view of the whole reads (18.1 against the
  threshold 8). Laying the second cage flat onto the first misreads a
  junction, and the whole drawn by the chair template crowds its esters.
  The usual drawing shows both cages in perspective, ring A a chair in
  front.
