# Workflows on the page

A specification of stage 6 (WORKSPACE.md, *Stages*): calculations built as
workflows and run, on the page itself. Written on 2026-10-08 at the
maintainer's request - *a detailed UI specification before anything is
built* - and revised the same day with their answers. All seven steps of
*In order* are built, with what review changed since (*As built*,
below). Judge it against [PURPOSE.md](PURPOSE.md): a procedure that
combines several methods, expressed in a form the chemist can read,
rearrange and run again, with its results beside the molecule it is about.

A rebuild of its foundation is agreed in
[WORKFLOWS-FOUNDATION.md](WORKFLOWS-FOUNDATION.md) (2026-10-17), for the whole
range from computational chemistry to cheminformatics: values and their
types, entries with properties, collections at any size, and simple nodes of
one role each - Meno's own and the program plugins' -
wired into anything from a conformer ensemble's NMR to a ConfoTS-like search
for transition states. It is built in the PRs it lists, in order; until
each is merged, this file describes what is built.

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
5. **A set holds its members, in order**: what lies inside its frame as
   it is made; a structure moved into it joins it, one moved out leaves
   it; a frame resized takes in and lets go of what then lies inside it
   or not.
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
    may say that its program takes them all in one job (*Several at
    once*).
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
    what holds a workflow's entries is called a **set**, and the
    implementation and the interface are Meno's own.
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

No question is left open. All seven steps of *In order* are built (*As
built*).

## Words

- **Workflow** - what is wired together on one page: sets and the steps
  between them.
- **Set** - a frame on the page, and its members, in order. An *input* set
  is made by the chemist round what is there; a *result* set is made by
  a step, round what it gave.
- **Entry** - one structure in a set: a drawing, or a molecule in 3D,
  with what has been found of it (its energy, its population...).
- **Compound set** - a set whose entries are each a compound of its own:
  what a set the chemist makes holds.
- **Conformer set** - a set whose entries are conformers, grouped by the
  compound each is of (*a*, *b*...): what the flow makes, and only it.
- **Step** - one kind of calculation done to a set's entries, of a kind
  Meno defines (*Kinds of step*), filled by a plugin or by Meno.
- **Input** - where a step takes a set: a port on its card's left edge,
  one for each input its kind declares, named where there is more than
  one (*start*, *end*).
- **Exit** - what a step gives: a result set of its own, made with the
  step and standing to the right of its card, empty and *Not run yet*
  until the step runs. Every step has its first exit; a step that can set
  entries aside has a second, under it (*Outside it*, *Alike*, *The
  rest*). A step has no port that gives of its own: its exits' sets give.
- **Port** - where a wire starts or ends: a set gives from its right
  edge; a step's input takes on its card's left edge.
- **Wire** - a line from a set to a step's input.
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
  *Input*, or what a step made (*Conformers*, *Optimised*, *Within 3
  kcal/mol*) - and how many it holds (*1 structure*, *2 compounds*, *1
  compound · 81*, *1 compound · 23 of 81*). It
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
Fit (Ctrl/Cmd+1) takes them in: each set's frame and each step's card,
closed; each wire as far as it bends out past them - one going back to a
step on the left loops out either side; and what is drawn over the page
in HTML - each molecule's frames chip, which may be wider than its set,
and its notes over it (2026-10-24; components/FitToContent2D, utils/
fitExtent). A chip is as large as the page draws it at any zoom, so where
it lies now is where it lies after; the notes are drawn as large as the
page only between three quarters and half as large again, so how much of
it they take is worked out at the zoom the fit comes to. Their words, and the chips on the page, go below 75 % (*How it
looks*): a card then shows its icon and its state's icon alone, a set
its frame and what it holds.

### How it looks

As Meno's own things look (decided: 15), not as the figures here do:

- **Colours** from Meno's palette only: its greys for frames, lines and
  words; Meno's base colour (#317689, `COLORS.base`, `accel-base` in the
  styles) for what is done or chosen; the attention colour (#cd4560,
  `COLORS.attention`, `accel-accent` in the styles) for what failed; the
  canvas's own hover blue for what is under the pointer on the canvas,
  as an atom or an arrow is lit.
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
  chips. A frames chip opened by a click (2026-10-24) goes down, eased,
  to half a bond below the foot of the set its molecule is in - over none
  of the set's other molecules and their chips - and back up as it shuts;
  opened, and until it is back, it lies over all else on the page, the
  workflow's ports too, and nothing shows through it (shut, the page
  shows through a little). Its bars are named over them (*Energy above
  the lowest, each conformer*), laid on whole device pixels, each as wide
  as the next; in its line a number is never parted from its unit.
  *How it was made* (the method, seed and what was kept, as what made it
  says them) stays shut under its name until its chevron opens it,
  eased: the card keeps to what the molecule is, and leaves it in view.
  Opening and shutting, its width and its height go together - one time
  and one curve (theme/motion), each the same part of the way at every
  frame - its width known from the start, never measured as it grows.

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
   workflow. Where any of the selection lies in a set already, it shows
   none (`selectionInSet`): a port there is the set's own, not one of
   what is chosen inside it.
3. **Pull a wire out of the port.** The selection's frame stays, as an
   *Input* set; a wire follows the pointer.
   - Let go on empty space: Quick Add opens there, at the kinds of step
     that take what the set gives. A step chosen is put down there, wired.
   - Let go on one of a step's inputs: wired to it.
   - Let go where nothing takes it, or Escape: the wire goes, and the set
     stays.
4. **Or from the menu**: right-click the selection, *Use as input*.

**A set holds its members, in order** (decided; WORKFLOWS-FOUNDATION.md,
*Members are explicit*):

- made, a set holds what lies inside its frame - a structure, a molecule
  in 3D or a picture whose middle is inside it - in the order it lies
  (top to bottom, left to right);
- dragged into a set the chemist made, a structure or a molecule joins it,
  at its place in that order among the members; dragged out of any set,
  it leaves; moved within the frame, it keeps its place;
- a frame resized takes in what then lies inside it and lets go of what
  then lies outside it, as one step to undo; what joins or leaves is
  marked a moment as it does;
- deleted from the page, a member is gone from its set, with nothing
  asked; drawn on, a structure stays one member, and joined to another
  the two are one; the frame grows to keep it inside if it would reach
  past it;
- a step's result set holds what its step made, in its order, and takes
  nothing in: dragged into it, a structure stays outside the set;
- the frame is the set's own: its tab drags it, with all it holds; its
  edges and corners drag to size it;
- *Delete set* (right-click its tab) takes the frame away and leaves what
  it held; a set left empty stays, empty, until it is deleted;
- *Don't keep in the file* (right-click a result set's tab): its molecules
  and structures drawn are not written to the workspace's file - only how
  many it held and their collection's hash - and opened again, the set
  says *Not kept* with that count. This covers what the set holds now.
  The step's earlier runs, kept in the step with what each gave, are
  written as they are, whatever the set says.

A set's entries are its members, in their order. A set the chemist makes is a
**compound set**: each entry a compound of its own, however alike two
are (*Compound sets and conformer sets*).

### Kinds of step

Meno defines the kinds of step - what each takes, what it gives, and how
it is shown - so that steps join whoever fills them; plugins fill them,
each with its own options. A plugin cannot bring a kind of its own; a
new kind comes with Meno, as a new role does (PLUGINS.md, *Roles*).

