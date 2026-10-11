# Workflows on the page

A specification of stage 6 (WORKSPACE.md, *Stages*): calculations built as
workflows and run, on the page itself. Written on 2026-10-08 at the
maintainer's request - *a detailed UI specification before anything is
built* - and revised the same day with their answers. Step 1 is built
(*As built*, below); the rest is not yet. Judge it against [PURPOSE.md](PURPOSE.md): a procedure that
combines several methods, expressed in a form the chemist can read,
rearrange and run again, with its results beside the molecule it is about.

## Decided by the maintainer (2026-10-08)

1. **The workspace is the node editor.** There is no editor of its own: a
   molecule drawn on the page, gathered into a set, is a workflow's input, and a
   calculation is a step added from Quick Add. *This is central to Meno's
   design from here on; it is specified in detail before it is built.*
2. **Meno is first a structure editor that is plain to use**; what more
   it does is reached as the chemist goes further. So Quick Add has **one
   button** for calculations, which opens to them; the drawing's four
   stay as they are.
3. **Meno defines the kinds of step; plugins fill them.** Plugins are to
   be fetched over the internet and made by anyone, and Meno cannot know
   all a plugin does. Only **plugins added** are shown: a step no plugin
   added fills is not offered.
4. **A set of conformers goes through a workflow as any set does**: a
   set of entries, each a structure, worked through step after step.
   (ACCeL, the maintainer's own library, was named only as an example
   that conformer sets can flow so; Meno takes nothing else from it - see
   15.) **A set is a conformer set only where the flow shows that it is
   one**; made by the chemist, it is a compound set (*Compound sets and
   conformer sets*, below).
5. **What lies inside a set's frame is what it holds**: a structure moved
   into it joins it, one moved out leaves it.
6. **xTB first.** Programs installed separately - ORCA, Gaussian and
   others - are to be run later, through the same kinds of step.
7. **This computer only**, for now. A cluster or a remote machine comes
   later, in a stage of its own; nothing here shuts it out.
8. **A calculation running when Meno closes goes on.** Opened again, the
   workspace picks it up.
9. **The proposals are kept** for: making an input from the selection's
   port; results in a set to the right of their step; menus, not keys, to run;
   2D made 3D by a step of its own; jobs' files in Meno's data folder.
10. **The Workflow Builder tab goes, and ReactFlow with it.** The
    workspace's editor is built anew: neither the tab nor ReactFlow's
    code is looked at (*Licences*).
11. **A step on many entries runs a job for each**, by default; a plugin
    may say that its program takes them all in one job, where it does
    that better (*Several at once*).
12. **Meno does the simple steps itself, a plugin may do them instead**,
    the chemist choosing which - as *Files* chooses who reads a kind of
    file (FILE-IO.md). ACCeL's second version is under way, outside this
    repository: it may come later as a plugin that fills these steps.
    RDKit can fill *Duplicates*, if less thoroughly than ACCeL (*Who
    does a step*).
13. **A conformer set is converted to only on purpose**: what the chemist
    gathers into a set is a compound set; a step of its own, *As
    conformers*, makes it a conformer set, on the page for the flow to
    show.
14. **Meno's own words, and its own design** (the maintainer, 2026-10-08):
    what holds a workflow's entries is not called a *box* - ACCeL's
    word for its own class (its second version calls it a *Flow*) - but
    a **set**; and the implementation and the interface are what suit
    Meno best, not ACCeL's.
15. **The figures here are conceptual** (the maintainer, 2026-10-08): they
    show what is where, not how it looks. The look follows Meno's own
    design (*How it looks*); the figures' colours, transparency, line
    widths and icons are not to be taken from them.
16. **A step is a plugin's, and the kind of calculation is in it** (the
    maintainer, 2026-10-08): at the top is the plugin - xTB - and under it
    the kinds of calculation that software does. Quick Add's
    *Calculations* lists the plugins added, each with its kinds; a step's
    card is titled with its plugin, its calculation chosen in it among
    those the plugin does. Meno stands among them, for the steps it does
    itself. This replaces choosing who does a kind in Settings (12): RDKit's
    *Duplicates* and Meno's are two steps to choose between.
17. **Settings holds the defaults; a step customises them** (the
    maintainer, 2026-10-08): Settings, *Calculations*, sets each kind's
    default options, by plugin; a step starts with them, and its options
    changed are its own - never written back as the defaults.
18. **No single 3D structure is made in a workflow** (the maintainer,
    2026-10-10): one geometry made of a drawing is one of its
    conformations taken at random, which a calculation on it cannot
    answer for. A workflow makes 3D structures by a conformer search -
    *Conformers*, from the drawing - and a step of its own, *Choose one*,
    takes one of each compound on purpose: its lowest in energy, or one by
    its number, saying what the energies it ranked by are. The *3D
    structure* step is gone.
19. **The look, after review** (the maintainer, 2026-10-10): a set's name
    and count inside its frame, along its top; a step's card without its
    rule, what it does said whole, on two lines where it needs them; a set
    as large as what is drawn in it - labels and molecules as they reach;
    no list of entries in a set - a molecule's frames chip says each
    conformer's energy and population; chips on the page grow and shrink
    with it, as cards and sets do, their words fading out below 75 %
    (*How it looks*). The ports stay where they were: a step's level with
    its first lines, a set's half-way down its edge.

No question is left open; the whole is for the maintainer to read and
agree before step 1 is built.

## Words

- **Workflow** - what is wired together on one page: sets and the steps
  between them.
- **Set** - a frame on the page, and what lies inside it. An *input* set
  is made by the chemist round what is there; a *result* set is made by
  a step, round what it gave.
- **Entry** - one structure in a set: a drawing, or a molecule in 3D,
  with what has been found of it (its energy, its population...), and in
  play or set aside.
- **Compound set** - a set whose entries are each a compound of its own:
  what a set the chemist makes holds.
- **Conformer set** - a set whose entries are conformers, grouped by the
  compound each is of (*a*, *b*...): what the flow makes, and only it.
- **Step** - one kind of calculation done to a set's entries, of a kind
  Meno defines (*Kinds of step*), filled by a plugin or by Meno.
- **Port** - where a wire starts or ends: a set gives from its right
  edge; a step takes on its left edge and gives on its right; a result
  set takes on its left edge.
- **Wire** - a line from a port that gives to a port that takes.
- **Run** - one time a step was carried out, and what it gave; a step
  keeps its runs.
- **Job** - a program running for a run, on this computer, in a folder
  of its own, its log written as it goes.
- **Procedure** - a whole workflow's steps without their data, saved to
  be put down again.

## What is on the page

![A workflow on the page](workflows/3-on-the-page.svg)

A workflow lives among everything else on the page - drawings, molecules
in 3D, arrows, text - and is made of three things:

- **Sets.** A thin rounded frame, its name along its top, inside it -
  *Input*, or what a step made (*Conformers*, *Optimised*) - and how
  many entries it holds (*1 structure*, *81 conformers*, *23 of 81*). It
  gives from a port on its right edge, half-way down; a result set takes
  on its left edge too.
- **Steps.** A small card: who does it (*xTB*), with the icon of what it
  does; below it, what it does and how (*Optimise · GFN2-xTB*), whole, on
  two lines where it needs them; and what it is doing (*Ready*, *Running
  0:42*), with its state's icon under the first. It takes on its left
  edge and gives on its right.
