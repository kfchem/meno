# Workflows

How to run calculations on many molecules at once: a set of them wired into steps, each step's results wired on to the next, and the whole run again when anything changes.

## A set to start from {#sets}

Choose structures, or molecules in 3D. A port - a small ring - shows on the right edge of what you chose. Pull a wire out of it: what you chose becomes a set, in a thin frame, and the wire follows the pointer. Or right-click what you chose and choose *Use as input*.

- Let go on empty space, and the steps that take what the set holds are offered there.
- Let go on a step's input, and the set is wired to it.
- Let go where nothing takes it, or press Escape, and the wire goes; the set stays.

A set holds what lay inside its frame when it was made, in the order they lie on the page: top to bottom, left to right. Drag something into a set you made, or out of it, to add it or take it away.

## Steps {#steps}

A step is one kind of calculation, done by Meno or by a plugin. Double-click empty space, choose *Calculations*, then a step: each line is a plugin you added, or Meno, with the kinds of step it does.

- A step's card shows what it does and how, and what it is doing: *Ready*, *Waiting*, *Running*, *Done*, *Failed*, *Stopped*, or *Changed · run again*.
- Click a card to open its options. A double-click, *Close* or Escape closes it.
- A step starts with the defaults in Settings, *Calculations*. What you change on its card changes that step alone.

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

## A template: from a drawn reaction to the energy diagram {#template}

*templates/confots-xtb.meno*, in the Meno repository, is a workspace holding a whole workflow and no results: the stages of a ConfoTS-type study of a reaction, from the reaction drawn to its energy diagram, each step set to a starting value that is yours to change. A second file, *confots-dft.meno*, goes on from the diagram to the DFT stage. Open one, draw your own reaction over the example, and run it.

What it does, stage by stage. Each stage is a row, headed on the page:

- **The reaction.** A set round the drawn reaction says each structure's role from the arrow: reactant, product or reagent. The reactants and the products are taken apart; the reagents are left out, counted on the line. A reactant heavier than 512 g/mol is refused: change the number in its filter.
- **3D for each species.** One 3D structure for each reactant and product, every hydrogen there. The products are then numbered as the reactant (*Atom map*), which also gives the bonds that change.
- **Conformers of each species.** A conformer search on every species, kept to those within 10 kcal/mol of the lowest, optimised, with those that are the same removed, those whose bonding is not the species' removed, and then those within 5 kcal/mol, at most 64.
- **Pairs.** Each conformer of one side given the other side's bonding and minimised, the torsions that turned from trans across the other side's double bonds held again, in three rounds. Both directions are wired: to the products, and to the reactant.
- **Paths.** A path search from each conformer to its ends, the highest point of each as a saddle point guess, kept where it has exactly one imaginary frequency; then the reaction path from it both ways, its two ends checked against the species, and only those saddle points kept whose ends are the reactant and the product they were made for.
- **Diagram.** The minima and the saddle points, with their free energies, drawn as an *Energy diagram*: a column for the reactant, one for the saddle points, one for the products, a thin line for every conformer of a level, each saddle point joined to its two ends, zero at the reactant. The barriers are worked out: each saddle point above the lowest conformer of the reactant it was made from. The share of the reaction through each path is not in the template: Meno has no step for it yet.

To use your own reaction, draw it over the example inside the frame called *The reaction: draw over it*, and delete the example. The set takes what lies in its frame. Two reactants of one reaction are taken as one side together.

The template uses the RDKit plugin (conformers, minimisation, descriptors) and the ORCA plugin (its own GFN2-xTB method for optimisations, frequencies, the path search and the reaction path). Add them in Settings, *Plugins*, and run on the computer that has them.

- **Torsions held again.** Counted per entry: each torsion held in a pass takes that pass's value for its entry. ConfoTS counts each torsion's own failed passes, so a torsion here can be held more strongly than there. The strengths, 50, 100 and 150, are yours to change; no equivalence to another program's force constant is claimed.
- **Failed entries.** An entry a step could not do leaves by its *Failed* exit. To run it again with other options, wire *Failed* into a copy of the step (copy and paste it, change what you want) and merge its results with the first step's: a chain of runs again is yours to add where you meet the failures.
- **Your own.** Right-click any step and choose *Save as procedure…*: it is offered under *Calculations* from then on, to put down again.
- **Not in it.** An IRC at the DFT level, and the share of the reaction through each path, are not in either file. The template takes one reactant structure (or reactants drawn as one).

## Saving and sharing {#saving}

The workspace keeps the workflow with its results: its sets, steps, wires and options, and each run. Opened on another computer, it can be read, and run again where the same plugins are added.

- Right-click a step, or a set of it, and choose *Save as procedure…* to keep its steps without their data. Saved procedures are under *Calculations*, among what a double-click on empty space offers; put one down and it comes wired, ready for an input.
- Copy, cut, paste, move and delete a workflow's parts as you would a drawing.
