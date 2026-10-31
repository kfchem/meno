# Reaction atom mapping

What it is for, how Meno does it, and how the port it rests on was checked.
Judge it, like everything else, against [PURPOSE.md](PURPOSE.md).

## What a map must be

A reaction's atom map, in Meno, is for calculation first:

- It pairs **every** atom of the products with an atom of the reactants,
  hydrogens included, one to one, between structures in 3D.
- From it Meno writes the products' 3D geometry in the reactants' atom
  numbering - what a nudged elastic band, QST2/QST3, and matching an IRC's
  two ends to the reactant and product need.
- Hydrogens are placed by geometry, consistently with stereochemistry
  (E/Z, R/S, which face reacts), as ACCeL's mapper places them.
- A map of heavy atoms only, for showing on a drawn scheme, is read off a
  full map. It never stands in for one.

A map that leaves an atom out, pairs heavy atoms only, or pairs an atom
with one of another element, is not a result: Meno says it is incomplete
and writes nothing from it. A product with other elements than the
reactants - as many atoms or not - is refused before it is mapped, the
elements it has more or fewer of named.

## How it is done

`src/lib/chem/reactionMap.ts` is Meno's side; `src/lib/chem/accelMapper.ts`
is ACCeL's mapper, ported, with departures of Meno's own (*Where
Meno departs from ACCeL*). Both are pure (no DOM, Tauri or network).

`mapReaction({ reactants, products })` takes each side as one or more
structures (`Molecule`: atoms with 3D coordinates, hydrogens as atoms,
bonds with their CTfile types) and gives:

- `reactant`, `product` - each side as one structure, as mapped. Several
  structures on a side are set side by side as ACCeL's
  `Modeler.incorporate` sets them (each next one past the last's far
  corner, 2 Å apart on each axis) and numbered on from one another, the
  first first. That combined numbering is the reactants' numbering.
- `maps` - every map, in ACCeL's order, best first: for each product atom,
  the reactant atom it is (from 0), -1 where none.
- `complete` - for each map, whether it pairs every atom of both sides one
  to one, each with one of its own element.
- `productsInReactantNumbering` - for each map, the product with its atoms
  where the reactant's atoms they map to stand in the numbering, its own
  coordinates and bonds. Empty unless every map is complete, as ACCeL's
  `get_mapped` gives nothing then.
