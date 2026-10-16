# Workflows: the foundation, rebuilt (proposed, 2026-10-16)

A design for the maintainer to review; nothing in it is built. This is its
fourth revision.

**Why rebuild.** Stage 6 works, and the bug hunts of 2026-10-12 to 10-14
fixed what they found in it. But several of those bugs came from how the
workflow is founded, not from one place in the code:
- what a set holds;
- what passes from step to step;
- when a result no longer answers to its input;
- what a run is on when its input moves.

**Why wider.** The maintainer asked for more on each draft:

> We anticipate workflows across the whole range from computational chemistry
> to cheminformatics, such as structure-generation nodes like VAEs and
> filtering by property values. Make it a shape that anticipates that far.

> The five use cases all lean towards cheminformatics. Are
> computational-chemistry uses anticipated? It must be possible to build an
> equivalent of ConfoTS as a workflow on Meno.

**ConfoTS** is the maintainer's own public workflow (kfchem/ConfoTS, with
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
needs; nothing is taken from their code.

**How to build it.** The maintainer, on the third draft:

> Don't make it too abstract. For example, make a reaction node, put several
> inputs into it, and have outputs like bond changes. Make it possible to
> express advanced, general things by combining simple roles.

> Don't make advanced nodes. Make re-submission explicit, by combining simple
> processing nodes.

> Then even a Diels-Alder won't work. Make an ACCeL plugin.

That last remark was about atom mapping done by Meno's own "fewest bond
changes".

This revision is built on that. The decisions of [WORKFLOWS.md](WORKFLOWS.md)
all stand (*Decided by the maintainer*; "decision 5" and the like below are
its numbers). Three are refined, not reversed, and say so where they are
touched:
- 5, what lies in a frame is what a set holds;
- 9, results in a set to the right of their step;
- 3, Meno defines the kinds and plugins fill them, now with more kinds.

The answers given on the third draft are recorded at the end (*Answered*).

The references are to the code at v0.1.13 (`67157130`). Paths are under
`src/ui/features/Workspace/` unless they say otherwise.

## The principle: simple nodes, wired

**Every node has one role.** It takes plain inputs and gives plain outputs.
Anything advanced is drawn as nodes wired together, where the chemist can
read it, change it, and copy it.

What this rules out:
- **Rich value types** that carry several roles inside them. A reaction is
  not a value with sides, a map and contacts built in: it is a node with
  reactants and products going in, and mapped products and bond changes
  coming out.
- **Nodes that decide by themselves.** Examples: which side of a reaction to
  start a path from; whether a failed job is worth running again; routing a
  lone atom to another kind of calculation.
- **Built-in bundles**, such as a "Barriers" node that ranks, weights,
  subtracts and draws at once. Each of those is its own node.
- **Hidden loops.** Running a failed job again is drawn: the failed entries
  come out of a step, through simple nodes, into the same kind of step
  again, and are merged back.

What makes this practical:
- **Copying.** Copying and pasting a chain of steps already works as it
  does for atoms (WORKFLOWS.md, *Step 7: procedures and copying*). A retry
  chain drawn once is pasted again for a second attempt.
- **Procedures.** Saved chains put down again (question C below).
- **Lineage.** Every entry knows the entry or entries it was made from, so
  two inputs of one node can be matched without a "pair" type (*Steps, ports
  and exits*).

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
   - atom mapping and bond changes;
   - pairs of structures and paths between them;
   - transition-state candidates validated by frequencies and IRC;
   - barriers from ensembles, competing outcomes compared.
5. **Failure at scale**: hundreds of jobs, some failing in ways their
   program reports, run again where the chemist draws it, the rest of the
   work going on.
6. **Where jobs run**: this computer, or a cluster with a scheduler, with
   GB of output left where it was made.

**Cheminformatics**
7. **Generation**: a step with no molecule input, or with seeds or a
   target, gives N new structures (a VAE or another generative model, an
   enumeration, a fragment grower). Its entries may have no coordinates at
   all, only a graph.
8. **Prediction and descriptors**: pKa, logP, ADMET end points,
   descriptors, fingerprints, each with a name, a unit, its method or model
   and version, and a status per entry.
9. **Filtering and ranking** by properties.
10. **Similarity, substructure and clustering.**
11. **Docking and scoring**: ligands and a target.
12. **Models as values**: trained on a set, used by another step.

**Both**
13. **Scale**: sets of thousands to millions of entries.
14. **Tables, numbers and charts** as values, not only molecules.
15. **Loops**: generate, score, filter, generate again.
16. **Branching, merging and joins**: properties put back onto the
    molecules they belong to; measured data set beside computed.

## The base

### Values and their types

**What passes along a wire is a value**, and every value has a type. The
types are Meno's; plugins use them and add none (decision 3).

| Type | What it is | Example |
|---|---|---|
| **Molecules** | entries (below), in order | a drawn set; 600 conformers; 10,000 generated structures |
| **Table** | rows and typed columns: numbers with units, text, true/false, entry ids | measured NMR shifts; bond changes; restraints |
| **Number** | one quantity with its unit | a standard-state term; a threshold |
| **Chart** | a table and how Meno draws it | an energy diagram; computed against measured |
| **Model** | a trained model's files and what it takes and gives | a pKa model |
| **Pictures** | pictures | a Render step's |
| **Files** | files Meno does not read, with their media types | a program's raw output kept for another program |

**A Molecules port may say what its entries need**:
- **structure**, which every entry has: a graph in a fixed numbering;
- **3D**: one geometry each;
- **frames**: a series of geometries each, such as an optimisation's path,
  NEB images or an IRC, each frame with its own properties.

That is all. There is no reaction type, no "paired" entry, and no "grouped"
type:
- a reaction is a node;
- two inputs are matched by lineage;
- a group is a property, *group*, which the nodes that work "in each group"
  read.

**What converts implicitly, and what never does.** A conversion happens on
its own only where nothing is lost or guessed:
- **implicit**:
  - molecules with 3D into a port that takes molecules;
  - molecules into a port that takes a table, as a view: one row per entry,
    its id, its identity and its properties as columns;
  - numbers between units of one dimension that Meno's units table knows
    (Eh, kcal/mol, kJ/mol, eV, cm⁻¹; K and °C; nm and eV on a spectrum's
    axis), converted where they are read;
- **never implicit**: molecules to 3D (decision 18); frames to one geometry
  (*Take frames* says which); a table to molecules; a table to a number;
  across dimensions; a model to anything.

A wire refused says which rule it met, at the port it was dropped on.

### The entry: one record for every molecule that flows

```
Entry
  id          unique within its collection
  from        the entry or entries it was made from (lineage)
  structure   atoms (element, isotope, formal charge, radical) and bonds
              (order, stereo), in the entry's fixed numbering
  geometry    none (a graph); 2D as drawn; one 3D geometry; or frames
  species     charge and multiplicity, and where each came from: the
              chemist, a calculation it was read from, or its atoms
  properties  name -> Property, an open map
  status      done, failed or set aside, with the reason
```

