# Drawing

How to draw structures on the page with the pointer: bonds out of atoms, chains and rings led round, labels typed where they stand - or a structure put down by its SMILES or its name.

## Moving round the page {#view}

- Drag empty space to move the page; a right or middle drag moves it from anywhere. On a trackpad, two fingers move it.
- Turn the wheel, or pinch, to zoom in and out.
- *Fit to content*, on the right-click menu of empty space (⌘1 on a Mac, Ctrl+1 on Windows), brings everything on the page into view.

## Starting on empty space {#quick-add}

Double-click empty space. A row of icons opens there, one for each thing that can be put on the page, and each says its name as the pointer rests on it. Choose one, and it is put down where you double-clicked. Escape, or a click anywhere else, closes the row.

- *Bond*, *Chain*, *SMILES*, *Text* and *Arrow*.
- *Scheme* opens a second row: *Plus*, *Electron-pushing arrow*, *Catalytic cycle* and *Slide*.
- *Marks on the page* opens *Rectangle*, *Ellipse*, *Line* and *Pen*, which draw on the page and say nothing chemical.
- *Projections* opens *Chair*, *Haworth ring* and *Newman projection* ([below](#projections)).
- *Conversation* puts down a conversation with an assistant.
- *Calculations*, after a thin line, opens the steps of a [workflow](workflows#steps).

Or just type a SMILES: it goes into the SMILES field, and Enter draws it. The first SMILES takes a moment. A label Meno's dictionary knows - DMF, THF, Et3N - is drawn from the dictionary, its name and formula shown under the field as you type. Where the text could be read two ways, each is offered there: click one, or choose it with the up and down arrows, then press Enter.

## A structure by its name {#by-name}

A name is looked up in an online database, through a plugin that does it. Once one is added, the *SMILES* icon is called *SMILES or name*.

1. Double-click empty space and type the name - aspirin, say.
2. Under the field, the last row reads *Look up “aspirin” at*, then the plugin's name. Nothing leaves the computer while you type: the name goes out only when you choose that row, with a click or with Enter.
3. The first time, Meno asks whether names may go there: the question names the place and the plugin, and says that each name you choose to look up goes there and nothing else does. *Allow* lets it; *Not now* sends nothing, and says so. Settings, *Network*, lists what you allowed under *Allowed*; *Withdraw* takes it back.
4. While the name is looked up, the row says *Looking up…*.

One compound found is drawn at once, as a typed SMILES is, and one undo takes it away. Several are listed in the database's own order, none chosen for you: each by its name, formula and number in the database, with what is not plain about it, such as *1 of 3 stereocentres not defined*. Click one, or choose it with the arrows and press Enter. Where nothing has that name, the field says so.

Before anything is drawn, Meno checks the structure it reads against the formula and charge the database gives. Where they differ, nothing is drawn, and the field says both formulas. A stereocentre or a double bond the database leaves undefined is drawn open, and Meno says so.

- Offline, the row is dimmed and says the plugin needs the network.
- With no such plugin added, text that reads as no structure is answered under the field by what went wrong, and *Look it up as a name…*. Choose it for the plugins online that look names up, each offered as *Add* and its name (*List the plugins online* first, where they are not listed yet). Once one is added, press Enter to look the name up.
- Nothing is kept: the same name looked up twice goes out twice.

## Bonds and atoms {#bonds}

Point at an atom, and it lights up: what comes next is done to it.

- Double-click an atom to draw one bond out of it, where there is room.
- Double-click and drag to lead the bond where you want it. It snaps to the usual angles; pause while dragging, and it goes exactly where the pointer is.
- Drag an atom to move it. Dropped on another atom, it becomes that atom.
- Lead a bond onto an atom already there, and it closes the ring.
- Point at a bond and press 1, 2 or 3 to make it single, double or triple. Press 1 again on a single bond for a wedge, again for a hashed wedge, and again for a plain bond; the next wedge then has its narrow end at the other atom. Press 2 again on a double bond to move its second line. A key changes only the bond under the pointer.
- Double-click a bond to make it double; triple-click it to make it triple. Double-click a double bond to move its second line.
- Click a bond to turn it: a double or triple bond becomes single; a single bond goes round wedge, hashed wedge, and plain with its other end narrow.
- Where two bonds of a structure cross, right-click one of them near the crossing and choose *In front* or *Behind*. The bond behind is drawn with a gap where it passes the other. Choose the same item again to take the gap away.

## Chains and rings {#chains}

Double-click empty space and choose *Chain* from the icons, or choose *Chain from here* on an atom's right-click menu. Then move the pointer without pressing the button: the chain follows it a bond at a time, along a honeycomb of the drawing's own lengths and angles. Lead it back, and it takes bonds back. Click to end it; Escape lets it go.

- Lead it round a hexagon, back to where it went through, and it closes a six-membered ring.
- Lead it on round the next hexagon, over the bond the two share, and it closes that ring too: fused rings - naphthalene, phenanthrene - come in one stroke.
- Rings of other sizes, such as a cyclopentane, are drawn bond by bond.

## A chair {#projections}

Double-click empty space and open *Projections*, then choose *Chair*: a cyclohexane chair is put down where you double-clicked, drawn as a chair is drawn, seen from above and from the right, every bond plain.

- For the view from the other side, double-click on the chair you just put down, before doing anything else, and choose *Chair* again; again, and it comes back. Each is one step to undo. Opened anywhere else, *Chair* puts down another chair there.

- Double-click an atom of the chair and drag out a bond: it goes to one of the atom's two places, axial or equatorial, whichever is nearer the pointer, and says which. It cannot be left between the two. Where a group makes a stereocentre, its R or S is shown.
- Right-click the chair for *Flip chair* - the ring flips, each group stays on its own face, and the compound is the same - and *Draw flat*, which lays the structure out flat with wedges. *Clean up this structure* keeps the chair as it is drawn and tidies the groups on it.
- Right-click a bond of the chair's ring for a second chair fused on it: *Fuse a chair, trans*, *Fuse a chair, cis on the upper face* or *Fuse a chair, cis on the lower face*. Once the ring carries a group the two cis fusions are different compounds, so both are offered. Undo takes the new ring away.
- A chair states the configuration of every centre in it. To leave one open, make its bond wavy.
- A 3D structure made from a chair takes the drawing's configuration, not the conformation it is drawn in.
- A cyclohexane ring already drawn flat, with its wedges: right-click it for *Draw as chair*. Each group goes to the place that keeps its configuration, the chair with fewer groups axial; *Flip chair* gives the other, *Draw flat* takes it back. A centre left open stays open, on a wavy bond. Where the drawing gives no configuration at all, the item says so instead: a chair would state one. Which chair is drawn is a convention, not a statement of the favoured conformer: 1-methyl-1-phenylcyclohexane comes out with its phenyl equatorial, and a few pyranoses (alpha-D-idopyranose, alpha-D-altropyranose) in their other chair, since a CH2OH counts as one group like an OH. *Flip chair* gives the other.

Beside *Chair*, *Projections* has a Haworth ring of six atoms (a pyranose); double-click on the ring you just put down, before doing anything else, and choose it again for one of five (a furanose). It is seen from slightly above with the ring oxygen behind, its front bond bold and the two bonds beside it wedge-shaped. A bond led out of a ring atom goes straight up or straight down the page, and the tip says which. The next bond out of that group turns aside, so a CH2OH reads as CH2 and OH; make that bond triple and it straightens, as a nitrile is drawn. A group pointing into the ring - such as a CH2OH on C-5 pointing down - has room for one label: type CH2OH on its atom.

*Projections* also has a Newman projection: two carbons seen end-on, drawn at one place with a circle round them. The front carbon's bonds meet at the circle's centre; the back carbon's start at its rim. A bond led out of either carbon goes to one of its three places, and the tip says *front* or *back*. Drag a bond's end round the circle to turn all three groups of its carbon together; the compound is the same. Neither carbon can be given a label.

## Labels {#labels}

Point at an atom and type: O, NH2, OMe, Ph. The label is written where it stands, and kept when the pointer moves on. To change a label, choose *Edit label* on the atom's right-click menu.

With atoms chosen, just type: the label goes to every chosen atom, wherever the pointer is, and a small count says how many. Press Enter to keep it, Escape to let it go.

A label is read as a chemist means it: typed small, tbscl becomes TBSCl, and the name of a reagent or a ligand is read before a metal's symbol. Where Meno keeps something other than what you typed, the atom's right-click menu has *As typed:* and your text, to keep it as you typed it.

- *Expand abbreviation*, on the menu of a label such as OTBS, draws the group out.
- To keep a group of your own as a label, select its atoms and choose *Save as abbreviation…* on their right-click menu. It is kept in Settings, [*Dictionary*](settings#dictionary).

## Right-click: what an atom or a bond can be {#menus}

Right-click an atom or a bond for what can be done to it: a row of icons, each saying its name as the pointer rests on it, then a list. A right-click chooses what it is on; the menu's first line says what it acts on - *This atom*, or *3 atoms, 2 bonds* when you right-click one of several chosen. Then an atom's charge, or a bond's kind, is set on every chosen atom or bond at once, and *Cut* and *Copy* take everything chosen.

- An atom: the icons are *Charge one up*, *Charge one down*, *Clean up this structure*, *3D structure*, *Electron-pushing arrow*, *Fishhook arrow*, *Colour…* and *Delete atom*. The list holds *Edit label*, *Chain from here*, *Unpaired electron*, *Select this structure* and *Magnification*.
- A bond: the icons are its kinds - *Single bond*, *Double bond*, *Triple bond*, *Wedge*, *Hashed wedge* - then *More kinds of bond*. The icon of the bond's own kind is drawn as the bond lies; press it again to turn a wedge's narrow end to the other atom, or to move a double bond's second line. With several bonds chosen, a kind is set on all of them. *More kinds of bond* opens a second row: *Wavy bond*, *Bold bond*, *Bold dashed bond*, *Dashed bond* and *Dative bond*. *Delete bond* is last. The list holds *Clean up this structure*, *3D structure*, the arrows from it, *Colour…*, *Select this structure* and the rest.

## Arrows for electrons {#electron-arrows}

A curved arrow shows where electrons go: *Electron-pushing arrow*, with a full head, for a pair; *Fishhook arrow*, with a half head, for one.

1. Right-click the atom or the bond the electrons leave, and choose one of the two icons. Or double-click empty space, open *Scheme*, choose *Electron-pushing arrow*, and press the atom or bond it leaves.
2. Move the pointer without pressing the button: the arrow follows it to the atom or the bond under it, or to the gap between two atoms where a bond forms.
3. Click there to put it down. A click on nothing, or Escape, lets it go.

The arrow stays with its atoms as they are moved or cleaned up. Drag its line to bend it; right-click it for *Full head* or *Fishhook (half head)*, *Colour…* and *Delete arrow*, and, where it was bent by hand, *Bend as Meno does*. An arrow from a negative charge has *From the charge* and *From a lone pair*. Reaction arrows are on the page on [slides](slides#arrows).

## Choosing what to work on {#selecting}

- Click an atom to choose it alone. Hold ⌘ (Ctrl on Windows) and click to add or take out an atom or a bond, or hold Shift and click to take everything along the bonds from the last atom chosen to this one. A bond is chosen with ⌘ (Ctrl), a right-click, a box or a lasso.
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
- The labels are set in IBM Plex Sans, Meno's label font. Meno installs it for you - on Windows when Meno is installed, on a Mac when Meno first starts - and Settings, *Copied pictures*, says whether it is installed. To send a presentation to someone who does not have it, turn on PowerPoint's *Embed fonts in the file* (in *Options*, *Save*) before saving, and the labels look the same on their computer.
