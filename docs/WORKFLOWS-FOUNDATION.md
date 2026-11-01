# Workflows: the foundation, rebuilt (agreed 2026-10-17)

The design, as the maintainer agreed it on 2026-10-17 after five
revisions: the record the foundation's PRs (*In order: the PRs*) are built
from. Nothing in it is built until those PRs say so.

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

The answers given on the third and fourth drafts are recorded at the end
(*Answered*).

**The fifth revision** follows the maintainer's decisions of 2026-10-16,
made after this design was compared with the second version of ACCeL, the
maintainer's own library:

> Meno is the base. Meno owns the store (.meno), the graph, provenance, the
> 'has this been done' judgement, and where jobs run.

- **Atom mapping is Meno's own**, a basic feature of drawing reaction
  schemes, used by the *Atom map* node as by the 2D canvas. The nodes ACCeL
  might have filled are each decided (*Atom mapping, and what Meno does
  itself*): all are Meno's, and no ACCeL plugin is part of this plan.
- **Five mechanisms of ACCeL's second version are adopted, as Meno's own**:
  a job key from the input files and versions; never overwriting; stopping
  on outputs Meno cannot account for; a local runner that knows its
  resources; cluster jobs that are submitted and taken up again (*Where jobs
  run, and when a job is the same job*). There is one source of truth.
- **Inputs are matched on IDs a node wrote**, never by an implicit rule
  (question A).