```
Property
  value       a number, a text, true/false, an entry id, a list (one value
              per atom in the entry's numbering, or a curve's points), a
              vector (a fingerprint), or a small table (one row per
              vibration or per excited state)
  unit        for each number in it, from Meno's units table, or "none"
  at          the geometry it was worked out at (its hash) and, where it
              applies, the temperature, pressure and solvent
  by          the step and run that gave it; the plugin and version; the
              program, method and basis, or the model and its version
  status      computed, failed (why), or not applicable (why)
```

**Properties instead of fields.** Everything a step finds is a property:
- an energy, with its kind (electronic, ZPE-corrected, free energy);
- thermal corrections at a temperature and pressure;
- vibrations (a small table), and the count of imaginary ones;
- a share, with its temperature;
- a degeneracy;
- an entry's group, its given text (a SMILES from a generator), its name.

**The numbering is fixed.** An entry's atoms are numbered once, when its
structure is first made (drawn, read, generated), and no step renumbers
them.
- **A program that reorders atoms has them mapped back** by its plugin
  before entries are given. The conformer searches already keep the order,
  and #374 settles equivalent atoms onto one numbering across conformers.
- **The reaction node gives the products in the reactants' numbering.** From
  there, "atom 7" means the same atom in every conformer, path,
  transition state and IRC end of the reaction.
- **Per-atom properties are aligned by number**, with no matching.
- **A measured table keyed by the drawing's atom numbers joins on**, through
  the drawn atom each 3D atom came from (`drawnFrom`).

**Levels of theory stay apart.** A property records the geometry it was
worked out at (question 23, answered). A node that combines properties
(*Add*) combines only those worked out at the same geometry, unless the
chemist allows otherwise, and then the result says so.

**Identity** is Meno's canonical key of a structure (question 13, answered).
It comes from the canonical numbering written for Clean-up (#319), which
also gives each atom's symmetry class. It is order-free, and never replaces
the numbering. It is worked out once per structure and kept with the
collection.

**Lineage.** `from` lists the entry or entries an entry was made from. An
optimised conformer has one parent; an entry made by *Re-bond* has two: the
one whose geometry it took and the one whose bonding it took.

### Sets and collections

**Entries live in collections, not on the page.**
- **A collection** is an ordered list of entries. It is never changed once
  made: a step makes a new one.
- **Its hash** is worked out once, when it is made, from its entries' own
  hashes.
- **A set on the page shows a collection.** A set the chemist makes holds the
  page's own molecules and drawings, and Meno makes its collection from them
  on each edit.

**Keeping**, as the maintainer answered (question 12): "Basically, keep
everything. But make it possible to choose not to keep it, too."
- **Kept by default.** The workspace file keeps every collection and every
  property, fingerprints included, beside the files it already keeps by
  their SHA-256.
- **Not kept, by choice.** A set's menu has *Don't keep in the file*. Its
  collection is then left out when the workspace is saved, and only its hash
  and count are kept.
  - Opened again, the set says *Not kept · 12,480 molecules* until its step
    runs again (*Run again*).
  - Steps after it keep their own results, and are not *Changed*: what they
    ran on is recorded by hash.
  - The choice is the set's, kept with the workspace, and *Keep in the file*
    undoes it.
- **Programs' raw outputs** are the exception by default, because they can
  run to GB per reaction (question 26, answered):
  - they stay where the job ran, with a record of each file (path, size,
    SHA-256), and are fetched when a step needs one;
  - a step's menu has *Bring raw outputs into the workspace*, which copies
    its jobs' files into the workspace file, compressed. A step brought in
    keeps them as everything else is kept.

  What Meno read from an output (the values, the logs) is kept as now,
  either way.

**What a set shows** depends on its size:
- **up to 50 entries, on the page**, as today (question 15, answered). An
  entry with frames shows its frames chip;
- **more, as a summary in its frame**: its count with nouns, a grid of a
  sample of its structures (drawn in 2D by Meno's own layout where they have
  no drawing), and histograms of the properties chosen. It also opens as a
  table in the column, and any entries can be put on the page from there.

**Members are explicit** (question 2, answered; refining decision 5):
- a set's members are a list in order: its collection's;
- dropping a molecule into a chemist's set adds it at its place; dragging it
  out removes it. Each is an edit of its own;
- moving one inside the frame keeps its place;
- re-ordering is done on purpose: *Sort by reading order*, or a member
  dragged before another;
- a result set's order is its step's.

### Steps, ports and exits

**A node has named inputs and named exits, each typed**, declared by its
kind:
- most take one input;
- some take two or three: *Path search* takes *start* and *end*;
  *Re-bond* takes *geometry* and *bonding*; *Predict with a model* takes
  *molecules* and *model*.

**Two inputs are matched by lineage** where a node works entry by entry:
- each entry of one input is matched with the entry of the other that it
  descends from, or that it shares its nearest ancestor with;
- where neither descends from the other and they share no ancestor, the node
  pairs every entry with every entry, if its kind says it does (*Re-bond*);
- where neither applies, it refuses, saying why.

This is what lets the end of a NEB be the optimised partner of its start
with no pair type in between: the end descends from the start.

**Every exit is a result set** (question 1, answered; refining decision 9),
made with the step, empty until it runs, to the right of the card. The
card's own give port goes.

**Second exits.** A node that can fail entries, or set entries aside, has a
second exit for them (revisiting question 19, question B below):
- a calculation gives *done* and *failed*;
- *Filter*, *Rank* and *Duplicates* give *kept* and *rest*;
- *Compare bonding* gives *same* and *different*.

A second exit shows as a small frame under the first, with its count
(*Failed · 3*), and opens to a full set when something is wired from it or
the chemist opens it. Nothing is hidden: what does not go on is in plain
view, and can be wired on.

**A kind may declare other exits**, each one role: the reaction node gives
*mapped products* and *bond changes*.

### Failed entries, and running them again

**A calculation's failed entries come out of its *failed* exit**, each with:
- its **failure**, a property: the kind of failure, in the names the
  plugin declares in its manifest (*SCF not converged*, *optimisation
  oscillated*, *out of memory*, *ended without saying how*);
- the program's **own words**;
- the **frames it reached**, where it reached any (an optimisation's path so
  far), so that *Take frames* can take the last of them.

**Running them again is drawn** (question 24, answered: no advanced nodes):
1. the failed exit is wired into simple nodes that change what is run:
   *Take frames* (the last geometry reached), or *Displace* (along the
   imaginary vibration);
2. those go into another step of the same kind, whose own options hold the
   remedy: another SCF algorithm in its template, force constants computed
   at the start, more memory;
3. its *done* exit and the first step's go into a *Merge*.

**A second attempt** is the same small chain again, pasted onto the first
chain's *failed* exit, and so on for as many attempts as are wanted. Each
copy is on the page, with its own runs and logs. There is no counter and no
loop, so loops stay out of the base (question 11, answered: later).

**Validation is drawn the same way.** A saddle point whose frequencies show
two imaginary vibrations is not a failed job: a *Filter* on *imaginary
vibrations = 1* sends it to *rest*, where *Displace* and another optimisation
can take it.

### Where jobs run

As answered (question 25):
- **A program plugin says what to run**: the program; arguments, files and
  standard input; the files to read back; what to do after; and the
  resources it needs (cores, memory, time).
- **A runner says where.** A runner is a plugin role of its own: it
  submits, says how a job stands, fetches the files asked for, stops,
  cleans up, and knows where programs are on its machine.
- **This computer's runner** is the one built today (`Meno --job`,
  `src-tauri/src/jobs.rs`), moved onto the seam with no change.
