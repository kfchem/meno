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
| `drawn.ts` | a drawing's stereochemistry read back out of it - wedges as RDKit reads them, a cage in perspective from its solid - which is what the app gives the engine; and the wedges a flat reader needs for such a cage |
| `metrics.ts` | the measure: every rule as a number, `SCORE_WEIGHTS`, and where the drawing sets a label's H (`hydrogenSpot`) |

Tests: `engine.test.ts`, `metrics.test.ts`, `stereo.test.ts`, `rings.test.ts`, `drawn.test.ts`; and `readBack.benchmark.test.ts` and `readBack.heldout.test.ts`, which read back every drawing the engine makes with depth of the molecules on both lists, as Meno reads a drawing, each stereocentre as given.

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
     label's H has room.

   Neither takes a move that crosses bonds.
6. `squareUp` (a piece with no square ring); the pieces set side by side,
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

Two options set a draft apart from the final score:

- `hydrogenRoom`: what a label's H running into something counts, in
  crowdings - 0 while drafting, 1 in `roomForHydrogens`, and a quarter on
  the sheet (a leftover shows, but never outweighs a drawing's shape);
- `sugarFaces`: false while drafting, so that a hung sugar's face does not
  pull the aglycone round.

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

- **The search is greedy and follows a path.** A new kind of move, or a
  new term, can send it to a worse drawing elsewhere (vancomycin and
  azithromycin both did). Compare the whole sheet.
- **A small concern weighed too early pulls the whole drawing.** An H's
  room and a sugar's face, counted while the drawing was being set, moved
  a peptide's chain and a macrolide's aglycone. Settle the drawing first,
  then fix such things locally, last.
- **A local fix must never buy itself with a crossing.** Every late step
  checks crossings.
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
  ketals read right under node and wrong in the app, whose JavaScript
  engine (WebKit's) came to another view from the last bits of the same
  sums. Such a bond now goes along its corner. A test turns every bond
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
- **A wedge that reads by luck.** At a centre with two of its bonds in a
  line, or every bond in one half of the page, a wedge says the
  configuration only as the bonds happen to fall, and RDKit read two
  held-out natural products the other way (ibogaine's bridgehead,
  bilobalide's carbon between its lactones). A wedge is now first taken
  only where it reads the same with any bond in the page turned 12 degrees
  either way, and with the bonds spread round the centre; an H drawn and
  wedged, or another bond, before that. Bilobalide is still read the other
  way: no choice is sure there, its four bonds all in half the page - a
  cage's drawing, not a wedge, is its answer. Until it has one, the canvas
  marks such a centre (EDITOR-2D.md, *Stereochemistry drawn by luck*);
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
- **Chains**: gem-dimethyls drawn close together; symmetry kept. Lipids
  are straight, a cis double bond a step; prostaglandins drawn as their
  fatty acid folded, the acid's chain on top.
- **Cages and bridged systems**:
  - cages built from the chair and boat, always seen from above (the
    back edge at the top), axial bonds exactly upright;
  - artemisinin drawn flat;
  - taxol's parts each drawn well, then joined;
  - a ring hemmed in by others keeps its shape before its bond lengths.
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
  maintainer, 2026-10-11). Tetrodotoxin is carried over (*Open*);
- two rings fused on neighbouring sides of a third, squeezed flat
  (saxitoxin) - fixed: the run's clash test beside a shared atom, and the
  fused system eased once it has a fault;
- large molecules of two parts, or a macrocycle round an aromatic system
  (vinblastine, rifampicin), crammed;
- orientation: a flavonoid's ring O (the maintainer, 2026-10-11: up, as
  drawn everywhere - done, by the 2- or 3-aryl chromane it is); lovastatin
  (done: the turn is chosen counting the fusion H it will carry, which
  `layoutMetrics` places as `placeStereo` will before it is drawn);
  berberine (done: heteroatoms below counted by the ring); colchicine as
  it is.

## Open

- **Tetrodotoxin**, carried over from part 2 (the maintainer, 2026-10-11):
  it is drawn flat, its cage in perspective with the guanidine ring laid
  flat onto it having shown C4a the other way. The maintainer noted two
  things: the perspective drawing read better than the flat one, and
  both face the wrong way - their orientation. Wanted: a perspective
  drawing that shows the molecule as given, in the right orientation: its
  cage seen from above, as cages are drawn (`LAYOUT-2D.md` section 2), and
  from its front face (section 4).
- **How a ring system is turned once its face is right**: morphinan is
  60 degrees from its reference. IUPAC's stereoparent orientations are
  the candidate knowledge, if no general rule gives it.
- **Aspartame** is not drawn as a peptide read left to right, and
  **vancomycin** is not the level backbone its reference is.
- **Clearing an H** may draw a bond up to 45% longer (taxol's benzoate).
- **POPC's glycerol carbon** has no configuration in its graph
  (`baselines.py` leaves it out), so `stereo.py` reports it unread.
