# Workflows: the foundation, rebuilt (proposed, 2026-10-16)

A design for the maintainer to review; nothing in it is built.

**Why rebuild.** Stage 6 works, and the bug hunts of 2026-10-12 to 10-14
fixed what they found in it. But several of those bugs came from how the
workflow is founded, not from one place in the code:
- what a set holds;
- what passes from step to step;
- when a result no longer answers to its input;
- what a run is on when its input moves.

**Why wider.** The foundation is also narrower than what is coming. The
maintainer, on the first draft of this design (2026-10-16):

> We anticipate workflows across the whole range from computational chemistry
> to cheminformatics, such as structure-generation nodes like VAEs and
> filtering by property values. Make it a shape that anticipates that far.

And on the second:

> The five use cases all lean towards cheminformatics. Are
> computational-chemistry uses anticipated? It must be possible to build an
> equivalent of ConfoTS as a workflow on Meno.

ConfoTS is the maintainer's own public workflow (kfchem/ConfoTS, with
examples in kfchem/ConfoTS-showcase). It finds transition states and
estimates reaction barriers from many conformers:
- a reaction read from a drawing, atom-mapped;
- conformers of the reactants and products;
- reactant-product pairs, a nudged elastic band between them, and validated
  transition states;
- DFT on the lowest of each, with failed jobs run again;
- free energies and energy diagrams;
- IRC from each transition state.

It runs hundreds of jobs on a cluster and keeps hundreds of MB to GB of
output per reaction. Its scripts were read for what the workflow does and
needs; nothing is taken from their code, and ACCeL, which it is built on,
stays a source of ideas only (decisions 4 and 14).

So the base proposed here is made for the whole range: from calculations on
one drawn molecule, through ensembles of conformers and reaction paths, to
cheminformatics on millions of entries.

**This document, in order:**
1. the cases it is designed against;
2. the base: values and their types, entries, collections, steps and their
   ports; reactions, pairs and paths; retries; where jobs run; programs' own
   input;
3. the points of the first draft, each with what happens today, a case, and
   the design;
4. seven cases walked through end to end: F (ConfoTS) and G (a conformer
   ensemble to NMR and ECD), in most detail; then A to E, mostly
   cheminformatics (generation, similarity, docking, models, a loop), with
   calculations in A and C;
5. the order of work, one shippable PR at a time;
6. what stays in core and what is the plugins';
7. the questions for the maintainer.

**The decisions of [WORKFLOWS.md](WORKFLOWS.md) all stand** (*Decided by
the maintainer*; "decision 5" and the like below are its numbers). Three are
refined, not reversed, and say so where they are touched:
- 5, what lies in a frame is what a set holds (*Sets and collections*);
- 9, results in a set to the right of their step (*Steps, ports and exits*);
- 3, Meno defines the kinds and plugins fill them: the kinds grow (*Kinds of
  step*).

The references are to the code at v0.1.13 (`67157130`). Paths are under
`src/ui/features/Workspace/` unless they say otherwise.

## The cases it is designed against

**Computational chemistry**
1. **Calculation chains**, as today: conformers, optimise, energy,
   frequencies, NCI, render, on a few to a few thousand entries.
2. **Conformer ensembles at several levels**: a force-field or
   semiempirical search, re-optimised by DFT, energies and free energies
   kept apart by level, Boltzmann populations.
3. **Spectroscopic properties of an ensemble**:
   - NMR shieldings per atom, averaged over equivalent atoms, scaled to
     shifts, Boltzmann-weighted, and compared with experiment;
   - excited states broadened into an ECD or UV spectrum, weighted, and
     compared with a measured one.
4. **Reactions and transition states**, as ConfoTS:
   - a reaction with an atom map;
   - reactant-product pairs, paths between them, transition-state
     candidates;
   - validation by frequencies and IRC;
   - barriers from ensembles, competing outcomes compared.
5. **Failure at scale**: hundreds of jobs, some failing in ways their
   program reports, each run again with a remedy, the rest of the work going
   on.
6. **Where jobs run**: this computer, or a cluster with a scheduler, with
   GB of output left where it was made.

**Cheminformatics**
7. **Generation.** A step with no molecule input, or with seeds or a
   target, gives N new structures: a VAE or another generative model, an
   enumeration of a library, a fragment grower. Its entries may have no
   coordinates at all, only a graph (as a SMILES gives one).
8. **Prediction and descriptors.** A step adds properties to each entry:
   pKa, logP, ADMET end points, descriptors, fingerprints. Each property
   carries a name, a unit, the method or model and its version, and its own
   status for each entry.
9. **Filtering and ranking.** Keep the entries where a condition on a
   property holds, or several combined; sort, and take the top N. *Energy
   window* becomes one case of a general filter.
10. **Similarity, substructure and clustering**: from a set to a set (kept),
    to a set with a new property (a similarity), or to groups (clusters).
11. **Docking and scoring**: two kinds of input, ligands and a target.
12. **Models as values**: trained on a set, given out as a model, used by
    another step.

**Both**
13. **Scale**: sets of thousands to millions of entries, which the page
    cannot draw one by one.
14. **Tables, numbers, charts and spectra as values**: a step can take or
    give any of them, not only molecules.
15. **Loops**: generate, score, filter, generate again (active learning,
    optimisation).
16. **Branching, merging and joins**: predicted properties put back onto
    the molecules they belong to; a measured spectrum set beside a computed
    one.

## The base

### Values and their types

**What passes along a wire is a value.** Every value has a **type**, and a
port takes or gives one type. The types are Meno's; plugins use them and add
none (decision 3, kept).

| Type | What it is | Example |
|---|---|---|
| **Molecules** | a collection of entries (below), in order | a drawn set; 600 conformers; 10,000 generated structures |
| **Reaction** | species (molecules) on two sides, sharing one atom numbering, with what changes between them | a Diels-Alder drawn with two products side by side |
| **Table** | rows and typed columns: numbers with units, text, true/false, vectors, and a column of entry ids where its rows are about molecules | measured NMR shifts; a table of barriers |
| **Number** | one quantity with its unit | a count; a threshold worked out from data |
| **Chart** | a table and how Meno draws it: an energy diagram, a spectrum, a scatter plot | the energy diagram of a reaction at the DFT level |
| **Spectrum** | a curve or a list of peaks, its axes with units, what it is of | a computed ECD spectrum; a measured one read from a file |
| **Model** | a trained model's files and its signature: what it takes, and the properties (names and units) it gives | a pKa model trained on a set |
| **Pictures** | pictures, each with what it shows | a Render step's |
| **Files** | files of any kind, each with a media type, for a step that writes something Meno does not read | a program's raw output kept for another program |

**A Molecules type also says what its entries carry,** and that is part of
the type a port takes:
- **structure**, which every entry has: a graph of atoms and bonds, in a
  numbering of its own (*The entry*);
- **drawn**: 2D coordinates as drawn;
- **3D**: one geometry each;
- **paired**: two or more named geometries on one numbering. A reactant
  conformer and the product geometry made from it are one entry, its
  geometries named *start* and *end*; a transition-state guess with the two
  sides it lies between adds *guess*;
- **path**: an ordered series of geometries on one numbering, each with its
  own properties and a coordinate along the path. NEB images and an IRC are
  paths;
- **grouped**: entries in groups by a key. Conformers grouped by compound
  are the conformer set of today, clusters are groups by cluster, docking
  poses are grouped by ligand, and transition states are grouped by the path
  they lie on.

**Examples:**
- *Optimise* takes "molecules, 3D";
- *Conformers* takes "molecules" (structure is enough);
- *Choose one* takes "molecules, grouped";
- a nudged elastic band takes "molecules, paired";
- *Take from path* takes "molecules, path";
- *Filter* takes any molecules and gives what it took.

**What converts implicitly, and what never does.** A conversion happens on
its own only where nothing is lost or guessed:
- **Narrower to wider: implicit.** Molecules with 3D go into a port that
  takes molecules. A grouped set goes into one that takes molecules, as its
  entries, with the groups kept in each entry's group key. A paired or path
  entry goes into a port that takes 3D only through a step that says which
  geometry (*Take from path*, *Take one geometry*): never implicitly.
- **Molecules to a table: implicit**, as a view: one row per entry, its id,
  its identity and each property as a column.
- **A reaction to its species: implicit**, as a view: the species as
  molecules, each with its role (reactant or product) and label (*a*, *b*,
  ...), in the reaction's numbering.