- **Cluster runners are plugins**, for batch schedulers over SSH. Core knows
  no scheduler.
- **Throttling** (how many jobs a runner keeps queued) is the runner's
  option.
- **Each step's own option**, *Runs on*, chooses the runner, with defaults
  in Settings.
- **Credentials are never Meno's.** A cluster runner signs in through the
  system's own SSH configuration and agent. Meno stores no password or key,
  and its hosts are granted as other network access is.
- **Raw outputs** stay where the job ran unless brought in (*Keeping*).

### Programs' own input, and options shared in kind

**Templates** are the program plugins' own options, as answered (question
27):
- a route line, an input template with the plugin's placeholders, or a block
  to add;
- set as a default in Settings or on the step;
- shown and kept by core, never read by it.

**Options shared in kind.** There are no workflow-wide parameters that flow
into steps by themselves. Each step has its own options (decision 17), and
some kinds of option are Meno's, so that every plugin shows them the same
way:
- **solvent**: a name from Meno's list of solvents with their usual aliases
  (*chloroform*, *CHCl3*, *CDCl3*), or none. Each plugin maps the name to
  its program's model and keyword, and says when its model does not know
  that solvent;
- **temperature** and **pressure**, with units.

Charge and multiplicity are each entry's *species*, not options. A *Species*
node sets them where the atoms do not say it.

**Restraints are a table**, made by the *Restraints* node, wired into the
steps whose plugins apply them. Each row is one restraint:
- distance, angle, torsion, or fixed atom;
- the atoms, in the entry's numbering;
- the target, with its unit;
- the force constant.

### Meno's own nodes

Redone from the start as a small set of simple nodes, as the maintainer asked
on question 16. Each has one role, and they are meant to be combined.

**Sets**

| Node | Takes | Gives |
|---|---|---|
| **Filter** | molecules | *kept* and *rest*, by conditions on properties picked as rows (a property, a comparison, a value with its unit; all of them, or any). An entry with no value goes to *rest*, counted |
| **Rank** | molecules | *kept* and *rest*: ordered by a property, the first N kept, in each group or in all |
| **Group** | molecules | the same, each entry's *group* set: by compound (its identity with its species), by a property's value, or none |
| **Merge** | molecules, two or more | one set, in the inputs' order; or one entry of each identity |
| **Join** | molecules, and molecules or a table | the first, with the second's properties put on by lineage, by identity, or by drawn atom; what did not match is said |
| **Duplicates** | molecules | *kept* and *rest*: one of each identity, or by RMSD in each group, as Meno does today |

**Numbers**

| Node | Takes | Gives |
|---|---|---|
| **Number** | nothing | a number with its unit, typed by the chemist |
| **Add** | molecules, and numbers | the same, with a new property: the sum of the properties and numbers chosen, at one geometry |
| **Relative** | molecules, and a reference where wanted | the same, with a new property: one minus the lowest in its group, or minus the reference |
| **Linear** | molecules | the same, with *a* × a property + *b* (for a per-atom list, *a* and *b* by element) |
| **Populations** | molecules | the same, with shares from an energy, in each group, at a temperature, degeneracies counted |
| **Ensemble energy** | molecules | one entry per group, with −RT ln Σ exp(−E/RT) of an energy at a temperature, degeneracies counted |
| **Average** | molecules | one entry per group, each property chosen averaged, weighted by a property (shares) or evenly: numbers, per-atom lists and curves alike |
| **Equivalent atoms** | molecules | the same, a per-atom property averaged over each symmetry class (from Meno's canonical numbering) |

*Ensemble energy* and *Average* give one entry per group. The group's entry
of highest weight stands for it, carrying the results.

**Structures**

| Node | Takes | Gives |
|---|---|---|
| **Species** | molecules | the same, charge and multiplicity set |
| **Combine** | molecules | one entry holding them all, numbered in order: a complex |
| **Re-bond** | *geometry* (molecules, 3D) and *bonding* (molecules, same atoms) | for each pair (matched by lineage, or each with each): the first's geometry with the second's bonds and charges, its group *a → b* |
| **Restraints** | molecules (the reference), and a table of atoms where wanted | a table of restraints: listed atoms or coordination bonds kept at a distance; double bonds' cis or trans kept as in the reference; listed atoms fixed |
| **Measure** | molecules | the same, with distances, angles or dihedrals between numbered atoms, listed or from a table |
| **Take frames** | molecules with frames | molecules, 3D, one frame each: the highest or lowest by a property, the first, the last, by number, or *k* frames before or after the highest |
| **Displace** | molecules with vibrations | the same, the geometry moved along a vibration (the imaginary one, or a chosen one) by an amplitude |

**Spectra and charts**

| Node | Takes | Gives |
|---|---|---|
| **Broaden** | molecules with excited states | the same, with a curve: each state broadened (Gaussian or Lorentzian, its width in eV), on an axis in nm or eV |
| **Errors** | molecules with a per-atom property, and a table or molecules to compare with | a table: the differences per atom, their mean absolute error in each group, and the same after a fitted line |
| **Curve similarity** | molecules with a curve, and a table (a measured curve) | the same, with a similarity to it |
| **Energy diagram** | molecules with an energy, and what each connects | a chart |
| **Chart** | a table | a chart: one column against another |

That is 26 nodes, each doing one thing.

**What happens to today's five**
- ***Energy window*** becomes *Relative* (to the lowest in its group) then
  *Filter* (at most *x* kcal/mol).
- ***Choose one*** becomes *Rank* by energy, the first 1 in each group.
- ***As conformers*** becomes *Group* by compound.
- ***Duplicates*** and ***Populations*** stay, under those names, as above.

**In saved workspaces**, steps of a kind Meno no longer knows are left out
when a workspace is read. The reader does this already
(`workflow/saved.ts`, `readStep`), so nothing special is written:
- the wires into and out of them go with them;
- the sets they made stay, as plain sets;
- *Duplicates* and *Populations* open as themselves, their options read
  where the names still mean the same.

The PR says so (decision: no shims before 1.0).

### Kinds filled by plugins

Each is one role. A plugin declares in its manifest the kinds it fills,
what it takes where that is less than the kind, the properties it gives
(names, units), the failure kinds it reports, the restraints it applies, its
options and templates, and whether a kind's entries go into one job
together (`together`).

**Calculations**

| Kind | Takes | Gives |
|---|---|---|
| Conformers | molecules | molecules, 3D, the group of each its compound |
| Optimise, Energy, Frequencies | molecules, 3D; restraints where the plugin applies them | *done*: with energies, thermal corrections, vibrations; *failed* |
| NCI, Render | molecules, 3D | molecules with surfaces; pictures |
| **Minimise with restraints** | molecules, 3D; restraints | *done*, *failed* |
| **Path search** | *start* and *end* (molecules, 3D, matched by lineage) | *done*: molecules with frames, an energy on each frame; *failed* |
| **Optimise to a saddle point** | *guess*; and *reactant side* and *product side*, where the plugin takes them | *done*, *failed* |
| **Follow the reaction path** | molecules, 3D | *done*: molecules with frames, both directions as one path; *failed* |
| **NMR shielding** | molecules, 3D | *done*: shieldings per atom (ppm); *failed* |
| **Excited states** | molecules, 3D | *done*: a small table of states (energies, strengths); *failed* |

**Cheminformatics and models**

| Kind | Takes | Gives |
|---|---|---|
| **Generate** | nothing, seeds (molecules), or a target (molecules or a table) | molecules, structure only or with coordinates |
| **Describe** | molecules | the same, with properties |
| **Similarity** | molecules, and a query | the same, with a similarity |
| **Substructure** | molecules, and a pattern | the same, with a true/false property |
| **Cluster** | molecules | the same, each entry's group its cluster |
| **Dock** | *ligands* and *target* | poses, the group of each its ligand, with scores |
| **Train** | molecules with a property to learn | a model |
| **Predict with a model** | molecules, and a model | the same, with the model's properties |

**One atom** (revisiting question 8, question D below). There is no routing
in core. A kind's meaning is written in PLUGINS.md and held by each plugin's
tests: *Optimise*, *Conformers* or *Frequencies* of a lone atom gives its
energy where it is, as the plugins do today. A chemist who wants it
otherwise draws a *Filter* on the number of atoms.

### The ACCeL plugin

**What it is.** ACCeL is the maintainer's own library (kfchem/accel, MIT).
The plugin is a Python-environment plugin like RDKit's: it uses ACCeL as a
library, in its own environment, and fills the nodes below. No ACCeL code
goes into core.

**The nodes it fills.** Each is one role, backed by ACCeL's public API (named
in brackets), and each is what ConfoTS uses ACCeL for:

