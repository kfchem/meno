# Chairs, Haworth rings and Newman projections

How to put down a cyclohexane chair, a Haworth ring or a Newman projection, hang groups on it at the places such a drawing has, fuse a second chair on it, and turn it into a flat drawing with wedges and back.

## Putting one down {#putting-down}

Double-click empty space and choose *Projections* in the row of icons ([Starting on empty space](drawing#quick-add)). Three icons open below the row: *Chair*, *Haworth ring* and *Newman projection*. Choose one, and it is put down where you double-clicked, every bond plain.

- *Chair* puts down a cyclohexane chair seen from above and from the right. For the view from the other side, double-click on the chair you just put down, before doing anything else to it, open *Projections* and choose *Chair* again. Again, and it comes back.
- *Haworth ring* puts down a ring of six, as a pyranose is drawn: seen from slightly above, the ring oxygen behind, the front bond bold and the two bonds beside it wedge-shaped. Choose it again on the ring you just put down, in the same way, for a ring of five, as a furanose is drawn.
- *Newman projection* puts down two carbons seen end-on, drawn at one place with a circle round them. The front carbon's bonds meet at the centre of the circle; the back carbon's start at its rim.

Chosen anywhere else, each icon puts down another one there. The ring oxygen of a Haworth ring is an atom like any other and can be changed.

## Groups and their places {#groups}

Each atom of a chair or a Haworth ring has two places for a group; each carbon of a Newman projection has three. A group goes to one of them and never in between.

- Double-click a ring atom to add a group at its first free place: on a chair the equatorial one, then the axial one; on a Haworth ring the one up, then the one down. Once both places are taken, a double-click adds nothing more.
- On a Newman projection, double-click the centre to add a group to the front carbon, or the circle's line to add one to the back carbon. The first front group and the first back group stand anti to each other. Once a carbon has three groups, nothing more is added.
- To choose the place yourself, double-click a ring atom and drag out a bond: it goes to whichever place is nearer the pointer, and a tip under it says which - *axial* or *equatorial* on a chair, *up* or *down* on a Haworth ring, *front* or *back* on a Newman projection.
- Type a label on the new atom as anywhere else. A bond led on out of a group on a Haworth ring turns aside, so that a CH2OH reads as CH2 and OH; make that bond triple and it straightens, as a nitrile is drawn.
- A group pointing into a Haworth ring, such as a CH2OH on C-5 pointing down, has room for one label: type CH2OH on its atom.
- The two carbons of a Newman projection take no label: both are carbon, and they are drawn at one place.

## Groups drawn shorter {#shorter}

Some groups are drawn shorter than a bond so that they do not run into something.

- On two fused chairs, a group whose end would land on an atom of the other ring, or on another group's end, is drawn two thirds of a bond long, and one third where it would cross a bond. It is still at its place and is read as one.
- On a Haworth ring, a label that runs into another label or a bond is first turned to read the other way - HO for OH, HOH2C for CH2OH - and, if it still meets something, drawn nearer its atom.

## Moving a group to its other place {#moving}

- Drag a group of one atom - a label such as OH or CH2OH is one - round its ring atom: it rests at one of the two places, whichever is nearer the pointer. Let it go on a place another group holds, and the two groups change places.
- On a Newman projection, drag a group's bond round the circle to turn all three groups of its carbon together, with what hangs from them. They come to rest staggered or eclipsed; eclipsed groups are drawn a little apart so that both show. The compound stays the same.
- A group drawn by hand off the places, dragged and let go, goes to the nearest free place.

## Axial and equatorial: Flip chair {#flip}

Right-click an atom or a bond of a chair and choose *Flip chair*. The ring flips: each group goes from axial to equatorial, or back, and stays on its own face, so the compound is the same. It is offered on a chair that stands alone, with every group at one of its places.

## A second chair fused on a bond {#fusing}

Right-click a bond of a chair's ring for a second chair fused on it, with three entries: *Fuse a chair, trans*, *Fuse a chair, cis on the upper face* and *Fuse a chair, cis on the lower face*. Once the ring carries a group, the two cis fusions are different compounds, so both are offered.

- Where a group stands at a place the new ring would take, Meno says so and fuses nothing: fuse it on a bond whose places are free.
- Groups go on the new ring as on the first, by double-click or by drag, with the same tips.
- A chair is fused only where it stands alone; two chairs fused together are not flipped.

## R and S {#r-and-s}

A chair, a Haworth ring and a Newman projection state the configuration of every centre in them, whether you meant one or not. As each group makes a centre, its R or S is shown on the drawing, so you can check what the drawing says. To leave a centre open, make its bond wavy. *Hide R/S*, on the right-click menu, takes the labels away. More on R and S is on the page [Stereochemistry](stereochemistry).

## Flat and back {#flat}

- *Draw flat*, on the right-click menu of a chair, a Haworth ring or a Newman projection, lays the structure out flat, with wedges for what the drawing showed in depth. The configuration stays the same.
- *Draw as chair*, on the right-click menu of a cyclohexane ring drawn flat with its wedges, draws it as a chair: each group goes to the place that keeps its configuration, as a rule in the chair with fewer groups axial. *Flip chair* gives the other chair. A centre left open stays open, on a wavy bond. Which chair is drawn is a way of drawing, not a statement of which conformer is favoured.
- Where the flat ring gives no configuration at all, the menu shows *Draw as chair* greyed with the reason: "Its configuration is not drawn: a chair would state one."
- *Draw as chair* is offered on a ring of single bonds with nothing fused, spiro or bridged on it.
- *Clean up this structure* keeps a chair or a Haworth ring as it is drawn and tidies what hangs from it. It leaves a Newman projection as it is and says so.
- A 3D structure made from any of them ([3D structures](3d#making)) takes the drawing's configuration, not the conformation it is drawn in, and a note says so.

## Undo {#undo}

Each of these is one step for ⌘Z (Ctrl+Z on Windows) to take back: putting one down, turning it to the other view, a group added or moved, two groups swapped, *Flip chair*, a fused chair, *Draw flat* and *Draw as chair*. See [Undo](drawing#undo).
