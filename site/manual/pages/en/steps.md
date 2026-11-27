# The steps

Each step a workflow can hold: what it takes in, what it gives, and the options on its card, in the groups Meno lists them in. How steps are wired, run and repeated is on the [Workflows](workflows) page.

## Where they are {#finding}

Double-click empty space and choose *Calculations*. There is a row for Meno, then a row for each plugin you added that offers steps, each with how many steps it offers. Open a row to see its steps; Meno's is open the first time. Thin lines split them into four groups, in this order: steps that make, sort and match structures; energies and what is worked out from them; paths and measures; charts and pictures. This page follows the same groups.

- Meno's row is there from the start. The steps that run a program are under the plugin that runs it ([Plugins](plugins#adding)).
- Let a wire go on empty space, and only the steps that take what it carries are offered ([Workflows](workflows#adding)).
- A step put down while it still needs a value of its options opens its card at once; any other, click its card to open its options. At the top, *Calculation* changes the step to another one the same row offers. A step with nothing to set says *No options*.
- A card says *No input* until something is wired into it, then *Ready*. Where a step still needs something before it can run, its card says what in place of *Ready*: "Give the window, in kcal/mol", "Name the property to rank by".
- Most steps have a second exit for what they set aside, such as *The rest*, *Alike* or *Failed*. Each entry there says why, so nothing is dropped unseen ([Workflows](workflows#results)).

Several steps match entries of two inputs, or group entries, by a property they carry. A *Tag* step gives each entry such a property, and it stays with every entry made from it.

## Making, sorting and matching structures {#structures}

### Choosing what goes on {#choosing}

- *Duplicates* takes molecules in 3D, conformer sets, or structures drawn. It keeps one of each and passes the rest out of *Alike*. For molecules in 3D, two are alike when all their atoms, hydrogens included, lie within 0.01 Å of each other, laid over by turning and moving only, so a conformer and its mirror image stay two. Where every entry has an energy, the lowest of the alike ones is kept. Entries of different charge or spin are never alike. Options: *Mirror images* (*Kept apart*, or *Counted in (degeneracy 2)*), and *Compared within* (*Each compound*, or *Each value of a property*, with *The property*). For structures drawn, alike means the same atoms, bonds, charges and drawn configurations, however the drawing lies; the first is kept and each other one says "Same as" the one kept.
- *Filter* keeps the entries whose properties meet its *Conditions*, one to a line or separated by semicolons: a property, a comparison (< ≤ > ≥ = ≠, or <= >= != typed), and a value with its unit where it has one, such as `energy ≤ -76.4 Eh`. A value can be another property of the same entry, written `its` and its name. *Kept where* is *All are met* or *Any is met*. The rest go out of *The rest*, each saying which condition it did not meet. Values are compared after converting between units of the same kind.
- *Rank* puts entries in order by a value, *By* (energy unless you name another), *Lowest first* or *Highest first*, and keeps as many as *Keep the first* says. *Within* is *Each group* (each compound of a conformer set), *Each value of a property*, or *All together*. The rest go out of *The rest*, each with its place. Values worked out in different ways are not ranked together, and an entry that failed or did not converge is never ranked.
- *Choose one* takes a conformer set and gives one conformer of each compound: *Lowest in energy*, or *By its number* (*Its number*). The other conformers go out of *The rest*.

### Frames and conformers {#frames}

- *Take frames* takes molecules with frames (a path, an optimisation's way down, a scan) and gives the frames asked for as molecules of their own. *Take* is *The highest in energy*, *The first*, *The last*, *Its entry frame*, or *The highest, and either side*, with how many on *Either side*. *Keep from its molecule* names the properties, one to a line, that each frame takes from the molecule it comes from; empty, each frame keeps only its own.
- *As conformers* is not in the list: let a wire from a set of molecules in 3D go on empty space to find it. It gathers entries of the same constitution, charge, spin and stereoisomer into one conformer set, where their energies come from one calculation. Where they do not, it says why and makes none.

### Structures drawn {#drawn}

These take structures drawn, not molecules in 3D. *Check structures* and *Stereoisomers* need a chemistry plugin, as 3D structures do ([3D structures](3d#making)).

- *Check structures* never changes a structure: each is kept as drawn, out of *Checked*, or set aside, out of *Set aside*, saying why. Each check is an option, *Set aside* or *Keep*: *More than one part (a salt, a mixture)*, *An atom with more bonds than it can have* (*Keep as drawn*), *A part with no electrons (H+)*, and *Radicals*.
- *Stereoisomers* gives each structure that leaves a stereocentre or a double bond open as every stereoisomer of it that can be made in 3D, each a drawing. One with nothing open is passed as drawn. *Stereo left open* is *Every stereoisomer*, or *Set aside*. One with more stereoisomers than *At most* is set aside whole, never in part, and so is one that takes longer than *Time for one*, in seconds. An allene whose axis is left open is set aside.
- *Enumerate* makes structures from one drawing, wired into *Template*. *By* is *R groups* or *Substituents*. With *R groups*, the drawing carries R1, R2 and so on, and *R groups* lists each with its groups, as `R1: Me, Et`; every combination is made. With *Substituents*, *Choose on the drawing* picks the atoms for *Positions* (*Done* ends it), *Groups, one to a line* lists the groups, and *Combine* is *One at a time* or *Together*. What could not be made goes out of *Aside*, saying why.

### Labels, charge and complexes {#labels}

- *Tag* gives each entry an ID of its own under the *Name* you type. The ID follows the entry through every step after, so that a later step can match two inputs on it.
- *Species* sets each entry's *Charge* and *Multiplicity (blank: each entry's own)*. With a charge and no multiplicity, the multiplicity is the one its electrons take at that charge. An energy worked out for the old charge or spin is dropped, and the line says so. A charge and multiplicity the electrons cannot have, or an entry without its hydrogens, goes out of *Failed*.
- *Combine* makes the entries of a set, in the set's order, one entry: a complex, each part where it stands. The charges add. With two or more open-shell parts, it takes them high-spin and says so; set another with *Species*.

### Two inputs {#two-inputs}

Each of these takes two inputs, named on its card, and does not run until both are wired.

- *Merge* makes *First* and *Second* one set, First's entries then Second's. *Keep* is *All*, or *One of each* value of the property in *Of each*; the others go out of *The rest*.
- *Pass the side with fewer* passes First's set out of *First's* and Second's out of *Second's*, each whole or not at all. *Pass* is *The side with fewer, or both where alike*, *Both*, *First only*, or *Second only*. Left to choose, both pass where their entries per compound are within a quarter of their sum; else only the side with fewer.
- *Re-bond* gives each entry of *Geometry* the bonds and charges of an entry of *Bonding*, its places unchanged: a reactant's conformer given the product's bonding, for example. The two must hold the same atoms in one numbering (use *Atom map* first). *Pairs* is *Each with each* or *Matched on* a *Property*. What cannot be re-bonded goes out of *Not re-bonded*.
- *Join* puts properties of *From*'s entries onto *Onto*'s, each matched with the one entry of *From* that has the same value of the property in *Matched on*. *Put on* names what is put on, one to a line or separated by semicolons; `species as first end` puts it on under another name. An entry with no match, or more than one, goes out of *Not joined*.
- *Atom map* maps each entry of *Molecules* onto *Reference* atom for atom, hydrogens too, and numbers it as the reference: a reaction's products onto its reactants, or conformers onto their species. Both must be molecules in 3D with every hydrogen. *Molecules* and *Reference* are each *Each its own* or *One side together* (two reactants as one side, say); *Bonds* is *May change (a reaction)* or *Stay the same (conformers)*. These three have no default: the card asks until each is chosen. *Against* is *The one reference*, *In order*, or *Matched on* a *Property*; *Maps* is *First map* or *Every map*. A side is mapped only onto a reference of the same total charge. Out of *Mapped* come the renumbered entries, out of *Not mapped* those that do not map, and out of *Bond changes* a table of each bond formed, broken or changed.

### Restraints {#restraints}

*Restraints* and *Torsion restraints* give a table, a row for each restraint, not the molecules. Wire the table into the *Restraints* input of the step that is to hold them. Each row is for its molecule by an ID a *Tag* wrote: name it in *Each row for the molecule by its*.

- *Restraints* holds coordination bonds at a factor of their two atoms' van der Waals radii (*Coordination bonds*, with the factor in *Kept at*), pairs of atoms at the distance they have (*Pairs kept at their distance, atoms from 1 (3-7, 1-12)*), and atoms where they stand (*Atoms fixed, from 1 (1, 4-6)*). The card says "Set the factor" until you type one. *Strength of each distance, kcal/mol/Å²* sets how hard distances are held.
- *Torsion restraints* holds torsions. *Torsions* is *Typed*, four atoms to a line in *Four atoms to a line, from 1 (1-2-3-4)*, at the angle in *Held at, °*; or *From the reference*, wired into its *Reference* input: each torsion unlike the reference, *Held at* *180° where trans* or *The reference's own angle*, *Against* *The one reference* or *Matched on* a *Property*. *Each held* is *By a strength* (*Strength, kcal/mol/rad²*) or *Exactly*. A torsion with three of its atoms in a line is refused.
- *Compare torsions* counts, for each entry, the torsions across its reference's double bonds that are trans in the reference and cis in the entry, and writes how many and which on it, for a *Filter* after it. Trans is more than 90° either way. *Against* is *The one reference* or *Matched on* a *Property*. Every entry passes on; one it cannot compare goes out of *Failed*.

### Moving along a vibration {#displace}

*Displace* moves each geometry along a vibration, so that the atom that moves most moves by the *Amplitude (negative: against the mode as written)*, in Å. *Along* is *The imaginary vibration* or *A vibration by number* (*Vibration, from 1*). The card says "Give the amplitude" until you do. One with no such vibration goes out of *Not displaced*.

*Repeat*, the last of this group in Meno's row, is offered on empty space only. It puts down a frame that runs the steps inside it pass by pass ([Workflows](workflows)).

## Energies {#energies}

- *Energy window* takes a conformer set with energies, or molecules, and keeps those within *Within* kcal/mol of the lowest; the rest go out of *Outside it*. The field is empty until you type a value, with a guide under it. *From the lowest in* is *Each compound*, or *Each value of a property* (*The property*), such as a path or a product.
- *Populations* gives each conformer of a conformer set its Boltzmann population within its compound, at the temperature in *At*, in K.
- *3D results onto structures* puts what was found in 3D back onto the structures drawn it was made from. Wire the structures into *Structures* and the conformer sets into *3D results*. Each structure gets how many conformers it has in the set, its lowest energies, and its share among the structures of the same formula at the temperature in *Shares at*. No structure is set aside.
- *Barrier* writes on each saddle point its height, in kcal/mol, above its start. Wire *Saddle points* and *Starts*. *Of* is *Free energy G* or *Electronic energy E*; *G is* names the property that holds G. *Rotational symmetry* is *As each program read it*, or *Left out (σ = 1 on both sides)*. *Pairs* is *In order*, *Each with each*, or *Matched on* a *Property*. A saddle point must be a converged one with one imaginary frequency, and a start a converged optimisation; otherwise the saddle point goes out of *Failed*, saying why.
- *Number* takes nothing and gives one number. *Number* is *Standard state, 1 atm to 1 mol/L*, the free-energy term for that change at the temperature in *At*; or *Typed*, a *Value* and its *Unit*.
- *Add* sums the values named in *Add*, one to a line or separated by semicolons, and a number wired into its *Number* input if there is one, and writes the sum under the name in *As*: an energy, a correction to G from another level and the standard-state term, say. Each value must be of the entry's own geometry. An entry that failed or did not converge is not summed, and goes out of *Not added*.
- *Ensemble energy* works out each group's free energy over its members, each weighted by its Boltzmann factor and counted by its degeneracy, at the temperature their values state, and writes it on the group's lowest entry. *Of* names the free energy to take, *As* the name to write it under. *Within* is *Each group*, *Each value of a property*, or *All together*. The other members go out of *The rest*. Members whose values were worked out differently, or at different temperatures, set their group aside.

## Paths and measures {#paths}

- *Measure* writes distances, angles and dihedrals on each entry, as properties named like `distance 3-7`, `angle 1-2-3` and `dihedral 1-2-3-4`. *Atoms* is *Typed*, in *Atoms, from 1 (3-7, 1-2-3, 1-2-3-4)*; or *From the table*, a table wired into its *Atoms* input such as an *Atom map*'s *Bond changes*, with *Rows matched on (blank: every row)*. Distances are in Å, angles from 0 to 180°, dihedrals from -180 to 180°.
- *Mode on atoms* writes, for each entry with vibrations, where its lowest imaginary vibration ranks the atoms the reaction changes: atoms ranked by how far the vibration moves them. It keeps every entry; a *Filter* after it chooses. *Atoms* is *From the table* (*Rows*: *Bonds formed or broken* or *Every row*; *Rows matched on (blank: every row)*) or *Typed* (*Atoms, from 1 (1, 5, 11)*). *Reach: ranks past the atoms' count* has no default: type a whole number from 0.
- *Compare bonding* asks whether each entry of *Molecules* is bonded as its *Reference*, reading bonds from the geometry. Those that are come out of *Same*; the rest out of *Different*, each with its differences. *Against* is *Each reference*, the first match written on the entry under *The match as* (with *Its value of (blank: its number)*), or *Matched on* a *Property*. *R or S too*, *E or Z too* and *Every centre by number too* compare configurations as well. *Pass over atoms, from 1* and *Pass over elements* leave atoms out, such as a metal's. Two atoms are bonded where they are closer than their covalent radii together times *Bonded within*, or than that sum plus *At least the sum plus, Å*, whichever is larger. Which atoms are bonded is compared, not bond orders.

## Charts {#charts}

- *Chart* draws a chart from a table, from molecules or from structures drawn, each seen as a table. *Across* and *Up* name the columns; blank, it takes the first two columns of numbers.
- *Energy diagram* draws each level, at its lowest energy, relative to one level. Wire the molecules or conformer sets into *Levels*, and, if you want, a table into *Connects* saying which level joins which; without one, each level joins the next. *Energy* names the energy, *Levels, in order* the levels ("Rename one by writing = and the name after it"), *Relative to* the level at zero. *Levels by* and *Joined by* name the properties that say each entry's level and what it joins. *Conformers* is *The lowest* or *Every one*.

## Steps a plugin runs {#plugins}

These steps run a program, and are offered under the plugin that runs it, by these names. Their options are the plugin's own, on their cards. Most have a *Failed* exit for what the program could not do. How their jobs run, and how to watch and stop them, is on the page [Calculations and their programs](calculations).

- *Generate* takes nothing in and gives structures drawn from a model's output.
- *Conformers* takes structures drawn or molecules in 3D into *Structures*, and gives a conformer set: every conformer the program gives, with no energy window: that is *Energy window*'s to do. Where the search is told how many to try, *Conformers sought* is *As many as the molecule needs* or *This many* (*How many*). Asked for as many as it needs, it searches in rounds until one brings no new conformer within *New conformers within*, a field that is empty until you type a value, with a guide under it.
- *Descriptors* gives each structure drawn numbers worked out from it, such as its molecular weight.
- *Optimise* gives each molecule optimised, its way down as frames. *Minimise with restraints* minimises each in a force field, holding the restraints wired in. *Energy* gives each its energy at its own geometry. *Frequencies* gives each its vibrations and thermal corrections.
- *Path search* takes *Start* and *End*, the same atoms in one numbering, and gives one molecule for each pair: its frames the path, its entry the highest point, refined. *Pairs* is *In order*, *Each with each* (at most *At most, pairs*), or *Matched on* a *Property*.
- *Optimise to a saddle point* optimises each of its *Guesses* towards a saddle point, with *Reactant side* and *Product side* wired both or neither.
- *Follow the reaction path* follows the path down both ways from each point given, such as a saddle point.
- *NCI* gives each molecule a surface coloured by its non-covalent interactions.
- *Render* gives a picture of each molecule ([Pictures and films](pictures)).

Steps that take a *Restraints* input hold the rows of a *Restraints* or *Torsion restraints* table wired into it: *Conformers*, *Optimise*, *Minimise with restraints*, *Path search* and *Optimise to a saddle point*.
