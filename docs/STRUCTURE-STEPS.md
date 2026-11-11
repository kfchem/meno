# Meno's structure steps

The workflow steps on structures that Meno does itself
(docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures). Each does
one thing, works on Meno's entry record (`src/lib/entry.ts`) and lives in
`src/lib/steps`, pure, with no page and no plugin. *Tag*, *Species*,
*Combine*, *Measure* and *Restraints* are steps of a workflow, and so are the
steps of two inputs, *Merge*, *Re-bond*, *Compare bonding*, *Torsion
restraints*, *Compare torsions* and *Atom map* (docs/WORKFLOWS.md, *Kinds of step*; `workflow/structureSteps.ts`): each runs on a set's entries read as
entry records, and gives each back as a step's entry - all it held kept
where it is that entry still, what was worked out at another structure,
places or state never carried (`setEntryOfEntry`). The rest follow. Each is tested against answers known by construction,
not only against its own code (`src/lib/steps/structures.test.ts`).

## Species

Each entry the same, its charge and multiplicity set as given (`withSpecies`).

- **One rule.** The charge and multiplicity go through Meno's one rule for a
  molecule's species (`speciesOf`, `src/lib/io/writers.ts`). Each part given
  is said to be given. What is not given stays as the entry had it.
- **A multiplicity follows the charge in use.** Where a charge is given and a
  multiplicity is not, the multiplicity is the one the electrons take at
  that charge. Na given +1 has ten electrons, a singlet.
- **A skeleton fails.** An entry without its hydrogens has no species
  (`lib/chem/skeleton`): its atoms do not say how it is protonated. It
  fails, saying so, and is given none; its hydrogens are added first, or it
  is marked complete without hydrogens.
- **What the electrons cannot have fails.** A molecule has its atoms' atomic
  numbers less its charge in electrons, and a multiplicity *m* leaves
  *m* - 1 of them unpaired. So the rest, paired, must be an even number,
  and there can be no fewer electrons than unpaired ones
  (`speciesProblem`). An entry given a charge and multiplicity its electrons
  cannot have fails, with the reason. Nothing is changed to fit.

  Checked: water, a singlet, not a doublet; OH, a doublet, not a singlet;
  OH⁻, a singlet; O₂, a triplet; H⁺, a singlet with no electrons.
- **What was for another species goes, said.** As a workflow step, an
  entry given another charge or multiplicity than the one in use loses
  what was worked out for the old one: its energy, its calculation, its
  imaginary frequencies. The step's line names what went ("1 entry set;
  its energy was dropped (it was for the other species)"). An entry given
  the charge and multiplicity it already had, given before or as its atoms
  say them, keeps all it held. One that fails goes out of *Failed* without
  its energy.

## Combine

The entries that come in, as one entry holding them all: a complex
(`combined`).

- **Order.** The first part's atoms come first, and each part's bonds are
  renumbered with it.
- **Places.** Each part stays where it stands; none is moved.
- **Kinds of geometry.** The parts must all be in 3D, all drawn, or all
  without places.
  - A part with frames is refused: take one frame first (*Take frames*).
  - Parts of mixed kinds are refused.
  - Either way, the reason is said.
- **Species.** The charges add. The multiplicity is one more than all the
  parts' unpaired electrons together. With two or more parts open-shell,
  that is their high-spin coupling, and it is said, since another coupling
  is the chemist's to set (*Species*). Where a part is a skeleton, without
  its hydrogens, the complex has no species either, and this is said.
- **Properties.** No part's properties are carried: each was worked out on
  its part alone, not on the complex, and what refers to a part's atoms (its
  restraints, its measures) would name the wrong atoms in the complex's
  numbering. What each part held is said, part by part and by kind: "part
  2: restraints, 2 measures, energy". The parts' ids stay as the complex's
  lineage.

## Measure

Each entry the same, with a property for each measurement asked for
(`measured`): the distance between two atoms, the angle at the middle of
three, or the dihedral of four. Atoms are given by the entry's numbering,
from 0, as its bonds have them. A measurement is named for what it is and
its atoms, said from 1 as a chemist numbers them: `distance 3-7`, `angle
1-2-3`, `dihedral 1-2-3-4`.

