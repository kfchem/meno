# Workflows

How to run calculations on many molecules at once: a set of them wired into steps, each step's results wired on to the next, and the whole run again when anything changes.

## A set to start from {#sets}

Choose structures, or molecules in 3D. A port - a small ring - shows on the right edge of what you chose. Pull a wire out of it: what you chose becomes a set, in a thin frame, and the wire follows the pointer. Or right-click what you chose and choose *Use as input*.

- Let go on empty space, and the steps that take what the set holds are offered there.
- Let go on a step's input, and the set is wired to it.
- Let go where nothing takes it, or press Escape, and the wire goes; the set stays.

A set holds what lay inside its frame when it was made, in that order. Drag something into a set you made, or out of it, to add it or take it away.

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

## Saving and sharing {#saving}

The workspace keeps the workflow with its results: its sets, steps, wires and options, and each run. Opened on another computer, it can be read, and run again where the same plugins are added.

- Right-click a step, or a set of it, and choose *Save as procedure…* to keep its steps without their data. Saved procedures are under *Calculations*, among what a double-click on empty space offers; put one down and it comes wired, ready for an input.
- Copy, cut, paste, move and delete a workflow's parts as you would a drawing.
