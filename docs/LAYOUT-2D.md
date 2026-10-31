# How Meno lays out a structure

The rules Meno's 2D layout engine (`src/lib/layout/`) works by. They are
meant to be general: to give a drawing a chemist finds clean for a structure
nobody has drawn before, not to reproduce stored drawings of known ones.
Where a class of molecule has a way it is always drawn - sugars, peptides,
steroids - the aim is for that way to follow from the rules, and the
sections below say how it does.

The benchmark in `scripts/layout` measures the engine against these rules
(`src/lib/layout/metrics.ts`) and shows every drawing beside the structure
its Wikipedia article uses.

Clean-up gives one drawing, the best it finds, and the same drawing
whatever order the atoms come in (the maintainer, 2026-10-14). Every
choice on the way is made by the structure, or by trying each way at that
point and keeping the best; which atom, bond or ring happens to be listed
first never decides it. Laying a molecule out in several orders and
keeping the best is no answer: the result still depends on the orders
tried. `npm run layout-order` lists the molecules still drawn otherwise in
another order. Where the rules below leave a tie, it is settled so:

- **By structure.** Each atom is classed by what it is and what it is
  bonded to, refined through its neighbours, each stereocentre and each
  double bond (`ranks.ts`): atoms of one class are alike in everything
  the layout looks at. A branch's slots go by the weight of what hangs,
  then a single bond before a double one, then by class; the ring a
  system is started from, and each ring after it, by the rings' ranks,
  then the one with the most bonds out of the system, then by its atoms'
  classes; the block a macrocycle starts from by the atoms it shares with
  the macrocycle, then how fused it is; a chain's longest path from a
  carbon end; a ring system hung from a bond with its first ring
  neighbour by class on the left of the bond; a macrocycle's chain run
  from the end with more bonds of its own still to place; a cage's solid,
  found from how far apart its bonds put its atoms, and the views of it,
  each worked out atom by atom and bond by bond in the order the
  structure gives - its scatter starts and easing (a view's easing
  pulls every bond at once), a stereocentre's three
  neighbours it is held by, which of two bonds out of an atom takes which
  corner of the tetrahedron.
- **By trying each.** Rings tied in rank are each placed first, or next,
  and the system that reads best flat is kept (up to eight layouts a
  system); ring systems as near the middle of the molecule and as large -
  lactose's two rings, NAD+'s two riboses - are each grown from, every
  frame of each tried; a frame that lies on the lattice no way round
  (fives and sevens) is set with each of its atoms that has bonds out in
  turn straight up, since the bonds out of one atom alone can lie on the
  lattice; a macrocycle's chain run with ends alike in that is looked
  for from both; each round of the steps that set a drawing right -
  turning bonds the other way round (`improve`), turning a part about
  its join (`rejoin`), turning or stretching a branch out of the way
  (`untangle`), turning a sugar to its face, making room for an H,
  settling a fan of methyls - tries every move from the drawing as it
  stands and takes the best, moves as good by their kind, their atoms'
  classes, then the canonical rank.
- **By the canonical rank, last.** Only between atoms or rings the
  structure leaves alike - the drawings either way the same, or mirror
  images.

The benchmark's measure reads a drawing the same way however its atoms
are listed: in a bridged system it reads every ring as small as one of
its smallest set, not the set alone - quinuclidine has three
six-membered cycles, and which two make the set goes by the order of the
atoms. Its rings' shapes too: in such a system drawn flat they are read
as the smallest set that fits the drawing best (shortest first, then the
most regular, each kept where no sum of those kept gives it), not as the
set the atoms' order gives. So too does Clean-up read whether a ring
system is a cage, and which part of it is its cage: from every smallest
set of its rings, not the one it was given. It is a cage only where each
set reads it as one (paeoniflorin's six-membered ring is one of three,
and in one set all its rings are bridged, in the others not), and its
cage is the atoms every set has in it (ibogaine's isoquinuclidine: its
seven-membered ring shares three atoms with one of the cage's three
six-membered cycles, and is fused on a side of the other two). And so it
chooses which set a bridged system is drawn from: laid flat, which rings
come out regular and which arc round a bridge goes by the set it is laid
out from, so it is laid flat from each set in turn and drawn from the
one whose drawing reads best - by a measure that reads every set's
rings, not the one it came from - the canonical rank deciding only
between drawings as good. Ibogaine's isoquinuclidine laid from one pair
of its three six-membered cycles crowds its bonds out (18.98 by
`flatCost`, with their room); from either other pair, 2.45 and 2.50 -
still a bond crossing another by its N, so that its cage in perspective
is drawn instead, as the whole drawing reads better. At most eight sets
are tried, those whose rings are bridged across one another least where
a system has more. A cage is not: it is drawn from its solid, which
reads the same from every set.

## What a good drawing is

A structure drawing is read, not looked at. A chemist should take in its
skeleton and its stereochemistry at once, and read it the way everything
else on the page is read: left to right. Four aims follow, in order of
priority - a later one never buys itself at the cost of an earlier one:

1. **Nothing hidden.** No atom on another - nor, in a complex, inside a
   small ring not its own (a Cl inside a cyclohexyl) - no bond through an
   atom or across another bond, no label crowding a label - an OH's H as much as
   its O, with a space between labels side by side - and no bond between
   two labels covered by their letters (a Pd and an NH a bond apart at a
   slant, the d reaching along it to the N).
2. **Every part in its standard shape.** One bond length; rings as regular
   polygons; chains as zigzags; the bonds round an atom evenly spread.
3. **Square to the page.** Bonds on a lattice, as far as the skeleton
   allows.
4. **Read in order.** The drawing runs left to right along its main axis,
   and the parts one looks for are where one looks for them.

## 1. The lattice

Text runs horizontally, so a chain - the part of a structure that is read
along - runs horizontally too, as a zigzag of bonds at +30 and -30 degrees.
Every bond at an ideal angle to those lies at 30 + 60k degrees, so that is
the lattice: bonds at 30, 90, 150, 210, 270 and 330 degrees. A six-membered
ring on it has two sides upright, and a ring substituent leaves it along
the lattice too. Everything below keeps to this one lattice.

Rings that cannot lie on it - five-membered rings, rings of seven and more
- are set so that they are symmetric about a lattice direction: fused to a
six-membered ring along its shared side, or with their apex along the bond
they hang from.

## 2. Shape

- **Bonds**: one length throughout. A bond is stretched only as the last
  way out of a clash (section 5).
