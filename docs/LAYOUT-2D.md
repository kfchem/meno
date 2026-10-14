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
  among the few that lie well, for the room it leaves inside. A ring fused
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
  it runs through regular and outside it. One with chains between its
  rings (vancomycin's peptide) is a chain like any other macrocycle:
  where several run through the same ring, that ring is drawn first and
  each macrocycle is a zigzag from ring to ring, turning as a hexagon
  does where it runs through one, so that the ring comes out regular,
  and kept clear of where the rest of that ring will fall.
- **Bridged systems**: where a ring is fused on a side as well - morphine,
  artemisinin, taxol - the system is drawn flat: the smaller ring of a
  bridged pair regular, the larger arcing round it with the bridge inside
  (taxol's A ring, its B ring round the gem-dimethyl bridge). Where that
  crowds the bridge or stretches its bonds, the fused rings are drawn flat
  and regular as though the bridge were not there, and the bridge is a
  path of bonds across the face of a ring, in front of it or behind it as
  the molecule has it, the bond behind broken where they cross -
  artemisinin's peroxide inside its seven-membered ring. Which side is the
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
  where the solid seen from that side puts it - and eased again with
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
  again. Adamantane is then a chair with its three axial bonds
  rising to the fourth bridgehead; bicyclo[2.2.2]octane a boat with its
  third bridge rising from both bridgeheads. A bond passing behind another
  is drawn broken there. Bonds out of the ring follow it - an equatorial
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
  the one that leaves the rest room taken (ibogaine). Of these and the flat
  drawing, the one with the fewest faults, where that is clearly fewer
  than flat; the cage alone before the whole, unless the whole reads far
  better. Then the whole drawing decides, measured as it will be drawn -
  its substituents and labels, its wedges and the H's they stand on
  counted: a solid is kept only where the drawing reads at least as well
  as with the system flat (ginkgolide B's OHs crowded in its solid), and a
  flat drawing with a fault a reader cannot miss - an atom on another,
  bonds crossing - is drawn as the solid too, and that kept where it reads
  better (aconitine). A clean flat drawing is not given up for a solid the
  measure merely prefers (scopolamine). A ring with a double bond in it
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
- **What a solid shows by its shape.** A stereocentre in a six-membered
  ring drawn as a chair or a boat (the template, any way round) shows its
  configuration by the drawing: each bond out of it upright or along a
  ring bond, up or down for a reader to see. So does one in a ring bridged
  across another, which the cage drawn in perspective fixes: ibogaine's
  isoquinuclidine, gelsemine's cage. Either only where it reads so for
  sure - each of its bonds out of the solid turned 15 degrees either way,
  it still reads as given; one drawn between the two corners the solid
  leaves free says nothing. Any other centre of a solid - in a ring fused
  round a middle and neither chair nor boat, tetrodotoxin's in its
  guanidine ring - shows it only by a depth the page does not show, and
  carries a wedge or hashes on a bond out of it, or an H drawn upright, as
  a flat ring's centre does (the maintainer, 2026-10-12, of two ways
  offered). Meno reads a drawing so too (`drawn.ts`): depth at a centre
  the solid shows, wedges at the rest.
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
  lipid's acyl chains on its glycerol): drawn straight, then joined.

## 3. Square to the page

The ring system the molecule is built round - the one nearest all the
rest of it, the largest of those - is the frame, and it is set square on
the lattice. A ring hung off it that cannot be square as well is left askew
rather than the frame tilted to meet it halfway. A frame whose own rings
cannot all be square together (fluorene's two benzene rings either side of
a five-membered one) is set with its long axis level.

Among the ways of setting the frame square - six turns, and their mirror
images; twelve for a frame of squares and no hexagons, whose sides can
lie level either way round - the drawing takes the one that reads best
(section 4).

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
  naphthalene.
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
3. **Stretch** a bond, only if the clash is still there.

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
drawing and the engine share). Where it - or its count, NH2's 2 after it
and set lower - would run into another label, an atom or a bond, the
bond to the atom is turned a little or drawn a little longer or shorter -
an OH, an SH - or the same is done to what it runs into, a C=O's O or a
small branch (taxol's benzoate, clear of its C1 OH). The H is never moved
under the symbol to make room, and no move that crosses bonds is taken.
Nothing else is moved for it: the drawing is set first, its H's last.

A name - a label that is not an element's symbol: OTBS, NHBz, PPh3, as
Clean-up writes groups by name - takes the room its letters take
(`src/lib/layout/names.ts`). Its first unit sits on its atom and the rest
follows, read outward from its bond: leftward from a bond coming in from
the right (TBSO, IUPAC GR-2.3), rightward otherwise; a name of one unit
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
  it (`labelShareMax`), each giving up its share past that. Where one of
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
  whichever way it points. It goes into one of its own rings only as a
  steroid's does: straight up or down, into a ring with no double bond of
  its own (one no other ring shares, whose second line is drawn inside
  it). Aslant into a ring, or into lovastatin's ring with its double bond,
  it reads as pointing into the ring; it goes outside where there is room.
  An H with three rings or more round its atom keeps to the most room.
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
  phosphine's P): that is a stereocentre, which Clean-up leaves as drawn,
  since the engine lays out none with a lone pair.
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
  η⁶-benzene, p-cymene - is seen as it is: the metal on its axis, a bond
  from its centre, the ring seen from a little above its plane (about 24
  degrees), so that it is drawn as deep as 0.4 of its width - a flattened
  polygon. Its lower half on the page is nearer - whichever side of it the
  metal is, and with no metal at all (a ligand's picture) - each atom as
  near as it is across the ring's axis. What hangs from it lies in its
  plane, pointing out from its centre and foreshortened as the ring is
  (Cp*'s methyls). The ring may be spun about its axis: where its first
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
  as they are; drawn as one ring with the metal, one came out trans.
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
- **Aryl rings crowded round one atom** - PPh₃'s phenyls on a crowded
  metal - are each turned on their bond out of the page, all the same way
  round (a propeller), and so seen in perspective: foreshortened across
  the bond, its near edges bold and the bonds toward them wedges. Done
  only where it reads better by the benchmark's measures, at 45, 60 or 70
  degrees, whichever reads best - and only to rings that hang from the
  atom, not to what the atom hangs from (BINAP's naphthalene, beyond its
  P, is the rest of the molecule).
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
   untangled (section 5).
5. Last, turn a macrolide's sugars to their face and make room for the
   H's of labels and the letters of names, each by a small local move
   (sections 4 and 5); and turn
   aryl rings crowded round an atom as a propeller (section 7).
6. Set the pieces of a salt or a mixture side by side, the largest first,
   with a bond and a half of paper between one's ink and the next's: a
   label's symbol, its H beside it and its charge count as ink (an OH
   facing an HO stands off further than two carbons).
7. Put the stereo on (section 6).

Every step is measured on the benchmark, and a change is kept only if the
drawings it makes are better. How to go about changing the engine, and
what the maintainer has decided, is in
[`LAYOUT-2D-TUNING.md`](LAYOUT-2D-TUNING.md).