| Node | Takes | Gives | ACCeL |
|---|---|---|---|
| **Reaction** | *reactants* (one entry; a complex is made first by *Combine*) and *products* | *mapped products*: each product in the reactants' numbering (the first map, or every map); *bond changes*: a table of each bond formed, broken or changed in order, with its atoms and orders before and after | the modeller's maps |
| **Compare bonding** | molecules, 3D, and *reference* (molecules) | *same* and *different*: bonds read from the geometry, and R or S and E or Z where asked, compared with the reference each descends from; or with each reference, naming the one it matches. Coordination bonds, and atoms, elements or bonds the chemist lists, are passed over | bonds from geometry; stereo |
| **Duplicates** | molecules, 3D | *kept* and *rest*: RMSD with the molecule's symmetry (equivalent groups turned, equivalent atoms swapped), in each group | symmetry; RMSD pruning |
| **Number like** | molecules, and *reference* | the same, equivalent atoms (a methylene's hydrogens) renumbered to match the reference. Only atoms of one symmetry class are swapped, so the numbering keeps its meaning | numbering alignment |
| **Mode on atoms** | molecules with vibrations, and a table of atoms (from *bond changes*) | *kept* and *rest*: whether the imaginary vibration moves those atoms most, within a tolerance | the bonding check of a vibration |

**Later, if wanted.** ACCeL also reads Gaussian's NMR shieldings, ECD,
spin-spin couplings and IRC paths. The plugin could offer those as readers
(FILE-IO.md, *Readers*). They are not needed for F or G.

**Meno's own, though ACCeL has them too:** relative energies, energy
windows, Boltzmann populations, the lowest of each group, sums of energy
terms, averages, distances and mirror images. They are arithmetic on Meno's
own data, kept in core so that they work whichever plugins are added.
Decision 16 lets a plugin fill a kind Meno fills, so ACCeL could offer them
later beside Meno's.

**Its environment.**
- **Packages:** `accel` 0.3.0 from PyPI, a pure-Python wheel of 71,980
  bytes that declares only `numpy`, for Python 3.9 or later. GitHub's master
  is at 0.3.1, which is not on PyPI.
- **What is not needed:** acceltools 0.2.0 (MIT; it needs scipy and
  matplotlib), since charts are Meno's.
- **The plugin's own entry:** `uses: [{name: "ACCeL", version: "0.3.0"}]`,
  held to its `requirements.lock` by `versions.test.ts` as every plugin's
  is.

**Consent.** The maintainer's request covers installing ACCeL and the
dependencies it declares into this plugin's own environment, for building
and testing it, and nothing else. The first install happens when its PR is
built (*In order*), after the command centre has been told what it fetches.

## Changed and kept under the principle

Every part of the third draft, re-checked against *Don't make it too
abstract*:

| Part | Now | Why |
|---|---|---|
| Reaction as a value (sides, map, contacts) | **Changed**: a *Reaction* node (ACCeL) with *mapped products* and *bond changes* out; *Combine* for a complex; *Restraints* for contacts | a node with plain inputs and outputs, as the maintainer described |
| Meno's "fewest bond changes" mapping | **Changed**: ACCeL's | the maintainer: even a Diels-Alder would fail |
| Paired entries (*start*, *end*, *guess*) | **Changed**: plain inputs matched by lineage | no entry kind needed; the same works for every node with two inputs |
| Grouped type | **Changed**: *group* is a property | a type that only marks a property was abstraction |
| Spectrum type | **Changed**: a curve is a property; a measured one is a table | one less type, nothing lost |
| *Pair*, with its side chosen by itself | **Changed**: *Re-bond* (one role); the direction is wired | choosing the side by conformer counts was a node deciding by itself |
| *Take from path* (guess with two sides) | **Changed**: *Take frames*, one rule a node; three of them for the three structures | one role a node |
| *Barriers* (lowest or ensemble, differences, ratio, diagram) | **Changed**: *Rank* or *Ensemble energy*, *Relative*, *Populations* (the ratio between competing paths), *Energy diagram* | four roles were bundled |
| *Free energy* | **Changed**: *Add*, with a *Number* for the standard-state term | a sum is a sum |
| *Check bonding*, *Match end points*, *Check the vibration* | **Changed**: *Compare bonding* and *Mode on atoms* (ACCeL), with *Take frames*, *Join* and *Filter* | the match was four roles in one |
| *Boltzmann average*, *Scale*, *Spectrum*, *Compare* | **Changed**: *Average*, *Linear*, *Broaden*, *Errors*, *Curve similarity* | general names for single roles; *Linear* with *a* = −1 mirrors a curve |
| Filter's "relative to its group" | **Changed**: *Relative* before *Filter* | one role a node |
| Energy window, Choose one, As conformers | **Changed**: cases of *Relative* + *Filter*, *Rank*, *Group*; dropped from saved workspaces | the maintainer asked for a clean set (question 16) |
| Retry policies, failure classes, attempts in a step | **Changed**: a *failed* exit, and retries drawn | the maintainer (question 24) |
| Shared parameters flowing into every step | **Changed**: each step's own options, some of a kind Meno defines (solvent, temperature, pressure); restraints as a table | values that arrive by themselves are not wired |
| Lone atoms routed by Meno (question 8) | **Changed**: no routing; the kind's meaning, held by the plugins | routing was core acting by itself |
| Second exits only where declared (question 19) | **Changed**: a second exit wherever entries can fail or be set aside | the maintainer's retries need them |
| Collections, members, large-set views | **Kept** | they hold and show data; they decide nothing |
| Fingerprints, snapshots, the store's signal | **Kept** | bookkeeping, under every node alike |
| Keeping (question 12) | **Changed**: everything kept by default; *Don't keep in the file* per set; raw outputs left where they ran unless brought in | the maintainer: keep everything, with a way not to |
| Fixed numbering; properties with their geometry and units; identity | **Kept** | rules about data, not nodes |
| Runners; templates | **Kept** | each chosen on the step, explicitly |
| Implicit conversions (molecules to a table view, units) | **Kept** | views that lose nothing |
| Kinds filled by plugins | **Kept** | each was already one role |
| Loops later (question 11) | **Kept** | retries drawn as copies need no loop |

## The points, revised

The thirteen points of the first draft, as they stand now.
1. **One exit per output.** Today two ports give one step's results. Now
   every declared exit is a result set, made with the step.
2. **Typed inputs and outputs.** Today `givesOf` walks wires back, and a
   step not run takes anything. Now the types above, fixed when wired, are
   said on hover and on refusal.
3. **What a set holds.** Today it is geometric (`setMembers`, reading order
   0.9 units apart). Now explicit members are kept in collections.
4. **What passes between steps.** Today it is loose `Molecule3D` fields:
   shares are dropped, there are two ideas of charge, and two Boltzmann
   distributions. Now there is one entry record, with properties that carry
   their units and geometry.
5. **Partial failure.** Today a run is ok or not. Now *done* and *failed*
   are exits, and runs again are drawn.
6. **Staleness.** Today it is a hash over some inputs, missing a calculation's
   charge and the doer's version. Now a fingerprint over the inputs'
   collection hashes, the kind, the resolved options and templates, and the
   doer's versions.
7. **A run's input.** Today it is read again at the end (#399 keeps it in
   memory). Now the snapshot is the input collections' hashes, saved with the
   run, and each store has a signal on close.