| Kind | Icon (Heroicons' outline, or drawn as Quick Add's are) | Takes | Gives |
| --- | --- | --- | --- |
| Generate | sparks | nothing: no input, nothing wired in - or, where its plugin makes from seeds (CReM's), *Seeds*: structures drawn | **structures drawn**, each the SMILES the model gave, read as one pasted is - its stereo as written, what it leaves open counted on its record (`stereo_open`), never chosen - with the model's own values on its record, named (REINVENT 4's `nll` and `smiles_state`), and what made them (PLUGINS.md, *Generate*). How many and with what seed its options say. Nothing is made 3D here, nothing enumerated, nothing refused: the general steps after it do that. It is ready as it is put down, run on its options alone, and changed when they change; made from seeds, it waits for them, and each made one keeps its seed's values as the seed's (`made_from.<name>`). Its line counts what the model gave, what was made, what leaves stereo open, and what could not be read |
| Conformers | a stack of layers | structures drawn, or molecules in 3D | **a conformer set**: each compound's conformers, every one the program gives - no energy window, as a structure made 3D on the canvas has (WORKSPACE.md, *Conformers kept*); only an *Energy window* step sets any aside |
| Optimise | a trend going down | molecules in 3D | each optimised, its path as frames - the same kind of set |
| Minimise with restraints | a well, its floor held (drawn) | molecules in 3D, or conformer sets | each minimised in a force field with its restraints held - Restraints', Torsion restraints' - from where it is, or from where its restraints were first held; one that does not converge out of *Failed* (PLUGINS.md, RDKit) |
| Energy | a bolt | molecules in 3D | each with its energy at its own geometry, kept as it came (its key with it, though the program turned it), and what it carried of the calculation it came from - a Frequencies step's correction to G, its vibrations - each with its own level; one whose atoms moved fails - the same kind of set |
| Frequencies | a signal | molecules in 3D | each with its vibrations and thermal corrections - the same kind of set |
| Path search | a way over a barrier between two structures, its top the point refined (drawn) | *Start* and *End*: molecules in 3D, or conformer sets - each conformer one - each start paired with an end - in order, each with each, or matched on a property - the two the same atoms in one numbering, of one charge and spin | **molecules in 3D**: one for each pair, its frames the path its program found, its entry the highest point it refined (*Path search*, below); a pair that cannot be worked out, or whose job failed, out of its second exit, *Failed*, saying why |
| Follow the reaction path | from the top of a barrier, down both ways (drawn) | molecules in 3D: each a point to start from - a saddle point, as the chemist's *Filter* on its frequencies chose | **molecules in 3D**: one for each, its frames the path its program followed down both ways, one end to the other, its entry the point it started from (*Follow the reaction path*, below); one whose side stopped before its end, or whose job failed, out of its second exit, *Failed*, saying why |
| Optimise to a saddle point | a ball at the top of a barrier, an arrow up into it (drawn) | *Guesses*: molecules in 3D; and *Reactant side* and *Product side*, both or neither, each guess paired with one of each - in order, each with each, or matched on a property - the same atoms in one numbering, of one charge and spin | **molecules in 3D**: each guess optimised by its program towards a saddle point, its way there as frames, its last its entry (*Optimise to a saddle point*, below); one that did not converge, at the last geometry it reached, or whose job failed, out of its second exit, *Failed*, saying why |
| NCI | a cloud | molecules in 3D | each with its non-covalent interactions as a surface coloured by their strength (NCI.md) - the same kind of set |
| Render | a picture | molecules in 3D | a set of pictures: each entry a picture of its own (RENDER.md, *Render as a step*); no step takes pictures |
| Energy window | a funnel | a conformer set, with energies; or molecules, in each value of a property | those within the window of their compound's lowest, or of the lowest with their value of a property; the rest out of its second exit, *Outside it*, each saying why |
| Duplicates | two squares, one over the other | molecules in 3D | each unlike the others of its compound - or of its value of a property, across compounds - kept - alike, all atoms within 0.01 Å over its symmetries; a mirror image apart, or counted as one; the rest out of its second exit, *Alike* - the same kind of set. Entries of different charge or spin are never alike |
| Populations | bars | a conformer set, with energies | each with its Boltzmann population within its compound - each conformer counted as many times as its search found it alike, where it said (CREST's degeneracy) |
| Take frames | frames taken along a path (drawn) | molecules in 3D with frames - a path a step found, an optimisation's way down, a scan | **molecules in 3D**: the frames asked for, each a molecule of its one geometry - the highest in energy, the first, the last, its entry frame (what a set takes of it otherwise: a path's last), or the highest and as many either side - each with all its frame held (its energy, marks, properties) and the molecule and frame it came from - and, of what its molecule holds (on its entry frame), only what *Keep from its molecule* names, one name to a line, as it is: none, unless named, so that a value worked out for the molecule never reaches its frames unasked; a frame that holds one of them itself, of another value, keeps its own, the line saying so once; a name a molecule does not hold, said, with how many ("path not on 2 molecules", "pc not on any molecule") (2026-10-30); the highest of a molecule whose frames do not all have an energy refused, naming it, never the highest of those that do; of frames equally high the first taken, the step's line naming them all - nothing chosen silently (`workflow/takeFrames.ts`) |
| As conformers | shapes grouped | a compound set of molecules in 3D | **a conformer set**: entries of the same constitution - the same atoms, bonded the same way, of the same charge and spin - and the same stereoisomer, read from each one's own geometry before it runs (an entry whose stereoisomer is not known - not asked, not perceived, or left unspecified - refuses it, saying which: constitution alone would sum diastereomers), as conformers of one compound; only where each compound's entries come from one calculation, with energies from one source and the same stereo labels, else not at all and why (one list of energies at two levels means nothing). What its entries keep - the drawing each was made from, how - goes with the compound only where all keep it alike |
| Filter | sliders | molecules in 3D, or a conformer set | those whose properties meet its conditions - each a property, a comparison and a value with its unit, or another of its properties ("its product"); all of them, or any; the rest out of its second exit, *The rest*, each saying why - one with no value for a property named, that it has none (*Filter*, below) |
| Rank | a numbered list | molecules in 3D, or a conformer set | the first N by a value they carry - lowest or highest first - in each group, in each value of a property (*path*, *species*), or of all together; the rest out of its second exit, *The rest*, each saying its place, or why it was not ranked (*Rank*, below) |
| Choose one | a pointer choosing | a conformer set | **a compound set**: one conformer of each compound - its lowest in energy, or one by its number; the rest out of its second exit, *The rest* - a conformer set |
| Check structures | a funnel | structures drawn | each kept as drawn - never one changed - or set aside out of its second exit, *Set aside*, saying why: more than one part (a salt, a mixture), an atom with more bonds than it can have, a part with no electrons (H+), a radical; each looked for unless the step's options keep it |
| Stereoisomers | two squares, one over the other | structures drawn | each that leaves stereo open as every stereoisomer of it that can be made in 3D, each a drawing - a C=N whose E/Z is none of its own never enumerated, and said so on each one's record (*C=N double bonds whose E/Z is none of their own*); one with nothing open, or nothing that could go more than one way (a bridgehead its rings fix), as drawn; set aside out of its second exit, *Set aside*, saying why: an allene's axis left open, more than 32 stereoisomers (whole, never some of them: counted only as far as 33, saying the most its open stereo could give), one that takes more than 30 s to look at (alone, the rest as they are), or - as the option says - all that leave stereo open |
| Descriptors | bars | structures drawn | each as drawn, with numbers worked out of it on its record (*A structure drawn's record*), each its unit and how: RDKit's average molecular weight (`mw`, g/mol), Wildman-Crippen logP (`logp`), topological polar surface area (`tpsa`, Å²), hydrogen-bond donors and acceptors (`hbd`, `hba`) and strict rotatable bonds (`rotatable`) - a lone atom or ion (Na+, Cl-) without its logP, which is defined for none, saying so (`not_given`: "logp: not defined for a lone ion"); one RDKit cannot make sense of set aside out of *Set aside*, saying why |
| Tag | a tag | molecules in 3D, or a conformer set | each the same, with an ID of its own - *start-1*, *start-2* - under the name given, which rides along with every entry made from it, so that two inputs are matched on it later (STRUCTURE-STEPS.md); no name, it does not run; a name the entries carry already is refused |
| Species | a plus in a circle | molecules in 3D, or a conformer set | each with the charge and multiplicity given - one left blank as the entry has it - its energy and calculation, of another state, gone; one whose electrons cannot have them out of its second exit, *Failed*, saying why (STRUCTURE-STEPS.md, *Species*) |
| Combine | a link | molecules in 3D | **one molecule**: the entries, in the set's order, as one complex, each part where it stands; none of a part's properties carried, each named (STRUCTURE-STEPS.md, *Combine*) |
| Measure | arrows apart | molecules in 3D, or a conformer set; and, where wanted, *Atoms*: a table | each the same, with each distance, angle or dihedral asked for as a property - its atoms typed counted from 1, as the card and the 3D view show them, or each row's of the table wired into *Atoms*, its columns saying how they count them (STRUCTURE-STEPS.md, *Measure*) |
| Merge | two lists made one (drawn) | *First* and *Second*: molecules in 3D, or conformer sets - both of one kind | **the same kind of set**: First's entries, then Second's - all, or one of each value of a property - a conformer set's compounds kept apart; those set aside out of *The rest*, each naming the one kept (STRUCTURE-STEPS.md, *Merge*) |
| Re-bond | atoms, then the same atoms bonded (drawn) | *Geometry* and *Bonding*: molecules in 3D, or conformer sets | each geometry with a bonding entry's bonds and charges - each with each, or matched on a property - grouped by the two; one of other atoms, or with none to pair with, out of *Not re-bonded*, saying why (STRUCTURE-STEPS.md, *Re-bond*) |
| Restraints | atoms held to a wall (drawn) | molecules in 3D, or conformer sets | the same, each with its restraints from itself - coordination bonds at a factor of their van der Waals radii together (Alvarez 2013), pairs kept at their distance, atoms fixed - one it cannot have them out of *Failed*, saying why (STRUCTURE-STEPS.md, *Restraints*) |
| Torsion restraints | four atoms anti, held (drawn) | *Molecules* and *Reference*: molecules in 3D, or conformer sets | each torsion trans across the reference's double bonds and not trans in the entry held at 180°, stronger by a step each time, out of *Restrained*; those trans already out of *Trans already* (STRUCTURE-STEPS.md, *Torsion restraints*) |
| Compare bonding | a chain and its reference, equal (drawn) | *Molecules* and *Reference*: molecules in 3D, or conformer sets | those bonded as their reference out of *Same* - against each reference, the match written on it, or matched on a property - the rest out of *Different*, with their differences, or why they were not compared; bonds read within a reach of the covalent radii, 1.2 times unless set (STRUCTURE-STEPS.md, *Compare bonding*) |
| Join | two tables, a row of each linked (drawn) | *Onto* and *From*: molecules in 3D, or conformer sets | *Onto*'s entries, each with properties of *From*'s put on - matched on a property both carry (an ID a Tag gave), each record as it was, under its own name or one given ("species as first end") - out of *Joined*; those with nothing put on out of *Not joined*, saying why (*Join*, below) |
| Barrier | a barrier's height above its start, measured (drawn) | *Saddle points* and *Starts*: molecules in 3D, or conformer sets - each conformer one - each saddle point paired with a start - in order, each with each, or matched on a property | **molecules in 3D**: each saddle point with its `barrier`, in kcal/mol, of its free energy G (by default) or its electronic energy E above its start's, out of *With barriers*; one it cannot give one, out of *Failed*, saying why (*Barrier*, below) |
| Number | a number typed in a field (drawn) | nothing | **a number** with its unit and what worked it out: the standard-state term, 1 atm to 1 mol/L, at its temperature, by its formula - or one typed (*Add and Number*, below) |
| Add | two values summed (drawn) | *Molecules*: molecules in 3D, or conformer sets; *Number*, where wanted: a number | each entry with the sum of the values named - each of its own geometry, at one temperature and pressure - and the number wired in, written under the name given, each part as it was; those it cannot be worked out for out of *Not added*, saying why (*Add and Number*, below) |
| Atom map | an atom, an arrow, the same atom after it, mapped (drawn) | *Molecules* and *Reference*: molecules in 3D with every hydrogen, each input's entries each a side of its own or one side together; whether bonds may change (a reaction) or stay the same (conformers of the reference) | **the same kind**: each side in the reference's numbering, atom for atom - by its first map, or by every map - out of *Mapped*; one that does not map one to one, or changes a bond that was to stay the same, out of *Not mapped*, saying why; the bonds each map forms, breaks or changes in order, **a table**, out of *Bond changes* (STRUCTURE-STEPS.md, *Atom map*) |
| Displace | an atom moved along, where it stood dashed (drawn) | molecules in 3D with vibrations, or a conformer set | **the same kind of set**: each geometry moved along its imaginary vibration - or one by number - the atom moving most by the amplitude (Å) given; one with no such vibration out of *Not displaced*, saying why (STRUCTURE-STEPS.md, *Displace*) |
| Ensemble energy | levels made one (drawn) | molecules in 3D, or conformer sets | each group's free energy over its members, -RT ln Σ g exp(-G/RT) at the temperature they state, written on its lowest; the others out of *The rest*, each saying whose ensemble it is in (*Ensemble energy*, below) |

The first six run a program; the next six work on a set's entries
alone (*Who does a step*); the three after them are a plugin's (RDKit's), done
at once in its worker on structures drawn (PLUGINS.md, *steps on
structures drawn*), each with its own options: they change no atom or
bond of a structure they keep, and choose nothing for one. Those from Tag on
are Meno's own on structures (STRUCTURE-STEPS.md), on a set's entries
alone, and no plugin fills them. A step that keeps a set keeps its kind: a
conformer set optimised is still one. A plugin's step may take less than
its kind (PLUGINS.md, `takes`): CREST's *Conformers* starts from
molecules in 3D only. A lone atom - the ion of a salt drawn as ions -
has no conformers to find and nothing to optimise: the xTB, CREST, ORCA
and Gaussian plugins work out its energy where it is instead, and it comes back where it was - in *Conformers*,
its only conformer. More kinds come with Meno as they are needed - a
free energy from an energy and its corrections, a template input written
out - each specified before it is built. *Enumerate*, Meno's own, is
specified and not yet built: structures made from one drawing by rule,
such as each R group given a list of groups, in 2D, every combination
numbered and any not made set aside with its reason
(WORKFLOWS-FOUNDATION.md, *Enumerate*). It is not *Generate*, which a
plugin's program or model fills.

### Path search

*Path search* (2026-10-27) finds a path between two structures of the same
atoms in one numbering, and refines its highest point. ORCA's plugin fills
it with NEB-TS (the ORCA 6.1 manual, *Nudged Elastic Band Method*,
https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/neb.html),
at GFN2-xTB by default - ORCA's own (NATIVE-XTB2), or through the xTB
plugin's xtb (XTB2; PLUGINS.md, `needs`), the one level either way. It
runs NEB-TS alone (one role to a step, 2026-10-27): the point's frequencies
are a *Frequencies* step's, wired after it.

- **Its options** (ORCA's plugin; the ORCA 6.1 manual, *Nudged Elastic Band
  Method*): the method and basis set; *Path*, a band with its highest point
  refined (NEB-TS), or a band, a finer one about its highest point, that
  refined (ZOOM-NEB-TS, 4.5.12); *Images between the ends*, ORCA's NImages,
  8 unless said (4.5.16); and the steps refining its highest point, the
  `%geom` block's MaxIter (4.5.13), ORCA's own unless said. Each is the
  chemist's to change on the card.
- **Pairs.** Each start is paired with an end as the step's *Pairs* says:
  *In order* (the k-th with the k-th; other numbers refused), *Each with
  each*, or *Matched on* a property typed, an ID a *Tag* gave. A start with
  no end to match, a pair of other atoms or another order of them, or of
  another charge or spin, goes out of *Failed* with why; only the rest are
  sent. Ends in one numbering come today from a drawn reaction: its arrow's
  *Atom map*, then *Export reaction in 3D…*, which writes the products in
  the reactants' numbering - opened, then optimised. A conformer set into
  either is its conformers, each one start or end (2026-10-30): a
  reactant's conformers, each paired with the product made from it,
  matched on a *Tag*'s ID. *Each with each* makes at most as many pairs as
  *At most* says - 10 unless changed, so that one option does not start a
  job for every pair of two large sets (two of 29 conformers make 841). A
  Diels-Alder pair's NEB-TS at ORCA's own GFN2-xTB, on one core
  (2026-10-30), took 8 to 10 min for ends about 3 Å apart, and 29 to 132
  min (median about 55) for ends 3.5 to 7.8 Å apart, as optimised starts
  are: so 10 pairs are about a night of one core (1.5 to 22 hours). Past
  it, nothing is run, and the step says how many it would make; pairs
  matched on a property are as many as the starts, and not limited. Each
  path keeps how its start and end were paired (`path.paired`: "in order,
  by place: start a #2 with end b #2", "each with each", "matched on pc"),
  and where a conformer set was paired in order the step's line says so
  ("paired in order, by place"): pairs by place are never a match of which
  is which. A start that carried a `path.paired` already, an earlier
  path's, has it replaced by this one's, and the line counts them ("the
  path.paired a pair carried replaced"), as *Atom map* says of
  `map.entry`.
- **Its ends minima at its own level.** A barrier from a path's start is
  one only where that start is a minimum at the level the path is worked
  out at (2026-10-28). So each start and end must be a converged
  optimisation, the two at one level (method, basis set, solvation), or
  the pair is refused, naming them - the chemist wires *Optimise* at the
  path's level before it; Meno never optimises them unasked. And the
  path's own level, as its output says it, must be its ends': else that
  pair fails, naming both. A tight-binding method is named as the xtb
  program names it, whichever runs it, so ORCA's NATIVE-XTB2 and XTB2 and
  the xTB plugin's GFN2 are one level.
- **A tight-binding level alone, for now** (2026-10-29). The ends' level is
  told by their method, basis set and solvation, not by their dispersion
  correction: ends optimised with D3BJ and a path without it would pass as
  one level. So ORCA's plugin runs a path search at a tight-binding method
  alone (NATIVE-XTB2, XTB2 and the like), refusing any other in plain words,
  and refuses a dispersion correction or a solvation in its method or *More
  keywords* (D3BJ, D4, CPCM, SMD, ALPB and their kin): the path takes neither
  until the ends' level can say them.
- **One molecule for each pair.** Its frames are the path, in the order its
  program gives them: its images, and the highest point it refined where it
  puts it (ORCA's PATH SUMMARY order). Each frame has its energy and says
  what it is: "NEB image 3 of 10", or "highest point refined". Its entry
  frame - what a set, and the next step, takes of it - is the point refined.
- **One frame of it.** The point refined, taken alone, carries the run's
  calculation, and of what the frames say, its own word alone ("highest
  point refined"). So a molecule made of it after - by *Duplicates* onwards,
  or a set's table row put on the page - is one of one frame, its
  calculation that frame's: a step after that one still has it, and it is
  saved and opened again with nothing left out. Another frame of the path
  taken alone (*Take frames*, a table's row) carries its own word and none
  of the point refined's calculation: no imaginary frequency of its.
- **Barriers.** On the point refined, Meno works out from the energies
  printed `path.E-barrier` (its energy less the path's start's, its first
  image, of the same run) and `path.E-reverse-barrier` (less its end's, its
  last image), in kcal/mol - E in their names, as electronic energies'
  differences - each saying so in its `by`: electronic, at which level,
  and from which end. Its frames' chip says a frame's energy so too: "ΔE
  6.75 kcal/mol from its start". Neither is mixed with a free energy: no free-energy barrier
  is given, the symmetry a program takes for each structure's free energy
  being its own (2026-10-28). A path's start is the structure given - a
  complex of the two that react, say - not the reactants apart.
- **How far it went.** Its molecule says how many iterations each part of
  the run took, as ORCA counts them ("NEB 5 · TS optimization 4"). A band
  that did not converge in the iterations ORCA allows is not read: that
  pair goes out of *Failed*, *not converged*, saying so and after how many
  iterations. An image whose SCF did not converge while ORCA carried on with the band is
  a warning on the molecule, in ORCA's words; it moves nothing.
- **Its highest point not refined.** Where the band converged but
  refining its highest point took the most steps ORCA allows (ORCA: "The
  optimization did not converge but reached the maximum number of
  optimization cycles"), nothing of the run is read - no point refined,
  no entry: that pair goes out of *Failed*, *not converged*, saying how
  many iterations the band took and how many steps the refining, and to
  raise *Steps for refining its highest point* or give ends nearer the
  path (2026-10-30). However ORCA's run ends after it, it is said so.
- **Frequencies, after it.** A *Frequencies* step wired after it works out
  the point refined's: its `imaginary`, `imaginary.first` and
  `imaginary.second` are then the chemist's to select on with *Filter*
  ("imaginary = 1").
- **Meno judges nothing.** It calls no structure a saddle point or a
  transition state: the exit is *Refined structures*, each frame what was
  done to it.
- **Take frames** takes a path search's point refined as its *highest*,
  whatever image stands higher, and says so; its ends and the images beside
  them as they are.
- **What it does not catch.** The numbering is checked atom by atom, by
  element alone: ends numbered otherwise but with the same elements in the
  same places (two hydrogens swapped, say) pass, and the path found is
  then between other atoms than meant. An *Atom map* step before it writes
  the products in the reactants' numbering.

### Follow the reaction path

*Follow the reaction path* (2026-10-29) follows the reaction path down
both ways from each point given, as its program does it (the IRC), and
nothing else: the ends' optimisation and what they are - *Take frames*'
*first* and *last*, *Optimise*, *Compare bonding* - are steps of their own
after it. Meno calls none of it a saddle point or a minimum.

- **Its ends keep what the point was named only where asked.** *Take
  frames*' *Keep from its molecule* names what each end takes from the
  path's molecule - the names Tag gave the point (*path*, *species*) - so
  that *Join* can put what the ends are back on the point, matched on
  them. Nothing else of the point - its frequencies, its free energy -
  goes with its ends.

- **One molecule for each point.** Its frames are the path, one end to the
  other, in the order its program gives them, each with its energy and
  saying what it is ("backward, step 3 of 7", "the point it started
  from"). Its entry frame, which a set and the next step take, is the
  point it started from.
- **A side that stopped before its end** - its program's iteration cap
  reached - leaves the path as far as it came out of *Failed*, in its
  program's words: that end is no minimum. *Take frames* on *Failed*, and
  an *Optimise*, carry on from it where the chemist wires them.
- **At its start's level.** A saddle point at one level is no stationary
  point at another, so the path's own level, as its output says it, must be
  the one its start was found at (its frequencies', say): else it fails,
  naming both. The step has no level of its own unless set: the chemist
  sets the start's.
- **ORCA's plugin** runs IRC (the ORCA 6.1 manual, 4.4 *Intrinsic Reaction
  Coordinate*), both ways in one job, the manual's default direction, at
  the method and basis set given. *Steps each way* is its `%irc` MaxIter, ORCA's
  own unless said (ORCA 6.1.1 prints 20).
  The first Hessian is ORCA's: computed where none comes with the point.

### Optimise to a saddle point

*Optimise to a saddle point* (2026-10-29) optimises each guess towards a
saddle point with its program, and does nothing else (one role to a step):
its frequencies are a *Frequencies* step's, wired after it, and the
chemist's *Filter* on `imaginary` decides what is one. Meno calls none of
them a saddle point.

- **Guesses**, and **sides**, both or neither. Where *Reactant side* and
  *Product side* are wired, each guess is paired with one of each as the
  step's *Pairs* says - in order, each with each, or matched on a property
  (a *Tag*'s *path*, say) - for a program that takes them (a search from
  three structures). A side must be the guess's atoms in one numbering, of
  one charge and spin, or that guess goes out of *Failed* saying why; a
  side need be no optimisation, at no level. One side wired without the
  other runs nothing, saying so.
- **What it gives.** Each guess optimised, its way there as frames, its last
  geometry its entry. One that did not converge goes out of *Failed* at the
  last geometry it reached, for a run again to start from.
- **What it gives** is never passed on as converged where its reader could
  not say whether it converged: that guess goes out of *Failed*, saying so.
- **ORCA's plugin** runs OptTS (the ORCA 6.1 manual, *Transition State
  Searches*), at the method and basis set given: the step has no level of
  its own unless set. Its *First Hessian* is computed
  at the start (`Calc_Hess`), "the most straightforward option" (4.3.2.1),
  or ORCA's model one. At ORCA's own xTB, which has no analytic Hessian,
  ORCA computes it numerically, and the step's line says so. ORCA's OptTS
  takes no sides: wired, the step is refused.

### Barrier

*Barrier* (2026-10-30), Meno's own, writes on each saddle point its height
above its start (case F, steps 31, 45 and 46): the free energy G by
default, the electronic energy E where *Of* says so. It is one of a
chain's steps, and does that alone: which start is a saddle point's is
said by what the chain did before it - a reaction path followed down, its
ends optimised, each named by *Compare bonding* - and the two are paired
on it.

- **Two inputs**: *Saddle points* and *Starts*, molecules in 3D or
  conformer sets - each conformer one - paired as *Path search* pairs its
  ends (*Pairs*: in order, each with each, or
  matched on a property, a *Tag*'s ID). Each pair gives the saddle point
  again, with its barrier.
- **A pair is worked out only where both stand as results**, else the
  saddle point goes out of *Failed* saying why:
  - the saddle point a converged one - an optimisation to a saddle point,
    or *Path search*'s point refined (`converged`, the entry record) - with
    one imaginary frequency; the start a converged optimisation, and, for
    G, with none: a free energy leaves out what is imaginary, so a start
    with an imaginary frequency gives no G barrier. An E barrier from it is
    given, and says it ("its start has 1 imaginary frequency");
  - the two the same atoms in one numbering, of one charge and spin;
  - their values at one level, temperature, pressure, solvent and
    treatment of low vibrations, as each says it (lib/nodes `workedOutAs`),
    the level said;
  - for G, the rotational symmetry number each was worked out with read -
    the program's, in its value's record (`by.symmetryNumber`). One not
    read cannot be told, and is refused. Two that differ are kept, since it
    is so of the two molecules, and both are said, each with its point
    group and sigma as read (an ammonia inversion's saddle point: D3h,
    sigma 6).
- **Rotational symmetry**, for G: *As each program read it* (the default),
  or *Left out (σ = 1 on both sides)* - each side's RT ln sigma taken off
  its G by Meno, at the temperature its G was worked out at, and its
  record says so. Which point group is found depends on the tolerance it
  is looked for with, not on the structure alone, and a sigma of 3 rather
  than 1 moves a barrier by RT ln 3 (0.65 kcal/mol at 298.15 K). Left
  out, the barrier does not depend on which point group each side was
  read in. Neither is chosen for the chemist: the default is each
  program's word.
- **G summed of parts** - *Add*'s: a single point's energy, a thermal
  correction at a lower level, a standard state - is named in *G is* in
  place of `thermo.free-energy`. The two sides must be sums of the same
  parts, in order, each worked out alike, and each thermal part with its
  sigma read: a standard state on one side alone is refused, never
  mixed. A sum none of whose parts is a calculation's thermochemistry has
  no sigma to read, and is refused for G - as read or left out.
- **What it gives**: `barrier`, in kcal/mol, the saddle point's value less
  its start's, the hartree at CODATA 2018's value (627.5094740631 kcal/mol,
  lib/units), at the saddle point's geometry, temperature and pressure;
  its record says which it is ("free energy G (thermo.free-energy;
  quasi-RRHO (Grimme), 100 cm⁻¹): the saddle point's less its start a #1's;
  point group and rotational symmetry number: D3h, σ 6 (saddle point), Cs,
  σ 1 (start)"). The step's line: "ΔG‡ 6.16 kcal/mol (G at GFN2-xTB,
  298.15 K)".
- **Solvation, as each side's output said it** (2026-10-31): the two
  sides must say the same - a model with its solvent, or "none", the gas
  phase - and one that says it with one that does not is refused. Two
  that both leave it unsaid are taken, and the barrier's record says
  "solvation not stated", so that no match of two unsaid is silent; a sum's
  record (*Add*) says it of each part that leaves it unsaid.
- **What it is not.** A barrier from separate reactants - a sum of two
  molecules' G, each at its own standard state - is not this step's: its
  start is one molecule, the complex the path began from, as case F's
  example is. Only the forward barrier: the one from a path's other end
  is a second Barrier step, with the ends as its starts.

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

- **Quick Add keeps its ten** - bond, chain, SMILES, text, reaction
  arrow, "+", electron-pushing arrow, slide, pen, shapes (`QuickAdd.tsx`)
  - and gains **one button**: *Calculations*, a small graph of two joined
  sets, after a thin rule.
- **Pressed, it opens** a panel below the row, a line for each plugin
  added that does steps - those that run a program first - then Meno:
  its name, and the kinds of calculation it does, each an icon, named on
  hover (decided: 16). *As conformers* is not among Meno's: it is
  reached from a compound set's port, its wire let go on empty space - a
  conversion taken on purpose.
- **Only what is added is there.** With no plugin added, the panel shows
  Meno's line alone; nothing is shown of plugins not added.
- **A wire let go on an input that does not take it** is not made, and
  the step's card says why where its state is: "It takes a conformer set,
  not molecules in 3D" (2026-10-22). It says so until a wire is drawn
  again. A conformer set of one conformer is a conformer set all the
  same, and goes where conformer sets go (the maintainer, 2026-10-21).
  A set mixing conformer sets with other molecules in 3D goes into no
  step - a scan's frames are not conformers, nor a conformer set's
  conformers compounds - and the card names those that are no conformer
  set ("It mixes conformer sets with other molecules in 3D: scan.log is
  no conformer set"), at the wire or, where one came into the set after
  it was wired, at its run.
- **A wire let go on empty space** opens Quick Add already at
  *Calculations*, showing only the kinds that take what the wire
  carries - and a plugin only where it does one of them.

### Wires

- **Drawn** from a set's port to a step's input, or the other way: a
  press on a port and a drag. While it is drawn, the inputs that would
  take it are lit in the base colour; the others stay as they are. A
  step's exit is a set: a wire is drawn on from it before the step has
  run, what it will give being what the step's kind makes of what comes
  in.
- **What may join**: what a set gives to an input that takes it (*Kinds of
  step*). Nothing is converted on the way: a set of structures does not
  go into *Optimise* - *Conformers* and *Choose one* go between, on the
  page;
  a compound set does not go into *Populations* - *As conformers* goes
  between, or a *Conformers* step.
- **One set may feed several steps**; an input takes one wire. A wire
  drawn to an input that has one replaces it.
- **Deleted** by Delete or Backspace with the pointer on it, or its menu;
  dragging its end off a port and letting go on nothing deletes it too.

### Its options

![A step's options](workflows/4-options.svg)

A click on a step opens it, in place, to its options - as a molecule's
frames chip opens to its slider:

- what it does: another of the kinds of calculation its plugin does,
  where it does more than one (*Calculation*; *Who does a step*) - the
  options the two share kept as they were;
- the plugin's own options, drawn in Meno's general form (`lib/options`,
  as Export draws a writer's): for xTB, its method (GFN2-xTB, GFN1-xTB,
  GFN-FF), solvent, optimisation level; for *Energy window*, the window
  (3 kcal/mol) - or *No options*;
- its runs, where it has more than one: each when, and what it said,
  with *Show* to put its results back on the page (*Results*).

The charge and the unpaired electrons are not on the card: each entry's
are read as Export reads them (`pluginEntry`), and given with it. *Show
log* and *Show files* are on the step's menu (right-click), once it has
run.

A double-click on its card closes it, as do its *Close* and Escape; it never closes by itself (the maintainer, 2026-10-28): a single click on it again leaves it open, and a press elsewhere, a zoom, the selection changing, or a run starting or ending do not close it - the page is worked on (panned, zoomed, other cards opened) while its options stay open (2026-10-14). A double-click on a closed card opens it and leaves it open (workflow/cardOpen). Zoomed out where its words are too small to read, its options stay open, each line of their words a grey bar where it lies, as a text's words are (workflow/TextBars), and nothing in them can be pressed until they are read again. The
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
  - **but an optimisation's or a relaxed scan's steps are no entries**
    (2026-10-22). Of a calculation's output that optimised, only the
    geometries the run converged on are entries: an optimisation's last,
    a relaxed scan's each point - as the program marks them, read by its
    plugin (cclib's `optstatus`). The steps on the way stay frames, to be
    looked at, never entries: before, a scan of 3 points opened as 21
    compounds, each with an energy, and a conformer set weighted geometries
    that were no minimum of anything. A point the run never converged on
    is an entry marked failed, not converged (*Failed*): an optimisation
    that never converged - one stopped at its first geometry too - gives
    its last geometry so, and says *Not converged* over it; a run stopped
    before its last point converged - an interrupted scan - gives the
    points it did, and that last one so, and says *Last point not
    converged*. It is seen and carried on, and never weighed: *Energy
    window* and *Populations* refuse it, saying why (2026-10-23; from
    2026-10-22 until then, it was no entry). Over each it says how many of its frames are entries: "4
    of 21 frames are entries (converged points)".
    A point worked out once more is one entry, not two: a Gaussian *opt
    freq*'s Freq link gives the converged point again, the same geometry to
    the last digit and the same SCF energy, marked new and done. Where the
    file says just that - that link's route optimising nothing - the
    link's point is the entry, the frequencies its own, and the one before
    it a frame: "1 of 6 frames is an entry (the converged one)"
    (2026-10-30). Anything else is left as marked.
    (A step's own optimisation was already one entry, its path: *Results*.)
  - **What is not known to be found is no entry either: never every
    geometry for want of a mark** (the review desk, 2026-10-22). Which
    are entries fails closed. No entry, and why, said over it as "No frame
    is an entry (...)":
    - a run that **ended with an error**, or **did not come to its end**
      (cut short, still running), where the program marks none - a single
      point too ("the run ended with an error", "the run did not come to
      its end"). A run that marks the points it converged on before it
      stopped keeps those, as above;
    - the points of a **rigid scan** or a **reaction path** ("points of a
      scan or a reaction path");
    - other geometries, more than one, none marked - an optimisation whose
      marks cannot be matched to its geometries, a dynamics run - and
      marks that are not one to each geometry ("convergence not stated in
      this file");
    - an XYZ file a program writes of an **optimisation's steps**, as its
      plugin knows it (`xyzSteps`) - by its name (xtb's `xtbopt.log`,
      ORCA's `*_trj.xyz`) or, renamed, by what each frame's comment line
      says: which converged is said in the program's output, not there
      ("convergence not stated in this file");
    - a workspace whose record of which are entries does not read ("which
      are could not be read").

    A geometry that does not read is left out with its own mark; each
    other keeps its own. A frame of one of these made a molecule of its
    own (a value set on it) keeps its being no entry, and why: it is that
    geometry. Left as before, every frame an entry: XYZ files that are
    ensembles by nature - a conformer search's (`crest_conformers.xyz`), a
    relaxed scan's converged points (ORCA's `.allxyz`) - and any file no
    plugin names as an optimisation's steps.
- **Steps work entry by entry**, or compound by compound where the kind
  says so: *Optimise* each entry; *Energy window* and *Populations*
  within each compound of a conformer set.
- **What a step sets aside goes out of its second exit**, a set of its
  own under the first, in plain view - never dropped, and never hidden:
  its count says how many it holds, and it can be wired on like any set.
  What the two exits hold adds up to what came in. A window made wider
  brings entries back from it on the next run. Its entries are the kind
  of set the exit says: *Choose one*'s rest, the conformers not chosen,
  is a conformer set still.
- **On the page**, a conformer set's compound is shown as one molecule in
  3D with its conformers as frames - the conformer set Meno draws today,
  its chip saying the entry, its energy and population; entries set aside
  are not among its frames - they are in the second exit's set. A compound set's entries are separate
  molecules, each its own.
- **A set's count says what it holds**: a compound set of molecules in
  3D, its compounds (*2 compounds*); a conformer set, its compounds and
  its conformers (*2 compounds · 81*); structures drawn, or a
  Render step's pictures, how many (*3 structures*, *9 pictures*); a set
  with nothing in it, *Empty*; a step's exit whose step has not run, *Not
  run yet*. Its name is *Input* where the chemist made it, a second exit's
  its own (*Alike*), else what its step made, as its kind says it - an option's value in
  it where the kind says one (*Within 3 kcal/mol*, *Populations at
  298.15 K*). Structures placed from coordinates in a text make a set named
  for where they came from - the PDF's name and its page or pages
  (*made-up-si.pdf, p. 2*), the text's name, or *Pasted structures*
  (docs/FILE-IO.md, *Coordinates in a text*; 2026-10-15). Two clicks on a
  chemist's set's name change it, Enter keeping the new one and Escape the
  old; emptied, it is *Input* again. A step's set is named for its step.

## Running

### Starting and stopping

| From | What |
| --- | --- |
| A step's menu (right-click) | *Run* - this step, and first any step before it that has not run, has changed, failed or stopped, however far back, and every step on a way from one of those to this one; a step done on no such way is not run, however near - of a step of two inputs, the side done is left as it is |
| | *Run from here* - this step and every step after it |
| | *Stop* - while it is waiting or running |
| | *Show log*, *Show files*, *Options…*, *Delete step* |
| | *Don't keep raw outputs* - a step a plugin does: its jobs' files kept in the workspace's file are what they were given, what Meno read back and their logs (docs/FILE-IO.md, *A step's jobs*) |
| The menu on empty space | *Run all* - every step on the page that is not done - not run, changed, failed or stopped - and every step after one, in order; no other |
| | *Stop all* - while any runs |

No key starts a run (decided: menus, at first). Steps run in the order
their wires give; steps that do not depend on one another may run at
once (*Several at once*).

**An empty set** (2026-10-30). A step before it that ran well may give
nothing this time: a branch that took none, a last round of restraints
that held none. A step whose input is such a set ends at once, done, and
says what came in empty - its exits empty, nothing an earlier run put in
them left there (its molecules, a chart, a table, pictures), that run
kept among its runs: *Nothing came in*, or, of a
step of several inputs, which - *Nothing came into Molecules*, *Nothing
came into First and Second*. No job is started and no plugin asked, and
every step after it goes on the same way, so a chain of rounds runs to
its end however many rounds had nothing left to do. A step still fails
where its empty input is a set no step gave (one drawn by hand), or
where the step before it failed. A Merge whose other input is not empty
is not ended so: it takes that one's entries, as a Merge does, and the
rounds' rests merged with the last round's empty restraints are the
rests.

### States

![A step's states](workflows/5-states.svg)

| State | Icon and colour | What the card says |
| --- | --- | --- |
| Ready | none, grey words | *Ready* |
| Waiting | a clock, grey | *Waiting · 2nd* - its place in the queue |
| Running | turning, the base colour | *Running 1:12*, or *Running · 7 of 81*; the log's last line under it; a thin bar where the program says how far it is |
| Done | a tick, the base colour | *2:03 · E −42.108710 Eh* (its electronic energy), or *81 of 81*, or *23 kept* - how long, and the number the step is for |
| Failed | an exclamation mark, the attention colour | *Failed* - and the line of the log that says why, where nothing was done. Where some entries were, the step is done: *78 of 81 · 3 of 81 failed (2: not converged; 1: refused)* |
| Stopped | a stop, grey | *Stopped after 0:31* |
| Changed | turning arrows, grey | *Changed · run again* - its options, or what comes into it (its atoms with their charges, radicals and isotopes, their places, its frames), changed since its run; its results stay as they are |

### The log

*Show log* opens the job's log in the workspace's column of texts (PR
#172), updating while the job runs - its last lines kept in view unless
the chemist scrolled up. A step's log is one text, *Optimise log*,
however many jobs it ran (the maintainer, 2026-10-28: a tab for each of
many jobs filled the column). Of several, it shows the first, and a
compact chooser in the column's header - *Job 2 of 12 · failed* -
shows another in its place, followed while it runs; the jobs and the one
shown are kept with the workspace (`TextOf.jobs`, `job`). Run again, it
shows the first of its new jobs. A log is a text of the workspace like
any other,
but with no sheet on the page: its step is its body, and it rises out of
the step's card into the column, and goes back into it as the column
shuts (docs/PDF.md, step 5).

### Results

![A step's results and its log](workflows/6-results.svg)

When a run is done, what it gave comes in as a result set to the right
of the step, wired from it (decided). Its molecules lie in rows, left to
right, each row as wide as the set's molecules need to lie about a
window's shape, 3 : 2 wide to tall - but never narrower than twelve bonds
- so that fitted to the view many read at a glance as a grid, not as a
column one molecule wide (2026-10-22). Two or three lie in one row as
before; from about five of a usual size, the set takes that shape. A set's ports
are reachable whatever lies over them on the page - a molecule's chip
beside its edge - being drawn over all of it.

- **Optimise**: each entry as optimised, its path as frames, the energy
  of each frame - what an optimisation read from a file shows today;
- **Conformers**: a conformer set - each compound's conformers, as its
  entries (*Compound sets and conformer sets*);
- **Energy**, **Frequencies**: the entries, each with its energy, or its
  vibrations and thermal corrections;
- **Energy window**, **Duplicates**: the entries kept out of the first
  exit, the rest out of the second;
- **Populations**: the same entries, with their populations;
- where compounds have one conformer each, so that a window or shares
  over them do nothing, *Energy window* and *Populations* say so after
  their line: "2 of 2 kept, on electronic energies · each compound has
  one conformer", or "1 compound has one conformer" where others have
  more (2026-10-22);
- **Which energy** *Energy window* and *Populations* are on (2026-10-24):
  the free energy G where every entry has one and each compound's were
  worked out alike - the same temperature, pressure, solvent, program,
  method, basis and thermal treatment - and, for *Populations*, at the
  temperature it is asked; else the electronic energy. The line says
  which: "3 of 5 kept, on free energies (G, 298.15 K)", "1 compound at
  298.15 K, from free energies (G)"; where any entry had a G but it was
  not taken, why not: "from electronic energies (not free energies: a #2
  has none)", "(... a #1's G is at 298.15 K, not 350 K)", "(... compound
  a's differ in method: GFN2-xTB (a #1) and GFN1-xTB (a #3))". A G given
  with nothing of how it was worked out - no temperature, program,
  method - is said so: "on free energies (G), conditions not stated". On free
  energies a window refuses a saddle point, as Populations does: its G is
  no minimum's;
- **Energy window, from the lowest in each value of a property**
  (2026-10-31, for a cap on each product's transition states): *From the
  lowest in: Each value of a property*, and *The property* named -
  "product", "path". Each entry is kept where its energy is within the
  window of the lowest of those with its value; molecules as well as
  conformer sets. Its card says the window and what it is of ("within 10
  kcal/mol of each product's lowest"); its line which energy, chosen as
  above, each group's alike: "3 of 5 entries kept, on electronic
  energies · rest 2", the reasons counted only where any is more than
  being outside it. One without the property, or without an energy, goes
  out of *Outside it* saying so ("it has no product", "it has no
  energy") - never into a group, never left out unsaid; one outside the
  window says how far ("12.00 kcal/mol above the lowest of its
  product"). A saddle point is not refused here - which entries should
  be transition states is the chemist's to say - but a window means
  something only within one kind: a group of minima and saddle points
  together is set aside whole, saying so ("its product b holds minima
  and saddle points together"), as is one where an entry's kind is not
  known (no frequencies) beside those whose is; a group none of whose
  kind is known is windowed, its line saying "whether minima or saddle
  points not known". An entry that is no result (failed, not converged)
  is refused, named, as over compounds. Molecules have no compounds: over
  compounds each is its own group, as *Rank* takes them, so all are kept
  and the line says so ("2 of 2 entries kept: each molecule is its own
  group");
- **A conformer set keeps each conformer's thermochemistry**
  (2026-10-24): *Frequencies* on a conformer set runs a job for each, and
  each conformer keeps what its own job read - its free energy, enthalpy,
  zero-point energy and correction (`thermo.*`), each at its geometry, by
  what, at the temperature and solvation the program said, and its
  vibrations' frequencies - as its frame's properties: the molecule keeps
  one calculation, not each frame's. Its imaginary frequencies are kept
  frame by frame, a frame whose vibrations were worked out and has none
  "none", one never worked out "not computed"; where the program judged
  none imaginary but its table lists a negative frequency, that one is
  said - a table with one never reads as none. A program step on them
  later reads them again, or drops them, and a step that changes the
  structure or its charge or spin drops them (*Species* says so: "their
  thermochemistry was dropped"): never carried onto another geometry or
  species. A workspace saved keeps them all, the vibrations too: opened
  again, "none" is still none. (Until 2026-10-24 a conformer set dropped
  them: a Frequencies step on one gave nothing downstream.) The modes'
  displacements stay with a molecule of one geometry's calculation, not
  each frame's;
- **As conformers**: the same entries, as a conformer set.

They are calculation results as Meno knows them: the frames chip,
pointing at atoms, the lists. Each exit's set feeds the next step.

A step of Meno's own can also give structures drawn, in 2D (*Structures
drawn as results*, below): its exits' sets then hold structures on the
page, each as the step drew it, and feed a step that takes structures
drawn - *Conformers* - as a set the chemist drew does.

**A large result set** (2026-10-21, docs/WORKFLOWS-FOUNDATION.md, *What a
set shows*): up to 50 entries are laid out on the page, as above. An exit
that gives more - a search's 1,000 conformers, or what Duplicates set aside -
puts none of them on the page: its set holds them itself, in the step's order, and its frame
says what it holds ("400 conformers of 2 compounds"). The steps after it
take them from there, a run kept keeps them, and the workspace's file
keeps them, with the outputs they were read from - or, with *Don't keep
in the file*, only their count and hash. Opened from a file, a molecule
of theirs that does not read is left out and counted, and the frame says
how many ("51 compounds · 2 not read") until the step runs again; saved
again, the file says so too. So does a step's earlier run kept with the
file, on its row of the step's card - what both its exits held - and in
each exit's set once it is shown again. Its molecules are on no page,
so deleting the set deletes them: its frame says so ("On no page:
deleting the set deletes them"), and so does its menu, in words, last
("Delete set and the 118 molecules it holds"), before it happens
(2026-10-22). Deleted by the Delete key it is asked about first, as a
step running is - and so it is in a selection deleted: the rest goes, and
it is asked about. A cut leaves it in place, since a copy does not carry
its molecules, and says so.

**Its frame sums it up** (2026-10-22, docs/WORKFLOWS-FOUNDATION.md, *What
a set shows*): what it holds - that it is on no page, and *Open as a
table* beside it - a grid of a sample of its structures, and a chart of
its energies, each saying what it is of.
- **The sample**: in a conformer set, each compound once - its first
  conformer, since a drawing shows what its conformers share - the first
  twelve compounds in the step's order; in a set of molecules, the first
  twelve, each as it ends. A line under the grid says which ("The first
  12 of 40 compounds, in the step's order, each drawn once").
- **Drawn by Meno's engine**, as a molecule in 3D is drawn as a formula:
  the plugin that draws molecules wedges its heavy atoms as it is in 3D,
  and Meno lays them all out at once (docs/LAYOUT-2D.md, *Many at
  once*), lined up on what they share, each read back against the
  molecule it was given. One that does not show it as given is marked
  *Not as given*, saying how on hover; one that could not be drawn says
  *Not drawn*, and why on hover - never left out. All are drawn at one
  scale, so their bonds are alike.
- **The chart**: in a conformer set, each conformer's energy above its
  compound's lowest, in kcal/mol, of the energies one method worked out
  - a program, its version and a level; not a job, nor a charge - the
  method most of them were (the first of those as many) - each
  conformer counted once. Those by a method not stated are not charted,
  since two such may be two methods; nor is an energy that is no finite
  number. Its line says
  the quantity, the unit, the method and how many; those worked out
  another way, by a method not stated, or with no usable energy, are
  counted and said, not charted - and so are those of a compound only a
  part of whose conformers is here (*A part of a search*, below), whose
  lowest may not be among them. Its bars are binned by Sturges's rule (⌈log₂ n⌉ + 1 bins,
  Sturges 1926), and each says its range and count on hover. A set of
  molecules has no chart: the energies of different compounds are not
  set against one another.
- The summary is drawn at its own size in a new frame, and smaller in a
  frame made smaller, by hand or before it was this large.

*Open as a table*, on the set's menu or at the top of its summary, reads them in
the column beside the texts and PDFs, a tab of their own named as the
set is (2026-10-21):
- A row for each entry, in the step's order: its place; in a conformer
  set its compound's letter and its number among that compound's
  conformers; its name; its energy in hartrees; in a conformer set its
  energy above its compound's lowest, in kcal/mol; how many forms of it
  the search found alike, where it said; and *From*, what worked its
  energy out ("not stated" where nothing says). No share is shown: a
  share needs a temperature, and the set does not hold one.
- **A row that did not finish says so** in its *Failed* column - the
  failure in words ("not converged", "refused"), or "marks not read" -
  and its energy above is blank: the lowest is taken among those that
  finished alone, and the line at the top says so ("ΔE above the lowest of
  8 that finished; 2 not counted"). A large set's summary chart draws only
  those that finished, its baseline among them, and names those left out;
  none finished, it draws none and says why. An SD file written of such a
  frame carries a *Failed* field beside its energy (2026-10-23).
- Pressing a column's name sorts by it, again the other way; rows with no
  value go last. Only the rows in view are drawn, so 1,000 scroll as 10 do.
- Rows are chosen as in a list (a click; ⌘ or Ctrl to add or take one;
  Shift for those between, as sorted). *Put on the page* puts those chosen
  beside the set as a set of their own, "From" the set's name, in the
  set's order: each one geometry with its energy and what worked it out,
  and of its calculation only what is of that frame. A compound's
  conformers chosen stay one conformer set, so that the new set counts
  them as the step's did ("2 compounds · 5"). Where some of the
  compound's conformers are left out, the set is a part of a search
  (below), and the table shows no energy above the compound's lowest,
  which may not be among them. All of a compound's conformers chosen are
  the whole set, its shares with it.
- The tab closes as a text's does, and goes when its set is deleted. It
  is the view's, not saved with the workspace.

**A part of a search** (decided 2026-10-21): a conformer set's chip shows
each conformer's share of its compound - as a *Populations* step worked
it out, or else by Boltzmann at room temperature over its frames. Over
only some of a search's conformers, such shares would be worked out again
over those alone, and are not the compound's populations. So a molecule
that is only a part of a search's conformers, or one of them, is marked
so (`partOf`), and its chip shows no shares:
- those chosen from a set's table, some of a compound's left out;
- what an *Energy window* splits from a compound, in either exit (a
  compound all within it is whole);
- what *Choose one* chooses from several conformers, and the rest;
- the copies *Duplicates* takes out of a conformer set (*Alike*). What it
  keeps is the compound as it came, its copies merged into those kept -
  whole, unless what came in was a part. Out of a compound set, the
  copies are of a structure there twice, of no search, and not marked;
- whatever any step makes of a part: an optimisation of it, a step of
  Meno's on it, *As conformers* grouping it with others.

A conformer search run from one of them finds the compound's conformers
anew, whole. Shares a *Populations* step worked out are always shown: it
says at what temperature, and they are of what it was given - given a
part, it says that too, for they are not the compound's populations ("1
compound at 298.15 K, from electronic energies · shares over the 5
conformers given, part of a search"), and which energy (*Which energy*,
above). (Until
2026-10-21 Meno showed shares worked out again over what these steps
kept.)

Meno's own steps take no time to speak of and are done at once, all but
Duplicates (2026-10-14). Thousands of conformers alike take it seconds,
so it works in turns that let the page go on. Its card says it is
running, and how many of its entries it has been through, and its results
go in at the end as one edit. Stop, from its menu, gives it up at its
next turn ("Stopped after m:ss"); where what comes in changes meanwhile
(an edit, an undo, its set deleted), nothing of the old is put in, and it
says so, changed, to be run again. It lays a conformer only over those kept
that could be alike: their radii of gyration, and each atom's distance
from the middle, within the RMSD asked. Those are bounds the RMSD never
falls below, so it keeps what laying each over every one would.

Run again, a step replaces its result set's entries with the new run's,
gliding to where they now are; earlier runs are kept in the step (*Runs*,
under its options: when, with what options, how long, the number it
gave), and one can be shown again.

A result set is laid out for the 3D look its molecules are drawn in.
When a bigger look is chosen - a molecule switched to its other look, or
another look in Settings - and its molecules no longer fit (one reaching
past the frame or onto the set's name, or two over one another), the
frame widens and they are laid out again, as a run in that look lays
them out (decided, 2026-10-13) - or, where widening would reach over
what stands beside the set (the next step's card), in rows as wide as
the set was, the set growing downwards. The frame and the molecules
glide there together, and nothing is left over another. A set never grows narrower
or shorter for a smaller look; a chemist's own sets are left as they
are. A molecule switched is one step to undo, with its set; a look
chosen in Settings is not a step of the workspace, and lays out the
states an undo goes back to as well.

### Several at once

- **Jobs run as many at once as their cores and memory fit** what this
  computer's jobs may use - all its cores and three quarters of its
  memory, unless Settings, *Calculations*, says less - and the others
  wait, in the order they were started: a job never starts ahead of one
  asked for before it, however small (2026-10-22; until then, a number of
  jobs at once). A job takes the cores Settings gives each - unset, all
  that jobs may use, so one runs at a time - and the memory its plugin
  declares (ORCA's %maxcore for each process, Gaussian's %Mem); one that
  declares none is counted by its cores alone. So a small job waits behind
  a large one that does not fit yet, though it would fit itself: the
  order is kept, and nothing is starved. A job asking for more memory than
  the limits, though no more than the computer has, starts once no job
  that declares memory runs, and none that declares memory starts beside
  it - one that declares none still may, where cores allow - and its step
  says so (*1 job asks for more memory (30.0 GB) than jobs may use (24.0
  GB): nothing else that declares memory runs beside it*); one larger than
  the computer - more cores or memory than it
  has - is refused, saying so, never started to swap or fail inside its
  program.
- **A step on many entries makes one job for each** (decided), queued as
  above - each with its own log, a failure its own, several at once
  where Settings allows.
- **Unless its plugin says otherwise**: a plugin's manifest may say that
  a kind it fills takes all its entries in one job, as its program
  can - CREST optimising an ensemble in one run
  (`crest --mdopt`), ORCA chaining jobs in one input. Then the step runs
  one job, with one log, and the entries that came out of it are told
  apart in the results; a failure is the whole job's.

### When Meno closes

- **Jobs go on** (decided). Closing with jobs waiting or running says how
  many will go on, and asks nothing else; those waiting start in turn,
  without Meno.
- **An update waits for them** (Windows). Installing a newer Meno ends
  every process of Meno's executable, the jobs' runners among them, and
  with each the program it runs. So while any job - of any workspace -
  waits or runs, an update downloaded is installed neither as Meno quits
  nor by *Restart now*: the notice and Settings say it waits, and for how
  many jobs. It goes in at a quit with none, downloaded again after Meno
  next starts. On a Mac a runner goes on from the Meno it was started
  from, and an update goes in as Meno quits.
- **Opened again**, a workspace looks at its jobs: done - their results
  come in, as if Meno had been open; still running - shown running, with
  the time since they started; gone without finishing (the computer was
  restarted, say) - *Stopped*, with their logs. Where some are gone and
  others done, those done come in and the others go out of the step's
  *Failed* exit: *2 of 3 · 1 of 3 failed (1: stopped before it
  finished)*.
- A workspace never saved keeps its jobs with the unsaved workspace Meno
  reopens; closed without saving, its jobs are stopped - said in the
  dialog that asks about saving.
- **A render asked for with Render…** is no step's (RENDER.md): nothing
  picks it up again, so its workspace's tab closing stops it, saved or
  not, and asks nothing more. Render as a step's jobs are a step's.

### Undo

- Making a workflow is editing the page: a set, a step, a wire, options -
  each an undo step, as anything drawn.
- A run is not undone. Its results coming in is one step: an undo takes
  them away (the step shows its earlier run, or none), a redo brings them
  back. The job's files stay until finished jobs are cleared (*Settings,
  Calculations, Jobs*).
- Deleting a step that is running asks first; it stops it. So does an
  undo, or a redo, that would take a running step away (the step made, a
  delete undone and the step run again): it asks the same; answered yes,
  the step's jobs are stopped as deleting it stops them, and the undo is
  done; cancelled, the history stays where it was. An undo that takes
  away only the wire into a running step is done at once: the step runs
  on, on what came in.
- **A step ends on what came in when it started** (2026-10-16): an undo, a
  molecule moved out of its set, its input set deleted - its results are
  of what it started on, put in all the same, and its card then says
  *Changed · run again*. Meno's own *Duplicates*, worked in turns, does the
  same. A workspace closed while a step's jobs run, and opened again, has
  no record of what they started on: the step ends on what comes in then
  where that is still the same, and its entries fail, saying so, where it
  is not.

## Saving and sharing

- **The workspace keeps it all** (`.meno`, FILE-IO.md, *The workspace
  file*): sets, steps, wires, options; each run - when, its kind and
  options, what it said and how it ended, how long it took, its jobs by
  id - and the molecules each of the runs it keeps gave (*Earlier
  runs*); the outputs its
  molecules were read from, as files kept by their SHA-256, each
  molecule's calculation saying its program and version as the output
  does; a job's log, as a text, where it was shown; results as entries
  on the page. A job's own folder stays in Meno's data folder, not in the
  file. (Each run keeping its program, version and log with it is a
  requirement for the rebuild.)
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
  xtb 6.7.1, LGPL-3.0-or-later, for macOS (Apple silicon and Intel),
  Windows and Linux. It fills *Optimise*, *Energy* and *Frequencies*, and
  reads its own outputs back. *Frequencies* of an entry with an isotope is
  refused, naming it (2026-10-13): xtb 6.7.1 says it takes an atom's mass
  (xcontrol(7), `$hess`) and that it changed it, but its frequencies and
  thermochemistry came out as the natural element's - D2O's as H2O's, run
  here. Geometries and energies do not depend on the masses, so
  *Optimise* and *Energy* run as before. ORCA writes each isotope's mass
  ("M =" after the atom's coordinates, as its manual has it), and
  Gaussian its mass number ("(Iso=n)").
- **CREST**: *Conformers*, by a plugin made the same way - crest 2.12
  with xtb 6.7.1, LGPL-3.0-or-later, on conda-forge for macOS and Linux
  only. On Windows it cannot be added, and *Conformers* is filled by RDKit
  alone there. (Not 3.0.2: *As built*, step 5.)
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
  folder goes by *Settings, Calculations, Clear finished jobs' files* - not
  with its step, deleted: another step may have taken its job up again,
  and a copy of the workspace saved elsewhere names the same jobs. Two
  take their own folders away: a Render job, once its picture is on the
  page, and a job started for a step deleted before its run began - none
  of them taken up again from another run.
- **A saved workspace keeps its jobs' files**, raw outputs included,
  unless the step says *Don't keep raw outputs*; opened elsewhere, *Show
  files* writes them back out (docs/FILE-IO.md, *A step's jobs*).

## Licences

- **The editor is Meno's own.** Sets, steps, wires, ports and their
  drawing on the page are written for Meno, from this specification,
  with no code taken or read from ReactFlow, the Workflow Builder tab, or
  any other node editor (the maintainer, 2026-10-08). ReactFlow
  (`@xyflow/react`) leaves Meno's dependencies with the tab.
- **Programs are run, not linked**: xTB and CREST (LGPL-3.0-or-later) are
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
- **Duplicates in a compound set** compares entries of the same atoms,
  bonded alike, in the same order: a structure there twice is the same
  structure. In a conformer set, within each compound, lowest energy
  first. Alike is the one definition of the same conformer (*The same
  conformer*, below).
- **Duplicates within each value of a property** (2026-10-31, the same
  transition state found by two paths): *Compared within: Each value of
  a property*, and *The property* named - "product", "path". Entries of
  one value, of the same atoms bonded alike in the same order and the
  same charge and spin, are compared across compounds - each saddle
  point a path search gives is its own compound - with the same one
  definition of alike, no threshold of its own; the lower kept, each
  other one out of *Alike* naming it ("the same as b #1, which was
  kept"). Lower only where their energies were worked out alike - across
  paths they need not be: free energies where each has one, by the same
  method, basis, temperature and the rest, else electronic energies of
  the same program and level, or of none said; else those alike set
  aside, saying how they differ ("alike, but which is lower is not
  known: energies differ in level, ..."), the line counting them as
  "alike, energies at different levels" - two levels' numbers never
  decide; one unlike any other is kept, whatever its level. Where one of
  those alike has no energy, the first as they came is kept, the line
  saying so ("where one of those alike has no energy, the first kept").
  Its card:
  "compared within each product" - only what is not its default; its
  line "3 of 4 entries kept · rest 1", the reasons counted only where
  any is more than being alike. One without the
  property goes out saying so ("it has no product"), never compared. As
  *Energy window* in each value: saddle points are compared with saddle
  points, but minima and saddle points of one value are set aside
  together, saying so, as is one whose kind is not known (no
  frequencies) beside those whose is; a value none of whose kind is
  known is compared, its line saying "whether minima or saddle points
  not known". An entry that is no result is refused, named.
- **Deleting a step keeps the set it made**, with what it holds - a set
  like any the chemist made, so a compound set. A large set it made keeps
  the molecules it holds itself (2026-10-22): they are on no page, and
  the set takes in nothing dropped into its frame. A set kept out of the
  file (*Don't keep in the file*) is kept in it in full from then on, its
  molecules with their outputs: the step that could make them again is
  gone, and a chemist's set is always kept.
- **The look, after review** (2026-10-08): frames, tabs, cards and ports
  in Meno's palette and its cards' hairline borders, a hair on the screen
  at any zoom; wires a hair and a quarter; Heroicons' outline icons for
  the kinds and the states; no tint or fading for a state. The canvas's
  hover blue only for a wire under the pointer, as for an atom.
- **A step's card is 208 px wide** at 100 %, its ports 28 px below its
  top: wires join where they always did as the card opens.
- **A port** is round at every zoom - a ring a hair thick, or filled in
  the accent while a wire may join it - and stands exactly at its wire's
  end. It is 9 px across on the screen where the page is near; zoomed
  out, never more than its own 11 page px - it shrinks with the page from
  there - nor than a sixth of its set's or card's height, its ring then at
  most a fifth of it across (the maintainer, 2026-10-28: zoomed out, ports
  were far too big for their sets; look `portSize`).
- **Laid out in the screen's pixels, lines drawn as shadows** (2026-10-31,
  seen on Windows): the page's layer of HTML is laid out in its own
  pixels and scaled to the zoom after. Chromium, Windows' WebView2, rounds
  a box's edges and size and a border's width each to a whole one of those
  pixels first, and zoomed in the layer magnifies that: ports came out as
  ovals, as dots, of several sizes and off their places, and the cards'
  and sets' hairlines six pixels thick at six times. So a port is laid out
  in the screen's pixels, the layer's scale (`--scale`) undone on it and
  centred by the same transform; and a card's and a set's lines a hair
  thick are inset shadows (`inset-ring`), which are drawn as thin as they
  are, the room a border took kept as padding.
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
finished jobs' files - how many, and how much they hold - cleared. How it
works: ARCHITECTURE.md, *Jobs*.

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
- **A program that runs as processes is given one to each physical core,
  each told one thread** (2026-10-30). Its manifest says so
  (`installed[].parallel`: `"processes"` - ORCA, its `%pal`, run under
  MPI). Its job takes the cores Settings gives each, as processes - never
  more than the computer's physical cores - and each process is told one
  thread (`OMP_NUM_THREADS`, MKL's and OpenBLAS's, all `1`). Before, each
  of its processes was told all the job's cores as its threads: on a
  computer of 16 physical cores running two threads on each, 32 processes
  of 32 threads each. Where the computer runs two threads on each physical
  core, the queue counts each process as two of its cores, so that two
  such jobs never share a physical core. Settings, *Calculations*, says so under its cores,
  where the computer runs more than one thread on each: they are counted
  in logical cores, and such a program takes that many for each process. Its physical cores are what its
  system says: on macOS `hw.physicalcpu`; on Linux the distinct cores in
  `/sys/devices/system/cpu/cpu*/topology` (each core and the package it
  is on); on Windows the processor cores `GetLogicalProcessorInformationEx`
  gives. Never more than the cores it may use (its threads, as the system
  lets Meno have them), and its cores where its physical cores are not
  known. A
  program of threads (xTB, Gaussian's `%nprocshared`) is told its cores as
  before.
- **Jobs at once counted for jobs asked for after it was changed** (until
  2026-10-22): one already waiting kept the number it was asked with. What
  jobs may use now counts at once, for every job waiting - Settings tells
  the runner as it changes.
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
  2026-10-09, for Gaussian) - and the programs installed beside its own
  run after it, in turn, where it ended well (`then`; added 2026-10-11,
  for ORCA's orca_2mkl: what they print kept apart from the job's log,
  which is its program's output; one that fails leaves the job done);
  **`collect {step, entries, options, files, log,
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
- **Deleting a running step asks first** - and so does an undo or a redo
  that would take one away (*Undo*); deleted, a step's jobs are
  stopped, their folders left until finished jobs are cleared. Undone, the
  step comes back stopped; its results keep its logs. Deleted while its
  jobs are still being started (a long conformer set, Run just pressed), it
  starts no more, and those it started - in no workspace yet - are stopped
  and taken away.
- **Failed entries are counted as entries**: a job for several entries
  that failed counts each of them (*2 of 3 failed*), and where its runner
  said why (*xtb could not be started*) that is the reason given.
- **Show log** opens each job's log as a text of the workspace, *Optimise
  log* (*Optimise log 1*, *Optimise log 2*, ... where there are
  several), following the job while it runs; a text that grows at its
  end keeps its last lines in view unless it was scrolled up.
- **A choice of more than five** is a list to pick from, in a step's
  options and in Settings (xTB's solvents, its convergence levels).
- **xTB's options**: the method (GFN2-xTB, GFN1-xTB, GFN-FF), a solvent -
  ALPB, any of the 24 its documentation gives for all three methods - and,
  optimising, how far it converges (crude to extreme, normal by default).
  What it gives back says the solvation as xtb printed it, and a
  frequency job's thermochemistry how it was worked out (PLUGINS.md,
  *The contract*).

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
on empty space since 2026-10-10) - every step that is not done (not
run, changed, failed or stopped), in the order their wires give; steps
that do not wait on one another run at once, their jobs queued as
Settings allows; a step after one that failed is not run. A step keeps
its earlier runs: opened, its card lists them under *Runs* - when, what
it gave, how it was set - and one can be shown again, its results back
in the step's result set.
How it works: ARCHITECTURE.md, *Workflows*.

Decided while building it, for the maintainer to confirm:

- **Earlier runs** (the maintainer's ruling, 2026-10-22, in place of a
  step keeping its last ten). A step keeps, each with what it gave, in the
  workspace:
  - its last run, and the run before it, in full;
  - every run the chemist keeps: *Keep* on its row of the card's *Runs*
    holds it, *Kept* lets it go again. A run kept is never dropped, however
    many there are: what bounds them is the workspace file's own size -
    the warning before a save takes it past a size, and the most a file
    may hold, 1 GB (FILE-IO.md, *A step's jobs*: *A size warning*).

  Running the step again drops the others from the workspace, and so
  from its file when it is next saved. Meno says which, and what they gave, before
  the run, never after. Under the icons of the step's menu, a note reads
  *Running drops the run from 14:02 (120 molecules) from this workspace.*
  It names a run by its time, with its day where that was not today and
  its seconds where two of the step's runs were in one minute, and
  says what it gave: so many molecules, conformers, or no results. The
  note covers every step the click runs: those before it that run first,
  being changed or not run, and, for *Run from here*, those after it
  (*Running from here also drops ...*). *Run all* gets the same note, and
  so does the open card under *Runs* (*Running again drops ...*). Where
  nothing would be dropped, there is no note.

  A step running already drops nothing more for being asked again. A click
  that is refused before its run starts, with nothing coming in say,
  drops nothing: what the step last did is kept with the rest, and the
  refusal itself is not kept. A step after one that fails is not run, so it
  drops nothing, though the note named its runs. A dropped run's job
  folders stay in Meno's data folder. A copied workspace can share job
  ids with the one it was copied from, so they are left for the clean-up
  of jobs to come. A set's *Don't keep in the file* is about what the set
  holds now, not the step's earlier runs.
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
  options, starting from those chosen in Settings, *Chemistry*, on its *3D* card
  (2026-10-13), run as a job: RDKit's own Python runs a script of the plugin's
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
  lowest energy first, and sets aside each that is the same conformer as
  one kept, on the one definition (*The same conformer*; until 2026-10-22,
  0.125 Å over the heavy atoms). A mirror image is kept apart, or counted
  in as Meno's are - only where the two are one stereoisomer, as their
  geometries have it. It is done at once in RDKit's worker - `run {step,
  entries, options, holds}`, no job - and says *2 of 3 kept*, and
  *1 mirror image counted in (degeneracy 2)* where it counted one.
- **CREST's options**: the method (GFN2-xTB, GFN1-xTB, GFN-FF, or
  GFN2-xTB//GFN-FF: searched with GFN-FF, the conformers then optimised
  with GFN2-xTB), a solvent (ALPB, the 24 xTB offers), how thorough the
  search is (full, or CREST's three quicker ones), and the energy window
  (6 kcal/mol by default). The charge and spin multiplicity are those
  Export reads, as for xTB. Its search samples with the natural masses:
  CREST is given none (its help lists no way to), which changes how it
  explores, not the conformers or energies it gives.
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
- **A program's output read by its own plugin** (2026-10-31): Gaussian's
  output and its formatted checkpoint are read by the *Gaussian
  interface*, the plugin that runs Gaussian - one reading, its `read`, for
  a job's log and for a file opened by hand - written from Gaussian's own
  reference and its outputs alone (its `reader.py`). Its `collect` judges
  how a run went by the same reading (`run_of`). Each kind it reads says
  in its manifest that its program writes it (`writtenBy`), so that, where
  it is added, it is the reader of Gaussian's outputs unless another is
  chosen in Settings, *Files*.
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
  are - the dispersion, the solvation and its solvent, more keywords, the
  memory, and whether to keep the wavefunction (on unless turned off); the
  cores come from Settings, *Calculations*, as xTB's do.
- **The wavefunction is kept** (2026-10-11) with each molecule a step
  gives, as the output is - kept in the workspace's file, and given to a
  later step that takes it (a step's `files`: Multiwfn's NCI). ORCA's: its
  job then runs orca_2mkl, installed beside ORCA, as its manual has it -
  `orca_2mkl input -molden`, writing `input.molden.input`, a Molden file.
  Gaussian's: `Output=WFX` in the route, and the file's name on a line of
  its own after the molecule ("read from the input stream, on a separate
  line", gaussian.com, *Output*): a WFX file, at the last geometry, in
  Gaussian's standard orientation, as the molecule read from its output
  is. A job that wrote none gives its molecules without one.

Not yet, and where it comes:

- **Gaussian on Windows**: its steps are offered on macOS and Linux only,
  until Gaussian's own documentation for running it on Windows is read;
  *Export* writes its input everywhere.
- **ORCA running in parallel** needs OpenMPI where programs are looked
  for; a Meno opened from the Dock is not given a shell's PATH, so a
  located OpenMPI comes later. With one core for each job (Settings,
  *Calculations*), ORCA needs none.
- **The version** of a program installed separately is what its output
  says, as the readers read it; Settings asks the program itself only
  where its plugin says how (`installed[].version`, since 2026-10-11 -
  no plugin Meno carries says so since Blender became Meno's own copy,
  2026-10-12, docs/RENDER.md), and then takes only a copy new enough.

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
  12 s, −115.568850 Eh, its path of 7 frames on the frames chip;
  *Frequencies* in 10 s, its 12 vibrations in the molecule's list (330.5
  to 3819.7 cm⁻¹, none imaginary), its partial charges by pointing at an
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
  *Cores for each* set to 1 runs it. Where it cannot, the step's failure
  says so plainly, with what to do (2026-10-30): *ORCA runs on more than
  one core only with Open MPI, whose mpirun this computer does not have
  (the ORCA manual, 2.5.2.1): set Cores for each job to 1 in Settings, or
  install Open MPI* - ORCA's own words being only that it ended by an error at its
  start-up. Meno never runs it on fewer cores than asked without a word.
  Now (2026-10-31), the ORCA plugin looks for the program ORCA starts its
  processes with before any job is made - Open MPI's `mpirun` on macOS
  and Linux, Microsoft MPI's `mpiexec` on Windows, on the PATH ORCA's
  jobs are given: ORCA's own folder, where it was found, before the PATH
  Meno was started with - never the plugin's own environment's folders,
  which no job is given. Not there, each job runs on one core - no
  `%pal` written, one core asked, so that the queue counts it as one and
  as many run side by side as there are cores - and the step's line says
  so once: *run on one core: no MPI on this computer*. Never refused, whatever *Cores for each* says: it
  applies to every program, and those that need no launcher still take
  it. The failure above stays for a launcher found that ORCA's job then
  cannot run.
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
  Either way it goes without the molecules a large set holds itself -
  with its step, it is empty until the step runs again; alone, an empty
  frame - so they are never copied twice (2026-10-22).
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
  frames as it is turned, with room for its frames chip below it - as
  wide as all it says, of every frame: why its energy is not given ("none
  finished: no lowest to stand above") and what it says after it - why it
  failed, its imaginary frequencies, its warnings (2026-10-31: a saddle
  point's chip ran into its neighbours', a failed one's past the frame) -
  and no larger than its name needs.
- **Steps' cards**: the icons in a column of their own - what it does,
  and its state's beside its state - and no rule; what it does and how,
  whole, on two lines where it needs them. A step Meno does may say its
  options its own way (*Choose one*: *Lowest in energy*, *Number 3*).
- **Chips on the page** (*How it looks*): drawn at the page's scale -
  `--page`, set on the layer the page's HTML is drawn in as the zoom
  changes - from where each hangs, and faded out below 75 %, with
  the sets' names and the cards' words (`utils/pageScale`). Each is laid
  out at that scale (CSS `zoom`, `PAGE_SIZED`), its words set at the size
  they are seen at - not drawn at one size and scaled by a transform,
  which the Mac's WebView magnifies soft up close (2026-10-25; so the
  frames chip, *Make again*, a measurement's value and the notes over a
  molecule or a figure).
- **Written as the zoom moves, half a per cent at a time** (2026-10-31):
  `--page`, and `--hair` that the cards' lines are as wide as (and
  `--scale` that ports are laid out by), lay out
  every chip and card on the page again each time they are written - some
  80 ms on a page of sixty steps, every frame of a zoom. While the zoom
  moves they are written only once it has gone half a per cent from the
  last written (`zoomWritten`) - half a pixel on a chip a hundred wide,
  not seen - and, once it stands still, as it is. A wheel's zoom on that
  page is over half a second sooner; the laying out itself stays.
- **Quick Add** opens where it will stay as a panel opens below its row -
  its calculations, or the field a SMILES is typed in: its side is chosen
  once, for its largest, and it is held by its top left corner, so that
  nothing in it moves as the panel grows (`quickAddPlace.ts`).
- **No *3D structure* step**: *Conformers* takes structures drawn - RDKit's
  search, in its worker, as *3D structures* on the canvas makes them, with the step's
  own options - and *Choose one*, Meno's, takes one conformer of each
  compound. A plugin's step says in its manifest what it takes where it
  takes less than its kind (`takes`: CREST's search starts from 3D).
- **A structure drawn whose stereo is left open is not made** by
  *Conformers* (2026-10-22), where what is open could go more than one
  way: a stereocentre or a double bond that could have a configuration and
  is drawn without one (the roles' `open_stereo`), giving two or more
  stereoisomers that can be made in 3D, or an allene's axis, whose
  stereoisomers RDKit does not count. The canvas's *3D structure* asks
  which is meant; a step cannot ask, and never chooses. The others are
  made, and the step's line names those not made by their places
  (*structure 3 of 4 leaves stereo open: draw it, wedges and all*). Each
  structure drawn that is not made - its stereo left open, one atom alone,
  or one that could not be made - goes to the step's *Failed* exit as it
  came, its record with it, failed - no result to stand on, so a table
  says so, a chart refuses it and "state = finished" leaves it - saying
  why ("1 double bond not specified: put Stereoisomers before
  Conformers"; what it was set aside for before kept beside it, "earlier:
  ..."; 2026-10-24): there it can be followed, and wired on, into
  *Stereoisomers* above all. Its open stereo is counted once each: an
  allene's cumulated bonds one axis, a cumulene of three one double bond. Where none is
  made, the step makes none and sets them all aside so. Until 2026-10-22
  the first stereoisomer was made without a word; until 2026-10-24 those
  not made were in no set, said on the line alone.
  - **A bridgehead its rings fix is no choice.** Adamantane's, cubane's or
    norbornane's open centres give one stereoisomer that can be made in
    3D (RDKit's enumeration with its embedding tried, seeded by the
    isomer), so it is made, nothing said. Unwedged camphor gives two, and
    is not.
  - **Where no stereoisomer holds in 3D** (a strained cage's), the
    structure is made as the embedding places it, and the line says so
    (*structure 3 of 4 made with its stereo free: no stereoisomer of it
    holds in 3D*).
  - Not seen: a metal's centre (square-planar platinum) and an axis of
    hindered rotation (a biaryl's); they are made as the embedding places
    them.
- **A lone atom or ion is not made, and said so** (2026-10-23): one atom
  alone has no 3D structure, as on the canvas (*structure 2 of 3 left
  out: one atom alone has no 3D structure*); where every one is, the
  step fails, saying so. A structure made of its parts makes its first
  molecule, and names what it left out (*structure 3: its Cl− left
  out*, a salt's counter-ion; *its 1 other part left out*). Until then
  each was passed by without a word.

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
- **How CREST took conformers as one, as its run printed it**
  (2026-10-24): the thresholds CREGEN prints with its sorting - its RMSD
  threshold (Å), its rotational-constant threshold (a relative
  difference), its population threshold and its energy window (kcal/mol),
  each the last value the run printed - are said on the conformer set's
  frames chip, under *Same conformer (CREGEN)*: never as asked, never a
  default. One it does not print is not said (CREST 2.12 prints no pair
  energy threshold). A search's results are of its run, so the conformer
  set keeps them; a job run on each conformer keeps its own with that
  conformer, never with the set.
- **Each conformer's degeneracy, as CREST finds it** (2026-10-13): the
  number of its rotamers alike, from the same table (`degen`), given back
  as the output form's `degeneracies` and kept with the molecule
  (`degeneracies`). Meno's own Boltzmann weights - a *Populations* step's,
  and the chip's at room temperature where no step found any - count each
  conformer that many times, as CREST's do: n-butane by GFN-FF, its
  gauche form found twice alike, is 52% anti and 48% gauche either way,
  not 68% and 32% as counting each once would give.

Not backward compatible: a workspace or procedure saved with a *3D
structure* step opens without that step (no shim before 1.0).

### Ports and exits (2026-10-21)

Foundation PR 5 (WORKFLOWS-FOUNDATION.md, *Steps, ports and exits*):

- **A kind declares its inputs and its exits** (`workflow/kinds.ts`:
  `inputsOf`, `exitsOf`). A kind that takes one set has the one input
  `in`; a kind's first exit is the set its kind names (`made`), and a
  kind that sets entries aside declares a second: *Energy window*,
  *Outside it*; *Duplicates*, *Alike*; *Choose one*, *The rest* - a
  conformer set, as the conformers not chosen are.
- **A wire ends at a step's input** (`{ step, port }`) **and starts at a
  set**; a step's card has no port that gives. A wire drawn into a step
  without naming an input goes to the first input that takes it.
- **Every exit is a set, made with its step**, to the right of the card,
  the second under the first and half as high, holding nothing and saying
  *Not run yet* until the step runs - so that a chain is wired up before
  anything has run. A step put down without a set for one of its exits
  (pasted alone, say) is given one. Deleted, a step takes with it the
  exits' sets that never held anything, and the wires out of them; one
  that holds something stays, a set like any the chemist drew.
- **What a step sets aside is molecules in its second exit's set**, in
  plain view, counted; it was a list kept with the first set, shown struck
  through under its tab. What the exits hold adds up to what came in -
  held by a test on each of Meno's steps that sets entries aside, against
  answers worked out by hand.
- **A procedure keeps its steps' exits** as empty frames, the wires
  leading on from them.
- **A later input may be optional - *where wanted*** (`StepPort.optional`,
  2026-10-29): the step runs with nothing wired into it - an Energy
  diagram's *Connects*, Add's *Number*. A kind's first input is always
  needed; every later one not marked optional is too ("Nothing comes into
  Second"). Two optional inputs may go together (`together`): both wired,
  or neither ("Reactant side is wired: wire Product side too, or
  neither"). An optional input looks as any other: the card's line names
  what is needed, and never an optional one (`kinds` `laterPortsNeed`).
  Wired, any input - optional or not - must give what it takes, by what
  its set gives, run or not yet (flow `givesOf`): one wired from a set
  that came to hold a table or a chart says so ("Second takes molecules
  in 3D or conformer sets"), and the step does not run as if it were not
  wired.

Not read from a workspace saved before this: a wire into a step by its
number alone, or out of a step, and a result set that does not say which
exit made it (pre-alpha: no reading of older files - the chemist draws
them again). Not yet: a kind with two or three inputs, and matching them
on a property - none of Meno's kinds takes two yet; the first come with
the structure steps and *Path search*. *Tag*, which writes the property
they match on, comes with Meno's own nodes.

### The same conformer (2026-10-22)

The maintainer's rulings of 2026-10-21 and 2026-10-22:

- **One definition, app-wide**: two geometries of one molecule are one
  conformer where all its atoms, hydrogens included, lie within 0.01 Å
  RMSD of each other - the maintainer's standard for structures fed to
  quantum calculations, which keeps OH and NH rotamers apart - at its
  least over the ways the molecule maps onto itself, laid over by turning
  and moving, never by reflecting (`workflow/sameConformer`; the RDKit
  plugin's conformers for Meno's own page use the same, while its
  *Conformers* step gives every one RDKit made and its *Duplicates* step
  applies it: PLUGINS.md). The ways are those of its atoms but
  the hydrogens hanging on one atom, at most 1,000; those hydrogens are
  matched to the nearest of their kind once the rest are laid over.
  Past 1,000 ways - a centre with seven alike arms has 5,040 - its atoms
  are taken against their own alone: a duplicate can then be missed,
  never two different conformers made one, and *Duplicates* says so on
  its line: *1 compound has more than 1,000 symmetric ways: duplicates of
  it could be missed*.
  Meno's *Duplicates* has no threshold of its own any more (it was 0.125
  Å, its atoms in their own order).
- **A conformer's mirror image**, in an achiral molecule, is kept apart by
  default: an average by atom over both needs both - enantiotopic atoms
  (methoxycyclohexane's C2 and C6) swap values between them. *Duplicates*
  can count it in instead (*Mirror images: Counted in*): the one kept
  stands for both, its degeneracy 2, and keeps the atoms the mirror image
  swaps (`mirror`: its atom i is atom `mirror[i]` of the mirror image) -
  carried by every step after it, an optimisation's included. The step
  says *1 mirror image counted in (degeneracy 2)*; *Populations* counts
  it twice. An average by atom over conformers takes the mirror image's
  values by the permutation, and one that cannot refuses such a set,
  saying why (none is built yet). Counting in asks which stereoisomer
  each entry is first, and refuses where one is not known: a chiral
  molecule's mirror image is its enantiomer, never counted in.

### The runner seam (2026-10-22)

Foundation PR 14, its first part (WORKFLOWS-FOUNDATION.md, *Where jobs
run*):

- **A runner says where a job runs** (`lib/runners`): it starts a job,
  says how it stands, gives its log and files, stops it and takes it
  away. This computer's is the one built in step 2, now behind that seam;
  a runner for another machine hangs on it later as a plugin of its own,
  its jobs named by it (`<runner>:<job>`). There is one runner yet, so no
  step offers *Runs on*.
- **This computer's runner knows its resources**: Settings, *Calculations*,
  *Jobs*: *Cores for each job*, *Cores jobs may use* and *Memory jobs may
  use*, the computer's own cores and memory beside them (*of 10*, *GB of
  32*). Meno tells the runner what jobs may use as it starts and as
  Settings changes (`.limits.json` in the jobs folder); the runner reads it
  as it looks for a waiting job's turn.
- **A plugin declares a job's memory** (`prepare`: `memory`, in MiB).

Its second part:

- **Where jobs run** is chosen in Settings, *Calculations*, *Jobs*: Meno's
  own folder, or a working folder the chemist chooses, in which Meno makes
  a `meno-jobs` of its own. It is changed only while no job waits or runs,
  so that one queue never spans two folders; jobs made in the folder before
  are still found and read. Meno keeps the choice in its own data folder,
  and a runner reads it there - it takes a job only from one of those
  folders, never from where it is told.
- **A job's folder is named by what it is**, path-safe: its entry's name
  and its step's, small ASCII letters, digits and hyphens only, and eight
  characters of an id of its own (`water-optimise-3f9a2c1d`) - a name in
  Japanese or with spaces gives what ASCII it has, or *job*. Jobs made
  before, named by a UUID alone, are still read.
- **A folder chosen and not there** - a drive not connected, a network
  folder away - is still the one chosen: no job is made in Meno's own
  instead. A step run then fails, saying so, and Settings says so beside
  the folder, until it is there again or another is chosen.
- **A folder on the computer's own disk** is advised, in Settings: a
  network or synced folder may not keep a file's lock, nor move a file
  whole, as a job's record and its queue need, and a sync may bring back
  or take away a job's files as it runs.
- **Clearing finished jobs takes only folders named as Meno names jobs**:
  whatever else is in the folder chosen is left as it is.
- **A folder others can write in** lets them put a folder there that looks
  like one of Meno's jobs. A runner takes nothing from it that Meno did not
  ask for (a job's program, arguments and environment are checked against
  what Meno would give it), and output Meno cannot account for stops its
  step (*Job keys*); still, choose a folder only you write in.

Not yet: job folders cleaned once their files are in the `.meno` unless
*Keep job folders* is chosen (that waits for raw outputs kept in the
`.meno`, #9b); *Show files*, on a step's menu, opens a job's folder, and
an entry's menu does not yet.

### Job keys, and a job taken up again (2026-10-22)

Foundation PR 9a, its first part (WORKFLOWS-FOUNDATION.md, *A job's key*;
question N):

- **A job's key** is the SHA-256 of what it runs - its input files, its
  program and arguments, what it reads as its input, the programs run
  after it - and of its plugin's version and its program's (`lib/jobKeys`):
  the version a program installed separately says, else what the plugin's
  worker says it runs. Its files in any order give the same key; any byte
  changed, another. The cores a job is given are in its input where its
  program is told them there (ORCA's %pal, Gaussian's %NProcShared, xTB's
  `-P`), so a job given other cores is another job.
- **A program installed separately is in the key as it is now**: where it
  is, its size and when it was written (jobs.rs `stamp_of`) - one replaced,
  though it says the same version, or says none, gives another key. Where
  that cannot be told, the job runs, and none is taken up again. The key
  is hashed by the browser's own SHA-256, off Meno's way: a job's input
  may be a wavefunction of many MB.
- **Not in the key**: the environment Meno gives a job - the same for
  every job, but for the threads its program is told (`OMP_NUM_THREADS`
  and the like, from *Cores for each job*), which change no result beyond
  the last digits, the order sums are taken in. A program that takes no
  seed, or one Meno does not give it - a conformer search, an embedding -
  gives another result each run: taken up again, a key gives the result of
  the run it was first run for, not one of the others it might have given.
- **Same key, same result.** A job whose key this workspace has run to the
  end - in any step's last run, or one it keeps - is not run again while
  its runner still has it: what it gave is taken up again, and the step's
  line says so (*Reused*, or *2 reused*). Only within one workspace: no
  cache on the computer decides what runs. Its folder cleared since, it is
  run again.
- **A step deleted takes no job's folder away**: another step's run may
  have taken one up again, and a copy of the workspace saved elsewhere
  names the same jobs. Their folders go when finished jobs are cleared.
  (A Render job takes its own away once its picture is on the page; so
  does a job started for a step deleted before its run began - never one
  taken up again.)
- **What a job gave is kept as one digest**: the SHA-256 of its log and of
  every file in its folder, each by its name, read as its run is brought
  in (jobs.rs `digest_of`), and kept with the run beside its key. The
  files the system writes as a folder is looked at - `.DS_Store` and `._`
  files, `Thumbs.db`, `desktop.ini` - are left out: *Show files* never
  makes a job one Meno cannot account for. Each check reads the outputs
  in full, streamed through the hash - a run's wavefunctions and cube
  files, of hundreds of MB, as it is brought in and as it is taken up
  again: nothing less says they are the same. A job is
  taken up again only where its digest was kept, and what it gives then
  must be the same: its files changed since - written over, added to, or
  taken away - stop the step (*its files have changed since they were
  read*), as other output Meno cannot account for does.
- Kept with the workspace: each run's jobs' keys and digests, one for each
  job.

- **Output Meno cannot account for stops the step**, naming each job and
  why, and nothing comes in: a job whose key is not the one it was asked
  for with (its folder holds another job's), or one the run neither
  started nor took up again - made more than a minute before the run
  began. Each job keeps its key with it (`job.json`).

- **Adopt**, on the step's menu, one item for each such job (*Adopt
  water-optimise-3f9a2c1d*): that job's output taken as the step's result
  on purpose, recorded with when, the run taken up again as it stood - any
  other such job still stops it. The step's line then says so (*2
  adopted*), and its run keeps each job adopted with when; all of it kept
  with the workspace.

  What an adopted job gave says so in its calculation (`adopted`, with
  when), so its line begins *adopted output* wherever it is shown.

- **A job's folder found without its record** - what it was to run, but
  nothing of how it ran - is output Meno cannot account for too, not a job
  gone: it stops the step (*its folder has no record of how it ran*), and,
  adopted, is read as a job that ran to its end.

### Failed entries (2026-10-22)

Foundation PR 8c (WORKFLOWS-FOUNDATION.md, *Failed entries, and running
them again*; the maintainer's rulings of 2026-10-22):

- **A calculation's second exit is *Failed*** (Optimise, Energy,
  Frequencies, NCI; a conformer search's takes the molecules it could not
  search). Its set is made with the step, under the first, and moves
  down with it as the first grows.
- **A step is done where anything was.** What it could not do goes out of
  *Failed*, each entry as it came in - or as far as it came - saying why;
  what follows runs on what was done. It fails only where nothing was,
  saying why in the program's own words. The line counts the failures
  by kind: *1 of 3 failed (1: not converged)*.
- **The kinds of failure are core's**: not started, stopped before it
  finished, the program stopped with an error, refused, another molecule
  came back, no geometry came back, not converged - and *failed* for any
  other. A plugin names one of them; its own words are always kept beside.
- **An optimisation that did not converge is not done** (until
  2026-10-22 it was passed on as a minimum): its path and the last
  geometry it reached go out of *Failed*, the failure on that geometry,
  so that *Take frames* can take it on.
  An optimisation - a saddle point's too - that took the most cycles its
  program allows is so, however its program ended after: ORCA's is read
  by its words ("The optimization did not converge but reached the
  maximum number of optimization cycles"), never as a result even where
  ORCA then ended normally, and said *not converged* with how many cycles
  (2026-10-30). A plugin's reason for a whole job is of the kind it
  names, one of core's, else a program's error.
- **A plugin may refuse one entry alone** as it prepares the others'
  jobs (an isotope's frequencies in xTB); that entry goes out of *Failed*,
  refused, with why. Kept with the workspace while the others run.
- **A warning never moves an entry.** A calculation's warnings - a kind
  core knows (*frequencies at a geometry not fully optimised*: xtb's
  "Hessian on incompletely optimized geometry!"), else *other*, with the
  program's words - are kept with the molecule, said on its chip, and
  counted on the step's line: *3 with warnings*.
- **The chip says it.** A molecule that failed says why on its chip, in
  the attention colour, and its warnings how many; opened, each in full.
- **A structure that is no minimum is marked so** with the imaginary
  frequencies its program judged it has - xtb's "significant" ones,
  Gaussian's NImag, the modes ORCA marks; never a threshold of Meno's -
  on its chip: *1 imaginary frequency, 382.6i cm⁻¹*. A conformer set
  keeps each conformer's.
- **Populations refuses a group with one that is no result or no
  minimum** - one that failed, by any kind (not converged, refused, an
  error...), or whose marks did not read, then one marked with an
  imaginary frequency - naming every one: *Not every entry is a result to
  stand on: a #2: ... ; a #4 refused - take them out first*, *a #2 has 1
  imaginary frequency, 382.6i cm⁻¹: it is no minimum - take it out first*
  (`notAllMinima`, on `notResults`; any kind of failure from 2026-10-23,
  not converged alone before). *Energy window* refuses the same: one that
  failed or whose marks did not read, and a saddle point on electronic
  energies as on free ones (2026-10-27; free energies alone from
  2026-10-24). Kept in a window or set aside from it, a transition state
  would stand as a conformer it is not. *Choose one*,
  choosing the lowest, and *Duplicates*, ranking by energy which copy it
  keeps, refuse as Populations does; *Choose one* by number chooses any.
- **A conformer set's chip shows no shares** where a frame is no minimum,
  the same two marks, rather than Boltzmann shares of an energy that is
  none (utils/molecule3d `sharesWithheld`); opened, it says why, naming
  the frame: *#2 is not converged: it is no minimum, so no shares are
  given*. Shares a *Populations* step gave before the mark are not shown
  either. Another failure (stopped, refused) is no judgement of a
  minimum, and leaves the shares as they were.
- **The entry record says it too**: `imaginary`, how many imaginary
  frequencies its calculation judged it has - 0 where its vibrations were
  worked out and none is, nothing at all where they were not - and
  `imaginary.first` and `imaginary.second`, the largest and the next, each
  as its size in cm-1 (120.5 for 120.5i), where it has them (2026-10-27).
  Meno judges nothing by them: which structure is a saddle point is the
  chemist's to say, with *Filter* ("imaginary = 1",
  "imaginary.second < 50 cm-1"). One that failed carries its reason as
  its status. And `converged` (2026-10-30), where a run ended converged at
  its geometry, and how: "optimisation", "saddle point optimisation" (an
  optimisation to a saddle point), "highest point refined" (Path search's
  point refined). Only the run that converged sets it, of the geometry it
  ended at, by that geometry's key (workflow/converged); *Frequencies* and
  a single point carry it on while the geometry is that one still - its
  shape as the program gave it back - so a step after Frequencies can
  tell that it stands on a converged geometry; what moves the atoms
  leaves none, nor does a failed run, so one started from its geometry
  stands on none. It is Meno's own: an entry's own property of the name
  never stands (*Filter* on it is refused where one is there, as on any
  name Meno gives). *Barrier* takes a saddle point and a start by it. *Populations* on free
  energies (`lib/nodes/populations`) fails a group with one that is no
  minimum, as Meno's does, each entry saying why.
- **Meno's steps on energies refuse what they cannot use**: an *Energy
  window* below 0 kcal/mol, or no number, as *Populations* refuses a
  temperature of 0 K or below; and an energy that is no number (NaN,
  infinite) is taken as none - by *Energy window*, *Populations*,
  *Choose one* and *Duplicates*' order alike.

A workspace saved before this opens as it was: a calculation in it has
no *Failed* set until it next runs, when it is given one.

### Runs again (2026-10-30)

A run that stopped is run again by a drawn chain, as case F's step 38
has it (WORKFLOWS-FOUNDATION.md): *Failed* → a calculation again, its
options holding the remedy, merged with what was done. What Meno does
for it:

- **Where a stopped optimisation got to.** Where the run stopped once
  under way (ORCA's log says *GEOMETRY OPTIMIZATION CYCLE*, Gaussian's
  *Berny optimization*), its plugin says to read what it wrote, and Meno
  does: the entry goes out of *Failed* at the last geometry whose
  energy the run had finished working out - one it had stepped to and
  not yet worked out is left out, as the reader leaves it out of any run
  cut short; the energy itself is not carried (below) - its way there
  as frames beginning with the geometry it came in with -
  so *Take frames*' *first* starts it again from the beginning
  (a fault of the machine: memory, a floating point exception) and its
  *last* from where it stopped (an SCF that did not converge, a step the
  optimiser could not take). A run that stopped before it was under way
  goes out as it came in.
- **Never a result.** Neither the entry nor its frames carry an energy -
  the run's log keeps them - and the entry stays marked failed, so no step takes anything of
  it for a value, until a step succeeds from it.
- **A step that takes it starts from its geometry alone**, its old
  energy, calculation and mark dropped; its line says so: *started from a
  failed run's geometry*.
- **A step whose stopped runs left where they got to is done**, though
  none finished: a step after it starts there, never running this one
  again first. One that left nothing is failed, as before.
- **Why it failed is something to select on**: `failure`, Meno's own name
  (no property of the chemist's takes it), its program's words - *ORCA
  finished by error termination in SCF* - for a *Filter* to send each
  kind of failure its own way. Where the program said no error, as a run
  brought down under way, it says so, and the last thing the program
  said: *ORCA stopped without saying why, after: ...*.
- **The remedy is the chemist's**: another step's options (another SCF
  algorithm, force constants computed first, more steps), saved as a part
  with the chain and put down again where wanted.

### Where a result set goes, and how many structures it shows (2026-10-23)

A generative chain - *Generate*, *Check structures*, *Stereoisomers*,
*Descriptors*, *Filter* - gives tens to hundreds of structures drawn at
each step. Laid out whole, at the page's scale, each step's set grew over
the next step's card, over the others' sets and over the wires, and the
page could not be read after one run.

- **Clear of everything** (workflow/place): a result set goes to the
  right of its step, level with it, or lower, as far as it must to keep
  `BETWEEN` clear of every other set, every step's card, every structure
  and molecule, and every wire, each wire's curve as it is drawn (look
  `wireCurve`). Its own line from its step, and its wires on to the steps
  it goes into, cross no card or set where there is such a place. Below
  everything is always clear, so a set never lies over another.
  - **In its step's column**: where the next step's card in the same row
    is close, its structures lie in rows no wider than the room before
    it (`columnWidth`), the set growing down, not across the steps after
    it.
  - **Run again**, a set stays where it was, its top left kept, unless it
    grew over something beside it; then it goes where a new one would.
  - A step's second exit's set keeps under its first, and lower still
    where something else is there (`keepExitsUnder`). A step's empty
    exit frames, made as it is added, go clear in the same way (model
    `withExits`).
  - **A wire goes round** (look `wireRoute`). Going on to the right it
    is a curve, running on across all the way, never back out over what
    is beside its ends - but where it falls or rises more than twice as
    far as it goes across, it is no curve, whose long middle would run
    slanting and bowed: it goes across, straight up or down halfway to
    its input, and across into it, only its two turns rounded, so that
    its long run is straight, and wires out of one port share it (*A lane
    of its own*). Where its input lies less than half a bond to the
    right of where it leaves (`WIRE_TURNS`), or to the left of it, or the
    curve would cross another set or card, or come within half a bond of
    one away from its ends, it goes round them all: out a bond to the
    right of its set, up or down to a level clear of all - a bond above
    them, a bond below, or between them, across from one end to the
    other, where that leaves half a bond either side (`levelsFor`) -
    across, and into its input from a bond to its left. Each way up or
    down is stepped aside past what stands in it, or kept short of it,
    between it and its end, where that leaves half a bond either side or
    the frame lies across the line in or out. Of these, the way over
    least, then the shortest; where every way is over something, each is
    tried again round that too, and of those the one over least as far
    along it - to within half a bond, ways over alike - then the shortest:
    where every way must pass a gap narrower than a bond beside a frame,
    the way down past all and back is no less over than the way straight
    in, only longer (where one of its ends lies within half a bond of
    another frame, frames laid over each other, by how many of its points
    are over, as before). It never goes out past both its ends and
    back again round nothing (look `doublesBack`): where the way chosen
    would - every way passing too near something, as a gap of less than a
    bond between a card and the set beside it - it goes straight across
    at the level of the one end or the other instead, where that runs on
    one way across and passes over no more (measured along it, not by
    its points). Nor does it turn more than it must: where that straight
    way - down where it leaves and in level, or across and down a bond
    before its input - is as clear and no longer by its corners, it takes
    that, two bends, not a jog to a bond before its input, nor down,
    across and down again. Gone straight, it keeps that way while dragged
    as it keeps a side: until it is no longer clear, or the way round is a
    fifth shorter. Inside another set or card it never goes,
    however near its ends. Its turns are a bond wide, on the page, so they
    are arcs at any zoom; two turns closer than that both shrink alike.
    It keeps half a bond from every other frame's line (docs/LOOK.md,
    *Room*), but beside its ends. Moved past where it turns over from
    going round to the curve, a wire changes shape once, and the drawing
    eases that (`DURATION.move`). Into a card that names its inputs, a
    wire comes in level for as long as the input's name, under it.
  - **A lane of its own** (look `wireLanes`). Wires out of one port are
    one signal: where they run on one another - the way out of the port
    they share - they are one run, a bus, moved together and never put in
    lanes apart, and they part where their ways do, with no step. Wires
    out of different ports going round that
    would run on one another - up or down, or across, within half a bond
    of each other along the same stretch - are moved apart into lanes half
    a bond apart (`WIRE_LANE`, the room from a frame), as near where they ran as that
    lets them be: half a bond clear of every frame still, no further than
    halfway to the corners either side, and never a wire's runs into its
    ends, so its ends are where they were. The lanes are in the order the
    wires turn in and out of them, so that they cross each other no more
    than they must. Where a way between frames has no room for lanes so
    far apart, they are left as they ran; and a lane that would bring a
    wire nearer a frame than its own way went - its turn round a frame's
    corner - takes it only as far in as keeps that room. While a card or a
    set is dragged, the wires not on it keep the lanes they had when it
    began - taken in for a frame only where a frame's room needs it - and
    only those it moves, or sends another way, are put in lanes among
    them; all are put in lanes anew once it is let go, or the press is
    lost (the window left, a gesture taking it over), with no click. A wire moved into a lane, or out of one, is eased
    there by the drawing. So wires run together as little as there is room
    for: where a way has no room for lanes, or the runs are into their
    wires' ends, they still do.
  - **It keeps its way** while that is still clear: the side it passed
    what it goes round, unless the other side has become a fifth shorter.
    A card dragged past a set makes its wire change way twice at most.
    That is kept only while a card or a set is dragged: let go, every wire
    is worked out anew, and one moved by an undo is worked out as if new.
    A wire coming back, round what it leaves and comes into, is kept as
    the side it passes them too, not as the curve: once taken for the
    curve, it tried the shortest side again the next frame, over the card
    being dragged, and flipped between the two frame by frame (the desk's
    drag sweep: one wire 60 times in 60 one-pixel steps). What a wire has
    to go round is found from the way it would go now, whichever side it
    passed before - else each side, kept, finds others in its way than the
    other does, and wins each other frame. And a way kept, a side or the
    way straight across, stays while it passes within half a bond of a
    frame for less than half a bond along it: a frame's room grazed by a
    point for a pixel of a drag does not send it the other way and back.
    Within a drag, a wire not on the card changes its way only where the
    way it kept is no longer clear, or the other has become a fifth
    shorter, and never back the frame after.
    Placement keeps clear of the same routes, and a change of way on the
    page is eased, never a jump: its ends stay on their ports while it
    eases, only the rest moving (look `wireToward`), and a wire dragged by
    its card is not eased at all (`shapeMoved`). What is drawn is worked
    out as it is drawn, from where the wire is to be then (look
    `WireEasing`), not set aside for the next frame: an update set aside
    can wait behind a drag's on a slower machine, all the drag long, and
    the wire would be drawn where its ports were. Its ends are on its
    ports at every frame, however slow the frames.
  - **Only what moved is worked out again.** Each wire looks at the sets
    and cards near it (`nearWire`), and is keyed by its ends and those
    (`wireKey`): a drag works out again only the wires whose key changed.
    Of those, a wire whose ends moved is worked out at once; one where
    only what is near it moved waits while the frame's 8 ms for wires is
    spent (`FrameBudget`), and is served the longest waiting first. A
    frame serves at least one, so none waits more frames than there are
    wires waiting before it: dragging a card among 100 sets and 45 long
    wires near it, each waited at most 19 frames (0.3 s), and none was
    left waiting 19 frames after the card was let go. Within a
    wire, the ways round are tried shortest first, and no further than the
    first clear of all - the longest a wire takes is about 7 ms on this
    Mac, among 100 sets and 50 cards.
  - **Smooth** (look `byTurn`, `pointsFor`). A wire is worked out as a
    close path, then drawn through points spread by how far it runs and
    how much it turns: one about every 3 screen pixels and every 2
    degrees, more at its bends. A long run up or down turns in an arc as
    wide as the run allows: the curve's handles are half the run, from 40
    to 240 px, but never more than its run across - so an input near
    where it leaves turns tighter, never swinging out past it. Worked out
    finer where it turns tight, so that it is never a kink.
  - **A card put down** (Quick Add, or a wire let go on empty space)
    goes where it was put, or lower where that is over a set, a card, a
    structure or a wire, as far as it must (place `placeCard`): it is made
    there, so nothing on the page moves. A card the chemist drags lands
    where they let it go. Put down
    near the window's edge, or moved lower, it is brought into view with
    the sets it will give, as what is put down is shown.
- **How many it shows** (look `DRAWN_ON_PAGE`, the maintainer,
  2026-10-23): as many of its structures as take no more than 400 square
  bond lengths of the page between them - each its drawing's box and its
  number's room, in the step's order - and 50 at most. That is about a
  dozen drug-sized structures, and many more small ones. The rest are
  **held in the set**, after them, off the page
  (`WorkflowSet.drawnCollection`). Its count line says how many it shows of how
  many: "50 of 120 structures shown" (entries `countSaid`).
- **Holding is the display alone.** All of them stay the set's, in order:
  the step after it is given each, those on the page then those held
  (flow `inputOf`, run `inputEntries`, and a plugin's step alike); the
  step's line, the set's count, a run kept and shown again, and the file
  (saved and read back, the shown ones as members, the rest as the set
  holds them) all have all of them. A set whose step is deleted holds
  them still, and deleting the set asks first, since those held go with
  it.

### Structures drawn as results (2026-10-21)

Enumerate P2 (WORKFLOWS-FOUNDATION.md, *Enumerate*): structures drawn, in
2D, as what passes into Meno's own steps and comes out of them, beside
molecules in 3D. *Enumerate* (P3) is the first step to use it.

- **In.** A set of structures drawn comes into a step of Meno's as its
  entries, each the structure as it is drawn: its atoms and bonds, where
  they lie, its wedges and labels (`workflow/run` `drawnEntries`, an entry
  a `DrawnEntry`). Never made 3D here: a step after it does that, as
  everywhere else.
- **Out.** Such a step's outcome holds structures drawn (`DrawnOutcome`):
  those it kept, and those it set aside. Each exit's set holds its own,
  on the page and in the step's order, each moved whole to its place in
  the set, laid out as a run lays its results by its atoms' box. Each is a
  structure of its own, its atoms, bonds and groups numbered afresh, as a
  paste is. So a step may give many in one numbering, as Enumerate gives
  its products in their template's, and they stay apart. Any of them
  that is a record of a stack comes out a structure in its own right. The
  set says it holds structures drawn, and wires on as a set of them does.
- **Run again**, the step takes away what it put in its sets, and
  nothing else, and the new ones take their place, the set's top left
  where it was. Each set keeps which atoms its step put on the page
  (`WorkflowSet.put`), and those atoms, with their bonds, are all that go:
  - a structure of the chemist's joined to one of them by a bond keeps
    its own atoms, even a carbon then left without a bond;
  - a structure dropped into the frame is none of the set's (a result set
    takes in nothing: *Members are explicit*), and stays where it is;
  - a structure of the chemist's drawn elsewhere is untouched.

  A file keeps those atoms by id, as it keeps members, but only those it
  writes: a set kept out of the file keeps none, since their ids could be
  another atom's once the file opens and numbering goes on. A pasted step
  or procedure keeps none either.
- **Kept and shown again.** A run kept keeps its structures as they
  stand when the next run takes their place, an atom moved by hand
  meanwhile with them (`RunResults.drawn`, one type for the store, the run
  and the file). Shown again, they come back in the step's sets.
- **In the file**, a run kept keeps them as the page's drawing is kept,
  and reads them back as it is read (`readDrawn`). A structure that does
  not read is left out, as a molecule is. A result set kept out of the
  file (*Don't keep in the file*) leaves out the structures it holds now,
  as well as its molecules, saying how many it held. The step's earlier
  runs are still written with what each gave, structures and molecules
  alike: the set's choice does not reach them yet.
- **A molecule in 3D made from one of them** (by *3D structure*, or a
  *Conformers* step after it) keeps its link to that drawing by its atoms.
  Where the set was kept out of the file, those atoms are not in it, so
  the molecule opens with its link to the drawing gone, as when the
  drawing is deleted.
- **Through a calculation** (*Optimise*, *Energy*, *Frequencies*, or a
  program's *Conformers*), a molecule keeps that link, and its bonds to
  ring centres, where it is still the same compound: each atom bonded to
  the same others, by the bonds where its atoms stand, before and after,
  and of the charge it went with, where the calculation says one. So conformers optimised and
  given their populations still stand by the structure drawn. It keeps
  neither how it was made nor its stereo labels, which were of the
  geometry it came with; its configurations are perceived anew from its
  own geometry. Where a bond broke or formed, or the charge changed, the
  link is dropped, and *How it was made* says why (2026-10-24; until then
  every calculation dropped it). Two atoms are bonded within 1.2 times
  the sum of their radii, so a bond that changes but stays within that
  reach - a stretch towards a transition state, a symmetric hydrogen
  bond - is read as the same compound and keeps the link: right for
  minima. One that crosses it, as a proton shifted does, drops the link.

None of Meno's steps takes structures drawn yet, so a wire from a set of
them to one is refused, as before. P3 adds *Enumerate*, the first.

**A large set of structures drawn** is held as a large set of molecules
is (*A large result set*): an exit that gives more than 50 puts none of
them on the page. Its set holds each structure as the step drew it, in
the step's order, with its record, and its frame says how
many ("120 structures"). The steps after it take them from there, and a
run kept keeps them. The workspace's file keeps them too, or, with *Don't
keep in the file*, only their count and hash. Opened from a file, a
structure of theirs that does not read is left out and counted. A
molecule in 3D made from one of them is linked to no drawing, since its
atoms are on no page. Run again with 50 or fewer, the step puts them on
the page as before. Copied with its step, the set holds nothing until the
step runs again, as a large set of molecules does. Held off the page,
they are kept as the step drew them: a change of the workspace's style
reaches them only once they are on the page.

### C=N double bonds whose E/Z is none of their own (2026-10-23)

A guanidine a Generate made, CN=C(N)NCC(O)c1ccc(OC(F)F)cc1, came out of
*Stereoisomers* as four: two for its stereocentre, times two for its
C=N. Those two are one compound. A hydrogen on either of the carbon's
other nitrogens moves to the imine nitrogen, and the double bond moves
with it, so the two "isomers" interconvert. Its E/Z is no configuration
of its own, and Meno never chooses one for it.

- **Which C=N** (the RDKit plugin's `moving_cn`), as the InChI Technical
  Manual takes them (S. E. Stein, S. R. Heller, D. V. Tchekhovskoi,
  I. V. Pletnev, *InChI version 1, software version 1.04 (2011),
  Technical Manual*):
  - one whose carbon has another neighbour, an N, O or S, that carries
    a hydrogen: an amidine, a guanidine, an N-acyl amidine, an imidic
    acid (the amide's other form). That hydrogen's 1,3-shift is the
    manual's mobile H (IV.b, Step 6, Table 6), and a bond that is double
    with the H in one place and single with it in another it presumes
    rotatable, with no E/Z (Appendix 5b; its example is an N-methyl
    imidic acid);
  - one whose N carries a hydrogen, C=NH, which RDKit's enumeration
    already gives one way only;
  - an amidinium or guanidinium C=N+, its double bond shared with the
    neutral amino N beside it on the carbon.

  An imine whose N bears a carbon (an N-alkyl aldimine turns over by
  inversion at N, some 30 kcal/mol: J. Chem. Soc., Perkin Trans. 2,
  1976, 1501), an oxime and a hydrazone keep theirs: their E/Z is a
  configuration at room temperature, or one Meno cannot rule out. Only a
  C=N in a localised double bond is looked at; one in a ring of seven
  atoms or fewer has none to give anyway.
- **One definition, everywhere stereo is counted or made**: the plugin's
  `open_stereo` leaves such a C=N out of what a structure leaves open,
  and its enumeration holds it one way while the rest are tried in 3D
  (the other way where nothing embeds so), then lets it go again. So
  *Stereoisomers* gives the guanidine two, *Generate*'s count of those
  with stereo left open does not count it, *Conformers* does not refuse
  it for it, and *3D structure* does not ask about it. A C=N drawn with
  its E/Z keeps it, as anything drawn does.
- **Said on the record**: each structure *Stereoisomers* keeps or makes
  that has one carries `stereo_not_enumerated`, a text - "E/Z of 1 C=N
  not enumerated: its double bond moves with a hydrogen on an N, O or S
  beside it (an amidine, a guanidine, an imidic acid) - no configuration
  of its own" - so that a table or a Filter can read it.
- **A double bond of either configuration**, as Meno draws one a SMILES
  gives no E/Z for (CFG=2), and a stereocentre on a wavy bond, are left
  open, as one drawn plain is. Before, `open_stereo` counted them as
  nothing open, though RDKit's enumeration gave each both ways the
  moment anything else was open: an N-methyl imine alone came out as
  drawn, beside a stereocentre as both, and *Conformers* chose one for
  it, unsaid. Now each is counted, made and refused alike.

The C=N's E/Z is left to the 3D structure: a molecule made in 3D from it
has whichever the embedding places, as a single bond has its turn.

### A structure drawn's record (2026-10-22)

A structure a step gives keeps a record of its own, as an entry does
(WORKFLOWS-FOUNDATION.md, *The entry*). The drawing itself is its
structure and its geometry, in 2D, so the record holds the rest
(`DrawnRecord`, `store/types`):

- `from`: the entries it was made from, by id, where they have one. A
  generated structure names its seed's, and an Enumerate product its
  template's - a template a step gave; one drawn on the page has no id, so
  its products name none. Each also carries the values of the one it was
  made from as that one's (`made_from.nll`), never as its own, so that a
  Filter on a parent's value reaches what was made from it.
- `properties`: by name, each a `Property` as lib/entry has it, with its
  value, its unit from Meno's units table or "none", its status, and what
  worked it out. Enumerate's `number` and `made.how` are kept here, and so
  is a generative model's value for each structure.
- `status`: done, failed, or set aside, with why (`{ aside: "a radical" }`).

All of it is optional. A structure the chemist drew has none.

- **Where it is kept.** A set's member keeps it beside the structure's
  atoms (`Member.structure` and `.record`). A step's entries carry it in
  (`DrawnEntry.record`, from `inputOf`'s `records`), and its outcome
  carries it out. A run kept keeps it with each structure
  (`RunResults.drawn`, as `DrawnModel`), and so does a large result set
  held off the page (`WorkflowSet.drawnCollection`).
- **It stays with the structure** as the set's members settle again,
  moved whole or turned.
- **It is of the structure it was given for.** The record keeps which
  (`of`: the structure's identity, as Duplicates and identity read one -
  chem/identity - hashed). Each label that stands for atoms is read as
  those atoms (`labelsDrawnOut`): those it holds, as Clean-up writes a
  group by its label, else the dictionary's. So the key is the structure's
  elements, charges, masses, unpaired electrons, bonds and each
  configuration the drawing shows - not how it is drawn: not where it
  lies, which bonds are wedged or which way, whether an H is drawn, nor
  whether a group is written by its label. Clean-up, which draws the same
  structure afresh, keeps a record as it is. Where its wedges cannot be
  read (drawn crossed, or at a three-bonded N, B, Se, Te or Sb) or its identity is
  not worked out in full, the identity does not hold its configuration, so
  the drawing's own key is in `of` too: any change to the drawing is taken
  for a change of structure.
  Edited since - an atom, a charge, a mass or a bond changed, an atom
  taken away or added, the configuration turned to its mirror image, a
  group's label or what it holds changed, joined to a structure of the
  chemist's - the structure is another, and its properties and status were
  not worked out for it. They are taken away, and the record says so
  (`stale`: "its properties were for the structure before the edit");
  what it came from is kept. Undone, the structure is the one they were
  for again, and the record is as it was. Two such structures joined into
  one keep what each came from, and the properties of neither.
  The identity is worked out once for each structure as drawn, and again
  only when its drawing's key (`drawnKey`, with what its labels hold)
  changes.
- **It is in what a step after it is keyed by** (`inputKey`): all of the
  record but `of`, which the structure's own key says. The same structure
  with another value from the step before has not been run on, and the
  step's card says it has changed.
- **A copy of its set carries it.** A set copied goes without its members,
  and put down holds what then lies inside it. Each structure that had a
  record, pasted whole, takes it up again (`WorkflowSet.carried`, by its
  atoms' ids as pasted), of the structure as pasted.
- **In the file** it is written with the member, and read back as data
  (`readDrawnRecord`). Each property is read as lib/entry reads one
  (`propertyIn`): one whose value is not a number, a text or true/false,
  whose unit is not in the units table, whose status is not one of
  lib/entry's, or whose `by` or `at` does not read, is left out. So is an
  entry it came from that is no text. Each one left out is counted and
  said as the file opens (FILE-IO.md, *What does not read*). A record left
  with nothing is none.


### A structures set as a table (2026-10-23)

A set of structures drawn - *Generate*'s, and *Check structures*',
*Stereoisomers*', *Descriptors*' and *Filter*'s after it, *Enumerate*'s,
or the chemist's own - opens as a table in the column, as a set of
molecules in 3D does: *Open as a table* on its menu (workflow
`structuresTable`, `StructuresTableBody`).

- **Every structure it holds is a row**: those on the page and those it
  holds off it (`drawnCollection`), all of them, in the step's order - the
  page's first, as a step after it takes them (`setStructures`). A set
  that shows 50 of 120 has 120 rows.
- **Its columns**: its place (#); its SMILES as the step that made it
  gave it (`SMILES (record)`, `smiles` on its record, its stereo with it),
  where any did; its SMILES as Meno writes it from the drawing (`SMILES
  (drawing, constitution only)`: Kekulé, a label of no element as `*`,
  no `@` or `/`). Meno reads the drawing's stereo - wedged centres, cis
  and trans, axes (lib/layout `readStereo`, as a structure's identity
  does) - but does not write it in this SMILES yet: where a drawing
  carries any, or wedges that do not read, its row says so in *stereo in
  the drawing* ("stereo drawn, not written here"). The two SMILES are
  never mixed in one column, and two enantiomers never read alike
  unsaid.
  Then its state - "finished", "failed: <why>", or "edited
  since: its properties were for the structure before the edit", never
  finished then (`drawnAsEntry`, the record's `stale`); why it was set
  aside, where any was; then each value its record holds, under its own
  name, a number's with its unit - those of the structure it was made
  from as named (`made_from.nll`), an *Enumerate*'s `number` and
  `made.how` among them. A value no column can hold, or one with no
  value, is counted in its head, as for molecules (lib/table
  `moleculesAsTable`).
- **A failed structure's values**: one worked out correctly on the
  structure is still true, and is shown as it is, its state carrying the
  failure. One the failed step was to give says so in its cell - "not
  worked out: <why>" (or "not applicable: <why>") - never blank, never a
  number; a column of its own where no row has it worked out. A chart
  takes a failed row as no result.
- **Sorted by any column**, its name pressed, once up and again down; #
  back to the step's order. Those with no value there - none, or not
  worked out - come last either way. As many rows as there are drawn only where
  they are seen.
- **One conversion** (`structuresAsTable`, of the entries a step takes):
  the table Chart is to take structures by too, each row's id and what it
  is (`what`: "structure 3 of 120") kept for its points.

### Enumerate: R groups (as built, 2026-10-22)

As WORKFLOWS-FOUNDATION.md specifies (*Enumerate*, *R groups*), with what
the build settled:

- **The step.** *Enumerate* is Meno's own, and plugins can't take its kind
  (`MENO_ONLY`, lib/plugins/steps). It takes one set of structures drawn,
  *Template*, and gives *Made* and *Aside*. Its one option, *R groups, one
  to a line*, is a box of lines (`LinesOption`, lib/options). Beside each
  line, as it is typed, the box shows what the line was read as: the
  group's label and formula, the element, or why it does not read.
  Settings shows no box of lines, since a list belongs to one step.
- **The join is `expandAbbreviation`** (Workspace/document). The canvas's
  *Expand abbreviation* calls it, and Enumerate calls it with the group in
  hand. There is one function for both.
- **What stops it before it runs.** Each reason in the specification is
  said in full, naming the line or the atom. A template whose wedges do
  not say a configuration stops it too, since identity could not judge
  its products.
- **Valence.** Where a plugin does the checks and is at hand, the
  template and each option are checked first, and anything flagged stops
  the step in the checks' words. Otherwise the set says *Valence not
  checked*.
- **Configurations left open.** Where a plugin finds stereoisomers and is
  at hand, the products made are each asked, and the set counts and names
  by number those with a configuration left open. Otherwise it says they
  were not looked for.
- **The products.** Each is drawn as the join draws it and is not laid
  out again. Each keeps its record (*A structure drawn's record*): its
  number, how it was made, and, if it was set aside, why (*Same as 2*).
  On the page, each one's number is shown under it (*#2*), with how it was
  made on hover. Its result sets carry the series' core
  (`WorkflowSet.core`). More than 50 are held in the set itself, off the
  page (*A large set of structures drawn*).
- **Duplicates** are judged by `identity()` (lib/chem/identity), which
  also says when the canonical search ran out of steps. The set then says
  how many products a duplicate may have been missed among.
- **Known answers against RDKit.** The fixture
  (`workflow/testdata/enumerate.rdkit.json`, made by
  `scripts/identity/rdkit.py`) holds each product of the cases in
  `workflow/testdata/enumerationCases.ts` by the SHA-256 of the molfile
  Meno writes of it. It also holds RDKit's canonical SMILES of that
  molfile, and of the compound written by hand for that combination. The
  test checks that each product is that compound, configurations
  included, and that the products set aside as *Same as n* are exactly
  those whose SMILES are product n's. No case differs by design so far.
- **Not yet.**
  - A set of structures drawn held off the page can't yet be opened as a
    table or shown with a sample of its structures, as a large set of
    molecules in 3D is (6b, 6c). Its frame says how many it holds, and that
    they are on no page.
  - Copied without its step, such a set pastes as an empty frame of the
    chemist's: what it holds is on no page to copy along.
  - The series' core is by its atoms' places in each product as made. A
    product edited by hand afterwards can leave them out of step; nothing
    reads the core yet.
  - *Substituent swap* and *Scaffold swap* come after.

### Enumerate: substituents (as built, 2026-10-23)

As WORKFLOWS-FOUNDATION.md specifies (*Enumerate*, *Substituent swap*).
*By* on the step chooses the way: R groups (the default) or Substituents, and
the card shows only that way's options (`Option.when`).
- **`workflow/substituents.ts`** reads the groups (`readGroups`, each line by
  `readOption`, as an R list's) and the positions (`positionsOf`: by the
  template's atom order, each named by its atom, with every reason that stops
  it). `substituted` makes each combination by putting an R atom at each
  position given a group and handing it to R groups' `joined`, so there is one
  join, one numbering and one identity for both ways. At a heavy atom the R
  goes where `calculateNewBondPosition` (the canvas's extend gesture) puts a
  new bond with no pointer to follow; a drawn H is made the R in place.
- **Positions are an `atoms` option**: the chosen atoms' ids, never
  remembered for another step (`rememberable`), and not shown in Settings.
- **The valence checks** ask about each group as they ask about each R
  option (`valenceFlagged`, by way).

### Tables (2026-10-22)

A table is a value of its own (docs/WORKFLOWS-FOUNDATION.md, *Values and
their types*; PR 10, first part: `src/lib/table.ts`): rows and typed
columns - numbers with their unit from Meno's units table (or none: a
count, a share), text, true or false, an entry's id. A column of numbers
says what worked them out and where, where that is known.

**Read from a file** (`readTable`): CSV, or TSV where the first line has a
tab, or values separated by semicolons where it has those and no commas
and the second line has them too (as spreadsheets write CSV where a comma
is the decimal mark; one column's name may hold a semicolon) - read as
RFC 4180 has it (quoted fields may hold the delimiter, line breaks and
doubled quotes); a byte-order mark before it is left out.
- The first line names the columns, each with its unit in brackets:
  "energy (kcal/mol)", "T [K]", "count (none)". A unit Meno's units table
  does not know is said, and its column is read as text.
- A column is of numbers where its header gives a unit, or where every
  cell it has reads as one; of true or false where every one says so;
  else of text - and where some of its cells are numbers, why ("read as
  text: 1 of 4 cells are no number", with the first).
- A name given twice: the second is "name (2)", and that is said.
- A number is digits with a point, a sign (the minus sign too) and an
  exponent - nothing else: no thousands' separators, since a comma means
  one thing in one place and another elsewhere.
- **A column's head is its label, where it has one** (`TableColumn.label`,
  2026-10-30): "Product" over the column named "map.entry". Its
  name stays its key - what rows are matched on, what a condition names -
  and hovering on the head says both ("Product · map.entry"). A
  number column's head stands at the right, over its numbers, and its
  numbers are written with one count of decimals, so that their points
  line up ("0.00" over "0.37"): an energy in kcal/mol with two, as a
  molecule's chip writes one under ten, so the same value reads the same
  in both there (at ten and above the chip writes one decimal, the column
  still two, its points kept in line); any other with as many as the one
  shown that needs most. The value kept is as it came.
- **A table's set is as tall as the rows it shows** (`tableSetSize`): its
  heads, up to six rows, and the line saying what it is, with nothing
  under it.
- **What does not read is counted and said**: a cell of a number column
  that is no number, where it is and what it said; a row with more or
  fewer cells than the columns. An empty cell is no value, as written.

**Molecules seen as a table** (`moleculesAsTable`): one row per entry, in
order - its id, its constitution (Meno's identity key of its atoms,
charges and bonds; isotopes are not part of it), its configuration (as
perceived; "not known" where it was not, or an element is left
unspecified) - and each property a column.
- A property worked out in more than one way - another method,
  temperature, solvent, geometry, step, run or plugin - is a column for
  each, named for what tells it apart from the others ("energy · B",
  "G · 310 K", "energy · step 4"), numbered only where that still leaves
  two alike - never one column of values that are not alike. The name is
  made from what differs among the entries there are: a new way arriving
  can change it.
- Where it was worked out is told apart as at the entry's own geometry -
  every row its own, one column ("energy") - or at another geometry than
  its entry's ("energy · at another geometry"): a conformer's energy at its
  own geometry is one column for all the conformers, never a column for
  each geometry.
- The column at another geometry mixes geometries: each row's value may
  be at a different one, none of them its row's. Its name says so always,
  even where it is the property's only column ("energy · at another
  geometry", never "energy").
- An entry whose geometry is frames, a drawing or none has no geometry
  of its own a property could be at: a property of it is read at another
  geometry.
- A property with no value, or not worked out (failed, or still to be),
  is missing in its row, and counted, each said apart.
- A property that is no number, text or true or false - a list, a table,
  a vector - is no column, and that is said.

**What flows along a wire** (PR 10, second part): a kind of set -
structures, molecules, conformer sets - a table, or a number with its
unit (`VALUE_KINDS`); plugins may take and give these, and bring none of
their own. A chart is Meno's alone (*Chart*, *Energy diagram*), and goes
into no step. Nothing stands for anything else, but one thing: molecules
or conformer sets go into an input that takes a table, seen as one (as
above) - FOUNDATION's one view that loses nothing.

**A set holding a table** shows its first rows and columns in its frame,
each number column with its unit, and says what it is: "12 rows · 3
columns · 1 not read", what did not read and what was left on hover. Its
count line says its rows. It is kept in the workspace's file, copied with
its table, and takes in nothing dropped into its frame. **A set holding a
number** shows it with its unit, and what worked it out.

**A text that reads as a table** - a CSV or a TSV, or another text of two
columns or more, every row - offers *Put on the page as a table* on its
menu: a set holding it, named for the text, beside it. Prose is not
offered.

### Filter (2026-10-22)

*Filter*, Meno's own, keeps the entries whose properties meet its
conditions (lib/nodes `filter`, WORKFLOWS-FOUNDATION.md, *Meno's own
nodes*): the first proof of a generative workflow - structures a model
generates, made 3D, filtered on the model's NLL and 2D properties - needs
it.

- **Its conditions are typed**, one to a line or each after a semicolon
  (one inside double quotes is a text's): a property, a comparison (< ≤ >
  ≥ = ≠, or <= >= != as typed), and a value - a number with its unit where
  the property has one ("nll < 30", "energy ≤ -76.4 Eh", "gap > 40
  kcal/mol"), true or false, or a text. *Kept where* is all of them met,
  or any. Its card says them as read ("nll < 30 and mw ≤ 500"), or why one
  does not read - a unit Meno does not know, no comparison, one read whole
  that is none (=<, ≥≥), a quote not closed - and it does not run until
  they do.
- **A property against another of the same entry** (2026-10-30): "its"
  and a property's name, in place of a value, is that entry's own ("last
  end = its product": a saddle point kept where its path came down at the
  product it was made for). Texts and true or false compare exactly, by =
  and ≠ alone, and only with one of their own kind. Numbers compare in the
  first property's unit, the other converted within its dimension, equal
  within a part in 10¹² of the larger, as a value typed is. An entry
  without either property does not meet it, and says which it has not
  ("it has no product"); one of them failed or not worked out likewise.
  A text that begins with "its " is written in double quotes; a bare word
  is a text, as before.
- **A number is compared in the condition's unit**, converted within its
  dimension only: 0.5 eV against 40 kcal/mol is 11.530274 kcal/mol. A
  property of another dimension, or of none where the condition has one,
  or a number that is not finite (NaN, an infinity), meets nothing, and
  says so. Kept where any is met, an entry kept with a condition that could
  not be asked of it is counted on the line, with why ("2 of them with a
  condition not asked (1: it has no gap; ...)").
- **What it reads** is each entry as Meno's entry record (`entryOfSet`):
  its properties as its molecule's frame carries them
  (`Molecule3D.properties`, one map for each frame - a model's NLL, a
  descriptor - each with its unit and what worked it out; a structure
  drawn's, from its record, on each conformer *Conformers* makes of it,
  2026-10-23), and Meno's own:
  its energy, in hartrees, its number among its compound's conformers,
  its compound as its group, its name, its thermochemistry. A condition on
  a name that is Meno's own and one an entry carries of its own too is
  refused ("which is meant cannot be told"), never read as either; the
  entry's own goes on with it, unread.
- **An entry's state** is Meno's own too (`state`, entries `entryState`):
  "finished" where it is a result to stand on - converged, not failed,
  its file's marks read - else why not, in the words a step's line
  counts failures in ("not converged", "refused", "the program stopped
  with an error"), or "marks not read". "state = finished" keeps the
  finished and sets the rest aside, each saying what it is ("not state =
  finished (not converged)"): the Filter a step's refusal names, where a
  value is read from results (an Energy diagram's levels: meno
  `STATE_FINISHED`). A text or true-or-false condition not met says the
  value, as a number's does. On a condition on any value but its state,
  an entry that is no result is never kept, though its value would pass:
  it goes to *The rest* named, its state said ("a #2 not converged") -
  its value is not to be trusted.
- **Structures drawn** - *Generate*'s, after *Check structures*,
  *Stereoisomers* or *Descriptors* - are read by their record alone (meno
  `filteredDrawn`): the properties a step gave each (`DrawnRecord.properties`:
  a model's NLL, Descriptors' "mw" in g/mol and "tpsa" in Å²), each with
  its unit and what worked it out; the drawing itself is not read, and
  Meno has no names of its own on them. A structure edited since its
  properties were given has none left (its record's `of` no longer its
  structure's: workflow/entries `recordNow`): it goes to *The rest*
  saying so, its conditions not asked, and counted by that on the line
  ("rest 1 (1: its properties were for the structure before the edit)";
  lib/nodes `filter`, its `unread`). Its exits hold structures drawn:
  those kept as they came, but for the status an earlier step gave them -
  kept, none is set aside, whatever it came in saying; and *The rest* each
  with its record saying why it was set aside, after an earlier step's
  why where one gave it ("Same as 2; not mw < 500 g/mol (612.4 g/mol)").
  More than are laid out on the page
  come in held in their set, and go out so (`LARGE_SET`), as any step's
  structures drawn do. A structure's `state` is Meno's here too: "failed:
  <why>" where its record says it failed, else "finished" (one set aside
  before, the same as another, is no failure). On a condition on any value
  but its state one that failed is never kept, but set aside named
  ("structure 2 failed: ..."); on its state alone it is judged by that.
- **Its two exits add up to what came in**: those kept, in the order they
  came, and *The rest*, both counted on its line, with how many of the
  rest were set aside for each reason ("2 of 4 entries kept · rest 2 (1:
  not nll < 30 (40); 1: it has no nll)"). An entry with no value for a
  property named does not meet that condition, and is never dropped
  unsaid. What it keeps and sets aside is as it came: its number, its
  energy, its properties.
- **A molecule's properties are kept in the file**, a map for each frame;
  one that does not read - of a unit Meno does not know, or a list - is
  left out, and a list of maps that is not one for each frame is not
  read. A frame edited into a molecule of its own keeps none: they were
  the result's.

A descriptor's unit reads as Meno's units table has it: "mw < 500
g/mol", "tpsa < 90 Å²" (or Å2).

Not yet: conditions picked from what comes in rather than typed.

### Rank (2026-10-29)

*Rank*, Meno's own, orders entries by a value they carry and keeps the
first N (lib/nodes `rank`, WORKFLOWS-FOUNDATION.md, *Meno's own nodes*):
the conformers within a few kcal/mol taken on, at most so many (case F,
steps 9, 30 and 34), the lowest of each species and each path (step 32),
the first in each path (step 48).

- **Its options**: the property it ranks by (*By*, energy unless named),
  lowest or highest first, how many it keeps (*Keep the first*: 1 unless
  set, the lowest of each, as case F takes it at steps 32, 44 and 48 - the
  chemist's to change), and within what: *Each group* - a conformer set's compounds -
  *Each value of a property*, the property named (*path*, *species*, as a
  Tag wrote them), or *All together*. Its card says it in a line ("the
  lowest 64 by energy in each species"), or what it still needs.
- **What it gives**: those kept, in their ranked order, on its first exit;
  *The rest* on its second, each as it came, its place written on it
  (`set_aside`: "ranked 3 of 7 in its group by energy, lowest first; the
  first 1 kept"). Ties keep the order they came in, and one ranked out
  with the same value as the last one kept in its group - a degenerate
  conformer - says so, on it ("tied with a #2, which was kept as it came
  first") and on the line ("1 tied"): which is kept is never
  chosen silently.
- **Only values that can be ranked together are**: numbers of one
  dimension, converted to the first one's unit, each worked out the same
  way - its conditions, program, method, basis and thermal treatment
  (lib/nodes `workedOutAs`). A group whose values were not is set aside
  whole, saying how two of them differ, by name ("dg values differ in
  method: M (a #1) and N (a #2)"); never ranked as one.
- **An entry that is no result is never ranked**: failed, not converged,
  its marks unread - set aside saying so ("not ranked: not converged"),
  though its value would rank first. An entry with no value, or none of
  the group property, is set aside saying that.
- **Its line says only what came of it**: how many it kept, and how many
  went to the rest, with those tied and those not ranked counted, as
  *Filter* says its own ("2 of 6 entries kept · rest 4 (1 tied, 2 not
  ranked)"). What it ranked by its card says,
  above; each value's level, program, solvent and temperature stay on its
  record, as they came; each of the rest says its own place or why.
- **Its first exit is named by how many it keeps**: *The first* where it
  keeps one of each, *The first 3* where three.
- **In each group, where each is its own group** - molecules, not
  a conformer set's compounds - it chooses nothing, and its line says so
  ("2 of 2 kept: each molecule is its own group"): *All together*
  ranks them against one another.
- **A number property's values are one group where they are one value**:
  each in the first one's unit, to 12 significant figures - 0.3 and 0.1 +
  0.2 one group, and one in kcal/mol and another in hartrees one group
  where they are the same energy; 1.00001 and 1.00002 two.
- It takes molecules in 3D and conformer sets; structures drawn are not
  ranked yet.
### Join (2026-10-29)

*Join*, Meno's own, puts values of one set's entries onto another's
(lib/nodes `join`, WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): the names
of a reaction path's two ends put back on its saddle point, matched on
*path* (case F, steps 27 and 50), a docking score back onto its ligand.

- **Two inputs**: *Onto*, whose entries come out with what is put on, and
  *From*, whose properties are put on. Each of *Onto*'s entries is matched
  with the one entry of *From* that has the same value of the property
  named in *Matched on* - an ID a Tag gave, which rides along with every
  entry made from it (lib/nodes `matchedOn`, as Re-bond and Compare
  bonding match) - never by an implicit rule.
- **What is put on** is typed in *Put on*, one to a line or each after a
  semicolon: a property's name ("species"), or a name and the one it is
  put on as ("species as first end"). Each keeps its record as it was:
  its value, its unit, where (its geometry, temperature, solvent) and by
  what it was worked out. A value worked out at From's geometry stays one
  of that geometry; nothing put on is read as worked out at Onto's.
- **Nothing is put on silently.** An entry with no match, or more than
  one ("2 entries of From have its path, q"), goes out of *Not joined*
  saying so; so does one whose match is no result - failed, not
  converged, its marks unread ("its match is not finished: not
  converged"): its values are not to be trusted - one whose match lacks a
  property asked for, and one that has its own under the name it would be
  put on as: nothing of its own is overwritten. From's entries that
  matched none are counted on the line.
- **Meno's own names are never put on**: an energy, a state, a thermal
  correction, vibrations - the names an entry's own record gives its own
  values, worked out at its own geometry. A value put on under one would
  read as of the entry's geometry; *Put on* refuses it ("put it on under
  another name"), whether the entry has one or not.
- A property whose name holds " as " cannot be put on: *Put on* reads it
  as a name and the one it goes on as.
- Its card says it in a line ("species as first end, matched on path"), or what it
  still needs. It takes molecules in 3D and conformer sets; a table to
  join from, and joining by identity or by drawn atom (the foundation's
  other two ways), are not built yet.
### Add and Number (2026-10-29)

*Add* and *Number*, Meno's own, make the free energy at a higher level
of theory (lib/nodes `add`, `standardState`; WORKFLOWS-FOUNDATION.md,
case F, steps 31 and 42): a single point's energy, plus a thermal
correction to G worked out at another level, plus the standard-state
term.

- ***Number*** takes nothing and gives a number in a set of its own,
  with its unit and what worked it out:
  - *Standard state, 1 atm to 1 mol/L*: the free energy of taking a mole
    of ideal gas from 1 atm to 1 mol/L at temperature T,
    R T ln(R T c°/p°), with R = 8.314462618 J/(mol K) (CODATA 2018), p° =
    101325 Pa and c° = 1 mol/L - 1.894 kcal/mol at 298.15 K. Its record
    says the formula and constants and the temperature: its source is its
    formula. *At* is 298.15 K unless set, the temperature thermochemistry
    is tabulated at, as Populations' is - the chemist's to change.
  - *Typed*: a value and a unit from Meno's units.

  Its card says what was chosen ("standard state", "standard state at
  310 K", or the number typed); its line and its set, the number as
  Meno writes one - an energy in kcal/mol as the chips write it, "1.89
  kcal/mol". The value keeps all its digits.
- ***Add*** takes *Molecules* and, where wanted, a *Number* (an optional
  input: it runs without one). Its options: the values to *Add*, one to a
  line or each after a semicolon ("energy; thermo.g-correction"), and the
  name the sum is written *As* ("G-DFT") - never a name Meno gives an
  entry's own values (an energy, a free energy). Each entry gets the sum,
  in the first value's unit; the number wired in is summed as it is. Its
  card says the formula ("G-DFT = energy + thermo.g-correction + number",
  the number where one is wired in); its line, what it gave ("2 of 2
  entries given G-DFT").
- **An entry that is no result is never summed** - failed, not converged,
  its marks unread: set aside saying so ("not added: not converged"),
  counted on the line.
- **Only values of one geometry are summed**: each named value must be of
  the entry's own geometry (its record's geometry key). One of another
  geometry, or of none, sets the entry aside, saying which ("its
  thermo.g-correction was worked out at another geometry than its own").
  A number wired in has no geometry, and is summed. The parts must agree
  on temperature and pressure where they say them - the standard-state
  term's temperature among them - or the entry is set aside, naming both.
- **The sum keeps each part as it was** (`Property.parts`): the property
  it was, its value, unit, and where and by what it was worked out. Its
  own record claims no method or basis: it says where it is (the
  geometry, the thermal part's temperature and pressure, and the solvent
  where the parts that say one agree - none where two differ, a single
  point in one and a correction in the gas phase: each part keeps its
  own), and in words what it is the sum of - "sum: energy
  (wB97X-D/6-311+G(d,p), Gaussian, SMD(chloroform)) + thermo.g-correction
  (wB97X-D/6-31G(d), Gaussian, 298.15 K, 1 atm, quasi-RRHO) + standard
  state (...)" - never one level for the whole. A step that takes a free
  energy (a barrier, a population) reads its parts to check each against
  another's.
- An entry with its own value under the name already, or missing a part,
  is set aside saying so; a number wired in of another dimension refuses
  the step.

### Ensemble energy (2026-10-30)

*Ensemble energy*, Meno's own, takes a group's members - a compound's
conformers - together (lib/nodes `ensemble`; WORKFLOWS-FOUNDATION.md,
case F, step 44, beside Rank's lowest):

  G = G_min - R T ln Σ g exp(-(G - G_min) / R T)

with each member's degeneracy g (1 where it says none; one that says a
degeneracy that is no count - 0, below 0, not a number - sets its group
aside, saying so), R = 8.314462618 J/(mol K), and T the temperature its
members' values state.

- **Its options**: the value it takes (*Of*, a free energy: Frequencies'
  or one an Add wrote), the name it is written *As* ("G-ens"), and
  within what - *Each group*, *Each value of a property*, *All
  together*. Its card says it in a line ("G-ens = ensemble of G in each
  group").
- **One entry stands for each group**: its lowest, with the value written
  on it. The value is of the group, not of that geometry
  (`Property.ensemble`, how many it is over); its parts are each member's
  value as it was - an Add's own parts with it. It is worked out by the
  members' own level - their program, method and basis, which they share
  - and its treatment says it is an ensemble, of the members' treatment
  ("ensemble, -R T ln Σ g exp(-G/R T), of quasi-RRHO"). So two ensembles
  at one level, of any sizes, are ranked and summed together; two at
  different levels, or an ensemble and one geometry's G, are not. The
  others go out of *The rest*, each saying whose ensemble it is in.
- **No temperature is assumed**: members whose values state none, or
  differ in it, or were worked out differently in any other way, set
  their group aside whole, saying how. A member that is no result -
  failed, not converged - is never counted, and says so.

### Charts (2026-10-22)

**Chart** (PR 10, third part: `src/lib/chart.ts`) is Meno's own step: it
takes a table - or molecules, conformer sets or structures drawn, seen as
one - and gives a
chart, one column of numbers against another, in a set of its own to the
right of it. Its options name the columns, *Across* and *Up*; none named,
it takes the first two columns of numbers (molecules seen as a table:
each entry's number, then its energy).
- **A chart of molecules plots no entry that is no result**: one that
  failed, by any kind, or whose marks did not read refuses it, each named,
  as an *Energy diagram*'s levels do (`notResults`, 2026-10-23).
- **Structures drawn** go into Chart too, seen as a table the way *Open as
  a table* shows them (structuresTable `structuresAsTable`, every structure
  a set holds, on the page and off it). A point stands on a structure's
  record as results. A row whose state is not *finished*, because it
  failed or was edited since its values were given, refuses the chart,
  each named ("structure 2 of 3 failed: no 3D"), with the Filter that
  takes it out ("state = finished") (`notFinishedRows`). A row set aside
  is a result still, with its state finished, and is charted. A cell that
  says a value was not worked out is no number: that row is left out,
  counted and named, as any row without a number is.
- A point for each row with a number in both; **a row without is counted
  and said**, by what it lacks ("4 points · 1 row left (1 with no
  measured)"), and each such row named, pointed at - its entry and what it
  is, or its row ("molecule:2#2 (frame 3 of 3)", "row 3"). A column named that is not there, or is no column of
  numbers, or a table with fewer than two such: the step says why, and
  makes nothing.
- Each axis is labelled with its column's name, unit, and what worked its
  numbers out where that is known, and the conditions they were worked out
  at - temperature, pressure, solvent - where stated ("energy (Eh) · xtb ·
  GFN2-xTB · 298.15 K · 1 atm · water"; lib/chart `howOf`, which a number's
  set says too). The ticks are 1, 2 or 5 times a power of ten, about five of
  them, from below the least value to above the greatest.
- A point pointed at says its row, what it is, and its two values; pressed, where it is
  of a molecule on the page, that molecule is chosen at its frame.
- Zoomed out until words on the page are too small to read, a chart - and
  an energy diagram - is still drawn, its points, levels, lines and axes;
  only its words fade out, as a set's name and count do. A table and a
  number, all words, fade out whole. All of these, and a step's card's
  words, go where they are too small, never at once - and never faded with
  the zoom (the maintainer, 2026-10-28: faded with the zoom, a zoom could
  stop where words and icons were both half there; before that, 2026-10-25,
  where both were all but gone). Past a threshold they switch: off below
  the least scale words are read at, divided by 1.05, and on again only
  above it times 1.05, so that a zoom stopped at it, or turned a little
  back, does not switch them back and forth (utils/pageScale
  `wordsReadAt`, utils/zoomSwitch `switchedAt`). Switched, they fade over
  Meno's quick time, 120 ms, on its curve (`--words` on the page's layer,
  a CSS transition), as a molecule's chips do; a step's card's large icons,
  which stand for its words where they are gone, fade in as they go
  (`--stand-in`). What is pressed on them switches with them.
- Its set's count line says its points. It is kept in the workspace's
  file. A chart goes into no step.
- A point dragged reports where to in the axes' own units (`ChartBody`
  `onPointDrag`) - the place a step that works with it starts from. Nothing
  on the page takes it yet.
- Run again, it charts what comes in now, in the set it made before; it
  says it has changed when the table - its columns and rows - its options
  or what comes into it has. An earlier run's chart is not kept among its
  runs: shown again, the set holds the chart it holds now.
- Seen as a table, molecules are each read as they are - a conformer
  set's frames as its conformers, another molecule's frames each an entry
  of its own - so a set mixing the two goes into Chart, which a step that
  works on entries refuses (*A wire let go on an input that does not take
  it*; kinds `readsAsTable`).
- Each row says what it is, in a column of its own after its id (*what*,
  lib/table `WHAT_COLUMN`): "conformer 2 of 7", a conformer set's; "frame
  3 of 12", a frame of a molecule of several that is no conformer set - a
  scan's, a path's - each frame an entry, a compound, of its own, number 1;
  "molecule", one of a single geometry. A chart of number against energy
  draws a scan's frames beside the conformers, each saying which it is.

### Energy diagrams (2026-10-22)

**Energy diagram** (PR 10, fourth part: `src/lib/energyDiagram.ts`) is
Meno's own step with two inputs: *Levels*, molecules or conformer sets,
and *Connects*, a table, where wanted (an optional input). It gives a chart in a set
of its own. *Levels* reads what comes in as a table, each molecule as it
is, so it takes a set that mixes a saddle point's conformer set with
molecules of one geometry - which a step that works on entries refuses
(*A wire let go on an input that does not take it*).
- **A level** is the molecules of one name - a molecule's title, else its
  file's name without its extension ("R.out" is R), else its group - and
  stands at its lowest; a level of
  several (a saddle point's conformers) says, pointed at, of how many it is
  the lowest and which ("lowest of 7: #3"); pressed, that one is shown.
- **A level of several compounds** (2026-10-24) - a reactant and a
  nucleophile apart, products apart - stands at the sum of its compounds,
  each at its lowest conformer. A compound is the level's molecules of one
  constitution, charge and spin; its rows are its conformers. Every level
  must hold the same atoms, element by element, and the same charge, as a
  reaction's do; where they do not, there is no diagram, and what each
  holds is said ("Its levels do not hold the same atoms and charge: R has
  CH3Br; TS, P have CH4BrO−"), with what each level of several sums ("- R
  sums two compounds: C2H4O, C2H4O"; two of one formula told apart by
  their spin where it differs: "CH2 (singlet), CH2 (triplet)"). Its card's
  line says which compounds each level of several sums ("R sums CH3Br +
  HO−").
  - A compound's stereoisomers count as its conformers here - the
    constitution has no stereo - so the lowest of them is taken.
  - Another spin state is another compound, never a conformer: a singlet
    and a triplet of one molecule in one level are two.
  - A level holds a compound once: two of the same - one constitution,
    charge and spin - are taken as its conformers, at the lower, never
    summed (2 A is one A). A dimer is a compound of its own.
- **In the order the chemist means** (2026-10-24): its card lists the
  levels that come into *Levels*, one to a line, in the order they come -
  the set's own. The lines put in another order are the order drawn; "R =
  HCN" shows R as HCN. A level no line names comes after the rest, as it
  came, never left out; a line naming no level that comes in, or one
  listed already, is said beside it and counted - the name no level has
  said with its run too ("3 levels · relative to R · 1 left: Foo"); two
  levels shown by one name refuse it.
- **Relative to** the level its card's list picks - each by the name it is
  shown by - none picked the first; in kcal/mol, written to a tenth,
  signed. One naming no level that comes in, by either name, is said where
  its card would say *Ready* ("No level is called "Zed"") and refuses its
  run. A table into *Connects* names levels by either name.
- **Which energy** is a list on its card of those its levels carry, each by
  its symbol and what worked it out and where ("ΔG · Gibbs free energy ·
  ORCA · r2SCAN-3c · 298.15 K"); the thermochemistry's corrections are no
  level's energy, and not in it. A line that says a quantity with a symbol
  says it by it ("TS has no G").
- **Which energy**: an option naming the quantity, as the entries carry it
  - their electronic energy ("energy"), or a free energy
  ("thermo.free-energy", ΔG) or enthalpy ("thermo.enthalpy", ΔH) a
  Frequencies step read - of a conformer set too, each conformer's its
  own (2026-10-24). The levels are seen as a table (*Molecules seen as a table*),
  where a column never holds values worked out differently: **every
  level's energy is that one quantity, by one method, at one set of
  conditions, or there is no diagram**, and the step says which levels
  have which ("Its levels' energy was not worked out one way: "energy ·
  GFN2-xTB" for R, P; "energy · B3LYP" for TS"), or which level has none.
- The axis names the quantity relative to the reference and its unit:
  "ΔG (kcal/mol)". What worked it out and where is said on the line under
  the diagram, after its levels, wrapped where it is long: "3 levels ·
  relative to HCN · ORCA · r2SCAN-3c · 298.15 K · 1 atm" (2026-10-24: kept
  off the axis, where a long one was cut).
- **Only results stand as levels**: where any entry under a level failed
  - not converged, refused, an error, of any kind - or its file's marks
  of that did not read, the step refuses and draws nothing, naming each
  ("Not every entry is a result to stand on: TS #2 not converged - take
  it out first"), as Energy window and Populations refuse one. The lowest
  of the rest is never taken: the one that failed may be the level's
  lowest (meno `notResults`).
- **Imaginary frequencies are said, not judged**: which level should be a
  saddle point the step cannot tell, so each level, pointed at, says those
  of the entry it stands at - "has 1 imaginary frequency, 300.0i cm⁻¹",
  "no imaginary frequency", or "frequencies not computed" (lib/
  energyDiagram `frequenciesSaid`, entries `imaginaryOf`).
- **The lines**: each row of the table into *Connects* - its
  columns *from* and *to*, naming levels - is one; with no table, each
  level is joined to the next, in the order they come. A row naming no
  other level is counted and said. A conformer of a level with no energy,
  where the level has others, is counted and said too.
- Its card says how many levels, relative to which; its set's count line
  says its levels. It is kept in the workspace's file, and has changed when
  either input, a level's name, or its options have.

## Questions

None left open in what is built (2026-10-08): the seven steps are built
(*As built*), and what the maintainer changes is folded in here first. The
rebuild's questions are all answered (WORKFLOWS-FOUNDATION.md, *Answered*).
