# Finishing the 2D editor

What "finished" means for the 2D structure editor, how it is meant to be
worked, and what is left to do, in the order it should be done. Agreed with
the maintainer on 2026-09-25; judge it, like everything else, against
[PURPOSE.md](PURPOSE.md).

## What finished means

Everything up to, and not including, linking a structure to the 3D views
(which is the workspace's first stage: [WORKSPACE.md](WORKSPACE.md)).
Within that, the feature set of a capable general-purpose structure editor,
and in particular:

- **Drawing style as settings**: bond length, line width, double-bond
  spacing, wedge shape, hash spacing, rounding at ends and joins, label font
  and size - adjustable, with ACS 1996 as the preset rather than the only
  option.
- **SVG export**, drawn exactly as on the canvas.
- **Pasting into Word and PowerPoint** as an object.

## How it is worked

- **Hover, then act.** The atom or bond under the pointer is the subject of
  whatever comes next - a click, a drag, a wheel turn, a key. This is already
  how labels are typed.
  - What is under the pointer is lit from behind: the highlight sits under
    every bond and shape, so it never tints the drawing. A bond's highlight
    follows what the bond draws - it widens with a wedge to its broad end
    and takes in a double bond's second line, the same margin past the
    drawing all along (the drawing reports how far each bond reaches,
    `Layout.reach`).
- **Drawing is dragging bonds out of atoms**, and the editor is made for
  that way of drawing rather than for keys to learn: there are no keyboard
  shortcuts for building structures (agreed 2026-09-27).
  - A drag on an atom moves it; it snaps as it goes, and dropped on another
    atom it becomes that atom.
  - A double-click on an atom draws one bond where there is room; a
    double-click that drags draws one bond where it is led. Near 120
    degrees from a bond already there it snaps to that, and an arc grows
    out of the atom to tell it from the 30-degree grid. (Agreed 2026-09-28,
    after trying it: a plain drag drawing a bond was hard to get used to.)
  - A click alone edits the atom's label once the system's double-click
    time has passed (DOUBLE_CLICK_MS, half a second); a double-click
    slower than that, finding its first click already editing, takes the
    edit back. The end of a drag is not a click, though the browser fires
    one wherever the button comes up: a bond let go on the atom it has just
    drawn does not go on to edit that atom's label (utils/press).
  - A pause in a drag (FREE_MS) lets a bond or a moved atom go exactly
    where the pointer is, off the grid.
  - A bond led within reach of an atom closes onto it, and so does one led
    onto an atom however far away - a long bond closes a ring too; the
    preview shows it closed before the button comes up.
  - **Chains** (agreed 2026-10-03): three clicks on an atom draw a chain,
    and so does Quick Add's *Chain* from empty space - led by a drag, or,
    the last click (or the press on the icon) let go where it was, traced
    with the button up until a click ends it; Escape lets it go. The third
    click takes back the bond the double-click drew. (Two clicks on empty
    space drew one until 2026-10-08, when the maintainer gave the
    double-click there to *Quick Add*, below; three did until 2026-10-10,
    when the maintainer moved the chain from empty space into Quick Add, so
    that Quick Add need not wait to see whether a third click comes.)
    - It runs on a honeycomb of the drawing's own lengths and angles laid
      out from its start (`utils/honeycomb`), turned so that a bond the
      atom already has is one of its own; across at 30 degrees from empty
      space. The honeycomb opens out from the start as the chain begins,
      fades with the distance from the chain's end, and folds back into
      the start when it is done (`ChainGuide2D`).
    - Led along it, it lays a bond down a step at a time; led back, it
      takes them back - led back a little beside the way it came too, as a
      hand leads it back, as far as the point it is led back to, with no
      ring for that.
    - Led round, along the honeycomb, to a point it went through - the way
      the pointer went enclosing room, not straight back - it closes the
      ring that way makes: round one hexagon, a six-membered ring; round
      two, a ten-membered one; round three, fourteen (`utils/chain`). Led
      on from there, the ring stays; led back past it, it goes. Onto an
      atom already there, it joins it where the ring that closes lies
      along the honeycomb, or where it closes none; elsewhere the point is
      an atom of the chain's own (`utils/stroke`).
    - **A chain draws the honeycomb's rings and no other** (the
      maintainer, 2026-10-07; what that means, 2026-10-08): a loop that
      comes round to no point of the chain draws no ring, and a ring of
      another size - a cyclopentane, say - is drawn by hand, bond by bond.
      Before, a loop back to the chain drew a ring as long as the loop (3
      to 12 members), off the honeycomb. A loop is measured as the hand
      meant it: the way is taken a quarter of a bond at a time, so a
      tremble does not lengthen it, and a way out and back that encloses
      only a sliver - less round than a triangle drawn by hand - goes round
      nothing.

  The whole stroke is one undo step. (PR #57; chains, agent/gestures)
- **The mouse alone should be enough**, and it should travel as little as
  possible: what is done to an atom is done where the atom is, not from a
  toolbar across the window. Keys are shortcuts, never the only way.
- **Labels**: hydrogens go on the side away from the bonds, and on the right
  when the bonds are within 10 degrees of vertical (#24).

### Pointer and keys, in 2D and 3D

Agreed with the maintainer on 2026-09-27. Meno runs on Windows and macOS,
is worked with a mouse first but must be just as usable from a trackpad, and
will show the 2D drawing and the 3D structure in one canvas - so the same
hands do the same things in both, and modifier keys follow each system's
own conventions: where Windows uses Ctrl, macOS uses ⌘ (on a Mac, a
Ctrl-click is a right-click).

**Moving the view.** A left drag, the gesture used most, is the view's own
main movement; everything else moves or zooms the same way in both.

| | Mouse | Trackpad | 2D | 3D |
|---|---|---|---|---|
| Left drag from empty space | left drag | press and drag | move | move (on a molecule in 3D, turns it) |
| Right or middle drag, anywhere | right or middle drag | two-finger press and drag | move | move |
| Scroll | the wheel zooms | two fingers move | as the device | as the device |
| Zoom | the wheel | pinch | zoom | zoom |

A mouse wheel and two fingers arrive as the same event, so they are told
apart by the first event of each run - fingers move sideways, in fractions
and in small first steps (`lib/input/wheel.ts`); a pinch comes as a WebKit
gesture or, in Chromium, with Ctrl held. Measured on the maintainer's Mac,
a trackpad's first step is 1 or 2 px however fast the stroke, and a
smoothly scrolling mouse's notch (an MX Master 3S) is 13 px, so 8 px tells
them apart; a notch zooms at least as far as a plain wheel's 40 px line.
Each notch zooms by the same ratio - 17 % for a 100 px notch - whether the
view was still before it or already moving, at any frame rate: what is left
to zoom is gone over a share a frame (`zoomTaken`), all of it in the end.
The wheel over what is laid on the canvas - a molecule's frames chip, its
note - zooms as over the canvas. The wheel turned upwards zooms in, as maps
do, or out where Settings, *General*, says so (the maintainer,
2026-10-08); a pinch zooms as the fingers go, whichever is chosen.
A pinch let go while still zooming goes on zooming, as a drag let go goes on
moving, and slows to a stop: as fast as it went over its last 64 ms, unless
held still for 80 ms first (`lib/input/glide.ts`). Chromium's pinch, as the
wheel with Ctrl, has no end of its own: it ends once no step has come for
80 ms.
A step within a thousandth of a pixel of whole counts as whole: Windows'
display scaling leaves notches that close (ten notches at once came as
999.99993 px at 175 %), and read as fingers they moved the view a thousand
pixels, off the drawing.
(PR #55. In the workspace the page never tilts: each molecule in 3D turns by
itself, under a left drag on it - [WORKSPACE.md](WORKSPACE.md).)

A drag that moves the view and is let go while still moving glides on,
as fast as it was going over its last moments and slowing to a stop; one
held still before it is let go stays where it was put. (It used to glide on
by its last move whatever came after - a drag held still went on drifting
when it was let go.)

**A click keeps each view's own meaning**: in 2D a click on an atom edits
its label and a click on a bond changes its kind, as drawing wants; in 3D a
click on an atom chooses it, for a measurement, and a click elsewhere on the
molecule selects it. A right-click, or a press with two fingers,
opens the menu for what is under the pointer; it waits for the button to
come up, so a right drag is a move, not a menu.

**A menu's first row is icons** (the maintainer, 2026-10-10: the menus had
grown busy, and a row of icons for what is done most - as Windows has -
was asked for). What is done most to the thing right-clicked comes first,
each an icon at Quick Add's size, named as the pointer rests on it (with
its key, if it has one), and Delete at the row's right end, always; the
rest is listed under them, a row each as before (`PartMenu`, `menuIcons`).