8. **Outputs that are not molecules.** Today pictures are special-cased in
   eight places. Now tables, numbers, charts, models, pictures and files are
   types.
9. **Layout.** Today result positions are stored and repaired by
   `fitResultSets`. Now layout is worked out where it is shown, unless the
   chemist arranged it.
10. **One atom, no electrons.** The kind's meaning is held by the plugins; no
    routing in core.
11. **Numbers on the page.** Every number names what it counts and its unit,
    by a test over every summary.
12. **What a run keeps.** Its doer and versions, its runner, its snapshot,
    its logs, its output collections, and records of raw outputs left where
    they ran.
13. **Conformers.** A conformer set is molecules whose *group* is their
    compound. *Populations*, *Rank*, *Relative* and *Filter* work in each
    group; a manifest may say `together`.

## Seven cases, end to end

Computational chemistry first and in most detail: F (ConfoTS) and G (a
conformer ensemble to NMR and ECD). Then A to E, mostly cheminformatics.
Each node is named with who does it: *Meno*, *ACCeL*, or a program plugin.
ConfoTS's folders and options are in brackets, so that the two can be read
side by side.

### F. ConfoTS on Meno

**The case** (cases 2, 4, 5, 6, 14): a Diels-Alder with one reactant, as in
the showcase's first example. The reactant *a* and two products *b* and *c*
drawn side by side, in chloroform. Which product forms faster, and by how
much?

**On the page:** set **R** holds the reactant drawn (two reactants are made
one complex by *Combine*); set **P** holds the products drawn.

**F1. The reaction** (step 0)
1. **Reaction** (ACCeL): *reactants* R, *products* P. It gives *mapped
   products* P′, which are *b* and *c* in *a*'s numbering [003, 004], and
   *bond changes* BC [ConfoTS's reacting bonds and atoms].

**F2. Conformers of each species** (step 1, first part)
2. **Merge** (Meno): R and P′ into S (*a*, *b*, *c*).
3. **Restraints** (Meno): from S, coordination bonds kept at 0.9 of the van
   der Waals distance, giving T1 [`lewis_distance_scaling`].
4. **Conformers** (a plugin) on S, with T1 where the plugin takes
   restraints. Each conformer's group is its species [100; ConfoTS uses a
   force-field search of 10,000 steps].
5. **Relative** then **Filter** (Meno): within 10 kcal/mol of the lowest in
   each group [`energy_limit_to_empopt`].
6. **Optimise** (xTB, GFN2), *done* [110].
7. **Duplicates** (ACCeL): RMSD 0.1 Å, with symmetry [`rmsd_limit`].
8. **Compare bonding** (ACCeL), each against the species it descends from in
   S, coordination bonds passed over: *same* [the bonds check].
9. **Relative**, **Filter** and **Rank** (Meno): within 5 kcal/mol, the first
   64 [`energy_limit_to_neb`, `max_limit_to_neb`].
10. **Filter** (Meno): the group is *a*. *kept* gives the reactant conformers
    RC; *rest* gives the product conformers PC.

**F3. Pairs** (step 1, second part)
11. **Re-bond** (Meno): *geometry* RC, *bonding* P′, each with each. It gives
    the ends E, grouped *a → b* and *a → c* [120]. Both directions take a
    second *Re-bond* (*geometry* PC, *bonding* R) and the same chain after
    it, merged before F4. ConfoTS chooses the direction from the conformer
    counts [`path_flag`]; here it is wired.
12. **Restraints** (Meno): from P′, coordination bonds and the double bonds'
    cis or trans, giving T2.
13. **Minimise with restraints** (a force-field plugin): E with T2.
14. **Compare bonding** (ACCeL) against P′, E or Z only. *same* goes on.
15. **Its *different*, again, drawn:** **Restraints** with the torsions 50
    units stronger, **Minimise with restraints**, **Compare bonding**, and a
    **Merge** with 14's *same*. Pasted once more for each further attempt
    [`max_cycle_of_force_mini`; the showcase used three rounds,
    120_recalc0-2].
16. **Optimise** (xTB) [122].
17. **Compare bonding** (ACCeL) against P′, with R or S and E or Z:
    *same* [`check_chirality`].

**F4. Paths and saddle points at the semiempirical level**
18. **Path search** (ORCA plugin: NEB with GFN2-xTB, 8 images). *start* is RC
    and *end* is 17's *same*, matched by lineage, since each end descends from
    its start. It gives paths [123].
19. **Take frames** (Meno): the highest energy, giving the guesses G [124].
20. **Measure** (Meno): the forming bonds, atoms from BC [`calc_length`].
21. **Duplicates** (ACCeL) [`rmsd_limit`].
22. **Frequencies** (xTB) [125].
23. **Filter** (Meno): exactly one imaginary vibration [`check_freq`].
24. **Follow the reaction path** (ORCA plugin, IRC with xTB) [125_F, 125_B].
25. **Take frames** twice (Meno): the first, and the last.
26. **Compare bonding** twice (ACCeL): each end against S, naming the
    species it matches (*a*, *b*, *c* or none) [128].
27. **Join** (Meno) by lineage: both names put back on the saddle points as
    *first end* and *last end*.
