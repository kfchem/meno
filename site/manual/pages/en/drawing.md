# Drawing

How to draw structures on the page with the pointer: bonds out of atoms, chains and rings led round, labels typed where they stand.

## Moving round the page {#view}

- Drag empty space to move the page; a right or middle drag moves it from anywhere. On a trackpad, two fingers move it.
- Turn the wheel, or pinch, to zoom in and out.
- *Fit to content*, on the right-click menu of empty space (⌘1 on a Mac, Ctrl+1 on Windows), brings everything on the page into view.

## Starting on empty space {#quick-add}

Double-click empty space. A row of icons opens there, one for each thing that can be put on the page, and each says its name as the pointer rests on it: *Bond*, *Chain*, *SMILES*, *Text*, *Arrow* and more. Choose one, and it is put down where you double-clicked.

## Bonds and atoms {#bonds}

Point at an atom, and it lights up: what comes next is done to it.

- Double-click an atom to draw one bond out of it, where there is room.
- Double-click and drag to lead the bond where you want it. It snaps to the usual angles; pause while dragging, and it goes exactly where the pointer is.
- Drag an atom to move it. Dropped on another atom, it becomes that atom.
- Lead a bond onto an atom already there, and it closes the ring.
- Click a single bond to make it a wedge, again for a hashed wedge, and again for a plain bond; the next wedge then has its narrow end at the other atom. A wavy, bold, bold dashed, dashed or dative bond clicked becomes plain, a double bond single, and a triple bond double.
- Double-click a bond to make it double; triple-click it to make it triple.

## Chains and rings {#chains}

Double-click empty space and choose *Chain* from the icons, or choose *Chain from here* on an atom's right-click menu. Then move the pointer without pressing the button: the chain follows it a bond at a time, along a honeycomb of the drawing's own lengths and angles. Lead it back, and it takes bonds back. Click to end it; Escape lets it go.

- Lead it round a hexagon, back to where it went through, and it closes a six-membered ring.
- Lead it on round the next hexagon, over the bond the two share, and it closes that ring too: fused rings - naphthalene, phenanthrene - come in one stroke.
- Rings of other sizes, such as a cyclopentane, are drawn bond by bond.

## A chair {#projections}

Double-click empty space and open *Projections*, then choose *Chair*: a cyclohexane chair is put down where you double-clicked, drawn as a chair is drawn, seen from above and from the right, every bond plain.

- Click *Chair* again, before doing anything else, for the view from the other side; again, and it comes back. Each is one step to undo.

- Double-click an atom of the chair and drag out a bond: it goes to one of the atom's two places, axial or equatorial, whichever is nearer the pointer, and says which. It cannot be left between the two. Where a group makes a stereocentre, its R or S is shown.
- Right-click the chair for *Flip chair* - the ring flips, each group stays on its own face, and the compound is the same - and *Draw flat*, which lays the structure out flat with wedges. *Clean up this structure* leaves a chair as it is drawn.
- A chair states the configuration of every centre in it. To leave one open, make its bond wavy.
- A 3D structure made from a chair takes the drawing's configuration, not the conformation it is drawn in.
- A cyclohexane ring already drawn flat, with its wedges: right-click it for *Draw as chair*. Each group goes to the place that keeps its configuration, the chair with fewer groups axial; *Flip chair* gives the other, *Draw flat* takes it back. A centre left open stays open, on a wavy bond. Where the drawing gives no configuration at all, the item says so instead: a chair would state one. Which chair is drawn is a convention, not a statement of the favoured conformer: 1-methyl-1-phenylcyclohexane comes out with its phenyl equatorial, and a few pyranoses (alpha-D-idopyranose, alpha-D-altropyranose) in their other chair, since a CH2OH counts as one group like an OH. *Flip chair* gives the other.

Beside *Chair*, *Projections* has a Haworth ring of six atoms (a pyranose); click it again, before doing anything else, for one of five (a furanose). It is seen from slightly above with the ring oxygen behind, its front bond bold and the two bonds beside it wedge-shaped. A bond led out of a ring atom goes straight up or straight down the page, and the tip says which. The next bond out of that group turns aside, so a CH2OH reads as CH2 and OH; make that bond triple and it straightens, as a nitrile is drawn. A group pointing into the ring - such as a CH2OH on C-5 pointing down - has room for one label: type CH2OH on its atom.

## Labels {#labels}

Point at an atom and type: O, NH2, OMe, Ph. The label is written where it stands, and kept when the pointer moves on. To change a label, choose *Edit label* on the atom's right-click menu.

## Right-click: what an atom or a bond can be {#menus}

Right-click an atom or a bond for what can be done to it: a row of icons, each saying its name as the pointer rests on it, then a list.

- An atom: the icons are *Charge one up*, *Charge one down*, *Clean up this structure*, *3D structure*, *Electron-pushing arrow*, *Fishhook arrow*, *Colour…* and *Delete atom*. The list holds *Edit label*, *Chain from here*, *Unpaired electron*, *Select this structure* and *Magnification*.
- A bond: the icons are its kinds - *Single bond*, *Double bond*, *Triple bond*, *Wedge*, *Hashed wedge* - then *More kinds of bond*, which opens a second row of *Wavy bond*, *Bold bond*, *Bold dashed bond*, *Dashed bond* and *Dative bond*, and *Delete bond*. The list holds *Clean up this structure*, *3D structure*, the arrows from it, *Colour…*, *Select this structure* and the rest.

## Choosing what to work on {#selecting}

- Click an atom to choose it alone. Hold ⌘ (Ctrl on Windows) and click to add or take out an atom or a bond, or hold Shift and click to take everything along the bonds from the last atom chosen to this one.
- Press and hold on an atom or a bond to choose its whole structure; drag from there to move it.
- Press and hold on empty space, then drag, to choose what a box holds - with Option (Alt on Windows) held, what a lasso encloses.
- ⌘A (Ctrl+A) chooses everything; a click on empty space, or Escape, nothing.

Right-click what is chosen to copy it, clean it up, make it in 3D, colour it or delete it.

## Tidying a drawing {#clean-up}

Right-click a structure and choose *Clean up this structure* - or, for what is chosen, *Clean up these structures*. Meno lays it out again as such structures are drawn in papers, and you can go on from there.

## Undo {#undo}

⌘Z (Ctrl+Z on Windows) takes back the last thing done. In the middle of a stroke - a chain, an arrow, a box being drawn - it lets that stroke go and nothing more.

## Into Word and PowerPoint {#office}

Copy what is chosen (⌘C, or Ctrl+C) and paste it into a Word document or a PowerPoint slide. It goes in as a drawing that keeps Meno's own record of it.

- On a Mac: to change it, copy it in Word or PowerPoint - or drag it - back onto Meno's page. It comes back as the structure it was; change it, and copy it over again.
- On Windows: double-click it in Word or PowerPoint, and Meno opens it. What you change there goes back into the document.
