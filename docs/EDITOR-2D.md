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
  - A click alone selects the atom, alone, at once: its shade spreads out
    from the atom in 160 ms (`SPREAD_MS`, eased). The second click of a
    double-click, within DOUBLE_CLICK_MS (half a second), takes it back -
    the selection as it was, the shade drawing back into the atom in 140 ms
    (`DRAW_BACK_MS`) - as it draws the bond (`clickSelectAtom`,
    `clickTakeBack`; the maintainer, 2026-10-18: a click with no answer
    looked broken. Before, a click edited the label once the double-click
    time had passed). An atom selected already is not spread again. The
    end of a drag is not a click, though the browser fires one wherever the
    button comes up: a bond let go on the atom it has just drawn does not
    go on to select that atom (utils/press). A label is written by typing
    over the atom, or from its menu (*Labels typed in place*, below).
  - A pause in a drag (FREE_MS) lets a bond or a moved atom go exactly
    where the pointer is, off the grid.
  - A bond led within reach of an atom closes onto it, and so does one led
    onto an atom however far away - a long bond closes a ring too; the
    preview shows it closed before the button comes up.
  - **A ligand bound through a ring or chain of its atoms** (eta: Cp,
    benzene, allyl; the maintainer, 2026-10-17) is one bond: a line from
    the metal to the centre of the ring. A bond drawn from a metal that
    ends inside a ring, with no atom under the pointer, binds the ring
    that way - the preview goes to the ring's centre (`chem/eta`
    `etaRingAt`). From any other atom it draws a bond to a new atom there,
    as before (a bridge drawn across a ring). The bond is held as the
    CTfile holds it - to a star at the ring's centre, its endpoints the
    ring's atoms - and the star is no atom to the user: it is not hovered,
    picked or labelled, it stands at its ring's centre wherever the ring
    is moved, a box or lasso takes it with its whole ring and never alone,
    and it goes with its bond: the bond deleted, its metal deleted, an atom
    of its ring deleted or merged onto another (`etaHeld`). The line
    reaches the centre itself, where the CTfile's star stands, as the bond
    is to the system as a whole (IUPAC GR-1.7); it is not stopped short at
    the ring's edge or its circle. A label on a metal - Cp, allyl - stays a
    label, and written out it is this bond.
  - **An η3-allyl** (the maintainer, 2026-10-18; IUPAC 2008 GR-1.7.2 and
    GR-6) is drawn as its three carbons - a bent chain of two single
    bonds, its middle carbon away from the metal - with its delocalisation
    curve (curves show delocalisation, GR-6.3) just inside it on the
    metal's side: parallel to the chain and
    convex the same way, nowhere nearer its bonds than a double bond's
    spacing in the style - measured where it comes nearest, by the apex
    (within GR-6.1's band) - shorter than the chain as a double bond's inner
    line is (0.8 of the way along each bond), solid and as wide as a single
    bond (GR-6.2). The metal's one plain line points at the curve's middle
    and stops short of it, as a bond stops short of a label (the label
    margin); its star stands at the curve's middle (`chem/eta` `starPlace`, `lib/chem/allylArc`
    `allylCurve`). The chain's two bonds are drawn single whatever their
    orders - the curve is the delocalised system, the single bonds its frame
    (GR-6.4); the drawing keeps its bonds as drawn. The curve is the bond's
    own ink: in its colour and width, magnified with its structure, shaded
    with it as it is selected and banded with it as it is under the
    pointer, and drawn the same in SVG, PNG and EMF. Clean-up poses the
    allyl so: its middle carbon away from the metal, the line between its
    end carbons across the metal's, and as far out as gives the metal's line
    0.7 of the allyl's bond seen between the metal's label and the curve,
    measured as the style draws it, however the label is set (Pd's "d"
    reaches further right than its "P" left). Only the drawing: the file keeps the multi-centre bond
    (ENDPTS, ATTACH=ALL) as it is; a ring - Cp, an arene, a cyclopropenyl -
    keeps its line to its centre; nothing changes in 3D.
  - **An alkene bound through both its carbons** (eta2; 2026-10-17) may be
    drawn either way, and each stays as drawn: two bonds from the metal,
    one to each carbon - as a metallacyclopropane is drawn too, and never
    merged into one by Clean-up - or one line from the metal to the middle
    of the C=C, the same multi-centre bond with the two carbons as its
    endpoints and its star at the bond's middle. A bond drawn from a metal
    that ends on the middle half of a double or triple bond, on no atom,
    binds it so (`etaBondAt`); it is hovered, selected, deleted and undone
    as one bond, and goes when either carbon goes.
  - **Chains** (agreed 2026-10-03): Quick Add's *Chain* from empty space
    draws a chain, and so does *Chain from here* on an atom's right-click
    menu (shown where the atom can take another bond) - led by a drag, or,
    the press on the icon let go where it was (the menu's: at once), traced
    with the button up until a click ends it; Escape lets it go, and so
    does undo (Cmd/Ctrl+Z) while any gesture is under way - a chain, a
    shape, an arrow, a stroke of ink, a drag, a box, a handle's resize, a
    molecule in 3D turned or moved, a measurement's value set - undoing
    nothing more (the maintainer, 2026-10-14; `gestureUnderWay`,
    store/gesture). While a label or words on the page are typed, undo is
    the words' own, as in a text field, and never the document's under
    them (`wordsUnderWay`). A gesture lost - the window left, the pointer
    taken from it - is let go the same way, and its flags with it, so that
    no undo after it is taken for it (`letLostGesturesGo`). Three
    clicks on an atom are not a chain gesture, nor are they anywhere: a
    third click is a click like the first (the maintainer, 2026-10-16: it
    misfired - double-clicking OH again and again, or a click then a
    double-click, kept starting one). (Two clicks on empty space drew one
    until 2026-10-08, when the maintainer gave the double-click there to
    *Quick Add*, below; three did until 2026-10-10, when the maintainer
    moved the chain from empty space into Quick Add; three on an atom drew
    one until 2026-10-16.)
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
      on from there, the ring stays; led back past it, it goes. Led back
      over a bond of a ring it has closed, it goes along that bond again
      and the ring stays, so fused rings - naphthalene, phenanthrene - are
      traced in one stroke, ring after ring, over the bonds they share;
      led straight back round the whole of a ring it has just closed, the
      ring goes. Come round to a point it went through, the chain closes
      the ring there, not taken back to that point, wherever the hand
      winds round the ring's middle - though the way as a whole is not
      round, as when it went round another ring first, or on past the
      point and back. Onto an
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
wheel with Ctrl, is taken to end once no step has come for 80 ms.

**Touch and pinch.** On a touch screen one finger does what the left
button does: from empty space it moves the view. A second finger makes a
pinch of it where it comes down within 200 ms of the first, or before the
first has gone a bond's length on the screen, or while the first moves the
view - whatever the first came down on: what the first began is taken
back as if it had never been, no bond, no move, no selection, nothing to
redo (`notePress`, `takeBackPress`). The view then zooms as far as the two
spread or close, about the point between them, and moves as that point
moves, so what is under the fingers stays under them (`lib/input/pinch.ts`);
let go while still zooming, it glides as a trackpad's pinch does. A second
finger later than that, the first drawing or moving, is no press at all. A
pen writes as before.

On Windows a pinch - two fingers on a precision touchpad, as on a
Surface's, or on its touch screen - is the user's only where WebView2's
`IsPinchZoomEnabled` lets it be, and Meno's webview is made with it off
together with its zoom by Ctrl and the wheel or the keys (Tauri's
`zoomHotkeysEnabled`). A setting takes effect from the next navigation, so
on Windows Meno makes its main window itself (`"create": false` in
tauri.conf.json) at about:blank, hidden, turns the pinch on, and only then
loads the page - once (`src-tauri/src/pinch.rs`). Ctrl with the wheel or
the keys still zooms nothing of the WebView's own. The page takes every pinch for itself: a
touchpad's comes as the wheel with Ctrl held, which the canvas follows as
on a Mac and whose default the page prevents everywhere (`main.tsx`), so
that it zooms the page nowhere; a touch screen's finds no pinch allowed
but the canvas's (`touch-action: none` on the canvas, `pan-x pan-y` on the
page, `App.css`), and a list still scrolls under a finger.
A drawing is laid out again as the view zooms only once the zoom has
moved a hundredth from the one it was laid out at: the last of a wheel's
zoom, in steps too small to see for most of a second, lays nothing out
again (`utils/largeZoom.ts`). A very large drawing - more than 20 000
atoms - is laid out once the view has stayed within a hundredth of one
zoom for 150 ms, not at every step (the maintainer, 2026-10-13, chosen
from a trial of two ways, #295): meanwhile its lines and their round caps
are kept as wide on the screen as a layout at the zoom would have them,
on the graphics card, and its wedges, the mitres where lines meet and its
labels scale with the view.
A step within a thousandth of a pixel of whole counts as whole: with
Windows' display scaling at 175 %, ten notches at once came as
999.99993 px, and read as fingers they moved the view a thousand
pixels, off the drawing.
(PR #55. In the workspace the page never tilts: each molecule in 3D turns by
itself, under a left drag on it - [WORKSPACE.md](WORKSPACE.md).)

A drag that moves the view and is let go while still moving glides on,
as fast as it was going over its last moments and slowing to a stop; one
held still before it is let go stays where it was put. (It used to glide on
by its last move whatever came after - a drag held still went on drifting
when it was let go.)

**A click keeps each view's own meaning**: in 2D a click on an atom selects
it and a click on a bond changes its kind, as drawing wants - and
the bond's right-click menu chooses its kind outright (the maintainer,
2026-10-14: both), for every bond selected at once, as one step; in 3D a
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
| An atom | charge one up, one down, clean up its structure, its structure in 3D, an electron-pushing arrow from it, a fishhook from it, colour; Delete | unpaired electron (or none), expand an abbreviation, as typed (where it was read as something else), select its structure, lay out as a grid or stack again (a record of a stack) |
| A bond | its kind - single, double, triple, wedge, hashed wedge - and "more" (a second row, eased in: wavy, bold, bold dashed, dashed, dative; shown at once where the bond is one of those); Delete | clean up, 3D, an electron-pushing arrow from it, a fishhook from it, colour, select its structure, lay out as a grid or stack again (a record of a stack) |
| An electron-pushing arrow | full head, fishhook (the one it has marked), colour; Delete | from the charge or from a lone pair (from an atom with a negative charge), lone pair (where it leaves an atom that has one), bend as Meno does (where it was bent by hand) |
| The selection | cut, copy, paste (opened on empty space), the other look and reset its turn (opened on a molecule in 3D), clean up, 3D, colour; Delete | that molecule's own (opened on a molecule in 3D), copy as SMILES, export, render (its molecules in 3D), turn over either way, lay out as a grid or stack again (opened on a record of a stack), a slide around it, a box around it, use as input, save as abbreviation |
| Inside a ring, nothing selected | colour | select its structure |
| Empty space | paste, select all | open, save as, new text (in a tab's own workspace), present (with slides), fit, the texts, find in PDFs, drawing style, run all (with steps), stop all (while one runs) |
| A molecule in 3D | cut, copy, the other look, reset its turn; Delete | measure what is chosen, set its distance, angle or torsion angle, all its conformers (or frames), lay out as a grid or stack again (one of a stack), its lists, its output, turn like its drawing, make it again, draw its formula; bond orders from the CCD (a PDB entry), from SMILES, estimated from distances (where they are unknown), add hydrogens; render |
| Words on the page | edit, size, bold, italic, bullets, colour; Delete | align left, centre, right, justify; superscript, subscript; as wide as its words, show in the PDF |
| A PDF | read, previous page, next page (its pages stacked), an icon or full size; Delete | copy (words chosen on it), put on the page, copy picture, read as structure (a box drawn on it), spread or gather pages, put pages in rows (spread, some in places of their own), write on it |
| A text's sheet | read, an icon or full size; Delete | |
| A picture | copy picture (not a film); Delete | show in the PDF (one cut out of a PDF), read as structure (not a film), play or pause (a film), save picture or save film |
| A shape | colour; Delete | corners (a rectangle), line as bonds, 1 pt or 2 pt line, dashed line, bring to front, send to back |
| Writing by hand | colour; Delete | |
| A slide's edge or number | present from here, earlier, later, show the page around it; Delete | 16:9 or 4:3, select what is on it |
| A step | run and run from here (or stop, while it runs), options; Delete | show log, show files, save as procedure |
| An arrow | colour; Delete | reaction arrow, equilibrium, retrosynthetic or no reaction (the one it is ticked); a head at the end or heads at both ends (an equilibrium: half or full heads; a retrosynthetic: neither); dashed line; straighten (where it turns); thin, regular or thick line; atom map (a reaction drawn on either side of it: made; then show or hide it, other map, export reaction in 3D - or said incomplete); arrow style |
| A catalytic cycle | colour; Delete | an arrow coming in or going out where it was right-clicked, remove the arrow there (on one), turn clockwise or anticlockwise, how far its arrows stop short of what is on it (close, a little apart, apart, well apart; the one it is ticked), reset this arrow's gap (on one set by hand), reset all arrow gaps (where any is) |
| A measurement | Delete | set its distance, angle or torsion angle |
| A set, a "+", a wire | Delete | save as procedure (a set) |

The icon that turns a molecule in 3D to its other look - the second 3D
style, one step from the right-click menu as from a double-click
(decisions of 2026-10-10) - is named after the style it goes to and
drawn as balls or as spheres (docs/WORKSPACE.md, *Styles in 3D*).
*Render…* is there only where a plugin that renders is added
(docs/RENDER.md). An icon that does not apply now - the previous page,
on the first; a slide's *Earlier in the talk*, on the first - is shown,
but cannot be pressed, so that the icons keep their places. A PDF's page
arrows are there only while its pages lie stacked, one on top: spread,
or made an icon, it has none, and the icons after them close up. An
item listed that does not apply is left out: a molecule's bond orders
where they are known, say. With no atom or bond in the selection -
molecules in 3D, words or shapes alone - what only a drawing has is left
out of its menu: clean up, 3D, colour, copy as SMILES, turning over and
save as abbreviation. What Quick Add puts down - an arrow, a "+",
words - is no longer on the menus on empty space; and what concerns the
whole workspace is done by selecting all of it first.

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

**Guides** (docs/PRESENTING.md, *Guides*). Whatever is moved whole - the
selection, a structure, words, a picture, a PDF, a slide, a molecule in 3D
- lines up as it goes with what is near: its edges and middle with theirs,
and a space in a row or a column with another there, within 6 pixels, a
thin line in Meno's attention colour (#cd4560) showing each. A slide, a picture or a shape made
larger takes another's width or height, and words made wider another's width.
Ctrl (⌘) held holds them off; Shift keeps a move across or up and down. An
atom dragged alone snaps as before, to the drawing's lengths and angles.

**A long press** is a press held still for as long as Settings says
(*General*, *A long press*: shorter 0.22 s, normal 0.26 s, longer 0.4 s;
`LONG_PRESSES`, `longPressMs`; 0.32 s until 2026-10-28, when the maintainer
asked for about a quarter of a second and a choice), on the first press
only: the second of a double-click held still waits to be
dragged - on a bond as on an atom or empty space (until 2026-10-13 a
bond's second press began one: `pressOnBond`). It is counted while the button is held.
As it is held, the selection's shade spreads out from the atom along the
bonds, reaching the whole structure as it is selected; on empty space a
ring opens where the box will begin (`HoldProgress2D`). Let go early, it
goes again. Let go where it was held, the long press has selected and
that is all: the click its release makes selects nothing more, being
held off as it comes (`suppressDoubleClick`).
Another button pressed with it, on an atom or a bond, makes it no press
at all - nothing selected, on release or held, no drag - as the
menu opens none for such a chord (`onChord`, utils/press; the command
centre, 2026-10-14: before, the long press went on and selected the
structure the right-click had been meant for). On a
trackpad that taps to click, a long press is a press of
the pad held.

A double-click and a drag that starts on an atom draws one bond out of it.

**Quick Add** (the maintainer, 2026-10-08). A double-click on empty space
opens, up and to the right of it, what can be put down there, each an
icon - named as the pointer rests on it - and none in words: a bond
(across at 30 degrees, as a chain from empty space begins), a chain, a
SMILES, text, an arrow (*Arrows* below), a "+", an electron-pushing
arrow (from the first atom or bond pressed, *Electron-pushing arrows*
below), a slide of what is seen (docs/PRESENTING.md), *Pen* - its card
opened, to write by hand with the mouse or the trackpad
(docs/PRESENTING.md, *Handwriting*; a pen writes anywhere, always) - and
*Shapes*, which opens a row below it of a rectangle, an ellipse and a
line - each drawn from where the double-click
was by a drag from its icon, or traced with the button up until a click
(docs/PRESENTING.md, *Shapes*). A choice puts it down where the
double-click was; Escape, a press elsewhere or a turn of the wheel closes
it. Going, it does nothing more as it fades - nor does the right-click
menu: an icon double-clicked put its choice down once, not a second time
on the first (theme/leaving.ts) - and a press elsewhere as it fades is
the next thing done, not one to close it. It opens as the second click's button comes up: a third click asks
for nothing more (the chain is Quick Add's own since 2026-10-10 - before,
Quick Add waited 0.28 s for a third click that would draw one, and the
maintainer found it slow). *Chain* begins one where the double-click was,
led by a drag from the icon or traced with the button up - the icon
double-clicked too: the second press, as the trace begins and where it
began, is not the click that ends it (`traceEndedBy`, utils/press;
before, it ended the chain at its first bond). *SMILES* opens a
field below the row: Enter draws what is typed there, laid out by Meno's
engine, centred where the double-click was and selected, as a paste is -
the first time, once the plugin that reads SMILES is set up; what went
wrong is said under the field, in a few words about the SMILES itself - a
formula written for it (each element once, a count after one; a SMILES
for a halide of one atom then given - "a SMILES for it is
Cl[Sn](Cl)(Cl)Cl" for SnCl4, a salt of groups 1 and 2 as ions,
"[Mg+2].[Cl-].[Cl-]", where as many halogens as its charge), a
ring left open (and which: "1 is opened and not closed"), a ( or [ not
closed, a symbol that is no element, an element written without its
brackets ("Na is written in brackets: [Na]"; Co, Cs, Pb too, read as
an atom and an aromatic one), an H written as an atom ("H is left out of
a SMILES"), an atom with more bonds than it can take (which, with its
charge: "its 2nd atom, O-, has 3 bonds"), an aromatic atom in no ring, an
aromatic ring that cannot alternate. A molecule the dictionary has - a
reagent, a formula read by rule, a ligand bound only by pairs it lends:
DMF, Et3N, PdCl2, THF, typed as written or in small letters (dmf,
et3n), as a label is given its case on the canvas; a formula in capitals
(ET3N) is not, its elements' case being what it says - is drawn from the
dictionary, as the canvas draws its label out, with no plugin asked; its
name - or, for a formula, its label - and formula are said under the
field as it is typed (a label that is the formula itself, PdCl2, once). Where the text is that and a SMILES too - NBS,
BrCN - both are offered there, the SMILES first (the field is for
SMILES), and Enter draws the one chosen, by a
click or the up and down arrows; never one of them without the other
shown. A SMILES alone is drawn as before, nothing said under it. Text is
read as a structure by one reader wherever it is typed (`chem/resolve`):
here as a whole molecule, in Enumerate's lists and Substituents' groups
as a group (docs/WORKFLOWS-FOUNDATION.md, *Enumerate*); a label typed on
an atom by the same label reader, kept a label. Drawn once however fast Enter is pressed
again, and not at all should Quick Add be closed while it is read -
Escape, a press elsewhere, another opened (`putDownSmiles`). A double-click on an atom still draws one
bond; on an arrow, a "+" or text, none of this (`Selection2D`, `QuickAdd`,
`chainFrom`). With the column open beside the canvas (PDF.md, *One
canvas*), a double-click on empty space shuts it instead - the work comes
back to the canvas (the maintainer, 2026-10-10) - and the next opens
Quick Add.
*SMILES*, *Shapes* and *Calculations* open and shut their panels a click
at a time - a double-click's second click not counted (`togglesOn`,
utils/press; double-clicked, a panel opened and shut again at once).
After a thin rule, one more button - *Calculations* - opens below the
row to the kinds of step a workflow can have (WORKFLOWS.md, *A step: from
Quick Add*); a wire let go on empty space opens Quick Add at those alone.
On a trackpad a
double-tap and drag does the same as a double-click and drag.
A box or a lasso drawn with Ctrl (⌘) held adds what it takes to the
selection; drawn without, it replaces it.

**What is done to a selection** (2D, PR #66). It is shaded in the hover
highlight's colour, under the drawing, and a small handle stands above it
where there is something to turn about its middle: two atoms or more, a
molecule in 3D or a picture.

- Dragging any of its atoms moves the whole of it, off the grid, as one undo
  step - an atom selected alone with a picture, a shape, words or a
  molecule in 3D too (until 2026-10-13 it went off alone:
  `dragsSelection`); an atom that is not selected, or is selected alone,
  moves on its own as before.
- Dragging the handle turns it about its middle, in steps of 15 degrees, or
  freely after a pause - one undo step. While it turns, or a selection is
  dragged, each frame only draws: a structure only carried keeps its
  layout, turned and moved with it, its labels upright beside their atoms,
  and electron-pushing arrows on it are carried likewise; each is laid out
  again once, as it is let go (found on a Surface, 2026-10-24: a turn was
  choppy). Let go, nothing jumps: a label set otherwise now - OH become HO
  - goes over as the one carried fades out by its atom and the one set now
  fades in, together (`DURATION.quick`); an arrow eases from the curve
  carried to the one laid now (`DURATION.move`), or, not drawn with as
  many dots, the one fades out as the other comes in. A frame that would put the selection where it already is - a
  step of 15 degrees held, a drag held on a guide - puts nothing.
- The keys that act on what is under the pointer act on the selection
  instead, once there is one: Delete or Backspace deletes it,
  Ctrl/⌘+Shift+K cleans up every structure it is in, and + or - steps the
  charge of each of its atoms, as one step (until 2026-10-13 they changed
  the atom under the pointer: `stepCharges`).
- A right-click on something selected, or on empty space, opens the
  selection's menu (above): among its items *Delete selection*, *Turn
  over left to right*, *Turn over top to bottom*, *Clean up these
  structures* and *Export…*, which writes what is selected. Turning over is seeing
  the molecule from its other side, not its mirror image: the drawing is
  mirrored and every wedge on it becomes hashes and every hash a wedge, so
  each stereocentre keeps its configuration.
- Turned over, a selection is mirrored about the middle of all it moves,
  which so stays where it was. Pictures, texts, PDFs, slides, shapes
  and molecules in 3D selected with it go to their mirrored places, each
  drawn as it was: a picture's image, a PDF's pages and a molecule in 3D
  are not mirrored, though a tilted picture tilts the other way.
- Turned by the handle or turned over, a selection takes along the
  reaction arrows, "+" signs and words among it, as a drag does. An
  arrow is carried round and points as far round, or is mirrored and
  points the mirrored way. Words move to their new places, their letters
  upright, and words over an arrow stay with it.
- **Arrows and "+" signs are selected for themselves too** (2026-10-12):
  one standing alone - an arrow pointing at something on a slide - as a
  shape is. A click selects one alone, Ctrl/⌘ and a click adds it or takes
  it out, and a box or a lasso takes an arrow wholly in it (each end and
  each corner) and a "+" by its middle - and words on the page over no
  arrow by where they stand (2026-10-13: a box never took them, though
  Select All and a slide's did); Select All and a slide's *Select
  what is on it* take them as well. Selected, one is lit round, and goes
  with the selection when it is moved, turned, copied, cut, deleted,
  coloured (an arrow) or pasted, the words over an arrow with it. An
  arrow or a "+" among the selection's atoms is carried as before, and
  once only, selected for itself or not (`utils/selectionScheme.ts`). A
  press on one carried by a selection with more takes all of it; else a
  drag moves it alone, as before.
- What the pointer rests on is let go when an undo or a redo takes it away
  or moves it from under the pointer (2026-10-13: an atom dragged, undone
  back across the page, stayed lit, and Delete or a letter acted on it
  there); it lights again as the pointer next moves.
- Undo and redo (Ctrl/⌘ Z; Ctrl/⌘ Shift Z or Ctrl Y to redo) go a
  thousand steps back per document, held to about 100 MB: a step costs
  the atoms and bonds it copies, so a drawing of a few thousand atoms
  keeps its thousand steps and a stack of 28,000 about 430. A step past
  either drops the oldest; the steps to redo are never dropped, nor the
  last one to undo (the maintainer, 2026-10-13: it was a hundred steps).
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
  in selected so it can be dragged straight on, and is one undo step.
  Pasted again where the last one was asked for - the pointer not moved,
  the view as it was - it lands a step down and to the right of the last,
  so that a copy pasted twice is seen (the maintainer, 2026-10-12:
  `pastePlace`). What
  is dropped onto the drawing - a structure's file, or a structure dragged
  out of Word or PowerPoint - comes in the same way where it is dropped, as
  does a SMILES added beside what is drawn.
- The clipboard holds Meno's own record of the structure, which loses
  nothing, and a MOL file for other chemistry programs (MDLCT on Windows,
  which they exchange there), and for a reaction - an arrow with its
  molecules - an RXN file too; and no plain text: PowerPoint pastes plain
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
- A paste reads, in order: files copied in the Finder or Explorer (above);
  Meno's own record, or an Office object that holds it; a picture that
  carries one (an Office object as a Mac hands it back, Office's clip
  format as Word and PowerPoint hand it back, a PNG); an RXN file; a MOL
  file; then plain text that is a MOL file or a SMILES (drawn by the
  engine, as a SMILES typed in Quick Add is). A picture with none of these
  - a screenshot - goes on the page as a picture.
- On empty space with nothing selected, a right-click opens *Paste* and
  *Select all*, with the canvas's own items under them (the table of
  menus above); the selection's menu has *Cut*, *Copy* and *Copy as
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
  wider gaps (PR #33). A short one - a hashed wedge to a label - gets three,
  closer together but a line width clear, set at even steps from the narrow
  atom (or its label) to the wide end, where three fit, in a style that
  asks for it ("Shortest hashed bond: Three hashes at least"): two read as
  a pair of lines (the maintainer, 2026-10-24). Meno's own style asks for
  it; a journal's keeps its spacing exactly, as its specification has it
  (2026-10-27), and a style saved before the setting is drawn at the
  spacing.
- **A hashed wedge's widest hash** stops a hash's clear gap short of a bare
  atom at its wide end in Meno's own style, the bonds on from the atom
  starting there on their own (the maintainer, 2026-10-29). In the journals'
  styles it reaches the atom: none of their specifications says otherwise.
  The setting is "Hashed wedge: widest hash" (At the atom, Short of the
  atom). At a label the hashes stop at the label in every style. A style
  saved before the setting reaches the atom, as it was drawn then; a
  picture draws it as the canvas does.
- **A bold bond's free end** is square, its corners rounded as a line's end
  is when ends are round - not a half circle (the maintainer, 2026-10-24).
- **More bond types.** Besides single, double, triple, wedge, hashed wedge and
  wavy: a plain bold bond, a bold dashed bond, a thin dashed bond, and a
  dative (coordinate) bond. A wedge, hashes or a wavy line belong to a
  single bond alone: a bond made double or triple loses its, and one is
  not given to a double or triple bond (2026-10-13; a double bond's
  either-configuration is its own).
- **Rounding is all or nothing.** When ends and joins are round, every end is
  round - double and triple bonds included, which today are not. When they
  are square, every one is square.
- **Units.** Every length can be given in points or as a fraction of the bond
  length, whichever the user prefers.
- **Scope.** An application default; a document's own style over it; and
  per-bond and per-atom overrides over that (a coloured atom, a bold bond).
- **Where it is set.** Settings holds the application's style, and
  *Styles…* (a right-click on empty space) gives a
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
  A typeface's name is letters of any script, digits, spaces and
  `- _ . ' & +` (`isTypefaceName`, `lib/chem/styleFields.ts`): a style
  from a file or the settings naming one with anything else - a quote, an
  angle bracket - keeps its preset's typeface, and the computer's own are
  offered only where their names are such.

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
- Selection: Ctrl/⌘ and a click on an atom or a bond adds it or takes it
  out, Shift and a click everything along the bonds to it, a long press a
  whole structure, a box or a lasso what it holds, a click alone the atom
  alone; move, rotate and flip what is selected.
  (PR #66, as above.)
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
- **Labels typed in place** (the maintainer, 2026-10-10: no HTML box;
  2026-10-18, as it is now). A label is written where it stands, drawn by
  Meno as words on the page are (*Text*, below; `LabelTyping2D`): set as a
  label is set, in the drawing's typeface at its size, its first letter on
  the atom - a two-letter symbol's middle (utils/writtenLetters) - with the
  caret, what is selected and what an input method composes drawn over it,
  and nothing under it: no light. The drawing draws no label for the atom
  meanwhile - the label it had, its charge too, fading out in
  DURATION.quick - and its bonds stop short of what is written as they
  would of a label (lib/chem/layout2d `Writing`). Typed through the field
  words on the page are typed through (`pageField`), laid at the caret so
  that an input method's candidates show there - an input method's
  full-width letters are taken as the ordinary ones once it gives them;
  Cut, Copy, Paste and Select All work on its letters as on words.
  - A space typed is seen (2026-10-19: spaces typed were not, and piled
    up unseen): one between letters is set as typed, a run of them as
    wide as it is - a label may be a reagent's name, Grubbs II - and
    those at either end hang off its letters, the caret a space on for
    each, so that the letters stay where they are. Kept, it is kept
    without those at its ends: nothing drawn moves.
  - Begun by a letter typed over an atom - O, then the pointer moved on,
    is O - or from the atom's menu, *Edit label* (on the selection's menu
    too, where the atom is selected alone: 2026-10-21), holding what it says,
    the caret at its end; a carbon drawn as a corner opens with a C,
    selected, to be typed over. A click on an atom no longer begins one.
  - Nothing jumps (the maintainer, 2026-10-18). Begun by a letter, the
    letter grows out of the atom, from 0.4 of its size, as it comes into
    view, while the atom's bonds draw back to make room for it - both in
    120 ms (`WRITE_MS`, DURATION.quick), eased in and out as what moves the
    drawing in place is (theme/motion `easeInOut`), and counted by the
    frames drawn (`frameClock`): the canvas is busy for a moment as a label
    begins, and a clock of its own would have had the motion mostly done
    by the first frame. A double bond to the atom has its second line go
    over to where the label leaves it in the same time - drawn both ways,
    as the atom was and as labelled, and taken the share of the way the
    writing has come (lib/chem/layout2d `writingShare`) - and back, let
    go. Each letter after, the
    bonds go on to make room in as long, from where they had come. Let
    go, the letters draw back into the atom as the bonds come back and the
    label it had fades back in (`labelEnd`, Labels2D `arriving`). Kept, it
    is drawn as written until the drawing's own label is drawn in its
    place, then goes in a moment, the label coming through: never a frame
    with no label, nor with the old one - and the bonds go over from what
    was written to the label as drawn, a label drawn the other way round
    (MeO) among them.
  - Enter keeps it, and so does the pointer leaving the atom and its
    letters (utils/labelLeave): out past the atom's own disc - as it is
    picked - and the letters' box by more than 0.15 of a bond for 150 ms
    together, or by more than half a bond at once, or off the canvas. A
    hand's tremor keeps nothing; a drag among its letters, selecting, is
    not leaving them. Only the pointer moving away leaves them: where it is
    on the screen is set against the label as it is drawn now, each frame,
    so a pan or a zoom carrying the label off from under a still pointer
    keeps nothing, one bringing it to the pointer finds it there, and a
    move away after a zoom is seen as one. Opened from the menu,
    it waits for the pointer to come to the atom first. A press elsewhere
    keeps it, Escape lets it go; a click in it puts the caret, a drag
    selects.
  - Enter again, straight after the Enter that kept it - no other key,
    press or selection between - draws the label out, as *Expand
    abbreviation* does, one step after the label's own; a label with
    nothing to draw out stays as it is. A label kept by Enter as it was -
    typed over an atom that already said it, as a structure read from a
    figure has its groups - is drawn out by the next Enter too (the
    maintainer's report, 2026-10-18: SO2H typed over a read SO2H, then
    Enter, drew nothing out). An Enter over a label not just typed draws
    nothing out. An Enter is one however it comes - as an
    input method on Windows gives every key, "Process" with the key
    pressed in its code, nothing being composed (pageField `enterKey`) -
    and one that confirms what an input method composes is not.
  - The drawing's labels are drawn each by its atom (`Labels2D` `keyOf`):
    a label added or taken away sets no other label's letters again. A
    label taken away - undone, redone away, deleted with its atom, its
    atom drawn plain again - fades out in DURATION.quick, gently at first,
    kept by its atom's key as it goes (`usePresence`, `fadingOut`); before,
    it went in one frame. One back before it has gone - redone, or a label
    let go - fades in again in as long, from as far as it had faded.
- **Labels read as they are meant** (the maintainer, 2026-10-10: nh2 is
  NH2, obz OBz, hnfmoc NHFmoc; `lib/chem/smartLabel.ts`). No list of what
  is typed: of the labels Meno reads (docs/CTFILE.md, *Atoms that are not
  elements*), the one the letters typed spell, by these rules.
  1. A letter typed small may be a capital, one typed as a capital stays
     one. Part of a structure - an element, a group - comes before a whole
     molecule - a reagent, a complex - as a label on a structure stands
     for part of one (co2me is CO2Me, not a complex of cobalt; hf is Hf,
     HF typed so); then the fewest letters made capitals (co is Co, ph Ph,
     ipr iPr - not the NHC IPr). But two capitals that are an element's
     symbol are that element (the maintainer, 2026-10-18): SI is Si, not S
     and I; CL Cl, FE Fe, a charge after them kept (FE+ is Fe+). Not where
     the two letters as typed are a name Meno reads whole (CO, carbon
     monoxide, as a ligand), a whole molecule (HF), or are turned round as
     drawn on a bond's left to a heteroatom first (HO is OH, HS SH, SN NS:
     rule 3 - SB and EU are Sb and Eu, not turned round), nor an element
     after uranium (rule 2: CN, NO and NH as they are). PO is P and O; Po,
     so typed, is polonium.
  2. No element after uranium is read from letters typed small: nh is NH,
     cn CN, no NO; ts is tosyl, fm Fm. Nor is deuterium: D is deuterium
     only as typed (CDCl3, CD3), so pdcl2 is PdCl2.
  3. Typed as it is drawn on a bond's left - AcO, aco, meo, bochn, ho2c,
     h2n, or HN before a group, hnfmoc - it is kept as it reads from the
     bond: OAc, OMe, NHBoc, CO2H, NH2, NHFmoc (and drawn the other way
     round again where its bond leaves to the left). So what is kept is
     the same however it was typed - small, as it is written or as it is
     drawn on the left (the maintainer, 2026-10-11): HO, ho and oh are all
     OH; AcO, aco and OAc all OAc; NC and nc CN. What reads as something
     as it is written is that, not turned round: hcl is HCl, as HCl typed
     is; and only what is written in words is turned round: MES stays MES.
     Of letters typed small, a heteroatom with its H or with a group, as
     it is drawn on the left, comes before any other reading of them (the
     maintainer, 2026-10-12): ho is HO, kept OH, not holmium; mes is MeS,
     kept SMe, not mesityl - Mes typed so is mesityl. A charge typed last
     stays last: ho- and HO- are OH-, h3n+ NH3+. HN typed before a group is
     NH and the group even where the letters as written read as a whole
     molecule too: HNiPr and hnipr are NHiPr, not a complex of nickel - a
     label on a structure stands for part of one.
  4. A prefix set in italics - n, s, t, sec, tert, o, m, p - gets its
     hyphen, at a label's start or after an atom, however it was typed:
     tbu is t-Bu, co2tbu CO2t-Bu, kotbu KOt-Bu, hntbu and HNt-Bu NHt-Bu,
     hnsecbu NHsec-Bu, mcpba m-CPBA, p(otol)3 P(o-Tol)3. Not inside an
     element's symbol or a name as it is written: SnBu3, Me4tBuXPhos and
     FmBoc stay. iPr stays upright. A reagent's name sets its prefix in
     italics as a group does: m-CPBA, p-TSA, n-hexane.
  5. What reads as nothing stays exactly as typed - no capital made.
  6. A reagent's or a ligand's name comes before a metal's formula (the
     maintainer, 2026-10-13), however many letters it makes capitals. No
     metal's symbol is read from letters typed small across the name of a
     group, a reagent or a ligand the same letters spell: tbscl is TBSCl,
     not terbium's; tmscl TMSCl and tmsotf TMSOTf, not thulium's; tipscl
     TIPSCl; lah LAH, not LaH; cdi CDI; tbme TBME. Nor holmium's from ho
     before a group, as rule 3 reads ho: hoac is HOAc, hotf HOTf, homs
     HOMs, hocl HOCl. Nor two elements' symbols of a letter each from a
     group's name of two letters typed small: phi is PhI, phio PhIO,
     phi(oac)2 PhI(OAc)2 - not P and H. Of reagents' names and formulas, a
     name Meno knows comes first: cpme is CPME, not CpMe. Where no name is
     spelt, a metal's formula is read as ever: h2zn is H2Zn, pdcl2
     PdCl2, cocl2 CoCl2, zni2 ZnI2, cp2zrhcl Cp2ZrHCl; and one typed as it
     is written is that - HoCl3, TbMe. A group's name of one letter, Z (Cbz), is read from z
     only as part of a structure - co2z is CO2Z, nhz NHZ - never into a
     metal's formula: nbz stays nbz.

  As it is typed, only its letters' case changes, as they are read so far
  - the same letters in the same places, the caret where it was; rules 3
  and 4 as it is kept. An input method's composition is left alone until
  it is given. Where what is kept is not what was typed, the atom's menu
  has it back, read as nothing else (*As typed: obz*, *As typed: HO*, one
  step); Settings › General, *Read labels as they are meant*, turned off
  keeps every label exactly as typed.
- **Symbols for a kind of group** (the maintainer, 2026-10-13): PG (a
  protecting group), LG (a leaving group), EWG and EDG (an electron-
  withdrawing and an electron-donating group), Nu (a nucleophile), E (an
  electrophile), Hal (a halogen) and Het (a heteroatom) are names, as TBS
  is, that hold no structure (`GENERIC_SYMBOLS`, `lib/chem/abbreviations`).
  So a label with one is never turned round letter by letter where its
  bond comes in from the right - OPG is drawn PGO there, NHPG PGHN, ONu
  NuO, not GPO - and they are read however typed: pg is PG, hal Hal (not
  AlH), opg OPG, and pgo, as drawn on a bond's left, is kept OPG. One is
  read only where its word ends - NHallyl is NH and allyl - and none can
  be a label of the user's own. A word read as no element, group or such
  symbol - Alk, say - is kept whole too: a capital and the small letters
  after it.
- Ring templates (3- to 8-membered, benzene), fused onto a bond or an atom;
  chains. (Chains and rings came back on 2026-10-03 as the honeycomb: three
  clicks on an atom, or Quick Add's *Chain* from empty space - two clicks
  there open Quick Add since 2026-10-08 - the honeycomb's ring where a
  loop comes round to the chain - see *Drawing is dragging bonds out of atoms*. Benzene
  and other ring templates are still to come.)
- Every bond type from the pointer: wavy, bold, dashed, and the rest of what
  the cycle cannot reach today.
- Abbreviations (Me, Ph, Boc, OTBS …) that read correctly and can be expanded.
- Clean-up of a structure or a selection. (PR #53: the whole drawing from
  its button, or the structure under the pointer with Ctrl/Cmd+Shift+K, as
  one undo step; the structures a selection is in, PR #66. Since the layout engine,
  4a, it is the engine's drawing - turned the way the structure is usually
  drawn, not the way it was - each structure where it was. It is drawn at
  the style's bond length, whatever length it was drawn at, so a structure
  put down too large or too small comes right; one shown magnified stays
  as magnified, at the style's length at its true size. The maintainer,
  2026-10-27. A structure Clean-up cannot lay out - its stereochemistry not
  kept, an atom put on another - is left as drawn and named by its formula
  and why, the others laid out all the same, as one undo step.)
- Valence warnings, and R/S shown on request (RDKit). (PR #53: a ring round
  an atom with too many bonds, saying what is wrong under the pointer; R/S
  and E/Z from a button on the canvas, later shown on what they are asked
  for on; valence warnings in Settings › Chemistry; neither in an exported
  picture.)
  - **A halogen bridging metals** (μ-X; the maintainer, 2026-10-18) -
    μ-Cl in [Pd(allyl)Cl]2, drawn with a plain bond to each metal - is
    not marked: its bonds to metals count as the dative bonds they are, so
    that it is checked by its bonds to the rest, none or the one it has as
    usual. One with two bonds to carbons is marked still, metal or not
    (chem/marks `bridgesMetals`).
  - **An atom a dative bond is drawn into** - BH3 in H3N→BH3, AlCl3
    taking an ether's O - is not marked for it: the pair is the donor's,
    so the bond takes none of the acceptor's valence, as Meno counts its
    hydrogens. It is checked by its bonds to the rest; a coordination bond
    drawn as a plain line counts alike, from the atom it was drawn from.
    One with too many bonds besides is marked still (chem/marks
    `takesArrows`).
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
    diagrams draw them (Brecher 2008, GR-11.1; the journals say nothing of
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
  - **Shown on what they are asked for on** (the maintainer, 2026-10-15;
    before, one switch showed them all). Hidden unless asked for. The
    right-click menu of an atom that can be a stereocentre says *Show
    R/S*, of a double bond *Show E/Z*, of a structure's selection or a
    molecule in 3D *Show R/S and E/Z* - *Hide* where all of it is shown
    already (named for what they show, the maintainer, 2026-10-13). On a
    molecule in 3D, the atom under the pointer where it has a label, else
    what is chosen in it, else all of it. Kept in the document - each
    atom's and bond's own, `stereoShown`, on a drawing; a molecule in 3D's
    `stereo.shown` - as one undo step, in the workspace's file and in a
    copy; a drawing and the molecule in 3D made from it each keep their
    own. A molecule in 3D made with the other stereoisomers its drawing
    leaves open shows its open centres until it is asked otherwise, to
    tell them apart (docs/WORKSPACE.md, *Told apart*). Settings no longer
    has a switch for them; one in an old settings file is not read.
  - **Come and go together** (the maintainer, 2026-10-19: they had come
    in bursts). Those shown at once - on a drawing and on a molecule in 3D
    alike - fade in together and fade out together, eased, in the same
    time either way (120 ms, as every mark). On a drawing, those asked for
    are shown from the R and S at hand where those were worked out for
    the structure as it is, and otherwise all wait for those worked out
    after (`shownMarks`); never a few at once and the rest a moment later.
    On a molecule in 3D, none starts before every one of them is there to
    be seen, the molecule still or turning (`fadeStep`).
  - **In pictures, as on the canvas** (the maintainer, 2026-10-21,
    reversing 2026-10-10's rule that kept them out). A picture of a
    drawing - copied, as an object in a document, exported - has the R, S,
    E and Z its canvas shows, where the canvas puts them
    (chem/marks `stereoPictureItems`, the same `stereoPlaces`), written as
    there, at the size the canvas draws them at - the labels' size times
    0.6 - but without the 9-pixel least, which is for the screen zoomed
    out and means nothing at a picture's size in print. A picture takes them
    as they stand: all shown, none fading. A picture of a part of a drawing -
    a selection copied or exported - has its atoms' and bonds' descriptors
    in the molecule as drawn, not worked out again for the part on its own:
    an atom that is R in the molecule is R in the picture, though the part
    alone might make it another or none. On a molecule in 3D, not yet.
  - **Gone at a far zoom** (the maintainer, 2026-10-21: they stayed as large
    and floated round a structure a few pixels across). Their letters keep
    to 9 px at the least; past that they go once 9 px would be a third
    larger than they are (`MARKS_LEAST_PX`) - switched there, not faded with
    the zoom (the maintainer, 2026-10-28: a fade with the zoom left them half
    there at a zoom), a little either way so that a zoom stopped at it does
    not switch them back and forth, and faded over Meno's quick time, 120 ms
    (`marksReadAt`, utils/zoomSwitch). On a drawing and on a molecule in 3D
    alike. Atom numbers on a molecule in 3D still fade below their own least
    size with the zoom, atom by atom, in the 3D view's shaders.
- **Charges, R and S put by hand** (the maintainer, 2026-10-10). A charge
  - with its radical's dots - an R or S, and an E or Z are each taken hold
  of on their own ink, and nowhere else (a press beside one is the atom's),
  lit and with Meno's moving pointer as the pointer is on them; dragged,
  each goes where the pointer takes it and stays there, as one undo step.
  Two clicks on one put it back where the drawing puts it. Where it was
  put is kept from its atom - an E or Z from its bond's middle - in ems of
  the labels, so it goes with the atom as the atom moves, is turned and
  turned over with the selection, is saved and copied with the drawing,
  and a charge so put is in an exported picture, as are R and S, E and Z
  (the maintainer, 2026-10-21, reversing 2026-10-10's "R and S never
  are": below). Clean-up puts
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
  - A zoom costs as much with arrows on the page as without (the
    maintainer, 2026-10-16: with them, a zoom stuttered): they are laid
    out again only as what they are laid by changes - the atoms, the
    labels, the bonds' lines - not as the drawing is laid out again the
    same at each frame of a zoom; and what takes the pointer round each,
    unseen until the pointer is on it, is not drawn until it is lit.
  - Laying one out weighs only what lies near the curves it could take -
    the bonds, labels and atoms within reach of them - never the whole
    drawing, and stops weighing a curve once it is worse than one found:
    the same curve, at a cost that grows with what is near it (2026-10-24:
    on a Surface, drawing one, moving a structure with them and zooming
    were choppy on a large drawing).
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
    however far a picture is enlarged (a Windows check found the line,
    once written as short straight pieces, showing corners at 17 times in
    PowerPoint); a MOL, SD or RXN file has no
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
    the one in use (the card offers only it). Meno's - its base colour #317689,
    its attention colour #cd4560, a pale one of each, #b2d9e4 and #ebb3be, for a
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
  wheel closes it, and so does an undo, or a delete, of anything it is
  for; a ring is filled only while it is drawn (until 2026-10-13 a ring
  undone away under an open card took a fill, an invisible step, and the
  next ring drawn with its atoms' ids came up filled). A selection's colour goes to its atoms and the bonds
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
  as abbreviation…*: docs/CTFILE.md, "Atoms that are not elements". The
  panel *Save as abbreviation* opens is about the group as it was: it
  closes when the group changes under it - an undo taking an atom of it
  away, a bond among them, a charge (until 2026-10-13, Save then showed
  the label on what was left: a "tBu" holding an isopropyl).
- Reaction arrows, "+" and text: create, move, edit, delete. (An arrow or
  a "+" is added from Quick Add, where it was opened: the arrow pointing right, two and two-thirds of a bond long.
  Either is moved by dragging it and deleted by Delete or Backspace under
  the pointer, or from its menu. The arrow under the pointer shows a handle
  at each end: dragged, that end goes where the pointer goes and the other
  stays, its direction in steps of 15 degrees, as a bond's, or freely after
  a pause - one undo step. An arrow sets its own line and head, as above.
  They come from an RXN file too, and are saved - as an RXN file - copied
  and in an exported picture: docs/CTFILE.md, "Reaction schemes".)
- **Arrows** (the maintainer, 2026-10-12: one arrow, a reaction's and any
  other - a presentation's shapes draw it too): the reaction arrow, with
  what else it can be (`lib/chem/reactionArrow` `ArrowForm`, `arrowPieces`).
  - **Kinds**, ticked in its menu: a reaction's; an equilibrium's - two
    lines, a half head on the outer side of each, pointing either way, or
    full heads; a retrosynthetic arrow - two lines and an open head across
    them; and a reaction that does not go, crossed out at its middle.
  - **Heads**, a reaction's and a crossed-out one's: at its point, or at
    both ends (a resonance arrow). A plain line with no head is a shape
    (docs/PRESENTING.md, *Shapes*).
  - **Dashed**, any kind; **thin, regular or thick** - six tenths and
    twice the regular, as a shape's lines are - its heads growing with a
    thick line; and **a colour**, from the colour card its menu opens, as
    an electron-pushing arrow's.
  - **Corners**, any kind (the maintainer, 2026-10-12: corners anywhere,
    not curves): the arrow under the pointer shows a handle at each corner
    and a smaller one in the middle of each stretch. One dragged moves its
    corner, or makes one there - at a right angle, an L, its corner on the
    circle whose diameter joins what is either side of it, until the
    pointer pauses, and then freely (2026-10-28); a corner let go in line
    with what is either side of it is taken away; *Straighten* in its menu takes them
    all away. A corner is kept as a share along the arrow and a distance
    across it, so that it goes with the arrow as it is moved, drawn out by
    an end or grown by its words. Words put by it go over its longest
    stretch. While an end or a corner is dragged, the arrow is drawn going
    over to each place it snaps to - an end's 15-degree steps, a corner's
    right angle - as a bond moved is, never jumping there
    (`utils/arrowGlide`). Words already by it go with the point of its line they are
    by, as a corner is made, moved or taken away, or an end is drawn
    out. They keep the same share of the way along the line, and the
    same distance from that point, measured along and across its
    tail-to-point line.
  - **Drawn from point to point**: pressed on Quick Add's arrow and dragged,
    from where Quick Add was opened to where the pointer is let go - Shift
    to steps of 15 degrees - as one step; a click puts one as before.
  - **Saved** with all of it in the .meno and in Meno's own copies; an RXN
    file holds no arrow's kind, and writes a plain reaction whatever it is
    - only for an arrow with a structure drawn near its tail or its point:
    an arrow alone shows no reaction. Pictures - SVG, EMF, those copied -
    fill each line or dash, head and cross as a shape of its own, in the
    arrow's colour.
- **Catalytic cycles** (the maintainer, 2026-10-15): a circle on the
  page, and what is placed on it, round which a cycle's reaction arrows
  run (`lib/chem/cycle`, `Cycles2D`, `utils/cycles`).
  - **Put down from Quick Add**, its *Catalytic cycle*, where Quick Add
    was opened: four and a half bonds from its middle to its line.
  - **On it** is a structure or words whose middle - of the box round
    what is drawn, its labels' letters included, the H of HO and all -
    lies within six tenths of a bond of its line. One
    let go within a bond of the line, dragged or put down from Quick Add's
    SMILES, is put on it, moved straight out from the middle or in. What
    is on a cycle is not kept with it: it is what lies on its line, so
    that it is moved along the circle, or off it, as anything is moved.
  - **Its arrows**: the circle breaks round each thing on it, each side on
    its own where it first comes within half a bond of what is
    drawn - a bond as wide as it is drawn, a label's letters, words - or,
    where it comes no nearer, where it comes nearest; so each stretch
    ends just short of what it points at, however much of the box round
    a structure is empty where the circle passes. Each stretch between two
    neighbours is a curved reaction arrow, clockwise unless turned from
    its menu. With nothing on it, it is a whole circle with no head. The
    stretches follow as a thing is dragged along the line; the circle
    opens round what comes on to it and closes after what goes off it,
    eased. The arrows take the drawing style's reaction arrows' look, and
    the cycle's colour, from its menu.
  - **Arrows coming in and going out**, from the menu a right-click on
    its line opens, where it was right-clicked: one coming in curves in
    from outside and joins the circle along the way it goes; one going out
    leaves it so and curves out, its head at its far end. Each is given
    words at its far end, typed at once, which go with the cycle; *Remove
    this arrow* takes the one there away. One put there grows - in from
    its far end, or out from the circle - and one taken away goes the
    same way back.
  - **Turned round** from its menu, each stretch's head travels along it
    to its other end, smallest half way, where it turns; the arrows coming
    in and going out swing across to the other side of where they join,
    their words carried with them - one step.
  - **Selected** by a click on its line, or taken hold of by holding
    still on it a moment; selected, a drag moves it with what is on it and
    the words at its arrows' ends, and its handle at the lower right sizes
    it, what is on it moved out or in with the line - each one undo step.
  - **How far its arrows stop short** (the maintainer, 2026-10-16): half
    a bond, or what its menu sets for the cycle - a quarter, half, three
    quarters or a whole bond. Selected, each end of its arrows shows a
    handle: dragged back, that end stops further short; forward, nearer -
    kept for that end of that structure or those words however they are
    moved, and with them when copied. Its menu gives ends back the
    cycle's own: *Reset this arrow's gap*, right-clicked on an arrow (or
    on the break by an end) set by hand, and *Reset all arrow gaps* - a
    double-click on a handle does nothing of the kind, so that a careful
    setting is not lost by chance (the maintainer, 2026-10-16). Each change
    is one step, eased.
    It is selected with all, copied or cut alone or with the rest, and
    carried round or turned over with what is selected: turned over, it
    goes the other way and its arrows in and out join it mirrored.
  - **Saved** in the .meno and in Meno's own copies, pasted and restyled
    as the rest of the drawing; in pictures - SVG, EMF, those copied - its
    arrows are reaction arrows, the curves as corners close along them.
    Nothing arranges what is on it: where it goes is where it is put.
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
       space, an opening bracket or a comma - is a minus sign (U+2212) as
       soon as a digit is typed after it: -78 is −78, (-20 °C) (−20 °C),
       LDA,-78 LDA,−78 (and its comma then spaced, 5). Hyphens within
       words stay: 2-propanol, N-methyl, t-BuOK, 18-crown-6, 3-pentanone;
       so does a range's, between two numbers (3).
    3. **Ranges.** A number, one hyphen and a number, a word of its own,
       have an en dash (U+2013) once the word has ended - a space or a
       bracket after it, or the words kept; a stop or a comma only once
       what follows shows it was no decimal point (1-2.5 may yet come), by
       design: 1-2 h is
       1–2 h, 0-25dc 0–25 °C, compounds 3-5 3–5. Not before, as 7647-0 may
       yet be a CAS number. Numbers joined by more hyphens are no range -
       a CAS number (7647-01-0), a date (2026-10-10) - and stay; so does a
       hyphen with a letter beside it (4-Å MS, Pd-118, 1,2-dichloroethane).
    4. **Bullets.** A hyphen or a star alone at a line's start - after
       the tabs that take it a level in - is a bullet (•) as soon as a
       space is typed after it: "- " is "• ", a list's item (below).
    5. **Commas.** A comma typed straight before a word gets one space
       after it once that word has ended (the maintainer, 2026-10-17):
       Pd(OAc)2,PPh3 is Pd(OAc)2, PPh3, rt,12 h rt, 12 h, and a
       temperature after it is written as ever (DMF,80dc is DMF, 80 °C) -
       a negative one too (LDA,-78dc is LDA, −78 °C).
       Not where the comma is part of a name, joining two locants - digits
       maybe with a letter, or a capital letter alone, either maybe
       primed: 1,2-DCE, 2,6-lutidine, 2,2,6,6-tetramethyl-, 1',2', 4a,8a,
       N,N-DMF, N,O-bis(...), (R,R)-, (E,Z), (1R,2S)- - nor between two
       numbers, 1,000, which stays as typed. A space already there is
       never doubled.

    Each is a step of its own: one undo gives back the words as typed, and
    that part is then left as typed until it is written again. Settings ›
    General, *Write words on the page as they are meant*, turned off keeps
    every word exactly as typed. Atoms' labels have rules of their own
    (above), and the column's texts are never changed.
  - Drawn whole: a text's letters are drawn a frame or two after they
    are given, and the old ones showed meanwhile - a letter deleted
    stayed on the page for a moment, the caret already before it (the
    maintainer, 2026-10-10). Each change is now set out of sight and shown
    once every letter of it is drawn, the caret and what is selected with
    it; the words being written take the place of their own only once they
    are drawn, and give it back, kept or let go, only once those are
    (`Labels2D` `WholeTexts2D`). Changes coming faster than they are set -
    a long text made wider by its edge, broken into lines again at each
    move - the one being set is shown as soon as it is, then the latest:
    the words keep up with the box, a few frames behind, where each change
    given up for the next one left them standing still until the pointer
    did (`textSets`). And none is shown before it is drawn whole: a batch
    of letters was packed only as it was first shown, after that
    frame, and words shown in place of others were a blank for two or
    three frames (`textBatch`, the maintainer's rule against jumps).
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
    it - kept through the drag, over the words too - the other edge staying where it is, their words are broken at
    their spaces into lines no wider than they are made - as many words on
    each as fit, each line still centred, a number or a range never parted
    from the unit after it (60 °C, 12 h, 2 equiv, 0–25 °C) but where the two
    are wider than the words are made; a word wider than that broken at
    their edge - after a hyphen, a comma or a closing bracket, or before an
    opening one, where one fits, as a chemical name is broken (the
    maintainer, 2026-10-13); a drag is one undo step. Written anew, they are
    written at that width. *As wide as its words*, in their menu, is a line
    for each line typed again. The width is saved, copied and drawn with them.
  - Their spaces are set as typed (2026-10-19): a run of them between
    words as wide as it is, not run into one; those at a line's ends -
    before its first letter, after its last, and where a line is broken -
    hang off its words, the caret a space on for each, so that the words
    stay where they are, centred on their letters. Kept, they are kept
    without those, nor blank lines before or after (`keptWords`): what is
    kept is what was drawn, and nothing moves.
  - Their lines lie as their menu says (the maintainer, 2026-10-09): *Align
    left*, *Align centre* (as they come), *Align right*, or *Justify* -
    spread to both edges, but for the last line of each line typed, which
    lies to the left - the one chosen marked. In the width they were made,
    or the widest line's. Saved, copied and drawn so.
  - **Text boxes** (the maintainer, 2026-10-11: words for a research talk,
    in place of a slide program's): words on the page with a size of
    their own, letters marked, and lists.
    - *A size of their own*, in points as the drawing's labels are: their
      menu's *Font…* shows a card - beside them, clear of them, so that
      what it changes is seen changing (to their right, else below, to
      their left or above) - of *Label* (the drawing's labels' size,
      10 points in ACS 1996's style, as words have had), *Text* 14,
      *Heading* 20 and *Title* 28 - the one they have ringed - and any
      other typed, 4 to 288 points, given with Enter. While they are
      written, Ctrl/Cmd+Shift+> and < take them a size up or down (6, 7,
      8 ... 28, 32, 36, 44 ... 96). One undo step; saved, copied and drawn
      so in pictures (SVG, EMF and PNG). Without one, they are the labels'
      size, as the drawing style says.
    - *Line spacing of their own* (the maintainer, 2026-10-27), on the same
      card: *1* (single, as words have had: 1.25 ems baseline to
      baseline), *1.15*, *1.5* and *2*, the one they have ringed, or any
      other typed, 0.5 to 4 times single, given with Enter. Their lines
      move apart or together eased, and so on an undo; a box given a
      width keeps its top. One undo step; saved, copied and drawn so in
      pictures.
    - *A typeface of their own* (the maintainer, 2026-10-27), on the same
      card, picked as the drawing style's is (the same list: those that
      come with Meno and stand for a journal's, then every one on this
      computer, each shown in itself). It is theirs over the drawing
      style's: the style changed, they keep it. The drawing's typeface,
      first in the list, picked again, they follow the style once more.
      Given once its letters are read, so that they are not drawn in
      another first; the words in the typeface they had fade out as those
      in the new one fade in. One undo step; saved, copied, and written so
      in pictures (SVG and PNG by its name, EMF with its own font
      records), laid out by the typeface's own widths. One that cannot be
      had on a computer is drawn there in IBM Plex Sans, as a style's is.
    - *Letters marked*: bold, italic, a colour, raised or lowered (kcal
      mol⁻¹, ΔG‡, r²SCAN). While they are written, Ctrl/Cmd+B and +I set
      what is selected bold or in italics, Ctrl/Cmd with + raises it and
      Ctrl/Cmd with = lowers it - the keys that give + and =, wherever a
      keyboard has them: Shift and = for + on most, Shift and ; for + and
      Shift and - for = on a Japanese keyboard; the menu names them Ctrl++
      and Ctrl+= (⌘+ and ⌘=) - or, nothing selected, what is typed next
      - and set it back where all of it is already so; a letter typed is
      set as the one before it. From their menu, *Bold* and *Italic*
      (ticked where all their letters are), *Superscript* and *Subscript*
      do so to all their letters, as does the colour card's *Colour* row,
      from the palette (Settings, *General*), where they are right-clicked
      or among a selection. The words stay plain text: the marks are kept
      beside them as ranges of their letters, so that copying, smart words
      and finding words are as they were. A formula's counts stay low and
      its prefixes in italics, whatever is marked. Bold is drawn on the
      canvas as an outline of the letters' own colour, and as bold type
      in pictures.
    - *Lists*: a line that starts - after a tab for each level it is in,
      up to four - with a bullet (•, ◦, ▪ or –) or a number (1. or 1)) and
      a space is a list's item: its lines after the first hang under its
      words, a level one and a half ems in from the one above it. "- "
      typed at a line's start is "• " (above). While they are written,
      Shift+Enter in an item starts the next one, as deep, its number one
      on, and on an item with nothing after its bullet ends the list, the
      bullet taken away; Tab and Shift+Tab take the items the selection
      touches a level in or out (anywhere else, Tab does nothing: the words
      keep the keys, where it once took them away and kept the words). Their
      menu's *Bullets* makes every line an item, or, all of them items,
      plain lines again.
    - *A box keeps its top*: words given a width, and over no arrow, keep
      the top of their first line where it is as their lines grow or
      shrink - written, sized, made a list - rather than growing up and
      down about their middle.
  - While they are written, their box is the system's own text box, which
    breaks lines as the system does; kept, they break as above. Words
    written in place drawn by Meno itself,
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
     other, or at an N, B, Se, Te or Sb atom with three bonds, where a wedge
     states no configuration - rather than lose it. A centre whose fourth group is a lone pair - a
     sulfoxide's or a sulfonium's S, a phosphine's P, an arsine's As - is
     read from its wedge and laid out like any other, on one wedge
     (2026-10-29). A wedge
     that says nothing (on a CH2) goes, and a double bond in a ring of
     seven atoms or fewer says nothing either: its ring has it cis, however
     the ring is drawn. Nor does a double bond cumulated with another - an
     azide's N=N, an allene's C=C - whose shared atom is straight through:
     it has no cis or trans, however a drawing bends it (phenyl azide from
     a SMILES was refused, 2026-10-13). A chain of three cumulated double
     bonds (hexa-2,3,4-triene) does have a cis or trans across it, end to
     end; that is not read, before or after Clean-up.
   - **A configuration the drawing does not state is not drawn in** (the
     maintainer, 2026-10-27). Read by IUPAC's recommendations (Brecher,
     Pure Appl. Chem. 78, 1897, 2006), with "linear" within 10 degrees of
     a straight line (ST-0.1), a drawing states no configuration at a
     centre with three bonds and its H left out whose two bonds are in
     line - a T (ST-1.2.12) - or on top of each other, nor at a double bond
     with a group straight on from it (ST-4.4, the linear drawing of a
     double bond whose configuration is not given). Clean-up would draw
     one or the other configuration there, so it refuses: a wedge on such
     a centre as a wedge it cannot carry, and a double bond so drawn
     because the new drawing would state a configuration the old one did
     not (`lib/layout/drawn.ts#IN_LINE`). A structure not yet drawn - its
     atoms all on one point, as a SMILES's are before it is laid out - is
     not held to this: it is laid out as before, a double bond whose
     configuration the SMILES does not give drawn one way or the other.
   - A SMILES is still read by RDKit, whose drawing says what it means;
     the engine then draws it (RDKit's drawing stands, should the engine
     fail).
   - A bond from a label to a label at a terminal atom - Mg-Br, O-3H - is
     drawn just long enough for the two, in the drawing's style, where at a
     bond's length they would take more of it than their room
     (`labelShareMax`; the maintainer, 2026-10-13). Only Clean-up and a
     SMILES do it: a bond drawn by hand keeps its length.
   - Clean-up writes by name the groups a chemist would write so
     (`lib/chem/contract.ts`, agreed 2026-10-02). Drawing a label out
     (*Expand abbreviation*) puts the group in free space: away from all
     the atom's bonds, in the widest opening between them as a drawn
     substituent is (GR-4.1.2; an NMe in a chain, its methyl 120 degrees
     from each carbon, as a file is written), out of a ring from a ring's
     atom, and clear of the
     drawing's atoms, bonds and labels as far as their letters are set -
     turned, or seen in a mirror where it has no stereo of its own, only
     where it is not clear as laid out; nothing else moves
     (`utils/expandPlace.ts`). It still draws all of it; what is shown by name
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
- Open (Ctrl/Cmd+O, or the menu on empty space) adds a file to the
  workspace in front, as a drop on its canvas does, in free space near
  the middle of the view; only a `.meno` opens a tab of its own (the
  maintainer, 2026-10-13: docs/WORKSPACE.md). Text goes into the column of
  the workspace in front (docs/WORKSPACE.md, *Texts*). Opened onto a
  workspace with nothing on it, the workspace is saved nowhere then: Save
  asks where, suggesting the file's name. A save names the tab for its
  file too. A canvas opened from Word or PowerPoint keeps the document's
  name either way.
- Import that keeps charges, isotopes, radicals, atom lists and S-groups, and
  V3000 reactions.
- SMILES in and out: in from Quick Add's *SMILES* (2026-10-10; a card on
  the canvas before, PR #52), out by *Copy as SMILES* in the selection's
  menu.
- SVG export, drawn exactly as on the canvas - with the drawing style it was
  drawn in - and PNG. The SVG export draws what the canvas draws (PR #36),
  at ACS 1996's own size (PR #43); PNG to come.
- No buttons on the canvas (2026-10-04): Open (Ctrl/Cmd+O), Save As, New
  text, Fit to content (Ctrl/Cmd+1) and Drawing style are on the
  right-click menu on empty space (R/S and E/Z on the menus of what they
  are shown on); Save is a button in the title bar, by
  Settings, and Ctrl/Cmd+S; Export is on the selection's menu; Clean-up
  and 3D structures of everything are Select all and the selection's menu
  (or Ctrl/Cmd+Shift+K on nothing); a SMILES is drawn from Quick Add.
  (Meno's menu, from its logo, held them until 2026-10-10.) Open adds a
  file to the workspace in front, never over what is drawn; a file
  dropped on the drawing is added to it, where it is dropped.
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
  Windows draws too. The
  same trial on Windows (Microsoft 365, 2026-09-29) found the same: the
  EMF in Office's clip format is kept byte for byte and drawn as vectors,
  and Meno reads it back from that clip format alone. With
  the clip format there, plain text beside it does not become a text box
  (on either system); Office on Windows draws a PDF from a Mac by the
  bitmap stored with it. (PR #69: every copy carries these pictures;
  the double-click on Windows is still to come.) Word and PowerPoint on
  Windows draw an EMF's EMF+ records smooth, so the EMF draws everything
  twice: in EMF+ records, and in the EMF records as before, for any reader
  that reads the EMF records alone. Both keep it byte
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
  Word takes an object's changes only as an EMF.) Meno serves no objects
  on a Mac: there a document's object shows its picture, and a picture
  pasted from a Mac is a picture on Windows too - copied into Meno and
  pasted back, it becomes an object.
- On a Mac (Word and PowerPoint for Mac, 2026-09-30), a document's object
  shows its picture - smooth, at its size - and survives being saved there
  byte for byte, moved or not. A double-click on it there does not open Meno.
  To edit one there, copy it - or drag it - into Meno. Word
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