- **Numbers between units of one dimension: implicit** where Meno knows the
  factor (Eh, kcal/mol, kJ/mol, eV, cm⁻¹ for energies; K and °C; nm and eV
  for a spectrum's axis). The value keeps its own unit, and the conversion
  is done where it is read.
- **Never implicit:**
  - wider to narrower (molecules to 3D: decision 18; a flat set to a
    grouped one: decision 13);
  - a table to molecules (a step says which column holds structures, or
    joins by id);
  - a table to a number (a step says how: *Count*, a column's least, its
    mean);
  - molecules to a reaction (*As a reaction* says which are reactants,
    which products, and maps them);
  - across dimensions;
  - a model to anything.

A wire refused says which of these it met, at the port it was dropped on
(*Takes molecules with 3D: these are drawn only. Conformers makes 3D from a
drawing*).

### The entry: one record for every molecule that flows

```
Entry
  id          unique within its collection; kept by every step that passes it on
  from        the entry it was made from (its parent's id and collection), where it was
  identity    Meno's canonical key of its structure (below)
  structure   atoms (element, isotope, formal charge, radical) and bonds
              (order, stereo), in the entry's numbering
  given       the text it came as, where it came as text (a SMILES from a generator)
  drawn       2D coordinates                                  optional
  geometry    3D coordinates; or named geometries (paired);   optional
              or a path of geometries with a coordinate each
  group       its group's key, in a grouped set               optional
  role        in a reaction: its species (a, b, ...) and side optional
  species     charge and multiplicity, and where each came from:
              the chemist, a calculation it was read from, or its atoms
  properties  name -> Property (an open map)
  attempts    each time a step tried it: options, how it ended, the log (Retries)
  status      done, failed or set aside, with a reason (for the step that made it)
```

```
Property
  value       its shape: one value; one per atom (in the entry's numbering);
              one per vibration; one per excited state; a curve (x and y);
              a vector (a fingerprint); or a list of restraints
  unit        for each number in it: one Meno's units table knows, or "none"
  quantity    what it is a value of (energy, free-energy correction, shielding,
              rotatory strength, pKa, similarity...), with its dimension
  at          the geometry it was worked out at (its hash) and, where it
              applies, the temperature, pressure, standard state and solvent
  by          the step and run that gave it; the plugin and its version; the
              program, method and basis, or the model and its version; the
              training set's identity, for a model's
  status      computed, failed (why), or not applicable (why)
```

**What the first draft named becomes properties.** They keep their meaning;
they are no longer special fields:
- **energy**: Eh, with its kind (electronic, ZPE-corrected, free energy),
  program, method, basis and solvent;
- **thermal corrections**: to energy, enthalpy and free energy, at a
  temperature and pressure;
- **share**: a fraction, with its temperature and where it came from (a
  *Populations* step, a program's own, the chip's room temperature);
- **degeneracy**;
- **vibrations**: frequencies, intensities and displacements per
  vibration, the count of imaginary ones as a property of its own, so that
  a filter can say *exactly one imaginary vibration*.

**The numbering is fixed.** An entry's atoms are numbered once, when its
structure is first made: drawn, read from a file, or given by a generator.
No step renumbers them.
- **A step whose program reorders atoms maps them back** before it gives its
  entries. The conformer searches already keep the order, and #374 settles
  equivalent atoms onto one numbering across conformers.
- **Across a reaction**, every species takes the numbering of the reactant
  side through the atom map (*Reactions*). From there, "atom 7" means the
  same atom in every conformer, pair, path, transition state and IRC end
  point of the reaction.
- **Per-atom properties are therefore aligned by number** with no matching:
  shieldings, charges, the displacements of a vibration.
- **A measured table keyed by the drawing's atom numbers joins on**, because
  a 3D molecule keeps the drawn atom it came from (`drawnFrom`).

**Levels of theory are kept apart.** A property records the geometry it was
worked out at:
- a molecule optimised by GFN2-xTB and then by DFT keeps its xTB energy,
  marked as of its earlier geometry;
- steps that combine properties (*Free energy*, below) combine only those
  worked out at the same geometry, unless the chemist allows otherwise, and
  then say so.

So an xTB ranking and a DFT ranking of the same lineage can be set side by
side, and never mixed by accident.

**Identity.** Meno works out a canonical key from an entry's structure:
graph, stereo, charges, isotopes.
- **What uses it**: joins by identity, duplicates by identity, and "is this
  the same compound".
- **What gives it**: Meno's own canonical numbering. Clean-up's (#319,
  individualisation and refinement, written from published descriptions)
  gives both the key and each atom's symmetry class. The classes say which
  atoms are equivalent: the three hydrogens of a methyl, the two ortho
  carbons of a phenyl turning freely.
- **Meno's, never a plugin's**, so that a join does not depend on which
  plugins are added.
- **Worked out once** per structure, in a worker, and kept with its
  collection.

The identity never replaces the numbering. It is order-free; the numbering
is the entry's own.

**Lineage.** `from` makes a join by descent possible: properties worked out
on a copy of a set are put back on the entries they belong to, even where
two entries share an identity, such as two conformers.

### Sets and collections

**Entries live in collections, not on the page.**
- **A collection** is an ordered list of entries, kept by Meno for the
  workspace. It is never changed once made: a step makes a new one.
- **Its hash** is worked out once, when it is made, from its entries' own
  hashes: structure, geometries, species and properties.
- **In the workspace file**, collections are kept beside the files already
  kept by their SHA-256, as columns:
  - structures and geometries compactly;
  - properties as typed columns;
  - fingerprints packed as bits.
- **A set on the page shows a collection.** A set the chemist makes holds the
  page's own molecules and drawings. Meno makes its collection from them on
  each edit, which is cheap at the sizes one draws.

**What a set shows** depends on its size:
- **Up to 50 entries: on the page**, as today. Each entry is a molecule or a
  drawing in the frame, and a result's entries are laid out in rows (point
  9).
  - A paired entry shows its first geometry, with a chip to step through the
    others.
  - A path entry shows as a molecule with its frames chip, the coordinate
    along the bottom.
- **More: a summary in its frame**:
  - its count, with nouns (*12,480 molecules · 3 properties*);
  - a grid of a sample of its structures, drawn in 2D by Meno's own layout,
    where they have no drawing;
  - small histograms of the properties chosen for it.

  It also opens as **a table** in the column: rows drawn as they scroll,
  sorted and searched, with a structure column. Any entries can be put on the
  page from there: they become page molecules, shown in a set of their own,
  linked to their entries.
- **What does not change with size:** a set's type, count, members and order
  are the same whichever way it is shown. Showing is never what decides
  them.

**Members are explicit** (refining decision 5):
- **A set's members are a list in order**: its collection's.
- **The frame's gesture stays as the edit.** A molecule or drawing dropped
  into a chemist's set joins it, at its place in the order. One dragged out
  leaves it. Each is an edit of its own, one step to undo, and the frame
  lights as it is crossed.
- **Moving one inside the frame keeps its place.** A turn, a nudge, a label
  grown: none changes the order.
- **Re-ordering is done on purpose**: *Sort by reading order* on the set's
  menu, or a member dragged before another.
- **A result set's order is its step's.**

Today, by contrast, membership is "the middle inside the frame" and order is
reading order with rows 0.9 units apart, both worked out on every look
(`setMembers`, `before`, `workflow/entries.ts`). A molecule turned so its
middle crosses a row line swaps two compounds' letters. A result molecule
nudged past the edge silently leaves the next run's input.

### Steps, ports and exits

**A step has named inputs and named exits, each typed.** Its kind declares
them in Meno's kind table:
- most kinds take one input and give one exit, as today;
- *Dock* takes *ligands* (molecules) and *target* (molecules, one entry);
- *Predict with a model* takes *molecules* and *model*;
- *Pair* takes *from* (molecules, grouped by species) and a *reaction*;
- *Compare* takes *computed* and *measured*;
- *Split* gives *kept* and *rest*;
- *Barriers* gives a *table* and a *chart*.

**Every exit is a result set** (refining decision 9), made with the step,
empty and named for what it will hold (*Optimised · not run yet*). It lies
to the right of the card, and wires leave from it.
- **The card's own give port goes.** Today a step gives from two ports that
  mean the same: its own (`StepCard.tsx`, `data-give-step`) and its result
  set's. A wire from the card crosses its own result set.
- **A procedure** put down comes with its empty result sets, wired.

**An exit that gives something other than molecules** is a frame of its own
kind:
- a table shows its first rows and opens whole in the column;
- a number shows as a chip with its unit;
- a chart is drawn by Meno, in vector, its labels editable and its export
  the page's;
- a spectrum is drawn as a chart;
- a model shows its name, what it takes, what it gives, and its training
  set;
- a reaction shows its scheme, mapped atoms numbered on hover.

Nothing takes a model or a picture until a kind that takes it is added. Its
port says *Nothing added takes models yet*.

### Reactions