28. **Filter** (Meno): one end is *a* and the other the product the saddle
    point was made for. This gives the validated saddle points V [126].
    Without IRC, **Mode on atoms** (ACCeL, atoms from BC) and a **Filter**
    do instead [`check_bonding`].
29. **The sides for the three-structure optimisation**: 25's ends of V
    [`use_irc_terminal_for_qst`]; or **Take frames**, two frames before and
    after the highest, from 18's paths [`image_distance`].

**F5. The diagram at the xTB level** [130]
30. **Relative**, **Filter** and **Rank** (Meno): reactant and product
    conformers within 5 kcal/mol, at most 16. Then **Frequencies** (xTB)
    [114].
31. **Add** (Meno): the xTB energy plus its thermal correction to G, for
    them and for V. This is G at the xTB level.
32. **Rank** (Meno): the lowest of each species and each path.
33. **Energy diagram** (Meno): a chart.

**F6. DFT** (steps 2 and 3)
34. **Relative**, **Filter** and **Rank** (Meno): V within 10 kcal/mol, at
    most 16; the minima within 5 kcal/mol, at most 16 [`max_limit_to_dftopt`
    and the two energy limits].
35. **Optimise to a saddle point** (Gaussian plugin, on the cluster runner):
    *guess* V, with *reactant side* and *product side*, matched by lineage.
    The template is ωB97X-D/6-31G(d), opt=(QST3) [203, `qst_opt`].
36. **Optimise** (Gaussian), the minima [201, 202].
37. **Frequencies** (Gaussian), at the same level.
38. **Runs again, drawn**, as step 2's three rounds of resubmission:
    - *failed* → **Take frames** (the last reached) → **Optimise to a saddle
      point**, its template holding the remedy (another SCF algorithm, or
      force constants computed first) → **Merge** with *done*;
    - pasted once more for a third round. The failure kinds are those
      ConfoTS's helper script tells apart.
39. **Filter** (Meno): exactly one imaginary vibration for a saddle point,
    none for a minimum. Its *rest* goes to **Displace**, an optimisation
    again, and a **Merge**.