- `changes` - the first map's bonds made, broken and changed in order,
  in the reactants' numbering, with their CTfile types before and after.
  A bond of an aromatic ring on both sides (identity's `aromaticForm`) has
  not changed in order, whichever Kekulé structure each side is drawn in:
  a map that turns a symmetric ring over pairs one side's single bonds
  with the other's double bonds, and the ring is the same. The same holds
  for every map's bond changes (`bondChanges`): the drawn arrow's reacting
  centres and the *Atom map* step's *Bond changes* among them. A bond given
  as aromatic (type 4) on one side and in a Kekulé structure on the other
  has not changed either. The rule is identity's: a ring is aromatic where
  its bonds alternate around it, so a bond-shift isomerisation -
  cyclooctatetraene's ring bonds shifting, cyclobutadiene's automerisation
  - reads as no bond change, as bond-shift isomers are one structure to
  identity (docs/WORKFLOWS-FOUNDATION.md, *Duplicates, and what judges
  them*).

`withMapNumbers` gives the structures as they came in, each atom's
atom-atom mapping number (`map`, which Meno already reads and writes in
molfiles and RXN files) set from a full map: a reactant atom its place in
the reactants' numbering plus one, a product atom that of the reactant atom
it maps to, hydrogens too. `heavyAtomPairs` reads the heavy-atom pairs off
a full map, for a drawing.

What it will not do:

- **Map a flat drawing.** If every atom of both sides lies at z = 0 and
  some atom is short of the hydrogens its valence asks, the structures are
  a 2D drawing with its hydrogens implicit, and `mapReaction` refuses them.
  (Small molecules that happen to lie in the plane with all their atoms -
  water, a lone ion - are mapped.) A drawn
  scheme is mapped through its 3D structures - Meno's own 3D generation -
  never as drawn, with its hydrogens implicit.
- **Guess bonds.** The bonds come with the structures. ACCeL reads a
  molfile's bond types 1 to 4 as single, double, triple and aromatic, and
  any other type as a bond of no stated order; Meno hands them over the
  same way, with one thing more that ACCeL's own flow does: an aromatic
  ring's bonds are handed over as aromatic, whichever Kekulé structure the
  ring was drawn in. ACCeL perceives its rings before it maps
  (`Box.calc_bonds` calls `Modeler.aromatize`), from the geometry; Meno
  perceives them from the bonds (identity's `aromaticForm`), as its
  identity and symmetry do. The map is built over the bonds whatever their
  type, and the types are read only in a few of the checks and scores
  (`_correct_maps`, the pericyclic and face terms of `_order_maps`), so a
  ring drawn in either Kekulé structure maps the same. The two readings
  differ in both directions. ACCeL takes a ring of bonds between single
  and double length with 4n + 2 electrons, so pyrrole, furan and thiophene
  are aromatic to it and cyclooctatetraene and cyclobutadiene are not.
  Meno takes a ring whose bonds alternate, so for these four it is the
  other way round. A charged
  ring drawn with its charge on one atom (tropylium as three C=C and a C+,
  the cyclopentadienide anion as two C=C and a C-) has no ring of
  alternating bonds, and is handed over as drawn. On the corpus below and
  on these rings mapped (cyclooctatetraene's ring closure to
  bicyclo[4.2.0]octatriene, a dimethylpyrrole methylated at N, furan and
  cyclobutadiene onto themselves), the first map is the same either way;
  cyclooctatetraene's later maps come in another order. On the corpus of
  134 runs it was checked on (67 reactions, two embeddings each), handing
  the mapper aromatic bonds changed no map: it is there to match ACCeL's
  own flow, for the checks and scores that read bond types.

Mapping runs in a worker when the interface asks for it (*On a drawn
scheme*). How long it takes, and why like molecules standing apart once
made it long, is in *Speed* below.

## The port

`accelMapper.ts` is ported from ACCeL (kfchem/accel, MIT, © 2021 Keisuke
Fukaya) with its author's permission: `accel/base/modeler.py` on master -
the same file as the accel 0.3.0 release - `Modeler.get_maps` and
`get_mapped` and what they call (`_get_maps`, `_correct_maps`,
`_order_maps`, `_kabsch`; `Modeler.incorporate`, `merge`, `get_splitted`),
with the parts of `accel/base/atoms.py` they rest on. Its MIT notice is in
the file's header and in `src-tauri/resources/licenses/ACCeL-MIT.txt`.

It is literal: function by function, branch by branch, every condition,
threshold, sign and order kept - the staged initial-pair criteria, the
proper-bonding check with its 1,2-migration case, the H-count preference,
the combination of four to eight single-pair chains, the extension over
every atom with its geometric choices, every recursion entry and exit,
`_correct_maps` and `_order_maps` with all their scores. Each function and
block names the line range of `modeler.py` it comes from. Nothing has been
simplified.

### Python's orders, kept

Where the original's result depends on how Python iterates, the port does
the same:

- lists and dicts in insertion order; a dict key set again keeps its place
  and takes the new value (JavaScript's `Map` does the same);
- `sorted` stable, comparing with `<` only, tuples element by element;
- the depth-first stack of the initial chains, and the extension's deque
  (`popleft`, `appendleft`, `extendleft` putting each pair in front in
  turn, so in reverse);
- `list(set(a) & set(b))` of small integers (the known-neighbour indices
  whose order decides a tie in the torsion choice): CPython iterates the
  table it built, so `pyIntSetAnd` builds the same table - linear probes
  of nine, then perturbed probing, resizing as `setobject.c` does - and
  reads it in slot order;
- `round(x, 1)`: the nearest tenth to the exact binary value, an exact half
  to the even tenth;
- `itertools.combinations` in its order; Python's `max` keeping the first
  of equals; `for ... else`.

numpy's arithmetic is followed where its rounding could tip a comparison:
a 3-vector's sum and dot product left to right, `np.linalg.norm` as the
square root of that, a mean down a column row after row, a whole array's
sum pairwise as numpy sums it, `np.cross` by its formula, a determinant by
LU with partial pivoting. Measured against numpy on random inputs, the
torsion, chirality and E/Z decisions agree in every case.

### Where ACCeL's own order is not fixed

Two sets in `_correct_maps` hold atoms - the bonds a map leaves unmatched,
and the swaps found from them - and Python iterates a set of objects in the
order of their memory addresses. So ACCeL's own output can change from one
run to the next: the order of the corrected maps, and so the order of maps
whose scores all tie, and (through `max_loop`, which stops after four rounds
a map) now and then which maps are found at all. The port takes one fixed
order there: the unmatched bonds as they are met, each atom's own first;
the swaps sorted by their atoms' numbers.

Over the corpus below (each reaction run through ACCeL two to five times,
each time in a new process), ACCeL's output changed between runs for three
reactions, in both embeddings of each: two Diels-Alder reactions
(cyclopentadiene with maleic anhydride, furan with acrylonitrile), where the
corrected maps came in another order, and a ring-closing metathesis, where
other maps were found. Meno's result matched one of ACCeL's runs exactly in
each.

### Numbers

`_kabsch` takes numpy's SVD; Meno's own 3x3 SVD (one-sided Jacobi) agrees
with it to a few units in the last place for most maps (about 1e-11
relative at worst, where the RMSD is near zero), not bit for bit. Two maps whose total RMSDs
differ by less than that - hydrogens of a methyl, or a symmetric molecule's
equivalent atoms - may come in the other order. The rounded scores
(`bonding_local_rmsd`, `local_rmsd`) and every other score agree exactly.

### Where Meno departs from ACCeL

Meno departs from the original in eleven places. The port keeps them as
ACCeL has them (`ACCEL_EXACT`, which the checks below run); Meno maps with
the departures (`MENO_DEPARTURES`), each marked `[Meno departure: ...]`
where it is in `accelMapper.ts` and tested beside what ACCeL does with the
same input (`accelMapper.departures.test.ts`; the last two, under *Like
molecules standing apart*, in `accelMapper.spectators.test.ts`). `mapReaction({ ..., accelExact: true })`
maps as ACCeL does.

- **The first of a group, with nothing to measure it from**
  (`firstOfGroupByGeometry`). When three or more like atoms hang on an atom
  with no torsion to place the first of them by - no paired neighbour, or
  none with a paired neighbour of its own, as for the methyl of an SN2 at a
  methyl - ACCeL pairs the first by atom order with the first, the rest
  following by chirality; which way round the methyl maps then depends on
  the atoms' order in the files, and an SN2 does not come out as the Walden
  map. Meno pairs the first with the one nearest it once the two
  structures are laid over one another: by the best rotation over the pairs
  so far within the central atoms' own molecules, where at least three of
  them span a plane, else by setting the two central atoms on one another.
  Where there is a torsion to go by, nothing changes. With nothing but the
  central atoms to go by, "nearest" means something only where both sides
  stand in one frame (an IRC's two ends, structures laid over one another);
  structures made apart give it nothing to go by, and then it is no worse
  and no better than atom order.
- **A torsion of exactly 180°** (`clampTorsionCosine`). `_get_most_dihedral`
  takes `arccos` of a cosine that rounding can push past -1; it is then not
  a number, and the atom exactly anti loses to a gauche one (an exactly
  staggered ethane, rigidly moved, then comes out with one methyl turned
  against the other). Meno keeps the cosine within [-1, 1]. Real structures
  are seldom exactly anti; hand-built and symmetrised ones are.
- **A pair of faces with no face flag** (`skipUnflaggedFacePair`). Where two
  faces read the same forwards and backwards and their flag is `None`,
  `_order_maps` computes `bool ^ None`, which Python refuses: ACCeL fails
  on an oxa-6π electrocyclisation (a dienal closing to a 2H-pyran), for
  one. Meno leaves that pair out of the pericyclic score.

- **A group turned, read by its sign** (`signedTorsion`). Three or more
  like atoms on an atom (a methyl's hydrogens) are placed by a torsion
  about the bond to a paired neighbour: `_get_most_dihedral` takes, on each
  side, the atom whose torsion is furthest from 0 and pairs the two. It
  compares sizes only, so with one hydrogen near 0 degrees and the others
  near -120 and +120, a methyl turned a few degrees can have -124 on one
  side and +125 on the other as the two furthest, and comes out turned 120
  degrees. Meno keeps ACCeL's choice on the first side and pairs it with
  the atom on the other side whose torsion, sign and all, is nearest its
  own; the rest of the group follow as in ACCeL.

- **Fewest bonds made or broken** (`fewestBondChanges`). `_order_maps`
  ranks the maps by fourteen scores in turn. Among maps with the same first
  score (metathesis), Meno puts first those that make and break the fewest
  bonds, hydrogens' included, and only then goes on to ACCeL's second
  score and the rest. ACCeL's second score counts new bonds between two sp3
  carbons, and keeping it low can cost more bonds made and broken
  elsewhere: for chloroacetaldehyde going in one step to acetyl chloride,
  ACCeL puts first a map in which the oxygen and both CH2 hydrogens change
  carbons. A single step makes and breaks as few bonds as it can, so Meno
  counts that first; between maps that change as many bonds, ACCeL's order
  stands. Like ACCeL's own scores, it orders only the maps the search
  builds.

- **The hydrogen in line goes** (`transferAlignedH`). Where a map moves a
  hydrogen from one atom (the donor, D) to another (the acceptor, A) and
  the donor holds other hydrogens like it, ACCeL's choice of which one goes
  follows from how it placed the group, not from where A stands; in
  hydrogen abstraction from methane by a chlorine atom lying in line with
  one C-H, ACCeL can give the chlorine another. A hydrogen is passed along
  the line D-H...A, so Meno, after ACCeL's ordering, has the one already
  nearest that line go, and puts it in the place on A in line with D where
  A holds hydrogens of its own. "Nearest the line" is the turn, about the
  bond to the atom's one other heavy neighbour, between the hydrogen and the
  partner (D or A), where there is one such neighbour (a methyl); otherwise
  the angle at the hydrogen, atom-H...partner, short of 180°. Meno takes
  another hydrogen over ACCeL's only when it is nearer by more than 60°
  (`TRANSFER_MARGIN`): a methyl's hydrogens stand 120° apart about its
  axis, so nearer by more than half that is not the same hydrogen reached
  by turning the other way. Nearer by less, the geometry cannot tell them
  apart, and ACCeL's choice stands. Only which of an atom's like hydrogens
  is which changes; each map keeps its bond changes.
- **Hydrogens held in a frame keep their places** (`localLeastTurn`). Like
  hydrogens that stay on one atom are placed by ACCeL by chirality or a
  torsion. Where the atom has two or more heavy neighbours, Meno, after
  `transferAlignedH`, lays the atom and those neighbours on one side over
  the same atoms on the other and gives each hydrogen the one nearest it:
  such a group cannot turn freely, so its hydrogens keep their places about
  their atom through a step. In an SN2 at a CH2, the centre inverts as an
  umbrella folding over; ACCeL reads it as kept and swaps the two
  hydrogens. A methyl, or an atom with no heavy neighbour, has no frame to
  lay over and is left as ACCeL placed it, as is a group a hydrogen comes
  to or goes from. So is an atom with more neighbours on one side than on
  the other, hydrogens counted: it goes from one shape to another - a
  double bond added to, as at a Diels-Alder's =CH2 ends, or a cation's or
  a carbene's CH2 bonded to - and which of its hydrogens is which follows
  the faces the reaction meets, which ACCeL's face and syn-or-anti scores
  weigh. Laid over its
  frame, it was turned against them: a Diels-Alder's two outside
  hydrogens (trans to the diene's inner carbons) came out on opposite
  faces of the new ring. An SN2 centre keeps its number of neighbours,
  and is laid over its frame as before. Checked on a
  corpus of 134 runs (67 reactions, two embeddings each): 18 first maps
  changed when this was put right, in their hydrogens only, their bond
  changes the same; 16 of them are now ACCeL's own first map.

  With either of these two, maps the search built apart can become the
  same once their hydrogens are placed; each is then kept once, the first
  in ACCeL's order, so there can be fewer maps than the search built. (The
  Diels-Alder in the tests keeps its 64, which differ only in the ring
  CH2s' hydrogens: all four of its CH2s change order.)

- **The same rounding elsewhere** (`clampEzCosine`, `clampFaceCosine`).
  `_det_ez` reads an exactly anti torsion as not E, its `arccos` not a
  number; `_order_maps`' face tests read such an angle as under 90°. Meno
  keeps those cosines within [-1, 1] too. A cosine that is not a number to
  begin with (a zero vector's) stays one, in both.

### Like molecules standing apart

ACCeL's search pairs every water of a solvent with every other, and tries
the reaction's pieces and the waters in every order: an SN2 beside n waters
gives 2, 2, 8, 96 and 768 maps for n = 0 to 4 (ACCeL 0.3.0 itself, and the
port, alike: n!·2ⁿ pairings of the waters), calling its search 177 492
times for n = 4. Its own placement of isolated molecules by RMSD
(modeler.py 1161-1228) places them once every other piece is placed.

Meno departs here, on the maintainer's ruling (2026-10-17):

- **`spectatorsByRmsd`.** Like molecules standing apart - four or more of
  one kind (the same graph) on each side, as many on each, bonded to
  nothing else: the count ACCeL's own placement asks for - are held out of
  the initial pairs until everything else is placed. Then ACCeL's own
  placement places them, one kind after another: the placement ACCeL
  reaches once the rest is placed, reached directly.
- **`spectatorsRefined`.** That placement is greedy, one molecule at a time.
  Each map's like molecules are then given to one another again, whole,
  for the least total RMSD - the key ACCeL's ordering decides them by
  where it has tried them all. Where there are few enough ways (50 000:
  six waters) every permutation is tried, each molecule turned every way
  it can be turned as a rigid body (not a mirror image of a methyl); then,
  for all, a Kabsch fit and an optimal assignment (the Hungarian method)
  alternate while the total falls. Nothing that is not lower is taken.

Wherever the port without these departures finishes (the corpus, an SN2
beside up to five waters, Diels-Alder, Claisen, tautomer and SN2 reactions
beside four or five waters, methanols or acetonitriles):

- the set of distinct maps of the rest - every map with the like
  molecules' atoms left out - is unchanged: only permutations of the like
  molecules are gone from *Other map*;
- the first map pairs the rest the same way, and ranks the same on all of
  ACCeL's keys but the last;
- its total RMSD is the same in 22 of the 32 runs that have like
  molecules, and lower in 10.

Where the port cannot finish (six waters and more), the refined map's
total RMSD is never above that of the placement it starts from.

## Speed

The port runs the original's search as it is; what it saves is work that
cannot change a map (checked against the port without it on the whole
corpus, exactly and with the departures, every map in its order):

- an atom's number, and its bonded atoms by kind, kept rather than looked
  up in its parent's list and bond matrix again and again;
- lists that are only asked `in` or `.index()` kept as maps;
- a recursive _get_maps call answered from an earlier one of the same set
  of known pairs, in another order: its maps, the known pairs stripped, are
  the same - unless a choice on the way was a tie the pairs' order (or
  rounding with it) could tip: a torsion as large as another's, two RMSDs
  within 1e-9 of one another, Meno's geometric fit near its threshold. Such
  a call is made afresh.

| | ACCeL 0.3.0 | port, as first written | now |
|---|---|---|---|
| SN2 beside four waters | 37 s | 10.5 s | 0.6 s (exactly) · 2 ms (like molecules placed) |
| the corpus (225 inputs), exactly | 91 s | 23 s | 2.9 s |
| SN2 beside 6 / 10 / 20 waters | over 5 min each | - | 0.4 s / 35 ms / 0.1 s |

(One machine, the minimum of three runs, while other work shared it.)

## How the port was checked

Against ACCeL itself, on the same inputs, stage by stage - in a scratch
environment, nothing of it committed:

- **The oracle.** accel 0.3.0 and numpy from PyPI in a scratch uv
  environment, run unchanged. A harness records, as each call of
  `_get_maps` returns, its locals by name (the initial pairs, the initial,
  canonical, H-matched, extended, extracted and recursive chains, and what
  it returns), then the output of `_correct_maps`, every map's scores in
  `_order_maps` and their order, and the public `get_maps` and
  `get_mapped`. The port is run with the same trace hook (`MapperTrace`)
  and compared atom by atom, hydrogens included, and map by map, in order.
- **Functions alone.** The nested functions (`_det_ez`, `_det_chirality`,
  `_get_most_dihedral`, `_get_large`, `_isproper_bonding`, and `_kabsch`)
  were taken out of `modeler.py` verbatim and run on thousands of random
  and degenerate inputs beside the port's: all agree (`_kabsch` to 1e-12).
  So do the set order, `round` and `combinations`.
- **The corpus.** 3D reactant and product structures with every hydrogen,
  embedded with the RDKit Meno's RDKit plugin had installed: the
  ConfoTS-showcase examples (simple, flexible and intermolecular
  Diels-Alder reactions, a sigmatropic rearrangement, Lewis-acid catalysis,
  a dipolar cycloaddition, an electrocyclic reaction and an SN2 model, and
  the showcase's own 3D Diels-Alder structures), rearrangements (Claisen,
  Cope, pinacol, 1,2-shifts, [1,5]-H shift), cycloadditions,
  substitutions, eliminations, additions, metatheses, tautomers, symmetric
  and identity cases, aromatic bonds kept as type 4, reactions beside four
  or six waters, unbalanced ones, known pairs, ordering options, and one
  past 256 atoms - 147 reactions, two embeddings of most. Statement
  coverage of ACCeL's mapper over the corpus was measured and the corpus
  widened toward what it missed: 849 of its 894 statements run (the
  reactions beside four waters left out of that count, too slow to trace
  line by line).
- **Results.** Every stage agrees on all 147 reactions - each `_get_maps`
  call (177 492 of them for an SN2 beside four waters), `_correct_maps`,
  every map's fourteen scores, the order, and `get_maps` and `get_mapped` -
  but for the cases above: where ACCeL's own output varies from run to run,
  Meno's matches one of its runs; and in two reactions (a cyclopropanation
  and a butadiene ring closure) maps whose total RMSDs differ only in their
  last digits come in the other order. The first map agrees on every
  reaction.

The unit tests (`accelMapper.test.ts`, `reactionMap.test.ts`) hold small
hand-made reactions (`reactionMap.fixtures.ts`: ethane moved rigidly, an
SN2 at a methyl, an enolisation, a Diels-Alder reaction) with the maps
ACCeL gives for them, and the Python behaviours above.

## On a drawn scheme

A reaction drawn on the page is mapped from its arrow's right-click menu,
*Atom map* (`ui/features/Workspace/chem/atomMap.ts`, `useAtomMaps.ts`):

- **Which structures.** The reactants are the structure nearest the arrow's
  tail and those standing on from it, each within four bonds of the last
  (room for a "+"); the products, likewise from its point. Reagents written
  over or under the arrow are not of the reaction. The menu offers the map
  only where something stands on either side.
- **In 3D, every hydrogen an atom.** Each structure is taken as a molecule
  in 3D made from it, where one is still its drawing's (the conformer
  shown); else one conformer is made, as *3D structure* makes it. A lone
  ion is an atom alone. The drawn structures are never mapped as drawn.
- **Off the drawing's thread.** The mapping runs in a worker of its own; a
  status at the canvas's foot says what is being done and for how long, and
  *Stop* ends it. ACCeL's search is used as it is, solvent and all - no
  pieces are picked out by hand, and nothing is set to make it faster.
- **Kept on the arrow** (`ArrowAtomMap`): both sides in 3D as mapped, which
  drawn atom each 3D atom is, and the complete maps best first (up to
  100). Of maps that pair the heavy atoms alike, and so show the same
  numbers, only the first is kept, its hydrogens as ACCeL ranked them.
  Also kept: the map in use (the best, unless *Other map* stepped on), and
  whether it is shown. What it shows is put on the drawing in the same undo step:
  - each heavy atom's map number, the reactants' numbered one after
    another, a product atom given its reactant atom's;
  - each bond the map makes or breaks marked as a reacting centre (CTfile
    code 4), and each whose order it changes (8).
  Hydrogens are in the map, not numbered on the drawing.
- **Show / Hide atom map** puts the numbers and centres on the drawing or
  takes them off; the map is kept either way.
- **Other map** takes the next of the maps kept, round again after the
  last; the best stays first. The menu stays open on it and says which of
  how many is in use ("2 of 4"). Each pairs the heavy atoms its own way,
  so each shows other numbers; maps that differ only in where the
  hydrogens go, which the drawing does not show, are not stepped through.
  `mapReaction` gives all of them, as ACCeL does.
- **Export reaction in 3D...** writes an SD file of two records: the
  reactants in 3D, and the products with every atom - hydrogens too - in the
  reactants' numbering, as a nudged elastic band, QST2 or an IRC's ends
  need. (Two XYZ files may follow, written by a plugin, as Meno writes no
  XYZ of its own.)
- **An RXN file** (Export, copy) carries the map's numbers and centres
  whether or not they are shown.
- **Incomplete.** Where not every atom finds its counterpart, the arrow
  keeps the reaction as incomplete, with no map: the menu says *Atom map
  incomplete* (and offers *Atom map* again), nothing is numbered, and
  nothing is written.
- **Changed since.** A map of a drawing changed since (an atom, a bond, a
  charge) shows nothing new: the menu offers *Atom map* again, and *Hide
  atom map* where its numbers are still on the drawing.

## For a workflow's *Atom map* step

`mapOnto` (`reactionMap.ts`) is what the *Atom map* step does
(docs/WORKFLOWS-FOUNDATION.md, *Atom mapping, and what Meno does itself*;
docs/STRUCTURE-STEPS.md, *Atom map*), and what the page calls for the same:

- **A reference side, and sides mapped onto it.** Each side is one or more
  structures, set side by side as one as above: a reaction's reactants and
  one product, or all its products; a compound and one of its conformers.
  Each side is mapped onto the reference on its own, in 3D with every
  hydrogen.
- **Mapped.** Each side is written in the reference's numbering: its own
  atoms, where they stand, put at the places of the reference atoms they
  map to, and its bonds renumbered with them (`order`: for each atom of
  the reference, the side's atom that is it). Its first map gives one;
  *every* map gives one for each, best first.
- **Bonds that may change, or not.** With `bonds` "change", a reaction.
  With "same", the side is to be the reference's own structure - a
  conformer of it - and a map that forms, breaks or changes any bond is
  not passed on, the bonds said. A map of a conformer onto its compound
  pairs like atoms as ACCeL's map extension does (a CH2's hydrogens by
  their handedness, an =CH2's by E or Z, a methyl's by the torsion), so
  each comes out where the reference has it.
- **Bond changes.** For each mapped side, a table: each bond the map
  forms, breaks or changes in order, its two atoms in the reference's
  numbering with their elements - from 0 as `mapOnto` gives them, as an
  entry's bonds number them; from 1 in the step's table on the page, as a
  card numbers them - and its bond type before and after (0 where there is none; 4,
  aromatic). The types are the structures'
  own; nothing is perceived from the geometry here. A bond of an aromatic
  ring on both sides is no order change (`changes` above).
- **Nothing in part.** A side whose atoms cannot all be paired one to
  one - a different number of atoms, other elements, a flat drawing, a map
  that leaves an atom out - is not passed on, and the reason is said for
  it. A map in part, for showing on a drawing, is `mapReaction`'s (each
  map with its `complete`).
- **Conformers of a mapped structure, the light way.** Where a structure
  is already mapped and only its conformers - the same structure in the
  same numbering - are to follow, `numberedLike`
  (`referenceNumbering.ts`) swaps their equivalent atoms' numbers as ConfoTS's
  `map_numbers` does, without a full map: on a conformer of a 60-atom
  compound with tert-butyl groups, about a tenth of a millisecond where a
  full map takes a few seconds. `throughRepresentative` carries a
  conformer through the representative its structure was mapped by.
- **Checked against known answers.** The tests hold hand-made reactions
  whose map is known by construction: a Diels-Alder (two bonds formed,
  four orders changed, nothing broken), an SN2 (C-Cl formed, C-Br
  broken), and the same product with its atoms in another order (the same
  answer). The ConfoTS showcase's first Diels-Alder, one reactant and two
  products, was checked the same way outside the repository: for both
  products, the two bonds formed and four orders changed are those the
  reactant's diene and enone call for, every hydrogen stays on its own
  atom, and each product keeps its R or S at the ring fusion.
- **Conformers, checked the same way.** Propene with its =CH2 hydrogens
  each in the other's place comes back to propene's places, atom for atom,
  by the full map and by `numberedLike`; so do 2-chloropropane's two
  methyls swapped whole. Outside the repository, on RDKit's conformers of
  two compounds of 60 and 99 atoms with several tert-butyl groups, every
  conformer came out with each equivalent atom where its reference has
  it, by both.