**A reaction is a value**, not a drawing that steps read again and again.
*As a reaction* (Meno's) makes one from a scheme drawn on the page or an RXN
file opened. It holds:
- **the species**: each a molecule, labelled *a*, *b*, *c* from left to
  right as drawn, on the reactant or the product side. Molecules drawn
  together on one side are one species, a complex, when the chemist says
  so (a reactant pair that meets in one transition state). Several products
  drawn side by side are **competing outcomes** of the same reactants
  (exo and endo, two regioisomers), each with its own paths, compared at the
  end (*Barriers*);
- **the atom map**: every product atom given the number of the reactant atom
  it is. *Map atoms* (Meno's, below) makes it where the file brings none.
  Where several maps change bonds equally few times, as symmetry allows, the
  alternatives are kept and shown, and the first by canonical order is used
  until the chemist picks another;
- **what changes**: the bonds formed and broken, with their orders, and
  the atoms they join: the reacting atoms;
- **contacts**: bonds drawn as coordination bonds, such as between a Lewis
  acid and the carbonyl oxygen it holds. These are not bonds that form, but
  interactions to hold during force-field work. Each becomes a distance
  restraint at a set fraction of the two atoms' van der Waals radii;
- **checks**: the bonding each species must keep, and what the checks pass
  over: atoms, elements or bonds the chemist names, with contacts always
  passed over.

From the reaction come, by Meno's steps:
- **pairs**: a reactant conformer and the product geometry made from it, or
  the other way round (*Pair*);
- **restraints**: distance restraints for contacts, torsion restraints for
  the double bonds whose E or Z must not change, and fixed reacting atoms
  for a constrained pre-optimisation;
- **the end points' check** (*Match end points*).

**Atom order through a reaction** is the reactant side's, carried by the map
(*The numbering is fixed*), and never renumbered after.

### Retries

**A failure is a status with a class**, not just words. A program plugin's
`collect` says, for each failed entry:
- the **class**, declared in its manifest with the remedies it offers.
  Examples for a DFT program: the SCF did not converge; the optimisation
  oscillated; a memory allocation failed; the solvation model failed; the
  run ended without saying how;
- the program's **own words**;
- whether it can be **run again from its last geometry**.

Meno's own checks give validation failures the same way:
- the wrong number of imaginary vibrations (none for a minimum, exactly one
  for a transition state);
- bonds changed, or stereo lost (R or S, E or Z);
- an IRC whose end points are not the expected reactant and product.

**A step's retry policy is an option**, with defaults in Settings
(decision 17). For each class, one of:
- *Run again as it was*;
- *Run again from its last geometry*;
- *Run again with a remedy* the plugin offers (another SCF algorithm, force
  constants computed at the start, more memory);
- *Displace along the imaginary vibration and run again*: Meno's, for a
  minimum that came out with one;
- *Leave it failed*.

Retries are bounded: at most three attempts by default, the number
changeable.

**Attempts are kept.** Each entry's attempts are listed with their options,
how each ended and each one's log. Its status says how it ended (*done on
its 2nd attempt · SCF settings changed*). Nothing a failed attempt wrote is
overwritten.

**A retry is not a loop.** It happens inside one step, on the entries that
failed, and the step is *Partly done* until its attempts are spent.
Escalating restraints work the same way, as a bounded retry with a
validation in between: torsion restraints strengthened at each attempt
until the E/Z check passes, at most ten times (*Minimise with restraints*).

### Where jobs run

**A program plugin says what to run; a runner says where.**
- **The program plugin prepares each job** as today:
  - the program;
  - arguments, files and standard input;
  - the files to read back;
  - what to do after (a checkpoint converted and compressed);
  - and now the **resources** it needs: cores, memory, time.

  It does not know where the job will run.
- **A runner** is a plugin role of its own. It submits a job, says how it
  stands (waiting, running, done, failed, gone), fetches the files asked
  for, stops it, and cleans up after. It also knows where each program is on
  the machine it runs jobs on.
- **Meno's own runner**, this computer's, is the one built today (`Meno
  --job`, `src-tauri/src/jobs.rs`). It stays in core, and is moved onto the
  same seam with no change in what it does.
- **Cluster runners are plugins.** A runner for a batch scheduler (PBS,
  Slurm, others) over SSH writes the scheduler's submission script from the
  job's resources and submits through the scheduler. It then polls on its own
  schedule, fetches, and gives back. Core knows no scheduler.
- **Throttling** is the runner's: how many jobs it keeps queued at once.
  ConfoTS's helper submits a set number at a time and never the same job
  twice; on Meno that is the runner's *Jobs at once*.

**Which runner runs a step** is an option on the step, *Runs on* (*This
computer*, *the lab's cluster*), its default per plugin and kind in Settings.
A run picked up after Meno was closed asks the same runner (decision 8,
kept).

**Credentials are never Meno's.** A cluster runner signs in through the
system's own SSH configuration and agent. Meno stores no password or key
and asks for none. The hosts a runner reaches are declared in its manifest
and granted as Meno's other network access is.

**Data stays where it was made.** A reaction's DFT outputs, checkpoints
and NEB trajectories come to hundreds of MB to GB.
- The runner fetches **what a step reads**: the declared outputs and logs,
  compressed in transit.
- It **leaves the rest where the job ran**, with a record: path, size,
  SHA-256.
- A file left behind is **fetched only when a step asks for it**: a
  wavefunction for an NCI step, a checkpoint for an IRC.
- Job folders are **removed when their step is deleted**, as now, after
  asking where they are on another machine.
- Settings shows the disk each runner's folders take.

### Programs' own input

**The program plugins own their input.** A program plugin may offer, for a
kind, an option of the kind *text, several lines*:
- a route line, an input template with the plugin's own placeholders, or a
  block to add;
- set as a default in Settings or on the step (decision 17).

Core shows it, keeps it, and passes it on. It never reads it. The plugin
fills its placeholders, checks what it can, and says what it could not use.
This is how the chemist's own route lines and templates are kept, as
ConfoTS keeps them.

**Some parameters are shared, in Meno's form.** These go to every plugin,
whatever its program calls them:
- **charge and multiplicity** (*species*, per entry);
- **solvent**: a name from Meno's list of solvents, with their usual
  aliases (*chloroform*, *CHCl3*, *CDCl3*), or "none". Each plugin maps the
  name to its program's model and keyword, and says when its model does not
  know that solvent;
- **temperature and pressure**, for thermochemistry;
- **restraints**, where the kind takes them: distances, angles, torsions and
  fixed atoms, in the entry's numbering, with targets and force constants
  in units. A plugin declares which kinds of restraint it applies.

A solvent's name is chemistry, not a program, so the list is core's. How a
program writes it is the plugin's.

### Kinds of step, for the whole range

**Meno defines the kinds, and plugins fill them** (decision 3). The list
grows from today's eleven. A plugin declares in its manifest, for each kind
it fills:
- what it takes, where that is less than the kind takes;
- the properties it gives: names, units, quantities;
- the failure classes it reports, and the remedies it offers;
- the restraints it applies;
- its options;
- whether a kind's entries go together into one job.

**Calculations: filled by plugins**

| Kind | Takes | Gives |
|---|---|---|
| Conformers | molecules | molecules, 3D, grouped by compound |
| Optimise, Energy, Frequencies | molecules, 3D (restraints where the plugin applies them) | molecules, 3D, with energies, thermal corrections and vibrations |
| NCI, Render | molecules, 3D | molecules with surfaces; pictures |
| **Minimise with restraints** | molecules, 3D or paired, with restraints | the same, the geometry minimised (a force field, a semiempirical method) |
| **Path search** | molecules, paired | molecules, path: images with energies, the highest marked |
| **Optimise to a saddle point** | molecules, 3D (a guess); or paired with a guess, where the plugin says it takes the two sides as well | molecules, 3D, with energy |
| **Follow the reaction path** | molecules, 3D (saddle points) | molecules, path: both directions as one path, the saddle point at 0 |
| **NMR shielding** | molecules, 3D | the same, with shieldings per atom (ppm) |
| **Excited states** | molecules, 3D | the same, with energies and strengths per state |

**Reactions, checks and derived quantities: Meno's own**

| Kind | Takes | Gives |
|---|---|---|
| **As a reaction** | a scheme drawn, or an RXN file's | a reaction |
| **Map atoms** | a reaction | the reaction, mapped, with what changes |
| **Pair** | *from*: molecules grouped by species; *reaction* | molecules, paired: each conformer with its partner species' bonding, on the same geometry, to be minimised |
| **Take from path** | molecules, path | molecules, 3D: the highest point, the end points, or a point by its coordinate; or molecules, paired: the highest point as *guess*, with the points either side of it at a set distance as its two sides |
| **Take one geometry** | molecules, paired | molecules, 3D: the named geometry |
| **Check bonding** | molecules, 3D; a reaction or the species to check against | those whose bonds, as Meno reads them from the geometry, and stereo (R or S, E or Z, by the shared numbering) are as expected; the rest set aside, with what differs |
| **Match end points** | molecules, path (IRC); a reaction | the saddle points whose two ends are one reactant and one product of the reaction, each with its connection (*a → b*) |
| **Check the vibration** | molecules, 3D, with vibrations; a reaction | those whose one imaginary vibration moves the reacting atoms most, within a tolerance |
| **Measure** | molecules, 3D | the same, with distances, angles or dihedrals between numbered atoms (Å, °) |
| **Free energy** | molecules with energies and thermal corrections | the same, with a free energy: an energy, plus a correction, plus the standard-state term, all at one geometry and temperature, each part named |
| **Populations** | molecules, grouped, with energies or free energies | the same, with shares at a temperature |
| **Boltzmann average** | molecules, grouped, with shares | one entry per group, its per-atom properties, states or spectra weighted by the shares |
| **Average equivalent atoms** | molecules with per-atom properties | the same, each value averaged over its atom's symmetry class |
| **Scale** | molecules with shieldings | the same, with shifts (ppm), by a line given (slope and intercept, from a table) or by a reference compound worked out alongside |
| **Spectrum** | molecules with excited states | the same, with a curve: each state broadened (a Gaussian or Lorentzian width in eV), on an axis in nm or eV |
| **Barriers** | the reaction, and its species and saddle points with free energies | a table (each species' free energy, lowest or Boltzmann over its conformers; each path's barrier and reaction energy; competing paths' differences and the ratio they give at a temperature), and an energy diagram |
| **Compare** | *computed* and *measured*: molecules or spectra; a table or a spectrum | a table: errors per atom, their mean, a fitted line; or a spectrum's similarity, as itself and mirrored (its enantiomer) |

**Data steps: Meno's own**

| Kind | Takes | Gives |
|---|---|---|
| **Filter** | molecules | molecules kept (the rest set aside) |
| **Sort**, **Top N** | molecules | in the new order; the first N, or N in each group |
| **Split** | molecules | *kept* and *rest*, two exits |
| **Merge** | molecules, two or more | all, or one of each identity |
| **Join** | molecules, and molecules or a table | the first, with the second's properties put on by lineage, by identity, or by drawn atom |
| **Group**, **Ungroup** | molecules | grouped by a key (identity, a property's bands, compound, species), or flat again |
| **Count**, **Summarise** | molecules or a table | a number; a table of a property's least, greatest, mean and spread |
| **Sample** | molecules | N of them, at random with a seed shown |
| **Duplicates** | molecules | one of each identity; for conformers, by RMSD with the atoms' symmetry, as today |

**Cheminformatics and models: filled by plugins**

| Kind | Takes | Gives |
|---|---|---|
| **Generate** | nothing, or seeds (molecules), or a target (molecules, or a table of desired properties) | molecules (structure only, or with coordinates where it gives them) |
| **Describe** | molecules | the same molecules, with properties added |
| **Similarity** | molecules, and a query (molecules) | the same, with a similarity |
| **Substructure** | molecules, and a pattern (drawn, or text in a pattern language the plugin declares) | the same, with a true/false property |
| **Cluster** | molecules | grouped by cluster |
| **Dock** | ligands (molecules), a target (one entry), and a site where it needs one | poses, grouped by ligand, with scores |
| **Train** | molecules with a property to learn | a model |
| **Predict with a model** | molecules, and a model | the same, with the model's properties |

**Today's steps of Meno's own become cases of these**, named as now in Quick
Add, so that the plain way stays plain (decision 2):
- *Energy window* is a *Filter*: *energy above the lowest in its group ≤ x
  kcal/mol*;
- *Choose one* is a *Top N* of 1 in each group, by energy or by number;
- *As conformers* is a *Group* by compound.

**A filter's condition** is written as rows the chemist picks, not typed as
an expression:
- a property, a comparison, a value with its unit;
- relative to its group where asked (*above the lowest in its group*);
- rows combined with *all of* or *any of*.

An entry with no value for a property in a condition is set aside, and the
card counts it (*41 had no logP*), not hidden. *Exactly one imaginary
vibration* is such a row.

## The points, revised

Each of the first draft's points still holds; most are now cases of the base
above. For each: today, a case, and the design.

### 1. One exit per output

**Today.** Two ports give one step's results (*Steps, ports and exits*).

**Design.** One result set per declared exit, made with the step. The
card's give port goes.

### 2. Typed inputs and outputs

**Today.** No port says what it takes.
- `givesOf` walks wires back through *same* (`workflow/flow.ts`).
- A plugin's narrowing shows only as a wire refused: CREST's *Conformers*
  takes `["molecules", "conformers"]`.
- A step that has not run takes anything: `holds == null` passes `canWire`.

**Design.** *Values and their types*, above.
- Each exit's type is fixed when its inputs are wired, and stored, not
  walked back on each look.
- A port says its type on hover; a refused wire says why.

### 3. Sets with explicit contents and order

**Today.** Membership is geometric and order is reading order (*Sets and
collections*).

**Design.** Explicit members in order, kept in collections. The frame's
gesture edits a chemist's set. Large sets are shown, not drawn.

### 4. One data contract between steps

**Today.** Steps' entries are built from loose `Molecule3D` fields
(`setEntries`, `workflow/entries.ts`; `pluginEntry`,
`workflow/programs.ts`):
- `SetEntry` has no shares, so a *Populations* step's shares never reach the
  next step;
- *As conformers* and *Duplicates* tell species apart by the atoms alone
  (`speciesOf`, `workflow/meno.ts`), while plugins are given a calculation's
  charge where one was read. A cation read from an output is grouped with
  the neutral molecule drawn beside it;
- two Boltzmann distributions run side by side: `boltzmann` at a step's
  temperature, and `populations` at a fixed 298.15 K for the chip, which
  does not say which it shows;
- there is no place for a property that is not an energy, nor for one per
  atom, per vibration or per state;
- nothing says which geometry an energy was worked out at.

**Design.** *The entry*, above:
- one record, with or without coordinates, with named geometries or a path;
- an identity, a fixed numbering and a lineage;
- an open map of typed properties, each with units, the geometry it was
  worked out at, and provenance.

`entriesOf` and `moleculesOf` are the only crossings between the page's
molecules and entries. Species are worked out once, by one rule: the
chemist's, else the calculation's, else the atoms'. There is one Boltzmann
function, and every share says its temperature and source.

### 5. Partial failure, and retries

**Today.** A run is ok or not (`StepRan.ok`):
- twelve conformers into *Optimise*, three of whose SCF did not converge,
  end as *Failed · 3 of 12 failed · …*;
- the nine that worked are brought in unnamed;
- *Run again* runs all twelve;
- *Run all* stops there;
- nothing runs a failed job again with a remedy.

At ConfoTS's scale (up to 64 pairs, up to 16 saddle points and 16 minima at
the DFT level, three rounds of resubmission), that would stop every
reaction.

**Design.**
- **Status per entry, and per property**, with its reason and its class
  (*Retries*).
- **Three states.** A step is *Done*, *Partly done · 61 of 64 pairs · 2
  retried · 3 failed*, or *Failed*.
- **The failed ones are named** on the card and in the table's status column.
- **Retries are bounded and within the step**, by class, with every attempt
  kept.
- **Run again on the failed** reruns those entries alone and merges them in.
- **Downstream runs on what was done**, saying so on its card (*on 61 of
  64*).

### 6. Invalidation when a source changes, at any size

**Today.**
- A hash over the input molecules, options, doer and kind is worked out on
  every edit for every step (`inputKey`, `workflow/flow.ts`).
- It missed a drawn input's chemistry until #399.
- It still misses the charge a calculation read, and who did a run and in
  which version.
- At a million entries, hashing every input on every edit is not possible.

**Design.**
- **A step's fingerprint is small and cheap.** It hashes:
  - the hashes of its inputs' collections, by port;
  - its kind and resolved options, including a template's text and the
    shared parameters;
  - its doer: plugin id and version, program and version as found;
  - the hash of a model or reaction value, where it takes one.
- **The runner is not in it.** The same job on another machine is the same
  calculation. Its result records where it ran.
- **Each collection's hash is worked out once**, when it is made.
- **A step is *Changed* when its fingerprint is**, and *Changed upstream*
  when a step before it is. Its results stay on the page, marked as from an
  earlier input.
- **Not counted:** where things lie, names, the 3D look, and the order of a
  set's members (a step whose result depends on order sorts first).

### 7. A snapshot at the start; a closed store

**Today.**
- **No snapshot.** A run keeps its input's hash only, and reads its input
  again at its end (`finishStep`, `store/slices/stepRuns.ts`). #399 keeps
  what a run's jobs started on in memory, but a workspace reopened mid-run
  has no such record.
- **A closed tab tells only the Render command.** Meno's own work goes on
  against a store whose page is gone.

**Design.**
- **The snapshot is the input collections.** Collections never change, so a
  run's snapshot is their hashes, saved with the run. A workspace opened
  again, days into a cluster run, finishes on exactly what it started on.
- **A store that closes says so.** Each document's store has a signal, and
  every run path takes it.
  - Jobs go on, as decision 8 has it, on whichever runner runs them.
  - Meno's own work stops, recorded as *Stopped · the workspace was closed*.

### 8. Typed outputs that are not molecules

**Today.** A Render step's pictures are special-cased in eight places:
`runOne`, `finishStep`, `placePictures`, `canWire`, `inputOf`,
`resultsNow`, `fitResultSets`, `countOf`.

**Design.** Pictures, tables, numbers, charts, spectra, reactions, models
and files are types, each with a frame that shows it.

### 9. Layout derived, not stored

**Today.** Result molecules are put at document positions when a run lands
(`placeResults`, `workflow/run.ts`). A change of 3D look then needs
`fitResultSets` to lay them out again, through `doc.amend`, over the whole
history.

**Design.** A result set's layout is worked out where it is shown: its
members in order, in the look in force.
- A set the chemist arranged keeps its positions.
- Large sets are not laid out on the page at all.

### 10. One atom, no electrons, not applicable

**Today.** Each plugin handles a lone atom or a species with no electrons
its own way:
- xTB drops `--opt`;
- CREST runs plain xtb;
- ORCA and Gaussian swap to an energy run;
- xTB leaves out a gap with no electrons.

**Design.** The kinds say what such an entry means, and Meno sees to it:
- **One atom**: *Optimise*, *Conformers* or *Frequencies* of it is its energy
  where it is, by the doer's *Energy*.
- **No electrons**: no orbital properties, each marked *not applicable*
  with the reason.
- **New kinds** follow the same rule. A property that does not apply to an
  entry is *not applicable*, not failed: a pKa of a molecule with no acidic
  site, as the model says, or a shielding of an atom whose nucleus the step
  was not asked for.

### 11. Every number says what it counts, and its unit

**Today.**
- Counts appear without nouns: *2 compounds · 12*, *10 of 12*.
- Options appear without units: *30 · MMFF94 · 2000 · 0.5 Å · 19781*.
- The chip gives an energy above the lowest and a share without saying the
  reference or the temperature.

**Design.**
- **Every number names what it counts and its unit**: *12 conformers*, *2000
  iterations*, *31 % at 298.15 K*, *ΔG‡ 18.4 kcal/mol at 298.15 K, 1 mol/L*.
- **A test over every summary function** holds the rule.
- **A property's unit** comes from the property itself, and its quantity from
  Meno's units table.

### 12. What a run keeps

**Today.** `StepRan` keeps when it ran, its kind, options, words and its
jobs' ids. The program and its version are only on the results'
calculation info, and the logs only in the jobs' folders.

**Design.** A run keeps:
- its doer, with versions;
- its runner and where the jobs ran;
- its input collections' hashes (the snapshot);
- each entry's attempts and status;
- its logs, as texts in the workspace;
- its output collections;
- a record of each large file left where it was made.

The ten runs kept stay ten.

### 13. Conformers on the new base

**Today.**
- A molecule is "one compound's conformers" when `conformerSet` is set and
  it has more than one frame.
- Shares have no temperature.
- The "all in one job" of decision 11 has no field in `StepDecl`: CREST
  groups its own.

**Design.**
- **A conformer set is molecules grouped by compound.**
  - *Populations* gives shares with their temperature.
  - *Choose one* and *Energy window* are cases of *Top N* and *Filter* in
    each group.
  - *Duplicates* uses the atoms' symmetry classes.
- **The same shape serves elsewhere**: docking poses are grouped by ligand,
  and transition states by the path they lie on.
- **A manifest's step may say `together: true`**, and CREST's *Optimise*
  does.

## Seven cases, end to end

Two cases of computational chemistry are walked first and in most detail:
F (ConfoTS) and G (a conformer ensemble to NMR and ECD). Then come A to E,
which are mostly cheminformatics but include calculations in A and C.

### F. ConfoTS on Meno

**The case** (cases 2, 4, 5, 6, 14): a Diels-Alder with one reactant, as
in the showcase's first example. The reactant (*a*) and two products drawn
side by side (*b*, *c*: two outcomes of the same reaction), in chloroform.
The question: which product forms faster, and by how much?

Each ConfoTS step is named in brackets by its output folder or option, so
the two can be read side by side.

**F1. The reaction** (ConfoTS step 0)
1. **The scheme** is drawn on the page, or an RXN file is opened. Where a
   Lewis acid holds a carbonyl (the showcase's sixth example), the contact is
   drawn as a coordination bond
   (in ConfoTS, a bond of the molfile's coordination type, which becomes a
   distance restraint). The solvent is set once, in the workflow's shared
   parameters, as *chloroform* (in ConfoTS, a file named for the solvent,
   matched against aliases).
2. ***As a reaction*** (Meno's) makes the reaction value:
   - species *a* on the reactant side; *b* and *c*, competing outcomes, on
     the product side;
   - molecules drawn together on one side are one complex where the chemist
     says so (ConfoTS joins the pieces of one label);
   - every species must hold the same atoms (ConfoTS stops on differing
     molecular weights). Meno refuses with the atoms that differ.
3. ***Map atoms*** (Meno's) gives *b* and *c* the numbering of *a* [003].
   - **Alternatives.** The showcase's example has four equally good maps for
     each product, as its symmetry allows; they are kept and shown, and the
     first is used.
   - **What changes:** the bonds formed, broken or changed in order, and the
     atoms they join (ConfoTS's "reacting bonds" and "reacting atoms").
4. **No single 3D structure is made.** ConfoTS embeds one in step 0 to seed
   its force-field search; Meno's *Conformers* starts from the drawing
   (decision 18).

**F2. Conformers of each species** (step 1, first part)
1. ***Conformers*** on the reaction's species: the implicit view of its
   species as molecules. A plugin fills it [100: ConfoTS uses a force-field
   search of 10,000 steps].
   - **Restraints:** the reaction's contacts, as distance restraints, where
     the plugin applies them.
   - **What it gives:** molecules, 3D, grouped by species, each in the
     reaction's numbering (the plugin maps its own order back).
2. ***Filter***: within 10 kcal/mol of the lowest in its group
   [`energy_limit_to_empopt`].
3. **Optional:** ***Minimise with restraints***, the reacting atoms fixed,
   as a pre-optimisation [`prep_opt`].
4. ***Optimise*** by xTB, GFN2 [110], on the runner chosen.
5. ***Duplicates***: RMSD below 0.1 Å, with the atoms' symmetry
   [`rmsd_limit`, with its rotamer and number-isomer permutations].
6. ***Check bonding*** against each species. Conformers whose bonds changed
   in the optimisation are set aside, with the bonds gained and lost. Passed
   over: contacts, and any atoms, elements or bonds the chemist names
   [`ignored_atoms_in_bond_check` and the like].
7. ***Filter*** within 5 kcal/mol, and ***Top N***, at most 64
   [`energy_limit_to_neb`, `max_limit_to_neb`].

In the showcase's example this is some 670 force-field conformers and
several hundred xTB jobs.

**F3. Pairs** (step 1, second part)
1. ***Pair*** (Meno's) [120]:
   - **Which side.** The option *From*: the side with fewer conformers, or
     both sides where they are within a quarter of each other (ConfoTS's
     `path_flag`, *auto*); or *both*, *reactants*, *products*.
   - **What a pair is.** Each conformer of the chosen side, paired with each
     species on the other: the conformer's geometry, taken with the partner's
     bonding and charges, in the shared numbering.
   - **What it gives:** molecules, paired. *start* is the conformer; *end* is
     to be made.
2. ***Minimise with restraints*** (a force-field plugin) on *end*, with the
   contacts as distance restraints.
   - **The check:** Meno's E/Z check against the partner species.
   - **The retry:** where the check fails, torsion restraints on those double
     bonds, 50 units stronger at each attempt, at most ten attempts
     [`max_cycle_of_force_mini`; folders 120 to 120_recalc2]. This is a
     bounded retry with a validation between (*Retries*).
3. ***Optimise*** (xTB) on *end* [122], optionally after a pre-optimisation
   with the reacting atoms fixed [`pair_prep_opt`].
4. ***Check bonding*** on *end* against the partner species, R or S and E or
   Z kept [`check_chirality`]. Pairs that fail are set aside, with what
   differs.

**F4. Paths and saddle points at the semiempirical level**
1. ***Path search*** on each pair: a nudged elastic band with GFN2-xTB, 8
   images, filled by the ORCA plugin [123]. It gives paths, each image with
   its energy.
2. ***Take from path*** gives molecules, paired:
   - **guess**: the highest point, or the climbing image [`use_ci_xyz`];
   - **reactant side** and **product side**: the images either side of it, a
     set number of images away, for a three-structure optimisation later
     [`image_distance`].
3. ***Measure*** the forming bonds' lengths, in Å [`calc_length`].
4. ***Duplicates***, by RMSD with the atoms' symmetry.
5. ***Frequencies*** (xTB) [125], then ***Filter***: exactly one imaginary
   vibration [`check_freq(im=1)`].
6. ***Follow the reaction path*** (the ORCA plugin's IRC, xTB), both ways
   [`irc_test`; 125_F, 125_B].
7. ***Match end points***: the saddle points whose two ends are one reactant
   and one product of the reaction, R or S and E or Z kept
   [`check_irc_chirality`]. Each keeps its connection (*a → b*, *a → c*);
   the rest are set aside with *IRC ends not the reaction's*. Without an IRC,
   ***Check the vibration*** does instead: the imaginary vibration must move
   the reacting atoms most, within a tolerance [`additional_valid_range`,
   `acceptable_invalid_atoms`].
8. ***Take from path*** once more: the IRC's ends become the better sides
   for the three-structure optimisation [`use_irc_terminal_for_qst`].

The result is saddle points grouped by path [126].

**F5. The energy diagram at the xTB level** [130]
1. ***Frequencies*** (xTB) on the reactant and product conformers kept
   (within 5 kcal/mol, at most 16) [114] and on the saddle points.
2. ***Free energy***: xTB's energy plus its own thermal correction, at
   298.15 K and 1 atm.
3. ***Barriers***, lowest of each species, gives a table and a chart: the
   energy diagram before any DFT, which the user guide suggests for a quick
   screen.

**F6. DFT** (steps 2 and 3)
1. ***Filter*** and ***Top N***:
   - saddle points within 10 kcal/mol, at most 16;
   - reactants and products within 5 kcal/mol, at most 16
     [`energy_limit_to_ts_dft`, `energy_limit_to_reapro_dft`,
     `max_limit_to_dftopt`].
2. **The saddle points.** ***Optimise to a saddle point*** with the Gaussian
   plugin, on the cluster runner [203]:
   - with the three structures, where the plugin takes them [`qst_opt`];
   - or the guess alone, force constants computed first.
3. **The minima.** ***Optimise*** the reactants and products [201, 202].
4. **Frequencies** at the same level.
5. **The levels.** The chemist's route lines are the Gaussian plugin's
   template option: ωB97X-D/6-31G(d) for geometries. Then ***Energy*** at
   ωB97X-D/6-311+G(d,p) with SMD chloroform [`model_sp`, the Link1 job].
   This is two steps, or one job by the plugin's template, as the chemist
   sets it.
6. **Retries**, at most three attempts, as step 2's three rounds of
   resubmission. The classes are those its helper script tells apart, among
   them an SCF that did not converge, an optimisation that oscillated, a
   memory error, and the wrong count of imaginary vibrations. On Meno each
   class has its remedy, the chemist's to choose:
   - an SCF that did not converge: from the last geometry, with another SCF
     algorithm the plugin offers;
   - an oscillating optimisation (its forces repeating): from the last
     geometry, force constants computed;
   - memory: as it was;
   - the wrong count of imaginary vibrations: displaced along it (Meno's),
     then run again.
7. ***Check the vibration*** on the DFT saddle points. ***Filter***: no
   imaginary vibration for a minimum, exactly one for a saddle point.
8. ***Free energy***: the higher level's energy, plus the lower level's
   thermal correction at the same geometry, plus the standard-state term (1
   atm to 1 mol/L, as the chemist sets). Each part is named on the property.
   ConfoTS's single-point-only mode adds xTB's correction to a DFT energy at
   the xTB geometry; that is allowed, since the geometry is the same, and
   the property says so.
9. ***Duplicates***, then ***Populations*** (Boltzmann over each species'
   conformers) [`calc_distribution`].
10. ***Barriers***, lowest of each species or Boltzmann over each, as
    chosen [310]:
    - a table: ΔG‡ of *a → b* and of *a → c*, their difference ΔΔG‡, and
      the ratio of *b* to *c* it gives at 298.15 K;
    - a chart: the energy diagram at the DFT level.

**F7. IRC at the DFT level** (steps 4 and 5)
1. ***Top N***: 1 per path, the lowest saddle point [`irc_all` off, 401 and
   402]; or all of them [403, 404].
2. ***Follow the reaction path*** (Gaussian, both ways) gives paths, the
   points in coordinate order as Meno already reads them (#356).
3. ***Take from path***: the end points. ***Optimise*** them (Gaussian)
   [502]. ConfoTS writes these inputs without running them.
4. ***Match end points*** confirms each path joins the species it claims.

**F8. Where it runs, and what it keeps**
- **Where.** The xTB steps run on this computer or the cluster, and the DFT
  steps on the cluster (*Runs on*). Hundreds of jobs.
- **How much output.** The showcase's example keeps about 580 MB in the
  parts it shows:
  - 170 MB of NEB output;
  - 180 MB of DFT optimisations;
  - 70 MB of collected DFT logs;
  - 47 MB of IRC output.

  This stays on the cluster where it was made. The outputs steps read are
  fetched, and the `.meno` holds what Meno read.
- **The record.** Every step's runs and every attempt are kept. Every entry
  set aside keeps its reason (*bonds changed*, *IRC ends not the
  reaction's*), as ConfoTS's records keep theirs.

**F9. What it needed**, against the ten points asked for:
1. **Reactions as values, the numbering kept**: *Reactions*; *The numbering
   is fixed*.
2. **Pairs as entries, a step that makes them**: the *paired* kind of entry;
   *Pair*.
3. **Paths**: the *path* kind of entry; *Path search*, *Follow the reaction
   path*, *Take from path*.
4. **Stationary points and their validation**:
   - vibrations as properties, the imaginary count among them;
   - *Filter*;
   - *Check the vibration*;
   - *Match end points*, by the shared numbering and the reaction's bonding.
5. **Levels kept apart, free energies whole**: properties with the geometry
   they were worked out at, and their method; *Free energy* with every part
   named.
6. **Barriers and diagrams**: *Barriers*, giving a table and a chart.
7. **Failure and retries**: failure classes, retry policies, attempts kept;
   *Partly done* through hundreds of jobs.
8. **Where jobs run**: runners, with data left where it was made.
9. **Program input templates**: the program plugins' template options; the
   shared parameters.
10. **Who does bond changes and restrained minimisation**:
    - *Map atoms* and *Check bonding* are Meno's: graph comparisons and
      geometry, on Meno's own data;
    - *Minimise with restraints* is a plugin's: it needs a force field.

### G. A conformer ensemble to NMR and ECD

**The case** (cases 1, 2, 3, 14, 16): a natural product with two candidate
diastereomers. The questions: which relative configuration do its ¹H and
¹³C NMR support, and which absolute configuration does its ECD?

**G1. Conformers**
1. **The candidates.** Both are drawn into one set, a compound set. Where
   the drawing leaves a centre open, *Conformers* asks which stereoisomers to
   make, all of them included, as the canvas does.
2. ***Conformers*** (CREST) gives conformers grouped by compound, in each
   drawing's numbering.
3. ***Filter*** within 6 kcal/mol, then ***Duplicates***.

**G2. DFT geometries and populations**
1. ***Optimise*** and ***Frequencies*** (ORCA or Gaussian,
   B3LYP-D3(BJ)/def2-SVP), on the cluster runner.
2. ***Filter***: no imaginary vibration. Retry: displaced along it, at most
   three attempts.
3. ***Energy*** at a higher level, with the solvent from the shared
   parameters.
4. ***Free energy*** at the same geometry, each part named.
5. ***Populations*** at 298.15 K, then ***Filter***: share above 1 %, as the
   chemist sets.

Every property here was worked out at the DFT geometry. The CREST energies
stay on the entries, marked as of their earlier geometry, and are never
mixed in.

**G3. NMR**
1. ***NMR shielding*** (GIAO, at a level chosen, in the solvent) gives
   shieldings per atom, in each conformer's numbering. That is the drawing's
   numbering, kept through the drawn atom each 3D atom came from.
2. ***Average equivalent atoms*** averages by the atoms' symmetry classes:
   the three hydrogens of a methyl are averaged; diastereotopic protons are
   not.
3. ***Scale*** turns shieldings into shifts:
   - by a line for that level, from a table the chemist gives;
   - or by a reference, tetramethylsilane, worked out alongside at the same
     level.
4. ***Boltzmann average*** within each candidate gives one entry per
   candidate, with ¹H and ¹³C shifts per atom.

**G4. Against the measured shifts**
1. **The measured shifts** come as a table: read from a CSV keyed by the
   drawing's atom numbers (a hydrogen by the atom it is on), or typed in the
   column.
2. ***Join*** by drawn atom, then ***Compare***. It gives:
   - a table: per-atom errors, their mean absolute value, and the same after a
     fitted line, for each candidate;
   - a chart: computed against measured.
3. **A probability between the candidates**, by a published statistical
   method of the DP4 kind, would be a plugin's *Describe* or a later step of
   Meno's (question 29).

**G5. ECD**
1. ***Excited states*** (TD-DFT, 30 states, in the solvent) on the
   conformers above 1 %.
2. ***Spectrum*** broadens each into a curve: Gaussian, 0.3 eV wide, on an
   axis in nm.
3. ***Boltzmann average*** gives one spectrum per candidate.
4. ***Compare*** with the measured ECD, a spectrum read from a file. It gives
   each candidate's similarity, as computed and mirrored. The absolute
   configuration is the one whose spectrum, or its mirror image, matches.

**G6. Scale.** Two candidates, about 20 conformers each after filtering, and
four calculations each (geometry with frequencies, energy, NMR, excited
states): some 150 to 250 jobs. The solvent and temperature are set once for
the workflow, in the shared parameters.

### A. Generate, predict, filter, then calculate

*Cases 7, 8, 9, 13.*

1. **Generate.** A *Generate* step, filled by a generative-model plugin,
   takes a target: a table of one row, logP 2 ± 1, made by the chemist on the
   page.
   - Its options: 10,000 structures and a seed.
   - Its exit: *molecules, structure only*.
   - What came back: 9,962 graphs. The other 38 failed, each with the
     generator's reason, and the card says *Partly done · 9,962 of 10,000
     molecules · 38 failed*.
   - The result set shows its count and a sampled grid drawn by Meno's
     layout.
2. **Describe.** A *Describe* step (a property-prediction plugin) adds
   *logP* and *pKa (most basic)*, both dimensionless, each with its model and
   version named. 41 have no pKa: *not applicable · no basic site*.
3. **Filter**: *logP between 1 and 3*, and *pKa above 7*.
   - 1,204 are kept; the card says *1,204 of 9,962 kept · 41 had no pKa*.
   - Histograms of both properties now show on the set.
4. **Sort and take the top.** *Sort* by a third property, then *Top N* with
   N = 40. Forty fit the page, so they are drawn, each with its 2D drawing
   made by Meno's layout.
5. **Calculate.** *Conformers*, then *Optimise* (xTB), on the runner chosen,
   as today. The entries get 3D, energies come with their method, and the
   properties ride along.
6. **Run again.** *Generate* run with another seed makes a new collection.
   Every step after it is *Changed upstream*, its results still shown and
   marked, until run again.

### B. Similarity and clustering on a library

*Cases 10, 13.*

1. **The library.** A 200,000-compound SD file is opened as a set. It is
   shown as a summary and never drawn whole.
2. **Similarity.** A drawn query molecule is wired into *Similarity*'s query
   port.
   - The plugin computes its fingerprints itself, kept as a packed vector
     property.
   - A second run with the same fingerprint options computes none again.
   - It gives *Tanimoto similarity to the query*, dimensionless.
3. **Filter and cluster.** *Filter* at 0.6 or more keeps 3,180. *Cluster* (a
   plugin) gives them grouped, 212 clusters.
4. **One per cluster.** *Top N* of 1 in each group, by similarity, gives 212
   representatives, shown as a summary. *Sample* 30 of them puts thirty on
   the page.
5. **What it costs.** 200,000 fingerprints of 2,048 bits are 51 MB packed. A
   plugin computes them at tens of thousands a second, in its own process,
   and comparing one query against all takes a fraction of a second there.
   Meno moves the columns; it does not compute fingerprints.

### C. Docking, with properties joined back

*Cases 11, 16.*

1. **Inputs.** The forty from A go into *Dock*'s *ligands*. A protein opened
   from a PDB file goes into *target*. The site comes from the plugin's
   options, as a box, or from a ligand already in the structure.
2. **Poses.** The exit is *molecules, 3D, grouped by ligand*, each pose with
   a score in kcal/mol, named with its scoring function.
3. **Best pose.** *Top N* of 1 in each group, by score, gives the best pose
   of each ligand.
4. **Rescoring, if wanted.** *Optimise* (xTB) of the complexes, with the
   protein held, would be restraints of the *fixed atoms* kind on a cut-out
   of the pocket. The same shape as in F applies.
5. **Join back.** A *Join* by lineage puts the scores back onto the forty
   from A, which still carry logP and pKa. One collection then holds every
   property.
6. **Export.** Its exit, taken as a table (the implicit view), goes to an
   Export as CSV.

### D. Train and predict

*Cases 12, 16.*

1. **The data.** A CSV of measured pKa, with SMILES, is opened as a table.
2. **Join.** A *Join* by identity puts the pKa onto the molecules drawn in a
   set. 37 of 40 rows match; the three that do not are listed on the card by
   their SMILES.
3. **Train.** *Train* (a plugin) takes the joined set, with *pKa* as what it
   learns, and gives a model. Its frame says:
   - what it takes: molecules, structure;
   - what it gives: *pKa*, dimensionless;
   - its method, and the hash of its training set.
4. **Predict.** The model's exit is wired into *Predict with a model*,
   beside A's 1,204 molecules. Their predicted pKa says it came from that
   model, trained on that set.
5. **Retrain.** Retraining on more data makes a new model value, and the
   predictions downstream are *Changed upstream*.

### E. A loop: generate, score, filter, generate again

*Case 15. Later, by design.*

1. **Today, it is done by hand.** The chemist joins the scored set back as
   the *Generate* step's seeds, on a second copy of the chain put down from
   a saved procedure.
2. **Later, as a repeat frame:**
   - a frame drawn round a chain of steps, with one wire allowed back from
     its end to its start: the only cycle Meno allows;
   - its options: how many passes at most, and a condition to stop on (a
     property's best changing by less than a value);
   - each pass kept as a run of the frame, with its own collections, so that
     every pass can be looked at and its lineage traced.
3. **Not now, because a cycle breaks three things the rest of this design
   rests on:**
   - a result is a function of its inputs, so fingerprints mean something;
   - the scheduler runs each step once, in order;
   - results lie to the right of their steps.

   A frame confines the cycle to one place, where those rules are replaced by
   passes. That is a design of its own, best made once the base exists and
   loops are asked for in earnest. Nothing in the base shuts it out: runs
   already keep lineage and collections.

   F's retries and escalating restraints are not loops in this sense. They
   are bounded attempts within one step, on the entries that failed.

## Branching and merging

- **Branching** is several wires from one exit: allowed today, kept. F uses
  it for the xTB diagram and the DFT branch, which both leave from the
  validated saddle points.
- **Merging** is *Merge* (all, or one of each identity) or *Join*:
  - **by lineage**: the same entries, followed through other steps (C);
  - **by identity**: the same compound, from elsewhere (D);
  - **by drawn atom**: a measured per-atom table onto computed entries (G).
- **A join says what it did not match** (*3 rows matched no molecule*) and
  never guesses. Where two entries share an identity, a join by identity puts
  a row's properties on both, and says so.

## Found while writing the first draft

Three bugs, fixed in #399:
- set names read back;
- a drawn input's chemistry in a step's key;
- a step ending on what it started on.

## In order: the PRs

Each is shippable on its own, leaves the app working, and says where it
changes the workspace file. The plugins for new kinds come after the kinds
open, one plugin to a PR.

1. **The entry record and units.**
   - `Entry` and `Property`, with the property shapes (one, per atom, per
     vibration, per state, a curve, a vector, restraints).
   - The geometry a property was worked out at.
   - The fixed numbering, written down and tested on the steps there are.
   - Species by one rule; Meno's units table; one Boltzmann function.
   - Energies, shares, degeneracies, thermal corrections and vibrations
     become properties.
   - The chip names its share's source.
   - PLUGINS.md documents the plugin entry, with a version number.
2. **Identity and symmetry classes.**
   - Meno's canonical key and each atom's class, from the canonical
     numbering written for Clean-up (#319), once it is merged.
   - *As conformers* and *Duplicates* use them.
3. **Collections and members.**
   - Collections in the workspace file; sets reference them; hashes made
     once; members explicit and in order.
   - The frame's gesture as the edit.
   - Workspaces saved before read their members from their frames once
     (question 7).
4. **Fingerprints and snapshots.**
   - Fingerprints over collection hashes and doer versions; *Changed
     upstream*.
   - Snapshots as collection hashes.
   - The store's signal on close.
5. **Status, failure classes and retries.**
   - Status per entry and per property; *Partly done*.
   - Failure classes; the retry policy; attempts kept.
   - Meno's validation failures, and displacement along an imaginary
     vibration.
   - *Run again on the failed*.
   - The wording rule and its test.
6. **Ports, exits and types.**
   - Named, typed inputs and exits per kind.
   - The kinds of entry: paired, path, grouped.
   - Result sets made with their steps; the card's give port gone.
   - Types fixed when wired, said on hover and refusal; the conversion rules.
   - Pictures as a type.
7. **Large sets.**
   - The summary frame (count, sampled grid, histograms), and the table in
     the column.
   - Putting entries on the page.
   - Layout derived for small sets; `fitResultSets` goes.
8. **Meno's data steps.**
   - *Filter*, *Sort*, *Top N*, *Split*, *Merge*, *Join*, *Group* and
     *Ungroup*, *Count*, *Summarise*, *Sample*.
   - *Energy window*, *Choose one* and *As conformers* as their cases, kept
     by name in Quick Add.
9. **The plugin contract.**
   - Entries passed by file above a size (columns, not JSON).
   - Manifests declare the properties given, failure classes and remedies,
     restraints applied, template options, `together`, and model formats.
   - The shared parameters, with Meno's list of solvents.
   - The existing plugins (xTB, CREST, ORCA, Gaussian, RDKit) moved onto
     it.
   - The boundary guard extended to property and model names.
10. **Tables, numbers, charts and spectra on the page.**
    - Their frames.
    - A table or spectrum read from a file as a value.
    - Charts drawn by Meno, exported as the page is.
11. **Meno's chemistry steps.** *Measure*, *Check bonding*, *Free energy*,
    *Boltzmann average*, *Average equivalent atoms*, *Scale*, *Spectrum*,
    *Compare*. With 10 they make G possible to the end, once the plugins
    fill *NMR shielding* and *Excited states* (PR 13).
12. **Reactions.**
    - The reaction value.
    - *As a reaction*, from a drawn scheme or an RXN file.
    - *Map atoms*, with what changes and its alternatives.
    - Contacts as restraints.
    - *Pair*, *Take from path*, *Take one geometry*, *Match end points*,
      *Check the vibration*.
    - *Barriers*, with its table and energy diagram.
13. **The kinds for computational chemistry, opened.** *Minimise with
    restraints*, *Path search*, *Optimise to a saddle point*, *Follow the
    reaction path*, *NMR shielding*, *Excited states*. After it, one PR per
    plugin fills what its program does:
    - ORCA: NEB, IRC, NMR, excited states;
    - Gaussian: saddle points with one or three structures, IRC, NMR,
      excited states;
    - xTB: restraints;
    - a force-field plugin for restrained minimisation.
14. **Runners.**
    - The runner role and its seam; this computer's runner moved onto it,
      with nothing it does changed; *Runs on*; data left where it was made,
      with its record.
    - Then, in its own PR, a cluster runner plugin for batch schedulers
      over SSH.
15. **The kinds for cheminformatics, opened.** *Generate*, *Describe*,
    *Similarity*, *Substructure*, *Cluster*, *Dock*, *Train*, *Predict with
    a model*, and models as values. Then their plugins, one to a PR.
16. **One atom, no electrons, not applicable** (point 10), and **what a run
    keeps** (point 12).
17. **Loops**: a design of their own, after the maintainer asks for them.

F runs end to end after PR 14 (and its runner plugin, for the cluster). G
runs after PR 13 on this computer, and on a cluster once 14 is there. A to D
run after PR 15 and their plugins.

## What is core's and what is the plugins'

**Core keeps everything that holds the workflow together, and knows no
program, scheduler or model by name:**
- **values**: the types and their conversions, the entry and property
  records with their shapes, Meno's units table, the shared parameters with
  the list of solvents, and restraints as a value;
- **structure**: identity (Meno's canonical key and symmetry classes), the
  fixed numbering, and the reaction value with its map;
- **collections**: their storage and hashes; sets and their members;
- **the workflow**: steps, ports, exits and wires, and the kinds (their
  names, inputs, exits and meaning);
- **running**:
  - states and fingerprints;
  - snapshots and the store's signal;
  - the scheduler;
  - retry policies and attempts;
  - the runner seam, and this computer's runner;
- **on the page**: the summary frame, the table view, charts and spectra
  drawn by Meno, and the words on the page with their rule;
- **Meno's steps**:
  - the data steps;
  - *Duplicates* and *Populations*;
  - reactions: *As a reaction*, *Map atoms*, *Pair*, *Take from path*,
    *Take one geometry*;
  - checks: *Check bonding*, *Match end points*, *Check the vibration*;
  - derived quantities: *Measure*, *Free energy*, *Boltzmann average*,
    *Average equivalent atoms*, *Scale*, *Spectrum*, *Compare*,
    *Barriers*.

  These are graph comparison, geometry and arithmetic on Meno's own data,
  each written from what it computes, not from any program;
- **the meaning** of one-atom, no-electron and not-applicable entries.

**Plugins fill kinds and run things.** In their manifests they say:
- which kinds they fill, and what they take where they take less;
- the properties they give, with names, units and quantities;
- their failure classes and the remedies they offer;
- the restraints they apply;
- their options, among them a program's templates and route lines;
- their programs and versions;
- whether entries go together into one job;
- which model formats they read.

**What plugins do:**
- **Program plugins** prepare, run and collect. They compute what needs a
  program:
  - force fields and restrained minimisation, semiempirical and DFT methods;
  - nudged elastic bands and IRC;
  - shieldings and excited states;
  - fingerprints, similarities, predictions, docking, training.

  They read their own outputs, and map their keywords from the shared
  parameters.
- **Runner plugins** submit, poll, fetch, stop and clean up on machines
  other than this one. Each knows its scheduler, and where the programs are
  on that machine.

A plugin is given entries (by file, at scale) and gives entries or values
back; it never sees the page.

**The guards.**
- The boundary guard (`src/lib/plugins/boundary.test.ts`) keeps program
  names out of core. Extended, it keeps scheduler and model names out too.
- Property names given by plugins are data, never literals in core. Core
  names only the quantities its own steps compute or use: *energy*, *thermal
  correction*, *free energy*, *share*, *degeneracy*, *vibrations*,
  *shielding*, *shift*, *excited states*, *similarity*.

## Questions for the maintainer

The ten of the first draft, adjusted; nine from the wider range; and eleven
from computational chemistry. Each has a recommendation; one round of
answers covers them all.

**The base**

1. **Exits.** Is each declared exit a result set, made with its step and
   empty until it runs, with the card's own give port gone?
   *Recommended: yes.* What flows is what is drawn.
2. **What a set holds.** Explicit members in order, kept in a collection,
   with the frame's gesture as the edit (refining decision 5)?
   *Recommended: yes.* At scale nothing else works, and on the page a turn or
   a nudge no longer changes a set.
3. **After a partial failure.** Does the chain go on with what was done, or
   wait?
   *Recommended: go on*, said on the next card (*on 61 of 64*), with *Wait
   for all* on a step's menu.
4. **Failed entries.** Are they named on the card and in the table's status
   column, but not shown in the result set?
   *Recommended: yes.* A set holds what was made.
5. **A *Changed* step's results.** Kept and marked, or hidden?
   *Recommended: kept and marked.*
6. **Closing a tab while Meno itself is working** (not a job). Stopped, or
   carried on unseen?
   *Recommended: stopped, and shown so.* Jobs go on, on any runner.
7. **Workspaces saved before.** Do they read their members from their frames
   once, or not open?
   *Recommended: read once*, said in the PR.
8. **One atom.** Does Meno route an *Optimise* of a lone atom to the doer's
   *Energy*?
   *Recommended: yes*, by the kind's meaning.
9. **Order in the fingerprint.** Does re-ordering a set's members change
   what is downstream?
   *Recommended: no.* A step whose result depends on order sorts first.
10. **Arranged result sets.** Does a result set the chemist arranged keep its
    positions?
    *Recommended: yes.*

**The wider range**

11. **Loops.** In the base now, or later as a repeat frame?
    *Recommended: later*, by design (case E). Retries within a step cover
    what F and G need.
12. **Where large data lives.** Collections always inside the `.meno`, or
    only up to a size, with the rest elsewhere?
    *Recommended: collections always inside*, so the file stays the whole
    record.
    - Meno warns when a workspace passes 500 MB.
    - Fingerprints, which can be computed again, are left out.
    - Programs' raw outputs are a different matter (question 26).
13. **Identity.** Is Meno's own canonical key the identity for joins and
    duplicates, or a plugin's?
    *Recommended: Meno's own*, from #319's canonical numbering.
14. **Conversions.** Are the implicit conversions those listed under *What
    converts implicitly*, and all others never?
    *Recommended: yes.*
15. **How many are drawn.** At most 50 entries on the page, more shown as a
    summary and a table?
    *Recommended: yes*, with *Put on the page* for any chosen entries, up to
    500 at once.
16. **Today's steps of Meno's.** Do *Energy window*, *Choose one* and *As
    conformers* become cases of *Filter*, *Top N* and *Group*, kept by name
    in Quick Add?
    *Recommended: yes.*
17. **Property names.** Open names declared by plugins with unit and
    quantity, core naming only the quantities its own steps use?
    *Recommended: yes.*
18. **Steps with several inputs.** Named input ports per kind (*Dock*,
    *Predict with a model*, *Pair*, *Compare*)?
    *Recommended: yes.*
19. **Steps with several exits.** Only where the kind declares them (*Split*;
    *Barriers*' table and chart)?
    *Recommended: yes.*

**Computational chemistry**

20. **Reactions as values.** A reaction holds:
    - its species with sides and labels;
    - one atom numbering, the reactant side's, carried to every product by
      the map;
    - what changes;
    - contacts.

    Are several products drawn side by side competing outcomes, each with its
    own paths, compared in *Barriers*?
    *Recommended: yes, both*, as ConfoTS reads a scheme.
21. **Mapping.** Is *Map atoms* Meno's own (fewest bond changes; equal
    alternatives kept and shown, the first by canonical order used until
    the chemist picks), with plugins free to fill it too?
    *Recommended: yes.*
22. **Pairs and paths as kinds of entry.** Named geometries on one numbering
    (*start*, *end*, *guess*), and paths of geometries with a coordinate,
    with steps that take one geometry or point out of them?
    *Recommended: yes.*
23. **Levels of theory.** Does every property keep the geometry it was worked
    out at, and do steps that combine properties refuse different geometries
    unless the chemist allows it, saying so on the result?
    *Recommended: yes.*
24. **Retries.** Automatic within the step, by failure class, at most three
    attempts by default, every attempt kept with its log? The remedies come
    from the plugin, and the validation failures (imaginary vibrations,
    bonds, stereo) are Meno's.
    *Recommended: yes.* The chemist can choose *ask first* instead.
25. **Runners.** Is the runner a plugin role, with this computer's runner
    built in and cluster runners as plugins? A cluster runner signs in only
    through the system's SSH agent and configuration, Meno storing no
    password or key, and its hosts are granted as other network access is.
    *Recommended: yes.* Built after the base (PR 14).
26. **Programs' raw outputs.** Left where the job ran, with a record (path,
    size, SHA-256), fetched when a step needs them; the `.meno` keeping what
    Meno read?
    *Recommended: yes.* A reaction's raw output is hundreds of MB to GB.
27. **Templates and shared parameters.** Programs' templates and route
    lines as the program plugins' own options, which core keeps and never
    reads? And charge, multiplicity, solvent, temperature, pressure and
    restraints given to every plugin in Meno's form, with the list of
    solvents in core?
    *Recommended: yes.*
28. **Charts.** Are energy diagrams and spectra drawn by Meno from tables,
    in vector, labels editable, exported as the page is, rather than given
    as pictures?
    *Recommended: yes.* They join the graphs on the roadmap.
29. **Per-atom properties and statistics.** Are per-atom properties aligned
    by the numbering, with equivalent atoms averaged by Meno's symmetry
    classes, the chemist able to turn that off? And is a probability between
    candidates of the DP4 kind a plugin's, or a later step of Meno's from
    the published method?
    *Recommended:*
    - *aligned and averaged, yes*;
    - *the probability: a plugin's first*.
30. **The line for computational chemistry's steps.** Are bond changes,
    bonding and stereo checks, the vibration check, pairing, taking from
    paths, measuring, free energies, Boltzmann averages, scaling, spectra
    and barriers Meno's? And are restrained minimisation, path searches,
    saddle-point optimisation, IRC, shieldings and excited states the
    plugins'?
    *Recommended: yes.* The first need no program; the second do.