| Right-clicked | Icons | Listed |
|---|---|---|
| An atom | charge one up, one down, clean up its structure, its structure in 3D, an electron-pushing arrow from it, a fishhook from it, colour; Delete | unpaired electron, expand an abbreviation, select its structure |
| A bond | clean up, 3D, an electron-pushing arrow from it, a fishhook from it, colour; Delete | select its structure |
| An electron-pushing arrow | full head, fishhook (the one it has marked); Delete | lone pair (where it leaves an atom that has one), bend as Meno does (where it was bent by hand) |
| The selection | cut, copy, paste (opened on empty space), clean up, 3D, colour; Delete | copy as SMILES, export, turn over either way, use as input, save as abbreviation |
| Inside a ring, nothing selected | colour | select its structure |
| Empty space | paste, select all | open, save as, new text, fit, R and S, the texts, find in PDFs, drawing style, run all |
| A molecule in 3D | cut, copy, the other look, reset its turn; Delete | measure, all its conformers, its lists, its output, turn like its drawing, make it again, draw its formula |
| Words on the page | edit, align left, centre, right, justify; Delete | show in the PDF, as wide as its words |
| A PDF | read, previous page, next page, an icon or full size; Delete | copy, put on the page, copy picture, spread or gather pages |
| A text's sheet | read, an icon or full size; Delete | |
| A picture | copy picture; Delete | show in the PDF |
| A step | run (or stop), run from here, options; Delete | show log, show files, save as procedure |
| A set, an arrow, a "+", a wire, a measurement | Delete | save as procedure (a set), arrow style (an arrow) |

The icon that turns a molecule in 3D to its other look is where the
second 3D style will go (decisions of 2026-10-10: one step from the
right-click and double-click menus). An item that does not apply now - the
previous page, on the first - is shown, but cannot be pressed, so that the
icons keep their places. What Quick Add puts down - an arrow, a "+", words
- is no longer on the menus on empty space; and what concerns the whole
workspace is done by selecting all of it first.

**Selecting**, the same in both views:

| | Windows | macOS |
|---|---|---|
| Add or take out one atom or bond | Ctrl+click | ⌘+click |
| Everything along the bonds from the last atom chosen to this one | Shift+click | Shift+click |
| A box: what it holds | a long press on empty space, then a drag; or Ctrl+drag at once | a long press on empty space, then a drag; or ⌘+drag at once |
| A lasso: what it encloses | the box's gesture with Alt held | the box's gesture with Option held |
| A whole structure | a long press on an atom or a bond (and a drag from there moves it); or right-click, *Select this structure* | the same |
| Everything | Ctrl+A | ⌘A |
| Nothing | click empty space, or Esc | the same |

**A long press** is a press held still for LONG_PRESS_MS (0.32 s), on the
first press only: the second of a double-click held still waits to be
dragged. It is counted while the button is held, so a click's label edit,
which waits for DOUBLE_CLICK_MS after the button comes up, is unaffected.
As it is held, the selection's shade spreads out from the atom along the
bonds, reaching the whole structure as it is selected; on empty space a
ring opens where the box will begin (`HoldProgress2D`). Let go early, it
goes again. Let go where it was held, the long press has selected and
that is all: the click its release makes edits no label, being held off
as it comes (`suppressDoubleClick`), not when the edit would begin. On a
trackpad that taps to click, a long press is a press of
the pad held.

A double-click and a drag that starts on an atom draws one bond out of it.

**Quick Add** (the maintainer, 2026-10-08). A double-click on empty space
opens, up and to the right of it, what can be put down there, each an
icon - named as the pointer rests on it - and none in words: a bond
(across at 30 degrees, as a chain from empty space begins), a chain, a
SMILES, text, a reaction arrow, a "+" and an electron-pushing arrow (from
the first atom or bond pressed, *Electron-pushing arrows* below). A choice puts it down where the
double-click was; Escape, a press elsewhere or a turn of the wheel closes
it. It opens as the second click's button comes up: a third click asks
for nothing more (the chain is Quick Add's own since 2026-10-10 - before,
Quick Add waited 0.28 s for a third click that would draw one, and the
maintainer found it slow). *Chain* begins one where the double-click was,
led by a drag from the icon or traced with the button up. *SMILES* opens a
field below the row: Enter draws what is typed there, laid out by Meno's
engine, centred where the double-click was and selected, as a paste is -
the first time, once the plugin that reads SMILES is set up; what went
wrong is said under the field. A double-click on an atom still draws one
bond; on an arrow, a "+" or text, none of this (`Selection2D`, `QuickAdd`,
`chainFrom`). With the column open beside the canvas (PDF.md, *One
canvas*), a double-click on empty space shuts it instead - the work comes
back to the canvas (the maintainer, 2026-10-10) - and the next opens
Quick Add.
After a thin rule, one more button - *Calculations* - opens below the
row to the kinds of step a workflow can have (WORKFLOWS.md, *A step: from
Quick Add*); a wire let go on empty space opens Quick Add at those alone.
On a trackpad a
double-tap and drag does the same as a double-click and drag.
A box or a lasso drawn with Ctrl (⌘) held adds what it takes to the
selection; drawn without, it replaces it.