40. **Mode on atoms** (ACCeL), atoms from BC [step 3's `check_bonding`].
41. **Energy** (Gaussian): ωB97X-D/6-311+G(d,p), solvent chloroform
    [`model_sp`; the Link1 job].
42. **Number** (Meno): 1.89 kcal/mol, the standard-state term from 1 atm to
    1 mol/L at 298.15 K. Then **Add** (Meno): 41's energy, plus 37's thermal
    correction to G, plus 42. Each part is worked out at the same geometry,
    so *Add* takes them; the result is G at the DFT level.
43. **Duplicates** (ACCeL), then **Populations** (Meno) in each group
    [`calc_distribution`].
44. **Rank** (Meno), the lowest in each group, or **Ensemble energy** (Meno)
    over each.
45. **Relative** (Meno): each saddle point against the reactant, giving ΔG‡
    per path.
46. **Populations** (Meno) over the saddle points of both paths, as one
    group: the share of each path, which is the ratio of *b* to *c* at
    298.15 K.
47. **Energy diagram** (Meno): a chart [310].

**F7. IRC at the DFT level** (steps 4 and 5)
48. **Rank** (Meno): the first in each path [401, 402]; or all [403, 404].
49. **Follow the reaction path** (Gaussian) [501].
50. **Take frames** (first, last), **Optimise** (Gaussian) [502], **Compare
    bonding** (ACCeL, naming), **Join** and **Filter** (Meno): each path
    joins the species it claims.

**The nodes F uses:**
- **Meno's** (15): Merge, Restraints, Relative, Filter, Rank, Re-bond, Take
  frames, Measure, Join, Displace, Number, Add, Populations, Ensemble
  energy, Energy diagram.
- **ACCeL's** (4): Reaction, Duplicates, Compare bonding, Mode on atoms.
- **Program plugins'** (8): Conformers, Optimise, Minimise with restraints,
  Path search, Frequencies, Follow the reaction path, Optimise to a saddle
  point, Energy.

Each appears as often as F needs it: some sixty nodes on the page for the
whole of ConfoTS, both directions and the retry copies included. Any part
can be saved and put down again (question C).

**F8. Where it runs and what it keeps**
- **Where.** The xTB nodes run on this computer or the cluster, and the DFT
  nodes on the cluster (*Runs on*).
- **How much output.** The showcase's example keeps about 580 MB in the parts
  it shows:
  - 170 MB of NEB output;
  - 180 MB of DFT optimisations;
  - 70 MB of collected DFT logs;
  - 47 MB of IRC output.

  These stay on the cluster unless a step is told *Bring raw outputs into the
  workspace*. Everything Meno read, and every collection, is kept in the
  `.meno` by default.

**F9. Against the ten points asked for, last round:**
1. **Reactions and their numbering**: the *Reaction* node, the fixed
   numbering.
2. **Pairs**: *Re-bond*, with inputs matched by lineage.
3. **Paths**: entries with frames, and *Take frames*.
4. **Stationary points and their validation**:
   - the imaginary count as a property, and *Filter*;
   - *Mode on atoms*;
   - *Compare bonding* with *Join*.
5. **Levels of theory**: properties with their geometry; *Add*.
6. **Barriers and diagrams**: *Relative*, *Populations*, *Energy diagram*.
7. **Failure and runs again**: the *failed* exit, drawn chains, *Merge*.
8. **Where jobs run**: runners.
9. **Templates**: the program plugins' options.
10. **Bond changes and restrained minimisation**:
    - *Reaction* and *Compare bonding* are ACCeL's;
    - *Minimise with restraints* is a force-field plugin's;
    - *Restraints* and *Re-bond* are Meno's.

### G. A conformer ensemble to NMR and ECD

**The case** (cases 1, 2, 3, 14, 16): a natural product with two candidate
diastereomers, drawn into one set. Which relative configuration do its ¹H
and ¹³C shifts support, and which absolute configuration does its ECD?

1. **Conformers** (CREST): each conformer's group is its candidate.
2. **Relative**, **Filter** (Meno), within 6 kcal/mol, then **Duplicates**
   (Meno's, or ACCeL's with symmetry).
3. **Optimise** (ORCA or Gaussian, B3LYP-D3(BJ)/def2-SVP, on the cluster).
   Its *failed* exit is run again as in F, if wanted.
4. **Frequencies**, then **Filter** (Meno), no imaginary vibration. *rest*
   goes to **Displace**, **Optimise**, **Frequencies** and a **Merge**.
5. **Energy** at a higher level, with the solvent.
6. **Add** (Meno): the energy plus the thermal correction to G, at one
   geometry. The CREST energies stay on the entries, marked as of an earlier
   geometry, and *Add* does not take them.
7. **Populations** (Meno), in each group at 298.15 K. **Filter** (Meno):
   share at least 1 %. **Populations** again, for the shares of those kept.
8. **NMR shielding** (a plugin, GIAO, in the solvent): shieldings per atom,
   in each candidate's drawn numbering.
9. **Equivalent atoms** (Meno): a methyl's three hydrogens averaged;
   diastereotopic ones not.
10. **Linear** (Meno): shifts from shieldings, by element, with *a* and *b*
    for that level. Or by a reference: tetramethylsilane worked out alongside,
    **Relative** to its shielding, then **Linear** with *a* = −1.
11. **Average** (Meno), weighted by the shares, in each group: one entry per
    candidate.
12. **The measured shifts**, a table read from a CSV keyed by the drawing's
    atom numbers (a hydrogen by the atom it is on). **Join** by drawn atom,
    then **Errors** (Meno): a table of the mean absolute errors per
    candidate. **Chart** (Meno): computed against measured.
13. **Excited states** (a plugin, TD-DFT, 30 states) on 7's conformers,
    **Broaden** (Meno: Gaussian, 0.3 eV, nm), then **Average** (Meno),
    weighted: one curve per candidate.
14. **The measured ECD** as a table, then **Curve similarity** (Meno). Also
    **Linear** with *a* = −1 (the mirror image), then **Curve similarity**
    again. The absolute configuration is the one whose curve, or its mirror,
    matches.

**The nodes G uses:**
- **Meno's** (15): Relative, Filter, Duplicates, Displace, Merge, Add,
  Populations, Equivalent atoms, Linear, Average, Join, Errors, Chart,
  Broaden, Curve similarity.
- **Program plugins'** (6): Conformers, Optimise, Frequencies, Energy, NMR
  shielding, Excited states.

A probability between the candidates, of the DP4 kind, is a plugin's first,
as answered (question 29).

### A. Generate, predict, filter, then calculate

*Cases 7, 8, 9, 13.*

1. **Generate** (a plugin): a target table, 10,000 structures, a seed.
   *done*: 9,962 graphs. *failed*: 38, each with the generator's reason.
   The set shows a summary.
2. **Describe** (a plugin): logP and pKa, with model and version. 41 have no
   pKa: *not applicable · no basic site*.
3. **Filter** (Meno): logP between 1 and 3, and pKa above 7. 1,204 kept;
   *41 had no pKa*.
4. **Rank** (Meno), by a third property, keeping 40. Forty fit the page.
5. **Conformers**, then **Optimise** (xTB).
6. **Generate** run with another seed makes a new collection. Everything
   after it is *Changed upstream*.

**The nodes:** Meno's Filter and Rank; plugins' Generate, Describe,
Conformers, Optimise.

### B. Similarity and clustering on a library

*Cases 10, 13.*

1. A 200,000-compound SD file is opened as a set: a summary, never drawn
   whole.
2. **Similarity** (a plugin) to a drawn query. Its fingerprints are kept as
   packed vectors (in the file, by default, as the maintainer asked); 51 MB
   for 200,000 at 2,048 bits.
3. **Filter** (Meno): 0.6 or more, 3,180 kept. **Cluster** (a plugin): each
   entry's group is its cluster.
4. **Rank** (Meno): the first in each group, 212 entries. Thirty are put on
   the page from the table.

**The nodes:** Meno's Filter and Rank; plugins' Similarity and Cluster.

### C. Docking, with properties joined back

*Cases 11, 16.*

1. **Dock** (a plugin): *ligands* (A's forty), *target* (a protein opened
   from a PDB file). The poses' group is their ligand, each with a score in
   kcal/mol.
2. **Rank** (Meno): the first in each group, the best pose of each ligand.
3. **Join** (Meno) by lineage: the scores back onto A's forty, with their
   logP and pKa.
4. The set taken as a table goes to an Export as CSV.

**The nodes:** Meno's Rank and Join; a plugin's Dock.

### D. Train and predict

*Cases 12, 16.*

1. A CSV of measured pKa with SMILES, opened as a table.
2. **Join** (Meno) by identity onto molecules drawn in a set. 37 of 40 rows
   match; the three that do not are listed.
3. **Train** (a plugin) gives a model, its frame saying what it takes and
   gives, and its training set's hash.
4. **Predict with a model** (a plugin) on A's 1,204.
5. Retraining makes a new model, and the predictions are *Changed upstream*.

**The nodes:** Meno's Join; plugins' Train and Predict with a model.

### E. A loop: generate, score, filter, generate again

*Case 15. Later, by design* (question 11, answered).
- **Today it is drawn by hand**: the scored set is joined back as the seeds
  of a pasted copy of the chain.
- **Later, a repeat frame**: one wire allowed back from a chain's end to its
  start, passes kept as runs, a bound and a stop condition.
- **The base does not need it.** F's and G's runs again are drawn as copies:
  nothing in them loops.

## Branching and merging

- **Branching** is several wires from one exit, as F does from its validated
  saddle points to the xTB diagram and to DFT.
- **Merging** is **Merge** (all, or one of each identity) or **Join**: by
  lineage (C, F), by identity (D), or by drawn atom (G).
- **A join says what it did not match**, and never guesses.

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
   - `Entry` and `Property`, with their value shapes, the geometry each was
     worked out at, and units.
   - Lineage with one or more parents.
   - The fixed numbering, written down and tested on the steps there are.
   - Species by one rule; Meno's units table; one Boltzmann function.
   - PLUGINS.md documents the plugin entry, with a version number.
2. **Identity and symmetry classes**, from #319's canonical numbering once it
   is merged.
3. **Collections, members and keeping.**
   - Collections in the file; members explicit and in order; the frame's
     gesture as the edit.
   - *Don't keep in the file*; raw outputs left where they ran, *Bring raw
     outputs into the workspace*.
   - Workspaces saved before read their members from their frames once
     (question 7, answered).
4. **Fingerprints, snapshots and the store's signal**, with *Changed
   upstream*.
5. **Ports and exits.**
   - Named, typed inputs, matched by lineage.
   - Every exit a result set; second exits (*done* and *failed*, *kept* and
     *rest*).
   - The types and their conversions; pictures as a type; the card's give
     port gone.
6. **Large sets**: the summary frame, the table in the column, putting
   entries on the page; layout worked out where shown.
7. **Meno's nodes for sets and numbers**: *Filter*, *Rank*, *Group*,
   *Merge*, *Join*, *Duplicates*, *Number*, *Add*, *Relative*, *Linear*,
   *Populations*, *Ensemble energy*, *Average*. Today's *Energy window*,
   *Choose one* and *As conformers* go.
8. **The plugin contract.**
   - Entries by file at scale; properties, failure kinds and the frames
     reached on *failed*; restraints applied; templates; the option kinds
     (solvent, temperature, pressure); `together`.
   - The existing plugins (xTB, CREST, ORCA, Gaussian, RDKit) moved onto it,
     each holding its kinds' meaning for a lone atom in its tests.
9. **Tables, numbers and charts on the page**: tables read from files;
   *Chart* and *Energy diagram*.
10. **Meno's nodes for structures and spectra**: *Species*, *Combine*,
    *Re-bond*, *Restraints*, *Measure*, *Take frames*, *Displace*,
    *Equivalent atoms*, *Broaden*, *Errors*, *Curve similarity*.
11. **The ACCeL plugin**: *Reaction*, *Compare bonding*, *Duplicates*,
    *Number like*, *Mode on atoms*. ACCeL is first installed here, into the
    plugin's own environment, for building and testing it.
12. **The computational-chemistry kinds opened**: *Minimise with restraints*,
    *Path search*, *Optimise to a saddle point*, *Follow the reaction path*,
    *NMR shielding*, *Excited states*. Then one PR per plugin filling them:
    - ORCA: NEB, IRC, NMR, excited states;
    - Gaussian: saddle points with one or three structures, IRC, NMR,
      excited states;
    - xTB: restraints;
    - a force-field plugin for restrained minimisation.
13. **Runners**: the seam and this computer's runner; then, its own PR, a
    cluster runner plugin.
14. **The cheminformatics kinds and models**; then their plugins.
15. **What a run keeps**: doer, runner, logs, records of raw outputs.
16. **Loops**: a design of their own, later.

**When the cases run:**
- **G** runs on this computer after 12 and its plugins.
- **F** runs on this computer after 12 for its xTB parts, and on a cluster
  for DFT after 13.
- **A to D** run after 14 and their plugins.

## What is core's and what is the plugins'

**Core keeps what holds the workflow together, and knows no program,
scheduler or model by name:**
- **values**: the types and conversions, entries and properties, Meno's
  units table, and the option kinds (the list of solvents, temperature,
  pressure);
- **structure**: identity and symmetry classes, the fixed numbering, lineage;
- **collections**: their storage, hashes and keeping; sets and their
  members;
- **the workflow**: steps, ports, exits, wires, and the kinds (names, inputs,
  exits, meaning);
- **running**:
  - states and fingerprints;
  - snapshots and the store's signal;
  - the scheduler;
  - the runner seam, and this computer's runner;
- **on the page**: summaries, tables, charts, and the words on the page with
  their rule;
- **Meno's 26 nodes** (*Meno's own nodes*): arithmetic, geometry and data
  handling on Meno's own data, each written from what it computes.

