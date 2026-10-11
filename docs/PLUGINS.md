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
  plugins kept running would only take more memory.
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
- **Guide** - steps a plugin brings, shown once in a card of Meno's
  (*A plugin's guide*).
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
| Molecules in 3D (core) | a structure in 3D, and its conformers | RDKit (`conformers`) |
| Molecules in 3D (core) | a drawing of a structure in 3D | RDKit (`drawing_of`) |
| Drawing | 2D layout, Clean-up | Meno (its layout engine) |
| Later | fingerprints, similarity | - |
| Later | structure search in outside databases | - |
| Later | running a calculation, an input written and an output read back | - |

Meno defines the roles and their contracts. A plugin says, in its
manifest, which roles it fills. A new kind of role comes with Meno, and a
new plugin for an existing role needs no change to Meno.

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
  <name>.grammar     how a text of a kind it knows is coloured, where it says
  LICENSE            its licence's text, where it is not Meno's (*Licences*)
```

A plugin that runs nothing - Getting started, which brings a guide and a
catalogue - has a manifest alone.

- **A plugin's step may take less than its kind does** (`takes`): CREST's
  conformer search starts from a molecule in 3D, so it takes `molecules`
  and `conformers`; RDKit's says nothing, and takes structures drawn as
  well, making them in 3D as its `conformers` role does.
- **A plugin may be for some systems only** (`systems`): CREST, whose
  program conda-forge builds for macOS and Linux; elsewhere Settings,
  *Plugins*, says so in place of *Add*.
- **A plugin may run a program installed separately** - ORCA, Gaussian -
  which Meno never fetches or ships (`installed`). Meno finds it where the
  system finds programs, or where the chemist locates it in Settings,
  *Plugins*. Such a plugin is named as an interface (the *ORCA
  interface*), and its steps by the program's name (*ORCA*).
- **Meno carries some for now**, in `src-tauri/resources/plugins/`, and
  finds them there: no code of Meno's names one. Those fetched over the
  internet later will be folders of the same kind; how Meno trusts a list
  fetched online is decided then.
- **Kinds are shared by id, not by code.** Two plugins that read Gaussian's
  output each bring the kind `gaussian`, with its name and marks, and Meno
  puts them together. A plugin reads only the kinds it brings and Meno's
  own.
- **Meno checks every manifest as data**, wherever it came from: its id,
  its lock and worker in its folder (the backend allows nothing else), its
  marks as text of some length, and no mark that one of Meno's own sample
  files holds.
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
| `name`, `version`, `description`, `licence`, `homepage` | text | What it is called; the version of what it brings (the version its lock pins, or its own); one line on what it is; its licence (*Licences*); its home. A result keeps the version its worker says it runs (*The contract*). |
| `environment` | `"uv"` or `"pixi"` | What makes its environment, from its `requirements.lock` (uv, PyPI) or its `pixi.toml` and `pixi.lock` (pixi, conda-forge), into `plugin-<id>`; its worker is its `worker.py`. None, and it runs nothing: `reads`, `writes`, `roles` and `steps` are then left out. |
| `systems` | `["macos", "windows", "linux"]`, some | The systems it can be added on; none said, every one. |
| `kinds` | list of `{id, name, program?, extensions, marks?, lines?, probe?, grammar?}` | Every kind of file it knows. A kind it reads is told by its `marks` - text a file's start holds, at least six letters, anywhere or at a line's start (`at: "line-start"`), in any case (`anyCase`) - each tried on Meno's own files and refused where one holds it; or, where it says `probe`, by asking it, for files of its `extensions`. A kind it only colours - a program's input, written by hand - is told by its files' names, and among those that share them by what its lines begin with (`lines`, as short as a letter: they claim no file). `program` names the program that writes it, as a molecule read from it names it. `grammar` is `{file, tones}`: a grammar in its folder, and the tone of each of its parts. |
| `reads` | ids | The kinds it reads: its own, or Meno's. |
| `writes` | list of `{kind, options?}` | The kinds of its own it writes, each given one molecule - one system of molecules in 3D - and its options; its name and files' names are the kind's, the first the one Export gives. |
| `roles` | list of `{role, options?}` | The roles it fills (*Roles*), each one Meno defines, each once; options only for a role that takes them (*Structures in 3D, and their conformers*). |
| `steps` | list of `{kinds, programs?, options?, takes?}` | The kinds of a workflow's step it fills - each one Meno defines (`lib/plugins/steps`), each once - several said in one where they share their programs and options. `programs` are the programs it runs, by name, from its environment or installed separately; none, and it does the step in its worker. A step of a kind that is also a role it fills and says no options takes the role's. `takes` is what it takes, where less than the kind does. |
| `installed` | list of `{name, label, files, path?, env?}` | The programs installed separately its steps run: its name as the steps name it; what it is called; its file's name on each system; the folders put first where programs are looked for, and the variables it is given - each `{folder}` (where its file is) or `{parent}` (the folder above), with a path inside it. Never a shell or Python; never `PATH`, the loader's variables, the network's way out, or the threads Meno sets. Only one a step runs. |
| `guide` | list of `{title, text, at?, until?, suggest?}`, at most 12 | Its guide (*A plugin's guide*). |
| `suggests` | list of `{plugin, for}` | Its catalogue: the plugins it suggests, by id, each with what it is for, in a line (*A plugin's catalogue*). |
| `files` | list of `{id, name, extensions, marks, suggest}` | The kinds of file its catalogue names, each told by its own marks - checked as a kind's are - with the plugins it suggests to read it. |

A plugin that does nothing - reads, writes, fills, colours, guides and
suggests nothing - is none. Options are in the general form (`lib/options`:
a choice, a number, a text or a switch, each with a label and a default it
takes; a number's `min`, `max`, `step`, `unit`; `from` the molecule's
charge, multiplicity or name, for a writer's).

**Reserved for what comes next** (lane L7; not read yet): a step's
`files`, the kinds of file made upstream that it takes besides molecules,
by their ids - `{"kinds": ["nci"], "programs": ["multiwfn"], "files":
["molden", "fchk"]}`, the kind *NCI* to come - so that a step can be given
a wavefunction another plugin's step wrote, the two joined by a kind's id
and sharing no code.

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
  low in the middle of the page.
- **What a step waits for** (`until`), Meno names too: `quick-add` opened,
  a structure `selected`, a `menu` opened. A moment after the chemist does
  it, the guide goes on by itself; Next does as well.
- **A step may offer plugins to add** (`suggest`, by id), each with what
  its plugin's catalogue says it is for, and Add, which asks for the
  network as adding always does.
- **Once.** A plugin's guide is shown the first time the plugin is there:
  on Meno's first start for one that comes added, or as soon as one that
  brings a guide is added. Gone through or skipped, it is kept as shown
  (settings `plugins.guided`). Settings, *Plugins*, shows it again
  (*Show*), with a workspace brought to the front.
- **Meno's question about keeping itself up to date** waits until a guide
  is closed.

**Getting started** (`resources/plugins/getting-started`) is the guide
Meno comes with (the maintainer, 2026-10-10: a plugin, there from the
start, that can be removed like any other). It runs nothing. Its steps:
double-click on empty space for Quick Add; Chain and SMILES there; press
and hold to select a structure; a right-click menu and its row of icons;
Save, with Settings beside it; the plugins to add first - RDKit, cclib,
xTB. It is shown once to everyone, those who used Meno before included.
Taken away, no guide is shown, and no plugin is suggested for a file
(*A plugin's catalogue*).

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

A plugin carries its own licence (`licence`; its text, `LICENSE`, in its
folder where it is not Meno's). Meno is Apache-2.0. A plugin whose code
must be under another licence - a script for Blender, which uses Blender's
own Python API and so is GPL - may come with Meno while it stands apart
(the maintainer, 2026-10-10; to be distributed apart later, if those using
Meno in companies make that worthwhile):

- it is a folder of its own, with its licence's text, and says it
  (`licence: "GPL-3.0-or-later"`);
- Meno's code and other plugins never take anything from it, and it
  speaks to Meno only through files and arguments - a separate program,
  not a part of Meno;
- it is listed with its licence wherever Meno lists the licences of what
  it carries.

A plugin Meno stops carrying leaves its files behind on Windows unless the
installer's hook deletes them (`src-tauri/windows/hooks.nsh`,
`NSIS_HOOK_PREINSTALL`), as was done for the Gaussian input plugin once it
became the Gaussian interface.

## Room for what comes next

What lane L7 brings fits this spec as it is; the rest comes with it:

- **Blender** (real pictures and films of molecules in 3D): a role and a
  kind of step Meno defines, *Render*, given the scene as Meno writes it -
  glTF 2.0, from the Khronos specification: the molecules in view in
  their looks (the primary and secondary looks, the scene's light), their
  surfaces, the camera, and for a film its frames - and giving pictures or
  a film, which Meno saves or puts on the page. Its plugin runs as the
  interfaces do: a worker that writes the job, and Blender, installed
  separately and located (`installed`), running a script of the plugin's
  in Blender's own Python. A render may leave out the mark Meno puts on a
  picture of molecules shown without their hydrogens (the maintainer,
  2026-10-10). Its licence: *Licences*.
- **NCI** (NCIPLOT, or an interface to Multiwfn): a kind of step, *NCI*,
  whose result is a general form - one grid's surface coloured by another
  grid's values, with a scale - not one for NCI alone. NCIPLOT can work
  from a molecule in 3D alone; Multiwfn takes a wavefunction another
  step wrote, through a step's `files` (*The manifest*, reserved).

## Several plugins, one role

- **One plugin fills a role at a time**: the one assigned. The others that
  could are offered in the same place.
- **For reading a file, others may add to it.** The assigned reader reads
  the file. Others the chemist adds for that kind read it as well, and
  their results join under their names, as an NBO plugin's would join
  cclib's. See FILE-IO.md.
- **A role's options** - a conformer search's method and its settings, a
  calculation input's method and basis - are declared by the plugin in a
  general form: a choice, a number, a text or a switch, each with a label
  and a default. Meno draws them and remembers the chemist's last
  choices. The form, its drawing and the remembering are in place, used
  first by Meno's own writers in Export (`lib/options.ts`, FILE-IO.md).
  A plugin declares a role's options in its manifest, with the role
  (`roles: [{role, options}]`, for a role that takes them); Settings draws
  them under the role, where it is chosen, and the plugin is sent them
  with each request for the role (`options`). RDKit declares its conformer
  search's (0.1.8): how many sought, the force field (MMFF94, MMFF94s,
  UFF), the steps an optimisation may take, the RMSD within which two are
  the same shape, the random seed - and its *Conformers* step takes the
  same, said once.
- **What a plugin made says how it was made**, in its own words, as rows
  to show: RDKit's conformers carry their embedding, force field, how many
  were kept and RDKit's version (`how`), kept with the molecule and shown
  when its chip is opened (the maintainer, 2026-10-07).

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
- **Keeping it.** It is then kept for the session. If it stops, the next
  request starts it again.
- **In Settings.** *Plugins* lists it with the others, to add or take
  away. *Chemistry* says whether it is running, set up and to start when
  a structure is drawn, not set up, or taken away; it and *Molecules in
  3D* say who fills each of their roles, a choice where more than one
  plugin fills it (`plugins.roles` in the settings).
- **Its name is the plugin's.** What Meno says while it sets up or starts
  - "Setting up RDKit…" - and the consent it asks for take the plugin's
  name and description from its manifest; no code of Meno's names it.

The calculation readers start the same way, on first use, and are stopped
only when taken away or when Meno quits. Every plugin's environment is
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
  network.
- **Started** the first time it is asked for. Nothing starts with Meno.
- **Kept** for the session, and started again if it stops.
- **Stopped** when it is taken away, or when Meno quits.

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
    {molblock}` and `to_smiles {smiles}` (SMILES); `analyse {molblock}`
    (the checks, R/S and E/Z among them); `open_stereo {molblock, like?}`
    (stereoisomers); `conformers {molblock, isomers?, like?, options}`
    (structures in 3D and their conformers, with the role's options);
    `drawing_of {molblock, perceive?}` (a drawing of a molecule in 3D).
    (A general `run {role, input, options}`, planned at first, was never
    needed: a new role comes with Meno, and with it its requests);
  - `prepare {step, entries, options, cores}` and `collect {step,
    entries, options, files, log, ended}` - a kind of step its program
    does (WORKFLOWS.md, *What changes in the contract*): the jobs Meno is
    to run - each its program and arguments, its input files, and, where
    its program reads one of them as its standard input, which
    (`stdin`: Gaussian's) - and what one gave, read back: a job may be
    for several entries (CREST optimising an ensemble), each read back
    in Meno's output form, with each geometry's `populations` where its
    program works them out (CREST's, its rotamers counted in);
  - `collect` may answer, for each entry, not an output but which of
    what the job wrote is an output of a kind Meno's readers read -
    `{"read": [{"kind": "orca", "log": true, "name": "water.out"}]}` - or
    a file it read back, for them to read as an opened one is (ORCA's and
    Gaussian's: what each printed);
  - `run {step, entries, options, holds}` - a kind of step it does at
    once, in its worker, with no job: the entries it kept, by their
    place (RDKit's *Duplicates*). `holds` says whether they came as a
    conformer set or a compound set.
- **Molecules cross it in Meno's own forms.** Chemistry plugins are
  given and give back MOL blocks (decision 4, revised); a writer is given
  Meno's plain data - each atom's element, place in ångströms, charge,
  isotope and radical, the bonds by index with their orders, a name
  (FILE-IO.md, *As step 7's writer was built*); a reader gives back
  Meno's own plain data, checked by Meno on the way in.
- **Keeps nothing between requests**; what it needs is sent each time.
- **Gives data, never code or markup**, in Meno's units, checked by Meno.
- **Runs apart from the page:**
  - a plugin in its own process and environment;
  - Meno's own readers all in a web worker, giving coordinates back in
    buffers - decided once the measurements were seen (FILE-IO.md,
    *Response*). Meno's own writers run on the page: an SVG picture of
    molecules in 3D needs the page's WebGL.

## Settings

- **Plugins.** A tab of its own that lists every plugin on offer, added or
  not - those that come with Meno and run nothing first:
  - what roles it fills, by name - the kinds of file it reads and writes
    among them - and the plugins it suggests;
  - its version, licence and home; "Comes with Meno: nothing to download"
    for one that runs nothing;
  - Add, and Remove; and Show, for one that brings a guide.

  Meno is not in it.
- **Files.** The tab named for files (FILE-IO.md) holds, for each kind
  of file, who reads it, who else adds to it, and who writes it. Meno's
  own parts show there as "Meno".
- **The other roles are chosen where they are used:**
  - in *Chemistry*, who parses SMILES, checks a structure and assigns R/S;
  - in *Molecules in 3D*, who makes a structure in 3D and its conformers,
    and by what method;
  - in a workflow step, who runs it, defaulting to the choice in Settings.
- **What, never how** (the maintainer's rule): a choice names the program
  and the method a chemist would name, never how Meno talks to it.

## Decided

By the maintainer, 2026-10-06:

1. **No plugin is kept running ahead of need.** Every plugin runs as RDKit
   does now: started when first needed, kept for the session.
2. **The other roles are chosen where they are used** (*Chemistry*,
   *Molecules in 3D*, a workflow step), not in the Plugins tab. The
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
    start and removable like any other; its guide is shown once to
    everyone (*A plugin's guide*).
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
   as MOL blocks (decision 4, revised). The choices go in *Chemistry* and
   *Molecules in 3D*, with RDKit as the only plugin at first.
2. **New roles, each with a plugin that fills it:** fingerprints into
   the workflow, a structure search, running a calculation.
3. **Plugins without Python, perhaps** (raised by the maintainer on
   2026-10-06, as Gaussian's input writer was built): a plugin of
   TypeScript, run in the app, would need no Python and start at once -
   right for a writer that only lays text out. It would run inside the
   app's web view, so it needs a sandbox first - no Tauri, no network -
   shown to hold before plugins are fetched online. Until then every
   plugin is Python, made by uv or pixi.