- **Rings of three to eight**: regular polygons; a four-membered ring a
  square with its sides level and upright (a beta-lactam, an oxetane).
  An eight-membered ring is the one of these that can hold a trans double
  bond, which a regular octagon would draw cis: one end of that bond is
  dented in, across the line between its neighbours, so the ring atoms
  either side of it fall on opposite sides ((E)-cyclooctene). The end
  dented is one in no other ring, with the less hanging from it, and never
  beside another dent.
  Rings fused to each other share a side exactly; a ring fused on two
  sides or more at once (as in pyrene) takes the positions its neighbours
  already fix. Where those cannot make it regular - a five-membered ring
  hemmed in by others, morphine's furan, acenaphthene's - its shape comes
  before its bond lengths: the rest of it goes where the regular polygon
  best fitted to what is fixed puts it, a little larger than the others
  if it must be. A ring system whose rings still come out bent (strychnine)
  is eased toward rings of their own shape, its bonds giving first. Two
  rings fused on neighbouring sides of a third meet at the atom the three
  share, closer than their own angles leave room for - saxitoxin's two
  five-membered rings beside its six: each is drawn whole, on its own side,
  and the gap between them opened by the same easing, never one of them
  squeezed flat against the other's side. So is a gap that leaves what
  hangs from its two sides no room: two atoms each with a bond out of the
  system, beside one atom they share, under 0.8 of a bond apart - three
  five-membered rings round one atom leave 36 degrees, 0.62 of a bond,
  between two of its neighbours (bilobalide's C4 and C9, whose groups
  crossed each other's). Eased, they are 0.85 apart.
- **Macrocycles** (nine and more): a chain closed on itself, drawn as one:
  two zigzags, one above the other, joined at their ends, every angle 120
  or 240 degrees - never round. At every corner a substituent takes the
  wider, 240-degree side, as on any zigzag: outside the ring where the
  corner points out, inside it where the corner points in, which is why a
  macrolide is drawn with groups inside its ring. The atoms carrying the
  larger groups take the corners pointing out, and the shape is chosen,
  among the few that lie well, for the room it leaves inside. How large a
  group is can be weighed two ways - by the group, a methyl as much as a
  short chain and a little more for each atom on, or by the atom, a chain
  by its length - and where the two set the ring's atoms on a shape
  otherwise, each is grown and the drawing that reads best kept:
  tacrolimus's allyl, weighed by the group, went in for its C=O and a
  methyl, and ran across the ring's inside by its methyl's hashes. A ring fused
  on its side sits where the shape turns (both ends of that side corners
  pointing out), a ring it runs through at three atoms stands outside a
  corner pointing in, and every double bond in it keeps its cis or trans:
  a cis one at a corner, a trans one along a zigzag. Where none of the
  shapes offered has corners and zigzags at the places two of them need
  (a cyclohexadecadiene's, a bond apart), the shapes of the size that lie
  less well are looked through, best first and each once, those with a
  dent or two among them (two turns inward together, for rings of up to
  24), and the best few that keep them all are offered instead; for an
  odd ring, the rings one larger, each drawn together where that eases
  best of the places that keep them. A macrolide has its lactone at the
  lower left, the ring numbered from its carbonyl carbon
  counterclockwise - C2 to its right along the bottom,
  the ring O last, above it - as erythromycin and epothilone are drawn: of
  the ways of fitting the ring to its shape that put the heavy groups
  outside, the one that does so. A ring of up to fifteen, seven bonds a
  side at most, is as tall as it is wide whatever its shape, and lies as
  that puts it. One that runs through a block of rings fused to each
  other - rifampicin's ansa chain through its naphthofuranone - starts
  from the block, drawn regular, and is a chain drawn round from it, as an
  ansa bridge is: each of its double bonds cis or trans as given - those
  at its two ends too, read by the block's atoms it is bonded to, and kept
  so when the chain is eased to close - and round the side that shuts in
  the smaller of the groups on the block (its OHs, not its hydrazone and
  piperazine).
- **Rings of rings**: a macrocycle that is rings strung together and
  nothing else - a porphyrin's pyrroles, a cyclodextrin's glucoses, each
  linked to the next by an atom or two - is set round a circle, each ring
  it runs through regular and outside it, the macrocycle running along the
  side of each that carries fewer groups where two are as long (the
  groups on that side face into the circle: a cyclodextrin's CH2OHs
  inside, its secondary OHs out). One with chains between its
  rings (vancomycin's peptide) is a chain like any other macrocycle:
  where several run through the same ring, that ring is drawn first and
  each macrocycle is a zigzag from ring to ring, turning as a hexagon
  does where it runs through one, so that the ring comes out regular,
  and kept clear of where the rest of that ring will fall, and of the
  two atoms it runs between. The search sets a run's first bond where it
  likes and closes onto its far end where it must, the angles giving
  there; so it starts from the end whose atom has more bonds of its own
  still to place, which need the room the closing would take
  (rifampicin's ansa chain from its ketal carbon, which carries a methyl,
  closing onto the naphthalene carbon of its amide). Ends alike in that
  are each searched from, the better kept. Any macrocycle passing a ring by two ways round as long runs
  along the outer side, whose atoms are in fewer of the system's other
  rings: rifampicin's ansa chain along its naphthalene's free edge, not
  across the junction into the next ring.
- **Bridged systems**: where a ring is fused on a side as well - morphine,
  artemisinin, taxol - the system is drawn flat: the smaller ring of a
  bridged pair regular, the larger arcing round it with the bridge inside
  (taxol's A ring, its B ring round the gem-dimethyl bridge). Where that
  crowds the bridge or stretches its bonds, the fused rings are drawn flat
  and regular as though the bridge were not there, and the bridge is a
  path of bonds across the face of a ring, in front of it or behind it as
  the molecule has it, the bond behind broken where they cross -
  artemisinin's peroxide inside its seven-membered ring. The rings drawn
  flat are looked for among every simple cycle of the system as long as
  its longest ring, not the smallest set's alone, which holds one of
  rings as long by the order of the atoms. Which side is the
  one that shows its stereocentres as given, where the bridge's bonds into
  the flat rings show them: a solid found from how far apart the bonds put
  the atoms can have a ring fusion the wrong way, and morphine's 5-epimer
  had its bridge behind the ring while the wedge it starts with stood in
  front. A double bond on the bridge is drawn cis, its neighbours along
  the bridge on one side of it, as the ring it closes has it (huperzine
  A's C=C, drawn as a zigzag, read trans). The centres on the bridge
  itself show theirs by their wedges: in
  front or behind is a layer, not a place in space. A bridge as long
  as the path it spans is that path set off by a bond, the ring the two
  make the chair or boat it is (a morphinan's piperidine under its B
  ring). A bridge is never closed round an atom of the flat rings with a
  group of its own: huperzine A's three-atom bridge laid round its
  ethylidene carbon left the ethylidene on the bridge; laid across the
  face of the ring, it leaves it room.
- **A macrocycle bridged across a small ring** - a tetrahydropyran bridged
  2,5 by a long chain, a paracyclophane: the small ring regular, the
  macrocycle round it taking the strain (GR-3.3.4). Where its shape, placed
  as it is, crowds or stretches it, it is laid out again from each of its
  rings in turn, each eased, and the one that reads best kept, so long as
  it keeps the macrocycle's double bonds as given. Placed as it was, a
  2,5-bridged tetrahydropyran's chain lay on the ring's O, its bond over
  C2-O, and the wedge went onto that hidden bond (2026-10-29).
- **Cages**: a system whose rings are all bridged, each sharing three atoms
  or more with another (norbornane, camphor, tropane, quinuclidine,
  adamantane), or a polyhedron (cubane), is drawn in perspective, as the
  solid it is, upright and seen from above - the higher on the page, the
  further back; a drawing that needs it the other way round has the cage
  seen from its other side, never turned over or mirrored. The solid is
  found from the bonds (`cage.ts`): each atom's bonds at the angle its
  bonding gives - tetrahedral, 120 degrees with a double bond or beside
  one with a lone pair to share, straight through a triple bond, a small
  ring's own - a double bond's atoms and those bonded to them in one
  plane, the atoms either side of a bond between tetrahedral atoms
  staggered, every stereocentre held the way round it is given, eased
  from several placements and the one that keeps its distances best
  taken. Its conformation is read from it (`conformation.ts`): each ring
  flat (a double bond in it), a chair, a boat or puckered. It is built on
  one of its six-membered rings the solid has as a chair or a boat - never
  one with a double bond in it -
  drawn as a chair or a boat always is: two zigzags of three atoms, their
  bonds 15 degrees off level, the back one above the front one and joined
  to it by two bonds 60 degrees steep - a chair's zigzags pointing opposite
  ways, a boat's the same way. Every bond is one length and opposite bonds
  are parallel. The ring's axial bonds (a boat's flagpoles) are upright, always, a
  bridge between two of them hanging from them however it must;
  an atom bridging two of its atoms (norbornane's C7) stands straight
  above the front one, a bond's length from the back one; the rest is
  eased into place - its bonds toward one length, each atom held near
  where the solid seen from that side puts it, every bond pulled at once
  and each atom moved by the mean of its pulls, so that no bond is eased
  before another (bond by bond, the order decided the drawing:
  paeoniflorin's boat came out costing 7.68 in one order and 8.04 in
  another, over the 8 a textbook view may cost, and was then drawn from
  below by projection) - and eased again with
  atoms not bonded to each other kept 0.7 of a bond apart. That is taken
  only where it leaves fewer pairs of atoms nearer than 0.6 of a bond and
  reads better by the measure a flat drawing and a solid are weighed by
  (`viewCost` at its defaults, with no depth): where the solid seen so
  puts one atom on another (scopolamine's epoxide by its N), not where a
  near pair is the drawing's own (adamantane's back CH2 by a front
  bridgehead; bicyclo[2.2.2]octane's back bridge by its back bridgehead,
  which eased apart only comes a little less near, its bonds uneven). A
  stereocentre the easing turns - a bridgehead whose three bonds lie
  nearly in the page can tip through - goes back where it was put (one
  stood upright on the ring, upright still), and the others are looked at
  again. A view that eases a double bond in a ring of seven
  atoms or fewer trans, its neighbours round the ring either side of it,
  counts that as heavily as a bridge drawn so: tetrodotoxin's guanidine
  ring, seen nearly edge on, came out with its C=N a zigzag. Adamantane is then a chair with its three axial bonds
  rising to the fourth bridgehead; bicyclo[2.2.2]octane a boat with its
  third bridge rising from both bridgeheads. A bond passing behind another
  is drawn broken there - a group's bond too: the first atom of a group off
  the solid is as near as the atom of the solid it leaves (the mean of
  theirs, where it leaves more than one), so a bond out of the front of
  the cage that crosses one at its back is drawn whole, the one behind
  broken (aconitine's N-ethyl). Bonds out of the ring follow it - an equatorial
  bond parallel to the ring bonds but one, an axial one upright - and what
  hangs from the cage hangs from its front where it can. A
  bicyclo[3.3.1] cage - two six-membered rings sharing three atoms, 9-BBN,
  bispidine - is drawn as 9-BBN always is, its two chairs stood on end
  back to back: the one-atom bridge on top, what it carries straight up
  from it (9-BBN's B-H, a ketone's O); the bridgeheads under it, the front
  one the lower; each three-atom bridge a chair's lower half to one side,
  its middle atom the foot. Seen from above it would have that bridge
  between the rings, hemmed in. Only where the solid has both rings as
  chairs: a ring with a double bond in it is flat, and its atom would
  otherwise carry an axial bond (huperzine A). A cage the same from
  several sides (quinine's quinuclidine) is tried from its best few
  textbook views with what hangs from it, the best kept - another view
  only where it reads clearly better (by 3), so that camphor stays as it
  is always drawn. A template view also costs for how far its drawing
  lies off level - a twentieth for each degree its long axis is tilted,
  scaled by how much longer than broad it is, up to 4.5, so more than that
  margin can turn on it - and a long system lies left to right
  (tetrodotoxin, its guanidine ring beside the cage, not under it). A six-membered ring the solid has as a chair or a
  boat, with no double bond in it, fused on a bond to a ring drawn by the
  template - or to the rest of the cage, its other four atoms in no other
  ring - is drawn by the template too, as decalin's second chair beside
  its first: the template laid on the bond they share, turned, mirrored
  and started where its other atoms fall nearest where the solid puts
  them, so that the fusion comes out trans or cis as it is. The same goes
  for such a ring fused onto a cage drawn alone in perspective, the rest
  of the system flat onto it - taken unless it reads clearly worse than
  the ring laid flat, and only from a view the flat ring reads as given
  from too. A bond axial to any chair or boat of the solid is drawn along
  that ring's upright as laid - straight up or down where the ring stands
  as the template does - up or down as the solid has it.
- **A system that will not lie flat** (2026-10-11, from natural products
  outside the benchmark): where every flat drawing of it has a fault - an
  atom on another or on a bond, a bond crossing one not behind it, or an
  atom with a bond out of the system left no room for it, its way out of
  its rings landing on another atom or bond (huperzine A's one-atom
  bridge, laid across a ring's face, its ethylidene on that ring) - it is
  drawn as the solid it is, as a cage is, if it has twenty atoms or fewer:
  its atoms set in space by how far apart its bonds put them, and seen
  from the side that reads best (paeoniflorin's cage, rings fused round a
  middle they close off). Where it has a cage in it with rings fused to the
  cage on a side - ibogaine's isoquinuclidine, joined to its indole by a
  seven-membered ring; gelsemine's, its oxindole spiro to it; tetrodotoxin's,
  its guanidine ring fused to it - the cage is drawn so and the rings
  fused to it flat onto it, the cage's atoms bonded to them showing their
  configuration by a wedge; the cage seen from each of its best few sides,
  the one that leaves the rest room taken (ibogaine). Where several of its
  sides are as good by the system alone - adamantane is alike from all of
  them, seen from either hand - each of those is tried with what hangs from
  it too, none favoured: which came first went by the order of the atoms,
  and a gem-dimethyl on a ring fused to adamantane had room from some of
  them only. And each other side within 3 of the best by the system alone
  is tried with what hangs from it as well, taken only where that reads
  better by the 3, as a cage's next textbook views are: the system alone
  sees none of the H's and labels round it, and ibogaine's isoquinuclidine
  from its best side by itself put the H at its junction against the
  indole's NH, where another side leaves both clear. Of these and the flat
  drawing, the one with the fewest faults, where that is clearly fewer
  than flat; the cage alone before the whole, unless the whole reads far
  better. Then the whole drawing decides, measured as it will be drawn -
  its substituents and labels, its wedges and the H's they stand on
  counted: a solid is kept only where the drawing reads at least as well
  as with the system flat (ginkgolide B's OHs crowded in its solid), and a
  flat drawing with a fault a reader cannot miss - an atom on another,
  bonds crossing - is drawn as the solid too, and that kept where it reads
  better (aconitine). A clean flat drawing is not given up for a solid the
  measure merely prefers. Where the cage alone was drawn in perspective
  with the rest flat onto it, or the system flat, the whole drawn as one
  solid is tried too, and kept where the whole drawing reads better - not
  where a ring fused onto the cage is drawn as the chair the solid has it
  as: scopolamine's epoxide flat onto its tropane crowded the ester hung
  from it, its whole solid did not. So too where the system was drawn
  flat because its cage in perspective, the rest flat onto it, did not
  read as given: the whole solid is another drawing, read back on its own
  (aconitine's second cage laid flat onto its first turned a junction;
  its whole solid did not). The rings laid flat onto a
  cage take their depth from the cage's atoms they are fused to, each
  round of atoms one bond further out from the round before, so that the
  order of the atoms never decides it. A ring with a double bond in it
  is drawn flat: where the cage alone can be drawn in perspective with
  such rings flat onto it, the whole is not drawn as a solid (gelsemine's
  oxindole, its benzene ring otherwise foreshortened). A solid is taken
  only with every stereocentre in it as given: a ring fusion is cis or
  trans with the same bonds between the same atoms, so a solid found from
  how far apart the bonds put its atoms may have one the wrong way. Such a
  centre is turned - put through the plane of three of its neighbours, its
  bonds keeping their lengths - and the solid eased again with every
  centre held the way it is given (tetrodotoxin's C4a, where its guanidine
  ring joins its cage). That goes for a cage with rings fused flat onto
  it too, read as it is drawn, those rings with it: laid beside the bond
  it shares with the cage, a ring stands on one face of the cage there or
  the other, and only one is the molecule. Scopolamine's epoxide, laid
  towards its three-carbon bridge and not its N, drew another isomer - the
  wedges right for a reader that reads them flat, the perspective showing
  the epoxide on the other face. The cage seen from its other side, for a
  mirrored frame, is kept only so too.
- **What a solid shows by its shape.** A stereocentre of a solid drawn in
  perspective shows its configuration by the drawing, and carries no
  wedge, wherever the drawing read with its depth, as Meno reads one
  (`drawn.ts`), says it as given: each bond out of it going the way it
  goes, up or down for a reader to see - in a six-membered ring drawn as a
  chair or a boat, in a ring bridged across another (ibogaine's
  isoquinuclidine, gelsemine's cage), or anywhere else the solid's depth
  says it. Only where it reads so for sure - each of its bonds out of the
  solid turned 15 degrees either way, it still reads as given; one drawn
  between the two corners the solid leaves free says nothing. A wedge at
  such a centre, read flat, can say otherwise than the drawing:
  tetrodotoxin's C4, in the ring with the C=N, is the drawing's nearest
  atom, its OH and its H both toward the viewer, and a wedge on the OH
  said the H went back (the maintainer, 2026-10-17, as R/S is read from
  the perspective; before, from 2026-10-12, every centre neither in a
  chair or boat nor bridged carried a wedge). Any other centre of a solid
  carries a wedge or hashes on a bond out of it, or an H drawn upright, as
  a flat ring's centre does. A file holds no depth: a MOL or SD file, or
  anything else that reads only wedges, is given a wedge for each centre
  the drawing shows by its depth, the drawing left as it is
  (`wedgesForFlat`; tetrodotoxin's C4 written with a wedge on its OH).
- **When a flat drawing gives way.** A flat drawing whose only faults are
  bonds a little uneven and a bond or two passing behind another where a
  bridge crosses a ring is no drawing with a fault: morphine and
  strychnine stay flat with their bridges across, as they are drawn
  everywhere. And a solid is seen from where a bond out of it, ending at a
  label, keeps a label's breadth from another label of the solid
  (tetrodotoxin's OH on C9 by its bridging O).
- **Chains**: zigzag, each turn the other way from the last. A trans double
  bond carries the zigzag on; a cis one is a step in it - the chain read as
  the straight chain it would be without it, taking up again, two bonds
  past it, the line it ran along before (a fatty acid, a lipid's acyl
  chains, lying level and side by side). A triple bond, or two double bonds on
  one atom, runs straight.
- **At an atom in no ring**: its bonds evenly spread - three at 120 degrees,
  four at 90. A tert-butyl is drawn as it always is: its three methyls
  fanned 60 degrees apart about the line of the bond into it, 120 from
  that bond - and so is any such trident, a carbon, silicon or nitrogen
  with three like ends and a fourth bond: a trimethylsilyl, a
  trimethylammonium (choline's), a CF3, a CCl3. Neopentane's middle
  carbon, four methyls, stays a cross, as CF4 does. The fan is compact,
  and once the rest of the drawing is set it is turned about its bond,
  five degrees at a time, to where the drawing reads best, its bonds kept
  clear of the whole letter of an H beside it (ginkgolide B's OH).
- **A phosphate, a sulfonyl**: a phosphorus or sulfur with four bonds is a
  cross square to the page, the chain straight through it and a
  double-bonded O above it, as IUPAC puts double-bonded substituents on a
  chain. The O between two crosses runs straight on, so that ATP's
  triphosphate is one line; the bond joining a cross to a zigzag gives way,
  to 150 degrees.
- **At a ring atom**: one bond out goes straight out, along the bisector;
  two (a gem-dimethyl) go close together, 60 degrees apart about it; more
  split the room evenly. A substituent never takes the 120-degree side of
  a zigzag's corner; only a small ring's own angles excuse it. Beside a
  narrow gap between rings - three five-membered rings round one atom
  leave 36 degrees between two of its neighbours - each of the two leans
  its bonds out of the gap, up to 40 degrees and keeping 35 from its own
  ring bonds, rather than pointing them across it at the other's
  (bilobalide's C4 and C9, even with the gap eased: pointed at each other,
  C4's OH was turned into its ring, and its four bonds left in half the
  page). Not in a bridged system laid flat, whose narrow gaps are where a
  bridge was pressed into the page.
- **Parts joined**: where two parts each with rings of their own meet at a
  single bond - a sugar on its glycosidic oxygen, taxol's side chain on
  its ester - each is drawn well on its own and then joined, the angle at
  the join giving way to them. So too a long chain hung from a branch (a
  lipid's acyl chains on its glycerol): drawn straight, then joined. A
  sugar's ring may also be turned right round on its own atom at the join,
  or seen from its other face, to face the way a sugar is drawn; any other
  ring keeps its bond in along its own line but for that give.

## 3. Square to the page

The ring system the molecule is built round - the one nearest all the
rest of it, the largest of those - is the frame, and it is set square on
the lattice. A ring hung off it that cannot be square as well is left askew
rather than the frame tilted to meet it halfway. A frame whose own rings
cannot all be square together (fluorene's two benzene rings either side of
a five-membered one) is set with its long axis level.

Among the ways of setting the frame square - six turns, and their mirror
images; twelve for a frame of squares and no hexagons, whose sides can
lie level either way round, and for a frame of five- and seven-membered
rings, which lies on the lattice no way round and is set on it only by
its bonds out (proline's carboxyl level, its ring symmetric about it) -
the drawing takes the one that reads best (section 4).

A molecule with no ring that can lie square is then turned the little way
that brings its bonds out nearest the lattice. One drawn as its own mirror
image is square by that mirror instead: N-bromosuccinimide is set with its
N-Br upright and its two C=O alike either side. It is never tilted to bring
one C=O onto the lattice at the other's cost.

## 4. Reading order

- **The long axis level.** A drawing is wider than it is tall, and its
  chains run level.
- **Fused rings as IUPAC orients them for numbering**: as many rings as
  possible in a horizontal row, then as many as possible above and to the
  right of it. Phenanthrene's third ring goes up and to the right; a
  steroid's A and B rings form the row, with C and D above and to the right
  - the way steroids are always drawn.
- **A fusion H upright.** A stereocentre where rings of five to eight are
  fused (not bridged, not on a macrocycle) gets its H drawn last (section
  6), but the way the molecule is turned is chosen counting it where it
  will go: a turn that leaves it no room to stand upright is the worse for
  it. So lovastatin's hexahydronaphthalene lies in a row with its 8a-H
  straight up, as it is always drawn, rather than aslant with the H
  squeezed beside its ester.
- **A biaryl hung anti**: a ring system hung from a ring's atom by a
  bond, where both have something beside the bond, is hung the way round
  that puts the heavier of each on opposite sides - BINOL's two OH, BINAP's
  two PPh2: grown the other way, BINAP's phenyls fell on its other
  naphthalene. No step that sets the drawing right afterwards turns them
  syn. Where two things beside the bond on one ring are as heavy, neither
  side is the heavier, and the rule does not apply.
- **A benzene ring at the left of its ring system**, where reading
  begins: indole, quinoline and coumarin with their benzene rings on the
  left, estradiol's aromatic A ring, griseofulvin's, reserpine's indole at
  the upper left of the rings that follow it. The heteroatoms of a ring
  fused to it go below: quinoline's N, indole's NH, coumarin's O at the
  bottom, and so morphine's ether O and strychnine's indoline N, as IUPAC
  draws morphinan and strychnidine. Which way up a ring system is comes
  before how the rest of its rings lie. It is counted by the ring, not by
  its atoms: a methylenedioxy's two O are one ring the wrong way up, and
  berberine's N, in two rings fused to benzene rings, goes to the bottom
  before them (the maintainer, 2026-10-11). A benzene ring is six carbons
  each with a double bond in the rings, however its Kekule structure is
  written. A flavonoid is the exception (the
  maintainer, 2026-10-11): the ring O of a chromane or chromene with an
  aryl ring on the atom next to it, or the one after - a flavone's, a
  flavanone's, a catechin's, an isoflavone's - stands at the top, its B
  ring to the right, as they are always drawn.
- **Seen from the face its angular groups are on.** A ring system has two
  faces, and a drawing from one is the mirror image of a drawing from the
  other, every wedge a hash. It is drawn from the face its angular groups
  are on - the one bond out of the rings at an atom with three ring bonds:
  a steroid's methyls, a terpenoid's, taxol's, artemisinin's - so that
  they stand in front of the page on wedges, as a steroid's do: the way
  IUPAC orients a steroid makes its beta face the one in front, and
  natural steroids and terpenoids have their angular methyls beta. (A cage
  shows the face its own drawing gives it, section 2; a macrocycle lies as
  its own conventions have it.)
- **A ring system to the left of the chains that leave it.** The ring
  system is what the molecule is; its chains are read after it.
- **The first carbon of a chain on the right.** The carbon a chain is
  numbered from - the carboxyl of an acid or an ester, a sugar's anomeric
  carbon - is at the right-hand end. Most conventions follow from this one:
  - acids, and fatty acids, with the COOH on the right, and an acyl chain in
    a lipid with its carbonyl on the right and its tail to the left; an
    acid's C=O points up - at the end of a chain or on an aromatic ring,
    in its plane; one on a saturated ring goes where the ring's stereo
    puts it (penicillin's points down);
  - peptides from N-terminus to C-terminus, left to right, as their
    sequences are written, the backbone carrying straight on through each
    alpha carbon and the side chains branching off; an amino acid then
    comes out with its side chain on the left, the COOH on the right (C=O
    up) and the NH2 below;
  - sugars (below).
- **Rings hung on a macrocycle** - the sugars of a macrolide - to its right
  and below it: the aglycone at the upper left, read first.
- **A chain folded back on itself** - a fatty acid drawn as a hairpin, a
  prostaglandin's two chains from its ring, both running off to the right
  - has its carboxyl end above its tail: read from the carboxyl first, as
  arachidonic acid is drawn and as IUPAC sets prostane, the ring on the
  left, the chain with the acid above the other.

### Sugars and nucleosides

A flat drawing of a sugar is the Haworth projection seen from above: the
ring oxygen at the back becomes the top, the anomeric carbon (C1) is on the
right, and a group above the ring is a wedge, one below it a hash. Set on
the lattice, a pyranose has its ring oxygen at the top vertex, C1 upper
right and C5, with C6, upper left; a furanose has its oxygen at the apex.
The anomeric carbon is always on the right, and the ring's carbons are
numbered on from it clockwise: a ring is drawn from the face that has them
so. Glycosidic bonds then run from left to right, from C1
of one ring to the next (a sugar hung on a macrolide faces its aglycone
instead, its anomeric carbon toward it, whichever side that is - still
seen from the face its carbons number clockwise from, its ring oxygen
where that puts it: turned over on its link, and swung clear, once the
aglycone is set, which it leaves as it is); where two anomeric carbons are linked (sucrose),
the aldose keeps its C1 on the right and the ketose gives way. In a nucleoside the base, on C1', is on the right, and the chain from
C5' - the phosphates of ATP - runs off to the left.

## 5. Room

When parts clash, in this order:

1. **Choose among equal placements**: which side of a chain a branch goes,
   which way a zigzag turns, which way round a ring system is hung, which
   of a ring atom's two groups goes which way - each is free, and the one
   without the clash is taken (erythromycin's tertiary OH up, out of its
   sugar's way, its methyl across). A branch turned over
   is tried with what hangs on it turned back as well: tryptophan's side
   chain turned down, its NH2 below, its carboxyl's C=O still up.
2. **Turn** a substituent off its ideal angle, as little as will do.
3. **Stretch** a bond, only if the clash is still there, and by at most
   0.6 of a bond in all.

None of these ends with bonds crossing that did not cross before, however
much else a crossing would clear.

And last, room for the H of every label: the drawing writes it beside the
symbol on the side the bonds leave free (OH, or HO where they leave to the
right; under or over the symbol only between bonds on both sides, as in a
chain's NH, and only where that line is clearer of the bonds than the row
beside the symbol, by more than a band of 10 degrees - two bonds nearly
in a line, steep, leave the row open and the line above or below on a
bond, as tetrodotoxin's guanidine NH; nearer even, it stays stacked. On
the row so, it goes on the row's clearer side - a borate's BH- with a
bond straight right is written HB- - and, the two sides alike, after the
symbol: NH. lib/layout/names `rowClearer`, `clearRowSide`, which the
drawing and the engine share). Written before its symbol with a count -
H2N - the count comes between the two, and the H stands a count's width
further out (`hydrogenWritten`): taken as beside the N, cephalosporin C's
H2N ran into the O of the C=O a bond to its left unseen. Beside another
label's symbol, on its row, an H wants a word's space: 0.8 of a bond
between the H and that symbol's middle, or OH N reads as one word
(tacrolimus's hemiketal OH, 0.69 short of its piperidine's N). Where it - or
its count, NH2's 2 after it and set lower - would run into another label, an atom or a bond, the
bond to the atom is turned a little or drawn a little longer or shorter -
an OH, an SH - or the same is done to what it runs into, a C=O's O or a
small branch (taxol's benzoate, clear of its C1 OH). The H is never moved
under the symbol to make room, and no move that crosses bonds is taken.
Nothing else is moved for it: the drawing is set first, its H's last.
A label lying on a bare vertex it is not bonded to - nearer than 0.6 of a
bond, its letter running into the bonds that meet there - is given room
the same way and at the same time (`labelsOnVertices`): vancomycin's acid
C=O had its O on the corner of the benzene ring beside it, and forskolin's
9-OH sat on its ketone's carbon. A label already on one of the bonds
that meet there is a clash, and is not counted on the vertex as well:
one piece of ink, one fault. It is counted only then, not while the
parts are set, nor in turning a sugar to its face (a macrolide's sugar
turned over for it crowded an OH on an OH); on the sheet, as half a
crowding. So are two labels whose ink comes near - symbol on symbol, or
H on H, where the drawing puts each, with less than half a bond of paper
between them (`labelsCrowding`): cortisol's two HO's, one straight over
the other a bond apart, read as two lines of text. Besides the small
moves, a branch hung from a chain atom with nothing else on it may be set
on the chain's other side, the other way its zigzag goes: cortisol's
CH2OH, its HO turned off the 17-OH. No move is taken that leaves a
stereocentre of a solid, which the drawing showed for sure, unsure - the
way a group's bond leaves it is what shows it (tetrodotoxin's, none
wedged). And the turn that sets a piece square (`squareUp`) is read from
the drawing before these moves: a label's bond turned to clear another
does not turn the whole.

A name - a label that is not an element's symbol: OTBS, NHBz, PPh3, as
Clean-up writes groups by name - takes the room its letters take
(`src/lib/layout/names.ts`). Its first unit sits on its atom and the rest
follows, read outward from its bond: leftward from a bond coming in from
the right (TBSO, IUPAC GR-2.3.3, GR-2.1.6), rightward otherwise - and from its bonds
where it has several, as a ring's atom has: leftward where they come in
from the right all together, none leaving to the left (an NFmoc at a
ring's lower left reads FmocN, away from the ring); a name of one unit
(TMS, Ph) so is set before such a bond, its last letter on the atom. On a bond within 35
degrees of upright it may be read either way, and is read the way with
more room - a chemist writes taxol's C4 acetate OAc or AcO under the ring
as there is space - the usual way where both have as much; the drawing
reads it as the layout reckoned it. Its letters running into an atom, a
bond, another name or a label's H (OH's H is in BzO's way as much as its
O) count as labels crowding: lightly while the parts are set, so that the
way a molecule is turned comes first, and in full last, when room is made
for them as for an H, by the same small moves (wider turns of a name's own
bond). Two names one over the other keep a line's space between them, a
quarter of a bond: with less, taxol's AcO sat on its OBz.

- Two labels share a bond's length: together they may take nine tenths of
  it (`labelShareMax`), each giving up its share past that - and, drawn,
  never more than two thirds, whatever the labels: a third of a bond is
  always seen, its end touching a label's letters or digits (13C's) where
  it must, and a wedge shows its width (`BOND_SEEN_LEAST`; the maintainer,
  2026-10-14). Where one of
  them is at a terminal atom (Mg-Br, O-3H), Clean-up draws that bond just
  long enough for the two to keep their margins, in the drawing's style -
  measured as the drawing measures it (`lib/chem/layout2d.ts` `labelTrims`,
  `Workspace/chem/engineLayout.ts` `roomForLabels`). The engine knows
  nothing of a style's letters; a bond drawn by hand keeps its length.

## 6. Stereochemistry that reads

- Wedges and hashes on bonds out of rings, never on ring bonds, their
  narrow end at the stereocentre: an end atom first, then a chain - but
  never a run of wedges sharing atoms, nor a wedge on the bond between two
  stereocentres: there the main chain stays plain and the centre's H is
  drawn to carry the stereo.
- A stereocentre at a ring fusion with no bond out of the rings gets an
  explicit H, drawn straight up on a wedge or straight down on hashes, as
  a steroid's are - so the page shows the sense as well as the wedge.
  Where that spot is taken - the middle of morphine or strychnine, hemmed
  in by rings - the H goes wherever round its atom there is most room,
  clear of atoms, bonds and names' letters and crossing none (taxol's C3
  H once stood on the A of its C4 AcO, which reaches a bond's length from
  its atom); its wedge says the same
  whichever way it points. Its room from a label is taken half by the
  distance between the two and half by the paper between their letters'
  ink, as two labels' ink is measured: an H a bond off an O diagonally
  sits on the corner of its letter, which the distance alone took as room
  enough (ivermectin's H over its OH, vancomycin's and tacrolimus's). It goes into one of its own rings only as a
  steroid's does: straight up or down, into a ring with no double bond of
  its own (one no other ring shares, whose second line is drawn inside
  it). Aslant into a ring, or into lovastatin's ring with its double bond,
  it reads as pointing into the ring; it goes outside where there is room.
  An H with three rings or more round its atom keeps to the most room.
- Centres with fewest bonds out of the rings are shown first, so they get
  theirs. Of centres alike in that, the one that costs the others near it
  least, shown before them, goes first - each way weighed as it stands: a
  wedge that reads only as the bonds fall, a wedge on a ring bond, an H
  left little room or laid off upright at a fusion. Where two fusion Hs
  want one spot, the one that takes it upright can leave the other its
  ring bond, where the other way round both would lean 30 degrees. The
  canonical rank decides only between centres that cost the same either
  way.
- A ring atom's two groups - erythromycin's OH and methyl on one carbon -
  each show which face they are on: the one in front on a wedge, the other
  behind on hashes.
- Double bonds are drawn as they are: a cis double bond with its
  substituents on one side.
- A wedge says what a reader reads it as - and RDKit, which is how that is
  checked. With all four bonds of a centre drawn, that is the way they run
  round it and which stand out of the page, not the angles between them:
  where three bonds in the page lie within 180 degrees of each other (a
  bridgehead often has them so), read from the angles two of them and the
  wedge would say one thing and the other two the opposite
  (`drawnVolume`). With three drawn and the H left out, the angles are read.
- An axis of chirality - a biaryl's bond, BINAP's C1-C1' - is shown by
  one wedge out of an end of it, narrow there, on the single bond to the
  neighbour that stands out of the page for the sense the axis has (or on
  hashes, behind it), both rings drawn flat: the only wedge that goes on a
  ring bond, as it must (`axisWedge`). Read back, a wedge narrow at an atom
  with three groups at the end of a single bond in no ring (a ring through
  a metal aside) is such an axis's (`readStereo`) - but for an S, Se, Te,
  P, As or Sb, its fourth group a lone pair (a sulfoxide's S, a
  phosphine's P): that is a stereocentre.
- A stereocentre whose fourth group is a lone pair - a sulfoxide's or a
  sulfonium's S, a phosphine's P, an arsine's As - is drawn as one with its
  H left out: one wedge, the lone pair the fourth, undrawn group, and read
  back from it so (`readStereo`). A selenoxide's Se, a telluride's Te or a
  stibine's Sb is not read from its wedge, so Clean-up leaves such a
  drawing as it is (2026-10-29).
- A cage drawn in perspective shows its stereochemistry by the drawing
  itself, with no wedges; what it shows is read back from the solid the
  cage is drawn from, fitted to where its atoms are and how deep, and the
  way each bond out of it points (`drawn.ts`). Drawn the other way, a bond
  turns its centre. So a stereocentre's one bond out of a cage, beside its
  H, is drawn the way the solid has it - never straight out from the
  cage's bonds, which is where neither of its corners is and says nothing.

## 7. Metals

A metal's complex is drawn as chemists draw one: the metal in the middle,
its ligands round it, what is three-dimensional shown in perspective. None
of it is a template - each is a rule, and the drawing is what the rules
make of the molecule (`hapto.ts`, `assemble.ts`).

- **A ring bound face-on to a metal through all its atoms** - η⁵-Cp, Cp*,
  η⁶-benzene, p-cymene - is seen as it is (drawn by hand, as a bond from
  the metal to each of its atoms - ferrocene, bis(benzene)chromium with no
  haptic bond - too: Clean-up gives the engine a star at its centre for
  those bonds, and lays them out as one bond from the metal to that star,
  as the CTfile's multi-centre bond is, the ring's atoms its endpoints -
  ferrocene's ten Fe-C bonds two; the maintainer, 2026-10-13 and
  2026-10-17, `etaBondedAtomByAtom`; so too a chain of three atoms or more
  each bonded to the metal, an allyl, but not two, a three-membered ring
  with the metal being how a metallacyclopropane is drawn as well; an
  η3-allyl, once laid out, posed with its middle carbon away from the
  metal and its delocalisation curve inside it, EDITOR-2D.md *An η3-allyl*): the metal on its axis, a bond
  from its centre, the ring seen from a little above its plane (about 24
  degrees), so that it is drawn as deep as 0.4 of its width - a flattened
  polygon. Its lower half on the page is nearer - whichever side of it the
  metal is, and with no metal at all (a ligand's picture) - each atom as
  near as it is across the ring's axis. What hangs from it lies in its
  plane, pointing out from its centre and foreshortened as the ring is
  (Cp*'s methyls); to clear a clash it is moved out along its bond, never
  turned off that line. The ring may be spun about its axis: where its first
  substituent points - to either side, or away from the metal - is tried
  each way, and the one that reads best kept; a ring with nothing hanging
  from it, seen with a corner nearest, is spun half a step to have an edge
  there instead.
- **Drawn as Haworth drew rings.** A ring in perspective - bound face-on,
  or a phenyl turned on its bond (below) - has a bond with both its atoms
  near drawn bold (the edge in front), a bond running from its far half
  toward the near one drawn as a wedge, broad at the near end, and the
  rest plain. These say nothing of configuration: they are how the bond
  is displayed (`display`: "bold", "wedge"), and on a double bond the bold
  bar or the wedge is the line its second line is drawn beside.
- **Its circle.** Such a ring is drawn with a circle - an ellipse, in
  perspective - for its pi system, not as a diene (Cp is never drawn with
  two double bonds). A charge its carbons carry is the circle's and is not
  drawn, nor is it on the metal: ferrocene, Fe²⁺ and two Cp⁻ as written,
  is drawn neutral, as chemists draw it.
- **Where the rings go.** A metal with two such rings - a sandwich - has
  them opposite each other, upright, one above it and one below; with
  other ligands too (Cp₂ZrCl₂), the rings lean 20 degrees away from them
  and they lie between, to one side. A metal with one ring has it above,
  the rest spread below as a stool's legs. A metal and its rings are laid
  out together, as one system.
- **A ring bound through two C=C of its own** - cod on Ni, Rh, Ir - is the
  tub it is: its two C=C parallel, a little apart, facing the metal, which
  lies beyond their middle; what runs between them on each side arching
  away from the metal. Seen from in front and a little above (the near C=C
  below and to the side of the far one), its near edges bold and the bonds
  toward them wedges, as for a ring face-on; stood with its C=C upright,
  the metal beside them. A second such ring goes to the metal's other
  side; the metal's other ligands opposite a lone one. Both C=C are cis,
  as they are; drawn as one ring with the metal, one came out trans. A
  metal that is in a ring of its own as well - a chelate's, Rh(cod)(acac),
  [Rh(cod)(dppe)]+; or norbornadiene's, whose C=C are not a ring of their
  own - has that ring system laid out flat, as it would be alone, and set
  on the metal where its other ligands go: its atoms bonded to the metal
  side by side, opposite a lone tub. The metal, its tubs and that ring
  system are one system (left out of it, the tub's stars had no place, and
  Clean-up threw).
- **Two metals bridged by two atoms** - [Rh(cod)Cl]2's chlorides,
  [Rh(cod)OMe]2's methoxides; or a transition metal and a main-group one,
  the Tebbe reagent's Ti and Al, the transition metal first - are their
  four-membered ring seen a little
  from above: the metals level, left and right, the bridging atoms above
  and below between them, a metal's bond from each, the lower nearer.
  Each metal's own ligands go outside it, the second's the first's turned
  half round: a tub on each, mirrored; a ring bound face-on above and to
  the outside, a metal's bond off so that the metal's label stays clear of
  it, its other ligands below (the second metal's the other way round, as
  [RuCl2(p-cymene)]2 is drawn). The metals and their rings are one system.
- **Six metals in contact as an octahedron** - Stryker's reagent's Cu6,
  each metal in contact with four others, atoms bridging its edges - are
  the solid they are (`src/lib/layout/cluster.ts`): the octahedron, its
  edges long enough that the metals' labels and those of the atoms
  bridging them stand clear, each bridging atom just outside its edge,
  each metal's other ligands straight out from the middle. It is seen
  from the side that hides least: no label on another or on an edge, the
  ligands clear of it and of each other, no two metals stacked nor an
  edge seen end on, the fewest edges crossing - a face seen straight on,
  or the solid from the side with a threefold axis upright, where that
  does as well. Stryker's reagent, its hydrides on the edges of two
  opposite faces, comes out as its neutron structure is shown: a corner
  up and its opposite down, the four between them two by two, each
  hydride beside the edge it bridges, each PPh3 straight out. Its atoms
  keep their depths, as a cage's do; its metals' contacts are drawn
  dashed, as they are written.
- **Ligands round a metal** with no ring go evenly round it - two in a
  line, four in a cross - and the bulkiest go furthest apart: two bulky
  ligands trans to each other, the small ones (Cl, H, CO) between them. A
  complex is grown from its metal, unless a ring runs through the metal
  (a chelate), where the ring is drawn as rings are.
- **A metal's bonds are long.** A bond between a metal and a ligand is
  drawn 1.4 bond lengths long (Pd-P is 2.3 Å against C-C's 1.5 Å), which
  gives the ligands room - but in a chelate's ring, which is drawn regular.
- **A donor bonded to a metal** (a phosphine's P) spreads what it carries
  away from the metal, as a tripod's legs, 75 degrees apart.
- **A chelate that closes at a metal** - dppf's two P on Pd, through the
  ferrocene - has the metal at the apex over its two donors, its bonds
  alike and as long as a square angle there needs.
- **A metal that two chelates or more close at** - a salen's Mn, three
  rings through it; a bisphosphine's and a cyclometallated benzoate's on
  Krische's catalyst's Ir - is drawn as a metal is, not as an atom shared
  by rings each regular: its donors round it a square angle apart (four,
  or fewer, as a square-planar or an octahedral metal is drawn), or
  evenly round where five or more - or three that make a ring of their
  own - close round it; each chelate's ring then drawn between its two
  donors, giving at the metal where a regular ring would not (three rings
  regular round Mn left the salen's two O 35 degrees apart, Cl drawn over
  one: now they are a square angle apart, Cl between them). The donors of
  one chelate are next to each other, chelates sharing a donor in their
  chain; separate chains - Krische's two chelates - can go round the
  metal more than one way (which P is beside the benzoate's C), and each
  way is tried with what hangs from it, as a macrocycle's shapes are, its
  phenyls turned as a propeller's blades as well as flat. A ligand of the
  metal drawn inside one of its chelates' rings, of any size up to eight,
  is hidden there, as an atom inside a small ring is.
- **A metal in a chelate's ring** has its other ligands evenly over the
  room outside the ring - two a third of it apart, not a gem-dimethyl's
  pair - the ligand it was reached by among them: Hoveyda-Grubbs II's two
  Cl either side of its carbene, not both on one side of it, by the
  mesityl's methyl.
- **A pi system bound to a metal that makes no ring** - an alkene's C=C,
  dba's on Pd, an allyl's three atoms - lies across the metal's bond, its
  centre a bond from the metal: a C=C square to the bond, as chemists
  draw an alkene's complex; an allyl bent round, its middle atom away from
  the metal and its ends toward it. What its atoms carry points away from
  the metal (an E alkene's second group then toward it, as its
  configuration needs). Hung from its star as a chain, it was drawn end on
  to the metal, the metal's bond running to its far middle.
- **Aryl rings crowded round one atom** - PPh₃'s phenyls on a crowded
  metal - are each turned on their bond out of the page, all the same way
  round (a propeller), and so seen in perspective: foreshortened across
  the bond, its near edges bold and the bonds toward them wedges. Done
  only where it reads better by the benchmark's measures, at 45, 60 or 70
  degrees, whichever reads best - and only to rings that hang from the
  atom, not to what the atom hangs from (BINAP's naphthalene, beyond its
  P, is the rest of the molecule). The structure is grown with its blades
  so turned from the start, at each angle, as well as flat, and every
  start is set right and measured alike: grown flat, four PPh₃ round a
  metal lie phenyl on phenyl in pairs, every frame the same drawing
  turned, and setting that right went by hairs. Blades of two hubs are
  two things: one drawn on the other is a fault, as anywhere else - only
  the atoms of one solid may lie over each other's ink.
- **Clean-up draws a complex as writing out its label does**: the same
  engine, given the same structure - a haptic bond's star with its pi
  system - and each star put afterwards at the centre of its system's
  atoms (a ring's is there already; a C=C's, cod's, is not), so a complex
  expanded and then cleaned up does not move.

## How the engine goes about it

1. Find the rings (smallest set of smallest rings) and the ring systems -
   fused, bridged, spiro - and the chains between them.
2. Lay each ring system out in its own frame, square on the lattice - or,
   for a cage, in perspective and upright; a ring bound face-on to a metal,
   with the metal, in perspective (section 7).
3. Grow the structure out from the frame (section 3), or, with no ring,
   from the middle of its longest chain, placing each bond by the rules of
   section 2 and choosing among free placements by section 5.
4. Try the frame's orientations and keep the one that reads best by
   section 4, its free choices tried the other way and its parts
   untangled (section 5). Where finished drawings are chosen between - a
   macrocycle's shapes, a cage's views, a piece's best few at the end -
   the one with the fewest faults (an atom on another, bonds crossing, an
   atom on a bond) always wins, whatever else it costs, and those with as
   many are chosen between by how they read (GR-4.3; the maintainer,
   2026-10-29). Only there: inside the search a drawing part made has
   clashes the passes after it clear, and weighed above everything they
   steer it off.
5. Last, turn a macrolide's sugars to their face and make room for the
   H's of labels and the letters of names, each by a small local move
   (sections 4 and 5); and turn
   aryl rings crowded round an atom as a propeller (section 7), where
   they were not grown so. Drawings that read as well as each other
   until then - phorbol's skeleton turned end for end - are each set
   right to the end and measured with their stereochemistry drawn as it
   will be (section 6): an H drawn on a centre may find a clear place in
   one and none in the other, its wedge going onto a ring bond instead.
6. Set the pieces of a salt or a mixture side by side, the largest first,
   with a bond and a half of paper between one's ink and the next's: a
   label's symbol, its H beside it and its charge count as ink (an OH
   facing an HO stands off further than two carbons).
7. Put the stereo on (section 6).

Every step is measured on the benchmark, and a change is kept only if the
drawings it makes are better. How to go about changing the engine, and
what the maintainer has decided, is in
[`LAYOUT-2D-TUNING.md`](LAYOUT-2D-TUNING.md).

## Many at once

A workflow's generated set - a summary's grid of samples, a series of
analogues varied round one core - is laid out structure by structure, as
one would be, and set out together (`src/lib/layout/many.ts`).

- **Each read back against the molecule it was given** (`readBack.ts`
  `notAsGiven`; the maintainer, 2026-10-21: a laid-out structure must be
  the same molecule it was given, checked, not assumed, on every path that
  lays out many at once). Every atom placed and none on another; each
  double bond given cis or trans drawn so, none in a small ring drawn
  trans; each stereocentre shown as given and none shown where none is
  given, atom by atom; and the structure read back - its atoms, charges,
  H's, bonds and the configurations the drawing shows - the same as given,
  by its identity text. One that is not says how, in words, and is kept:
  never dropped, never passed over.
- **Lined up on a core.** Where what made a series gives its core, the
  core is found in each structure atom for atom (`scaffold.ts`
  `coreMatches`: the same elements, every bond between core atoms the same
  and no other); where it does not, the series are the structures sharing
  a ring scaffold - their rings and the chains between them - and the
  result says so, since analogues whose groups carry rings then stand in
  series of their own. Each member is turned, or mirrored with every wedge
  turned to hashes and back, to lie on the core as the first member draws
  it, and read back again where it was moved. A drawing with depth is only
  turned. A core of rings lines up exactly; a core with a chain in it - a
  benzamide's C(=O)N - comes out the other way round in about half of a
  series, which lining up afterwards cannot change.
- **Set out in a grid.** Every cell alike, as large as the largest
  drawing and a gap; each series beginning a row of its own.
- **Off the drawing's thread.** In the app, in batches across a pool of
  workers (as many as the cores but one, at most eight), apart from the one
  that lays out a drawing (`chem/layOut.ts` `layOutMany`).
  `npm run layout-many` times a thousand analogues
  (`testdata/analogues.ts`) and reads every one back.

## A part between fixed neighbours

A part of a structure can be drawn afresh while the rest stays where the
chemist drew it (`src/lib/layout/around.ts` `layoutAround(input, part,
fixed)`): the new scaffold of a scaffold swap, its substituents as they
were. Clean-up draws whole structures; this is for a caller that replaces
one part of a drawing (the maintainer's rulings, 2026-10-23).

- **Where the part ends.** Only at single bonds in no ring. A part whose
  edge would cut a ring system takes the whole system in, and the result
  says which atoms were taken (`taken`). A part joined to the rest by a
  double or triple bond is refused.
- **The part as the engine draws it.** The part is laid out on its own by
  `layout2D`, each bond to the rest a stub (the rest's atom, alone), and
  set down onto the rest without being bent: its rings stay regular, its
  bonds of one length (the rest's own, the middle of its bonds).
  - **On one bond**, exactly. The stub lies on the rest's atom and the
    bond along the room the rest leaves there: the middle of the widest
    gap between its bonds, or, on an atom with one other bond, either way
    at 120 degrees from it. The rest does not move.
  - **On two bonds or more**, by the turn and shift that put the stubs
    nearest the rest's atoms, the part's drawing or its mirror image, its
    stubs alike (a gem-dimethyl's two methyls) paired with the rest's
    atoms each way its symmetries allow.
    Each branch of the rest (what hangs from one bond to the part) is
    then moved as a whole onto its new bond: it keeps its own drawing and
    is turned, about its atom, only as far as the new bond needs to lie in
    the room the branch left for the old (`moved`). Where a branch so
    placed lands on the rest - an atom on an atom or on a bond, bonds
    crossing - it is flipped over its new bond, each in turn, where that
    clears more: its bond, and so its direction, as before, and its kept
    wedges turned to hashes and back, which keeps their centres as they
    were. The rest is never otherwise moved.
- **Refused, and why said**, so that the caller draws the whole structure
  afresh instead: a part's stubs ending more than one bond from the
  rest's atoms (`MISMATCH_LIMIT`: a 1,2-substituted ring swapped for a
  part with its substituents far apart); a metal complex or an axis of
  chirality in the part; a part that holds a cage, drawn in perspective;
  a part that is the whole structure, in pieces, or not bonded to the
  rest; a part whose bonds to the rest alike could be paired with the
  rest's atoms more ways than are compared (96), or whose symmetries the
  search cannot all find - a few of the ways would go by the order of the
  atoms.
- **Stereochemistry.** The rest's wedges and drawn H's are kept, except
  at a centre in the part or bonded to it. Those centres are given theirs
  afresh, as `layout2D` places them. The whole drawing is then read back
  (`readBack.ts` `notAsGiven`), and one that does not read as the
  structure given is not handed over.
- **Crowding** left is said, not mended by moving the rest: atoms of the part
  or of a moved branch within half a bond of another, and bonds crossing
  (`crowded`, in words). Of the ways the part can be set down, the one
  nearest the rest's atoms is taken, then the one that reads best by the
  engine's own measure.
- **In any order.** The molecule is worked in its own order (`canonical.ts`),
  as `layout2D` is, and every choice goes by the drawing or by that order;
  placements are compared to a millionth, and of two that read alike the
  one taken goes by each element where it lies, not by how the atoms are
  numbered. The same structure and
  the same rest, given with their atoms in any order, come out the same -
  a symmetric one too, its atoms alike given the rest's places one way or
  another.
- **Flat.** The drawing it hands back is flat. A rest drawn in
  perspective keeps its depth only as the caller keeps it.

## A drawing made regular, cleared keeping its arrangement

A structure read from a figure keeps its arrangement and takes the style's
geometry (the maintainer, 2026-10-27). Where making it regular puts two of
its parts in each other's way, `untangledKeeping` (`untangleKept.ts`) clears
them as the engine clears its own (`untangle`): a branch turned off its
angle, a little and then more, and at last the bond it hangs from drawn
longer. Only moves that keep the arrangement are taken:
- no ring is turned, nor anything the caller keeps as drawn (a chair's). A
  ring system, with what is kept as drawn on it, may be moved whole by a
  bond drawn longer - its shape and its turn kept - by at most 0.6 of a
  bond; anything else kept as drawn does not move at all (the maintainer,
  2026-10-27);
- no turn leaves two of an atom's bonds next to each other closer than 100
  degrees, or 110 at an atom with a double bond, where that pair was not
  already - each pair by its own angle, so a ring's narrow corner leaves
  the wide angles at its atom wide (the maintainer, 2026-10-27: angles near
  the style's, never squeezed to clear the way);
- no atom's neighbour ends on the other side of another from where the
  regular drawing has it - a substituent across its bond, a chain's turn
  the other way. That is where the drawing has it, the regulariser seeing
  to that, but for a pair drawn near in line and set to one side (held so),
  a triple bond's neighbours put in line (held in line), and an unsure
  atom put by the bonds about it;
- the engine's own rule holds: the drawing never ends with more bonds
  crossing than it began with.

Atoms only move, so every mark on a bond (a wedge, its narrow end, a wavy
or bold bond, a double bond's side) stays as read. A chain curled on itself
that only a turn the other way would clear is left as it is; whether what
is left is clear enough is the caller's to judge.
