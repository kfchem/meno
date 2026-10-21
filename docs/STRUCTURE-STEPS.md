# Meno's structure steps

The workflow steps on structures that Meno does itself
(docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures). Each does
one thing, works on Meno's entry record (`src/lib/entry.ts`) and lives in
`src/lib/steps`, pure, with no page and no plugin. Their cards follow the
ports-and-exits work. Each is tested against answers known by construction,
not only against its own code (`src/lib/steps/structures.test.ts`).

## Species

Each entry the same, its charge and multiplicity set as given (`withSpecies`).

- **One rule.** The charge and multiplicity go through Meno's one rule for a
  molecule's species (`speciesOf`, `src/lib/io/writers.ts`). Each part given
  is said to be given. What is not given stays as the entry had it.
- **A multiplicity follows the charge in use.** Where a charge is given and a
  multiplicity is not, the multiplicity is the one the electrons take at
  that charge. Na given +1 has ten electrons, a singlet.
- **What the electrons cannot have fails.** A molecule has its atoms' atomic
  numbers less its charge in electrons, and a multiplicity *m* leaves
  *m* - 1 of them unpaired. So the rest, paired, must be an even number,
  and there can be no fewer electrons than unpaired ones
  (`speciesProblem`). An entry given a charge and multiplicity its electrons
  cannot have fails, with the reason. Nothing is changed to fit.

  Checked: water, a singlet, not a doublet; OH, a doublet, not a singlet;
  OH⁻, a singlet; O₂, a triplet; H⁺, a singlet with no electrons.

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
  is the chemist's to set (*Species*).
- **Properties.** No part's properties are carried: each was worked out on
  its part alone, not on the complex. Where any part had properties, this
  is said. The parts' ids stay as the complex's lineage.

## Measure

Each entry the same, with a property for each measurement asked for
(`measured`): the distance between two atoms, the angle at the middle of
three, or the dihedral of four. Atoms are numbered from 1 in the entry's
numbering. A measurement is named for what it is and its atoms: `distance
3-7`, `angle 1-2-3`, `dihedral 1-2-3-4`.

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
    radicals and isotopes, its bonds, and its charge and multiplicity.
  - The geometry is the geometry entry's, as it is: one 3D structure.
    Frames are taken one at a time first (*Take frames*).
- **Properties.** Both entries' properties are kept, the geometry entry's
  where both have one of the same name, and each still says the geometry
  it was worked out at.
- **Group and lineage.** The group is *a → b*: the geometry entry's group,
  then the bonding entry's (each entry's own id where it has none). Both
  entries are its lineage.

Checked: a Diels-Alder reactant re-bonded to its product. The product's
bonds come in in the reactants' numbering, and the two new ring bonds stand
long in the reactant's geometry. The product as drawn, not renumbered, is
refused at its first atom.