**What is done to a selection** (2D, PR #66). It is shaded in the hover
highlight's colour, under the drawing, and a small handle stands above it.

- Dragging any of its atoms moves the whole of it, off the grid, as one undo
  step; an atom that is not selected moves on its own as before.
- Dragging the handle turns it about its middle, in steps of 15 degrees, or
  freely after a pause - one undo step.
- The keys that act on what is under the pointer act on the selection
  instead, once there is one: Delete or Backspace deletes it, and
  Ctrl/⌘+Shift+K cleans up every structure it is in.
- A right-click on something selected, or on empty space, opens the
  selection's menu (above): among its items *Delete selection*, *Turn
  over left to right*, *Turn over top to bottom*, *Clean up these
  structures* and *Export…*, which writes what is selected. Turning over is seeing
  the molecule from its other side, not its mirror image: the drawing is
  mirrored and every wedge on it becomes hashes and every hash a wedge, so
  each stereocentre keeps its configuration.
- The selection is the view's, not the document's: undo does not change it,
  and what an edit deletes leaves it - an undo too: a paste undone leaves
  nothing selected (before 2026-10-10 its atoms stayed selected, unseen,
  and a right-click on empty space opened the selection's menu).

**Copy, cut and paste** (PR #68; pictures, PR #69). Ctrl/⌘ with C, X and
V, as everywhere, and the same from the menus.

- What is copied is the selection - its atoms and every bond among them -
  or, with nothing selected, the structure under the pointer. With nothing
  to copy there, or anywhere else in the app with no text selected, a copy
  leaves the clipboard as it was (on a Mac the Edit menu's Copy would
  otherwise have the webview write an empty item over it).
- A paste goes where the pointer is (where the menu was opened, from the
  menu; the middle of the view, if the pointer is off the drawing), comes
  in selected so it can be dragged straight on, and is one undo step. What
  is dropped onto the drawing - a structure's file, or a structure dragged
  out of Word or PowerPoint - comes in the same way where it is dropped, as
  does a SMILES added beside what is drawn.
- The clipboard holds Meno's own record of the structure, which loses
  nothing, and a MOL file for other chemistry programs (MDLCT on Windows,
  which they exchange there) - and no plain text: PowerPoint pastes plain
  text as a text box in preference to anything offered with it. *Copy as
  SMILES*, in the selection's menu, puts the SMILES alone there as text.
- With them go pictures of the structure, drawn in the canvas's style at
  its own size, each carrying Meno's record so that the structure comes
  back: an EMF (vectors, the record in a comment) in Office's own clip
  format, which Word and PowerPoint keep as it is on either system; the
  EMF on its own, for Windows' other programs; and a PNG (the
  record in a text chunk) for everything else. Pasted into Word or
  PowerPoint, the structure is a vector picture; copied there and pasted
  back into Meno, it is the structure again, wedges and charges and all.
  What is made of pixels - the PNG, and molecules in 3D in any of them -
  is made at the resolution Settings › Files, *Copied pictures*, says:
  300, 600 or 1200 dpi, 600 unless changed (the maintainer asked for
  sharper pictures in Office, 2026-10-08; it was 300). A picture so large
  that it would come to more than 48 million pixels is made at a lower
  resolution, its size on the page the same (`pictureDpiFor`).
- PDFs and texts' sheets selected go with the rest (docs/PDF.md, *With the
  rest of the page*): in Meno's record, a PDF by its file's SHA-256, as it
  lies, and a text whole; a text's sheet alone also as its words, for
  other programs.
- Files copied in the Finder or Explorer are pasted as they would be
  dropped where the paste goes: PDFs, pictures, texts and structures' files.
- A paste reads Meno's own record first, then a picture that carries one
  (Office's clip format, as Word and PowerPoint hand it back, or a PNG),
  then a MOL file, then plain text that is a MOL file or a SMILES (drawn by
  the engine, as a SMILES typed in Quick Add is).
- On empty space with nothing selected, a right-click opens *Paste* and
  *Select all*; the selection's menu has *Cut*, *Copy* and *Copy as
  SMILES*, and *Paste* when it was opened on empty space.

## Who does what

- **TypeScript** holds the model, the gestures and the drawing - everything
  that has to answer within a frame. No Python in the drawing path.
- **RDKit** decides chemistry: valence and implicit hydrogens with charges,
  aromaticity, SMILES, stereo perception and CIP labels. (2D coordinates -
  clean-up - are Meno's own layout engine's, in TypeScript: 4a below.) It
  runs in the Python
  sidecar, in an environment the bundled `uv` builds on first launch;
  downloading it then, rather than shipping it, keeps Meno itself small, and
  the workflow side will need far more packages than this. Calls are
  asynchronous, and the editor stays usable while the environment is being
  built.
- **MOL V3000** is what passes between the two. The same writer saves files.

## Work, in order

Status: **done** (merged), **PR** (open), or blank.

### 1. What is broken now

| | |
|---|---|
| Atoms that cannot be picked up (stale bounding sphere, audit H2) | PR #23 |
| OH/HO flipping near vertical, at rest and mid-drag | PR #24 |
| Aromatic bonds (MOL order 4) imported as triple bonds | PR #27 |
| Opening a file counts as an edit: the tab is dirty at once, and undo empties the canvas | PR #28 |
| Closing a tab throws edits away without asking; the dirty mark is never shown (audit G2) | PR #29 |
| A double-click draw is two or three undo steps, not one | PR #26 |
| Wavy bonds notched at every joint (audit H3) | PR #31 |
| A carbon with no bonds is not drawn at all (ACS writes CH4) | PR #37 |
| A lone water drawn OH2: an atom with no bonds is written as its formula is, hydrogens first for groups 16 and 17 (H2O, H2S, HCl, H3O+) and after the symbol for the rest (NH3, CH4) | PR |
| An RXN file's structures run into its arrow: spaced by what is drawn, labels included - half a bond clear of the arrow, a bond between two structures on a side - and placed by the middle of what is drawn, not by the atoms' centroid | PR |

### 2. Drawing style as data, and one way of drawing

The move preview is a second implementation of the drawing, and it is where
every recent regression has been. It trims bonds at labels by font size
rather than by the label, picks double-bond sides with a simplified rule,
draws aromatic rings as Kekulé structures, sizes caps and joins on its own
terms, and holds three instances per bond where a hashed wedge needs seven.
Meanwhile the resting layers drop the dragged atom's bonds, which can turn a
neighbouring wedge round mid-drag.

Both go together, because both touch every layer.

**The drawing style**, as the maintainer set it out:

- **What it covers.** Bond length; line width; the width of a wedge's broad
  end and of a bold bond; double- and triple-bond spacing and how far the
  inner line is shortened; hash spacing; wavy amplitude and period; how ends
  and joins are finished; the label's font, size and clearance from its
  bonds; whether implicit hydrogens and terminal carbons are written; rings
  as circles or as Kekulé structures; colour, bold and italic.
- **Hashes at a fixed spacing.** A longer hashed bond gets more hashes, not
  wider gaps (PR #33).
- **More bond types.** Besides single, double, triple, wedge, hashed wedge and
  wavy: a plain bold bond, a bold dashed bond, a thin dashed bond, and a
  dative (coordinate) bond.
- **Rounding is all or nothing.** When ends and joins are round, every end is
  round - double and triple bonds included, which today are not. When they
  are square, every one is square.
- **Units.** Every length can be given in points or as a fraction of the bond
  length, whichever the user prefers.
- **Scope.** An application default; a document's own style over it; and
  per-bond and per-atom overrides over that (a coloured atom, a bold bond).
- **Where it is set.** Settings holds the application's style, and
  *Drawing style…* (a right-click on empty space) gives a
  document one of its own. Either is
  a preset - ACS 1996, RSC, Wiley or Nature - and what was changed from it;
  every setting has its name, description, unit and range in
  `styleFields.ts`, and the preview is drawn by the same layout as the
  canvas. The application's style is kept in `settings.json` in the app's
  data folder; a document's stays with its tab, as MOL and SD files hold the
  structure only. (PR #46) Per-atom and per-bond overrides are to come.
- **Reaction arrows.** The style also sets how a reaction arrow is drawn:
  its line's thickness (a bond's, unless set), its head's length and width,
  and how far the back of the head is drawn in towards its point - none
  draws a triangle, more a barbed head. An arrow can set any of these for
  itself, from *Arrow style…* in the menu a right-click on it opens: a panel
  beside the canvas, where a setting left alone follows the style. The
  canvas and the settings' preview draw the arrow from one outline
  (`lib/chem/reactionArrow.ts`).
- **Defaults.** ACS 1996, exactly, as a preset. The default is Meno's own
  style built on it: ACS 1996's proportions with round ends and joins and
  labels in IBM Plex Sans, which is also the app's own typeface - its
  capital I has serifs and its l a tail, so Cl never reads as CI (PR #47) -
  and drawn in the black of Meno's palette, #141414, a little softer than
  the pure black the journals' styles keep for print (the maintainer,
  2026-10-11).
- **Typefaces.** Any typeface on the computer: a label is placed and
  cleared by that typeface's own letter shapes, read from its file when it
  is first used (the app hands over one face of a collection, with its
  character map made plain). ASCII letters of Arial (Helvetica too) and IBM
  Plex Sans come from tables written ahead of time by
  `scripts/fonts/labelMetrics.ts`, so a label sits the same before a file
  is read and in tests. A character the typeface lacks - Japanese, above
  all - is set in IBM Plex Sans JP, which comes with Meno; a typeface that
  cannot be had or read is set in IBM Plex Sans. The baseline follows the
  typeface, so a capital sits on its atom as ACS 1996 sets Arial's. (PR #48)

**One way of drawing:**

- **The preview drawn by the resting code**: the model with the dragged atom
  moved, laid out by `layoutMolecule` and drawn by the same layers. Nothing
  about a drag is drawn any other way. (PR #38)
- `ExtendPreview2D` goes the same way. (PR #38)

### 3. RDKit in the sidecar

- A `uv` binary for macOS alongside `uv.exe`, and each platform's bundle
  carrying only its own (a Mac build currently ships the 57 MB `uv.exe`). (PR #42)
- The managed Python and uv's cache kept under the app's data directory, not
  the user's. (PR #42)
- A `chem` profile: RDKit and its dependencies, locked for every platform with
  hashes and installed with them checked; warmed up once after installing
  (the first import of RDKit takes about 15 s on a Mac, later ones 0.15 s).
  The download asks first and goes on the network's record like any other.
  (PR #52)
- A dedicated worker that answers a fixed set of requests (not the console's
  run-any-code worker) - SMILES in and out, and per atom and bond
  hydrogens, valence errors, aromaticity and CIP labels - kept off the
  network, and a typed, asynchronous client for it on the TS side. (PR #52)
- A MOL V3000 writer in TS. (PR #40)

### 4. Editing a chemist expects

All hover-based, as above.

- Delete an atom or a bond; delete a selection. (PR #54: the atom or bond
  under the pointer, by Delete or Backspace or from the menu a right-click
  opens there, one undo step each; a carbon left with no bonds goes too.
  PR #66: the selection, by the same keys or its menu, in one step.)
- Selection: by click, by adding to it, by box or lasso, a whole fragment;
  move, rotate and flip what is selected. (PR #66, as above.)
- Elements without typing; charges, radicals and isotopes, drawn as
  superscripts and carried through the model, the files and the hydrogen
  count. (PR #65: charges, radicals and isotopes read from files and
  SMILES, kept and written back; the H an atom carries follow its charge.
  Drawn as the maintainer has it: a charge of one in its circle (⊕, ⊖),
  larger ones plainly (2+), after the label and above the line or, where a
  bond runs there, beside it; a charged carbon a bare vertex with its
  charge beside it; a radical a dot; a mass number before the symbol.
  Circled or plain, and a charged carbon's C, are the style's. Set by
  typing - N+, NH3+, O-, Fe2+, 13C, or a charge alone - by + and - over
  an atom, or from its menu, which also gives or takes an unpaired
  electron.)
- **Labels typed in place** (the maintainer, 2026-10-10: no HTML box). A
  label is written where it stands, drawn by Meno as words on the page are
  (*Text*, below; `LabelTyping2D`): set as a label is set, in the drawing's
  typeface at its size, its first letter on the atom - a two-letter
  symbol's middle - on a light of its own that hides the label it had, its
  charge too; with the caret, what is selected and what an input method
  composes drawn over it. Typed through the field words on the page are
  typed through (`pageField`), laid at the caret so that an input method's
  candidates show there - an input method's full-width letters are taken
  as the ordinary ones once it gives them. Begun by a click on an atom, or
  by a letter typed over one; Enter keeps it, Escape lets it go, a press
  elsewhere keeps it; a click in it puts the caret, a drag selects. Kept,
  it is drawn as written until the drawing's own label is drawn in its
  place, then goes in a moment, the label coming through: never a frame
  with no label, nor with the old one. The drawing's labels are drawn each
  by its atom (`Labels2D` `keyOf`): a label added or taken away sets no
  other label's letters again.
- **Labels read as they are meant** (the maintainer, 2026-10-10: nh2 is
  NH2, obz OBz, hnfmoc NHFmoc; `lib/chem/smartLabel.ts`). No list of what
  is typed: of the labels Meno reads (docs/CTFILE.md, *Atoms that are not
  elements*), the one the letters typed spell, by these rules.
  1. A letter typed small may be a capital, one typed as a capital stays
     one. Part of a structure - an element, a group - comes before a whole
     molecule - a reagent, a complex - as a label on a structure stands
     for part of one (co2me is CO2Me, not a complex of cobalt; hf is Hf,
     HF typed so); then the fewest letters made capitals (co is Co, ph Ph,
     ipr iPr - not the NHC IPr).
  2. No element after uranium is read from letters typed small: nh is NH,
     cn CN, no NO; ts is tosyl, fm Fm.
  3. Typed as it is drawn on a bond's left - aco, meo, bochn, ho2c, h2n,
     or HN before a group, hnfmoc - it is kept as it reads from the bond:
     OAc, OMe, NHBoc, CO2H, NH2, NHFmoc (and drawn the other way round
     again where its bond leaves to the left).
  4. A prefix set in italics gets its hyphen: tbu is t-Bu, co2tbu CO2t-Bu;
     iPr stays.
  5. What reads as nothing stays exactly as typed - no capital made.

  As it is typed, only its letters' case changes, as they are read so far
  - the same letters in the same places, the caret where it was; rules 3
  and 4 as it is kept. An input method's composition is left alone until
  it is given. Where what is kept is not what was typed, the atom's menu
  has it back, read as nothing else (*As typed: obz*, one step); Settings
  › General, *Read labels as they are meant*, turned off keeps every label
  exactly as typed.
- Ring templates (3- to 8-membered, benzene), fused onto a bond or an atom;
  chains. (Chains and rings came back on 2026-10-03 as the honeycomb: three
  clicks on an atom or two on empty space, the honeycomb's ring where a
  loop comes round to the chain - see *Drawing is dragging bonds out of atoms*. Benzene
  and other ring templates are still to come.)
- Every bond type from the pointer: wavy, bold, dashed, and the rest of what
  the cycle cannot reach today.
- Abbreviations (Me, Ph, Boc, OTBS …) that read correctly and can be expanded.
- Clean-up of a structure or a selection. (PR #53: the whole drawing from
  its button, or the structure under the pointer with Ctrl/Cmd+Shift+K, as
  one undo step; the structures a selection is in, PR #66. Since the layout engine,
  4a, it is the engine's drawing - turned the way the structure is usually
  drawn, not the way it was - each structure where it was.)
- Valence warnings, and R/S shown on request (RDKit). (PR #53: a ring round
  an atom with too many bonds, saying what is wrong under the pointer; R/S
  and E/Z from a button on the canvas; both in Settings › Chemistry, and
  never in an exported picture.)
  - **Stereochemistry drawn by luck** (the maintainer, 2026-10-11): a
    stereocentre whose wedge says its configuration only as its bonds
    happen to fall - two of them in a line, or all of them in one half of
    the page - and a double bond with a group almost in line with it, which
    a reader may take either way, are marked as a valence problem is, the
    ring dashed: "This stereocentre can be read either way as drawn", "This
    double bond can be read as cis or trans as drawn". Worked out by Meno
    itself, with or without the plugin, whatever made the drawing - a
    Clean-up, a SMILES, a hand - and never in an exported picture
    (`unsureStereo`, `unsureOf`). The engine draws none so where it can
    help it (docs/LAYOUT-2D-TUNING.md, *A wedge that reads by luck*).
  - How R, S, E and Z are written (2026-10-05, the maintainer: the
    parentheses looked clumsy, and a drawing's needs no colour; Meno's own
    style without parentheses, the journals' after IUPAC or their own
    rules). In the drawing's typeface and colour, in italics - r and s at
    a pseudo-asymmetric centre; an axis's a upright and set below, Ra and
    Sa (IUPAC 2013, P-91.2.1.1). Bare in Meno's style, and in RSC's,
    Wiley's and Nature's, as IUPAC's recommendations for structure
    diagrams draw them (Brecher 2008, GR-11; the journals say nothing of
    them in drawings, and Wiley's point to those recommendations). In
    parentheses, (R), in ACS 1996's, as ACS writes them in names. A
    setting of the drawing style: *R, S, E and Z*.
  - Where: opposite the stereocentre's wedge or hash where it has one,
    in the widest gap between its bonds (GR-11.1); an E or Z beside its
    bond's middle (GR-11.2); and each a little way off the others, so that
    two side by side do not read as one.
  - How far off its atom: a setting of the drawing style, *R and S:
    distance from the atom*, from the atom to the nearest of the letters,
    as a share of the labels' size. IUPAC puts them about half a capital's
    height off (35%), as ACS 1996 keeps them in parentheses; written bare
    they look further off at that, and the maintainer asked for them
    nearer (2026-10-05): 15% in Meno's style and the other bare ones. On a
    molecule in 3D, the same share beyond its ball.
  - Hidden unless asked for, on the drawing and in 3D (the maintainer,
    2026-10-10): *Show R and S* (the menu, or Settings › Chemistry) shows
    them; making every stereoisomer a drawing leaves open shows each
    one's open centres, to tell them apart (docs/WORKSPACE.md, *Told
    apart*).
- **Charges, R and S put by hand** (the maintainer, 2026-10-10). A charge
  - with its radical's dots - an R or S, and an E or Z are each taken hold
  of on their own ink, and nowhere else (a press beside one is the atom's),
  lit and with Meno's moving pointer as the pointer is on them; dragged,
  each goes where the pointer takes it and stays there, as one undo step.
  Two clicks on one put it back where the drawing puts it. Where it was
  put is kept from its atom - an E or Z from its bond's middle - in ems of
  the labels, so it goes with the atom as the atom moves, is turned and
  turned over with the selection, is saved and copied with the drawing,
  and a charge so put is in an exported picture (R and S never are). Clean-up puts
  every mark of the structures it cleans back where the drawing puts
  them: they were put for the drawing as it was, and Clean-up draws it
  anew; undo brings them back. A label's charge put by hand leaves the
  label, set beside it where it was put (`Atom.chargeAt`, `stereoAt`;
  `Bond.stereoAt`; `MarkHold2D`).
- **Electron-pushing arrows** (the maintainer, 2026-10-10: arrows for how
  electrons move; their drawing settled 2026-10-11). A curved arrow from a
  lone pair, a bond or an atom to an atom, a bond, or the gap between two
  atoms where a bond forms - its head full, for a pair of electrons, or
  half, a fishhook, for one, the barb on the outside of the curve.
  - Begun from the menu of the atom or bond it leaves - *Electron-pushing
    arrow* or *Fishhook arrow*, icons in its row - or from Quick Add,
    where the first atom or bond pressed is where it leaves. It then
    follows the pointer, the button up, and comes to the atom or the bond
    under it, or to the gap between two atoms not bonded whose middle the
    pointer is near; a click there puts it down, one step - and so does
    letting go there, of a press that began on the menu's icon. A click on
    nothing, Escape or a right press lets it go. Being drawn, it is in the
    highlight's colour until it has an end. No key draws one (drawing by
    extension, 2026-09-27).
  - Anchored: it is kept by the atoms and bonds it leaves and reaches, not
    by where it was drawn, so it goes with them as they are moved, turned,
    turned over (bent to its other side, as a mirror shows it) and cleaned
    up (bent as Meno bends it again, as marks put by hand are put back), and
    goes when they go.
  - Laid as a chemist draws one by hand (the maintainer, 2026-10-11, from
    their own handwritten mechanism; "an SN2 should look much more like an
    SN2"):
    - it leaves a lone pair the way the pair points - two dots beside the
      element's symbol, clear of its bonds and of the side its label's H's
      are written on, where the atom has one to give (N, O, S, P, Se, the
      halogens, or a negative charge), which its menu can leave off - or a
      bond from beside the middle of its line as drawn (shortened where a
      label stands at an end), clear of its lines by a little, a double
      bond's second line too;
    - from an atom with a negative charge - O-, N-, a carbanion, a halide,
      HO- - it leaves from the charge's mark, out of its circle and away
      from the label, with no lone pair's dots, wherever the charge is
      written or was put by hand (the maintainer, 2026-10-11, as their
      handwriting does at an oxyanion); its menu sets it to leave from a
      lone pair instead, *From a lone pair*, its dots then shown or left
      off. A fishhook from an atom with a radical leaves from the
      radical's dot. A neutral atom's arrow leaves a lone pair, as before;
    - it comes onto an atom from the side its new bond forms, short of its
      label - and straight from behind a bond the atom loses as it gains
      one, another arrow taking that bond's electrons: an SN2's attack
      comes in from the back of the carbon;
    - a long one rises off its tail and comes down onto its head, an arc
      and never a line or an S, round the structure rather than across its
      bonds and labels, and clear of the arrows laid before it (a leaving
      group's curl on the far side from the attack);
    - a short one - from a bond to its own atom, a lone pair to the bond
      beside it - is a round curl beside the bond, about as big as a label,
      with no corner in it;
    - its line is a bond's; its head small and barbed, the drawing style's
      (*Electron-pushing arrows*: head length, width and notch). It is in
      the bonds' ink, unless it is given a colour of its own from its menu
      (*Colour…*).

    Where a crowded drawing leaves it no good way, it can be bent by hand.
  - Under the pointer it is lit from behind, is the one a right-click's
    menu is for, and shows a handle at its middle and at each end: its line
    or its middle dragged bends it through the pointer; an end dragged onto
    an atom, a bond or a gap takes it there; each one step. Two clicks on
    it bend it as Meno does again. Delete or Backspace under the pointer
    deletes it.
  - Saved with the workspace, carried by a copy that holds both its ends
    (on their new ids where it is pasted), and drawn in an exported SVG and
    in a copy's pictures, as on the canvas - its line there as the curve it
    is (an SVG path, EMF+'s Bezier curves and GDI's PolyBezier), smooth
    however far a picture is enlarged (a Windows check found PowerPoint
    showing corners at 17 times); a MOL, SD or RXN file has no
    place for it (`lib/chem/pushArrow`, `utils/pushes`, `PushArrows2D`,
    `PushDraw2D`; `PushArrow`, `pushes`).
- **Colour** (the maintainer, 2026-10-11: colour on parts of a structure;
  a highlight's edge sharp, never a glow; rings filled too). *Colour…*, in
  the menu of an atom, a bond, the selection or a ring - a right-click
  inside one with nothing selected - opens a card where the menu was, of
  a row for each thing it can give: *Colour*, the atoms' labels (their
  charges too) and the bonds' lines; *Highlight*, laid behind the drawing,
  a band along each bond and round each atom - round its label, where it
  has one - flat, so that the pieces of one colour run together into one
  shape with a sharp edge; and *Fill ring*, over the inside of each ring
  it holds whole, or of the ring right-clicked. A highlight and a fill are
  in the colour exactly as it is chosen, never lightened (the maintainer,
  2026-10-11): a pale colour for them is in the set. An electron-pushing
  arrow's menu has it too, of the one row *Colour* - the arrow's line,
  head and lone pair. Each row has none, the colours of the set in use and
  any other, from the system's chooser; the one given now is ringed.
  - **Colour sets** (the maintainer, 2026-10-11), in Settings, General,
    *Colours*, chosen as the drawing style's presets are; the one chosen is
    the one in use (the card offers only it). Meno's - its base #317689,
    its accent #cd4560, a pale one of each, #b2d9e4 and #ebb3be, for a
    highlight or a fill, a black #141414 and a gray #c0c0c0: a few that
    look right as they are, as colour makes a drawing look cheap easily -
    and Okabe and Ito's, told apart by those who see colours otherwise,
    are built in and kept as they are. The plus after the sets begins one
    of the user's own; a set's menu (a right-click) duplicates it, and
    renames or deletes one of the user's own. The user's own set in use
    shows its colours: two clicks on one open the system's chooser beside
    its hex and its red, green and blue (0 to 255), which keep in step; a
    drag moves it along; its menu changes or removes it; the plus adds one.
    The sets are saved in Settings' file, read back only as colours
    (#rrggbb, each once, sixteen to a set), their names on one line,
    twenty sets of the user's own at most (`lib/chem/palette`,
    `ColourSettings`).

  A swatch is given at once, one step each (as long as the chooser is
  open, one step in all), and the card stays open for the next; Escape, a press elsewhere or the
  wheel closes it. A selection's colour goes to its atoms and the bonds
  selected among them; a bond keeps its own colour, its atoms theirs.
  R, S, E and Z are never coloured (2026-10-05), nor is anything Meno
  marks on its own. A colour goes with its part as it moves, is turned
  and is cleaned up; it is saved with the workspace, carried by a copy -
  the fills of the rings it holds whole too - and drawn in an exported
  SVG and in a copy's pictures (EMF, PNG), as on the canvas; a MOL, SD or
  RXN file has no place for it. A colour read from a copy or a workspace
  is taken only if it is one (#rrggbb), as it goes into a picture's
  markup (`Atom.color`, `highlight`; `Bond.color`, `highlight`;
  `ringFills`; layout2d `under`; `ColourCard`, `Fills2D`, `utils/rings`).
- Everything a molfile, SDfile or Rxnfile can hold, read after CTfile Formats
  and drawn after IUPAC's recommendations: docs/CTFILE.md, step by step.
- Abbreviations: Meno's own, those put together by rule (OTBS, 2,6-diMeBz)
  and the user's own, from Settings › Dictionary or a selection's *Save
  as abbreviation…*: docs/CTFILE.md, "Atoms that are not elements".
- Reaction arrows, "+" and text: create, move, edit, delete. (An arrow or
  a "+" is added from Quick Add, where it was opened: the arrow pointing right, two and two-thirds of a bond long.
  Either is moved by dragging it and deleted by Delete or Backspace under
  the pointer, or from its menu. The arrow under the pointer shows a handle
  at each end: dragged, that end goes where the pointer goes and the other
  stays, its direction in steps of 15 degrees, as a bond's, or freely after
  a pause - one undo step. An arrow sets its own line and head, as above.
  They come from an RXN file too, and are saved - as an RXN file - copied
  and in an exported picture: docs/CTFILE.md, "Reaction schemes".)
- **Text** (the maintainer, 2026-10-08: reagents' labels): words on the
  page - a reaction's reagents and conditions, or anything else
  (`lib/chem/captions`, `Captions2D`, `CaptionTyping2D`).
  - Written in place, from Quick Add; written anew as words are anywhere
    (the maintainer, 2026-10-10): a click on them puts the caret there, a drag on them
    selects letters from where it pressed, a second click selects a word
    and a third a line - the click that opened them counted among those -
    and their menu's *Edit text* puts the caret at their end. Enter keeps
    them, Shift+Enter starts another line, Escape lets them go, a press
    elsewhere keeps them; written away, they are gone. As they are
    written, undo is their own; kept, one undo step. Over them the pointer
    is the system's text pointer.
  - Written where they stand, drawn by Meno as they will be kept - set as
    below, broken into lines as wide as they are made - lit round while
    they are written, with the caret, what is selected and what an input
    method composes drawn over them (docs/PDF.md, step 5). A click among
    them puts the caret, two select a word, three a line, a drag selects
    on; an editor's keys move and select as in the column of texts.
  - **Written as they are meant** as they are typed (the maintainer,
    2026-10-11: conditions; `lib/text/smartWords.ts`), as journals print
    them. Only what is typed: what is pasted is left as it is.
    1. **°C.** "dc", in either case, straight after a number or a range -
       with a space or without - once what follows it is no letter or
       digit: 60dc and 60 dc are 60 °C, -78dc is −78 °C. Always one space
       between the number and °C. DCC, DCM, DCE and dCTP have no number
       before them and stay.
    2. **Minus.** A hyphen at a word's start - the words' start, after a
       space or an opening bracket - is a minus sign (U+2212) as soon as a
       digit is typed after it: -78 is −78, (-20 °C) (−20 °C). Hyphens
       within words stay: 2-propanol, N-methyl, t-BuOK, 18-crown-6.
    3. **Ranges.** A number, one hyphen and a number, a word of its own,
       have an en dash (U+2013) once the word has ended - a space, a
       bracket, a stop or a comma after it, or the words kept: 1-2 h is
       1–2 h, 0-25dc 0–25 °C, compounds 3-5 3–5. Not before, as 7647-0 may
       yet be a CAS number. Numbers joined by more hyphens are no range -
       a CAS number (7647-01-0), a date (2026-10-10) - and stay; so does a
       hyphen with a letter beside it (4-Å MS, Pd-118, 1,2-dichloroethane).

    Each is a step of its own: one undo gives back the words as typed, and
    that part is then left as typed until it is written again. Settings ›
    General, *Write words on the page as they are meant*, turned off keeps
    every word exactly as typed. Atoms' labels have rules of their own
    (above), and the column's texts are never changed.
  - Drawn whole: the type draws a text's letters a frame or two after it
    is given them, and showed the old ones meanwhile - a letter deleted
    stayed on the page for a moment, the caret already before it (the
    maintainer, 2026-10-10). Each change is now set out of sight and shown
    once every letter of it is drawn, the caret and what is selected with
    it; the words being written take the place of their own only once they
    are drawn, and give it back, kept or let go, only once those are
    (`Labels2D` `WholeTexts2D`).
  - Set as a label is set, word by word: a formula's counts low (K₂CO₃,
    Pd₂(dba)₃, Pd(PPh₃)₄), a prefix's t- in italics at a word's start
    (*t*-BuOK, not the o of co-solvent), a sign at a formula's end its
    charge (NH₄⁺); what has no letter in it - 60 °C, 12 h, (1:1), + - as
    typed. Line under line, each centred, in the labels' typeface and size.
  - Put down near an arrow - within its length and two and a half ems of
    it - they go over it or under it, on the side they were put, centred on
    its middle and half an em clear of it, beyond any words already there;
    and go where the arrow goes, moved or drawn out, until they are dragged
    off it. Put down elsewhere, they stay where they are put.
  - An arrow is as long as its words need (the maintainer, 2026-10-11):
    where the words over it or under it would run past it, it is drawn out
    about its middle - nothing else moves - to reach three quarters of an
    em past the longest at either end, and as they get shorter it goes back
    to the length it was made, never shorter. It follows them as they are
    written - new words near it as well, which will go over it - going over
    to each length gently, and is drawn so in a copy's pictures and an
    exported SVG. What is saved is the length it was made; drawn out by an
    end, it is no shorter than its words need, the other end staying where
    it is (`lib/chem/captions` `wordsNeed`, `components/drawnArrows`).
  - Lit from behind under the pointer. Held still a moment (a long press,
    as on a structure), they are taken hold of - lit from the pointer out -
    and selected, as one thing, with the selection's shade; a drag on from
    there moves them, or the whole selection where they are selected with
    more, as one undo step. Ctrl (⌘) and a click adds them to the selection
    or takes them out; Select all takes them. Selected, they are deleted,
    cut and copied with the rest of the selection, pasted selected; words
    alone go on the clipboard as Meno's own record. Deleted by Delete or
    Backspace under the pointer or from their menu, too.
  - Made wider or narrower by their edges, shown as they are lit (the
    maintainer, 2026-10-09): dragged sideways, with Meno's own pointer for
    it, the other edge staying where it is, their words are broken at
    their spaces into lines no wider than they are made - as many words on
    each as fit, each line still centred, a word wider alone on its line, a
    number or a range never parted from the unit after it (60 °C, 12 h,
    2 equiv, 0–25 °C); a drag is one undo step. Written anew, they are
    written at that width. *As wide as its words*, in their menu, is a line
    for each line typed again. The width is saved, copied and drawn with them.
  - Their lines lie as their menu says (the maintainer, 2026-10-09): *Align
    left*, *Align centre* (as they come), *Align right*, or *Justify* -
    spread to both edges, but for the last line of each line typed, which
    lies to the left - the one chosen marked. In the width they were made,
    or the widest line's. Saved, copied and drawn so.
  - While they are written, their box is the system's own text box, which
    breaks lines as the system does, and may part a number from its unit;
    kept, they break as above. Words written in place drawn by Meno itself,
    as it will draw a text's typing (docs/PDF.md, step 5), will break as
    they will be kept.
  - With a selection when among it, or over an arrow among it: copied,
    cut, deleted and moved with it (not turned). Saved in the workspace,
    kept by a copy's record, drawn in an exported SVG and in the pictures a
    copy puts on the clipboard; taken into a fit. An RXN or MOL file has no
    place for them, and does not keep them.
- Copy and paste, within Meno and between tabs. (PR #68, as above; and
  between Meno and other programs, through the system clipboard.)

### 4a. A layout engine of Meno's own

Agreed 2026-09-27: clean-up as it is (RDKit's layout laid over the drawing,
PR #53) falls well short - taxol comes out unrecognisable - and neither of
RDKit's layout engines is good enough to build on, so Meno gets its own,
written from scratch, used for clean-up and for structures that arrive
without coordinates (SMILES).

What it has to do, in the maintainer's words: rings drawn clean and regular,
ring bonds kept plain with stereo shown on the bonds out of them - adding an
H where a ring-fusion centre has no other - substituents that would clash
turned to where they fit, and stretched only if they still clash, and the
molecule turned the way it is usually drawn (taxol with its bridgehead
double bond level). Macrocycles, macrolides above all, must come out well
as a matter of course. Sugars, amino acids and peptides, nucleosides and
lipids each have their own way of being drawn, which it should know.

1. **A benchmark to judge it by**: some seventy molecules, each beside the
   structure its Wikipedia article shows, with numbers for what looks
   untidy and for how the drawing sits - square to the lattice, its chains
   level, read left to right (`scripts/layout`, `src/lib/layout/metrics.ts`).
   The numbers are general rules, not a record of particular molecules.
   RDKit's two engines are the baseline. (PR #58)
2. The engine itself (`src/lib/layout/engine.ts`, by the rules in
   `docs/LAYOUT-2D.md`): ring systems, chains, macrocycles, stereo display,
   clash removal and orientation, measured on the benchmark at each step.
   A first pass is in; on the benchmark it scores best or level on most of
   the molecules against RDKit's two engines.
3. Clean-up and SMILES import moved onto it: `chem/cleanUp.ts` and
   `chem/engineLayout.ts`, the engine in a worker of its own
   (`chem/layoutWorker.ts`), as a large structure takes it up to a second.
   - What the engine is given is read out of the drawing itself
     (`lib/layout/drawn.ts`): each centre's configuration from its wedges,
     read as RDKit reads them, and each double bond's from its sides. So
     Clean-up no longer needs RDKit, and works before it is set up.
   - An H drawn on a stereocentre is taken as the centre's own: kept if
     the engine draws one there, taken away if not, and one added where the
     engine draws an H the drawing had not.
   - A cage comes out in perspective, as the engine draws one: its atoms
     keep a depth (`Atom.z`), and a bond passing behind another is drawn
     broken there. Its stereocentres (`Atom.stereoCentre`) show their
     configuration by the drawing itself, with no wedges: it is read from
     where their bonds point, so a substituent drawn round to the other
     side turns its centre (agreed 2026-09-28). A file, the SMILES and R/S
     are given the wedges that say it (`chem/drawing.ts#forFlatReaders`);
     the depth itself is not saved, so a cage opened again is flat, its
     stereochemistry wedged.
   - The new drawing is read back before anything moves: if it would not
     say the stereochemistry the old one said, Clean-up refuses. So it does
     for a wedge it cannot carry - wedge and hashes drawn opposite each
     other, or on an atom whose fourth group is a lone pair (a sulfoxide's
     S), which the engine has no way to take - rather than lose it. A wedge
     that says nothing (on a CH2) goes, and a double bond in a ring of
     seven atoms or fewer says nothing either: its ring has it cis, however
     the ring is drawn.
   - A SMILES is still read by RDKit, whose drawing says what it means;
     the engine then draws it (RDKit's drawing stands, should the engine
     fail).
   - Clean-up writes by name the groups a chemist would write so
     (`lib/chem/contract.ts`, agreed 2026-10-02). Drawing a label out
     (*Expand abbreviation*) still draws all of it; what is shown by name
     is Clean-up's to decide, by what the group does and how much of the
     molecule it is:
     - a protecting, activating or leaving group (`role` in
       `abbreviations.ts`: TBS, Boc, Ts, Tf, MOM, Bpin...) is written by
       name wherever it does that work - on a heteroatom or a metal, TBS
       even on ethanol, or on a carbon by an atom not carbon (TMS, Bpin,
       Ts) - unless the rest of the molecule is one atom or none: TsCl,
       Boc2O, B2pin2 and TBSOH are the group's own reagents, and are drawn.
       On a carbon by a carbon it is something else - "Boc" so is a
       tert-butyl ester, "MOM" a methoxymethyl - and goes by the next rule;
     - any other named group of three atoms or more, hanging by one bond
       from a heteroatom or a metal, is written by name where it is under
       15% of the molecule's atoms: taxol's OAc and OBz, Pd(PPh3)4's
       phenyls, but not aspirin's acetyl, a quarter of it. Methyl and ethyl
       are always drawn;
     - a group written as its formula wherever it hangs - an atom and the
       halogens on it, two or more (CF3, CCl3, CHF2, SF5), and a nitro
       group, NO2 - is written so (agreed 2026-10-02), unless the rest of
       the molecule is one atom or none (CF3I; the Ruppert-Prakash
       reagent's CF3, beside its TMS). Acids, amides, nitriles and
       sulfonyl groups - CO2H, CONH2, CN, SO2Cl, SO2NH2, SO3H, PO3H2 -
       are drawn;
     - where the drawing still hides something - atoms on each other, or
       on a bond - the largest groups left, alike ones together, are
       written by name too, for as long as each time hides less;
     - a heteroatom hanging by one bond, everything else on it written by
       name, goes into the label with them: OTBS, NHBoc, PPh3, PPh2;
     - what the last edit drew out of a label stays drawn out for the
       Clean-up straight after it, and for that one only, so that nothing
       is left drawn out for good;
     - a group holding a wedge's stereocentre, or an atom with more to it
       than its element and charge (an isotope, a radical, an atom map), is
       drawn: its label would not say it.

     It is one undo step with the layout. The dictionary's pictures of
     reagents, complexes and counter-anions (BArF's CF3) follow the same
     rules; a group's or a ligand's own picture is drawn out.

Its code is Meno's own: nothing taken from other depiction code, nothing
traced from reference drawings.

### 5. Files, clipboard and export

- Save and Save As (MOL/SDF), Ctrl+S, and closing asks when there is
  something to lose. (PR #43) Since 2026-10-06 (docs/FILE-IO.md), Save and
  Save As write the workspace (`.meno`) alone; MOL, SDF, RXN and SVG are
  written by Export; and closing offers Save beside Close without saving.
- Open (Ctrl/Cmd+O, or the menu on empty space) puts a file in a tab of its own - or
  in place of a blank canvas - named for the file; text goes into the
  column of the workspace in front (docs/WORKSPACE.md, *Texts*). The canvas is saved
  nowhere then: Save asks where, suggesting that name. A save names the
  tab for its file too. A canvas opened from Word or PowerPoint keeps the
  document's name either way.
- Import that keeps charges, isotopes, radicals, atom lists and S-groups, and
  V3000 reactions.
- SMILES in and out: in from Quick Add's *SMILES* (2026-10-10; a card on
  the canvas before, PR #52), out by *Copy as SMILES* in the selection's
  menu.
- SVG export, drawn exactly as on the canvas - with the drawing style it was
  drawn in - and PNG. The SVG export draws what the canvas draws (PR #36),
  at ACS 1996's own size (PR #43); PNG to come.
- No buttons on the canvas (2026-10-04): Open (Ctrl/Cmd+O), Save As, New
  text, Fit to content (Ctrl/Cmd+1), R and S and Drawing style are on the
  right-click menu on empty space; Save is a button in the title bar, by
  Settings, and Ctrl/Cmd+S; Export is on the selection's menu; Clean-up
  and 3D structures of everything are Select all and the selection's menu
  (or Ctrl/Cmd+Shift+K on nothing); a SMILES is drawn from Quick Add.
  (Meno's menu, from its logo, held them until 2026-10-10.) Open puts a
  file in a tab of its own, never over what is drawn; a file dropped on
  the drawing is added to it.
- The clipboard, for Word and PowerPoint: a vector picture in each platform's
  own form (EMF on Windows, PDF on macOS), PNG and MOL alongside it.
  Agreed 2026-09-29: the structure is re-edited from Office - on Windows by
  a double-click (an OLE object), and on either system by copying the
  picture back into Meno, so the structure travels inside the picture
  itself. Tried on a Mac with Word and PowerPoint (paste, save, reopen,
  copy the picture again): a PDF comes back byte for byte, and so does a
  PNG, inside Office's own clip format; an EMF that Meno writes, handed
  over in that clip format, is kept as it is, drawn as vectors, and chosen
  over a PDF or a PNG offered with it - and, stored as an EMF, it is what
  Windows draws too. Word rewrites an SVG and drops what it carries. The
  same trial on Windows (Microsoft 365, 2026-09-29) found the same: the
  EMF in Office's clip format is kept byte for byte and drawn as vectors,
  and it is only in that clip format that Office hands it back - the EMF
  it puts on the clipboard itself is drawn afresh, without the comment. With
  the clip format there, plain text beside it does not become a text box
  (on either system); a PDF from a Mac shows coarse on Windows (Office draws
  the bitmap stored with it). (PR #69: every copy carries these pictures;
  the double-click on Windows is still to come.) Office on Windows draws
  an EMF's lines and shapes without anti-aliasing - bonds and wedges come
  out as stairs on screen - so the EMF draws everything twice: in EMF+
  records, which Word and PowerPoint draw smooth, and in the EMF records
  as before, for any reader that knows nothing of EMF+. Both keep it byte
  for byte, as before (Windows, 2026-09-29; on a Mac, 2026-09-30, drawn
  smooth there too).
- On Windows, a structure copied from Meno goes into Word and PowerPoint as
  an object - a Meno structure, which a double-click opens in Meno - by a
  plain paste. Meno is the object's server (`src-tauri/src/ole.rs`): it
  offers the class to COM as it starts, so a double-click reaches a Meno
  already running; with none running, Windows starts one, unseen, which
  goes again once Office is done with its objects and nothing else is open
  (Office also starts one only to have a picture). The structure opens in a
  tab of its own; each change goes back into the document as it is drawn -
  Meno's record, and the same EMF (EMF+ and all) as the picture shown - and
  closing the tab, or the document, lets it go. Insert > Object makes a new
  one. The installers register the class (the NSIS hooks run
  `Meno.exe --register-ole` and `--unregister-ole`, for the user; the MSI
  writes the same keys for the machine), and so can a developer by hand.
  What decides a plain paste, found on Windows (Microsoft 365, 2026-09-30):
  Word pastes a PNG, and PowerPoint Office's clip format or any RTF, in
  preference to an object; a copy between Word and PowerPoint carries none
  of these, and pastes as an object in both. So where Meno serves its
  objects, a copy carries the object, through OLE's own clipboard, with an
  EMF and a bitmap (DIB) for Windows' other programs, and neither the clip
  format nor the PNG; elsewhere (a Mac, or Meno not registered) it carries
  the pictures as before. The object keeps Meno's EMF byte for byte in the
  saved document, and copied back into Meno it is the structure again.
  Its size is the drawing's own, through an edit, a save and a copy
  between Word and PowerPoint (to within 1%). That takes care: Office
  measures a picture it asks for (Word as it saves an edited object, and
  as it copies one) by taking the frame's hundredths of a millimetre to
  pixels by the screen's physical size and back by its logical DPI, which
  seldom agree - 0.98 on the 100% desktop screen this was found on, 1.59
  over Remote Desktop at 175% (both tried) - while a picture it is sent as
  the drawing changes it takes as it says. So Meno sends the EMF as it is,
  and hands what Office asks for drawn to that measure: the same picture,
  its frame and all it draws scaled together, so that it looks the same
  in any box and only its stated size changes. (OLE's own cache sizes an
  EMF the same way, and keeps it so in the document; nothing seen reads
  it. A metafile picture with its size stated would keep it exact, but
  Word takes an object's changes only as an EMF.) A Mac cannot serve
  objects: there a document's object shows its picture, and a picture
  pasted from a Mac is a picture on Windows too - copied into Meno and
  pasted back, it becomes an object.
- On a Mac (Word and PowerPoint for Mac, 2026-09-30), a document's object
  shows its picture - smooth, at its size - and survives being saved there
  byte for byte, moved or not. A double-click on it only says the server
  cannot be found: Office for Mac has no way to hand another program's
  object to it. To edit one there, copy it - or drag it - into Meno. Word
  and PowerPoint for Mac hand an object over as its storage (a compound
  file, `com.microsoft.Embedded-Object`), without Office's clip format;
  Meno reads its record out of the storage's `Meno` stream (or its picture,
  `MenoPicture`), `src/lib/binary/cfb.ts`. A drag is read as it comes over
  the drawing, not when it is dropped: by then Office has taken it back
  from the drag pasteboard. A copy on a Mac makes only what the clipboard
  there takes (`clipboard_takes`): no bitmap or object for Windows.
- Drops are routed to the part of the page they land on (`src/lib/drop.ts`):
  a part that takes them - the drawing now; a tab strip, a workflow's node
  or a 3D view in time - registers as a drop zone, which says what it
  takes, may start reading a drag as it comes over, and is handed the
  drop. Files from the Finder or Explorer come through the webview's own
  drag events on both platforms, as does everything on a Mac. On Windows,
  WebView2 takes every drop in a process of its own and hands the page
  only files and text, and Meno nothing, so a drag from another program
  that is not of files is taken from it where a zone takes such drags:
  Meno lays a window of its own over the zone, clear to the eye, which
  Windows hands the drag to from the next move on (`src-tauri/src/drop.rs`).
  It reads what the drag carries - Meno's record in Word's object (which
  Word writes into a storage Meno makes, `GetDataHere`), Office's clip
  format, a PNG, a MOL file - and tells the page where the drag goes and
  where it is dropped; `drag_read` reads what it read. It offers only a
  copy, so the object stays in its document, and goes as the drag leaves
  the zone or ends (or when no button is held and nothing came to it).
  Tried on Windows (2026-09-30): Word's object dragged onto the drawing
  arrives there, selected, and Word's document is unchanged; so does a
  picture Meno put in Word (Office's clip format), which Word hands over
  only when a block of memory is asked for, not "memory or a stream" -
  so each is asked for in turn; both at 100% and over Remote Desktop at
  175%. Files onto the drawing and onto a new tab open as before. What a
  drag carries is read again at the drop if nothing was to be had as it
  came. PowerPoint for Windows
  was not seen to let a shape be dragged out of its window at all (nothing
  reached a plain drop target either): from there, copy and paste.

### 6. Alongside

- One molecule type instead of four (audit A1), before charges are added to
  any of them.
- Dead code out of `Atoms2D` (the spring and snap block that
  `LIVE_MOVE_PREVIEW = false` switched off, about 300 of its 1000 lines),
  and unused store actions.
- Tests for vertical labels, rings and aromatic circles; a GUI harness
  scenario for every gesture as it lands, zoomed-in drags among them, and a
  pixel diff between a `before/` and an `after/` run.

## Open questions

- **Name to structure, and back**: part of a high-end editor, but outside
  RDKit.
