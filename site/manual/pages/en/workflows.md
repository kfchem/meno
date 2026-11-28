# Workflows

How to run calculations on many molecules at once: a set of them wired into steps, each step's results wired on to the next, and the whole run again when anything changes.

## A set to start from {#sets}

Choose structures, or molecules in 3D. A port - a small ring - shows on the right edge of what you chose. Pull a wire out of it: what you chose becomes a set, in a thin frame, and the wire follows the pointer. Or right-click what you chose and choose *Use as input*.

- Let go on empty space, and the steps that take what the set holds are offered there.
- Let go on a step's input, and the set is wired to it.
- Let go where nothing takes it, or press Escape, and the wire goes; the set stays.

A set holds what lay inside its frame when it was made, in the order they lie on the page: top to bottom, left to right. Drag something into a set you made, or out of it, to add it or take it away.

- While you hold a structure, a set's frame shows what letting go would do: its edge coloured where it would take the structure in, dashed grey where the structure would leave it.
- A frame grows round what it holds, and is never smaller than that. Drag its sides or corners to make it larger: the size you give it is kept.
- A frame that grows over another set pushes that set out of its way. One undo takes back the drag and all it moved.

## Steps {#steps}

A step is one kind of calculation, done by Meno or by a plugin. Double-click empty space and choose *Calculations*, the last icon in Quick Add's row, after a divider (pointed at, it says *Calculations*); then choose a step. Each line is a plugin you added, or Meno, with the kinds of step it does.

- A step's card shows what it does and how, and what it is doing: *Ready*, *Waiting*, *Running*, *Done*, *Failed*, *Stopped*, or *Changed · run again*.
- Click a card to open its options, or right-click it and choose *Options…*. A double-click on the card, *Close* or Escape closes them.
- Right-click a card for its menu. Its icons along the top, such as *Run*, *Run from here*, *Options…* and *Delete step*, say their names when pointed at.
- A step starts with the defaults in Settings, *Calculations*. What you change on its card changes that step alone.
- A number or text option of a plugin's step, and the strength of *Torsion restraints*, can be taken from a property each entry carries - a named value, such as an energy an earlier step worked out - so that each entry has its own. Press the small button at the right end of the field, *From a property*, and type the property's name; press it again to go back to the value on the card. An entry that does not carry that property leaves by *Failed*, saying why.

## Wires and ports {#wires}

A step takes on its card's left edge and gives on its right: a port for each input, and a port for each exit, named where there is more than one. The first exit gives what the step kept or made; a later one, such as *Failed* or *The rest*, gives what it set aside.

- Drag from an exit's port to another step's input to wire them. While you drag, the inputs that would take it light up.
- A wire to an input that does not take what it carries is not made, and the card says why.
- One exit can feed several steps. An input takes one wire: a new one replaces it.
- To delete a wire, point at it and press Delete, or use its menu. Dragging a wire's end off its input and letting go on nothing deletes it too.

## A step added from a port {#adding}

Drag a wire out of a step's exit and let go on empty space: the steps that take what that exit gives are offered there, and only those. The step you choose is put close by, just to the right of the card it comes from, its input level with the port so that the wire runs straight - or below that card, where something is there already. It comes wired, and one undo takes both away.

## Where results go {#results}

What a step gives is in its exits.

- An exit wired on to another step shows no frame. Its results are held off the page, the wire runs from card to card, and the next step takes them from there.
- An exit not wired on shows its results in a frame to the right of the card: molecules or structures to pick up and work on, as anything else on the page. Until its step runs, the frame says *Not run yet*.
- An exit for what a step sets aside - *Failed*, *The rest* - is its port alone while it holds nothing, and shows its frame once it holds anything.
- Point at the port of an exit wired on, and what its results hold is said beside it.
- To see results held off the page, click the exit's port, or right-click it and choose *Show on the page*. On a wire, right-click and choose *Show its results on the page*. They are laid out where their frame was. Click the port again to hold them off the page.
- A set of more than 50 shows a summary in its frame. *Open as a table*, on its menu, opens it in the column.

## Running {#running}

Right-click a step and choose *Run*: it runs, after any step before it that has not run, or has changed, failed or stopped. *Run from here* runs it and every step after it. Right-click empty space for *Run all*, and for *Stop all* while anything runs.

- A step whose options, or what comes into it, changed since it ran says *Changed · run again*, and keeps its results until it runs again.
- *Show log* and *Show files* are on a step's menu once it has run.
- A step's results come in as one step to undo.

## Repeating steps {#repeat}

