# Stereochemistry

How a drawing states a configuration with wedges, how Meno shows R and S, E and Z on it, what it says where none can be given, and what it asks before making a drawing in 3D that leaves a configuration open.

## Wedges and hashed wedges {#wedges}

A wedge says that the bond comes towards you from the atom at its narrow end; a hashed wedge, that it goes away from you. Each states the configuration of the atom at its narrow end, and only where that atom can be a stereocentre. A plain bond lies in the page and states nothing. A hashed wedge drawn the other way round - narrow at an end group such as a methyl or an OH, wide at the stereocentre - is read at the stereocentre, as going away; a wedge drawn so states nothing.

- Point at a single bond and press 1 again and again: wedge, hashed wedge, plain, and the next wedge narrow at the other atom. A click on the bond goes round the same way ([Drawing](drawing#bonds)).
- A bond's right-click menu has, among the icons at its top, a wedge and a hashed wedge (their tips: *Wedge*, *Hashed wedge*); pressed again, the icon turns the narrow end to the other atom ([Drawing](drawing#menus)).
- A wedge keeps its narrow end at its atom while you draw on: bonds added at either end do not move it.
- *Wavy bond*, under *More kinds of bond*, says the configuration at that atom is not known.
- A structure drawn as a Fischer projection - each stereocentre a cross of plain bonds, one above another - states nothing as drawn. Its right-click menu offers *Read as Fischer projection*: the level bonds at each cross become wedges, and the configuration is then the drawing's. One undo takes it back.

Where a wedge states its configuration only by how its bonds happen to fall - two of them in a line, say - or a double bond has a group almost in line with it, Meno rings the atom or the bond, dashed. Point at the ring: "This stereocentre can be read either way as drawn.", or "This double bond can be read as cis or trans as drawn." Move an atom until the ring goes.

## R and S, E and Z {#labels}

Meno works out R and S, E and Z itself, from the drawing, with no plugin. They are hidden until you ask for them, except on a chair, a Haworth ring or a Newman projection, which shows them as each group makes a centre ([Chairs, Haworth rings and Newman projections](projections)).

- Right-click an atom that can be a stereocentre and choose *Show R/S*; a double bond that can be cis or trans, *Show E/Z*. Right-click a selection, or a molecule in 3D, for *Show R/S and E/Z*. The same item says *Hide* where all of it is shown. Only atoms and bonds where a configuration can be are offered it.
- The letters are in italics. R or S stands by its atom, opposite its wedge or in the widest gap between its bonds; E or Z beside the middle of its bond. A pseudo-asymmetric centre is r or s; a chiral axis, as of an allene or a biaryl, Ra or Sa.
- As you edit, the letters glide to their new places, and one that changes - S to R as a wedge becomes hashed - fades into the other.
- Drag a letter to put it where you want it; two clicks on it put it back.
- What you show is kept with the drawing, saved and copied with it, and drawn in pictures of it.
- How they are written - *R* or *(R)* - and how far R or S stands from its atom are part of the drawing style: Settings, *Drawing style*, under *Labels*: *R, S, E and Z* and *R and S: distance from the atom* ([Settings](settings#drawing)).

## Where no letter can be given {#none}

An atom or a double bond whose R, S, E or Z you asked for, and which has none, shows nothing. Rest the pointer on it, and the reason is said under it:

- "No R or S: no configuration is drawn here." - for a double bond, "No E or Z: none is drawn here."
- "No R or S: two of its groups are the same." - for a double bond, "No E or Z: the two groups at one of its ends are the same."
- "No E or Z until the double bond it depends on is drawn E or Z." - its groups can be told apart only by a double bond the drawing leaves open; the same for R or S.
- "No R or S: a group it depends on cannot be told from the drawing."
- "No R or S: this N does not keep a configuration."
- "No R or S: drawn the way round its rings cannot take (in,out, or joined trans)."
- "No R or S: the structure is too large to work it out."

A structure read from a SMILES, typed or pasted, that leaves a configuration open says so in a notice as it comes onto the page, as "1 stereocentre not specified".

Where an E or Z turns into the other in the mirror image, resting the pointer on it says so: "This Z becomes E in the mirror image: the two groups at one of its ends are mirror images of each other."

## When an edit changes a configuration {#changes}

After each edit, Meno reads the structures it touched again. Where the edit turned a configuration the drawing stated, or lost it, a short note comes by that atom or bond, stays a moment and goes. It names the atom by its element and number, as *Renumber atoms* numbers the molecule:

- "C2: S, now R" - an atom dragged across to the other side of its centre;
- "C2: S, now unspecified" - its wedges now state nothing;
- "C2: S, now marked unknown" - the drawing now says it is not known;
- "C2: S, now unclear: " and why - its wedges are there, but say nothing that can be read;
- "C2: now R" - stated again;
- "Every stereocentre inverted: the mirror image" - every one of a structure at once.

A double bond is named by its two atoms, as "C4=C5", with E and Z in the same words. There is no note for what you changed by hand on the bond itself - a wedge made hashed, made plain, turned about: its letter changes, and that is all. The note asks nothing: the drawing stays as you made it, and ⌘Z (Ctrl+Z on Windows) gives back the configuration with it.

Meno's own moves - *Clean up this structure*, turning over - keep every configuration. If one ever did not, the note says which move: "changed by Clean-up: C3: R, now S".

## Turning a drawing over {#turn-over}

Turning over is looking at the molecule from its other side: the same compound, not its mirror image.

1. Choose the structures, or right-click an atom or a bond of one.
2. Right-click and choose *Turn over left to right* or *Turn over top to bottom*.

The drawing is mirrored, and every wedge becomes hashed and every hashed wedge a wedge, so each stereocentre keeps its configuration, and R stays R. On one atom or one bond, the whole structure it is in turns over. Turned over in part, a centre keeps its configuration too, where its wedges can say it; where they cannot, or for a double bond turned in part, the note says what changed.

## Making 3D from an open drawing {#which-stereoisomer}

The icon marked 3D on an atom's or a bond's right-click menu, its tip *3D structure*, makes the drawing in 3D ([3D structures](3d#making)). A drawing that stands for one stereoisomer is made at once. Where it leaves a stereocentre, a double bond or a chiral axis open, and the choice changes the compound, Meno asks first, in a card above the page: *Which stereoisomer?* It rings those places on the drawing, and says how many there are and how many stereoisomers the structure can be - "1 stereocentre is drawn without a configuration, so this structure can be either of 2 stereoisomers."

- *Make all 4* - the button says how many - makes each of them, each as a molecule in 3D of its own. Each shows R and S at the places the drawing left open, to tell them apart. Of two enantiomers, one is made as the other's mirror image, with the same conformers and energies. Where there are more than 32, only *Make one* is offered.
- *Make one* makes one of them.
- *Cancel*, or Escape, makes none: draw the configuration you mean, and make it again.

A place whose two ways give one compound is not counted: the CH of methylcyclohexane is no stereocentre. Places that decide only together are: the two ring CH of 1,4-dimethylcyclohexane, cis or trans.

## Racemic and relative drawings {#groups}

A structure read from a MOL file can carry its centres in groups: "and1" - the configuration as drawn and its mirror image together, a racemate - or "or1" - one of the two, not known which. Meno writes the group by each centre, as "and1" or "or1", or, where every centre of a structure is in the one group, once beneath it: "and enantiomer" or "or enantiomer".

Made in 3D, such a structure is asked about first, as a drawing left open is, the card saying, for instance, "and1 stands for both of its forms". *Make all 2* - the number is how many forms - makes each form as a molecule in 3D of its own, the form as drawn first, each saying which it is: "and1 as drawn", "and1 turned over". *Make one* makes the form as drawn.
