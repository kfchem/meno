# Meno's structure steps

The workflow steps on structures that Meno does itself
(docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures). Each does
one thing, works on Meno's entry record (`src/lib/entry.ts`) and lives in
`src/lib/steps`, pure, with no page and no plugin. *Tag*, *Species*,
*Combine* and *Measure* are steps of a workflow (docs/WORKFLOWS.md, *Kinds of
step*; `workflow/structureSteps.ts`): each runs on a set's entries read as
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

## Re-bond

One entry's geometry with another's bonds and charges (`rebonded`): for
example, a conformer of the reactant given the product's bonding, as the
start of a restrained minimisation towards the product.

- **One numbering.** The two must hold the same atoms in one numbering, atom
  by atom; a *Reaction* step writes its products in the reactants'. Where
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
  - a label (a Tag's ID, restraints) rides as it is;
  - a value of a structure (`of`, a descriptor's molar mass) whose structure
    is not the new entry's is kept, marked not applicable ("worked out on the
    structure before Re-bond"), and said - never shown as current
    (`src/lib/steps/restructure.ts`). A structure is known by its atoms and
    bonds, however numbered (`structureKey`).
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

- **Bonds read from the geometry** as Meno reads any geometry given no bonds
  (`bondedPairs`): two atoms closer than their single-bond covalent radii
  (Pyykkö's) together and a fifth over. Which atoms are bonded is compared,
  not bond orders.
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
- cis- and trans-2-butene differ where E or Z is asked.

## Numbering

Atoms in the entry record are numbered from 0, as its bonds are: every
atom a step takes or gives as data (a measurement's atoms, atoms passed
over, a bond change's atoms, a restraint's) is from 0. What is said to a
chemist (a property's name, a reason) numbers them from 1, as a card shows
them.
