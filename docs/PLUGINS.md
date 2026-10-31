# Plugins

What Meno does through plugins and what it does itself, how the chemist
chooses which plugin does what, and when plugins run. This is a plan,
written on 2026-10-06 with the maintainer, and its decisions are made; the
manifest, the guide and the catalogue were tidied and added on 2026-10-10
(*The manifest* and after). How files come in and go out under it is in
[`FILE-IO.md`](./FILE-IO.md).

## The maintainer's direction (2026-10-06)

- **Plugins are not only about files.** They will add features too:
  running calculations, connecting to structure search, and more. Meno
  itself is not a plugin; it comes with its own parts.
- **The chemist chooses the program.** Which program reads a kind of file
  - Meno's own parser or cclib for XYZ - and which parses SMILES, assigns
  R/S, or searches conformers.
- **RDKit is a plugin of its own**, independent like the others.
- **Nothing is kept running ahead of need.** Every plugin starts when it
  is first needed and stays for the session, as RDKit does now. More
  plugins kept running would only take more memory. (Since 2026-10-13, a
  worker unused for 15 minutes is stopped: *When plugins run*.)
- **A fingerprint might lead into a workflow**, and so might other such
  results.
- **Plugins are completely independent, and Meno builds only a general
  place to take them in** (the maintainer, 2026-10-06, not for the first
  time). Plugins will be distributed and fetched over the internet.
  Meno names no plugin and knows no program: what a plugin is, does and
  reads is the plugin's own data, in its folder.

## Words

- **Role** - a job Meno defines, with what it is given and what it gives,
  in Meno's forms. Examples: read a kind of file, write one, parse
  SMILES, assign R/S, make conformers, make a fingerprint.
- **Plugin** - an independent package that fills roles: a folder of its
  own (*A plugin's folder*). It has an environment of its own, made from a
  lock with the network's consent, a worker, and a manifest: data saying
  which roles it fills and which kinds of file it brings, reads and
  writes, read when it is added (FILE-IO.md). It shares no code with
  another plugin, and knows of none (the maintainer, 2026-10-06).
  Examples: RDKit, cclib, PySCF. A plugin may also run nothing and bring
  data alone - a guide, a catalogue: Getting started.
- **Guide** - steps a plugin brings, shown when asked in a card of
  Meno's (*A plugin's guide*).