- **Wires.** Curves from port to port, leaving and arriving level; while
  a step runs, the wire into it moves (a slow dash),
  and goes still when it is done.

They are page items, as an arrow or a molecule in 3D is: they lie on the
page, at the page's scale, zoom and pan with it, and are saved with it.
Their words, and the chips on the page, go below 75 % (*How it looks*):
a card then shows its icon and its state's icon alone, a set its frame
and what it holds.

### How it looks

As Meno's own things look (decided: 15), not as the figures here do:

- **Colours** from Meno's palette only: its greys for frames, lines and
  words; the accent (`accel-base`) for what is done or chosen; the
  attention colour (`accel-accent`) for what failed; the canvas's own
  hover blue for what is under the pointer on the canvas, as an atom or
  an arrow is lit.
- **Lines** as fine as Meno's cards' and chips' borders - a hair on the
  screen, at any zoom - and wires no heavier than they.
- **Cards** as Meno's chips and cards are: white, rounded, a hairline
  border, a soft shadow; words in the sizes Meno's chips use.
- **No tints or fading** to say what state a thing is in: its words and
  its icon say it. A part fades in and out only as it comes and goes.
- **Icons** in the style of the icons Meno already uses (Heroicons'
  outline), from that set where one fits.
- **Chips on the page** - a molecule's frames chip, a measurement's
  value, *Its drawing has changed · Make again* - grow and shrink with the
  page, as its cards and sets do (decided: 19), from where they hang, so
  that a chip under a molecule in a set stays within the room the set
  keeps for it. Below 75 %, where their smallest words would be under
  about 8 px, they fade out, as a set's name and count do and a card's
  words; what opens for a moment - a card on pointing, a menu, Quick Add -
  stays the screen's size. The R and S beside atoms are the drawing's, not
  chips.

Everything comes and goes as Meno's things do (theme/motion): a set, a
step and a wire fade in where they are put; a state changes its words
and colour in a short ease; nothing jumps. Moved, they move as the
pointer does; put back by an undo, they glide back.

## Making a workflow

### An input: a set from the selection

![Making an input from the selection](workflows/1-input.svg)

1. **Select the molecules** with the gesture that selects today: a long
   press on empty space and a drag (or Ctrl/⌘ and a drag).
2. **A port shows on the selection's right edge** while it holds whole
   structures or molecules in 3D (a few atoms of a structure make no
   input). It fades in once the selection is made; nothing else of the
   selection changes, and a chemist who never pulls it never meets a
   workflow.
3. **Pull a wire out of the port.** The selection's frame stays, as an
   *Input* set; a wire follows the pointer.
   - Let go on empty space: Quick Add opens there, at the kinds of step
     that take what the set gives. A step chosen is put down there, wired.
   - Let go on a step's port: wired to it.
   - Let go where nothing takes it, or Escape: the wire goes, and the set
     stays.
4. **Or from the menu**: right-click the selection, *Use as input*.

**What a set holds is what lies inside its frame** (decided):

- a structure or a molecule in 3D whose middle is inside the frame is in
  the set; dragged in, it joins; dragged out, it leaves;
- the frame is the set's own: its tab drags it, with all it holds; its
  edges and corners drag to size it;
- drawn on, a structure stays in it, and the frame grows to keep it
  inside if it would reach past it;
- *Delete set* (right-click its tab) takes the frame away and leaves what
  it held; a set left empty stays, empty, until it is deleted.

A set's entries are its structures and molecules in 3D, in the order they
lie (top to bottom, left to right). A set the chemist makes is a
**compound set**: each entry a compound of its own, however alike two
are (*Compound sets and conformer sets*).

### Kinds of step

Meno defines the kinds of step - what each takes, what it gives, and how
it is shown - so that steps join whoever fills them; plugins fill them,
each with its own options. A plugin cannot bring a kind of its own; a
new kind comes with Meno, as a new role does (PLUGINS.md, *Roles*).

