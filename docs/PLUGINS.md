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
| Chemistry | structures read from pictures (PDF.md, *Stage 5*, part B) | MolScribe, MolNexTR - each standing alone, the chemist choosing which (`read_picture`; a model's trained weights downloaded besides, `downloads`) |
| Molecules in 3D (core) | a structure in 3D, and its conformers | RDKit (`conformers`) |
| Molecules in 3D (core) | a drawing of a structure in 3D; its bond orders and hydrogens, where its file leaves them out (WORKSPACE.md, *Hydrogens and bond orders*) | RDKit (`drawing_of`, `orders_from_smiles`, `add_hydrogens`) |
| Molecules in 3D | pictures and films of them, rendered (RENDER.md) | Blender (a job: Blender, Meno's own copy, fetched as the plugin is set up) |
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
| `environment` | `"uv"` or `"pixi"` | What makes its environment, from its `requirements.lock` (uv, PyPI) or its `pixi.toml` and `pixi.lock` (pixi, conda-forge), into `plugin-<id>`; its worker is its `worker.py`. None, and it runs nothing: `reads`, `writes`, `roles` and `steps` are then left out. |
| `systems` | `["macos", "windows", "linux"]`, some | The systems it can be added on; none said, every one. |
| `kinds` | list of `{id, name, program?, extensions, marks?, lines?, probe?, grammar?}` | Every kind of file it knows. A kind it reads is told by its `marks` - text a file's start holds, at least six letters, anywhere or at a line's start (`at: "line-start"`), in any case (`anyCase`) - each tried on Meno's own sample files as the kind is registered (`lib/io/kinds.ts`), and not taken where one holds it; or, where it says `probe`, by asking it, for files of its `extensions`. A kind it only colours - a program's input, written by hand - is told by its files' names, and among those that share them by what its lines begin with (`lines`, as short as a letter: they claim no file). `program` names the program that writes it, as a molecule read from it names it. `grammar` is `{file, tones}`: a grammar in its folder, and the tone of each of its parts. |
| `reads` | ids | The kinds it reads: its own, or Meno's; one that is neither is left out as the plugin is taken in (`lib/calc/catalog.ts`). |
| `writes` | list of `{kind, options?}` | The kinds of its own it writes, each given one molecule - one system of molecules in 3D - and its options; its name and files' names are the kind's, the first the one Export gives. |
| `xyzEnergies` | list of `{id, pattern, unit?}` | How the program writes a frame's energy on an XYZ file's comment line, from its documentation: `pattern` a regular expression (case-insensitive) with one capture group holding the number; `unit` its number's - `hartree` (the default), `eV`, `kcal/mol` or `kJ/mol` - which Meno converts to hartrees. Meno reads a frame's energy only by the patterns of the plugins added (docs/FILE-IO.md); where two find different numbers on a line, none. |
| `roles` | list of `{role, programs?, options?, looks?, motions?}` | The roles it fills (*Roles*), each one Meno defines, each once; the programs it runs for one as a job, by name, as a step's are (Render: Blender); options only for a role that takes them (*Structures in 3D, and their conformers*); and, for Render, the looks it makes (`looks`: each declared in full - *Looks*, below) and the motions it makes of a film (`motions` - *Motions*, below). |
| `steps` | list of `{kinds, programs?, options?, takes?, files?}` | The kinds of a workflow's step it fills - each one Meno defines (`lib/plugins/steps`), each once - several said in one where they share their programs and options. `programs` are the programs it runs, by name, from its environment or installed separately; none, and it does the step in its worker. A step of a kind that is also a role it fills and says no options takes the role's, starting from those chosen for the role in Settings (2026-10-13; before, from the manifest's defaults). `takes` is what it takes, where less than the kind does. `files` are the kinds of file it takes besides, by their ids: each entry is given the output its molecule was read from where it is of one of them (NCI.md, *How the plugins and Meno meet*). |
| `installed` | list of `{name, label, files, path?, env?, places?, version?, beside?}` | The programs installed separately its steps or roles run: its name as they name it; what it is called; its file's name on each system; the folders put first where programs are looked for, and the variables it is given - each `{folder}` (where its file is) or `{parent}` (the folder above), with a path inside it; and, on each system, the folders it is usually installed in, looked in after those the system finds programs in - each from `/`, `{home}` or `{programs}` (Windows' Program Files), a `*` in a folder's name for any text, a version's, the newest first; and how it says its version, and the least Meno takes - `{args, after, least}`: run with `args`, options alone (never a file or a path), it prints a line beginning `after`, then its version, digits and dots. Then Meno asks each copy it finds - as it looks, as one is located and before each job - and takes the newest that is new enough, saying of an older one why it will not do ("Meno needs <program> 5.0 or later; this one is 4.1"). And the programs installed with it, in its folder, that a job may run after it (`beside`: a few, each by a name - as a job's `then` names it - and its file's name on each system: ORCA's `orca_2mkl`). Never a shell or Python; never `PATH`, what loads code into a program (`LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`), the network's way out, or the threads Meno sets. Where its libraries are looked for (`LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH` and the like) it may be told, as any variable, only a place in its own installation - `{folder}` or `{parent}`, with a path inside it (`jobs.rs` `ENV_NEVER`, `place_ok`). Only one a step or a role runs. A macOS app picked where it is located stands for the program inside it. |
| `downloads` | list of `{file, name, licence, url, sha256, bytes, system?, arch?, unpack?, program?, provides?}` | Files it needs besides its environment - a model's trained weights - each fetched by Meno as the plugin is set up, under the same leave: asking to set it up says each one's name, licence and size, and where it comes from. `url` is HTTPS, pinned to a revision where its host has them; it is checked against `sha256` and `bytes` before it is kept, as `file` - a name, not a path - in `files` beside its environment (`uv/plugin-<id>/files`, or `pixi/plugin-<id>/files` for one pixi makes), taken away with it. A download cut short is taken up where it stopped. The worker is given that folder as its one argument. All as they must be, or the plugin is none; the backend reads them from the manifest itself (`src-tauri/src/plugfiles.rs`). Only those for this computer are fetched: its system, and processor, where a file says one (`system`, `arch`). One may be a program the plugin runs, Meno's own copy of it (`provides`: its name, as the plugin's steps and roles run it): *A program Meno fetches*, below. A plugin that comes to need a file it did not as it was set up asks again, even where its setting up was allowed: the record of its set-up keeps the files the user was told of. |
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
- **Once.** A plugin's guide is shown the first time the plugin is there:
  on Meno's first start for one that comes added, or as soon as one that
  brings a guide is added. Gone through or skipped - Skip, or Escape where
  nothing else takes it (the maintainer, 2026-10-13) - it is kept as shown
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
  beside the plugin's (Render's shading). Meno draws them and remembers
  the chemist's last choices. The form, its drawing and the remembering are in place, used
  first by Meno's own writers in Export (`lib/options.ts`, FILE-IO.md).
  A plugin declares a role's options in its manifest, with the role
  (`roles: [{role, options}]`, for a role that takes them); Settings draws
  them under the role, where it is chosen, and the plugin is sent them
  with each request for the role (`options`). RDKit declares its conformer
  search's (0.1.8): how many sought - as many as the molecule needs, or a
  number given - the force field (MMFF94, MMFF94s, UFF), the steps an
  optimisation may take, the RMSD within which two are the same shape, the
  random seed - and its *Conformers* step takes the same, said once.
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
- **The same shape with equivalent atoms swapped is the one conformer**
  (2026-10-20): a tert-butyl's three methyls turned round, or a phenyl
  flipped, leaves every atom of it somewhere else, so comparing atom
  against atom counted such a shape again and again - a
  tert-butylcyclohexane came back as 26 conformers that were 5, an
  adamantane as 15 that were 1, an ibuprofen as 28 that were 9. Shapes are
  now compared over the ways the molecule maps onto itself as well
  (RDKit's `GetBestRMS`, within the same 0.5 Å over heavy atoms), as an
  eta system's rings already were. Two things hold it back, both measured:
  - **only where the two sit at the one energy.** A shape and the same
    shape relabelled have the one energy exactly - over 4000 such pairs
    here the largest gap the optimisation left was 0.000001 kcal/mol -
    while two different shapes can fall within half an angstrom of each
    other once relabelled: phenylcyclohexane's twist-boat lands 0.40 Å
    from its chair that way and sits 6.1 kcal/mol above it. Without this,
    every twist-boat of it was swallowed by a chair. Where nothing could
    be optimised and no energies came back - no force field here having
    parameters for it - there is nothing to show it with, so those shapes
    are told apart atom against atom, as they were; an eta system, which
    never has energies, keeps the comparison it was given in the first
    place, its rings turning on their metal being the swap it is for.
  - **only where there are few enough ways to try.** A
    tetrakis(triphenylphosphine)palladium maps onto itself millions of
    ways, and trying them took 2.1 s for a single pair of conformers
    against 0.002 s for a thousand of them. Past a thousand ways its
    shapes are told apart atom against atom, as before, and its list may
    hold the same shape twice.
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
  answers. Only conformers RDKit made are touched: not a calculation's,
  not another program's, not a single structure; no heavy atom moves but
  as a whole equivalent branch; and no whole-molecule symmetry is searched.

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
    {smiles}` and `to_smiles {molblock}` (SMILES); `analyse {molblock}`
    (the checks, R/S and E/Z among them); `open_stereo {molblock, like?}`
    (stereoisomers); `conformers {molblock, isomers?, like?, options}`
    (structures in 3D and their conformers, with the role's options);
    `drawing_of {molblock, perceive?}` (a drawing of a molecule in 3D,
    answered with whether it found the bond orders, `perceived`),
    `orders_from_smiles {molblock, smiles}` and `add_hydrogens
    {molblock}` (its bond orders from a SMILES, its hydrogens added);
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
    conformer set or a compound set.
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
- **Keeps nothing between requests**; what it needs is sent each time.
- **Gives data, never code or markup**, in Meno's units, checked by Meno.
- **Runs apart from the page:**
  - a plugin in its own process and environment;
  - Meno's own readers all in a web worker, giving coordinates back in
    buffers - decided once the measurements were seen (FILE-IO.md,
    *Response*). Meno's own writers run on the page: an SVG picture of
    molecules in 3D needs the page's WebGL.

### The entry a plugin is given

Each entry in `prepare`, `collect` and `run` is one molecule, as JSON:

```
{
  "schema": 1,
  "name": "...",                      (where it has one)
  "atoms": [{"el", "x", "y", "z", "charge"?, "radical"?, "isotope"?, "mass"?}],
  "bonds": [{"a1", "a2", "order"}],
  "charge": 0,
  "multiplicity": 1,
  "files": [{"kind", "name", "text"}]  (where the step takes some)
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
- `charge` and `multiplicity` are by Meno's one rule
  (`src/lib/io/writers.ts`, `speciesOf`): what the calculation the
  molecule was read from said, where it said; else what its atoms say.
- Energies a plugin gives back are in hartrees; Meno converts any other
  unit with its units table (`src/lib/units.ts`, CODATA 2018), never a
  plugin's own factor.

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
