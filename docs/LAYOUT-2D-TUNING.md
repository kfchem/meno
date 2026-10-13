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
   - improved: single bonds turned over, a ring atom's two groups swapped
     (and, where one of them leads back to what the piece grew from, the
     ring turned under them instead, the frame held: sucrose's fructose),
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
  to each other kept 0.7 of a bond apart, and that taken where it reads
  better by the view measure (atoms nearer than 0.6 counted). Kept apart
  always, adamantane's bonds came out uneven - its back CH2 0.62 from a
  front bridgehead is how it is drawn - and tetrodotoxin's C4 mark moved
  onto a ring bond. A centre the easing turns is put back where the solid
  has it. Scopolamine (12.2 to 2.1), ibogaine (20.3 to 17.1) and gelsemine
  (9.5 to 6.9) read better; nothing else changes.
- **The same molecule, any order** (2026-10-13). Aconitine's ring A came
  out a chair or a boat by the order its atoms were listed in - the
  distances its solid is found from fit both as well - and with it the
  whole drawing; shuffled, nearly every drawing on both lists changed,
  adamantane's and camphor's among them: the layout's choices between
  equals went by atom order. It lays out an order of the molecule's own
  now (`canonical.ts`), and every molecule on both lists comes out the same
  in four shuffled orders (`inAnyOrder.*.test.ts`). Ranks alone as the
  order read worse (held-out 8.4); a walk in rank order, as SMILES writes
  atoms, about as well as the lists' own orders. Drawings the lists'
  orders happened to suit changed with it - quinine among them, approved
  before - and are fixed one at a time after (the maintainer,
  2026-10-13). One lesson on the way: `untangle` takes the first move that
  reads better, and in the new order that move turned bilobalide's C4 OH
  into its ring - every bond of C4 in one half of the page, which RDKit
  read the other way. It never leaves a stereocentre so now.
- **A measure that read the order of the atoms** (2026-10-13). The room
  left for a bond out of a ring atom was read against the rings of the
  smallest set through it, but a cage can have more than one set as
  small - any two of quinuclidine's three six-membered cycles - and which
  one `smallestRings` keeps goes by the order the atoms come in. Quinine's
  C3, in one ring of the set its SMILES gives, had that ring's centre,
  seen in perspective, just outside the 32 degrees between its two ring
  bonds, and its vinyl counted 225 degrees off: the sheet scored the
  drawing made in Meno's own order 16.2, the engine, reading the set that
  order gives, 5.4. Laid out in the SMILES order it had drawn another
  (10.7 on the sheet, approved), which the measure made right reads 7.8.
  In a bridged system the room is now read against every ring as small as
  one of its smallest set (`ringsAlike`), so a drawing reads the same in
  any order. No drawing on either list changes; quinine (5.4) keeps its
  quinoline as its reference has it, the N at the lower left and the bond
  to C9 straight out of the ring, where the approved drawing had the ring
  30 degrees off the lattice and that bond bent - and its cage seen from
  the other side than the approved drawing's (see *Open*).
- **Ties the order of the atoms broke** (2026-10-13). Laid out in two of
  its own orders, the engine still failed three rule tests: its two walks,
  from either end, draw a symmetric molecule the same, so a tie the order
  breaks badly is broken badly in both. Another pair of walks passed those
  and failed others (a bicyclo[3.3.1] cage drawn as its mirror image, the
  BINAP propeller); the ties were found and settled instead.
  - Adamantane's textbook views are alike, four from each hand, and only
    one hand's were tried with the ring fused to it: which hand went by the
    order of the atoms, and from both of that hand's views ways 0 and 1
    drew the gem-dimethyl's equatorial methyl across the fused chair, so
    the flat drawing won. Every view as good as the best, of either hand,
    is now tried with what hangs from it, none favoured (`tiedViews`).
  - A propeller was tried against the drawing before it, but a ring in
    perspective has its bonds left out of the bonds' lengths, and the rest
    alone spread wider: turned, Pd(PPh3)4 measured a point worse for that
    alone. The two are measured on the same bonds now.
  - A macrocycle's run between atoms placed was looked for from one end,
    which end by the order of the ring's atoms, and the search did not keep
    the run off its own two ends (the placed atoms' crowding leaves them
    out, the first being bonded to it). Through two benzene rings off a
    hub, a benzene came down on the hub's atom the run ends at. The run is
    now kept off both ends and looked for from each, the better kept.
- **A group over its own cage** (2026-10-14). Aconitine's N-ethyl leaves
  the front of its cage and crosses a bond at the back: a group's atoms
  had no depth, so the bond was not broken and the crossing counted as a
  fault. A group's first atom now takes the depth of the solid's atom it
  leaves, so the bond behind it is drawn broken and the crossing is how a
  solid looks (aconitine 32.86 -> 27.86, nothing else changes).
- **Which side of a sugar a ring of sugars runs along** (2026-10-14).
  alpha-Cyclodextrin's macrocycle passes each glucose by four atoms, and
  the two ways round between them are as long: by C2 and C3, or by the
  ring O and C5. The smallest set holds one by the order of the atoms; in
  the molecule's own order it held C2 and C3, and their twelve OHs, facing
  into the circle, crowded it (12.26, against 5.45 on main). A ring of
  rings now runs along the side that carries fewer groups out of the
  system. Applied to every macrocycle, it turned vancomycin's chlorinated
  aryls over (6.74 -> 10.16): a macrocycle drawn as a chain does not face
  the groups of a ring's passage into it, so it is kept to rings of rings.
- **Atoms alike to the ranks, not alike** (2026-10-14, L8's review).
  Atoms the ranks leave alike were told apart by taking the first of them
  in the input's order. That is the same molecule whichever is taken only
  where they are alike in every way; ranks refined by neighbours never
  part some cages of three-bonded CH that are not - cuneane, basketane,
  snoutene - and two orders of cuneane's atoms wrote its bonds in two
  orders. Each alike atom is now taken first in turn, the least writing
  kept, the symmetries found on the way pruning the rest; no drawing on
  either list changes. Laid out from two own orders, every layout cost
  twice what one did, a label's group drawn out again at each relayout
  among them: the last 64 molecules are kept by their own order's writing
  (aconitine 1.5 s the first time, 0.5 ms again, its atoms reversed).
  Opening an SD file does not lay its records out.
- **A core's view chosen by the system alone** (2026-10-14). Ibogaine's
  isoquinuclidine was seen from the side its ring system alone read best
  from, which stood the indole on top of the cage, the drawing twice as
  tall as wide (18.2); from its next side the whole reads 9.3, the indole
  beside it as it is usually drawn. A cage core's other views are now
  tried with what hangs from it, as a lone cage's are, and taken where
  the whole reads clearly better. Nothing else on either list changes.
  (A crossing in perspective costing a little was tried first: every
  cage has its back bond crossing, so it moved every score and no
  drawing. The back bond's gap reads well, L12 found.)
- **An H no small move clears** (2026-10-14). Three drawings read worse
  to the eye than their score said: vinblastine's indole NH had its H on
  the other half's benzene ring, forskolin's C9 OH sat under its C10
  methyl's wedge, and XPhos Pd G3's NH2 ran into its P. The measure counts
  a label's H a quarter of a crowding, and the last step that makes room
  for H's moves only a bond or a small branch a little: a ring's NH has no
  bond to turn. Where an H is still in the way after it, the branches are
  now turned and stretched as untangle turns them, the H counted in full.
  All three clear; the sheet reads them slightly worse (the H counted a
  quarter, a bond stretched counted in full). Room for H's is now made
  with the drawing already turned to the page: an OH writes its H on the
  side the page has it on, and room made the other way up was no room
  (ginkgolide B, ingenol and bilobalide read a little better for it).
  Ouabain's C19 OH, its H on C11 with C1's OH on its other side, is not
  cleared: no turn of either branch reads better (see *Open*).
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
  (vinblastine, rifampicin), crammed;
- orientation: a flavonoid's ring O (the maintainer, 2026-10-11: up, as
  drawn everywhere - done, by the 2- or 3-aryl chromane it is); lovastatin
  (done: the turn is chosen counting the fusion H it will carry, which
  `layoutMetrics` places as `placeStereo` will before it is drawn);
  berberine (done: heteroatoms below counted by the ring); colchicine as
  it is.

## Open

- **Ouabain's C19 OH** (2026-10-14): its H lies on C11, beside C11's
  hashed OH, and turned the other way it runs into C1's OH. Main drew
  C1's OH down to the left, leaving the CH2OH room; the molecule's own
  order puts it up. Neither the H step's moves nor turning a branch as
  untangle does reads better.
- **Tetrodotoxin**, carried over from part 2 (the maintainer, 2026-10-11:
  the perspective drawing read better than the flat one, and both faced
  the wrong way). Its whole solid now reads as given, its centres the
  shape does not show wedged (the maintainer chose wedges over a solid
  only where chairs show every centre, 2026-10-12). Still open: its
  guanidine ring, with its C=N, is to be drawn flat, but laid flat onto
  the cage on either side of the bond it shares it shows one of the two
  ring-junction carbons the other way round, from every view tried; it
  stands a quarter turn from the usual drawing; and the OH in the middle
  of the cage reads O|H.
- **The solids' rules still open** (the maintainer, 2026-10-12): quinine's
  OH on C9, which is no ring atom, drawn straight down (asked in #269);
  which of paeoniflorin's six-membered rings is to be the boat (asked in
  #269). Fused chairs are drawn decalin style inside a solid, but no
  molecule on either list has a solid with such a pair: strychnine and
  artemisinin are drawn flat as decided, sparteine and aconitine read
  better flat.
- **Quinine's quinuclidine** is seen from the other side than its
  reference and the drawing approved before Meno's own atom order
  (2026-10-13): the back of the cage set off toward the quinoline, not
  away from it. Both are the textbook view, as good by the template; the
  measure reads this side better (C8's bonds spread more evenly round it),
  and no rule yet says which side a cage is seen from when only what hangs
  from it tells them apart.
- **How a ring system is turned once its face is right**: morphinan is
  60 degrees from its reference. IUPAC's stereoparent orientations are
  the candidate knowledge, if no general rule gives it.
- **Aspartame** is not drawn as a peptide read left to right, and
  **vancomycin** is not the level backbone its reference is.
- **Clearing an H** may draw a bond up to 45% longer (taxol's benzoate).
- **A phenyl of Pd(PPh3)4 across a Pd-P bond** (`hapto.test.ts`, skipped;
  main too). Its phenyls are turned as a propeller where that reads better,
  but the one across the bond is on a P whose rings turning does not help.
  The whole drawing's measure (`measureDrawing`) also counts a ring turned
  on its bond, or face-on to its metal, as drawn flat, where the benchmark
  counts it in perspective; it decides nothing here.
- **POPC's glycerol carbon** has no configuration in its graph
  (`baselines.py` leaves it out), so `stereo.py` reports it unread.
- **C60 from SMILES** (Quick Add, seen by hunter B, 2026-10-13) comes out
  a tangled flat projection, bonds crossing and the second lines of its
  double bonds floating inside its faces.