**ACCeL's plugin fills** *Reaction*, *Compare bonding*, *Duplicates* (with
symmetry), *Number like* and *Mode on atoms*, using ACCeL as a library. No
ACCeL code is in core.

**Program plugins fill** the calculation, computational-chemistry and
cheminformatics kinds, and read their own outputs. **Runner plugins** run
jobs elsewhere. In their manifests they declare:
- the kinds they fill;
- what they take, where that is less than the kind takes;
- the properties they give, with names and units;
- their failure kinds;
- the restraints they apply;
- their options and templates;
- `together`;
- the model formats they read.

**The guards.** The boundary guard (`src/lib/plugins/boundary.test.ts`)
keeps program, scheduler and model names out of core. Property and failure
names given by plugins are data, never literals in core. Core names only the
quantities its own nodes compute or use: *energy*, *thermal correction*,
*share*, *degeneracy*, *vibrations*, *group*, *shielding*, *excited
states*.

## Questions this round raises

Each has a recommendation.

**A. Matching by lineage.** Where a node takes two inputs entry by entry
(*Path search*, *Re-bond*, *Optimise to a saddle point* with its two sides),
are entries matched by lineage? That is: each with the one it descends from,
or the one it shares its nearest ancestor with; each with each where the kind
says so; refused otherwise. And may an entry have more than one parent (a
*Re-bond*'s geometry and bonding)? This replaces the paired entries of
question 22.
*Recommended: yes, both.* No pair type is needed, and the rule is the same
for every node.

**B. Second exits** (revisiting question 19). Should every node that can
fail entries, or set them aside, have a second exit for them (*failed*,
*rest*, *different*), drawn small under the first until it is wired or
opened?
*Recommended: yes.* Runs again are drawn from it, and nothing is hidden.

**C. Saving a chain.** Procedures are whole workflows today (decided
2026-10-08). May a chain of wired steps also be saved as a procedure, and
put down onto an exit? Examples: a retry chain, F's IRC check, G's NMR
scaling.
*Recommended: yes.* Copy and paste already repeats a chain once; a saved
chain makes the common ones a single choice in Quick Add, and stays fully
visible once put down.

**D. One atom** (revisiting question 8). Instead of Meno routing a lone
atom's *Optimise* to *Energy*, does each plugin keep doing it, as the kind's
written meaning, held by its tests?
*Recommended: yes.* Routing in core was a node acting by itself.

**E. Options shared in kind** (revising part of question 27). Instead of
workflow-wide parameters, does each step keep its own options, with
solvent, temperature and pressure as option kinds Meno defines? And are
restraints a table, made by *Restraints*?
*Recommended: yes.* Nothing arrives at a step unless it is wired or set on
it.

**F. Meno's 26 nodes** (*Meno's own nodes*). Is that the set to build, in
place of today's five?
*Recommended: yes.* Each is one role. F and G between them use 23 of the 26.
*Group*, *Species* and *Combine* are for cases with several compounds to
regroup, a charge the atoms do not say, or two reactants that meet.

**G. Today's three in saved workspaces.** Is it right that *Energy window*,
*Choose one* and *As conformers* are left out when an old workspace is
read, their result sets kept as plain sets, with no converter?
*Recommended: yes*, said in the PR. The reader already leaves out kinds it
does not know.

**H. ACCeL's plugin and version.** Do these hold?
- It fills *Reaction*, *Compare bonding*, *Duplicates* with symmetry,
  *Number like* and *Mode on atoms*.
- It is built on `accel` 0.3.0 from PyPI, while GitHub's master is 0.3.1.
- Meno keeps the arithmetic nodes ACCeL also has.

*Recommended:*
- *yes*;
- *0.3.0*, pinned as every plugin's packages are. If the plugin needs what
  0.3.1 adds, the maintainer releases 0.3.1 to PyPI first;
- *Meno keeps the arithmetic nodes*, so they work whichever plugins are
  added.

**I. Keeping.** Is everything kept in the `.meno` by default, with *Don't
keep in the file* on a set? And do raw outputs stay where they ran unless a
step is told *Bring raw outputs into the workspace*?
*Recommended: yes.* That is the maintainer's "keep everything, with a way
not to", with raw outputs, which can be GB, the one default the other way.

**J. A failed entry's frames.** Does a *failed* exit give each entry the
frames its program reached, so that *Take frames* (the last) restarts from
the last geometry?
*Recommended: yes.* Restarting from the last geometry is then a node, not a
setting.

**K. Representing a group.** Where *Ensemble energy* and *Average* give one
entry per group, does the group's entry of highest weight stand for it,
carrying the results?
*Recommended: yes.* The result keeps a real structure and geometry, which a
diagram or a table can show.

## Answered (2026-10-16)

- **As recommended:** 1 to 11, 13 to 15, 17 to 19, 22, 23 and 25 to 30. The
  principle under 20 reopens three of them: 8, 19 and part of 27 (questions
  D, B and E). It also replaces 22's paired entries (question A), and moves
  30's mapping and checks to ACCeL.
- **12:** keep everything, with a way not to (*Keeping*; question I).
- **16:** Meno's own nodes redone as a small, clean set (*Meno's own nodes*;
  questions F and G).
- **20:** don't over-abstract: the governing principle, *The principle:
  simple nodes, wired*.
- **21:** an ACCeL plugin fills the mapping, and more (*The ACCeL plugin*;
  question H).
- **24:** no advanced nodes for retries: drawn (*Failed entries, and running
  them again*; questions B and J).