- **Catalogue** - the plugins a plugin suggests, and the kinds of file it
  suggests them for (*A plugin's catalogue*).
- **Meno's own parts** - what comes with Meno and fills roles too: its
  readers and writers of MOL, SDF, RXN, XYZ and cube, its SVG, its 2D
  layout. Meno's own parts are not plugins and are not listed as plugins.
- **Assignment** - which plugin, or Meno, fills a role. It is the
  chemist's choice, made in Settings, with a default Meno ships.
- **Core role** - a role Meno's everyday drawing rests on: parsing
  SMILES, the chemical checks, R/S and E/Z, a structure in 3D.

## Roles

| Group | Role | Filled today by |
| --- | --- | --- |
| Files | read a kind; write a kind | Meno (MOL, SDF, RXN, XYZ, cube; MOL, SDF, RXN, SVG), cclib, PySCF - see FILE-IO.md |
| Chemistry (core) | SMILES to a structure, and back | RDKit (its worker's `from_smiles`, `to_smiles`) |
| Chemistry (core) | the checks: hydrogens, valence, aromatic rings, R/S and E/Z (one role since 2026-10-10: one request gives them all) | RDKit (`analyse`, its CIP labeller for the labels) |
| Chemistry (core) | stereoisomers of what is left open | RDKit (`open_stereo`) |
| Workflows | new structures from a generative model: the step *Generate* (WORKFLOWS.md) | REINVENT 4 (`run` with no entries; its prior trained on PubChem downloaded besides, `downloads`), sampling on the CPU with the seed set, so that the same asking gives the same SMILES; each handed on as sampled, with its NLL and SMILES_state - nothing made of it, nothing refused (*Generate*, below) |
| Chemistry | structures read from pictures (PDF.md, *Stage 5*, part B) | MolScribe, MolNexTR - each standing alone, the chemist choosing which (`read_picture`; a model's trained weights downloaded besides, `downloads`) |
| Molecules in 3D (core) | a structure in 3D, and its conformers | RDKit (`conformers`) |
| Molecules in 3D | which stereoisomer each molecule in 3D is (*Configurations*, below) | RDKit (`configurations`) |
| Molecules in 3D (core) | a drawing of a structure in 3D; its bond orders and hydrogens, where its file leaves them out (WORKSPACE.md, *Hydrogens and bond orders*) | RDKit (`drawing_of`, `orders_from_smiles`, `add_hydrogens`) |
| Molecules in 3D | pictures and films of them, rendered (RENDER.md) | Blender (a job: Blender, Meno's own copy, fetched as the plugin is set up) |
| Drawing | 2D layout, Clean-up | Meno (its layout engine) |
| Later | fingerprints, similarity | - |
| Later | structure search in outside databases | - |
| Later | running a calculation, an input written and an output read back | - |

Meno defines the roles and their contracts. A plugin says, in its
manifest, which roles it fills. A new kind of role comes with Meno, and a
new plugin for an existing role needs no change to Meno.

### Configurations

Which stereoisomer each molecule in 3D is, read from its own geometry -
asked before a step that needs it runs (*Populations*: a Boltzmann sum
over two stereoisomers, which do not interconvert, is wrong), and of every
conformer on its own, so that a set holding two configurations is seen to
hold two. A conformer search on a structure with a centre left open can
embed both.

- **Given**: MOL blocks in 3D (`configurations`, `{ molblocks }`), in order.
- **Gives**, for each: its elements that could be stereogenic - a centre
  (its atom), a double bond, an axis or a cumulene (its two atoms), by
  atom number from 0 - and whether each one's configuration is given
  (from 3D, every one the geometry fixes); and a key that two molecules
  share exactly when they are one stereoisomer. Or, for one it cannot
  read, why: the others are still answered.
- **Core** keeps the answer on the entry (`src/lib/entry.ts`,
  `EntryStereo`) and compares entries by `stereoIdentity`: the key with
  the plugin and version that made it, so that keys of two versions are
  never taken for one another. An element left open, or a molecule not
  perceived, matches nothing. CIP labels (R and S, E and Z) are the
  checks' role, for showing, and are never part of it.
- **Not perceived is not "no stereo".** Where nothing fills the role, or
  the plugin fails, the entry says so and why; a step that needs it does
  not go on as if there were none.

RDKit fills it with `FindPotentialStereo`, after its own geometry has
assigned the configuration (`AssignStereochemistryFrom3D`), and its
canonical SMILES as the key. RDKit marks `FindPotentialStereo`
**experimental**: its answers may change in a later RDKit. So its answers
are held on cases worked out by hand -
cis- and trans-1,4- and cis-1,3-dimethylcyclohexane (each ring carbon a
centre), methylcyclohexane, 1,1-dimethylcyclohexane, propene and
1,4-dichlorobenzene (none), meso-2,3-butanediol (two), (E)-2-butene (one
double bond) - in `scripts/calc/test_plugin_rdkit.py`, *Configurations*,
which CI's plugins job runs on every push, in an environment installed
from the plugin's lock. A test in Meno's own suite fails when the plugin's
lock moves to another RDKit (`workflow/configurations.test.ts`), until the
version those cases passed with is written there.

## A plugin's folder

Everything a plugin is lives in one folder, named by its id:

```
<id>/
  manifest.json      what it is, and all it does, as data (*The manifest*)
  worker.py          its worker, spoken to in JSON lines under the contract -
                     where it runs anything
  requirements.lock  its environment, made by uv from PyPI - or, where it
  (or pixi.toml and  needs conda-forge, by pixi
   pixi.lock)
  requirements.in    what its lock was made from (uv's), kept to make it again
  <script>.py        a script of its own that a job runs, in its environment
                     (RDKit's conformers_job.py, Blender's render.py)
  <name>.grammar     how a text of a kind it knows is coloured, where it says
  overrides.txt      what its lock overrides, where its makers pin what cannot
                     be installed (MolNexTR's)
  LICENSE            the licence of its own code, where that is not Meno's
                     (*Licences*): the Blender plugin's alone
```

What it needs besides - a model's trained weights, too large to carry and
no package - is not in its folder: its manifest says where Meno fetches it
(`downloads`), into its environment's folder.

A plugin that runs nothing - Getting started, which brings a guide and a
catalogue - has a manifest alone.

- **A plugin's step may take less than its kind does** (`takes`): CREST's
  conformer search starts from a molecule in 3D, so it takes `molecules`
  and `conformers`; RDKit's says nothing, and takes structures drawn as
  well, making them in 3D as its `conformers` role does.
- **A plugin may be for some systems only** (`systems`): CREST, whose
  program conda-forge builds for macOS and Linux; elsewhere Settings,
  *Plugins*, says so in place of *Add*.
- **Plugins added are set up one at a time** (`lib/calc/workers`
  `addPlugin`), in the order *Add* was pressed: those after the first say
  whose set-up they wait for ("Waiting for <plugin>'s set-up…"), and each
  begins as the one before it ends, done or not. Several set up at once
  share uv's Python and its cache, and on Windows a file one holds is
  another's failure. Asked again while it waits or is set up, nothing more.
  One waiting can be skipped (*Skip*, beside "Waiting for…"): it leaves the
  line, not added, saying so - where the set-up before it holds the line, a
  download that goes on and on or a question not answered.
- **A plugin not added says why**, on its card in Settings, *Plugins*,
  until *Add* is pressed again - looking at the plugins afresh, as
  *Plugins* is shown or a file is read, never takes it away - and in a
  notice in the window's corner that stays until it is put away
  (`ui/setUpSaid`): "<plugin> was not added: weights.bin stopped after
  250.0 MB of 900.0 MB (the connection broke; taken up again 4 times). What
  came is kept: Add goes on from there." Until 0.1.18 a set-up that failed went
  back to *Add* without a word as soon as the plugins were looked at again.
  A set-up's program that fails says the last it said (`uv pip install
  failed: …`), and that goes to Meno's log too.
- **A plugin may run a program installed separately** - ORCA, Gaussian,
  Multiwfn, NCIPLOT - which Meno never provides (`installed`). Meno finds
  it where the system finds programs, or where the chemist locates it in
  Settings, *Plugins*. Such a plugin, and only such a plugin, is named as
  an interface (the *ORCA interface*), and its steps by the program's name
  (*ORCA*) (the maintainer, 2026-10-12).
- **A plugin may run a program Meno fetches for it** as it is set up -
  Blender - and never a copy installed on the computer (`downloads`,
  `provides`; *A program Meno fetches*). It is not an interface: it is
  named by the program alone (*Blender*).
- **Meno carries some for now**, in `src-tauri/resources/plugins/`, and
  finds them there: no code of Meno's names one. Those fetched over the
  internet later will be folders of the same kind; how Meno trusts a list
  fetched online is decided then.
- **Kinds are shared by id, not by code.** Two plugins that read Gaussian's
  output each bring the kind `gaussian`, with its name and marks, and Meno
  puts them together. A plugin reads only the kinds it brings and Meno's
  own: one it names in `reads` that is neither - another plugin's - is
  left out as the plugin is taken in (`lib/calc/catalog.ts`, `pluginOf`).
- **Meno checks every manifest as data**, wherever it came from: its id,
  its lock and worker in its folder (the backend allows nothing else), its
  marks as text of some length (`lib/plugins/manifest.ts`); and, as its
  kinds are registered (`lib/io/kinds.ts`, `registered`), no mark that one
  of Meno's own sample files holds - an SD, an XYZ, a PDB and an RXN file
  Meno carries, and its workspace's and a structure's records. Such a mark
  is not taken, and Settings, *Plugins*, says which.
- **A grammar is data too** (`<name>.grammar`, in Lezer's form, named in
  the manifest with the tone each of its parts is drawn in): Meno makes it
  into tables - a tokenizer that reads each letter once, a parser that
  never goes back - tried apart, in a worker, within 5 seconds. One that
  asks for code (`@external`, `@context`) is refused. Two plugins that
  bring a kind each carry a grammar for it, as they do its marks; Meno
  uses the first's.

## The manifest

As tidied on 2026-10-10 (the maintainer agreed the spec as proposed: each
thing said one way, checked one way). Read as data, whoever wrote it
(`lib/plugins/manifest.ts`, `acceptManifest`): what reads wrong in it is
left out, and what it cannot do without makes it none. What it does not
say, it has none of. Meno's backend reads the parts it acts on - a step's
programs, a program installed separately - from the same file, and checks
them by the same rules (`src-tauri/src/jobs.rs`, `lib.rs`).

| Field | Form | What it says, and how it is checked |
| --- | --- | --- |
| `id` | text | Its id: a lower-case letter or digit, then up to 39 more or hyphens; its folder's name. The same rule in the backend. |
| `name`, `version`, `description`, `licence`, `homepage` | text | What it is called; the plugin's own version (*Versions*, below); one line on what it is; the licence of what it brings, as its version is that one's - the program's or package's, or its own code's (*Licences*); its home. A result keeps the version its worker says it runs (*The contract*). |
| `uses` | list of `{name, version}` | The programs and libraries it wraps, each with the version its lock or pin fixes (*Versions*): said beside its own version in Settings › Plugins. |
| `setUpBytes` | number | About how much room its environment takes once set up, in bytes, as measured: asking to set it up says it beside the packages it fetches ("about 1.0 GB once set up"), for a plugin whose environment is large. Unsaid, where none was measured. |
| `environment` | `"uv"` or `"pixi"` | What makes its environment, from its `requirements.lock` (uv, PyPI) or its `pixi.toml` and `pixi.lock` (pixi, conda-forge), into `plugin-<id>`; its worker is its `worker.py`. None, and it runs nothing: `reads`, `writes`, `roles` and `steps` are then left out. |
| `systems` | `["macos", "windows", "linux"]`, some | The systems it can be added on; none said, every one. |
| `kinds` | list of `{id, name, program?, writtenBy?, extensions, marks?, lines?, probe?, grammar?}` | Every kind of file it knows. A kind it reads is told by its `marks` - text a file's start holds, at least six letters, anywhere or at a line's start (`at: "line-start"`), in any case (`anyCase`) - each tried on Meno's own sample files as the kind is registered (`lib/io/kinds.ts`), and not taken where one holds it; or, where it says `probe`, by asking it, for files of its `extensions`. A kind it only colours - a program's input, written by hand - is told by its files' names, and among those that share them by what its lines begin with (`lines`, as short as a letter: they claim no file). `program` names the program that writes it, as a molecule read from it names it. `writtenBy` (2026-10-31) says which of the plugin's own programs writes it - one its `steps` or `roles` run, by that name, else it is left out: the kind is that program's output, and the plugin is its own reader, which reads it unless the chemist chooses another (*Several plugins, one role*). Its `grammar` colours the kind's texts, before another plugin's of the same kind. `grammar` is `{file, tones}`: a grammar in its folder, and the tone of each of its parts. |
| `reads` | ids | The kinds it reads: its own, or Meno's; one that is neither is left out as the plugin is taken in (`lib/calc/catalog.ts`). |
| `writes` | list of `{kind, options?}` | The kinds of its own it writes, each given one molecule - one system of molecules in 3D - and its options; its name and files' names are the kind's, the first the one Export gives. |
| `xyzEnergies` | list of `{id, pattern, unit?}` | How the program writes a frame's energy on an XYZ file's comment line, from its documentation: `pattern` a regular expression (case-insensitive) with one capture group holding the number; `unit` its number's - `hartree` (the default), `eV`, `kcal/mol` or `kJ/mol` - which Meno converts to hartrees. Meno reads a frame's energy only by the patterns of the plugins added (docs/FILE-IO.md); where two find different numbers on a line, none. |
| `xyzSteps` | list of `{id, file?, comment?}`, one or both | The XYZ files the program writes whose frames are an optimisation's steps, which of them converged not said in the file (its output says it): `file` the file's name as the program's documentation or its own output gives it, `*` any run of characters (`xtbopt.log`, `*_trj.xyz`), matched in any case; `comment` a regular expression every frame's comment line matches, so that the file is known renamed too (xtb's `energy: ... gnorm: ...`, ORCA's `Coordinates from ORCA-job <name> E ...`) - of a file of two frames or more, and never an ensemble's (a conformer search's, a relaxed scan's points). None of such a file's frames is an entry of a set, and the molecule says why (docs/WORKFLOWS.md, *Compound sets and conformer sets*). A file no plugin names is read as before, every frame an entry. |
| `roles` | list of `{role, programs?, options?, looks?, motions?}` | The roles it fills (*Roles*), each one Meno defines, each once; the programs it runs for one as a job, by name, as a step's are (Render: Blender); options only for a role that takes them (*Structures in 3D, and their conformers*); and, for Render, the looks it makes (`looks`: each declared in full - *Looks*, below) and the motions it makes of a film (`motions` - *Motions*, below). |
| `steps` | list of `{kinds, programs?, options?, takes?, files?, seeds?}` | The kinds of a workflow's step it fills - each one Meno defines (`lib/plugins/steps`), each once - several said in one where they share their programs and options. `programs` are the programs it runs, by name, from its environment or installed separately; none, and it does the step in its worker. A step of a kind that is also a role it fills and says no options takes the role's, starting from those chosen for the role in Settings (2026-10-13; before, from the manifest's defaults). `takes` is what it takes, where less than the kind does. `files` are the kinds of file it takes besides, by their ids: each entry is given the output its molecule was read from where it is of one of them (NCI.md, *How the plugins and Meno meet*). `seeds`: `true` on *Generate* where it makes from seeds: the step then takes *Seeds*, structures drawn (*Generate*, below). |
| `installed` | list of `{name, label, files, path?, env?, places?, version?, beside?, parallel?}` | The programs installed separately its steps or roles run: its name as they name it; what it is called; its file's name on each system; the folders put first where programs are looked for, and the variables it is given - each `{folder}` (where its file is) or `{parent}` (the folder above), with a path inside it; and, on each system, the folders it is usually installed in, looked in after those the system finds programs in - each from `/`, `{home}` or `{programs}` (Windows' Program Files), a `*` in a folder's name for any text, a version's, the newest first; and how it says its version, and the least Meno takes - `{args, after, least}`: run with `args`, options alone (never a file or a path), it prints a line beginning `after`, then its version, digits and dots. Then Meno asks each copy it finds - as it looks, as one is located and before each job - and takes the newest that is new enough, saying of an older one why it will not do ("Meno needs <program> 5.0 or later; this one is 4.1"). And the programs installed with it, in its folder, that a job may run after it (`beside`: a few, each by a name - as a job's `then` names it - and its file's name on each system: ORCA's `orca_2mkl`). And how it runs in parallel (`parallel`): `"threads"`, or unsaid - told its job's cores as its threads - or `"processes"`, as under MPI (ORCA's `%pal`): its job's cores, never more than the computer's physical cores, are its processes, each told one thread, and the queue counts each process as a whole physical core (WORKFLOWS.md, *Several at once*). Never a shell or Python; never `PATH`, what loads code into a program (`LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`), the network's way out, or the threads Meno sets. Where its libraries are looked for (`LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH` and the like) it may be told, as any variable, only a place in its own installation - `{folder}` or `{parent}`, with a path inside it (`jobs.rs` `ENV_NEVER`, `place_ok`). Only one a step or a role runs. A macOS app picked where it is located stands for the program inside it. |
| `downloads` | list of `{file, name, licence, url, sha256, bytes, system?, arch?, unpack?, program?, provides?, unpackedBytes?, cite?}` | Files it needs besides its environment - a model's trained weights - each fetched by Meno as the plugin is set up, under the same leave: asking to set it up says each one's name, licence and size, and where it comes from. `url` is HTTPS, pinned to a revision where its host has them; it is checked against `sha256` and `bytes` before it is kept, as `file` - a name, not a path - in `files` beside its environment (`uv/plugin-<id>/files`, or `pixi/plugin-<id>/files` for one pixi makes), taken away with it. A download cut short is taken up where it stopped: of itself, from where it stopped (a range asked for, taken as the rest only where the server's reply says it begins there; all of it again where the server sends all of it, another range, or says the part is past its file's end), up to four times, after 2, 5, 15 and 30 seconds - each stop written to Meno's log, with how much came - and only then said to have stopped, with how much came of how much and how often it was taken up, the task failed with that reason in the network's record (`fetch_resuming`, 2026-10-24); what came is kept, and *Add* goes on from there. What came is kept under the file's name and its SHA-256's first twelve digits (`model.pth.<digits>.part`), so that what came of a file an older manifest named is never taken up as the new one's: it is thrown away. Once kept, a file is read through for its SHA-256 again once a launch - and again where its size or the time it was last changed is not what it was then - as the plugin is first used in a launch - set up, started, or its worker given its files - never at launch itself, where Meno asks only whether each is there at its size (2026-10-27; `there`): one there that is not its size, or whose SHA-256 is not the manifest's - changed or damaged since - is said plainly ("model.pth is not the file Meno downloaded: its size or fingerprint (SHA-256) is not the one Meno carries - changed, or damaged, since.") and asked about again, even where setting the plugin up was allowed, before it is downloaded anew over it; no, and the plugin does not run, saying the same. One that could not be read through - held by another program, not allowed, a share gone - is neither: said, with why, the plugin not run, and read again the next time; never fetched over. While its files are read through, where that takes more than a moment, Settings' *Plugins* and the workspace say so ("Checking its files…"). An archive Meno unpacked is as the stamp it left says: what it unpacked to is not read through again. Meno keeps the files it downloaded as they were: weights of one's own belong in a plugin of one's own, never put in place of these. The worker is given that folder as its one argument. All as they must be, or the plugin is none; the backend reads them from the manifest itself (`src-tauri/src/plugfiles.rs`). Only those for this computer are fetched: its system, and processor, where a file says one (`system`, `arch`). One may be a program the plugin runs, Meno's own copy of it (`provides`: its name, as the plugin's steps and roles run it): *A program Meno fetches*, below. One may be data compressed with gzip (`unpack: "gz"`, never a program), which Meno unpacks itself into `files/<its name without .gz>/`; it must give `unpackedBytes`, said when asking to set the plugin up, and is never unpacked past it. `cite` is how its makers ask to be cited, said there too. A plugin that comes to need a file it did not as it was set up asks again, even where its setting up was allowed: the record of its set-up keeps the files the user was told of. |
| `needs` | list of `{plugin, program, env}` | Another plugin's program its jobs may need (2026-10-27): that plugin, by its id; its program, by the name that plugin's manifest gives it; and the variable the job is told where it is in. ORCA's: the xTB plugin's `xtb`, in `XTBEXE`, for the xTB methods ORCA runs through the xtb program (`XTB2`, `GFN2-XTB`, `GFN-FF` and the rest; ORCA's own `NATIVE-GFN2-XTB` needs none). A job needs it only where its plugin's worker says so of that job (`prepare`, a job's `needs`: the ids). Meno finds the program as that plugin's own jobs would. Where that plugin is not added, the step says so before any job is made ("The xTB plugin is needed for this: add it in Settings, Plugins"). On macOS and Linux it is linked into the job's work folder under its own name, and the variable names it there (`./xtb`): a path with a space in it, as Meno's data folder has, is never given, as ORCA 6.1.1 takes none. On Windows its path is given, and refused where it has a space; it is never quoted. The link is never listed among the job's files: neither kept as a raw output nor saved in a workspace. Its plugin's version is part of each job's key. Never another plugin's own; never a shell; never a variable that finds or loads programs (`ENV_NEVER`), the network's way out, or the threads Meno sets. All as they must be, or none is taken (`src-tauri/src/jobs.rs` `needs_declared`). |
| `guide` | list of `{title, text, at?, until?, suggest?}`, at most 12 | Its guide (*A plugin's guide*). |
| `suggests` | list of `{plugin, for}` | Its catalogue: the plugins it suggests, by id, each with what it is for, in a line (*A plugin's catalogue*). |
| `files` | list of `{id, name, extensions, marks, suggest}` | The kinds of file its catalogue names, each told by its own marks - checked as a kind's are - with the plugins it suggests to read it. |

A plugin that does nothing - reads, writes, fills, colours, guides and
suggests nothing - is none. Options are in the general form (`lib/options`:
a choice, a number, a text or a switch, each with a label and a default it
takes; a number's `min`, `max`, `step`, `unit`; `from` the molecule's
charge, multiplicity or name, for a writer's).

A step's options are saved with its workspace, and a workspace may come
from someone else: whatever a text option holds runs, as the plugin
writes it into its program's input, when Run is pressed on the computer
it is opened on. So a plugin writes a text option so that it names no
program and no file, by its program's own reference, and refuses one
that would (2026-10-13). Gaussian's route section takes no External,
however shortened, and no `@`, `%`, `#`, `!` or double quotes; ORCA's
simple input line takes no `%` or `#`, the manual naming a file or a
program only in a block, in quotes. These input texts are checked by the
plugins' workers alone (ARCHITECTURE.md, the known boundary under the
jobs' rules); what Meno checks itself is which program runs, and that a
program installed separately is given no file but its job's.

A step's `files` (built 2026-10-11, NCI.md): `{"kinds": ["nci"],
"programs": ["multiwfn"], "files": ["molden", "gaussian-fchk", "wfn",
"wfx"]}` - a wavefunction another plugin read is given to Multiwfn's step,
the two joined by a kind's id and sharing no code; an entry given none is
worked out from its geometry.

## A plugin's guide

A plugin may bring a guide (`guide`): steps of plain text Meno shows one at
a time, in a card in Meno's own look (`ui/guide/GuideCard.tsx`), beside
the part of the window a step points at, with a ring round that part.
Nothing else is dimmed or held: the chemist does what a step says on the
page itself.

- **Where a step points** (`at`) is a part Meno names, never how the
  window is built: `page`, `quick-add` (once open), `structure` (the one
  selected, else the last drawn), `menu` (a right-click menu, once open),
  `save`, `settings`. None, or a part not there now, and the card sits
  low in the middle of the page. A step that points at a part, while
  neither it nor any page is seen (Settings the tab in front), waits out
  of sight until a workspace is in front again.
- **What a step waits for** (`until`), Meno names too: `quick-add` opened,
  a structure `selected`, a `menu` opened. A moment after the chemist does
  it, the guide goes on by itself; Next does as well.
- **A step may offer plugins to add** (`suggest`, by id), each with what
  its plugin's catalogue says it is for, and Add, which asks for the
  network as adding always does.
- **Only when asked.** A plugin's guide is shown from Settings, *Plugins*
  (*Show*), with a workspace brought to the front - never of itself: not
  on Meno's first start, nor as its plugin is added (2026-10-24; before,
  each was shown once of itself, and Meno opened on its first step). It
  closes when gone through or skipped - Skip, or Escape where nothing else
  takes it (the maintainer, 2026-10-13) - and when its plugin is taken
  away.
- **Meno's question about keeping itself up to date** waits until a guide
  is closed (it comes after the user's first action: `lib/firstAction.ts`).

**Getting started** (`resources/plugins/getting-started`) is the guide
Meno comes with (the maintainer, 2026-10-10: a plugin, there from the
start, that can be removed like any other). It runs nothing. Its steps:
double-click on empty space for Quick Add; Chain and SMILES there; press
and hold to select a structure; a right-click menu and its row of icons;
Save, with Settings beside it; the plugins to add first - RDKit, cclib,
xTB. It is shown when asked, as every guide is: Meno's first start
opens on the page alone. Taken away, its guide is not offered, and no
plugin is suggested for a file (*A plugin's catalogue*).

## A plugin's catalogue

Meno names no plugin and knows no program: only plugins know what other
plugins and outside programs do (the maintainer, 2026-10-06 and
2026-10-10). So the plugins to suggest are a plugin's data, its catalogue:

- `suggests` - the plugins it suggests, each with what it is for: shown in
  its guide and in Settings, *Plugins*.
- `files` - the kinds of file it names, each told by the catalogue's own
  marks, with the plugins it suggests to read it. A file no plugin added
  reads, of one of these kinds, is told as it, and Meno says which plugins
  would read it ("water.out (ORCA output): cclib or PySCF would read
  it."), each with Add, the file read again once one is added.

Only the catalogues of the plugins added are looked at, and the manifests
of plugins not added never are: their marks are not to be trusted before
the chemist adds them (the maintainer, 2026-10-10). With no catalogue, a
file no plugin added reads is what Meno makes of it - text, say - and no
plugin is named. Getting started's catalogue names the plugins Meno
carries; a test keeps its kinds and the kinds those plugins read in step.

## Licences

Meno is Apache-2.0, and so is what the folders of the plugins it carries
hold - their workers, manifests, locks and grammars - but for one plugin
(below). A plugin's `licence`, as its `version` and `homepage`, is that of
what it brings: the program or package its environment is made with
(cclib's BSD-3-Clause, xTB's LGPL-3.0-or-later, MolScribe's MIT), or,
where it brings only its own code - an interface to a program installed
separately, the WFX reader, Getting started - that code's. Settings,
*Plugins*, shows it.

What a plugin brings is fetched as it is set up - from PyPI, conda-forge
or its makers' repository, as its lock says - and is carried neither in
its folder nor in Meno, so its folder holds no text of that licence
(checked on 2026-10-13 against the licences the packages install;
MolScribe's as PDF.md, *A picture read*, gives it):

- **cclib** and **RDKit** (BSD-3-Clause) ask that copies passed on, as
  source or built, keep their notice; **MolScribe** (MIT), that its
  notice go with copies of it or of substantial parts of it. Meno passes
  on no copy of any of them: its lock names each, and a worker of Meno's
  uses it.
- **xTB** and **CREST** (LGPL-3.0-or-later) set their conditions on
  conveying them, and none on running them (GPL-3.0, section 2, which the
  LGPL takes in): Meno runs each as a program apart, from the environment
  pixi made on the computer.
- A model's trained weights (`downloads`) are fetched under their own
  licence too, and not carried.

A plugin's folder holds a licence's text (`LICENSE`) only where its own
code is under another licence than Meno's. A plugin whose code must be -
a script for Blender, which uses Blender's own Python API and so is GPL -
may come with Meno while it stands apart (the maintainer, 2026-10-10; to
be distributed apart later, if those using Meno in companies make that
worthwhile):

- it is a folder of its own, with its licence's text, and says it
  (`licence: "GPL-3.0-or-later"`);
- Meno's code and other plugins never take anything from it, and it
  speaks to Meno only through files and arguments - a separate program,
  not a part of Meno;
- it is listed with its licence wherever Meno lists the licences of what
  it carries: README, and Settings, *Plugins*.

The Blender plugin (`resources/plugins/blender`, RENDER.md) is the first
such plugin.

A plugin Meno stops carrying leaves its files behind on Windows unless the
installer's hook deletes them (`src-tauri/windows/hooks.nsh`,
`NSIS_HOOK_POSTINSTALL`), as was done for the Gaussian input plugin once it
became the Gaussian interface, and for the console's worker and Meno's own
Python locks.

## A program Meno fetches

Meno may download a program a plugin runs itself only where all of these
hold (the maintainer, 2026-10-11):

1. Its licence lets anyone obtain and use it, with no registration and no
   terms each user is asked to accept.
2. It is an official prebuilt build, from its makers' own host; Meno never
   hosts it again.
3. It needs nothing installed on the system - no administrator's rights,
   no installer, no change to the system: it is unpacked into the plugin's
   data folder (never inside Meno.app) and taken away with the plugin.
4. Its version is pinned, and checked by its SHA-256.
5. The user is asked first, told the program, its licence, its size and
   where it comes from.

How (`downloads`, `src-tauri/src/plugfiles.rs`): a download that
`provides` one of the plugin's programs, by the name its steps and roles
run it by, is an archive for one system - and processor, where it says one
(`system`, `arch`: `aarch64`, `x86_64`) - with how it is opened (`unpack`:
`dmg`, `zip` or `tar.xz`) and where the program is in it (`program`, `*`
for the one folder there is). It is fetched as the plugin is set up, as
its other files are, under the same leave: the one question that sets the
plugin up says it - its name, its licence, its size and where it comes
from. It is checked against its SHA-256; unpacked by what the system has -
a disk image mounted read-only and the app copied out of it as it is, its
signature kept (macOS: `hdiutil`, `ditto`); a zip or a tar.xz opened by
the system's own `tar`, which shows no console on Windows - into
`files/<archive's name>` in the plugin's data folder, what was there taken
away first (tried again for a few seconds, where a virus checker holds a
file in it), a stamp written last saying it is whole - one cut short has
none, and is unpacked again; and the archive thrown away. A job runs the program from there (`src-tauri/src/jobs.rs`,
`plugin_program`), and from nowhere else: no copy installed on the
computer is looked for - not where the system finds programs, not where
programs are usually installed - and there is no *Locate…*. Such a plugin
is not an interface (*A plugin's folder*). Taking the plugin away takes
the program with it.

As the programs stand (the maintainer, 2026-10-12):

- **Blender** is fetched, and always used: GPL-3.0-or-later, official
  builds from download.blender.org - 5.2.2 LTS for macOS on Apple silicon
  and for Windows on x64 (RENDER.md). The manifest names Windows on arm64's
  too, but a download is chosen by the processor Meno was built for, and
  Meno's Windows build is x64 alone: on an arm64 Windows, run emulated, it
  fetches the x64 Blender. A Blender located in
  Settings before is not carried over.
- **ORCA** and **Gaussian** are not fetched: each is obtained under its
  makers' own terms, which each user accepts.
- **Multiwfn** is not fetched: its licence asks each user to agree to its
  terms, and there is no official macOS build.
- **NCIPLOT** is not fetched: it is published as its source, with no
  official build.

## Room for what comes next

What lane L7 brings fits this spec as it is; the rest comes with it:

- **Blender** (real pictures and films of molecules in 3D): built
  (2026-10-11) - the role *Render*, the glTF 2.0 scene Meno writes, the
  Blender plugin, and pictures and films on the page:
  [`RENDER.md`](./RENDER.md); and *Render* as a workflow's step
  (2026-10-12), its pictures in a result set (RENDER.md, *Render as a
  step*).
- **NCI**: built (2026-10-11) - the kind of step *NCI*, a surface
  coloured by another grid as a general form, a step's `files`, and the
  NCIPLOT and Multiwfn interfaces: [`NCI.md`](./NCI.md).

## Several plugins, one role

- **One plugin fills a role at a time**: the one assigned. The others that
  could are offered in the same place. Where none is assigned, the first
  that is added fills it - the one the chemist added, of MolScribe and
  MolNexTR - else the first in Meno's order, set up when it is first
  needed, asking first.
- **A program's output is read by that program's own plugin** (the
  maintainer, 2026-10-31): where none is chosen for a kind and Meno does
  not read it, the plugin added whose own program writes it (its kind's
  `writtenBy`) reads it - before a reader of many programs' outputs -
  else the first added that reads it, in Meno's order. A job's output and
  a file opened by hand are read alike, by that one reader. Core names no
  plugin for it: each says it in its manifest.
- **For reading a file, others may add to it.** The assigned reader reads
  the file. Others the chemist adds for that kind read it as well, and
  their results join under their names, as an NBO plugin's would join
  cclib's. See FILE-IO.md.
- **A role's options** - a conformer search's method and its settings, a
  calculation input's method and basis - are declared by the plugin in a
  general form: a choice, a number, a text or a switch, each with a label
  and a default. An option may be shown only while another has one of some
  values (`when: {id, in}`: a band's size, only under toon shading), may be
  folded with others under a name (`group`), and a choice may fill in other
  options' values when picked (`sets`: a preset's parts, each still the
  chemist's to change); the rule may name an option of Meno's own form
  beside the plugin's (Render's shading). A number may name the value that
  sets nothing, left to the program (`unset`: ORCA's %maxcore at 0). A
  step's line says only the options that apply - one shown under another,
  only while it is - and no number at its `unset`, as no choice of none:
  ORCA's solvent is said only with a solvation. Meno draws them and remembers
  the chemist's last choices. The form, its drawing and the remembering are in place, used
  first by Meno's own writers in Export (`lib/options.ts`, FILE-IO.md).
  A plugin declares a role's options in its manifest, with the role
  (`roles: [{role, options}]`, for a role that takes them); Settings draws
  them under the role, where it is chosen, and the plugin is sent them
  with each request for the role (`options`). RDKit declares its conformer
  search's (0.1.8): how many sought - as many as the molecule needs, or a
  number given - the force field (MMFF94, MMFF94s, UFF), the steps an
  optimisation may take, the random seed - and its *Conformers* step takes
  the same, said once. When two conformers are the same is no option
  (below).
- **How many conformers are sought is the molecule's to say**
  (2026-10-20): a fixed number is too few for a molecule with much to
  explore and more than a rigid one has shapes, so the RDKit plugin asks
  the molecule, unless the chemist sets a number (*Conformers sought*,
  *This many*). By the bonds in it that turn, it is Ebejer, Morris and
  Deane's rule - fifty up to seven such bonds, two hundred to twelve,
  three hundred beyond (*Conformer Generation using RDKit*, 1st RDKit User
  General Meeting, London 2012; *Freely Available Conformer Generation
  Methods: How Good Is Good Enough?*, J. Chem. Inf. Model. 2012, 52,
  1146-1158). Two things are added to it, both measured here:
  - **a ring that can flip is worth at least two hundred.** A ring's two
    chairs are shapes of its own that no turning bond counts, and an
    embedding falls into the rarer one seldom - 3.8% of embeddings for
    tert-butylcyclohexane, 4.3% for phenylcyclohexane, over 8000
    embeddings of each of twelve monosubstituted cyclohexanes - so thirty
    tries missed the axial chair of phenylcyclohexane altogether. At two
    hundred, both chairs came back for all twelve, at every seed tried. A
    ring counts if it has five atoms or more, is not aromatic, and is not
    bridged, a bridge holding its ring in the one shape - bridged meaning
    that it shares more than one bond with a ring of its own size or
    smaller, since against a larger ring it is no bridge but the way round
    it, as each sugar of a cyclodextrin lies on its macrocycle.
  - **a molecule that cannot change shape is worth ten**, RDKit's own
    number for an embedding: nothing in it turns and no ring of it can
    flip, so each try gives the same shape back (benzene, caffeine,
    adamantane).
- **The same conformer** (the maintainer, 2026-10-21): two conformers are
  one where all their atoms, hydrogens included, lie within 0.01 Å RMSD of
  each other, laid over at their best - turned and moved, never reflected
  - over the ways the molecule maps onto itself. It is the maintainer's
  standard for structures fed to quantum calculations, one definition for
  the whole app: it keeps an OH or NH turned the other way as a conformer
  of its own, and a conformer's mirror image too, whose atoms an average
  over the conformers needs (a ring's two enantiotopic carbons swap
  between them). Nothing is made one on any looser measure, nor by energy:
  before, the RDKit plugin took shapes within 0.5 Å over their heavy atoms
  as one, and over the molecule's symmetries only where their energies
  agreed, and its raw embeddings, with no energies, atom against atom.
  (`SAME_CONFORMER`, `Sameness` in its worker.) The conformers Meno's own
  page makes (*3D structure*) are kept once each by it; a workflow's
  *Conformers* step is given every one RDKit made (below), and its
  *Duplicates* step keeps one of each by this same measure.
  - **A tert-butyl's three methyls turned round, or a phenyl flipped, is
    the one conformer.** Such a shape leaves every atom of it somewhere
    else, so comparing atom against atom counted it again and again - a
    tert-butylcyclohexane came back as 26 conformers that were 5. The ways
    the molecule maps onto itself are tried, at most a thousand of them
    (`ALIKE_WAYS`): a tetrakis(triphenylphosphine)palladium maps onto
    itself millions of ways, and trying them took 2.1 s for a single pair
    of conformers.
  - **Hydrogens are matched, not tried.** The hydrogens on one atom are
    each matched to the nearest of those on the atom it is taken to, once
    the rest are laid over; past a thousand ways, so are atoms at the end
    of a chain alike on one atom (the four chlorides of
    OsCl4(PEt3)2, whose ways are 1728, then 72). Past a thousand still,
    conformers are compared atom against atom. Matching to the nearest, or
    atom against atom, can only fail to find that two conformers are the
    same, never make two different ones one: whatever matching is tried,
    two conformers it lays within 0.01 Å of each other are the same. So the
    worst it does is keep a conformer twice.
  - **Most pairs are told apart before they are laid over.** Laid over at
    their best, two conformers share their centre, so each atom's distance
    from it moves no more than the atom does: the RMSD of each element's
    distances from the centre, sorted, is a bound the conformers cannot be
    under, and each way's own atoms laid over alone is another. Only pairs
    and ways under 0.01 Å by both are laid over in full.
- **Minimise with restraints, and a search that holds them.** The RDKit
  plugin fills *Minimise with restraints*: each entry minimised in MMFF94
  (or MMFF94s, or UFF, as the step asks; UFF where MMFF has no
  parameters; refused, said, where neither has), its restraints held by
  RDKit's own constraints as the entry record states them:
  - a distance by RDKit's distance constraint, ½ k d², the record's k as
    it is (kcal mol⁻¹ Å⁻²);
  - a dihedral by RDKit's torsion constraint, which is k (the angle off in
    degrees)², so the record's k times ½ (π/180)² (`TORSION_K`); both go
    the shorter way round;
  - atoms fixed as RDKit's fixed points.

  Nothing between the molecule's parts is left out. It takes at most the
  steps the step gives, 2000 unless set (`STEPS`, the conformer search's
  own), and an entry that does not converge in them goes out of *Failed*,
  saying so. Its energy is the force field's own at the places reached,
  the restraints' not in it. How far it missed what its restraints hold -
  the largest distance miss, in Å, and the largest torsion miss, in
  degrees - comes back as results on the molecule (*Restraints*), so a
  strength set too weak shows rather than passing in silence. Each energy
  law is tested against energies worked by hand, across ±180° for a
  dihedral (`scripts/calc/test_plugin_rdkit.py`). Asked to start *where its restraints were
  first held*, it starts from the entry's `start`, which Meno writes on its
  result from where the entry stood as it came, the first time (case F's
  rounds each start from the geometry before the first, WORKFLOWS-FOUNDATION.md
  F15). Its conformer search holds an entry's restraints too, as each
  conformer is optimised, where the molecule has no metal (a metal's own
  holds are not yet combined with them); none fixed, since a search moves
  every atom. Either refusal is in words, before anything is embedded. Its
  *Held* row says the largest miss over the conformers it kept. A
  distance held is embedded at its value too (`held_bounds`): laid where
  ETKDG lays a molecule's parts, an acid and its base were left apart -
  pyridine's BH3 17 Å off at any strength - and embedded at it they hold
  within 0.02 Å at 239 kcal mol⁻¹ Å⁻² and within 0.01 Å at 500, over
  eight acid–base pairs (`scripts/calc/measure_restraint_strengths.py`
  measures it again). A coordination bond that a
  distance restraint holds - case F's acid held at its base at a factor
  of their van der Waals radii - is held by that restraint alone: the
  force field has no bond for it, so the acid and the base are each as
  their own hydrogens make them (H3N→BH3 held at 3.21 Å comes out as NH3
  and BH3 that far apart). From RDKit plugin 0.1.15.
- **A coordination bond is RDKit's dative bond, taking no hydrogen.** A
  drawn dative arrow or coordination bond (a MOL block's type 9), or a
  plugin entry's bond marked `coordination`, is read as RDKit's dative
  bond, from the atom that lends its pair - never as a covalent single.
  RDKit counts a dative bond in its acceptor's valence, so a plain B drawn
  H3N→BH3 was given two hydrogens, where Meno counts three: the molecule
  in 3D came out H3N→BH2 (RDKit plugin to 0.1.11). Its acceptor, not a
  metal, is given the hydrogens Meno counts, the dative bond taking none
  (`acceptors_as_drawn`), from 0.1.12. A metal acceptor keeps its ligands'
  hydrogens as they are (cisplatin drawn with arrows: six).
- **A group-13 adduct is held in its dipolar form inside RDKit.** RDKit
  cannot hold a dative bond to a full group-13 acceptor: B, Al, Ga, In or
  Tl, neutral, with three bonds besides. So such a bond, from a donor that
  can carry a charge (N, P, As, O, S, Se or a halogen), neutral, is held
  inside RDKit as a single bond, the donor +1 and the acceptor −1
  (`dipolar_adducts`). The total charge and the electrons are the same as
  drawn. Every op reads a drawn adduct so (`read`, `drawing_of_parts`):
  *Check structures* keeps it as drawn, *Descriptors* works it out, and the
  analysis of a drawing marks no atom of it as having too many bonds. What
  the plugin writes of the molecule is of that form, the same molecule
  written as RDKit holds it: its SMILES and the keys made from it
  ([NH3+][BH3-] for H3N→BH3), *Stereoisomers*' SMILES, and *Descriptors*'
  values (its weight the same either way). What it gives back as a
  structure is as drawn: a conformer's atoms carry the charges drawn
  (`drawn_charge`), and each drawing *Stereoisomers* makes carries the
  arrow and the charges drawn (`as_drawn`). The force field's energies are for that form, and *How it was made*
  says so: "N→B computed as a single bond, N+ and B−" (or, for several,
  "N→B, O→B computed as single bonds, each donor + and acceptor −").
  H3N→BH3, Me3N→AlCl3, the BF3 adducts of an ether and a ketone, and
  Al2Cl6 drawn with its bridges as arrows are each made, with all their
  atoms. A coordination bond to a main-group acceptor that cannot be held
  so is refused in words, naming the reason: an acceptor not of group 13,
  a charged acceptor or donor, a donor that cannot carry the charge, or
  two such bonds onto one acceptor. From RDKit plugin 0.1.15.
- **A metal's ligands are kept apart, where that is sound.** While a
  metal complex is embedded and optimised, two atoms bonded to its metal,
  of different ligands, are held at least a floor's angle apart, so that
  its ligands do not pile up: ETKDG knows no angle at a metal, and without
  one the seven fluorides of [ZrF7]3- came out 33 degrees apart, the
  halides of OsCl4Br4 25. The floor goes by how many atoms are bonded to
  the metal, and its source is geometry - each sits below the narrowest
  angle between neighbours of the ideal polyhedra it is for:

  | Atoms bonded | Floor | Narrowest ideal polyhedra |
  |---|---|---|
  | 2 to 6 | 75° (`NARROWEST_AT_METAL`) | trigonal prism with equal edges, 2 asin(√(3/7)) = 81.8°; octahedron, square plane, trigonal bipyramid, square pyramid, 90° |
  | 7 to 12 | 60° (`NARROWEST_CROWDED`) | pentagonal bipyramid, 72° (360°/5); icosahedron, 63.4° (arctan 2). No common polyhedron of 10 or 11 points was worked out: there the margin rests on the icosahedron alone, 3.4° |
  | more | none | |

  Only between point donors:
  - none at a metal with a ligand bound through atoms side by side (eta),
    whose atoms spread round where it sits: Cp2TiCl2's Cp carbon and Cl
    come near 76 degrees, a Zeise-type alkene's carbon and its cis Cl near
    71. Its own holds keep the other ligands off it (*η*, WORKSPACE.md);
  - never between two atoms of one ligand, whose own bonds set its bite
    (en on a lanthanide bites about 65 degrees);
  - nor for a hydride, which may sit closer to another (cis H-M-H).

  The metal's row on the chip says which floor held, or that none did and
  why. A conformer that comes out with two ligands closer than its floor
  by more than five degrees is dropped - the holds give up to two, measured
  on complexes pressed against the 60° floor - and
  the chip counts it, naming the metal and the floor: it sat in a well of
  the force field the hold could not pull it out of. [OsCl6]2-, with Fe
  standing in, gave one 87.7 kcal/mol above the octahedron with two Cl 62
  degrees apart.

  Before (RDKit plugin 0.1.4 to 0.1.7, from 2026-10-17), one floor of 75°
  held at every metal, between every two of its atoms not joined within
  two bonds otherwise. It held 75° where real structures go under it -
  seven- to twelve-coordinate metals ([ZrF7]3- came out at 73°, held,
  where a pentagonal bipyramid's neighbours are 72° apart), and a
  chelate's ends three bonds apart on a large metal - and it held atoms it
  had no reason to: a Zeise-type complex's alkene carbon and cis Cl, and a
  cis dihydride's hydrides, though there the force field's own angles
  stayed above it (77° and 88° here, as now).
- **Where a lighter metal stands in, or eta rings are held, that model's
  energies order the conformers.** Where UFF has no type for a metal and a
  lighter one of its group stands in, or a ring bound through its atoms is
  held over its metal, UFF's energies of that model are not the
  molecule's, so none are given and no populations come of them; but they
  are what the shapes were optimised in, and they order them, lowest
  first, said once in the line that says how they were made ("ordered by
  the stand-in field, Fe for Os"; "ordered by the stand-in field, Ti for
  Zr, the η rings held"; "ordered by UFF's energies, the η rings held").
  Before, the embedding order stood, and [OsCl6]2-'s first conformer was
  its distorted one.
- **What a plugin made says how it was made**, in its own words, as rows
  to show: RDKit's conformers carry their embedding, force field, how many
  were kept and RDKit's version (`how`), kept with the molecule and shown
  when its chip is opened (the maintainer, 2026-10-07).
- **Equivalent atoms keep their places across RDKit's conformers**
  (2026-10-15): an embedding does not say which of a CH2's two hydrogens,
  or of an isopropyl's two methyls, is which, so the plugin lays each
  equivalent group - neighbours of one atom of the same graph rank, each
  the root of a branch joined to the rest through it, and a pendant ring
  symmetric about its bond - as it is in the lowest conformer, by whole
  branches (handedness first, then the fit in the parent's frame), before it
  answers Meno's own page. Only conformers RDKit made are touched: not a
  calculation's, not another program's, not a single structure; no heavy
  atom moves but as a whole equivalent branch; and no whole-molecule
  symmetry is searched.
- **A workflow's *Conformers* step is given RDKit's own** (the maintainer,
  2026-10-30). Each conformer is embedded and optimised as RDKit makes
  it, lowest energy first, and none is taken for another, laid over
  another, has its equivalent atoms settled, or is made as an enantiomer's
  mirror image. Those four are for Meno's own page, which asks for them
  (`onPage`); the core sends that with *3D structure* alone, and no option
  of the step's carries it. So a molecule with one shape can come back as
  many frames of it: [OsCl6]2-, ten embeddings sought, gives nine, its
  octahedron and eight relabellings of it (the tenth is dropped below the
  floor), where the page shows one; a *Duplicates* step after it keeps
  one. Where it embedded from random coordinates (an η complex, or a
  crowded cage that would not embed otherwise), its *Embedded* row says
  so. From RDKit plugin 0.1.14.

## Versions

(The maintainer, 2026-10-16.) A manifest's `version` is **always the plugin's own**, semver (`major.minor.patch`), bumped whenever the plugin's files change. What the plugin wraps - a program or a library - is `uses`, `[{name, version}]`, each the version its lock or pin fixes: a pip lock's `name==version`, a pixi lock's package, the commit a git pin names, or a download's own file name. `src/lib/plugins/versions.test.ts` holds each to its lock or pin, so the two cannot drift; a plugin that wraps a program the chemist installs (ORCA, Gaussian) declares none, and Settings shows the version of the program found.

Settings › Plugins shows the plugin's version, and below it *Uses cclib 1.9rc1* where it declares what it uses. A worker's `ready` event keeps saying the version of what it ran (xtb's, cclib's), which results record as where they came from ("xtb 6.7.1") - that is provenance, and not the manifest's `version`.

On update: nothing keys on `version`. An environment is set up again only by its lock's hash, its Python and its files (`stamps`, `lib/pyEnv`), a fetched program by its pinned file and SHA-256, and what is learned of a computer (the render's device timing) by the devices' names and the program's version - so a plugin's version changing, as these did once, re-fetches and wipes nothing.

## Looks

A render plugin declares its looks in its role's `looks`, each as an object; Meno keeps no list of them (docs/RENDER.md):

| Field | Meaning |
|---|---|
| `id` | The look's id: lowercase letters, digits and hyphens. `meno` is the canvas's look, Meno's own, which every renderer is asked to make and no manifest declares. |
| `label` | What the Look choice calls it. |
| `description` | A short sentence saying what it is. |
| `parts` | A bundle of Meno's own parts, each optional: `molecules` (`meno`, `glossy`, `metal`, `glass`, `matte`, `clay`, `white`) and `surfaces` (`meno`, `glass`, `glossy`, `matte`) - what the scene's file is written with; `shading` (`lit`, `toon`) and `band`; `outlines` (`none`, `thin`, `outer`, `mixed`), `outline` (width) and `outline_colour`; `sticks` (`shown`, `stopped`), where a look sees through. Those left out are the plain ones. |
| `own` | `true` for a look the plugin makes with materials and light of its own: the molecules are left as the scene's file has them, and the plugin is sent the look's id. |
| `seeThrough` | `true` where what is inside a ball shows: the card then offers where the sticks stop. |

The options that adjust a look are the role's own, each shown `when` its look is chosen (`when: {id: "look", in: [...]}`). The card offers the canvas's look and then those the added render plugins declare, in their order. A plugin that adds a look changes no line of core.

## Motions

A render plugin declares the motions it makes of a film in its role's `motions`, each as an object; Meno keeps no list of them (docs/RENDER.md, *Motions a renderer makes*):

| Field | Meaning |
|---|---|
| `id` | The motion's id: lowercase letters, digits and hyphens; none of Meno's own (`turn`, `frames`, `vibration`). |
| `label` | What the card's *Moving* calls it. |
| `description` | A short sentence saying what it is. |

The card offers Meno's own motions the molecules can make, then those the added render plugins declare, in their order. A film of a declared motion is written still, the molecules' atoms and bonds in the scene's extras, and the entry says the motion (`motion`). The options that adjust a motion are the role's own, each shown `when` its motion is chosen (`when: {id: "motion", in: [...]}`) - Once or Loop among them. A plugin that adds a motion changes no line of core.

## The boundary, kept by a test

Core knows no program and no plugin by name: what a plugin makes, reads or does it says in its manifest, and Meno learns it there. `src/lib/plugins/boundary.test.ts` keeps this: it reads the manifest of every bundled plugin and collects what they declare - plugin ids, programs and what they provide, looks, motions, kinds of step, kinds of file read and written - and fails on any string literal equal to one of them in core's source (`src/` and `src-tauri/src`, without tests). Comments may say anything. The words core legitimately owns are in the test's `ALLOWED` list, each with why (the kinds of step Meno defines, the materials of its scene file, an element's name); a new entry is a decision, made in a review.

## When plugins run

**As built** (step 6, `lib/roles/worker.ts`): RDKit is a plugin, a folder
of its own (`resources/plugins/rdkit/`), its manifest saying the roles it
fills.

- **Setting it up.** Its environment (`plugin-rdkit`, from its lock, made
  by uv) is set up the first time a role it fills is needed - SMILES, a
  structure in 3D, R and S - asking first for the network. Once the
  chemist takes it away in *Plugins* it is not set up of itself again: a
  role it fills says to add it there (the maintainer, 2026-10-06).
- **Starting it.** Once set up, the worker starts the first time it is
  asked for, not when Meno starts. In practice that is as soon as a
  structure is drawn, since the chemical checks run by themselves once
  it is at hand (`useChemMarks`, `chemAtHand`). Its first import may
  take a while; up to 90 s is allowed.
- **Keeping it.** It is then kept while it is used. If it stops, the next
  request starts it again.
- **Stopped when unused** (the maintainer, 2026-10-13;
  `lib/plugins/idle.ts`). A worker that has gone 15 minutes unused is
  stopped, and started again when next needed, so that a plugin holding a
  large model does not keep its memory all day. Unused means:
  - no request unanswered: each request asked holds the clock, and the
    last one answered (or given up on) starts it again;
  - nothing heard from the worker: each line it says starts the clock
    again;
  - no job of its plugin waiting or running (`liveJobsOf`). A worker kept
    for a job is looked at again after another 15 minutes.

  The stop is no one's error: nothing waits on the worker, and nothing
  says it stopped. Settings, *Chemistry* says again that the plugin is
  set up and starts when a structure is drawn, as before its first start.
  The next request waits for the worker to start, as a session's first
  request does: a role says "Starting RDKit…" meanwhile, and a file's
  reading or a step waits as on its first use.
- **Held on a request.** A worker answers one request at a time, in the
  order asked. If the request it is on is not answered in that request's
  time, the worker is stopped, and the next request starts it afresh
  (`lib/plugins/queue.ts`). A request asked after another that is still
  within its own time stops nothing: the worker is busy with the one
  before it, such as a picture plugin loading its model for its first
  picture, which has five minutes. A picture after that, the model loaded,
  has a minute and a half: one is read in seconds, the slowest in about
  half a minute, and one that takes longer is not going to end. The part
  that asked says *Reading the picture took too long, so nothing was read
  from it*, and the next picture starts the worker afresh, with the five
  minutes again for its model (`readByPlugin` in
  `ui/features/Workspace/utils/figures.ts`). What else was waiting on the stopped
  worker fails with *... was started again: it did not finish what it was
  asked before in time*, which the part that asked shows as its own error
  (the formula banner, a file's reading, a step's log).
- **In Settings.** *Plugins* lists it with the others, to add or take
  away. *Chemistry* says whether it is running, set up and to start when
  a structure is drawn, not set up, or taken away; it and *Molecules in
  3D* say who fills each of their roles, a choice where more than one
  plugin fills it (`plugins.roles` in the settings).
- **Its name is the plugin's.** What Meno says while it sets up or starts
  - "Setting up RDKit…" - and the consent it asks for take the plugin's
  name and description from its manifest; no code of Meno's names it.

The calculation readers start the same way, on first use, and are stopped
the same way: unused for 15 minutes, taken away, or when Meno quits. Every plugin's environment is
named for it, `plugin-<id>` (the maintainer, 2026-10-06); those made before
under other names are left where they were.

**One worker for each plugin** (2026-10-10, `lib/plugins/process.ts`):
whatever asks it first - a role it fills, a file it reads or writes, a
step it does - starts its one process, and all of them ask that one, each
through a client of its own that shares the process's question ids, so
that each hears only its own answers. Before, RDKit could run twice: once
for its roles, once for its steps. Meno's backend lets a plugin's
`worker.py` run only in that plugin's own environment.

**As planned, the same for every plugin** (the maintainer, 2026-10-06:
no plugin is kept running ahead of need):

- **Set up** the first time something needs it, asking first for the
  network. The consent names every host the set-up contacts, and the
  set-up - and the fetch of its files besides - may reach those hosts
  alone: Meno's proxy refuses any other (docs/ARCHITECTURE.md, *The
  network*).
- **Started** the first time it is asked for. Nothing starts with Meno.
- **Kept** while it is used, and started again if it stops.
- **Stopped** when it has gone 15 minutes unused (the maintainer,
  2026-10-13), when it is taken away, or when Meno quits.

RDKit is an ordinary plugin. It is in use all day only because, by
default, it fills the core roles, and so it is asked for as soon as a
structure is drawn. A core role with no plugin installed says what to
add, as reading an output with no reader does today.

## Two faces of a role

Every role has the same contract wherever it is used:

- **Directly** - a menu command, Settings, opening a file;
- **as a step in a workflow** - its input and output in Meno's forms, so
  that steps join. A fingerprint feeds a similarity search; a conformer
  set feeds a calculation; an output is read back.

A plugin that fills a role that is also a kind of step fills that step in
workflows on the page as well as a command (Meno defines the kinds of
step, plugins fill them: WORKFLOWS.md, planned). This is what PURPOSE.md asks for: a procedure that combines
several methods and outside tools, that can be read, rearranged and run
again.

## The contract

The same for every plugin and for Meno's own parts:

- **Known by its id.** It also has a version and a shown name. What a
  plugin gave - results, files - keeps the id and the version. The name is
  looked up only to show it.
- **It says it is ready, and its version**, in its first line:
  `{"event": "ready", "version": "..."}` - the version of what it brings,
  as it runs, which what it gives keeps. (`ping`, never sent, is gone:
  2026-10-10.)
- **Requests, one a line - `{id, op, ...}` - one answer each - `{id, ok,
  result}`, or `{id, ok: false, error}`, an error an answer:**
  - `read {kind, name, text}`, `ask {kind, key, name, text}`, `write
    {kind, name, molecules, options}` (answered `{text}`) - the file
    roles - and `probe {kind, name, head}` (answered `{yes}`) - whether a
    file is of a kind it registered (FILE-IO.md);
  - each role's own requests, by the role (*Roles*): `from_smiles
    {smiles}`, `to_smiles {molblock}` and `rxn_to_smiles {rxnblock}` (a
    reaction as an RXN file holds it, as a reaction SMILES) (SMILES);
    `analyse {molblock}`
    (the checks, R/S and E/Z among them); `open_stereo {molblock, like?}`
    (stereoisomers: what is left open, how many stereoisomers of it can
    be made in 3D, which open double bonds are cumulated, and whether none
    holds in 3D, `free`); `conformers {molblock, isomers?, like?, options}`
    (structures in 3D and their conformers, with the role's options);
    `drawing_of {molblock, perceive?}` (a drawing of a molecule in 3D,
    answered with whether it found the bond orders, `perceived`),
    `orders_from_smiles {molblock, smiles}` and `add_hydrogens
    {molblock, hydrogens?}` (its bond orders from a SMILES, its hydrogens
    added - as many on each atom as `hydrogens` says, by atom, where it is
    given, its valence not checked: whether a bond to a metal is in place
    of a hydrogen is the chemist's to say);
    `read_picture {picture}` (structures read from pictures: a PNG or a
    JPEG in base64, answered with the structure's atoms where the picture
    has them, in its pixels - each an element with its charge, or a label
    as drawn - its bonds by index, a wedge's or a hash's nearer end and,
    where the plugin can tell, which end is drawn narrow, and what it is
    unsure of, by no number: PDF.md, *A picture read*).
    (A general `run {role, input, options}`, planned at first, was never
    needed: a new role comes with Meno, and with it its requests);
  - `prepare {step, entries, options, cores}` and `collect {step,
    entries, options, files, log, ended}` - a kind of step its program
    does (WORKFLOWS.md, *What changes in the contract*): the jobs Meno is
    to run - each its program and arguments, its input files, and, where
    its program reads one of them as its standard input, which
    (`stdin`: Gaussian's), and the programs installed beside its own to
    run after it, in turn, where it ended well (`then: [{program, args}]`,
    each declared in the manifest's `installed[].beside`: ORCA's
    orca_2mkl) - and what one gave, read back: a job may be
    for several entries (CREST optimising an ensemble), each read back
    in Meno's output form, with each geometry's `populations` where its
    program works them out (CREST's, its rotamers counted in);
  - `collect` may answer, for each entry, not an output but which of
    what the job wrote is an output of a kind Meno's readers read -
    `{"read": [{"kind": "orca", "log": true, "name": "water.out"}]}` - or
    a file it read back, for them to read as an opened one is (ORCA's and
    Gaussian's: what each printed); and, with it, a wavefunction the job
    wrote, read back, to keep with the molecules read from it
    (`"wavefunction": {"kind", "file", "name"}`): given, as the output
    is, to a later step that takes its kind (a step's `files`);
  - `prepare` may refuse an entry alone, preparing the others' jobs:
    `{"jobs": [...], "refused": [{"entry": 1, "why": "...", "kind":
    "refused"}]}` - an isotope's frequencies, which xtb would give as of
    the natural element. The entry is in no job; it goes out of the
    step's *Failed* exit with its why. A step whose every entry is
    refused, or whose options cannot be done, is refused as a whole, as
    before (an error);
  - `collect` may answer that a job as a whole stopped, `{"why": "..."}`,
    and add what to read of what it wrote, one for each entry, as
    `read` says it - `"partial": [{"kind": "orca", "log": true, "name":
    "water.out"}]` - where the run stopped once under way: Meno reads it
    for the geometry the run reached alone, the entry going out of
    *Failed* there, its frames from where it came in, no energy of it a
    result (WORKFLOWS.md, *Runs again*). ORCA's and Gaussian's plugins
    say so for an optimisation;
  - `collect` may answer, for one entry of a job, why that entry alone
    failed - `{"why": "...", "kind": "no-geometry"}` in its place among
    the outputs - the others taken as they are. A `kind` is one of
    core's failure kinds (WORKFLOWS.md, *Failed*); any other, or none,
    is taken as `failed`, its words kept. An output whose `optimised` is
    false is not done: its last geometry goes out of the *Failed* exit as
    *not converged*. An output's `warnings` - `[{"kind":
    "hessian-not-stationary", "text": "..."}]`, the text the program's
    own words - are kept with the molecule and said on its chip; a kind
    core does not know is `other`. A warning never moves an entry. An
    output's `imaginary` - its imaginary frequencies in cm-1, negative,
    as the program itself judged them (xtb's "significant" ones,
    Gaussian's NImag, the modes ORCA marks), `[]` where it judged none -
    marks the molecule as no minimum;
  - `prepare` may say, in a line of plain words beside its jobs, what
    it chose for the chemist in preparing them (`{"jobs": [...],
    "note": "frequencies computed numerically"}`: ORCA's own xTB, which
    has no analytic Hessian, asked for its frequencies by NUMFREQ). It is
    said on the step's line when the step ends, so that nothing is
    hidden; it changes nothing Meno does;
  - a job `prepare` gives may declare the memory it takes, in MiB
    (`"memory": 12000`): what its program is asked for - ORCA's %maxcore
    times its processes, Gaussian's %Mem - counted against what this
    computer's jobs may use; none declared, it is counted by its cores;
  - `prepare` is told where each program installed separately was
    found (`programs`, by its name: `{"orca": "/Applications/orca/orca"}`),
    the folder its jobs' PATH begins with (2026-10-31);
  - a job `prepare` gives may take fewer cores than it was given
    (`"cores": 1`): ORCA's, with no MPI to run its processes with. Meno
    asks for it at that many, never more than Settings gives, and the
    queue counts it so (2026-10-31);
  - `prepare` and `collect` for the role *Render* too (RENDER.md, *The
    role, and its contract*): given the scene Meno wrote, put into the
    job's folder by Meno, and answered with the picture or film the job
    made (`{made: [{entry, file, media}]}`);
  - a job may say how far it is, in lines of its log of their own -
    `progress <done>/<all>` - which Meno shows as it runs;
  - `collect` may answer, for each entry, surfaces in cube files the job
    wrote, which Meno reads itself - `{"surfaces": [{"name", "rows":
    [{"label", "file", "iso", "colour": {"file", "from", "to",
    "label"}}]}]}` - an RDG surface coloured by sign(λ2)ρ (NCI.md); an
    entry is given, in `files`, the outputs its step's `files` take;
  - `run {step, entries, options, holds}` - a kind of step it does at
    once, in its worker, with no job: the entries it kept, by their
    place (RDKit's *Duplicates*). `holds` says whether they came as a
    conformer set or a compound set. Where it counted a mirror image in
    one kept, it says so beside them - `"counted": [{"entry": 0,
    "degeneracy": 2, "mirror": [...]}]`, the atoms the mirror image swaps
    as a permutation - and an entry given carries its `degeneracy`, where
    it has one. `"capped": 2` says how many compounds it took atom against
    atom, their ways onto themselves too many to try: a duplicate of one
    could be missed, and the step says so;
  - **steps on structures drawn** (`run` with `holds` "structures":
    RDKit's *Check structures* and *Stereoisomers*): each entry is a
    structure as `{molblocks}`, a MOL block for each of its parts - a
    lone ion or atom of an element among them (Na+, Cl-, a lone metal),
    which has no 3D structure but is part of what was drawn, its valence
    written as none (`VAL=-1`) so that a reader adds no hydrogens to it:
    `chem/make3d` `drawnBlocksOf` - and
    the answer is `{"structures": [...]}`, one for each, in their order:
    `{"as": "drawn"}`, kept as it is - with `"properties"`, where the step
    works numbers out of it (*Descriptors*): each `{value, unit, method}`,
    its unit from Meno's units table (g/mol and Å² among them) or "none",
    kept on its record as `computed` by the plugin, its version, the
    program and the method; `{"made": [block, ...], "smiles":
    [...]}`, made anew as drawings (V3000, laid out in 2D, wedged), each
    one's own SMILES beside it - with `"properties"` too, as above, where
    the step said something of each it made alike (RDKit's *Stereoisomers*:
    `stereo_not_enumerated`, a C=N whose E/Z it left alone, and why:
    WORKFLOWS.md, *C=N double bonds whose E/Z is none of their own*) -
    which Meno reads and lays out as it does a
    SMILES's (`chem/fromSmiles` `drawingOf`), at most 64 of one - one it
    cannot draw sets the structure aside whole, *could not be drawn*; or
    `{"aside": why, "kind": kind}`, set aside, why in a few plain words
    and a short kind to count it by on the step's line (*3 set aside (2:
    radical; 1: parts)*). A made one is another structure, with a record
    of its own (WORKFLOWS.md, *A structure drawn's record*): what the one
    it was made of came from (`from`), which of how many it is (`made`:
    *1 of 2*), its own SMILES (`smiles`); and each value of the one it was
    made of as that one's, named so (`made_from.nll`, `made_from.smiles`),
    each as it was and by what worked it out then - never as its own,
    since none was worked out of it (an NLL of a SMILES with its stereo
    left open): a Filter takes `made_from.nll < 40` by that name, and its
    own values are none until a step works them out. Made of one that was
    made itself, it carries that one's `made_from.*` as they were, one
    level - still of the structure it was made from, at a remove - that
    one's own values over them, and not which of how many it was. One set
    aside keeps its record, its status saying why. An answer that is
    not one for each is taken as none: nothing is taken in part.
- **Molecules cross it in Meno's own forms.** Chemistry plugins are
  given and give back MOL blocks (decision 4, revised); a writer is given
  Meno's plain data - each atom's element, place in ångströms, charge,
  isotope and radical, the bonds by index with their orders, a name
  (FILE-IO.md, *As step 7's writer was built*). A step's entry gives an
  isotope's mass too (`mass`, in daltons; 2026-10-13), where one is
  measured: NIST's relative atomic mass ("Atomic Weights and Isotopic
  Compositions for All Elements", physics.nist.gov, Compositions;
  `lib/chem/isotopes.ts`, written by `scripts/chem/isotopes.py`). A
  plugin writes it where its program's input takes a mass, and otherwise
  refuses what the mass would change, naming the isotope - never giving
  it as the natural element. A reader gives back
  Meno's own plain data, checked by Meno on the way in.
- **A file of several jobs, one after another** (the maintainer,
  2026-10-13) - Gaussian's Link1 jobs, ORCA's `$new_job` - is read by a
  reader that tells them apart as one output for each job, in order,
  under `jobs`, each saying which it is and what it did - `job: {number,
  of, kind}`, its kind in words ("Optimisation", "Single point") - and
  each its own atoms, geometries, energies, method and basis, charge and
  multiplicity, and results. The answer's own fields are its last job's,
  so that what knows nothing of jobs reads the file's end. Each job
  opens as a molecule of its own, side by side; nothing of one job is
  put with another's. A job of one route that runs in steps - Gaussian's
  Opt Freq - is one job. Only the reader knows its programs; Meno takes
  `jobs` from any. A reader chosen to read the file as well joins each
  job's molecule with what it read of that job, where it read the file
  job by job; where it read it as one, it joins the last job's alone.
  (Each job's record - its geometry, its charge and multiplicity, as the
  file says them, its energy with its method and basis, the file and the
  job it came from - is what an entry of the rebuilt workflow is to
  carry.)
- **What an energy was worked out in, as the output says it**
  (2026-10-21), so that every number carries its method and its level:
  - `solvation`: the model, the solvent, and anything else of it that
    changes the energies, in the program's own words - xtb's
    `ALPB(water), reference state gsolv [1 M gas/solution]`, its
    reference state among them, as a free energy differs by state (xtb
    6.7.1 run here: the bar-gas state's free energy 1.90 kcal/mol above
    the default's, RT ln 24.5); CREST's `ALPB(water)`, which is all it
    echoes. `none` where the output says no model was used - xtb's setup
    box ("GBSA solvation false"), or, where it prints none (GFN-FF), its
    program call holding no option that asks for one and no model
    printed; CREST's echo of its options holding none. Left out where the output does not
    say: never filled in from the step's options. A run whose solvation
    is not what its step asked for is refused, saying both;
  - the method without it: `GFN2-xTB`, never `GFN2-xTB (ALPB, water)` -
    one place for each. Meno shows them together (`lib/calc/output.ts`,
    `levelOf`);
  - with a frequency job's thermochemistry, as results of their own: the
    temperature it is at, `thermo.temperature` (K) - of several, the one
    the program used; the pressure, `thermo.pressure` (atm), only where
    the program prints one; and how it was worked out, `thermo.treatment`,
    a text in the program's words, its units as Meno writes them (cm⁻¹, 2026-10-31): xtb's `rotor cutoff 50 cm⁻¹, imag. cutoff -20 cm⁻¹,
    scaling factor 1` from the setup it prints (GFN-FF's factor is 1.03);
    ORCA's `quasi-RRHO (Grimme), 100 cm⁻¹`, from where it says its
    vibrational entropy is the QRRHO of S. Grimme and at which reference
    frequency - or `RRHO`, where it says it did not ("Quasi RRHO ...
    False": the harmonic oscillator alone, ORCA's `%freq QuasiRRHO false`,
    which the ORCA plugin's Frequencies writes where its *Low-frequency
    vibrations* option says *Harmonic (RRHO)*; ORCA's own treatment, unless asked,
    2026-10-31). Two values of one treatment are written alike, so that
    they compare. And the symmetry its thermochemistry took, as the
    program printed it - of several prints, the last, as the other
    thermochemistry is read, so that all are of one: its point group,
    `thermo.point-group` (ORCA's "Point Group: D3h", Gaussian's "Full
    point group", xtb's box's "symmetry"), and the rotational symmetry
    number its rotational entropy counts, `thermo.symmetry-number` (ORCA's
    "Symmetry Number: 6", Gaussian's "Rotational symmetry number", xtb's
    "rotational number"). Not printed, not read: Meno works none of them
    out itself (2026-10-30). Meno puts them on each thermochemical
    property it makes of the readings, in its `by` (WORKFLOWS-FOUNDATION.md,
    *The entry*).
- **Keeps nothing between requests**; what it needs is sent each time.
- **Gives data, never code or markup**, in Meno's units, checked by Meno.
- **Runs apart from the page:**
  - a plugin in its own process and environment;
  - Meno's own readers all in a web worker, giving coordinates back in
    buffers - decided once the measurements were seen (FILE-IO.md,
    *Response*). Meno's own writers run on the page: an SVG picture of
    molecules in 3D needs the page's WebGL.

### Path search

A plugin filling *Path search* is sent pairs: each entry is the start, as
any entry is, with its end beside it (`end`, an entry of the same atoms in
one numbering and of one charge and spin - Meno has checked both). Its
`prepare` runs a job for each. What it reads back is an output in Meno's
form, its frames the path in the order the program gives them, the point
it refined among them, each with its energy; `converged` true for that
point alone, which becomes the molecule's entry frame. A frames result
`path.frame` says what each frame is - "highest point refined" for that
point, words of the plugin's own for the rest (ORCA's: "NEB image 3 of
10"). `imaginary`, and a `vibrations` list, are that point's, where the
frequencies were worked out. Meno works out the barriers itself, and calls
no frame a saddle point.

### Follow the reaction path

A plugin filling *Follow the reaction path* is sent each point as any entry
is. What it reads back is an output in Meno's form, its frames the path one
end to the other, each with its energy; `converged` true for the point it
started from alone, which becomes the molecule's entry frame; a frames
result `path.frame` saying what each frame is, "the point it started from"
for that one. Where a side stopped before its end, `optimised` false and a
warning in the program's words: the molecule goes out of *Failed*, the path
as far as it came.

### Optimise to a saddle point

A plugin filling *Optimise to a saddle point* is sent each guess as any
entry is; where the step's sides are wired, with them beside it (`sides`,
`reactant` and `product`, each an entry of the guess's atoms in one
numbering, of one charge and spin - Meno has checked both). A plugin whose
program takes no sides refuses a guess sent with them, saying so. What it
reads back is an optimisation's output, as *Optimise*'s is.

### Generate

*Generate* makes new structures from nothing that comes in, so it has no
input to wire and no entries to send. Meno asks its plugin `run` with the
step's kind, `"entries": []`, and the step's options.

A plugin that makes its structures from seeds says so on the kind in its
manifest (`"seeds": true`). Its Generate then has one input, *Seeds*,
which takes structures drawn, and is ready only once seeds are wired in.
Each seed is sent as `{"molblocks": [...]}`, as for any step on
structures drawn.

**A Generate plugin hands on what its model gives, as it gives it**
(the maintainer, 2026-10-22: format conversion yes, chemistry no). Each
structure is the SMILES the model wrote - never canonicalised, its stereo
as written or left out - with the model's own values beside it, named.
Nothing is made of it in 3D, no stereoisomer is enumerated, and nothing is
refused. What a structure is - a radical, one that leaves stereo open, one
of odd valence - is for the general steps after it, and for
*Conformers*, which alone makes 3D:

```
{"outputs": [{"smiles": "...", "properties": {"nll": {"value": 36.9, "unit": "none"}, ...}, "seed": 0}],
 "by": {"program", "version", "model", "method"}, "said": "..."}
```

- `properties`: each value a number, a text or true/false, with its unit
  from Meno's units table, or "none" (REINVENT 4's `nll` and
  `smiles_state`, as it writes them; a model's Tanimoto similarity, its
  scaffold and R-groups, under the names it uses). A value the model gave
  none of is `null` - REINVENT 4 writes an NLL that is no number so,
  counting it in `said`, since JSON holds no NaN - and is not kept.
- `seed`: where a generator makes a structure from one that came in, that
  one's place among them. None comes into REINVENT 4's. CReM gives its
  values as `change` (the change made), `frequency` (how often the
  fragment put in occurs in its database) and `seed_smiles` (the seed's SMILES
  as it read it).
- `seeds`: where seeds came in, one for each by its place, `{"place",
  "made"}` or `{"place", "why"}` (not read). Meno names on the step's
  line each seed that made none and each not read, with why, from this
  tally (*seeds 2 and 5 made none; seed 3 not read: ...*), never from
  `said`, which it cuts short: five of each on the line, the rest
  counted, and every one where the line is pointed at. A plugin that
  makes from seeds must give it: without it, none of the run is taken.
  Where no seed could be read, it gives no structures and the tally
  says why of each.
- `by`: what made them all: the program and its version, the model, how.
- `said`: the run in a line.

Meno reads each SMILES itself, as one pasted is (the roles'
`from_smiles`, laid out by Meno's engine: `chem/fromSmiles` `drawingOf`).
Each becomes a structure drawn of its own in the step's result set, in the
order given. Its record (WORKFLOWS.md, *A structure drawn's record*) holds
the SMILES as given (`smiles`), the model's values, each `computed` by
the plugin, its version and the program, model and method; and, where
it leaves stereo open, how many centres and double bonds
(`stereo_open`, the roles' `stereo_left_open`: where it is left open
only, none of its stereoisomers tried in 3D, which *Stereoisomers* and
*Conformers* do). A structure made from a seed keeps the seed's `from`,
and the seed's values as the seed's (`made_from.<name>`, one level, as
*Stereoisomers* carries them), never as its own. Nothing is chosen for it. One whose stereo cannot be
asked about is kept, and counted as *with stereo not examined*. A SMILES
that cannot be read is counted on the step's line as *not read*, never
dropped unsaid, the first five named with why: *20 sampled ... · 18 made
· 3 with stereo left open · 2 not read: C1CC (a ring left open), …*.
Where none can be read, the step fails, saying so.
What the plugin gives that is not this form - a value with a unit Meno
does not know, a SMILES missing, a seed that did not come in - takes none
of the run, saying which. At most a thousand from one run
(`GENERATED_MOST`). The step is ready as it is put down, and changed when
its options or who does it change - its plugin's version, or the files
it was set up with, a model's weights by their hash, included: another
prior is another run (`workflow/flow` `inputKey`, `doers` `doerStamp`).
Made from seeds, it is also changed when the seeds change.

### The entry a plugin is given

Each entry in `prepare`, `collect` and `run` is one molecule, as JSON:

```
{
  "schema": 1,
  "name": "...",                      (where it has one)
  "atoms": [{"el", "x", "y", "z", "charge"?, "radical"?, "isotope"?, "mass"?}],
  "bonds": [{"a1", "a2", "order", "coordination"?}],
  "charge": 0,
  "multiplicity": 1,
  "files": [{"kind", "name", "text"}], (where the step takes some)
  "restraints": [{"kind", "atoms", "value"?, "strength"?}], (where it carries some)
  "start": [x, y, z, ...]            (where a minimisation first held them)
}
```

- `schema` is the entry's version (`src/lib/entry.ts`, `ENTRY_SCHEMA`),
  1 for the entry as described here. A change to what an entry holds
  comes with the next number, so that a plugin can tell which it is given.
- The atoms are in the entry's fixed numbering: a plugin answers with
  them in the same order (WORKFLOWS-FOUNDATION.md, *The numbering is
  fixed*), mapping back any its program reorders.
- Places are in ångströms. `mass` is the isotope's in daltons, where
  Meno knows it.
- A coordination bond - a dative arrow or a coordination bond as drawn, a
  file's bond of type 9 - is `order` 1 with `coordination: true`, `a1` the
  atom that lends its pair (the entry record's `EntryBond`). A plugin
  maps it to what its program has (the RDKit plugin: RDKit's dative bond)
  or refuses the entry in words; it never takes it as a covalent single.
  A program given only atoms and places has no bonds to map.
- `charge` and `multiplicity` are by Meno's one rule
  (`src/lib/io/writers.ts`, `speciesOf`): what the calculation the
  molecule was read from said, where it said; else what its atoms say.
- Energies a plugin gives back are in hartrees; Meno converts any other
  unit with its units table (`src/lib/units.ts`, CODATA 2018), never a
  plugin's own factor.
- A plugin that holds a geometry to restraints (`Restraint` in
  `src/lib/entry.ts`) holds each by the energy the record states - a
  distance by E = k d²/2, k in kcal mol⁻¹ Å⁻²; a dihedral by E = k φ²/2,
  φ in radians the shorter way round, k in kcal mol⁻¹ rad⁻²; atoms fixed
  where they are - converting k into its program's units and saying here,
  under its name, how; or it refuses them in words. An entry gives its
  restraints as `restraints`, and `start`, the places a minimisation first
  held them at, where one has. The RDKit plugin holds them (*Minimise with
  restraints, and a search that holds them*, below). A step that holds
  none - an *Optimise*, an *Energy* - is given them all the same and leaves
  them aside: what its program gives back is unheld. It need not refuse
  them, as case F optimises, unheld, what it minimised with restraints
  (WORKFLOWS-FOUNDATION.md, F16).
- A temperature, a pressure and a solvent a plugin gives with a property
  are those its program says it used; a solvent is named with its model
  as the program names them (`ALPB(water)`), or `none` where the
  program's own setup shows it used none. A plugin that cannot tell from
  its program's output says nothing, and the solvent is then not stated -
  never taken for the gas phase.

## Settings

- **Plugins.** A tab of its own that lists every plugin on offer, added or
  not - those that come with Meno and run nothing first:
  - what roles it fills, by name - the kinds of file it reads and writes
    among them - and the plugins it suggests;
  - its version, licence and home; "Comes with Meno: nothing to download"
    for one that runs nothing;
  - Add, and Remove; and Show, for one that brings a guide. Removing a
    plugin while any of its jobs waits or runs asks first, saying how
    many; once the chemist says *Stop and remove*, those jobs are stopped
    and waited for until they have ended, and then the plugin is removed
    (the maintainer, 2026-10-12). Cancel leaves the plugin and its jobs
    as they are.

  Meno is not in it.
- **Files.** The tab named for files (FILE-IO.md) holds, for each kind
  of file, who reads it, who else adds to it, and who writes it. Meno's
  own parts show there as "Meno".
- **The other roles are chosen where they are used:**
  - in *Chemistry* - what is done on a structure drawn, at once, and who
    does it (the maintainer, 2026-10-17) - who parses SMILES, checks a
    structure and assigns R/S, and, on a card of their own, *3D*, who
    makes a structure in 3D and its conformers, and by what method, its
    stereoisomers, a formula drawn from it, and its renders. (Settings'
    *3D* tab itself is how they look and turn; a workflow step's
    defaults are in *Calculations*);
  - in a workflow step, who runs it, defaulting to the choice in Settings.
- **A choice taken away gives way** (the maintainer, 2026-10-12): when the
  plugin chosen for a role is taken away and another plugin that fills it
  is added, that one fills the role. With none other added, the role stays
  with the one chosen, and says to add it again.
- **What, never how** (the maintainer's rule): a choice names the program
  and the method a chemist would name, never how Meno talks to it.

## Decided

By the maintainer, 2026-10-06:

1. **No plugin is kept running ahead of need.** Every plugin runs as RDKit
   does now: started when first needed, kept for the session. (Revised
   2026-10-13: kept while it is used, stopped once unused for 15 minutes.)
2. **The other roles are chosen where they are used** (*Chemistry*,
   its *3D* card among them, a workflow step), not in the Plugins tab. The
   Plugins tab says what each plugin offers.
3. **RDKit can be taken away like any plugin.** The core features then
   say what to add.
4. **Molecules cross the contract in the record's form**, RDKit
   included. *Revised by the maintainer on 2026-10-06, as step 6 was
   built:* chemistry plugins are given and give back MOL blocks, as RDKit
   always was. Meno keeps its MOL writer for Export and the clipboard
   anyway, and only Meno can write out its abbreviations - by its
   dictionary - so a record sent instead would be a MOL block written as
   JSON, its conversion copied into every plugin. The record stays Meno's
   own form: the clipboard, Office, the workspace.
5. **The tabs are named "Plugins", and "Files"** for the per-kind choices.
6. **Kinds of file are registered by plugins** in their manifests, so that
   a plugin can read a program Meno does not know (FILE-IO.md) - and only
   by them: Meno knows no program, and lists a program's kind only while
   a plugin that reads it is added.
7. **Plugins are completely independent**, each a folder of its own, and
   will be fetched over the internet; Meno builds only the general place
   to take them in.
8. **A file no plugin added reads, but one on offer would, names that
   plugin** - against the ideal, but needed for those new to Meno.
   *Revised on 2026-10-10 (9-12 below):* the plugin is named by a
   catalogue, never by the marks of a plugin not added.

By the maintainer, 2026-10-10 (lane L6):

9. **One manifest spec**, as proposed (*The manifest*): every kind of file
   in one list; roles and steps as objects, a step's several kinds in one;
   fixed file names; `stereo-labels` folded into the checks; `ping` gone;
   one worker for each plugin; the same checks in Meno and its backend.
   The plugins Meno carries were rewritten in it, and behave as before.
10. **The first-run guide is a plugin**, Getting started, there from the
    start and removable like any other; its guide was shown once to
    everyone, and since 2026-10-24 only when asked (*A plugin's guide*).
11. **The plugins to suggest are a catalogue's**, Getting started's: what
    a file is, where no plugin added reads it, is told only by the
    catalogues of the plugins added - their own marks - never by the
    manifest of a plugin not added, whose marks the chemist has not
    consented to (*A plugin's catalogue*). The suggestion offers Add, and
    the file is read again once a plugin is added.
12. **A plugin may carry its own licence**; one that must be GPL - for
    Blender - comes with Meno while it stands strictly apart, and may be
    distributed apart later (*Licences*).

## In order

After the files (FILE-IO.md's order, steps 2 to 5):

1. **RDKit as a plugin** (FILE-IO.md's step 6; built). It gets its own
   entry in the list. Its roles are named, and it is assigned to the core
   roles by default, started when first needed as now. Molecules reach it
   as MOL blocks (decision 4, revised). The choices go in *Chemistry* (its
   *3D* card for molecules in 3D), with RDKit as the only plugin at first.
2. **New roles, each with a plugin that fills it:** fingerprints into
   the workflow, a structure search, running a calculation.
3. **Plugins without Python, perhaps** (raised by the maintainer on
   2026-10-06, as Gaussian's input writer was built): a plugin of
   TypeScript, run in the app, would need no Python and start at once -
   right for a writer that only lays text out. It would run inside the
   app's web view, so it needs a sandbox first - no Tauri, no network -
   shown to hold before plugins are fetched online. Until then every
   plugin is Python, made by uv or pixi.