A *Repeat* is a frame round steps that runs them pass by pass: what one pass gives can go round again, until it is done.

- Double-click empty space, choose *Calculations*, then *Repeat* in Meno's list, further down it (scroll the list): an empty frame is put down, and you drag steps into it.
- Or right-click a step, or one of several you chose, and choose *Repeat these steps*: the frame is drawn round them, and the wires that crossed its edge are wired through it. Where more than one set comes into those steps, no Repeat is made, and Meno says why.
- One undo takes either away.

Its card stands at the frame's top left.

- *In*, on its card, takes what comes from outside.
- *This pass*, inside the frame, gives each pass's entries to the first steps inside.
- Wire what should go round once more to *Again*, and what is finished to *Done*.
- *Out* holds all that reached *Done*, over every pass. In a Repeat put down empty, it lies inside the frame, under *This pass*; with *Repeat these steps*, it is put just outside the frame, to its right.

A step is in a Repeat when the middle of its card is inside the frame: drag a card in or out to add it or take it away. Wires cross the frame only through these ports; a wire that would cross it otherwise is not made, and the card says why.

Click its card for its options:

- *Repeat*: *A number of times*, with *Passes*; *Until none goes again*, with *At most, passes*; or *Over values*, with *Values, one to a line*.
- *Variable (blank: none)*: a name. With *A number of times* or *Until none goes again*, *From* and *Step* give its first value and how much it changes; with *Over values*, its values are those lines. *Unit (blank: none)* gives their unit. Each entry carries the variable under its name, a property that a step inside can take an option from (see [steps](#steps)).
- *Counted*: *Per entry*, each entry's value stepping each time it goes round, or *Per pass*.
- *Each pass starts*: *From where restraints were first held*, *From the last pass*, or *From what came in*.

Run it as any step. While it runs, it says the pass under way: *pass 2 of 3*. A step inside that fails ends the passes, and the Repeat says which step and in which pass. What is still going round when the passes end leaves by *Out*, and its line says how many.

## A template: from a drawn reaction to the energy diagram {#template}

Two workspaces hold a whole workflow and no results, every step set to a starting value that is yours to change: *confots-xtb.meno*, from a reaction drawn to its energy diagram, and *confots-dft.meno*, which goes on from the diagram to a DFT stage. They are in the [templates folder](https://github.com/kfchem/meno/tree/main/templates) of Meno's repository.

1. Add the RDKit plugin and the ORCA plugin in Settings, *Plugins*.
2. Open one of the files.
3. Draw your reaction inside the frame called *The reaction: draw over it*, and delete the example.
4. Right-click empty space and choose *Run all*.

Each stage is a row, headed on the page:

- **The reaction.** The set round the reaction gives each structure its role from the arrow: reactant, product or reagent. The reagents are left out. A reactant heavier than 512 g/mol is refused: change the number in its filter.
- **3D for each species.** One 3D structure for each reactant and product, every hydrogen there, the products numbered as the reactant (*Atom map*).
- **Conformers of each species.** A conformer search, kept to those within 10 kcal/mol of the lowest, optimised, with duplicates removed, then to those within 5 kcal/mol, at most 64.
- **Pairs to the products**, **Pairs to the reactant.** Each conformer of one side given the other side's bonding and minimised. Both directions are wired; *Pass the side with fewer* lets through the side with fewer conformers for each species, or both.
- **Paths to the products**, **Paths to the reactant.** A path search from each conformer to its end, the highest point as a guess at the saddle point, kept where it has exactly one imaginary frequency; then the reaction path both ways from it, kept where its two ends are the reactant and the product it was made for.
- **Diagram (xTB).** The minima and the saddle points, with their free energies, drawn as an *Energy diagram*, zero at the reactant, each barrier measured from the lowest conformer of the reactant it was made from.

The template takes one reactant structure, or reactants drawn as one. An entry a step could not do leaves by its *Failed* exit: to try it again with other options, wire *Failed* into a copy of the step and change what you want there. A reaction path that stops short of its end is kept as far as it came, and its step's line says so.

## Saving and sharing {#saving}

The workspace keeps the workflow with its results: its sets, steps, wires and options, and each run. Opened on another computer, it can be read, and run again where the same plugins are added.

- Right-click a step, or a set of it, and choose *Save as procedure…* to keep its steps without their data. Saved procedures are under *Calculations*, among what a double-click on empty space offers; put one down and it comes wired, ready for an input.
- Copy, cut, paste, move and delete a workflow's parts as you would a drawing.