- **The `.meno` holds everything**, raw outputs included, and the working
  directory is scratch (question I).

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
- **IDs.** *Tag* writes an ID on each entry, it rides along through later
  steps, and a node with two inputs matches them on it. No "pair" type is
  needed, and no rule guesses which entries belong together (*Steps, ports
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
   GB of output, all of it kept in the workspace unless the chemist chooses
   otherwise.

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
- two inputs are matched on an ID they carry;
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
              (order, stereo, coordination), in the entry's fixed
              numbering, from 0
  geometry    none (a graph); 2D as drawn; one 3D geometry; or frames
  species     charge and multiplicity, and where each came from: the
              chemist, a calculation it was read from, or its atoms
  properties  name -> Property, an open map
  stereo      which stereoisomer it is, from its own geometry: its
              elements that could be stereogenic, and a key two entries
              share exactly when they are one - or not perceived, and why
              (PLUGINS.md, *Configurations*)
  status      done, failed or set aside, with the reason
```

```
Property
  value       a number, a text, true/false, an entry id, a list - which
              says what it is per: atom, frame or point (a curve's) -
              a vector (a fingerprint), a small table (one row per
              vibration or per excited state, each column with its own
              unit), a vibration's modes (one row per mode, x, y and z
              by atom), or restraints
  unit        for each number in it, from Meno's units table, or "none"
              (a table, modes and restraints: "none", their numbers
              carrying their own)
  at          the geometry it was worked out at (its hash) and, where it
              applies, the temperature and pressure the program used,
              and the solvent with its model as the program names them
              ("ALPB(water)")
  by          the step and run that gave it; the plugin and version; the
              program, method and basis, or the model and its version;
              for a thermal quantity, the treatment of its vibrations
              and the symmetry it took (point group, symmetry number)
  status      computed, failed (why), or not applicable (why)
```

**A calculation's readings, as an entry's properties** (2026-10-22;
`workflow/entries.ts`, `entryOfSet`). Each entry a step gives carries what
its calculation read of that geometry (the last frame's alone: a reading
is of one geometry). Of those, these become properties, each by the
reading's own id, the one name every plugin that reads it gives it:
- `energy`, in hartrees, at its geometry and in the solvation the program
  said it used (`at.solvent`: "none", the gas phase said; left out, not
  said), by the plugin that read it, the program, method and basis;
- the thermochemistry, each in hartrees: `thermo.free-energy` (the total
  G), `thermo.enthalpy` (the total H), `thermo.zpve` (the zero-point
  energy alone, not E + ZPE) and `thermo.g-correction` (G - E). Each at
  the temperature (`thermo.temperature`, K) and pressure
  (`thermo.pressure`, atm) the program said it used - none where it said
  none, never one assumed - and in its solvation; by what worked it out,
  with the treatment of its vibrations as the program said it
  (`thermo.treatment`), and the symmetry it took as the program printed
  it: `by.pointGroup` and `by.symmetryNumber`, the rotational symmetry
  number its rotational entropy counts (`thermo.point-group`,
  `thermo.symmetry-number`; 2026-10-30). A G is worked out with its own
  sigma, so its sigma is on it: wherever the value goes - carried by a
  later step, copied as a part of a sum - its symmetry goes with it, one
  source. None printed, none said, never one assumed. Being the
  molecule's, not a way of working out, it never keeps two values apart
  as program or treatment do: two molecules' differ by right. A reading
  that is not an energy in hartrees is not taken;
- `vibrations`, a table of each vibration's frequency (`FREQUENCY`, cm-1,
  an imaginary one negative) in the program's order, from the list whose
  column is a wavenumber; and `modes`, in the same order, where every
  vibration gives its atoms' displacements (not a promise of them). What
  else that list has - reduced masses, intensities - stays among the
  readings: an entry's columns take only units Meno's table has.

Populations reads `thermo.free-energy`, and groups only values worked out
alike: the same temperature, solvent and pressure, by the same program,
method, basis and treatment.

**A method and a basis, whatever their case** (2026-11-01; lib/nodes
`alikeIn`). Wherever values are compared for how they were worked out -
*Rank*, *Relative*, *Ensemble energy*, *Populations*, *Duplicates*,
*Barrier*, and sums made by *Add* - a method or a basis named in another
case is the same one: inputs name them either way ("B3LYP", "b3lyp"), and
a program prints each as its input named it. Each is shown as read. Case
is all that is passed over: "6-31G*" and "6-31G(d)" are two names, and
are told apart.

**Shapes a value takes** (`src/lib/entry.ts`, `valueFault` holds each to
its entry):
- **a list says what it is per**, always: three numbers are three atoms'
  or three frames' otherwise. A list per atom is as long as the entry's
  atoms, per frame as its frames;
- **a table's columns carry their units** - a frequency in cm-1 beside a
  symmetry with none - and its rows are as wide as its columns. In a
  table of vibrations (the property `vibrations`) the first column is
  `frequency` (`FREQUENCY`), in cm-1, an imaginary one a negative number,
  as the programs print it;
- **modes** are as the program gave them, in the vibrations table's row
  order; no step relies on how they are scaled;
- **a restraint** is a distance between two atoms (Å), held by
  E = k d²/2 with k in kcal mol⁻¹ Å⁻²; a dihedral of four (°), held by
  E = k φ²/2, φ in radians the shorter way round, with k in
  kcal mol⁻¹ rad⁻²; or atoms fixed, with neither value nor strength. Atoms are by their number from 0, as a
  bond's. Every plugin that takes restraints holds them by these energies,
  or refuses them in words (PLUGINS.md);
- **a coordination bond** is marked so, from a drawing or a reader that
  knows it, so that a restraint keeps it as one.

**Properties instead of fields.** Everything a step finds is a property:
- an energy, with its kind (electronic, ZPE-corrected, free energy);
- thermal corrections at a temperature and pressure;
- vibrations (a small table), and the count of imaginary ones;
- a share, with its temperature;
- a degeneracy;
- an entry's group, its given text (a SMILES from a generator), its name.

**The numbering is fixed.** An entry's atoms are numbered once, when its
structure is first made (drawn, read, generated), and no step renumbers
them but *Atom map*, which gives an entry in a reference's numbering, and
says so.
- **A program that reorders atoms has them mapped back** by its plugin
  before entries are given. The conformer searches keep the order. Meno's
  own page lays a structure's equivalent atoms across its conformers as its
  first has them (WORKSPACE.md, *The page's conformers*); a workflow's
  entries are never so moved.
- **The *Atom map* node gives the products in the reactants' numbering**,
  and a species' conformers in its numbering, each equivalent atom (a
  methylene's hydrogens) where the species' own 3D has it. From there,
  "atom 7" means the same atom, on the same side, in every conformer,
  path, transition state and IRC end of the reaction.
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

What it compares (`src/lib/chem/identity.ts`, 2026-10-21):
- each atom's element, charge, mass number and unpaired electrons, and the
  bonds between them;
- each stereocentre's, double bond's and axis's configuration as drawn;
- aromatic rings as one form: a structure's Kekulé structures, and
  bond-shift isomers, are one structure. A bond made one order there keeps
  no cis or trans of its own;
- a plain hydrogen atom as one of its neighbour's hydrogens, with its
  configuration carried to the atom it is on (`hydrogensFolded`). A
  hydrogen stays an atom where it is charged, has an unpaired electron, is
  one isotope in particular, is mapped to a reaction's atom, is bonded to
  another hydrogen, bridges two atoms, is on a metal, or is in a pi system
  bound to one.

The texts are compared, not their keys. `identity` also says whether the
canonical search was complete: where it ran out of steps (`settleBudget`),
one structure may be written two ways, so a duplicate can be missed, but two
different structures are never written the same. A drawing's structures are
read for it by `chem/identityOf.ts`, which also names any atom whose wedges
it could not read. The rule is checked against RDKit's canonical isomeric
SMILES of the molfiles Meno writes (`chem/testdata/identity.rdkit.json`,
made by `scripts/identity/rdkit.py`, with RDKit's version and the commands
that made it). The fixture holds each molfile by its SHA-256: the test
writes the molfiles again and checks them against it. The bond-shift
isomers, which Meno's rule takes as one structure, are listed by name.

**Lineage.** `from` lists the entry or entries an entry was made from. An
optimised conformer has one parent; an entry made by *Re-bond* has two: the
one whose geometry it took and the one whose bonding it took. Lineage is a
record, for provenance. No node matches entries by it.

**Properties ride along.** An entry made from another keeps its properties,
each still saying the geometry it was worked out at. That is how an ID
written by *Tag*, a name or a group reaches the steps after.

### Sets and collections

**Entries live in collections, not on the page.**
- **A collection** is an ordered list of entries. It is never changed once
  made: a step makes a new one.
- **Its hash** is worked out once, when it is made, from its entries' own
  hashes.
- **A set on the page shows a collection.** A set the chemist makes holds the
  page's own molecules and drawings, and Meno makes its collection from them
  on each edit.

**Keeping: the `.meno` is the whole record.** The maintainer, refining
question I: "If possible, I'd like it to be complete inside the .meno file
alone. The ideal is that taking the .meno out takes everything out."
- **Kept by default, all of it:** every collection and property,
  fingerprints included, and every job's input files, output files and raw
  files, for local and cluster runs alike. They are kept beside the files the
  workspace already keeps by their SHA-256 (`files/<sha256>`), compressed.
  Opening a `.meno` on another computer shows everything, raw outputs
  included.
- **Not kept, by choice** (question 12, "a way not to keep it"):
  - a set's menu has *Don't keep in the file*: its collection is left out,
    and only its hash and count are kept. Opened again, it says *Not kept ·
    12,480 molecules* until its step runs again, and the steps after it stay
    valid, since what they ran on is recorded by hash;
  - a step's menu has *Don't keep raw outputs*: the values and logs Meno read
    stay, and the raw files go.
- **A size warning.** When a save would take the workspace past 500 MB, Meno
  says so, names the largest steps, and offers *Don't keep raw outputs* on
  them. It never drops anything by itself.

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

**Two inputs are matched on an ID, never by an implicit rule** (question A,
answered: "Don't make implicit and specific indicators... embedding IDs and
pairing based on those IDs"):
- **IDs are written by a node.** *Tag* gives each entry a property holding
  an ID of its own, under a name the chemist gives (*start*, *product*,
  *path*). It rides along, so an optimised end still carries the *start* its
  geometry came from.
- **A node that takes two or three inputs entry by entry matches them on a
  property the chemist chooses on it**: each entry of one input with the
  entry of the other that has the same value. *Path search* matches *start*
  and *end*; *Optimise to a saddle point* matches *guess* and its two sides.
  An entry without a match goes to the *rest* exit, counted, and so does one
  with more than one.
- **Where one input goes with every entry of the other**, the node says so
  plainly (*Re-bond*: each with each).
- **Lineage stays a record.** No matching depends on it.

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

### Where jobs run, and when a job is the same job

As answered (question 25), and with the mechanisms ACCeL's second version
was designed with, adopted here (2026-10-16). Meno owns them all: there is
one source of truth.

**What runs where:**
- **A program plugin says what to run**: the program; arguments, files and
  standard input; the files to read back; what to do after; and the
  resources it needs (cores, memory, time).
- **A runner says where.** A runner is a plugin role of its own: it
  submits, says how a job stands, fetches the files asked for, stops,
  cleans up, and knows where programs are on its machine.
- **This computer's runner** is the one built today (`Meno --job`,
  `src-tauri/src/jobs.rs`), moved onto the seam.
- **Cluster runners are plugins**, for batch schedulers over SSH. Core knows
  no scheduler.
- **Each step's own option**, *Runs on*, chooses the runner, with defaults
  in Settings.
- **Credentials are never Meno's.** A cluster runner signs in through the
  system's own SSH configuration and agent. Meno stores no password or key,
  and its hosts are granted as other network access is.

**A job's key.** A calculation's job key is the hash of the input files it
writes, plus the program's version and the plugin's.
- **Same key, same result.** A job whose key the workspace has already run
  to the end is not run again: its kept result is used, and the card says
  *Reused*. This holds across steps and across runs.
- **The step's fingerprint** (point 6) stays the step's. The job key is per
  job, and is what decides "has this been done".

**Never overwrite.** A run, an attempt, a job's files: nothing is written
over. A new run adds. The run before it stays in full, and so does every
run the chemist keeps; older ones are dropped only once the step's menu
has said so before the run (WORKFLOWS.md, *Earlier runs*: the
maintainer's ruling, 2026-10-22).

**An output Meno cannot account for stops the step.** On taking up a job
(after Meno was closed, or from a cluster), Meno checks what it finds:
- a job folder without its record;
- files whose key is not the job's;
- outputs from a run Meno did not start.

Any of these stops the step with *Output Meno cannot account for*, naming
the files. An explicit *Adopt* lets the chemist take it as the step's
result, recorded as adopted, with when.

**This computer's runner knows its resources.** It runs jobs while their
cores and memory fit what is free, and keeps the order they were asked
for: a job never jumps ahead of an earlier one. A job's cores and memory
are what its plugin declares; what the runner may use is capped in
Settings, all cores and three quarters of the memory by default.

**Cluster jobs are submit-and-return.** Meno submits, keeps the job's record
(scheduler, its job id, the key), and returns. It takes the job up again
from that record whenever the workspace is open, or when it is opened
again. No Meno process waits on a cluster.

**The working directory is scratch** (question I, refined):
- it is where a program physically runs. For this computer it is set in
  Meno's Settings, Meno's own folder by default; a cluster runner has its
  own setting for its machine;
- its folders' names are path-safe: ASCII letters, digits and hyphens
  only, from the workspace's, step's and entry's names with a short id
  (`binol-opt-3f9a`). A workspace or step named with spaces or Japanese
  is a known risk in a path: the Mac was checked safe on 2026-10-14 only
  with job folders named by ASCII ids, and Windows never was. The
  readable names are for display only: in the folder list, and on *Open
  the folder*, which is on a step's and an entry's menu;
- a program still runs with its job folder as its working directory and
  is given its files by bare name, as today;
- once a job has ended and its files are saved in the `.meno`, its scratch
  is cleaned on its own, unless *Keep job folders* is chosen in Settings;
  nothing depends on it afterwards;
- running again, or continuing, from a `.meno` elsewhere writes the inputs
  back out of the `.meno` into a new scratch;
- a runner still takes only job specifications Meno wrote.

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
  its program's model and keyword, and says when there is none for that
  solvent;
- **temperature** and **pressure**, with units.

Charge and multiplicity are each entry's *species*, not options. A *Species*
node sets them where the atoms do not say it.

**Restraints are a property** (`restraints`), made by the *Restraints* and
*Torsion restraints* nodes, riding with each entry to the steps whose
plugins apply them. Each row is one restraint:
- distance, torsion, or fixed atoms;
- the atoms, in the entry's numbering;
- the target, with its unit;
- the force constant, with its unit.

A label, not a value of a geometry: it names none, and rides through
*Re-bond* from the bonding entry (docs/STRUCTURE-STEPS.md).

### Meno's own nodes

Redone from the start as a small set of simple nodes, as the maintainer asked
on question 16. Each has one role, and they are meant to be combined.

**Sets**

| Node | Takes | Gives |
|---|---|---|
| **Filter** | molecules, or structures drawn by their records | *kept* and *rest*, by conditions on properties picked as rows (a property, a comparison, a value with its unit; all of them, or any). An entry with no value goes to *rest*, counted |
| **Rank** | molecules | *kept* and *rest*: ordered by a property, the first N kept, in each group or in all; values worked out differently never ranked together, those with none to *rest*, each saying its place or why |
| **Group** | molecules | the same, each entry's *group* set: by constitution (its identity with its species; the entry holds no configuration of its stereocentres, so stereoisomers are one group, and the option says so), by a property's value, or all together; those with nothing to group by to *rest* |
| **Merge** | molecules, two or more | one set, in the inputs' order; or one entry for each value of a property (an ID from *Tag*), the others to *rest* naming the one kept |
| **Tag** | molecules | the same, with a new property: an ID for each entry, under the name given |
| **Join** | molecules, and molecules or a table | the first, with the second's properties put on by a property both carry (an ID from *Tag*), by identity, or by drawn atom; what did not match is said |
| **Duplicates** | molecules | *kept* and *rest*: one of each identity, or by RMSD in each group, as Meno does today; with the molecule's symmetry where chosen (equivalent groups turned, equivalent atoms swapped) |

**Numbers**

| Node | Takes | Gives |
|---|---|---|
| **Number** | nothing | a number with its unit, typed by the chemist |
| **Add** | molecules, and numbers | the same, with a new property: the sum of the properties and numbers chosen, at one geometry |
| **Relative** | molecules, and a reference where wanted | the same, with a new property: one minus the lowest in its group, or minus the reference; values worked out differently (conditions, program, method, basis, thermal treatment) never taken from one another |
| **Linear** | molecules | the same, with *a* × a property + *b* (for a per-atom list, *a* and *b* by element) |
| **Populations** | molecules | the same, with shares from the free energy G (`thermo.free-energy`), in each group, at a temperature, degeneracies counted where every one in the group has one; an entry with no G - only an electronic energy - goes to *failed* with its group, never weighted by E; a group whose G were worked out differently (temperature, pressure, solvent, program, method, basis, thermal treatment) too |
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
| **Re-bond** | *geometry* (molecules, 3D) and *bonding* (molecules, same atoms) | each with each, or matched on a property: the first's geometry with the second's bonds and charges, its group *a → b*, with both entries' properties (the geometry's where both have one) |
| **Compare bonding** | molecules, 3D, and *reference* (molecules) | *same* and *different*: bonds read from the geometry, and R or S, E or Z and every centre by its atoms' numbers where asked, compared with the reference matched on a property; or with each reference, naming the one it matches. Coordination bonds, and atoms, elements or bonds the chemist lists, are passed over |
| **Mode on atoms** | molecules with vibrations, and a table of atoms (from *bond changes*) | *kept* and *rest*: whether the imaginary vibration moves those atoms most, within a tolerance |
| **Atom map** | *molecules* and a *reference* (3D, every hydrogen present), each input's entries each a side of its own or one side together; matched on a property, or one reference for all; whether bonds may change (a reaction) or stay the same (conformers of the reference) | *mapped*: each side a complete 3D structure in the reference's numbering, every atom mapped one to one, hydrogens included (the first map, or every map) - a reaction's products in its reactants' numbering, or a species' conformers with their equivalent atoms (a methylene's hydrogens) where the species has them; *bond changes*: a table of each bond formed, broken or changed in order, with its atoms and orders before and after |
| **Restraints** | molecules | the same, each with its restraints from itself: coordination bonds kept at a factor of the van der Waals distance, listed pairs kept at their distance, listed atoms fixed |
| **Torsion restraints** | molecules, 3D, and *reference* (molecules) | *restrained*: each torsion trans across the reference's double bonds and not trans here held at 180°, stronger by a step each time; *trans already*: the rest, as they came |
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

That is 30 nodes, each doing one thing (*Atom map* does what *Number
like* was to), and *Enumerate* (below) makes 31.

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

### Enumerate: structures made from a drawing, by rule

Agreed 2026-10-21. Specified here before it is built (*In order: the PRs*,
*Enumerate*).

**Enumerate is Meno's own.** It edits Meno's own graph by a rule written
here, and runs no program. *Generate* stays a kind that plugins fill
(*Kinds filled by plugins*). The two are told apart by what decides the
structures:

| | **Enumerate** (Meno's) | **Generate** (a plugin's) |
|---|---|---|
| What decides the structures | the drawing and the chemist's lists, by the rule below | a program or a model |
| The same input again | the same structures, in the same order, numbered the same, on any computer | what the plugin says of itself: a seed recorded where it takes one |
| How many | known before it runs: the product of the lists' lengths | the program's |
| What is left out | every combination is numbered; any not made goes to *aside*, with its reason | what the plugin reports; core judges only what it can (identity, through *Duplicates*) |
| Coordinates | 2D, drawn from the drawing | structure only, or with coordinates, as the plugin gives them |

**What it takes and gives.**
- *template*: one structure drawn (molecules, 2D as drawn), with R groups
  numbered (R1, R2, and so on).
- *made*: molecules, 2D as drawn, one entry for each combination of the
  lists, in order.
- *aside*: the combinations that were not made, each with its number and
  its reason, counted (*Aside · 2*).

A 3D structure is never made here. It comes from a step after it, such as
*Conformers*, as everywhere else (*never implicit*: molecules to 3D).

**Three ways**, each one PR:
1. **R groups**: each R1, R2 and so on in the drawing, given a list of
   groups. Specified in full below.
2. **Substituent swap**: atoms chosen on a drawing, with a list of groups,
   each put in place of a hydrogen there. Specified below.
3. **Scaffold swap**: a marked part of a drawing replaced by another with
   the same number of bonds out. Outlined below.

#### R groups

**The lists.** Each R number in the drawing has a list of options, typed
on the step as a chemist writes them - several on a line, apart by commas
or semicolons, or one to a line (2026-10-24):

```
R1: Me, Cl
R2: OMe
R2: *C(=O)N(C)C
```

A line `R1:` (either case, `r1:`) starts R1's list, or adds to it where it
was started already: R1: Me then R1: Et is {Me, Et}. A line with no R
number goes on with the last one. A comma between two digits is a
locant's, part of its group (`2,4-(MeO)2C6H3`). Said, and the step not run:
a group before any R number, an empty one between two commas, and one
given twice in one list (never dropped as if typed once).

Each option is read in one of three ways:
- **as a label typed on the canvas is read**: one reader, one definition.
  Smart labels give the label its case (`otbs` is `OTBS`). The dictionary,
  its label grammar and the chemist's own abbreviations then give its
  structure (`abbreviationStructure`);
- **an element's symbol** is that atom: `Cl`, `F`, `H`;
- **a line with a `*` is SMILES**, read as a chemist's own abbreviation is
  (`structureProblem`): exactly one `*`, bonded by one single bond to the
  atom the group is attached by.

A line without a `*` is never read as SMILES, so `CO` is a label, and its
reading is shown. Beside each line the step shows what it was read as: the
group's formula, in words. A chemist sees before running what every option
became.

**What stops the step before it runs.** The step does not start, and says
why, naming the line or the atom:
- a line that reads in none of these ways, named, with what was
  tried. It is never skipped;
- a group attached by more than one atom (a chelating ligand), a complex,
  or a whole molecule (`THF`);
- an R number in the drawing with no list, or a list for an R number not
  in the drawing;
- an R atom bonded by anything but one single bond (none, two, or a double
  bond);
- an R atom with more than one number (R¹,²), or an R with no number;
- a wedge or hash whose narrow end is at an R atom. It would say nothing
  about the group put there;
- more than one structure in *template*;
- **more than 10,000 combinations**, said with the count: *5 lists of 50
  make 312,500,000 combinations; Enumerate makes at most 10,000*. Every
  product is drawn, judged against the others by identity, and kept in
  the workspace file. At the speed measured for laying out many structures at
  once (#507: 1,000 in 9 to 15 s across eight workers), 10,000 take
  minutes and more take hours. A set past that is more than can be looked
  over, and is a sign the lists should be cut or the work done in steps.

The R groups' definitions a CTfile can carry are not read (CTFILE.md).
Only the step's lists say what an R group may be.

**The rule.**
- **One choice per R number.** Every atom drawn R1 takes the same option in
  one product. Groups chosen independently are drawn with different
  numbers.
- **The order is fixed.** The combinations are taken in order, R1 outermost:
  with R1 = {Me, Cl} and R2 = {OMe, OEt, F}, the first is (Me, OMe), the
  second (Me, OEt), the fourth (Cl, OMe).
- **A combination's number is its place in that order, from 1.** It keeps
  that number whether it is made or set aside, so *made* may hold 1, 2, 4.
  The number is a property of the entry (`number`, unit none).
- **The join is the canvas's.** Each R atom is replaced as an abbreviation
  drawn out on the canvas is (*Expand abbreviation*): one function, used
  by both, `expandAbbreviation` (Workspace/document), given the group:
  - the group's attach atom takes the R atom's place and its bond;
  - the group's other atoms are laid out from it, clear of the drawing.
- **The template's atoms keep their numbers.** Each R atom's number goes to
  its group's attach atom. Each group's other atoms follow the template's
  atoms, R1's first, then R2's, each group's in its own order. Where one R
  number is on several atoms, their groups' atoms come in the order of
  those R atoms' own numbers in the template, the lowest first. So a core
  atom has the same number in every product.
- **The bonds are as drawn.** No template atom's bonds change, except that
  the bond to R now goes to the group's attach atom. A group's atoms are as
  its definition has them.
- **Configurations stay as drawn.** Every wedge and hash, and every double
  bond's side, stays where it is drawn, so the arrangement in space is
  kept. Its descriptor can change with the group: the same arrangement may
  be R with one group and S with another. What is kept is the arrangement,
  as the drawing shows it.
- **`H`** puts a hydrogen atom in the R atom's place, so its number and a
  wedge on its bond keep their meaning. For identity it counts as one of
  its neighbour's hydrogens (below).

**Each entry says how it was made.**
- `from` is the template's entry, where it has one. A template drawn on
  the page has no entry id, so its products name none (WORKFLOWS.md,
  *A structure drawn's record*).
- `made.how` gives the choices in words: *R1 = Me, R2 = OMe*.
- Each option is given as it was typed and as it was read.

**The set carries its core**, so that steps after it, and the summary
frame, can line the products up exactly:
`core: { atoms, bonds, attach: { R1: atom, R2: atom } }`. Its atoms and
bonds are the template's without its R atoms, in the template's numbering,
which is the same in every product.

#### Duplicates, and what judges them

**Which structures are the same is judged by Meno's identity**:
- the identity text, `identityText` (*Identity* above, and
  `src/lib/chem/identity.ts`);
- the canonical text of the structure's aromatic form;
- with each stereocentre's and each double bond's configuration as drawn,
  and each axis of chirality.

The texts are compared, not their hashed keys. The set states the method:
*Duplicates judged by Meno's identity: constitution and configurations as
drawn, aromatic rings as one form.* What that means, plainly:
- **a chiral product and its mirror image are two structures.** So are two
  diastereomers, and E and Z;
- **two Kekulé structures of one ring are one structure.** So are
  bond-shift isomers such as a 1,2-disubstituted cyclooctatetraene (the
  `aromaticForm` rule, as it is written there);
- **tautomers are two structures** (2-hydroxypyridine and 2-pyridone), and
  so are a group written charge-separated and the same group written with
  expanded valence (a nitro group as `*N(=O)=O` or as `*[N+](=O)[O-]`). An
  option's form is its definition's, so this can only split duplicates
  where the chemist's lists mix forms;
- **a plain hydrogen atom counts as one of its neighbour's hydrogens**. A
  product with R1 = H is then the same structure as the compound drawn
  without that H. Only a truly plain one is folded in. A hydrogen stays an
  atom where it is any of these:
  - one whose wedge, hash or place sets a stereocentre's or a double
    bond's configuration, unless that configuration is carried over to the
    atom it is on (a stereocentre with an implicit hydrogen), and then it
    is folded in with the configuration kept;
  - mapped to an atom of a reaction;
  - charged, with an unpaired electron, or an isotope (deuterium,
    tritium);
  - bonded to another hydrogen (H2);
  - bridging, with more than one bond;
  - on a metal (a hydride ligand).

  P3 adds this to the identity rule itself, so it changes `identityText`
  for every user of it. P3 lists every caller of `identityText` and
  `identityKey`, checks each one against the change, and adds a test
  where the change matters to it;
- **the canonical search has a budget** (`settleBudget` in
  `src/lib/layout/canonical.ts`). A very large, very symmetric structure
  that exhausts it can be written two ways, so a duplicate can be missed.
  It never judges two different structures the same, except by the rules
  above (Kekulé structures, bond-shift isomers, hydrogens folded in): the
  text writes the whole structure. Where the budget ran out for any product, the set
  says so, with how many.

**The first one is kept.** Where two or more combinations give the same
structure, the first by number is made. Each later one goes to *aside*:
*Same as 2*. A symmetric template does this: in a para-disubstituted
benzene with R1 and R2 given the same list {Me, Cl}, (Me, Cl) is 2 and
(Cl, Me) is 3, the same structure, so 3 is set aside as *Same as 2*. Two
options of one list that read as the same group do it too.

**The rule is tested against another canonicaliser**, as the layout's
known answers are (#507):
- a committed fixture holds each test product by the SHA-256 of the
  molfile Meno writes of it (its 2D coordinates and wedges). The test
  writes the molfile again and checks it against that, so the fixture pins
  every molfile without holding columns of coordinates. Beside it are
  RDKit's canonical isomeric SMILES of that molfile, and of the compound
  written by hand for that combination, recorded by a script under
  `scripts/` with RDKit's version and the commands that make it. RDKit
  reads the configurations from the drawing itself, so Meno's reading of
  the wedges is checked as well;
- the test checks that each product is the compound written for it, and
  that Meno's identity splits the products into the same groups as RDKit's
  canonical SMILES do;
- where Meno's rule takes two forms as one (bond-shift isomers), the
  fixture lists the case, and the test holds Meno to its own rule there.

RDKit is in the script and the fixture only, never in core.

#### Valence, and stereocentres left open

**The rule cannot break a valence.** No template atom's bonds change, and
each group is attached by the one bond its definition marks. A product is
over-valent only where its template or one of its options is.
- **Before running**, the step asks the checks that mark valence on the
  canvas about the template and each option. Those checks are a plugin's
  role (the checks, PLUGINS.md *Roles*): the one definition the canvas
  uses. An option or a template they flag stops the step, with their
  words.
- **Where no plugin does the checks**, the step runs, and the set says
  *Valence not checked: no plugin does the checks*. It never claims a
  check that was not made.

**A stereocentre left open.** A group can make a stereocentre that its
definition gives no configuration (a sec-butyl group, as written). Where
the checks are at hand, the products with a stereocentre or double bond
whose configuration is not given are counted, and named, on the set. They
are made: such a product is a real structure. Its configuration is open,
and the identity reads it as open.

#### The known answers

P3's tests, each against an answer worked out by hand or by another
reader:
- **one R on benzene** with {Me, Cl}: two products, C7H8 and C6H5Cl, in
  that order, numbered 1 and 2;
- **3 × 2 = 6** in the fixed order, R1 outermost, each entry's `made.how`
  as written;
- **the symmetric template above**: four combinations, three made, one
  aside as *Same as 2*, with the count on the set;
- **a stereocentre drawn next to an R**: the arrangement kept, each
  product's configurations checked against RDKit's reading of its drawing
  (the fixture, *The rule is tested against another canonicaliser*);
- **R1 = H** next to a wedge: the same identity as the compound drawn
  without the H, its configuration carried to the atom it is on;
- **each kind of hydrogen kept as an atom** in the list above: one test
  each, showing it is kept, and that H2, a hydride and a deuterium keep
  identities apart from the structures that would come of folding them;
- **every reason that stops the step**, one test each, with its words,
  the limit among them: 10,000 combinations run, 10,001 stop;
- **one R number on two atoms**: both take the same group, and their
  groups' atoms are numbered in the order of the two R atoms;
- **the RDKit fixture**, as above.

#### Substituent swap

Agreed 2026-10-23. One Enumerate step, with a choice of way: *By* R groups
(the default, so a step saved before keeps what it did) or Substituents. Each
way shows only its own options.

**Positions.** The chemist chooses atoms of the template on its drawing.
They are kept on the step, never in the drawing: nothing is added to it, so
it stays the parent compound. The chosen atoms are marked, numbered, only
while the step is selected.
- **Numbered by the template's own atom order**, the lowest first, never
  the order they were chosen in, and named by their atom: *Position 2
  (C7)*.
- **A heavy atom with a hydrogen it does not draw**: one of those hydrogens
  is replaced. The group goes where the canvas would draw a new bond from
  that atom (its widest gap, with no pointer to follow).
- **A drawn H**: that H is replaced in place, as an R atom is. Its bond and
  any wedge on it are kept, and its number goes to the group's attach atom.

**The groups.** One list, one to a line, each line read as an R group's
option is (*R groups*, *The lists*), its reading shown beside it.

**Combined one of two ways:**
- **One at a time** (the default): each product has one group at one
  position. Positions × groups combinations, the first position's groups
  first, each in the list's order. `H` would only remake the drawing, and
  stops the step.
- **Together**: every position takes a group in each product, as R groups
  do with one list for every R. Groups to the power of positions
  combinations, the first position outermost. `H` leaves a position as it
  is drawn.

**The rule is the R groups' rule.** Each position becomes an R atom (at a
heavy atom, a new one where the group goes), and is drawn out by the same
join (`expandAbbreviation`). So the numbering, the order's numbers, *aside*
and *Same as n*, the valence checks, the stereocentres left open and the
10,000 limit are as for R groups. A template atom has the same number in
every product. A group at a heavy atom's hydrogen has its attach atom after
the template's atoms. A wedged centre whose undrawn hydrogen is replaced
keeps its arrangement, with the group where the hydrogen was.

**Configurations kept.** Replacing a hydrogen keeps the arrangement in
space: the group goes where the hydrogen was.
- **A centre whose own undrawn hydrogen is replaced** is wedged anew to say
  the configuration it had. A wedge with three bonds in the page reads
  otherwise than a wedge with the hydrogen left out, so the old wedge alone
  would invert it.
- **Every wedge keeps its narrow end.** A bond added to an atom changes how
  the drawing counts its bonds, and with them which end of a wedge reads as
  narrow, so a wedge would move to the next atom.
- **A stereocentre the group makes** (one of a CH2's two hydrogens) is left
  open, with no configuration made up. *Stereoisomers* can enumerate it.
- **The guard behind them.** Every product is read back as the canvas reads
  a drawing, and each configuration of the template, at its atoms, mapped,
  is held to it. A product that would change one, lose one, or say one the
  template does not, is never made: the step stops, naming it (*Position 1
  (C4) = Me: would change the configuration at C4*). This holds one at a
  time and together, and for groups with configurations of their own.
- **Tested against RDKit** by a differential in the fixture: stereo-rich
  templates, every atom with an undrawn hydrogen in turn, each with several
  groups, the compound for each made by RDKit by putting the group in that
  hydrogen's place.

**What stops the step before it runs**, naming the position or the line:
no positions chosen; a chosen atom no longer in the drawing; a chosen atom
with no hydrogen, or whose hydrogens are all drawn (*choose the H*); a drawn
H that is not plain (as *a plain hydrogen* is defined above); an atom inside
a label (*expand it to choose in it*); a drawing with R groups (*enumerate
them by R groups first*); a line that does not read; `H` one at a time; more
than 10,000 combinations.

**Each entry says how it was made**: *Position 2 (C7) = OMe*, or, together,
every position's choice. **The set's core** is the template's atoms but the
drawn H's chosen, with each position (`P1`, `P2`) given by the atom its
group is bonded to.

**Its known answers** are tested as R groups' are, and its products join
theirs in the RDKit fixture: a ring CH, two positions alike one at a time
and together, a wedged centre's undrawn hydrogen, a drawn H with its wedge,
and a CH2 beside a stereocentre (the centre it makes left open).

**Later:** a set as input (a set made by Enumerate carries its core, so the
positions could be stated once for every product) comes after the scaffold
swap, which changes what a set's core is.

#### Scaffold swap (outline)

The chemist marks a part of a drawing (the scaffold) and gives a list of
replacements. Each replacement has as many attachment points, numbered, as
the part has bonds out, and each point is joined where the matching bond
leaves. The rest of the drawing keeps its atoms, numbers and coordinates.
The replacement is laid out as Clean-up lays out a part with fixed
neighbours. A replacement whose number of bonds out differs stops the step.
How the points are matched, and what the *core* of the set is after a
swap, are decided in its PR, and this section is updated before it is
built.

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
| **Path search** | *start* and *end* (molecules, 3D, matched on a property) | *done*: molecules with frames, an energy on each frame; *failed* |
| **Optimise to a saddle point** | *guess*; and *reactant side* and *product side*, where the plugin takes them, matched on a property | *done*, *failed* |
| **Follow the reaction path** | molecules, 3D | *done*: molecules with frames, both directions as one path; *failed* |
| **NMR shielding** | molecules, 3D | *done*: shieldings per atom (ppm); *failed* |
| **Excited states** | molecules, 3D | *done*: a small table of states (energies, strengths); *failed* |

**Cheminformatics and models**

| Kind | Takes | Gives |
|---|---|---|
| **Generate** | nothing, seeds (molecules), or a target (molecules or a table) | molecules, structure only or with coordinates. Structures made from a drawing by rule are *Enumerate*'s, Meno's own (above) |
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

**One atom, where a program is given none** (2026-11-01, the plugin boundary).
A plugin runs its own program and no other. CREST's plugin had run xtb for a
lone atom, in CREST's place; it no longer does. Its manifest says its program
is given no lone atom (`noLoneAtom`, on *Conformers* and *Optimise*), and
Meno does not send it one: the atom passes through the step as it came - a
lone atom has no conformers and nothing to optimise - with no energy, said
so on it and on the step's line. This is not routing: nothing is sent
anywhere else, and its energy is an *Energy* step's, drawn. Where a plugin
runs its program on one (xTB, ORCA, Gaussian), it is sent as before.

### Atom mapping, and what Meno does itself

**Meno is the base** (the maintainer, 2026-10-16). Meno owns the store (the
`.meno`), the graph, provenance, the judgement of whether a job has been
done, and where jobs run.

**Atom mapping is a basic Meno feature.** Drawing a reaction scheme calls
for an atom map, so mapping lives in core (`src/lib/chem`), for the 2D
canvas and for the *Atom map* node alike. Its first version ports the mapper
of ACCeL, the maintainer's own library (kfchem/accel, MIT), with the
maintainer's explicit permission and its notice kept. It is built in its own
PR, by another lane; this plan only uses it as a core API.

**The *Atom map* node's contract.** A map is only usable for quantum
chemistry if it covers every atom in 3D, one to one, so that a product's
geometry comes out in the reactants' numbering for a path search, a
three-structure saddle-point search and matching IRC ends. So:
- its *mapped products* are complete 3D structures in the reactants'
  numbering, with every atom mapped, hydrogens included;
- hydrogens are assigned by geometry, consistent with the stereo of the
  atoms they are on (which of a methylene's two hydrogens is which follows
  from where they are);
- a heavy-atom-only map, such as the 2D canvas may show, is a lesser case,
  and never what flows into a calculation.

**The nodes ACCeL could have filled, decided one by one.** Apart from the
mapper, what Meno does is written from a published algorithm or Meno's own
rule, named in the code and tested on its own cases. No other ACCeL code is
read for it.

| Node | Why Meno's own |
|---|---|
| **Atom map**: a reaction | Mapping is part of drawing reactions, so it belongs in core. A Diels-Alder already defeats the fewest bond changes, so the port of a working mapper is the starting point |
| **Atom map**: the bond changes | Once the products are in the reactants' numbering, the bond changes are the bonds whose order differs between the two: a comparison under one numbering |
| **Compare bonding** | Meno already reads bonds and their orders from distances (#230, from Pyykkö's covalent radii) and perceives R or S and E or Z. With the numbering fixed, comparing with a reference is comparing two lists of bonds, and of stereo labels, atom by atom |
| **Duplicates** with symmetry | Meno's canonical numbering (#319, #350) gives each atom's symmetry class. The RMSD with symmetry is the lowest RMSD over the graph's automorphisms, each laid over by the quaternion fit Meno's *Duplicates* uses today (Horn 1987; Coutsias, Seok and Dill 2004), as described by Meli and Biggin (J. Cheminform. 12, 49 (2020)). A cap on the automorphisms tried (tert-butyl groups multiply them) is said when it is met |
| **Atom map**: conformers onto their species | The same full map, its bonds to stay the same: ACCeL pairs like atoms as it extends a map - a methylene's hydrogens by their handedness, an =CH2's by E or Z, a methyl's by the torsion - so only equivalent atoms take each other's numbers |
| **Mode on atoms** | A vibration is a displacement per atom, which the program plugins already read. Whether the listed atoms move most is their share of the displacement against the rest: arithmetic on Meno's own data |

**Meno's alone.** These are Meno's judgements, so no plugin fills them
(the plugin boundary, 2026-10-31: WORKFLOWS.md, *Who does a step*). A
program plugin reads its program's output into Meno's general form, a
vibration's displacements among it, and *Mode on atoms* works on that.

## Changed and kept under the principle

Every part of the third draft, re-checked against *Don't make it too
abstract*:

| Part | Now | Why |
|---|---|---|
| Reaction as a value (sides, map, contacts) | **Changed**: an *Atom map* node (Meno's) with *mapped* and *bond changes* out, a side of several structures taken together; *Restraints* for contacts | a node with plain inputs and outputs, as the maintainer described |
| Meno's "fewest bond changes" mapping | **Changed**: Meno's own atom mapping in core, first ported from ACCeL's mapper with the maintainer's permission, used in 2D too | the maintainer: even a Diels-Alder would fail; a reaction scheme calls for a map |
| Paired entries (*start*, *end*, *guess*) | **Changed**: plain inputs matched on an ID that *Tag* wrote | the maintainer (question A): IDs embedded and matched, no implicit rules; the same works for every node with two inputs |
| Grouped type | **Changed**: *group* is a property | a type that only marks a property was abstraction |
| Spectrum type | **Changed**: a curve is a property; a measured one is a table | one less type, nothing lost |
| *Pair*, with its side chosen by itself | **Changed**: *Re-bond* (one role); the direction is wired | choosing the side by conformer counts was a node deciding by itself |
| *Take from path* (guess with two sides) | **Changed**: *Take frames*, one rule a node; three of them for the three structures | one role a node |
| *Barriers* (lowest or ensemble, differences, ratio, diagram) | **Changed**: *Rank* or *Ensemble energy*, *Relative*, *Populations* (the ratio between competing paths), *Energy diagram* | four roles were bundled |
| *Free energy* | **Changed**: *Add*, with a *Number* for the standard-state term | a sum is a sum |
| *Check bonding*, *Match end points*, *Check the vibration* | **Changed**: *Compare bonding* and *Mode on atoms* (Meno), with *Take frames*, *Join* and *Filter* | the match was four roles in one |
| An ACCeL plugin | **Changed**: none in this plan; *Atom map*, *Compare bonding*, *Duplicates* with symmetry and *Mode on atoms* are Meno's | the maintainer: mapping is basic to Meno, and the rest is easy in-house |
| *Boltzmann average*, *Scale*, *Spectrum*, *Compare* | **Changed**: *Average*, *Linear*, *Broaden*, *Errors*, *Curve similarity* | general names for single roles; *Linear* with *a* = −1 mirrors a curve |
| Filter's "relative to its group" | **Changed**: *Relative* before *Filter* | one role a node |
| Energy window, Choose one, As conformers | **Changed**: cases of *Relative* + *Filter*, *Rank*, *Group*; dropped from saved workspaces | the maintainer asked for a clean set (question 16) |
| Retry policies, failure classes, attempts in a step | **Changed**: a *failed* exit, and retries drawn | the maintainer (question 24) |
| Shared parameters flowing into every step | **Changed**: each step's own options, some of a kind Meno defines (solvent, temperature, pressure); restraints as a table | values that arrive by themselves are not wired |
| Lone atoms routed by Meno (question 8) | **Changed**: no routing; the kind's meaning, held by the plugins | routing was core acting by itself |
| Second exits only where declared (question 19) | **Changed**: a second exit wherever entries can fail or be set aside | the maintainer's retries need them |
| Collections, members, large-set views | **Kept** | they hold and show data; they decide nothing |
| Fingerprints, snapshots, the store's signal | **Kept** | bookkeeping, under every node alike |
| Keeping (question 12) | **Changed**: everything kept in the `.meno` by default, every job's raw files included; *Don't keep in the file* per set, *Don't keep raw outputs* per step | the maintainer: keep everything, with a way not to, and the `.meno` the whole record |
| Whether a job has been done | **Changed**: a job key per job (its input files, the program's and the plugin's versions), reused when the same; nothing overwritten; outputs Meno cannot account for stop the step | the mechanisms of ACCeL's second version, adopted as Meno's own |
| Fixed numbering; properties with their geometry and units; identity | **Kept** | rules about data, not nodes |
| Runners; templates | **Kept**; this computer's runner knows its cores and memory, cluster jobs are submitted and taken up again, and the working directory is scratch | each chosen on the step, explicitly |
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
   doer's versions. Under it, each job's key decides whether that job has
   been done.
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
    its logs, its output collections, and every job's key and files, in the
    `.meno` unless the chemist chose not to keep them.
13. **Conformers.** A conformer set is molecules whose *group* is their
    compound. *Populations*, *Rank*, *Relative* and *Filter* work in each
    group; a manifest may say `together`.

## Seven cases, end to end

Computational chemistry first and in most detail: F (ConfoTS) and G (a
conformer ensemble to NMR and ECD). Then A to E, mostly cheminformatics.
Each node is named with who does it: *Meno*, or a program plugin.
ConfoTS's folders and options are in brackets, so that the two can be read
side by side.

### F. ConfoTS on Meno

**The case** (cases 2, 4, 5, 6, 14): a Diels-Alder with one reactant, as in
the showcase's first example. The reactant *a* and two products *b* and *c*
drawn side by side, in chloroform. Which product forms faster, and by how
much?

**On the page:** set **R** holds the reactants drawn (two reactants are one
side together, on the *Atom map* card); set **P** holds the products drawn.

**F1. The reaction** (step 0)
1. **Atom map** (Meno): *molecules* P, *reference* R, each given its 3D
   structure first (decision 18), every hydrogen present; P's entries each
   their own, R's one side together, bonds that may change. It gives
   *mapped* P′, which are *b* and *c* in *a*'s numbering [003, 004], and
   *bond changes* BC [ConfoTS's reacting bonds and atoms].

**F2. Conformers of each species** (step 1, first part)
2. **Merge** (Meno): R and P′ into S (*a*, *b*, *c*). **Tag** (Meno): S's
   entries with *species*, which their conformers carry from here.
3. **Restraints** (Meno): on S, coordination bonds kept at 0.9 of the van
   der Waals distance at a strength the workflow sets, giving T1
   [`lewis_distance_scaling`, `lewis_force_constant`].
4. **Conformers** (a plugin) on S, with T1 where the plugin takes
   restraints. Each conformer's group is its species [100; ConfoTS uses a
   force-field search of 10,000 steps]. Then **Atom map** (Meno): the
   conformers onto S, matched on *species*, bonds that stay the same, each
   input's entries each their own: every conformer in its species'
   numbering, its equivalent atoms where S has them, as ConfoTS's
   [`map_numbers`] renumbers its conformers after the search.
5. **Relative** then **Filter** (Meno): within 10 kcal/mol of the lowest in
   each group [`energy_limit_to_empopt`].
6. **Optimise** (xTB, GFN2), *done* [110].
7. **Duplicates** (Meno): RMSD 0.1 Å, with symmetry [`rmsd_limit`].
8. **Compare bonding** (Meno), each against its species in S, matched on
   *species*, coordination bonds passed over: *same* [the bonds check].
9. **Relative**, **Filter** and **Rank** (Meno): within 5 kcal/mol, the first
   64 [`energy_limit_to_neb`, `max_limit_to_neb`].
10. **Filter** (Meno): the group is *a*. *kept* gives the reactant conformers
    RC; *rest* gives the product conformers PC.

**F3. Pairs** (step 1, second part)
11. **Tag** (Meno): RC with *start*, and P′ with *product*. **Re-bond**
    (Meno): *geometry* RC, *bonding* P′, each with each. It gives the ends E,
    each carrying both IDs, grouped *a → b* and *a → c* [120]. Both directions take a
    second *Re-bond* (*geometry* PC, *bonding* R) and the same chain after
    it, merged before F4. ConfoTS chooses the direction from the conformer
    counts [`path_flag`]; here it is wired.
12. **Restraints** (Meno): on P′, its coordination bonds as in step 3. They
    ride through *Re-bond* onto E, which takes the bonding entry's
    restraints.
13. **Minimise with restraints** (a force-field plugin): E, its coordination
    bonds held, no torsions yet. Its result records where its restraints
    were first held.
14. **Torsion restraints** (Meno) against P′, matched on *product*: each
    torsion trans across P′'s double bonds (hydrogens' included) and not
    trans after the minimisation is held at 180°, at the step the workflow
    sets. *Trans already* goes on [ConfoTS's trans-torsion check].
15. **Its *restrained*, again, drawn:** **Minimise with restraints** from
    the geometry the first minimisation started from (*Start from: where
    its restraints were first held*), then **Torsion
    restraints**, each torsion still not trans a step stronger (a
    torsion held once stays held), and a **Merge** with 14's *trans
    already*. Pasted once more for each further attempt; the last
    attempt's *restrained* goes on too, as ConfoTS passes it on
    [`max_cycle_of_force_mini`, 10; the showcase used three rounds,
    120_recalc0-2].
16. **Optimise** (xTB) [122].
17. **Compare bonding** (Meno) against P′, on *product*, with R or S, E or Z
    and every centre by its atoms' numbers: *same* [`check_chirality`].

**F4. Paths and saddle points at the semiempirical level**
18. **Path search** (ORCA plugin: NEB with GFN2-xTB, 8 images). *start* is RC
    and *end* is 17's *same*, matched on *start*, which each end carries from
    the conformer its geometry came from. It gives paths [123], and **Tag**
    (Meno) writes *path* on each.
19. **Take frames** (Meno): the highest energy, giving the guesses G [124].
20. **Measure** (Meno): the forming bonds, atoms from BC [`calc_length`].
21. **Duplicates** (Meno), with symmetry [`rmsd_limit`].
22. **Frequencies** (xTB) [125].
23. **Filter** (Meno): exactly one imaginary vibration [`check_freq`].
24. **Follow the reaction path** (ORCA plugin, IRC with xTB) [125_F, 125_B].
25. **Take frames** twice (Meno): the first, and the last.
26. **Compare bonding** twice (Meno): each end against S, naming the
    species it matches (*a*, *b*, *c* or none), with every centre by its
    atoms' numbers [128; `check_irc_chirality`].
27. **Join** (Meno) on *path*: both names put back on the saddle points as
    *first end* and *last end*.
28. **Filter** (Meno): one end is *a* and the other the product the saddle
    point was made for. This gives the validated saddle points V [126].
    Without IRC, **Mode on atoms** (Meno, atoms from BC) and a **Filter**
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
    *guess* V, with *reactant side* and *product side*, matched on *path*.
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
40. **Mode on atoms** (Meno), atoms from BC [step 3's `check_bonding`].
41. **Energy** (Gaussian): ωB97X-D/6-311+G(d,p), solvent chloroform
    [`model_sp`; the Link1 job].
42. **Number** (Meno): 1.89 kcal/mol, the standard-state term from 1 atm to
    1 mol/L at 298.15 K. Then **Add** (Meno): 41's energy, plus 37's thermal
    correction to G, plus 42. Each part is worked out at the same geometry,
    so *Add* takes them; the result is G at the DFT level.
43. **Duplicates** (Meno, with symmetry), then **Populations** (Meno) in each group
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
    bonding** (Meno, naming), **Join** on *path* and **Filter** (Meno): each path
    joins the species it claims.

**The nodes F uses:**
- **Meno's** (21): Atom map, Merge, Tag, Restraints, Torsion restraints, Relative, Filter, Rank,
  Re-bond, Take frames, Measure, Join, Displace, Number, Add, Populations,
  Ensemble energy, Energy diagram, Duplicates, Compare bonding, Mode on atoms.
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

  All of it comes into the `.meno` by default, compressed, so that the
  workspace holds the whole study. Past 500 MB Meno says so, and offers
  *Don't keep raw outputs* on the largest steps (the NEB's, say). The
  cluster's working directories are scratch, cleaned once their files are
  in.
- **Reused, not run again.** A pasted retry chain, or the chain run again
  after a later step was changed, runs no job whose key the workspace has
  already run to the end.

**F9. Against the ten points asked for, last round:**
1. **Reactions and their numbering**: the *Atom map* node, the fixed
   numbering.
2. **Pairs**: *Tag* and *Re-bond*, inputs matched on the IDs *Tag* wrote.
3. **Paths**: entries with frames, and *Take frames*.
4. **Stationary points and their validation**:
   - the imaginary count as a property, and *Filter*;
   - *Mode on atoms*;
   - *Compare bonding* with *Join*.
5. **Levels of theory**: properties with their geometry; *Add*.
6. **Barriers and diagrams**: *Relative*, *Populations*, *Energy diagram*.
7. **Failure and runs again**: the *failed* exit, drawn chains, *Merge*.
8. **Where jobs run**: runners; job keys; cluster jobs submitted and taken
   up again.
9. **Templates**: the program plugins' options.
10. **Bond changes and restrained minimisation**:
    - *Atom map*, with Meno's atom mapping, and *Compare bonding* are
      Meno's;
    - *Minimise with restraints* is a force-field plugin's;
    - *Restraints*, *Torsion restraints* and *Re-bond* are Meno's.

### G. A conformer ensemble to NMR and ECD

**The case** (cases 1, 2, 3, 14, 16): a natural product with two candidate
diastereomers, drawn into one set. Which relative configuration do its ¹H
and ¹³C shifts support, and which absolute configuration does its ECD?

1. **Conformers** (CREST): each conformer's group is its candidate.
2. **Relative**, **Filter** (Meno), within 6 kcal/mol, then **Duplicates**
   (Meno), with symmetry.
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

1. **Tag** (Meno): A's forty with *ligand*. **Dock** (a plugin): *ligands*
   (the forty), *target* (a protein opened
   from a PDB file). The poses' group is their ligand, each with a score in
   kcal/mol.
2. **Rank** (Meno): the first in each group, the best pose of each ligand.
3. **Join** (Meno) on *ligand*: the scores back onto A's forty, with their
   logP and pKa.
4. The set taken as a table goes to an Export as CSV.

**The nodes:** Meno's Tag, Rank and Join; a plugin's Dock.

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
- **Merging** is **Merge** (all, or one of each identity) or **Join**: on an
  ID *Tag* wrote (C, F), by identity (D), or by drawn atom (G).
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
   - Lineage with one or more parents, as a record; properties riding along.
   - The fixed numbering, written down and tested on the steps there are.
   - Species by one rule; Meno's units table; one Boltzmann function.
   - PLUGINS.md documents the plugin entry, with a version number.
2. **Identity and symmetry classes**, from the canonical numbering of #319
   and #350 once they are merged; the graph's automorphisms within those
   classes, capped. Until then *Duplicates* compares atoms in their own
   order, as today (question P).
3. **Collections, members and keeping.**
   - Collections in the file; members explicit and in order; the frame's
     gesture as the edit.
   - *Don't keep in the file* on a set.
   - Workspaces saved before read their members from their frames once
     (question 7, answered).
4. **Fingerprints, snapshots and the store's signal**, with *Changed
   upstream*.
5. **Ports and exits.**
   - Named, typed inputs, matched on a property chosen on the node; *Tag*.
   - Every exit a result set; second exits (*done* and *failed*, *kept* and
     *rest*).
   - The types and their conversions; pictures as a type; the card's give
     port gone.
6. **Large sets**: the summary frame, the table in the column, putting
   entries on the page; layout worked out where shown.
7. **Meno's nodes for sets and numbers**: *Filter*, *Rank*, *Group*,
   *Merge*, *Join*, *Duplicates* (with symmetry, from 2), *Number*, *Add*,
   *Relative*, *Linear*, *Populations*, *Ensemble energy*, *Average*.
   Today's *Energy window*, *Choose one* and *As conformers* go.
8. **The plugin contract.**
   - Entries by file at scale; properties, failure kinds and the frames
     reached on *failed*; restraints applied; templates; the option kinds
     (solvent, temperature, pressure); `together`; the resources a job needs.
   - The existing plugins (xTB, CREST, ORCA, Gaussian, RDKit) moved onto it,
     each holding its kinds' meaning for a lone atom in its tests.
9. **What a job keeps, and whether it has been done.**
   - Every job's input, output and raw files in the `.meno`, compressed;
     *Don't keep raw outputs* on a step; the size warning.
   - Job keys, and a job reused when its key has run to the end; nothing
     overwritten.
   - Outputs Meno cannot account for stop the step; *Adopt*, recorded.
   - Running again from a `.meno` elsewhere writes the inputs back out.
10. **Tables, numbers and charts on the page**: tables read from files;
    *Chart* and *Energy diagram*.
11. **Meno's nodes for structures and spectra**: *Species*, *Combine*,
    *Re-bond*, *Restraints*, *Measure*, *Take frames*, *Displace*,
    *Compare bonding*, *Mode on atoms*, *Equivalent atoms*,
    *Broaden*, *Errors*, *Curve similarity*.
12. **The *Atom map* node**, on Meno's atom mapping (a core API, built
    first in its own PR by another lane) and Meno's bond changes.
13. **The computational-chemistry kinds opened**: *Minimise with restraints*,
    *Path search*, *Optimise to a saddle point*, *Follow the reaction path*,
    *NMR shielding*, *Excited states*. Then one PR per plugin filling them:
    - ORCA: NEB, IRC, NMR, excited states;
    - Gaussian: saddle points with one or three structures, IRC, NMR,
      excited states;
    - xTB: restraints;
    - a force-field plugin for restrained minimisation.
14. **Runners.**
    - The seam, and this computer's runner on it: knowing its cores and
      memory, keeping the order jobs were asked for; the working folder in
      Settings, with path-safe names (readable ones shown), *Open the folder*, and cleaned on its
      own unless *Keep job folders* is chosen.
    - Then, its own PR, a cluster runner plugin: submit and return, taken up
      again from the job's record.
15. **The cheminformatics kinds and models**; then their plugins.
16. **Loops**: a design of their own, later.

**Enumerate** (*Enumerate: structures made from a drawing, by rule*) comes
in its own PRs, after 5, one after another:
- **P1**, this specification;
- **P2**, structures into and out of Meno's own steps. Today those steps
  take and give molecules in 3D only. P2 adds structures drawn in 2D as a
  value that passes into such a step and comes out of it as a result set;
- **P3**, R groups, with its known answers and the RDKit fixture;
- **P4**, substituent swap (*Substituent swap*);
- **P5**, scaffold swap.

**When the cases run:**
- **G** runs on this computer after 13 and its plugins.
- **F** runs on this computer after 13 for its xTB parts, and on a cluster
  for DFT after 14.
- **A to D** run after 15 and their plugins.

## What is core's and what is the plugins'

**Core keeps what holds the workflow together, and knows no program,
scheduler or model by name:**
- **values**: the types and conversions, entries and properties, Meno's
  units table, and the option kinds (the list of solvents, temperature,
  pressure);
- **structure**: identity, symmetry classes and automorphisms, the fixed
  numbering, lineage as a record, atom mapping, and a reaction's bond
  changes from its map;
- **collections**: their storage, hashes and keeping; sets and their
  members;
- **the workflow**: steps, ports, exits, wires, and the kinds (names, inputs,
  exits, meaning);
- **running**:
  - states and fingerprints;
  - snapshots and the store's signal;
  - the scheduler;
  - job keys, reuse, never overwriting, and accounting for outputs;
  - the runner seam, and this computer's runner, knowing its resources;
- **on the page**: summaries, tables, charts, and the words on the page with
  their rule;
- **Meno's 31 nodes** (*Meno's own nodes*, and *Enumerate*): arithmetic,
  geometry, data handling and structures made by rule, on Meno's own data,
  each written from a published algorithm or Meno's own rule.

**Atom mapping is core's**, in `src/lib/chem`, for the canvas and the
*Atom map* node. Its first version is a port of ACCeL's mapper, with the
maintainer's permission and its MIT notice kept; no other ACCeL code is in
core. What it gives a calculation is a complete map in 3D, every atom one to
one, hydrogens by geometry; a heavy-atom-only map is for display only.

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
keeps program, scheduler and model names out of core - its literals, its
regular expressions and its pages' text (PLUGINS.md, *The boundary, kept by
a test*). Property and failure
names given by plugins are data, never literals in core. Core names only the
quantities its own nodes compute or use: *energy*, *thermal correction*,
*share*, *degeneracy*, *vibrations*, *group*, *shielding*, *excited
states*.

## Questions

None open. Every question raised in the five rounds is answered below.

## Answered (2026-10-16)

- **As recommended:** 1 to 11, 13 to 15, 17 to 19, 22, 23 and 25 to 30. The
  principle under 20 reopens three of them: 8, 19 and part of 27 (questions
  D, B and E). It also replaces 22's paired entries (question A), and moved
  30's mapping and checks to ACCeL; they are now Meno's (*On the fifth
  draft*).
- **12:** keep everything, with a way not to (*Keeping*; question I).
- **16:** Meno's own nodes redone as a small, clean set (*Meno's own nodes*;
  questions F and G).
- **20:** don't over-abstract: the governing principle, *The principle:
  simple nodes, wired*.
- **21:** an ACCeL plugin was to fill the mapping, and more (question H);
  since then, mapping is Meno's own (*Atom mapping, and what Meno does
  itself*).
- **24:** no advanced nodes for retries: drawn (*Failed entries, and running
  them again*; questions B and J).

**Questions A to K, on the fourth draft:**
- **As recommended:** B to H, J and K.
- **A:** explicit IDs, embedded by a node, and pairing by those IDs. No
  implicit rules (*Steps, ports and exits*; *Tag*).
- **I:** everything self-contained in the `.meno`: every job's inputs,
  outputs and raw files brought in by default, with a way not to and a size
  warning. The working directory is only a scratch place, cleanable, and
  running again elsewhere writes the inputs back out of the `.meno`
  (*Keeping*; *Where jobs run*).

**After comparing with ACCeL's second version:**
- Meno is the base, and owns the store, the graph, provenance, whether a job
  has been done, and where jobs run.
- The nodes ACCeL might have filled are each decided, and all are Meno's
  (*Atom mapping, and what Meno does itself*). This replaces H.
- The second version's mechanisms are adopted as Meno's own: job keys,
  never overwriting, stopping on outputs Meno cannot account for, a local
  runner that knows its resources, cluster jobs submitted and taken up
  again.

**Questions M to S, on the fifth draft (2026-10-17): all as recommended.**
- **M:** *Tag* is the one node that writes IDs; a node that takes two
  inputs entry by entry matches them on a property chosen on it; an
  entry with no match, or more than one, goes to *rest*.
- **N:** a job is reused only within the same workspace: no cache on the
  computer decides what runs.
- **O:** the three cases (a job folder without its record, files whose key
  is not the job's, outputs of a run Meno did not start) stop the step;
  *Adopt* is per job, recorded with when, and the adopted result is marked
  wherever it is shown.
- **P:** until #319 and #350 are merged, *Duplicates* compares atoms in
  their own order; symmetry and the automorphisms come with
  PR 2.
- **Q:** a save past 500 MB says the workspace is large; the threshold is a
  setting (Settings, General).
- **S:** this computer's runner takes a job's cores and memory from what
  its plugin declares, capped in Settings (all cores and three quarters of
  the memory by default).

**On the fifth draft, before M to S:**
- **Atom mapping is a basic Meno feature**, in core, since drawing a
  reaction scheme calls for a map. ACCeL's mapper, the maintainer's own MIT
  code, may be ported; another lane builds it. The *Atom map* node is
  Meno's, and the ACCeL plugin leaves this plan.
- **R:** the working folder is set in Meno's Settings, Meno's own folder by
  default, and cleaned on its own once the files are in the `.meno`, with a
  choice to keep job folders.
