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

A map that leaves an atom out, or pairs heavy atoms only, is not a result:
Meno says it is incomplete and writes nothing from it.

## How it is done

`src/lib/chem/reactionMap.ts` is Meno's side; `src/lib/chem/accelMapper.ts`
is ACCeL's mapper, ported. Both are pure (no DOM, Tauri or network).

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
  to one.
- `productsInReactantNumbering` - for each map, the product with its atoms
  where the reactant's atoms they map to stand in the numbering, its own
  coordinates and bonds. Empty unless every map is complete, as ACCeL's
  `get_mapped` gives nothing then.
- `changes` - the first map's bonds made, broken and changed in order,
  in the reactants' numbering, with their CTfile types before and after.

`withMapNumbers` gives the structures as they came in, each atom's
atom-atom mapping number (`map`, which Meno already reads and writes in
molfiles and RXN files) set from a full map: a reactant atom its place in
the reactants' numbering plus one, a product atom that of the reactant atom
it maps to, hydrogens too. `heavyAtomPairs` reads the heavy-atom pairs off
a full map, for a drawing.

What it will not do:

- **Map a flat drawing.** If every atom of both sides lies at z = 0 the
  structures are a 2D drawing, and `mapReaction` refuses them. A drawn
  scheme is mapped through its 3D structures - Meno's own 3D generation -
  never as drawn, with its hydrogens implicit.
- **Guess bonds.** The bonds come with the structures. ACCeL reads a
  molfile's bond types 1 to 4 as single, double, triple and aromatic, and
  any other type as a bond of no stated order; Meno hands them over the
  same way. Aromatic bonds count apart from single and double ones, as in
  ACCeL, so a Kekulé structure and an aromatic one can map differently.

The maps for a reaction with several identical spectator molecules can take
long: ACCeL tries their pairings recursively (an SN2 with four waters beside
it calls its search 177 492 times; about 10 s here). Anything that runs it
from the interface should run it in a worker.

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

Of the corpus below, ACCeL varied between runs on 3 of the 79 reactions
checked first (5 runs each), and Meno's result matched one of ACCeL's runs
exactly in each.

### Numbers

`_kabsch` takes numpy's SVD; Meno's own 3x3 SVD (one-sided Jacobi) agrees
with it to about 1e-15 relative, not bit for bit. Two maps whose total RMSDs
differ by less than that - hydrogens of a methyl, or a symmetric molecule's
equivalent atoms - may come in the other order. The rounded scores
(`bonding_local_rmsd`, `local_rmsd`) and every other score agree exactly.

### What the original does, kept as it is

Found while checking the port; left exactly as ACCeL has them, for its
author to judge:

- **A torsion of exactly 180°.** `_get_most_dihedral` takes `arccos` of a
  cosine that rounding can push past -1; it is then not a number, and the
  atom that is exactly anti loses to a gauche one. Real structures are not
  exactly anti; hand-built ones can be.
- **The first hydrogen of a group, with nothing to measure it from.** When
  three or more like atoms hang on an atom whose one paired neighbour has no
  other paired neighbour yet (a methyl whose carbon's other bonds all change,
  as in an SN2 at a methyl), the first by atom order is paired with the
  first, and the rest follow by chirality. Which way round a methyl maps
  then depends on the atoms' order in the files.
- **A Python error.** A pair of faces that read the same forwards and
  backwards with no face flag (`None`) makes `_order_maps` compute
  `bool ^ None`, which Python refuses; the port raises there too, and
  `mapReaction` reports it.

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
  widened toward what it missed.
- **Results.** Every stage agrees on every reaction, but for the cases
  above: where ACCeL's own run-to-run order varies, Meno's matches one of
  its runs; and maps whose total RMSDs differ only in the last digits may
  be ordered the other way. The first map agrees on every reaction.

The unit tests (`accelMapper.test.ts`, `reactionMap.test.ts`) hold small
hand-made reactions (`reactionMap.fixtures.ts`: ethane moved rigidly, an
SN2 at a methyl, an enolisation, a Diels-Alder reaction) with the maps
ACCeL gives for them, and the Python behaviours above.

## Still to come

A drawn reaction scheme using the map - a command on the reaction, map
numbers shown or hidden, RXN files written with them - is proposed
separately and waits for the maintainer.