- **Units.**
  - Distances are in ångströms.
  - Angles run from 0 to 180 degrees.
  - Dihedrals run from -180 to 180 degrees, with the sign of IUPAC's
    torsion angle: positive where, looking along the bond from the second
    atom to the third, the bond to the first turns clockwise, by less than
    180 degrees, to cover the bond to the fourth (IUPAC Gold Book, "torsion
    angle", doi:10.1351/goldbook.T06406).
  - The degree is in Meno's units table as the unit of the angle dimension.
- **Its geometry.** Each value says the geometry it was measured at. An
  entry with frames gets a list, one value per frame.
- **Atoms typed, or from a table.** *Atoms* is *Typed* (on the card, from
  1) or *From the table* wired into its second input, *Atoms*, where wanted
  (an Atom map's bond changes). From a table, each row's atoms are measured:
  the cells of the columns that say they hold atoms and how they count
  them (`atomsOfRows`, `src/lib/table.ts`), two a distance, three an angle,
  four a dihedral. Every row goes to every entry, or - *Rows matched on* a
  name - the rows whose value in the column of that name is the entry's
  value of the property of that name (`map.entry`, which an Atom map
  writes on each entry it maps and in each row). Atoms typed with a table
  wired in are measured as typed, and the line says the table was not read. A table whose columns do not
  say how they count atoms is refused: a table read from a file never
  says, and its numbers are not guessed.
- **Nothing left out.**
  - An entry with no 3D places gets each measurement as not applicable,
    with the reason.
  - An atom number it does not have, an atom named twice, or the wrong
    number of atoms makes that measurement failed, with the reason.

  Checked:
  - distances and a right angle on a 3-4-5 triangle;
  - dihedrals of +60, -60, 0 and 180 degrees built by construction, the
    sign taken from the definition;
  - the dihedral, distance and angle the tests' own geometry builder
    places by.

## Steps of two inputs

*Merge*, *Re-bond*, *Compare bonding* and *Atom map* each take two inputs, named on the
step, and will not run until both are wired. Each pairs entries of the two
in a way said on its card, never by an implicit rule: each with each, or
*matched on* a property the chemist types - an ID a *Tag* gave, which rides
along with every entry made from it (`lib/nodes/match.ts`). An entry with
none to pair with, or more than one, is not paired, and says why. Every
entry a step sets aside goes out of its second exit with why written on it
as a property: `set_aside` (Merge, Re-bond, Atom map), `bonding` (Compare bonding).
Each is a text, to read in the set's table and to filter on.

## Merge

Two sets of one kind made one (`merge`, `lib/nodes/merge.ts`): *First*'s
entries, then *Second*'s. A set of molecules and a conformer set are not
merged; the step says so. A conformer set's compounds stay apart: *Second*'s
are numbered on after *First*'s. *Keep* is *All*, or *One of each* value of
a property: the first met is kept, and each later one is set aside, naming
the one kept ("the same start as a #1, which was kept"). One with no value
of it is set aside too, saying so. More than two sets are merged by chaining
Merges. One input that holds nothing - a branch that gave none this time, a
step's second exit that none went out of - adds nothing: the other's
entries come out, and the line says so ("nothing came from
First"). Both empty, nothing is merged, and the step says so.

## Re-bond

One entry's geometry with another's bonds and charges (`rebonded`): for
example, a conformer of the reactant given the product's bonding, as the
start of a restrained minimisation towards the product.

- **As a step.** It takes *Geometry* and *Bonding*. *Pairs* is *Each with
  each* (every geometry onto every bonding entry) or *Matched on* a
  property. Entries re-bonded from one geometry compound onto one bonding
  entry are one compound of their own. A pair that cannot be re-bonded sets
  the geometry entry aside, naming the bonding entry and why ("onto b #1: …").

- **One numbering.** The two must hold the same atoms in one numbering, atom
  by atom; an *Atom map* step writes its products in the reactants'. Where
  they do not, nothing is made, and the first atom that differs is said.
- **What comes from each.**
  - The structure and species are the bonding entry's: its atoms' charges,
    radicals and isotopes, its bonds, and its charge and multiplicity -
    none where it is a skeleton, without its hydrogens, and this is said.
  - The geometry is the geometry entry's, as it is: one 3D structure.
    Frames are taken one at a time first (*Take frames*).
- **Properties.** Both entries' properties are kept, the geometry entry's
  where both have one of the same name, each as what it says it is of
  (`Property`, `src/lib/entry.ts`):
  - a value of a geometry (`at`) still says the geometry it was worked out
    at;
  - a label (a Tag's ID, which says it is one) rides as it is;
  - restraints (`restraints`) are the bonding entry's alone: they hold its
    bonds, its coordination bonds and the torsions across its double bonds,
    and the entry is bonded as it is. The geometry entry's, of the bonding
    it had, are dropped, and this is said. A reactant conformer's own
    restraints from its search never stand in for the product's;
  - a value of a structure (`of`, a descriptor's molar mass) whose structure
    is not the new entry's is kept, marked not applicable ("worked out on the
    structure before Re-bond"), and said - never shown as current
    (`src/lib/steps/restructure.ts`). A structure is known by its atoms and
    bonds, however numbered (`structureKey`);
  - any other - one that says none of these: not the geometry, not the
    structure it was worked out on, nor that it is a label - is not known
    to be of the new entry's structure. It is kept, marked not applicable
    ("not known to be of the structure after Re-bond"), and said, as one of
    another structure is: what is not known to stand is never shown as
    standing. A name (the compound's) is such a value, and the new entry
    has none. Where each entry stood in its set and how it ended (its
    number, its state) are not values of it, and are not marked: Meno gives
    the new entry its own.
- **Group and lineage.** The group is *a → b*: the geometry entry's group,
  then the bonding entry's (each entry's own id where it has none). Both
  entries are its lineage.

Checked: a Diels-Alder reactant re-bonded to its product. The product's
bonds come in in the reactants' numbering, and the two new ring bonds stand
long in the reactant's geometry. The product as drawn, not renumbered, is
refused at its first atom.

## Compare bonding

Whether an entry's geometry is bonded as a reference is, the two holding the
same atoms in one numbering (`comparedBonding`); or, against several
references, the first it is bonded as (`matchingReference`).

- **As a step.** It takes *Molecules* and *Reference*. *Against* is either:
  - *Each reference*: the first one an entry is bonded as is written on it,
    under the name given (*The match as*, `matches` by default). What is
    written is that reference's value of a property, where one is chosen,
    else its number among them, from 1 ("reference 2"). Where it matches
    none, "none" is written.
  - *Matched on* a property: each entry is compared with the one reference
    that has its value.

  Entries bonded as their reference go out of *Same*. The others go out of
  *Different*, each with `bonding` written on it: its differences (against
  its one reference, or "bonded as none of the 3 references"), or why it
  was not compared (another numbering, frames, nothing to pair with). Its
  line counts them apart: "12 same · 3 different · 1 not compared".
  *Pass over atoms* are typed from 1 on the card.

- **Bonds read from the geometry** as Meno reads any geometry given no bonds
  (`bondedPairs`): two atoms closer than their single-bond covalent radii
  (Pyykkö's) together, times the reach. The reach is on the card
  (*Bonded within*): 1.2 unless set, the maintainer's of 2026-10-22,
  measured over 1,437 molecules laid out by ETKDG and MMFF (1.1 missed 12
  bonds, 9 of them peroxides' O-O; 1.2 missed 1 and made none extra:
  `BOND_REACH`, `src/utils/structureParsers.ts`). It is at least a floor
  over their radii together, on the card too (*At least the sum plus, Å*): 0.15 Å unless set, the maintainer's of 2026-10-13, for H2's
  0.741 Å bond (`REACH_FLOOR`), as for every geometry Meno reads. Each
  difference says whether the reach or the floor decided. The reach is
  taken from 1 to 2, the floor from 0 to 1 Å; outside them the step
  refuses. Which atoms are bonded is compared, not bond orders.
- **R or S, where asked.** Because the two share one numbering, a centre has
  the reference's configuration where its neighbours stand round it the same
  way: the sign of the volume its first three neighbours (by number) make
  about it, here and in the reference. With the same bonds, the same sign
  is the same R or S. A stereocentre is a reference atom with four
  neighbours, no two in one symmetry orbit (`symmetryOrbits`). So a
  methylene's two hydrogens swapped are no difference. Three-coordinate
  centres (amines, phosphines, sulfoxides) are not compared.
- **E or Z, where asked.** A double bond is cis or trans as the first
  neighbours (by number) at its two ends stand: the dihedral between them
  under or over 90 degrees. Each end must have one other neighbour, or two
  that are not alike.
- **Every centre by its atoms' numbers, where asked** (`numberedCentres`):
  ConfoTS's check of a structure against its reference, which reads each
  centre by its atoms' numbers rather than by what they are (its
  `check_chirality`, by ACCeL's `calc_stereo` labels by number). So it also
  sees what R or S and E or Z cannot: a methylene's two hydrogens, or a
  =CH2's, the other way round from where the reference's numbering has
  them. Read on the reference's bonds, at:
  - **every atom of four neighbours**: whether the volume its three
    highest-numbered neighbours make about its lowest-numbered is positive;
  - **every atom of three with one double bond** (not an aromatic ring's)
    and a single bond, where the atom across the double bond has two single
    bonds: whether its highest-numbered neighbour by a single bond and that
    atom's stand across the double bond from each other, their dihedral
    past 90 degrees. Read at both its ends, a double bond is read the same
    four atoms each time, so a difference there is said once, for the
    double bond.

  As there, not at an end whose partner has one single bond (an imine's
  carbon), an atom of two, or an allene's ends. A centre R or S, or E or Z,
  already compares - the same reading by number, at the centres that have
  an R or S, an E or Z - is not said again. One difference from ConfoTS's:
  an aromatic ring is one to Meno where its bonds alternate (lib/chem/identity
  `aromaticForm`), where ACCeL counts 4n + 2 electrons. A pyrrole's ring
  ends are read here and a cyclooctatetraene's are not, the other way round
  there; a ring holds each of them in place, so neither can differ between
  two geometries of one structure.
- **Passed over:** atoms (from 0, as the entry numbers them), elements and
  bonds the chemist lists, such as a metal's coordination, in both the
  bonds and the configurations.
- **Every difference is said:** which bond, how far apart its atoms stand,
  and against what distance; which centre; which double bond. An entry with
  frames, entries in different numberings, or configurations asked of a
  reference with no 3D places are refused, with the reason.

Checked:
- A Diels-Alder reactant against its product lacks exactly the two ring
  bonds formed. The product's geometry is bonded as the product.
- CHFClBr and its mirror image differ where R or S is asked; CH2FCl with
  its hydrogens swapped does not.
- Two stereoisomers of CHFCl-CHFBr that differ at C2 alone differ at C2,
  and C1 is not named.
- H2O2 (O-O 1.475 Å) is bonded as itself at the reach of 1.2, and at 1.1
  its O-O is read as no bond, the floor saying it decided.
- cis- and trans-2-butene differ where E or Z is asked.
- Every centre by its atoms' numbers, against ConfoTS's own check: on 13
  pairs of geometries of synthetic molecules in one numbering, ACCeL's
  `calc_stereo` labels, read as `check_chirality` reads them, flag the same
  atoms as this step (src/lib/steps/testdata/numbered-centres.json). The
  pairs are butane with a CH2's hydrogens swapped, a methyl turned and
  another conformer; propene and buta-1,3-diene with a =CH2 turned over
  (both ends of its double bond flagged), and another conformer of the
  diene; 2-methylbut-2-ene with a methyl turned; (S)-butan-2-ol mirrored
  (every atom of four flagged) and another conformer; an allene and an
  imine with a CH2's hydrogens swapped (none flagged); and toluene, another
  conformer and mirrored. A conformer embedded anew can flag a methyl: its
  three hydrogens, numbered as they came, can stand the other way round.
- CH2Cl2 with its hydrogens swapped is the same where R or S is asked, and
  differs by its atoms' numbers.

## Restraints

A table of restraints, a row for each, made of each entry from itself
(`restraintRows`, `restraintsTable`): the rows of the entry record's
`Restraint`, each held by the energy the record states (`src/lib/entry.ts`):
a distance by E = k d²/2, k in kcal mol⁻¹ Å⁻²; atoms fixed with neither
value nor strength. The entries are not passed on: a step that holds
restraints takes the table in its *Restraints* input (WORKFLOWS.md,
*Restraints wired in*), so the chemist reads exactly what will be held.

- **The table's columns**, the restraint first: *Kind* (distance, torsion,
  atoms fixed); *Atoms*, from 1; *Target*, a number, in Å for a distance and
  in ° for a torsion, each in a column of its unit; *Strength* - the number
  with its unit (kcal/mol/Å², kcal/mol/rad²), "exact" for a row held
  exactly (said, never read from a blank), or "fixed where they stand";
  *Why* - "coordination bond in contact, 0.9 × vdW (Alvarez)", "typed: kept
  at its distance here". Then *For* and *Matched on* - the value, and the
  name, of the property the row's entry has (an ID a step wrote, a Tag's,
  named on the card: no default); and *Numbering* - *its own*, or the maps
  *Atom map* numbered it anew by (the label `numbering` it writes on each
  entry it renumbers). A table read from a file with these columns reads alike; one row
  that does not read refuses the whole table, the row named.

- **Coordination bonds**, the bonds the entry marks as such, are kept at a
  factor of their atoms' van der Waals radii together. The radii are
  Alvarez's (`elements.ts`; S. Alvarez, Dalton Trans. 2013, 42, 8617,
  doi:10.1039/c3dt50599e), named on the card.
- **Listed pairs of atoms** are kept at their distance in the entry, and
  **listed atoms** are fixed where they stand. Both are typed from 1.
- **The factor has no default; the strength has a measured one.** The
  factor is the chemist's: the card says "Set the factor" until it is
  typed, as no source gives one. The strength is 500 kcal mol⁻¹ Å⁻² unless
  set (`DISTANCE_STRENGTH`), and each can be changed. Measured on eight
  acid–base pairs held at 0.9 of their radii together (H3N…BH3, Me3N…BF3,
  H2O…BF3, Et2O…BF3, pyridine…BH3, Me2O…AlCl3, Me3P…BH3, Me2CO…BF3; ten
  conformers each, the RDKit plugin's search), the distance held came
  within 0.18 Å of its value at 10, 0.04 at 100, 0.02 at 239 and 0.01 at
  500: the default holds within 0.01 Å. Minimised by xtb 6.7.1 instead
  (each pair from its first conformer at 500; xtb's own distance
  restraint, whose energy is k d² in hartree per bohr², so its force
  constant is the record's k halved and converted: k / 2 / 627.509474 ×
  0.529177², 0.1116 for 500),
  the largest miss at 10, 100, 239 and 500 was 0.39, 0.03, 0.013 and
  0.007 Å under GFN-FF, and 1.43, 0.096, 0.038 and 0.018 Å under GFN2-xTB -
  at 10 most of the pairs fall into their dative bond, and at 500 all but
  Me2O…AlCl3 hold within 0.009 Å: the default holds within 0.01 Å under
  GFN-FF and within 0.02 Å under GFN2-xTB
  (`scripts/calc/measure_restraint_strengths.py` measures each again).
  Case F's workflow sets 0.9:
  0.9 of the van der Waals radii together holds an acid and a base in
  contact, about twice a bond's length (H3N→BH3: 3.21 Å; its B–N bond is
  about 1.6 Å).
- **In contact, not bonded**: 0.9 × the van der Waals radii holds a Lewis
  pair in contact, about twice a bond's length; a metal's dative bond is
  far shorter (Cu–N: 3.636 Å so held, about 1.83 Å by Pyykkö's single-bond
  radii). The why says "in contact", so a bonded complex is never pulled
  apart unseen: for a metal–ligand bond, type the distance.
- **Refused, with the reason** (out of *Failed*): an entry without the
  property its rows are for, or whose value another entry has too; an atom
  the entry does not have, an element Alvarez gives no radius for, or an
  entry with no 3D places or with frames.
- **Its line** counts what it made: "12 rows for 12 entries · 3 coordination
  bonds held". Coordination bonds asked and none marked are said ("no
  coordination bonds"), not passed over, and so are entries it made no row
  for ("2 entries with none to hold").

Checked: H3N→BH3's B–N coordination bond kept at 0.9 × (1.91 + 1.66) Å,
and Cu–N at 0.9 × (2.38 + 1.66) = 3.636 Å, from Alvarez's published radii; a 3-4-5 triangle's 5 Å; an atom the entry
lacks, an element with no radius, and no strength each refused in words.

## Torsion restraints

A table of torsion restraints, a row for each, as *Restraints* gives one
(*Restraints*, above): each row for its entry by the ID named, in the
numbering it has, held by a step's *Restraints* input (WORKFLOWS.md,
*Restraints wired in*). It makes rows and judges nothing: which torsions
are unlike a reference is *Compare torsions*' to count, and a Filter's to
split on.

- **Typed** (`torsionRowsTyped`): torsions four atoms to a line, from 1,
  each four different atoms, held at the angle typed (°, taken into
  (−180°, 180°]: −180 is written 180). The angle has no default: it is the
  chemist's. A torsion with no angle to hold refuses the entry: one whose
  second or third atom is linear by its bonds - a triple bond on it, or two
  double bonds (an alkyne's, a nitrile's carbon, a cumulene's centre, CO2's
  C, an azide's central N: sp, linear by VSEPR), however little bent it
  stands (the torsion is the angle between planes 1-2-3 and 2-3-4, Moss
  1996); and, Meno's numerical guard for anything else, three of its atoms
  within 1° of a straight line (`LINE_WITHIN`: an end atom moved 0.01 Å at
  1.5 Å and 1° turns the torsion by about 22°, no plane worth holding).
- **From the reference** (`torsionRowsFromReference`), its optional
  *Reference* input wired - against the one reference, or the one with the
  same value of a property: rows only for the torsions unlike here, as
  *Compare torsions* counts them -
  - *180° where trans*: each torsion trans in the reference and cis here,
    held at 180°, the torsion of a trans pair across a planar double bond.
    A double bond with no trans torsion in its reference ((Z)-azobenzene's
    N=N) cannot be held so: the line counts the entries with one, "choose
    Held at: the reference's own angle";
  - *the reference's own angle*: each torsion unlike here, held at the
    reference's angle.
- **Held** by a strength, by E = k φ²/2 (φ in radians, the shorter way
  round, k in kcal mol⁻¹ rad⁻²) - one value for every row; or exactly, said
  in the row ("exact"), for a program that constrains. Rounds of stronger
  strengths are drawn rounds, each its own strength typed: every round's
  table wired into the round after's *Minimise*, so a torsion once held
  stays held - the later round's row held where two hold one torsion.
- **The strength's default, measured**: 50 kcal mol⁻¹ rad⁻² unless set
  (`TORSION_STEP`). On six Z isomers held towards their E isomers
  (but-2-ene, pent-2-ene, stilbene, methyl crotonate, hexa-2,4-diene E,Z
  to E,E, crotononitrile; the RDKit plugin's minimisation, each round from
  the original start), 10 took up to four rounds and 25 up to two. At 50
  each was right in one round and held within 1.5°
  (`scripts/calc/measure_restraint_strengths.py` measures it again). It is
  Meno's own number, with its own basis.
- **Refused** (out of *Failed*, saying why): an entry without the ID, or
  whose ID another has too; one with no reference to pair with, of another
  numbering, or with no 3D places; three atoms on a line. A step whose
  torsions are typed with a reference wired, or from the reference with
  none wired, is refused as a whole.

Checked: four atoms at 180° by 50 give one row, exactly an exact row, and
−180° is written 180°; but-2-yne's C1-C2≡C3-C4 is refused, bent to 178.5°
too, and propyne's H-C1-C2≡C3; (Z)- against
(E)-but-2-ene at 180° where trans gives rows for its two unlike torsions
alone, and (E)-azobenzene against (Z) none, said, but one at the reference's
own angle.

## Compare torsions

Each entry against its reference, in one numbering - the one of
*Reference*, or the one with the same value of a property - its torsions
across the reference's double bonds that are unlike here (`torsionsUnlike`),
written on it: `torsions unlike reference`, how many, and `torsions unlike`,
which ("C1-C2=C3-C4: 3.2° (reference 179.8°)", or "none"), for a *Filter*
to split on (the maintainer, 2026-10-27: Meno writes the count, the chemist
filters). Every entry passes on; one it cannot set against a reference out
of *Failed*, saying why.

- **Which** (`doubleBonds`): each bond of order 2 that is not aromatic as
  Meno reads aromaticity (`aromaticForm`); its torsions each pair of the
  ends' neighbours by single bonds, hydrogens among them - an end of one
  neighbour (an imine's N-H, an oxime's N-O) too.
- **Unlike**: each torsion trans in the reference and cis here - the
  protocol's own count (ConfoTS, step 1). A double bond with no trans
  torsion in the reference (each end one neighbour, cis: (Z)-azobenzene) is
  checked by its cis torsion instead - unlike where it is trans here -
  never passed over, and the line says how many entries were.
- **Trans and cis**: a torsion more than 90° either way is trans (anti), at
  90° and within cis (syn), φ in (−180°, 180°]: Klyne and Prelog's division
  (W. Klyne, V. Prelog, Experientia 1960, 16, 521; G. P. Moss, Pure Appl.
  Chem. 1996, 68, 2193), the boundary Compare bonding's E or Z uses too. It
  judges the side alone: 95° against 180° is alike. Each torsion of a
  planar double bond flips with the others, so counting every torsion on
  the other side of 90° would count one bond up to four times: it is not
  done.

Checked: (E)- and (Z)-but-2-ene, with their hydrogens: Me-Me and H-H are
the E isomer's trans torsions, the two Me-H torsions the Z's; Z against E
counts 2. Flat cyclobutene's two ring C-C=C-H torsions are trans, its ring's
own and its H-C=C-H cis. Benzene's bonds are aromatic: none. 90.0° is cis,
90.1° and −179.9° trans; 95° against 180° counts 0; (E)- against
(Z)-azobenzene counts 1.

## Atom map

Each entry mapped onto a reference, atom for atom and every hydrogen too,
and written in the reference's numbering (`mapOnto`,
`lib/chem/reactionMap.ts`; docs/ATOM-MAPPING.md, *For a workflow's Atom
map step*): a reaction's products onto its reactants, so that both ends of
a path search, a QST3's sides and an IRC's ends are in one numbering; or a
species' conformers onto the species, so that atom 7 is the same atom, on
the same side, in every conformer (as ConfoTS's `map_numbers` settles its
conformers, case F, F2).

- **As a step.** It takes *Molecules* and *Reference*, molecules in 3D
  with every hydrogen: a structure drawn is given its 3D structure first.
  On the card, none of these has a default, as none has a basis; the card
  asks for each until it is chosen:
  - *Molecules* and *Reference*: *Each its own*, every entry a side of its
    own; or *One side together*, all of that input's entries one side, set
    side by side as one as `mapReaction` sets several structures. So A + B
    to C needs no *Combine*: its reference is *One side together*. A + B to
    C + D has both inputs together.
  - *Bonds*: *May change (a reaction)*, or *Stay the same (conformers)* -
    an entry whose map forms, breaks or changes any bond is then not
    mapped, the bonds said.

  *Against* is *The one reference* (the default), or *Matched on* a
  property - a Tag's *species* - with both inputs each their own. *Maps* is
  *First map* (the default) or *Every map*.
- **Mapped.** Each entry the same entry renumbered (`renumberedEntry`,
  `src/lib/steps/reaction.ts`): its atoms where they stand in it, in the
  order of the reference atoms they map to, its bonds with them. What names
  atoms by number is renumbered too: a list per atom, a vibration's modes,
  restraints, its stereo elements. A value worked out at its geometry
  still names that geometry, in the new order. An entry keeps its place in
  its set - its compound and its number - and with every map, each entry
  is a compound of its own, its maps numbered from 1. A side of several
  entries comes out as one entry, in the places the map set them in, with
  none of its parts' own values.
- **Bond changes**, a table (`bondChangesTable`): a row a bond each map
  forms, breaks or changes in order - `map.entry`, naming the mapped entry
  (its name or place, the names of a side's entries joined with " + ", with
  its place too where two share a name, and its map where every map is
  given; the mapped entry carries the same as its property `map.entry`, a
  name of Meno's own: one an entry carried already is replaced, and the
  line says so), *Map* where an entry has several, what changed, its two
  atoms and their elements, and its order before and after, 0 where there
  is none. A bond of an aromatic ring on both sides is no change, whichever
  Kekulé structure each is drawn in (docs/ATOM-MAPPING.md). The two atom
  columns count from 1, as a card and the 3D view do, and say so (`atoms:
  "from 1"`): a step that takes atoms from the table reads them by that,
  never by assumption (*Measure*). A conformer mapped onto its species has
  no rows.
- **State.** An entry not finished - failed, or its marks not read - is
  set aside as not finished, never passed on as one that is. An entry
  renumbered keeps its energy and its imaginary frequencies, which are of
  its geometry however it is numbered, and its thermochemistry and
  vibrations as properties of its own, renumbered with it. It keeps what
  its energy is of: the calculation's program, version, method, basis,
  solvation, charge and spin, and how it was made (a conformer search's
  method and force field). Where a run ended converged at its geometry,
  so it still is: the same places, numbered otherwise. The atoms the
  calculation held (and the run that converged, where it held any), the
  drawing's atom each atom is, and its stereo labels are renumbered with
  it. So a
  compound's conformers, some renumbered and some not, are still of one
  calculation, their energies in one list, and an *Energy window* after
  the step runs on them. The calculation's results follow it: a value of
  the molecule or of each frame as it was, each atom's value at its atom,
  a pair's atoms as numbered now, and a list of values alone. A list whose
  rows name atoms, move them or promise a value (asked of its plugin in the
  old numbering), and the output and wavefunction the results were read
  from, number its atoms as they were: they are not carried, and the
  step's line says so ("part of its calculation not carried"). One
  numbered as it was keeps all it held.
- **Nothing in part.** An entry with no hydrogens, with no reference to
  pair with, or one whose atoms do not all map one to one, goes out of *Not
  mapped* with why written on it (`set_aside`). Not one reference where it
  is against the one, or a reference with no hydrogens, is refused.
- **Off the page's thread.** Mapping an entry can take seconds (a 60-atom
  conformer, a few); the step maps in a worker of its own, its card saying
  how many are done, and stops with the step.

Checked: the Diels-Alder of the mapping tests, as a step and laid out on
the page - the product in the reactants' numbering, every atom where it
stands in the product, and six bond changes (two formed, four orders
changed); two reference entries refused; a product of other atoms, a
skeleton and a product not finished set aside, each saying why; with bonds
to stay the same, the product set aside, its bonds named. Propene's
conformer with its =CH2 hydrogens each in the other's place, mapped onto
propene: the reference's places, atom for atom, no rows. The SN2's
products, CH3Cl and Br-, as one side: one entry, a bond formed and one
broken. End to end on the page, its bond changes into *Measure*: the bond
it forms, C1 to C5, measured on the mapped product as long as it is in the
product as drawn.

## Displace

Each entry's geometry moved along a vibration (`displacedEntry`,
`src/lib/steps/vibrations.ts`): case F's way back from a structure that
has the wrong number of imaginary vibrations - moved along one, then
optimised again.

- **As a step.** *Along* is *The imaginary vibration* - the one of negative
  frequency; of several, the most negative, said on the line - or *A
  vibration by number*, from 1 in the order of its calculation's table.
  *Amplitude* is in ångströms. Its sign is along the mode as the program
  wrote it, negative against it: a mode's direction is the program's
  choice, not the chemistry's, so to go both ways from a saddle point,
  take two Displace steps, one of each sign. It has no default (0, which
  moves nothing, until one is given): no value is right for every system,
  and none is given without a stated basis.
- **How far.** The atom the vibration moves most moves exactly the
  amplitude, every other atom in proportion. Nothing depends on how the
  program scaled its modes.
- **What it carries.** Its properties ride along, each saying the geometry
  it was worked out at. Its energy and calculation, of the old geometry,
  are not its own any more.
- **Nothing in part.** An entry not finished - its calculation failed, or
  did not converge - goes out of *Not displaced* as not finished: its
  vibrations are no ground to move it on. So does one with no vibrations,
  no imaginary one where that is asked, or no vibration of the number
  asked, with why written on it (`set_aside`). A conformer set's line
  counts frames.

Checked: the atom moving most moved by the amplitude, the others in
proportion, either way; the same move however the mode is scaled; O-H-O
moved along its proton transfer, and along a bend chosen by number; an
entry with no imaginary vibration, or no vibrations, set aside with why.

## Mode on atoms

Where a saddle point's imaginary vibration puts the atoms a reaction
changes (`modeOnAtomsEntry`, `src/lib/steps/modeOnAtoms.ts`): case F's
check, without an IRC, that a saddle point is the one for its reaction
(F28, F40). Meno judges nothing here: every entry is kept, and what is
written on it is for a *Filter* to choose on.

- **As a step.** It takes molecules in 3D with vibrations, and, where
  wanted, *Atoms*: a table. *Atoms* is *From the table* - each row's atoms,
  read as its columns count them (`atomsOfRows`): the rows of bonds formed
  or broken (an Atom map's *Change*; an order changed is no reacting bond),
  or every row - on every entry, or *Rows matched on* a property, as
  *Measure* matches them; or *Typed*, from 1. *Reach* is a whole number
  from 0, with no default: none is right for every system, and none is
  given without a stated basis.
- **The vibration.** The lowest: an imaginary one, the most negative of
  several, said on the line.
- **Ranks.** Every atom ranked by how far the vibration moves it - the
  length of its Cartesian displacement as the program gives it, not
  mass-weighted, so its scale makes no difference - the one moving most
  first, atoms moving alike in the order of their numbers.
- **Whose vectors are displacements.** Ranks of mass-weighted normal
  coordinates could differ, a hydrogen against a heavy atom. A vibration's
  vectors are read as Meno's general form has them, each atom's Cartesian
  displacement (`move`, src/lib/calc/results.ts `Row`); a reader of a
  program whose vectors are another kind is to give them so. The
  window and the allowance stay the chemist's either way.
- **Written on each entry**, each naming the vibration it is of (`by`):
  - `mode.window`: the reacting atoms' count and the reach more ranks;
  - `mode.ranks`: each reacting atom by its element and number, with its
    rank ("C1 1, C4 2, C11 3");
  - `mode.outside`: how many reacting atoms rank outside the window.

  Where it cannot be worked out - no vibrations, no imaginary one, an atom
  the entry has not - each is written failed, with why; the entry is kept.
  These names are Meno's own: values an entry carried under them are
  replaced, and the line says so.
- **Its use.** A check such as ConfoTS's - the reacting atoms within the
  first N + 1 ranks, at most one outside - is a Reach of 1 and a *Filter*
  on `mode.outside` of at most 1. Those numbers are the protocol's, set on
  the cards: Meno sets neither.
- **Ranks are each atom's.** A strongly asynchronous saddle point - one
  bond well formed, the other still long - can put both atoms of its long
  bond outside a tight window while those of the other rank first. How
  many may fall outside is the chemist's allowance, set on the *Filter*
  (ConfoTS's acceptable invalid atoms), not a judgement Mode on atoms
  makes.
- **Where it goes.** As ConfoTS places its check: after a saddle point's
  frequencies at the higher level (DFT), or in place of an IRC at the
  lower (xTB), where no IRC is run there.

Checked: ranks by hand, however the mode is scaled; the window and those
outside it, with a reach of 0 to 2; O-H-O's proton transfer; the most
negative of two imaginary vibrations taken and said; each failure written
with why. End to end on the page: an Atom map's bond changes into Mode on
atoms, two saddle points of the Diels-Alder in the reactants' numbering -
one whose vibration moves the four carbons of the bonds formed most (none
outside a window of 5), one whose moves the hydrogens (all four outside).

## Numbering

Atoms in the entry record are numbered from 0, as its bonds are: every
atom a step takes or gives as data (a measurement's atoms, atoms passed
over, a restraint's) is from 0. What is said to a chemist (a property's
name, a reason) numbers them from 1, as a card shows them. A table's
column of atoms says how it counts them (`TableColumn.atoms`): a
Atom map's bond changes count from 1, as the table is shown, and every
step that takes atoms from a table reads them through `atomsOfRows`,
which refuses a column that does not say.