| Kind | Icon (Heroicons' outline) | Takes | Gives |
| --- | --- | --- | --- |
| Conformers | a stack of layers | structures drawn, or molecules in 3D | **a conformer set**: each compound's conformers |
| Optimise | a trend going down | molecules in 3D | each optimised, its path as frames - the same kind of set |
| Energy | a bolt | molecules in 3D | each with its energy - the same kind of set |
| Frequencies | a signal | molecules in 3D | each with its vibrations and thermal corrections - the same kind of set |
| Energy window | a funnel | a conformer set, with energies | those within the window of their compound's lowest; the rest set aside |
| Duplicates | two squares, one over the other | molecules in 3D | each unlike the others of its compound kept; the rest set aside - the same kind of set |
| Populations | bars | a conformer set, with energies | each with its Boltzmann population within its compound |
| As conformers | shapes grouped | a compound set of molecules in 3D | **a conformer set**: entries of the same constitution - the same atoms, bonded the same way - as conformers of one compound |
| Choose one | a pointer choosing | a conformer set | **a compound set**: one conformer of each compound - its lowest in energy, or one by its number; the rest set aside |

The first four run a program; the last five work on a set's entries
alone (*Who does a step*). A step that keeps a set keeps its kind: a
conformer set optimised is still one. A plugin's step may take less than
its kind (PLUGINS.md, `takes`): CREST's *Conformers* starts from
molecules in 3D only. More kinds come with Meno as they are needed - a
free energy from an energy and its corrections, a template input written
out - each specified before it is built.

### Who does a step

A step is the step of what does it - a plugin added, or Meno - and of
one of the kinds of calculation it does (decided: 16):

- **Meno does the simple steps itself** - *Energy window*,
  *Populations*, *As conformers*, *Choose one*, and *Duplicates* in a plain way (the
  RMSD of the entries' atoms in their own order, after the best fit; it
  does not see symmetric atoms swapped, so two copies of a structure
  numbered differently can both be kept). Meno's part is there from the
  start, with nothing to add.
- **A plugin added may do any of them as well**: RDKit does *Duplicates*
  with its best RMSD over the molecule's symmetries; ACCeL, its second
  version, may come as a plugin that does them all as ACCeL does. Each
  is a step of its own to choose: *RDKit*'s *Duplicates*, or *Meno*'s.
- **The chemist chooses** in Quick Add - a plugin, then one of its
  kinds - and may change a step's calculation in it, to another its
  plugin does. Settings, *Calculations*, lists the plugins added and
  Meno, each with its kinds and their default options.
- **Steps that run a program** are done by plugins only: Meno runs no
  program of its own.

### A step: from Quick Add

![Quick Add with one button for calculations](workflows/2-quick-add.svg)

- **Quick Add keeps its four** - bond, text, reaction arrow, "+" - and
  gains **one button**: *Calculations*, a small graph of two joined
  sets, after a thin rule.
- **Pressed, it opens** a panel below the row, a line for each plugin
  added that does steps - those that run a program first - then Meno:
  its name, and the kinds of calculation it does, each an icon, named on
  hover (decided: 16). *As conformers* is not among Meno's: it is
  reached from a compound set's port, its wire let go on empty space - a
  conversion taken on purpose.
- **Only what is added is there.** With no plugin added, the panel shows
  Meno's line alone; nothing is shown of plugins not added.
- **A wire let go on empty space** opens Quick Add already at
  *Calculations*, showing only the kinds that take what the wire
  carries - and a plugin only where it does one of them.

### Wires

- **Drawn** from a port that gives to one that takes, or the other way: a
  press on a port and a drag. While it is drawn, the ports that would
  take it are lit in the accent; the others stay as they are.
- **What may join**: what a port gives to a port that takes it (*Kinds of
  step*). Nothing is converted on the way: a set of structures does not
  go into *Optimise* - *Conformers* and *Choose one* go between, on the
  page;
  a compound set does not go into *Populations* - *As conformers* goes
  between, or a *Conformers* step.
- **One port may feed several steps**; a port that takes, one wire. A
  wire drawn to a port that has one replaces it.
- **Deleted** by Delete or Backspace with the pointer on it, or its menu;
  dragging its end off a port and letting go on nothing deletes it too.

### Its options

![A step's options](workflows/4-options.svg)

A click on a step opens it, in place, to its options - as a molecule's
frames chip opens to its slider:

- the plugin's own options, drawn in Meno's general form (`lib/options`,
  as Export draws a writer's): for xTB, its method (GFN2-xTB, GFN1-xTB,
  GFN-FF), solvent, optimisation level; for *Energy window*, the window
  (3 kcal/mol);
- the charge and the unpaired electrons, read from each entry as Export
  reads them, and changeable;
- what it does: another of the kinds of calculation its plugin does,
  where it does more than one (*Who does a step*) - the options the two
  share kept as they were;
- *Show log* and *Show files* once it has run.

Another click on its title, Escape, or a press elsewhere closes it. The
step's options are its own: it starts with the defaults Settings,
*Calculations*, has for its kind done by its plugin, and what is changed
in it changes it alone - the defaults are set in Settings and nowhere
else (decided: 17).

## Compound sets and conformer sets

![A set of conformers through a workflow](workflows/7-conformers.svg)

Conformers go through a workflow as any set does (decided):

- **A set holds entries**, each a structure, with what has been found of
  it: energies, corrections, populations.
- **A set is one of two kinds** (decided):
  - a **compound set** - each entry a compound of its own. What the
    chemist gathers into a set is one, always: two structures in a set
    together are two compounds, however alike; a file of many geometries
    read and gathered into a set
    is a compound set of many, not conformers because there are many;
  - a **conformer set** - entries grouped by the compound each is a
    conformer of (*a*, *b*...). It is made
    by the flow only: by *Conformers*, or by *As conformers* - the
    conversion taken on purpose, a step on the page like any other - and
    kept by the steps after them that keep their set's kind. So whether
    a set is a conformer set can always be read from the flow that led
    to it - with one exception (the maintainer, 2026-10-08): **a
    molecule whose frames a conformer search made** - Meno's own, *3D
    structures*, or a workflow's - is one compound's conformers wherever
    it is, as it says it is; a set the chemist draws round one is a
    conformer set, each molecule in it a compound, its frames its
    conformers. A file's many geometries are still many compounds.
- **Steps work entry by entry**, or compound by compound where the kind
  says so: *Optimise* each entry; *Energy window* and *Populations*
  within each compound of a conformer set.
- **What a step sets aside is kept** with its set, not deleted, so that a
  window made wider brings it back on the next run; the set's count says
  how many of how many it holds (*23 of 81*).
- **On the page**, a conformer set's compound is shown as one molecule in
  3D with its conformers as frames - the conformer set Meno draws today,
  its chip saying the entry, its energy and population; entries set aside
  are not among its frames. A compound set's entries are separate
  molecules, each its own.
- **A set's tab says which it is**: *Compounds · 2*, *Conformers · 2
  compounds · 81*.

## Running

### Starting and stopping

| From | What |
| --- | --- |
| A step's menu (right-click) | *Run* - this step, and first any step before it that has not run or has changed |
| | *Run from here* - this step and every step after it |
| | *Stop* - while it is waiting or running |
| | *Show log*, *Show files*, *Options…*, *Delete step* |
| The menu on empty space | *Run all* - every step on the page that has not run or has changed, in order |
| | *Stop all* - while any runs |

No key starts a run (decided: menus, at first). Steps run in the order
their wires give; steps that do not depend on one another may run at
once (*Several at once*).

### States

![A step's states](workflows/5-states.svg)

| State | Icon and colour | What the card says |
| --- | --- | --- |
| Ready | none, grey words | *Ready* |
| Waiting | a clock, grey | *Waiting · 2nd* - its place in the queue |
| Running | turning, the accent | *Running 1:12*, or *Running · 7 of 81*; the log's last line under it; a thin bar where the program says how far it is |
| Done | a tick, the accent | *2:03 · −42.10871 Eh*, or *81 of 81*, or *23 kept* - how long, and the number the step is for |
| Failed | an exclamation mark, the attention colour | *Failed* - and the line of the log that says why; *3 of 81 failed* where some entries did |
| Stopped | a stop, grey | *Stopped after 0:31* |
| Changed | turning arrows, grey | *Changed · run again* - its options, or what comes into it, changed since its run; its results stay as they are |

### The log

*Show log* opens the job's log in the workspace's column of texts (PR
#172), updating while the job runs - its last lines kept in view unless
the chemist scrolled up. A step of many entries has a log for each,
named for the entry. A log is a text of the workspace like any other,
but with no sheet on the page: its step is its body, and it rises out of
the step's card into the column, and goes back into it as the column
shuts (docs/PDF.md, step 5).

### Results

![A step's results and its log](workflows/6-results.svg)

When a run is done, what it gave comes in as a result set to the right
of the step, wired from it (decided):

- **Optimise**: each entry as optimised, its path as frames, the energy
  of each frame - what an optimisation read from a file shows today;
- **Conformers**: a conformer set - each compound's conformers, as its
  entries (*Compound sets and conformer sets*);
- **Energy**, **Frequencies**: the entries, each with its energy, or its
  vibrations and thermal corrections;
- **Energy window**, **Duplicates**, **Populations**: the same entries,
  some set aside, or with their populations;
- **As conformers**: the same entries, as a conformer set.

They are calculation results as Meno knows them: the frames chip,
pointing at atoms, the lists. The set's port feeds the next step.

Run again, a step replaces its result set's entries with the new run's,
gliding to where they now are; earlier runs are kept in the step (*Runs*,
under its options: when, with what options, how long, the number it
gave), and one can be shown again.

### Several at once

- By default **one job runs at a time** on this computer; others wait,
  in the order they were started. Settings, *Calculations*: how many at
  once, and how many cores each may use.
- **A step on many entries makes one job for each** (decided), queued as
  above - each with its own log, a failure its own, several at once
  where Settings allows.
- **Unless its plugin says otherwise**: a plugin's manifest may say that
  a kind it fills takes all its entries in one job, where its program
  does that better - CREST optimising an ensemble in one run
  (`crest --mdopt`), ORCA chaining jobs in one input. Then the step runs
  one job, with one log, and the entries that came out of it are told
  apart in the results; a failure is the whole job's.

### When Meno closes

- **Jobs go on** (decided). Closing with jobs waiting or running says how
  many will go on, and asks nothing else; those waiting start in turn,
  without Meno.
- **Opened again**, a workspace looks at its jobs: done - their results
  come in, as if Meno had been open; still running - shown running, with
  the time since they started; gone without finishing (the computer was
  restarted, say) - *Stopped*, with their logs.
- A workspace never saved keeps its jobs with the unsaved workspace Meno
  reopens; closed without saving, its jobs are stopped - said in the
  dialog that asks about saving.

### Undo

- Making a workflow is editing the page: a set, a step, a wire, options -
  each an undo step, as anything drawn.
- A run is not undone. Its results coming in is one step: an undo takes
  them away (the step shows its earlier run, or none), a redo brings them
  back. The job's files stay until the step is deleted.
- Deleting a step that is running asks first; it stops it.

## Saving and sharing

- **The workspace keeps it all** (`.meno`, FILE-IO.md, *The workspace
  file*): sets, steps, wires, options; each run - when, with what
  options, which program and version, how it ended; logs and outputs, as
  files kept by their SHA-256; results as entries on the page.
- **Shared, a workspace is the procedure with its results**: opened
  elsewhere, everything is there to read, and runs again where the same
  plugins are added.
- **A procedure** - a whole workflow's steps without their data - is
  saved from any step or set of it: right-click, *Save as procedure…*,
  named. Procedures are listed in Quick Add's *Calculations* after the
  kinds, one icon each; put down, the chain comes, wired, ready for an
  input. Shared as a workspace file (decided: step 7).
- **Copying** a workflow's parts is as copying a drawing: a box, a lasso,
  Ctrl or ⌘ and a click, or *Select all* takes sets and steps with the
  rest; they are copied, cut, pasted, deleted and moved with it (decided:
  step 7).

## Programs and plugins

- **xTB**: a plugin whose environment is made by pixi from conda-forge -
  xtb 6.7.1, LGPL-3.0, for macOS (Apple silicon and Intel), Windows and
  Linux. It fills *Optimise*, *Energy* and *Frequencies*, and reads its
  own outputs back.
- **CREST**: *Conformers*, by a plugin made the same way - crest 2.12
  with xtb 6.7.1, LGPL-3.0, on conda-forge for macOS and Linux only. On
  Windows it cannot be added, and *Conformers* is filled by RDKit alone
  there. (Not 3.0.2: *As built*, step 5.)
- **Programs installed separately** (ORCA, Gaussian; step 6): never fetched by
  Meno - their licences do not allow it. A plugin's manifest says which
  program it needs and how to know it (its name, and the line its version
  is read from); Meno looks for it where the system finds programs, and
  Settings, *Plugins*, shows where - or *Not found - Locate…*. A step
  whose program is not found says so on its card, and its *Run* opens
  that place.

### What changes in the contract

- **The manifest says which kinds of step a plugin fills** (`steps`): the
  kinds (each one of Meno's), their options in the general form, the
  programs they need, and what they take where less than the kind does
  (PLUGINS.md, *The manifest*). Whether a job is for one entry or several
  is the plugin's to say, in `prepare`'s answer. Meno shows a kind only
  where something added fills it.
- **Two new requests** (PLUGINS.md, *The contract*):
  - `prepare {step, entries, options, cores?}` - each job's files, the
    program and arguments that run it, the entries it is for, and the
    files it reads back;
  - `collect {step, entries, options, files, log, ended}` - what a job
    gave, read from its files, in Meno's own forms.
- **Meno runs the jobs, not the plugin**: its own executable in a job
  mode, started apart from Meno so that it outlives it, runs the command
  in the job's folder - in the plugin's environment, or with the program
  found - writes the log, and records how it ended. Every job is
  started, stopped and logged the same way, whoever prepared it; *Stop*
  stops the program and everything it started (a process group on macOS
  and Linux, a job object on Windows).
- **Steps on entries alone** (*Energy window*...), done by a plugin
  rather than by Meno, are a plain request, `run {step, entries,
  options, holds}`, answered at once, no job made.
- **Jobs reach no network**, as the plugins' workers do not.
- **A job's folder** is in Meno's data folder (`jobs/<id>/`; decided):
  its input, its log, its outputs, Meno's record of it. *Show files*
  opens it. Its outputs are kept in the workspace when they come in; the
  folder goes when its step is deleted, or by *Settings, Calculations,
  Clear finished jobs' files*.

## Licences

- **The editor is Meno's own.** Sets, steps, wires, ports and their
  drawing on the page are written for Meno, from this specification,
  with no code taken or read from ReactFlow, the Workflow Builder tab, or
  any other node editor (the maintainer, 2026-10-08). ReactFlow
  (`@xyflow/react`) leaves Meno's dependencies with the tab.
- **Programs are run, not linked**: xTB and CREST (LGPL-3.0) are
  separate programs in their plugins' environments, fetched from
  conda-forge with the chemist's consent; their licences are shown in
  Settings, *Plugins*, as each plugin's is.
- **Programs installed separately** are found, never fetched or shipped.
- **ACCeL** (MIT), if its second version comes as a plugin, is fetched
  like any other, its notice shown with it. Meno's own steps on entries
  are written for Meno from this specification and published methods;
  ACCeL's code is not copied into Meno (were it ever, its MIT notice
  would go with it - Meno is Apache-2.0).
- **Figures and icons** here and in the app are Meno's own.

## Where this leaves what is there

- **The Workflow Builder tab** and ReactFlow go (decided), once sets and
  steps are on the page - or before; nothing here uses them.
- **Export** keeps writing a calculation's input (Gaussian's, through
  its plugin) for a chemist who runs it elsewhere.
- **Opening an output** keeps working as now; an output read is a
  molecule like any other, and can be put in a set.
- **RDKit's conformers** (*3D structures*) stay as they are; in a
  workflow, RDKit fills *Conformers*, from a drawing as from molecules in
  3D.

## In order

1. **Sets, steps and wires on the page**, none run: the document's new
   items, their drawing, inputs made from the selection, wires, Quick Add's
   *Calculations*, menus, undo, saving; Meno's own *As conformers*,
   *Energy window*, *Duplicates* and *Populations* - the first steps that
   do something, on entries read from files - and Settings,
   *Calculations*, choosing who does each. The Workflow Builder tab and
   ReactFlow removed.
2. **The job runner**: Meno's job mode, started apart; logs; *Stop*;
   picking jobs up when a workspace is opened; Settings, *Calculations*.
3. **xTB**: its plugin; *Optimise*, *Energy*, *Frequencies*; results
   coming in. The first workflow that runs: input → 3D structure →
   optimise.
4. **Chains**: running in order, *Run from here*, *Run all*, *Changed*,
   runs kept, several at once.
5. **Conformers**: RDKit's in a step, and RDKit's *Duplicates*; then
   CREST (macOS and Linux).
6. **Programs installed separately**: ORCA and Gaussian - finding them,
   their steps, reading their outputs.
7. **Procedures**: saved, put down again, shared as a file.

Each is a PR of its own, checked on the Mac; Windows is asked only where
something is Windows' own (the job object; xTB's Windows build).

## As built

### Step 1: sets, steps and wires (2026-10-08)

Built as specified above: sets, steps and wires as the document's items,
undone and saved with it; an input made from the selection's port, or
*Use as input* in its menu; wires drawn from a port that gives or back from one
that takes, picked up off a step and put into another, replaced, and
deleted (Delete or Backspace on one, its menu, or picked up and let go
on nothing); a set dragged by its tab with what it holds, sized by its
edges and corners, chosen by a click on its tab; steps dragged, opened in
place to their options by a click; Quick Add's one button; Meno's *As
conformers*, *Energy window*, *Duplicates* and *Populations*, run from a
step's menu - the steps before it first, where they have not run or have
changed - their results in a set to the right; Settings, *Calculations*.

Decided while building it, for the maintainer to confirm:

- **A step with nothing wired into it says *No input*** rather than
  *Ready*. Run, it fails, saying so.
- **A result set lists a conformer set's entries under its tab** -
  lowest energy first, three of each compound, how far above its lowest
  each is and its population, then how many more - with its molecules
  below the list. Entries set aside follow, struck through, two of each
  compound and then how many more. A compound set's result lists only those
  set aside, by their compound's letter: its entries are on the page.
- **Entries keep their numbers** through steps that set some aside: *a ·
  7* stays *a · 7* (a molecule's `numbers`, shown in its frames chip as
  *#7*). A *Populations* step's shares are the molecule's own and are
  what its chip shows, in place of room temperature's.
- **Duplicates in a compound set** compares entries of the same atoms in
  the same order: a structure there twice is the same structure. In a
  conformer set, within each compound, lowest energy first.
- **Deleting a step keeps the set it made**, with what it holds - a set
  like any the chemist made, so a compound set.
- **The look, after review** (2026-10-08): frames, tabs, cards and ports
  in Meno's palette and its cards' hairline borders, a hair on the screen
  at any zoom; wires a hair and a quarter; Heroicons' outline icons for
  the kinds and the states; no tint or fading for a state. The canvas's
  hover blue only for a wire under the pointer, as for an atom.
- **A step's card is 208 px wide** at 100 %, its ports 28 px below its
  top: wires join where they always did as the card opens.
- **One layer of HTML for all sets and steps**: with a layer for each, a
  step's layer covered the ports of sets under it (ARCHITECTURE.md,
  *Workflows*).

Not yet, and where it comes:

- a set growing to keep inside it a structure drawn past its edge, and
  sets, steps and wires fading out as they are deleted (they fade in) -
  a follow-up;
- *Waiting*, *Running* and *Stopped*, the running wire's dash, *Stop*,
  logs and files - the job runner, step 2, and on the cards with the
  first steps that run jobs, step 3;
- plugins filling kinds (the manifest's `steps`): until step 3, only
  Meno's own steps are offered, and Settings, *Calculations*, lists them
  alone;
- *Run from here*, *Run all*, runs kept in a step - step 4;
- copying sets and steps; procedures - step 7.

### Step 2: the job runner (2026-10-08)

Built: Meno's job mode, started apart from Meno (`Meno --job <folder>`);
jobs waiting their turn, in the order they were asked for, as many at once
as Settings allows; each one's log; *Stop*, for its program and
everything it started; how each ended, recorded - and a job whose runner
went without saying, the computer restarted, told apart. Settings,
*Calculations*, *Jobs*: *Jobs at once*, *Cores for each*, and the
finished jobs' files, cleared. How it works: ARCHITECTURE.md, *Jobs*.

Decided while building it, for the maintainer to confirm:

- **A job runs only a program its plugin's manifest names** (`steps`,
  each kind with the `programs` it needs, by name - a program installed
  separately is named so too, and declared under `installed`: step 6), from
  that plugin's environment - never a shell, and Python only running a
  script of the plugin's. Meno's page names a plugin and a program, never
  a path.
- **Cores for each, unset, are the computer's shared among the jobs at
  once** - all of them while one runs at a time; set, never more than the
  computer has. A program is told them as `OMP_NUM_THREADS` (and MKL's
  and OpenBLAS's); a plugin's command may say them as well (xTB's `-P`).
- **Jobs at once counts for jobs asked for after it is changed**: one
  already waiting keeps the number it was asked with.
- **A job whose runner went without saying how it ended is *gone***, in
  its record; its card will show it *Stopped*, with its log, as above.
- **Stop is at once on Windows** (its job object is ended); on macOS and
  Linux the program is asked to stop, and made to after 3 s.

Not yet, and where it comes:

- steps that make jobs - their cards' *Waiting*, *Running* and *Stopped*,
  the running wire's dash, *Stop* in a step's menu, logs in the column of
  texts, *Show files*, jobs picked up when a workspace is opened, and the
  note on closing with jobs going on - step 3, with xTB: until a plugin
  names programs, nothing asks for a job;
- a program installed separately, found where the system finds programs
  (ORCA, Gaussian) - step 6.

### Step 3: xTB (2026-10-08)

Built: the xTB plugin (xtb 6.7.1 from conda-forge, made by pixi), filling
*Optimise*, *Energy* and *Frequencies*; RDKit filling *3D structure*; the
manifest's `steps` and the requests `prepare` and `collect`; steps that
run jobs - *Waiting · 2nd*, *Running 1:12* with the log's last line under
it, *Stopped after 0:31*, the wire into a running step a slow dash -
*Stop*, *Show log* and *Show files* in a step's menu; results coming in; a
workspace opened again picking its jobs up; and what closing says of jobs
going on. The first workflow that runs: an input of drawn structures, *3D
structure*, *Optimise*. How it works: ARCHITECTURE.md, *Workflows*.

What xtb is asked, and what is read of what it writes, are as xtb's own
documentation has them (xtb-docs.readthedocs.io) - the command line, the
optimisation's trajectory and the files that say whether it converged,
the machine-readable dump (`$write json=true`), the thermochemistry it
prints - and the plugin's tests are written after its examples; no output
of a real run is kept in the repository.

Decided while building it, for the maintainer to confirm:

- **The manifest's `steps`**: each kind it fills, with the `programs` it
  runs - none, where it does the step in its worker - and its options in
  the general form. A step's options are its doer's: who does it says
  what it takes.
- **`prepare {step, entries, options, cores}`** gives each job's input
  files, its program and arguments, the entries it is for, and the files
  `collect` will want - and, where its program reads one of its files as
  its standard input, which (`stdin`; added with the real runs of
  2026-10-09, for Gaussian); **`collect {step, entries, options, files, log,
  ended}`** gives an output for each entry in the readers' output form
  (lib/calc/output) - or, for a job that did not end done, why, in the
  program's words. Meno asks `collect` of a failed job too, so that the
  card says why.
- **An entry goes to a plugin as Export gives a molecule to a writer**,
  with its charge and spin multiplicity as Export reads them. Changing
  them in the step comes later.
- **One job for each entry**; a plugin taking all its entries in one job
  comes with CREST (step 5).
- **3D structure** is RDKit's: one conformer of the first stereoisomer,
  as *3D structure* from the canvas's menu makes it, asked through the
  roles' `conformers` with its options from Settings.
- **Optimise, in a compound set**: each entry as optimised, its path as
  its frames, ending at it and shown there; such a molecule is one entry
  of a set - its last geometry - not one for each frame (`path`). In a
  conformer set: each conformer's optimised geometry and energy, the path
  not kept, the calculation's results not each conformer's.
- **Frequencies**: the vibrations - their wavenumbers, reduced masses and
  IR intensities - and the thermochemistry (Gibbs free energy, zero-point
  energy, the corrections to G and H, T·S). How each mode moves is not
  yet shown: xtb documents no displacements in a form of its own (its
  `g98.out` is "GAUSSIAN-format"), so they wait for a documented source.
- **A run under way is kept in the workspace with no step to undo**, the
  workspace unsaved until it is saved; the results coming in are one step
  to undo. Each job's log is kept in the workspace with the molecules it
  gave.
- **Closing**: a workspace with unsaved changes asks as before, and says
  that closing it without saving stops its jobs, saved first they go on;
  one saved says, once its tab is closed, how many go on. Meno quitting
  with nothing unsaved says nothing: there is nowhere left to say it.
- **Deleting a running step asks first**; deleted, a step's jobs are
  stopped and their folders taken away. Undone, the step comes back
  without them; its results keep its logs.
- **Show log** opens each job's log as a text of the workspace, *Optimise
  log* (*Optimise log 2*, ... where there are several), following the
  job while it runs; a text that grows at its end keeps its last lines in
  view unless it was scrolled up.
- **A choice of more than five** is a list to pick from, in a step's
  options and in Settings (xTB's solvents, its convergence levels).
- **xTB's options**: the method (GFN2-xTB, GFN1-xTB, GFN-FF), a solvent -
  ALPB, any of the 24 its documentation gives for all three methods - and,
  optimising, how far it converges (crude to extreme, normal by default).

Changed after review (the maintainer, 2026-10-08; decided: 16): a step
is its plugin's. Quick Add lists the plugins added, then Meno, each with
its kinds; a step's card is titled with its plugin and says its
calculation under it; opened, it offers the plugin's other kinds;
Settings, *Calculations*, is by plugin, and no longer chooses who does a
kind. Settings sets each kind's defaults, by plugin and kind; a step
starts with them, and what is changed in it is its own (decided: 17).

Not yet, and where it comes:

- *Run from here*, *Run all*, runs kept in a step, several steps at once
  - step 4 (*Run* already runs the steps before it that need it);
- a thin bar where a program says how far it is;
- a workspace never saved keeping its jobs with the unsaved workspace
  Meno reopens: Meno reopens no unsaved workspace yet.

### Step 4: chains (2026-10-08)

Built: *Run from here* in a step's menu - the step and every step after
it, those that take what it gives and those after them; *Run all* and
*Stop all* in Meno's menu, under *Calculations* (on the right-click menu
on empty space since 2026-10-10) - every step that has not
run or has changed, in the order their wires give; steps that do not wait
on one another run at once, their jobs queued as Settings allows; a step
after one that failed is not run. A step keeps its earlier runs: opened,
its card lists them under *Runs* - when, what it gave, how it was set -
and one can be shown again, its results back in the step's result set.
How it works: ARCHITECTURE.md, *Workflows*.

Decided while building it, for the maintainer to confirm:

- **A step keeps its last ten runs**, each with the molecules it gave, in
  the workspace. A run refused before it began - nothing coming in, say -
  is not kept.
- **Showing a run again** puts its results in the result set and makes
  it what the step last did - one step to undo - and keeps what was shown
  among the runs in its place. The step's options stay as they are: where
  they differ from the run shown, its card says *Changed*.
- **Each run records the kind and options it ran with**, so that a run
  kept says how it was set even after the step's are changed.
- ***Run all* leaves out a step with nothing coming into it**, which
  could only fail.

### Step 5: conformers (2026-10-08)

Built: *Conformers* by RDKit, as a job, and by CREST, a plugin of its own
for macOS and Linux; *Duplicates* by RDKit, at once. A conformer search's
results come in as a conformer set. How it works: ARCHITECTURE.md,
*Workflows*.

What CREST is asked, and what is read of what it writes, are as CREST's
own documentation has them (crest-lab.github.io/crest-docs) - the command
line, and the ensemble file its conformers are written to, each frame's
comment line its energy in hartrees - and the plugin's tests are written
after it; no output of a real run is kept in the repository.

Decided while building it, for the maintainer to confirm:

- **RDKit's conformer search in a step is the one *3D structures* makes
  on the canvas** - ETKDG v3, then MMFF94, MMFF94s or UFF - with the same
  options, run as a job: RDKit's own Python runs a script of the plugin's
  on the molecule written into the job's folder, so that a long search
  goes on when Meno closes, as any job does. The stereo is kept as the
  entry's 3D structure has it.
- **A search on a compound set** runs one job for each entry; **on a
  conformer set**, one for each compound, from its first conformer.
  Either way the results are a conformer set: each geometry a search gave
  a conformer of its entry's compound, numbered lowest energy first, each
  with its energy; the calculation is kept with the first. The card says
  how many: *0:45 · 17 conformers* (*... of 2 compounds*).
- **RDKit's *Duplicates*** compares the entries of each compound - a
  conformer set's, or in a compound set those of the same structure -
  lowest energy first, and sets aside each within the RMSD of one kept:
  over the heavy atoms, at its best over the molecule's symmetries
  (0.125 Å by default, the threshold CREST's own sorting starts from). It is done at
  once in RDKit's worker - `run {step, entries, options, holds}`, no job -
  and says *2 of 3 kept*.
- **CREST's options**: the method (GFN2-xTB, GFN1-xTB, GFN-FF, or
  GFN2-xTB//GFN-FF: searched with GFN-FF, the conformers then optimised
  with GFN2-xTB), a solvent (ALPB, the 24 xTB offers), how thorough the
  search is (full, or CREST's three quicker ones), and the energy window
  (6 kcal/mol by default). The charge and spin multiplicity are those
  Export reads, as for xTB.
- **CREST 2.12, not 3.0.2.** conda-forge's CREST 3.0.2 for macOS keeps
  only the lowest conformer, whatever energy window it is given: its
  CREGEN sorting takes the window as 0 (github.com/crest-lab/crest/issues/431,
  open; seen here with n-butane, 1 conformer where 2.12 finds 3). 2.12
  runs xtb as a program, which 3.0 does within itself - slower (n-butane
  2 min 21 s against 11 s, on 8 cores) - but one version on both
  systems finds the same conformers. A later build that keeps the window
  is a change of the plugin's lock alone.
- **A plugin for some systems only** says so in its manifest
  (`systems`); elsewhere Settings, *Plugins*, says *For macOS and Linux
  only* in place of *Add*, and it cannot be added.

Not yet, and where it comes:

- **A plugin taking all its entries in one job** (*Several at once*):
  CREST's conformer search takes one molecule, so it is one job a
  compound; CREST optimising a set of conformers in one run
  (`crest --mdopt`) would be its *Optimise*, not offered yet.
- **Each conformer's population** as CREST works it out, and the
  rotamers it sets aside, are not read: Meno's own *Populations* works
  them out from the energies.

### Step 6: programs installed separately (2026-10-08)

Built: ORCA and Gaussian 16 - each run by a plugin, never fetched or
shipped by Meno - filling *Optimise*, *Energy* and *Frequencies*; Meno
finding their programs where the system finds programs, or where the
chemist locates them in Settings, *Plugins*; and what they write read by
Meno's readers, as an output opened is. How it works: ARCHITECTURE.md,
*Jobs* and *Workflows*.

Decided by the maintainer (2026-10-08), as it was built:

- **What ORCA and Gaussian write is read by Meno's readers** - every
  reader of its kind added (cclib, PySCF), put together, as when the
  output is opened - not by the plugin that ran it. The output is kept
  with the molecules it gave, by its kind, as an opened one is. Where no
  reader of it is added, the step says which to add.
- **Gaussian's steps are its input plugin's**: the plugin that writes
  Gaussian's input for *Export* is now the *Gaussian interface*, and runs
  it as well, its input written by the same code. Its id changed with its
  name (`gaussian`): added before, it is added again (no backward
  compatibility before 1.0).
- **An interface, by name**: a plugin that runs a program installed
  separately is named for what it is - the *ORCA interface*, the
  *Gaussian interface* - in Settings, *Plugins*, so that it is not taken
  for the program, nor its version for the program's. Where its steps are
  - a card, Quick Add, Settings' defaults - they go by the program's name:
  *ORCA*, *Gaussian 16*. *Plugins* stays the name of the whole.
- **Checked with stand-ins on the Mac**: no ORCA or Gaussian was installed
  there then; the programs themselves were run on 2026-10-09 (*Real runs
  of ORCA and Gaussian*, below).

Decided while building it, for the maintainer to confirm:

- **A manifest declares each program installed separately** that its
  steps run (`installed`): its name, what it is called, its file on each
  system, the folders put first where programs are looked for, and the
  variables it is given - each a place inside its installation. Meno's
  backend takes nothing else: no variable that loads code into a program,
  not PATH itself, not what Meno sets.
- **Found where the system finds programs** - PATH, as Meno was given it
  - **or where the chemist located it**: Settings, *Plugins*, under its
  plugin, says where it is, or *Not found*, with *Locate…*; a file
  picked is taken only where it is that program (its file's name, and one
  that can be run). On macOS, a Meno opened from the Dock or the Finder is
  given the system's PATH, not a shell's: ORCA and Gaussian are usually
  located once there.
- **A step whose program is found nowhere** says *ORCA not found* where it
  would say *Ready*, and its *Run* opens Settings, *Plugins*; run with
  others, it fails saying where to locate it.
- **ORCA** is given its input as its manual lays it out: one simple input
  line - the method, basis set, dispersion correction (D3BJ or D4), the run
  (SP, OPT, FREQ) and C-PCM or SMD with one of 22 solvents - `%pal nprocs`
  where a job may use more than one core, `%maxcore` where it is set, and
  the coordinates. It is run by its full path, its folder first where
  programs are looked for, as the manual asks; what it prints is its
  output.
- **Gaussian** is given the input *Export* writes - the job of the step's
  kind (Opt, SP, Freq), PCM or SMD with one of 22 solvents as SCRF says,
  %NProcShared from the cores a job may use, no checkpoint file - and run
  as `g16 <input.gjf` (`g16 input` until 2026-10-09: *Real runs*, below),
  given `g16root` (the folder above its own) and GAUSS_EXEDIR (its own
  folder), its scratch files where it runs. Why a run failed is read from
  its output.
- **The options** are the method and basis set as text - as *Export*'s
  are - the dispersion, the solvation and its solvent, more keywords, and
  the memory; the cores come from Settings, *Calculations*, as xTB's do.

Not yet, and where it comes:

- **Gaussian on Windows**: its steps are offered on macOS and Linux only,
  until Gaussian's own documentation for running it on Windows is read;
  *Export* writes its input everywhere.
- **ORCA running in parallel** needs OpenMPI where programs are looked
  for; a Meno opened from the Dock is not given a shell's PATH, so a
  located OpenMPI comes later. With one core for each job (Settings,
  *Calculations*), ORCA needs none.
- **The version** of a program installed separately is what its output
  says, as the readers read it; Settings does not ask the program itself.

### Real runs of ORCA and Gaussian (2026-10-09)

Step 6 had run only against stand-ins. On 2026-10-09 the real programs
were run from the built app on the Mac: ORCA 6.1.1 (macOS, arm64) and
Gaussian 16 Rev. B.01 (x86_64, under Rosetta), each located in Settings,
*Plugins*, with one core for each job (Settings, *Calculations*: OpenMPI
is not installed there, so ORCA runs one process). Methanol, opened from
a MOL file, was made the input of two chains from Quick Add: ORCA's
*Optimise* then *Frequencies* (B3LYP-D3BJ/def2-SVP), Gaussian 16's the
same (B3LYP-D3BJ/6-31G(d)), the four queued one at a time.

What was seen, and what was put right:

- **ORCA**: both ran and were read back as designed - *Optimise* in about
  12 s, -115.56885 Eh, its path of 7 frames on the frames chip;
  *Frequencies* in 10 s, its 12 vibrations in the molecule's list (330.5
  to 3819.7 cm-1, none imaginary), its partial charges by pointing at an
  atom, and what the calculation was on the chip.
- **Gaussian's output went to a file nobody followed.** Run as `g16
  input`, Gaussian writes `input.log`, and what it printed - nothing - was
  the job's log: *Show log* said *(Nothing yet)*, the running card had no
  last line, and a run that died said *Gaussian said nothing*. Gaussian's
  "Running Gaussian" page gives a second form, `g16 <input-file
  >output-file`: given no job name, it reads its input from standard input
  and writes its output to standard output. A job's program may now be
  given one of its input files as what it reads (`stdin`, in `prepare`'s
  answer; `jobs.rs` opens it in the job's folder, and takes only a file
  written for that job), so Gaussian runs as `g16 <input.gjf`, its output
  the job's log - followed while it runs, as ORCA's and xTB's are - and
  `collect` says the log is the output to read.
- **Gaussian gives molecules back turned.** It works in its standard
  orientation, and that is the geometry it prints: methanol came back a
  half turn round, a molecule's results not lying as it went in.
  Results that are what came in worked out - *Optimise*, *Energy*,
  *Frequencies* - are now put down turned the way that lays each over the
  entry it was worked out from (Horn's quaternion, as a structure in 3D is
  laid over its drawing), and then as that molecule is turned on the page.
  The turn is the view's, as any molecule's is: its geometry, its
  vibrations and anything read from its output stay as the program gave
  them, and *Reset orientation* shows it as the output has it. Its room in
  the result set is made for it turned. ORCA and xTB keep the input's
  orientation, so for them it is the turn of the input, if any.
- **A Gaussian run that dies without an error** now says what it printed
  last: *Gaussian stopped without saying why, after: ...*.
- **The vibrations could not be chosen**, in a result set or in an output
  opened: their rows were neither pointed at nor chosen, and no molecule
  moved (the release 0.1.7 does both). Since the page's HTML went into the
  layer cut off where the column begins (PDF.md), which lets the pointer
  through to the canvas, what drei's Html lays flat on the screen let it
  through as well - the list, the frames chip's slider and details. It
  takes the pointer again (`PageHtml`), unless it says it does not.

Decided while building it, for the maintainer to confirm:

- **Results laid over what went in, by the view's turn**, as above -
  not by turning the coordinates, which would part them from the output
  they were read from (its vibrations, the surfaces asked of it later).
  A run shown again from *Runs* is laid over what comes in now; results
  undone and done again are shown as the output has them, the view's
  turns being no part of an undo.

Not put right here:

- **Gaussian's Frequencies fail on this Mac.** Every Freq job - Meno's,
  and one run by hand from a shell, HF/STO-3G as well as B3LYP - ends with
  exit code 1 in Link 103, straight after the frequencies are printed,
  with no error message; Opt and SP run to normal termination. It is
  Gaussian 16 B.01 under Rosetta on this Mac, not Meno. Meno marks the
  step failed and says where Gaussian stopped. Gaussian's frequencies
  need a run elsewhere (a native build, Linux).
- **ORCA's method on the chip** reads *DFT/def2-SVP*, not B3LYP: cclib
  1.9rc1 reads no functional from ORCA 6's output. The reader's to put
  right, not the step's.
- **ORCA in parallel** still needs OpenMPI (step 6, *Not yet*): with the
  cores left unset, all of a computer's go to a job, so ORCA is given
  `%pal`, and without OpenMPI it cannot run. Settings, *Calculations*,
  *Cores for each* set to 1 runs it.
- **A conformer set worked out by Gaussian** keeps each conformer in its
  standard orientation: the turn is one for the molecule, not each frame.

### Step 7: procedures and copying (2026-10-08)

Built: a workflow's sets and steps in the selection, as the drawing's
parts are - copied, cut, pasted, deleted and moved with it; procedures,
saved from a workflow's step or set, put down again from Quick Add, and
kept in Settings, *Calculations*, where they are renamed, taken away or
saved as a workspace file. How it works: ARCHITECTURE.md, *Workflows*.

Decided by the maintainer (2026-10-08), as it was built:

- **A procedure is a whole workflow**: there is no saving a part of
  one. *Save as procedure…* on any step or set saves the workflow it is
  part of.
- **Copying is as with atoms**: the selection takes sets and steps by
  the same gestures, and copy and paste carry them.
- **Procedures are kept in Settings**, listed in *Calculations*, as the
  user's abbreviations are in *Dictionary*.
- **Shared as a workspace (.meno)**: *Save as file…* writes the
  procedure as a workspace holding its sets and steps alone; opened, it
  is a workspace like any other, and *Save as procedure…* keeps it.

Decided while building it, for the maintainer to confirm:

- **A box or a lasso takes a set or a step whose middle is inside it**,
  as it takes a molecule in 3D by its centre. A set taken takes what it
  holds along when it is moved or copied, selected or not.
- **What a step did is not copied**: a pasted step is as it is set - its
  kind, who does it, its options - and has not run (its runs and their
  jobs are the step's own). A result set copied with the step that made
  it is that step's still; copied without it, it is a set like any other.
- **A running step is left out** when a selection is deleted or cut; it
  is asked about on its own, as before.
- **A procedure keeps the sets the chemist drew**, as empty frames for
  an input, **not those its steps made**: a wire from a result set is,
  in the procedure, from the step that made it. Put down, it is the
  selection, to be moved as one.
- **Quick Add offers every procedure saved**: one that needs a plugin
  not added is shown, but cannot be put down, and says what it needs.
  A wire let go on empty space offers none.

### The look, and conformers chosen on purpose (2026-10-10)

Built, as the maintainer chose from pictures (decided: 18, 19):

- **Sets**: the name and count inside the frame, along its top - the top
  drags the set; no list of entries (the frames chip says each
  conformer's energy and population); a set made from the selection is
  made round what is drawn, labels included (an OH reaches past its O); a
  result set is as large as its molecules reach, each in any of its
  frames as it is turned, with room for its frames chip below it, and no
  larger than its name needs.
- **Steps' cards**: the icons in a column of their own - what it does,
  and its state's beside its state - and no rule; what it does and how,
  whole, on two lines where it needs them. A step Meno does may say its
  options its own way (*Choose one*: *Lowest in energy*, *Number 3*).
- **Chips on the page** (*How it looks*): drawn at the page's scale -
  `--page`, set on the layer the page's HTML is drawn in each time the
  zoom changes - from where each hangs, and faded out below 75 %, with
  the sets' names and the cards' words (`utils/pageScale`).
- **Quick Add** opens where it will stay as a panel opens below its row -
  its calculations, or the field a SMILES is typed in: its side is chosen
  once, for its largest, and it is held by its top left corner, so that
  nothing in it moves as the panel grows (`quickAddPlace.ts`).
- **No *3D structure* step**: *Conformers* takes structures drawn - RDKit's
  search, in its worker, as *3D structures* on the canvas makes them (the
  first stereoisomer, where the drawing leaves one open), with the step's
  own options - and *Choose one*, Meno's, takes one conformer of each
  compound. A plugin's step says in its manifest what it takes where it
  takes less than its kind (`takes`: CREST's search starts from 3D).

Decided while building it, for the maintainer to confirm:

- **What *Choose one* ranked by** is said in its card: the conformer
  chosen, of how many, and the program and method that worked out the
  energies, as the molecule's calculation says them (*#1 of 9, lowest ·
  RDKit · MMFF94*). Chosen by its number, the energies are not used and
  not said.
- **A conformer search from a drawing runs in the plugin's worker**, as
  on the canvas, not as a job: it does not go on when Meno closes. A
  search on molecules in 3D is still a job.
- **The conformers it chose from are set aside**, kept with the set as
  any step's are: the set's count says *1 compound · 1 of 9*.

Then, of the leftovers the maintainer chose:

- **A set grows to keep a structure drawn on in it inside it** - an atom
  added past its edge, one moved on its own, one made another element -
  as part of the same edit, one step to undo (`fitSets`, settled on each
  edit of the workspace's document). A structure moved whole, and a frame
  sized anew, leave it as it is: one is dragged out of a set, and a set
  made smaller than what it holds, on purpose.
- **Sets, steps and wires fade out as they go**, as they fade in; a
  deleted one is left as it was, taking no pointer, for the fade.
- **A thin bar on a running card** fills as its jobs end, where it runs
  several (*Running · 3 of 9*). A single job's program saying how far it
  is comes where a program's documentation says how it says it.
- **CREST optimises a set of conformers in one run** (*Optimise*, `crest
  --mdopt`, as its documentation's "Ensemble Optimization" has it): the
  entries of each molecule written into one ensemble file, optimised, and
  read back from `crest_ensemble.xyz` in the order they went, each with
  its energy. GFN2-xTB, GFN1-xTB or GFN-FF, and a solvent; one method,
  not the search's two.
- **Each conformer's population, as CREST works it out**: the weight of
  each conformer's set of rotamers in the table CREGEN prints, read by the
  plugin and given back as the output form's `populations`, which a
  conformer set takes as its molecule's shares - what its chip shows -
  in place of Boltzmann's at room temperature from the energies alone.
  CREST counts a conformer's rotamers in, which Meno cannot.

Not backward compatible: a workspace or procedure saved with a *3D
structure* step opens without that step (no shim before 1.0).

## Questions

None left open (2026-10-08). The specification as a whole is for the
maintainer to read and agree before step 1 is built; what they change
is folded in here first.
