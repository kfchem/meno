# Research talks from the workspace

A specification of what lane L8 adds to the workspace so that a research
talk can be given from it: slides on the page and a talk given from them,
text boxes strong enough for a talk's words, basic shapes, guides that
line things up as they are moved, and handwriting - on the page and on a
PDF's pages. Proposed with a working mock and agreed with the maintainer
on 2026-10-11; each part comes as a pull request of its own.

Judge it against [PURPOSE.md](PURPOSE.md). The scope is a research talk
that shows structures and the results of calculations in order (decisions
of 2026-10-10) - not a general replacement for slides software. What a
chemist would otherwise copy into slides - the drawing, the molecule in
3D, its conformers and films, the paper it came from - is already on the
page; a talk is a way through it.

## Decided by the maintainer (2026-10-11)

- **Slides are frames on the page, joined by lines, and a talk zooms from
  one to the next in order** (the maintainer's picture of it).
- **They are called slides**, in the interface and in the code. *Frame* is
  already a molecule's frame in 3D - a step of a trajectory, a conformer.
- **What lies about a slide is chosen slide by slide**: veiled by default,
  so that a slide reads as a slide, or shown, so that the page goes on
  round it.
- **A presenter's view on a second screen** - the next slide, notes, the
  time - **comes later, as a pull request of its own.**
- **The order of the work**: slides and talks, then text boxes, shapes,
  guides, and handwriting.
- **Nothing comes up over a talk**: what the window would say in its
  corners meanwhile waits until the talk ends.

## Slides on the page

- **A slide is a frame round what a talk shows at one point of it**: where
  its middle is, and how wide and tall it is, in the page's units. What
  lies in it is the page's own - the drawing, the molecules in 3D, words,
  pictures, PDFs; the slide says only what is shown. 16:9 when made; 4:3
  from its menu.
- **The slides' order is the talk's.** Each has its number at its upper
  left corner, and a dashed line runs from each to the next, an arrowhead
  half way along it, from the edge of the one to the edge of the other -
  or, one within the other (a detail zoomed into), from number to number.
  All in Meno's own colour, faint, the same on the screen at any zoom -
  until a number's disc would be more than a sixth of its slide's
  height on the screen: from there the number shrinks with its slide, and
  the line and its arrowhead with the smaller of the two it joins; and
  where its figures are too small to read - the least size the page's
  words are read at, 8.25 px - it goes: switched there, a little either
  way, and faded over Meno's quick time, never faded with the zoom
  (presenting/slides `markScale`, utils/zoomSwitch; the maintainer,
  2026-10-28).
  Gone while a talk is given, and never in a picture of the page. A number
  being dragged onto another slide is at its own size.
- **Made** round what is selected (the selection's menu, *Slide around
  these*: as wide as it needs, a little room about it), or from Quick Add
  (*Slide*: a slide of what is seen, a little in from its edges); last in
  the talk.
- **Only its edge and its number are the slide's.** A press inside it is
  on the page. A press on its edge is as on empty space - a drag moves the
  view - and held still it takes hold of the slide, selected, and moves
  it; a click selects it; Ctrl (Cmd on a Mac) and a click adds it to the
  selection. It is selected, moved, copied, cut, pasted and deleted with
  the rest of a selection, and a box or a lasso takes it by its middle.
  Selected, a handle at each corner makes it larger or smaller, its
  proportions kept.
- **Its number dragged onto another slide** puts it there in the talk, the
  others moving up or down one. Its menu has *Earlier in the talk* and
  *Later in the talk*.
- **Its menu**: *Present from here*, earlier, later, *Show the page around
  it* (ticked when it does), Delete; *Make it 4:3* (or 16:9), *Select what
  is on it*.
- **Saved** in the workspace's file, in the talk's order (`slides` in
  `workspace.json`; docs/FILE-IO.md), and carried by Meno's own record on
  the clipboard. Fit (Ctrl/Cmd+1) takes them in.

## A talk

- **Begun** from the menu on empty space (*Present*, from the first) or a
  slide's (*Present from here*), or by the keys slides software has:
  Ctrl/Cmd+Shift+Enter or F5 from the first, Ctrl/Cmd+Enter or Shift+F5
  from the slide that is most nearly what is seen.
- **The window is given over to it**, as slides software plays a talk
  (the maintainer, 2026-10-13: as PowerPoint does). On a Mac the page goes
  to a window of the talk's own over the whole of the screen the window is
  on - borderless, its corners square, over the band beside the notch too,
  the menu bar and Dock hidden - in place, not in a space of its own; the
  window it came from stays behind it, as it was, and other programs'
  windows behind that. Elsewhere the window fills the screen (where it did
  not already). Meno's title bar slides up out of the way, the column of
  texts shuts, the selection and anything under way on the page are let
  go, and menus close. The pointer hides after two seconds still.
- **From one slide to the next, the view zooms and moves at once**, along
  the way that asks least of the eye: out a little, across and in again,
  the farther apart the two the farther out, so that both stay in sight
  (J. J. van Wijk and W. A. A. Nuij, *Smooth and efficient zooming and
  panning*, IEEE InfoVis 2003). From 0.6 s for a slide beside the last to
  1.4 s at most, gentle at both ends.
- **Come to a slide**, it fills the screen as far as it fits - below the
  notch, in the middle of what is left, as slides software lays a slide -
  and everything about it goes black (the maintainer, 2026-10-13: as
  PowerPoint does): the margins where the screen's proportions and the
  slide's differ, and the band beside the notch - unless the slide shows
  the page around it. On the way from one slide to the next the page is
  seen whole within the slide's frame on the screen, so that the way
  between them reads, and the black about that frame stays black all the
  way (the maintainer, 2026-10-19: it went white as the view moved, and
  black again as it came) - the frame going from the slide left's to the
  next one's where their proportions differ; it goes only where both show
  the page around them. Its number (*3 / 5*) shows a moment in a
  corner.
- **In a slide**: a drag on a molecule in 3D turns it and lets it coast, as
  on the page, and two clicks show it in its other look - for the talk
  alone, the workspace's look as it was; a right-press on it - the talk
  shows no menu - turns it once round and back as it was, as *Turn once*
  does on the page (docs/WORKSPACE.md), a press stopping it gently, and
  where it was turned once when the talk began it comes back to as the
  talk ends; a film plays from
  its start as its slide comes, and a click on it pauses it or plays it on.
  A click elsewhere goes on. A drag elsewhere, the wheel and a pinch move
  and zoom the view freely - for a question; the veil goes meanwhile, and
  the next key goes on from there. What works a molecule - its frames, its
  *Make again* - is not shown; what it says - a measurement's value - is.
- **The keys** are slides software's, and those a clicker sends: on with
  Right, Down, Space, Page Down, N or Enter; back with Left, Up, Page Up,
  Backspace or P; Home and End; a number and Enter goes to that slide; B or
  a full stop makes the screen black, W or a comma white, and back. Escape
  ends the talk. No other key does anything while a talk is given: nothing
  on the page can be changed by one.
- **Ended**, the page goes back to its window, at once ready for the
  pointer and the keys - what is under the pointer lit, a key taken,
  without a click - and the view eases to the last slide shown, in the
  editing view, as slides software ends a talk: in the middle of the
  canvas, as much of it as a slide made of the view (the view as the talk
  found it, where that slide is gone). The molecules turned in the talk
  turn back as they were, and shown in their other look are shown as they
  were, the window is as it was and the column opens again on what it
  showed. A talk changes nothing in the workspace: nothing to undo,
  nothing unsaved.
- **Nothing comes up over it.** The network's cards, notices, a question
  about the network and an update ready to go in wait until the talk ends,
  and are shown then, each for its while; a question waited for holds
  what asked it. Every connection is still recorded as it is made.
- **What the presenter sees, with one screen**: what the audience sees.
  With two, the window is on the screen it is on; the presenter's view on
  the other screen comes later (see *Later*).

## Text boxes

Built on the words already on the page (`Caption`): typed in place, smart
words, a width they break into lines at, and how their lines lie.

- **A size of their own**, in points as the drawing's labels are (a bond is
  14.4 points in ACS 1996's style): *Label 10*, *Text 14*, *Heading 20*,
  *Title 28* and any number typed; Ctrl/Cmd+Shift+> and < a step up or
  down. Unset, the drawing's labels' size, as reaction conditions are now.
- **Line spacing and a typeface of their own**, on the same card (*Font…*):
  1, 1.15, 1.5 or 2 times single spacing, or any typed; and any typeface,
  over the drawing style's. Unset, single and the drawing's labels'
  typeface.
- **Letters marked**: bold, italic, a colour, superscript and subscript
  (kcal mol⁻¹, ΔG‡, r²SCAN) - Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd with + and
  with = (the keys that give + and =, wherever a keyboard has them). The words stay plain text; the marks are kept beside them as
  ranges, so that copying, smart words and searching are as they were.
- **Lists**: a line starting "• " is a list's item, its lines after the
  first hanging under its words; "- " typed at a line's start becomes "• ",
  Shift+Enter starts the next item (Enter keeps the words, as it does),
  Shift+Enter on an empty one ends the list, Tab and Shift+Tab a level down
  or up; "1. " starts a numbered list.
- **A box given a width keeps its top** as it grows, rather than growing up
  and down; words over a reaction's arrow stay as they are.
- **Colours from the palette** (Settings, *General*, *Colours*), chosen in
  the colour card.
- **In pictures** of the page (SVG, EMF, PNG) as on the canvas.

## Shapes

- **A rectangle, an ellipse and a line** (the maintainer, 2026-10-19: a
  shape is a shape). One rectangle, its corners square or rounded as far
  as asked - up to round ends - in place of a square and a rounded one; no
  callout. No words are written in a shape: words go beside it, as words
  on the page anywhere.
- **A rectangle's corners**: selected alone, it has one more handle, in
  the highlight's colour, just inside its top left corner, where their
  curve begins - dragged along its top, it rounds them, from square to
  round ends, as one step; and *Corners…* in its menu opens a card of
  them: *Square*, *Rounded* (a fifth of a bond, as *Box around these*
  rounds them - the maintainer, 2026-10-24: 9 points was far too round),
  *Round ends*, or another radius typed in points. Chosen there, or undone
  and redone, the corners go round or square eased; a new rectangle's are
  square.
- **Their line** - its colour; as wide as the drawing's bonds (the
  maintainer, 2026-10-19: as one is made, *Line as bonds* in its menu,
  following the drawing's style as it changes) or 1 or 2 points of its
  own (kept whatever the style); dashed - **and their fill**, from the
  palette and its light tints.
- **From Quick Add**: *Shapes* opens a second row, as *Calculations* does;
  a shape is drawn from where Quick Add was opened by a drag, or by moving
  the pointer and clicking, as a chain is traced; Shift makes a square or a
  circle, and keeps a line to steps of 15 degrees. The selection's menu has
  *Box around these*, a rectangle round it, its corners rounded.
- **An arrow is the page's one Arrow** (the maintainer, 2026-10-12), not a
  shape: Quick Add's *Arrow* draws it, with its kinds, heads, dashes,
  weight, colour and corners in its menu (docs/EDITOR-2D.md, *Arrows*). A
  plain line with no head stays a shape.
- **Under the drawing, over pictures and PDFs**: a shape never hides a
  bond. A shape with no fill lets a press inside it through to what is
  under it; its line is its own.
- **Saved, copied, undone, and in pictures as vectors.**

## Guides

- **As things are moved**: the edges and middles of what is moved line up
  with those of what is near - and with a slide's edges and middle lines -
  within 6 pixels, a thin line in Meno's attention colour (#cd4560,
  `COLORS.attention`) showing each that does,
  from end to end of what lines up. Spaces between things in a row or a
  column come to the same as others there, each marked. Made larger or
  smaller, a thing takes another's width or height.
- **For what is moved whole** - the selection, a structure, words, a
  picture, a shape, a slide, a PDF, a molecule in 3D - and what is made
  larger or smaller. An atom dragged alone keeps its own snapping to the
  drawing's lengths and angles.
- **Held off** while Cmd (Mac) or Ctrl (Windows) is held during the drag;
  Shift keeps the move across or up and down.
- **Fading in and out** (the maintainer, 2026-10-15: they flickered):
  each guide fades in over 100 ms and out over 150 ms; one that is there
  for less than 80 ms - an alignment passed in a fast drag - is not shown
  at all, the snap itself not affected; one that moves to another line
  glides there, not away and back (`presenting/guideFade`). A guide once
  taken is held to 10 pixels, not 6, so that it does not come and go as
  the pointer passes the edge - in a move, and as a box, words or a shape
  are made larger or smaller alike; and a line goes 12 pixels past what it
  joins, at each end, to read as a line.

## Handwriting

- **A pen writes, always**, wherever it touches; its eraser end, or its
  button, erases. A mouse and fingers do as ever.
- **With a mouse or a trackpad**, *Pen* in Quick Add - or *Write on it* in
  a PDF's menu - begins writing, and a pen's card opens: pen, marker,
  eraser, the palette's colours, three widths, Done. Escape or Done ends
  it; a right drag and the wheel still move and zoom the view. A pen
  writes as wide as the drawing's bonds to begin with (the maintainer,
  2026-10-19), following the drawing's style as it changes; its two
  other widths, 1.5 and 3 points, are kept whatever the style.
- **Smoothed as it is written**, so that nothing jumps when the pen is
  lifted; as thick as the pen is pressed where the system says, else even,
  its ends tapered - a pen without pressure, or one whose pressure reads
  the same throughout, writes as the mouse does.
- **A stroke is kept whole**: it ends where the pen was lifted. The page
  takes no pan or zoom gesture of the system's own from a pen or a touch,
  which would take a stroke back as it is written. A pressure read as 0
  while the pen still touches is taken as the pressure before it. A stroke
  taken back all the same goes on if the pen comes down again within
  250 ms and 24 pixels. A touch while a pen writes - the hand resting on
  the screen - is no press at all.
- **On a PDF's page**: a stroke begun on a page is that page's, kept in its
  points, and goes wherever the page goes - stacked, spread, turned, made
  an icon, read in the column, where it is shown; a page is written on on
  the canvas alone - writing in the column itself is not built yet (see
  *Not yet*).
- **Only on the canvas**: a pen writes on the page and on PDFs' pages,
  not on what lies over the canvas in the page's own layer - texts'
  sheets, cards, menus - nor in the column.
- **Strokes written one after another**, within a second and a half and
  near each other, in the same pen, width and colour, are one piece of
  writing: selected, moved, coloured and
  deleted together. The eraser takes a stroke at a time. A marker is see-
  through, in the first colour of the set in use unless given another, and
  lies under the words.
- **While a talk is given**, a pen writes over the slide, and what it wrote
  goes as the slide does.
- **Saved and undone, a stroke at a time; in pictures as vectors.**

## Later

- **A presenter's view on a second screen**: the slide shown, the next one,
  the slide's notes and the time, the talk itself on the other screen.
- **Slides written as a PDF**, a page each, to send round or hand in.
- **Things in a slide shown one after another.**

## As built

### Slides and talks (lane L8, first part, 2026-10-11)

- `store/types.ts` `Slide` and `Presenting`; `document.ts` `addSlide`,
  `updateSlide`, `orderSlide`, `removeSlides`, and `MarkPlaces.slides`
  (moved with a selection); `store/slices/slidesSlice.ts`; `selSlides`
  and `hoveredSlide` beside the other kinds' in the selection, the
  clipboard's record, a cut, a paste and the workspace's file.
- `components/Slides2D.tsx`: the frames, numbers and lines; a press, a
  hold, a drag of the number, the corner handles.
- `presenting/zoomPath.ts`: the way between two views (van Wijk and Nuij's
  equations), and how long it takes; `presenting/slides.ts`: a slide round
  a box or of the view, the one in view, the line between two, the view
  that shows one, and what a key does in a talk.
- `presenting/Presenter.tsx`, in the canvas: the view on its way and at a
  slide, the pointer and the keys in a talk, the molecules turned and
  turned back, films begun again. `presenting/PresentLayer.tsx`, over it:
  the surface that takes the pointer, the veil's four bands (about the
  slide where it is drawn, at a slide; on the way, about the screen's frame,
  `frameOnScreen`, going from the slide left's to the next one's), the black or
  white screen, the slide's number. PanZoom2D stands aside while a talk
  drives the view (`viewGoal.ts` `setViewDriven`), and takes it up again
  from where the talk left it.
- `ui/presenting.ts`: the title bar's way made (App), and the window full
  screen by the app's own command `present_window` (`src-tauri/src/present.rs`),
  which needs no window permission. On a Mac it moves the window's content
  view - wry's, the one WKWebView in it - into a borderless window of the
  talk's own (`MenoTalkWindow`, one that can take the keys) over the whole
  screen, and back as the talk ends: the main window's look is never
  touched, so the page follows the pointer from the talk's first moment
  to its last. It tells the talk the
  screen's top inset (the notch's band), which the slide is laid below
  (`slideFit`). Molecules switched to their other look in a talk are the
  view's (`talkLooks`), let go as it ends.
- Chips that work a molecule (`meno-control-chip`: its frames, *Make
  again*) are hidden while a talk is given (`[data-presenting]` on the
  page's HTML layer).
- The window's corners wait for a talk to end (`usePresentingWindow`'s
  `since` and `ended`): NetworkToasts shows nothing meanwhile and then the
  cards of what ran during it, `ui/notices.ts` holds notices given
  meanwhile, ConsentDialog and UpdateNotice wait.

### Text boxes (lane L8, second part, 2026-10-11)

As built, in docs/EDITOR-2D.md, *Text*: a size of their own, letters
marked, lists and a box's top. A list's next item is started by
Shift+Enter, since Enter keeps the words, as it did before.

### Shapes (lane L8, third part, 2026-10-11)

- `lib/chem/shapes.ts`, the same for the canvas, SVG and EMF: the line a
  shape follows (a rounded box's corners at most 9 points round, a callout's
  tail from the side its tip lies beyond), its dashes, the area it fills,
  where a press takes it, how far it reaches, where its words go, and how it is drawn, made
  larger or smaller, moved and turned. Lines are 0.6, 1 or 2 points
  (thin as a bond's, regular, thick); a dash is 3.5 widths and 2 points
  long, a gap 2 widths and 1.5 points.
- `store/types.ts` `Shape` (its kind, two corners or two ends, a callout's
  tail, its weight, dashed, its line's colour - or
  `"none"` - and its fill) and `Caption.shape`, the shape words are in;
  `document.ts` `addShape`, `updateShape`, `restyleShapes`, `orderShapes`,
  `removeShapes` (their words with them), `withShapeWords` (words about the
  shape's middle, as wide as it is inside, less a third of a bond either
  side - the rectangle within an ellipse) and `MarkPlaces.shapes`;
  `store/slices/shapesSlice.ts`; `selShapes`, `hoveredShape` and
  `shapeDraft` beside the other kinds'; the clipboard's record, a cut, a
  paste and the workspace's file, words in a shape kept in it as it is
  numbered anew.
- `components/Shapes2D.tsx`, between the pictures (-0.3) and the
  drawing's fills: each shape and one being drawn; a press on its line or,
  filled, inside it - none through what is drawn over it; a hold, a click,
  a second click to write in it; the handles. `components/shapeFrom.ts`:
  drawn from Quick Add, led by a drag or traced with the button up - its
  icon double-clicked too: the second press, as the trace begins and where
  it began, is not the click that ends it (`traceEndedBy`, utils/press;
  before, it ended the shape at once, too small to be kept, and nothing
  was drawn).
- Quick Add's *Shapes* opens a row of the five; the shape's menu
  (`PartMenu` kind `shape`): *Edit text*, *Colour…*, *Delete shape*; thin,
  regular or thick line, dashed, *Bring to front*, *Send to back*. The
  selection's menu has *Box around these*: a rounded rectangle a third of
  a bond clear of it. The colour card's rows for
  shapes: *Line* (*None*, no line), *Fill* and *Light fill* (each colour a
  quarter of the way from white).
- Pictures of the page (`Layout.shapes`): SVG paths and EMF polygons and
  pens, under everything else, from the back. An ellipse, and a rounded
  rectangle's or a callout's corners, go as the curves they are
  (`outlineCurve`: cubic Bezier segments, begun at a smooth point so that a
  line drawn round meets itself with no seam) - SVG curves, EMF+
  DrawBeziers and GDI PolyBezier for a whole line, and the fill's edge
  likewise in SVG and in fine steps in EMF - so that they stay smooth
  however far a picture is enlarged in Word or PowerPoint (before
  0.1.12, an ellipse went as about 74 points, its corners seen enlarged);
  a dashed line goes in its dashes, as before.
- **An arrow is not a shape** (2026-10-12, once arrows were one): `Shape`
  lost its `arrow` kind and its heads, and the shapes' row its arrow.
  Quick Add has one arrow, *Arrow* (the maintainer: one entry, in the
  first row, no longer called *Reaction arrow*), drawn by a drag to its
  point or put down as one is made by a click (`components/arrowFrom.ts`),
  so an arrow pointing at something for the audience can be dashed,
  coloured, given corners or two heads in its menu, as any arrow. The
  arrow's menu is called *Arrow* again, and its delete *Delete arrow*. A
  shape of kind `arrow` in a workspace saved before is not read: it opens
  without it.
- **A shape is a shape** (2026-10-19, the maintainer: no words in one, the
  callout gone, one rectangle with a corner radius, lines as wide as the
  bonds). `lib/chem/shapes.ts`: the kinds `rect`, `ellipse` and `line`;
  `radius`, a rectangle's corners in points (none, square; never past half
  its shorter side, `cornerRadius`); `width`, its line in points (none, as
  the drawing's bonds: `asBonds`, `bondLinePtOf` - the layout's line width
  over its point). `Caption.shape`, the words-in-a-shape layout
  (`withShapeWords`, `wordsRoom`), the callout's tail and the weights
  (`thin`, `regular`, `thick`) go. `Shapes2D`: the corners' handle (a
  rectangle selected alone, `roundHandleAt`: as far in as the curve begins,
  at least 14 pixels) dragged along the top, the corners drawn as it goes
  (`roundedByHand`) and eased otherwise (`RoundEase`, TAU.quick, a part's
  frame work only while they go); `CornersCard.tsx`, as `SizeCard` is. Pens:
  `INK_WIDTHS_PT` a pen's first width `null`, as the bonds' (`inkWidthPt`).
- **Workspaces saved before** (no shims kept, nothing lost): a rounded
  rectangle or a callout opens as a rectangle with the corners it was
  drawn with (`roundedPt`, read at the point of the style it was saved
  in), a callout's tail let go; words written in a shape open as words on
  the page where they were, as wide and as large, the shape no longer
  theirs; a line's weight opens as a width of its own (thin 0.6, thick 2
  points), regular as the bonds'. A pen's thin width (0.75 points) opens
  as the bonds'; its others as they were.

### Guides (lane L8, fourth part, 2026-10-11)

- `presenting/guides.ts`: where something moved by so much goes as it
  lines up - its left, middle or right with another's, its top, middle or
  bottom likewise, within 6 pixels of the screen, each way on its own and
  the nearest first - or as a space in its row or column comes to the same
  as another: halfway between the nearest either side of it, or as far
  from its neighbour as that is from the one beyond. A box made larger or
  smaller, its proportions kept, takes another's width or height; words
  made wider or narrower take another's width. Lines run from end to end
  of all that line up; a mark, ticked at each end, lies across each space
  or size made the same.
- `utils/guiding.ts` (`guideMove`, `guideScale`, `guideWidth`): what moves
  is the box round what is selected (`utils/extent.ts` `selectedBox`);
  what it lines up with is what is near it, not selected, each in its own
  box (`besidesBoxes`): each structure (its atoms, and half a label round
  those that show one), arrows, "+" signs and words, molecules in 3D as
  seen, pictures, PDFs, texts' sheets, slides and shapes - as far off as
  three of its larger side and 200 pixels more.
- Where: a drag of the selection (`dragSelection`: a structure, words, a
  picture, a PDF, a text's sheet, a slide, a workflow's steps), molecules
  in 3D moved (`Molecules3D`), words moved alone (`Captions2D`), a slide's
  and a picture's corners, words' edges, and a shape's corners and sides
  (`Shapes2D`: each side moved takes the width or height of something
  near, its proportions free - or kept, with Shift, from the corner
  across). Shapes line up and are sized by the box their line runs round
  (`shapeFrame`), an arrow's heads not counted. An
  atom dragged alone keeps its own snapping to the drawing's lengths and
  angles.
- Ctrl (⌘ on a Mac) held during the drag holds them off; Shift keeps the
  move across or up and down, the way it has gone most.
- `components/Guides2D.tsx`: the lines and marks in Meno's attention
  colour (#cd4560, `COLORS.attention`), one
  pixel on the screen at any zoom, coming and going in a short ease.

### Handwriting on the page (lane L8, fifth part, first half, 2026-10-12)

- `lib/chem/ink.ts`, the same for the canvas, SVG and EMF: a stroke's
  outline - as thick as the pen was pressed (from 0.35 to 1.65 of its
  width) where the system said, else even with its ends tapered over two
  and a half widths; a marker's flat - its triangles for the canvas, where
  a press takes it, how far it reaches; the 1€ filter (Casiez, Roussel and
  Vogel, 2012) that smooths what the pointer gives as it comes; and points
  nearer than 0.6 pixels to the one before dropped as it is kept. The pen
  writes 0.75, 1.5 or 3 points wide, the marker 6, 10 or 16, see-through
  (0.38). Given no colour of its own, a pen writes in the drawing's ink and
  a marker in the first colour of the set in use (`markerColour`).
- `store/types.ts` `Ink` (a piece: its pen, width, colour and strokes,
  each its points - x, y and the pressure - and whether the pressure was
  the pen's own) and `InkMode` (the card); `document.ts` `addInkStroke`
  (a stroke on the piece before it, where it is in the same pen),
  `addInk`, `removeInkStrokes`, `colourInks`, `removeInks` and
  `MarkPlaces.inks`; `store/slices/inksSlice.ts`; `selInks`, `hoveredInk`,
  `inkMode` and `inkDraft` beside the other kinds'; the clipboard's
  record, a cut, a paste and the workspace's file (`inks`).
- `components/InkWriting.tsx`: a press on the canvas by a pen - or by the
  mouse's button while the card is open - is the writing's alone; a pen's
  eraser end or its button, or the card's eraser, rubs out the strokes it
  passes over, one step for a rub. A stroke joins the piece before it when
  it comes within 1.5 seconds, in the same pen, width and colour, and its box within six
  widths and an em of that piece's. `components/Inks2D.tsx`: the pieces -
  a pen's at 0.3, over the drawing, a marker's at -0.12, under it - the
  stroke being written, the light round a piece, and a press, a hold and a
  click on one, as on a picture. `utils/strokeTaking.ts`: a stroke's
  points as the pointer gives them, kept whole (*A stroke is kept whole*).
- `PenCard.tsx`: the pen's card, at the top of the canvas - pen, marker,
  eraser, the colours of the set in use and the pen's own (a marker's own
  being the set's first, shown once), three widths - a pen's first as
  wide as the drawing's bonds, following its style, then 1.5 and 3
  points (`lib/chem/ink` `INK_WIDTHS_PT`) - Done (or Escape).
  Quick Add's *Pen* opens it; the pointer is a cross while it is open.
  Writing's menu: *Colour…* - whose card, for a marker's writing alone,
  shows the marker's own colour (the set's first) in place of *None*, as
  the pen's card does - and *Delete writing*.
- Pictures (`Layout.inks`): a marker's under the drawing, see-through in
  SVG and EMF+ (and as far toward white as it shows for GDI), a pen's over
  everything.

### Handwriting on PDFs and in a talk (lane L8, fifth part, second half, 2026-10-12)

- A stroke begun on a PDF's page - the top one of a stack, or one spread,
  not an icon - is that page's (`utils/pdfInk.ts` `pageUnder`): kept with
  the PDF (`PdfItem.inks`, each piece on its page, its points the page's,
  from its top left), and drawn with the page (`pdfPictures` `Page`, at
  0.00245 - over its pictures, under the marks a search or a box puts on it
  and a ring round an atom read from a figure, as agreed with lane L12) -
  so it goes wherever the page goes: stacked, spread, put in a place of its
  own, made an icon and back, and read in the column. A stroke joins a
  piece on the same page only. The eraser rubs out what is written on the
  pages under it too. A PDF's menu has *Write on it*, which opens the pen's
  card. Saved and copied with the PDF.
- While a talk is given, a pen - not the mouse - writes over the slide
  (`talkInk`, the view's, never the document's: no step to undo), its
  eraser end rubbing out; what it wrote goes as the slide does, and when
  the talk ends.

Not yet, and where it comes: writing in the column itself (what is written
on the page shows there); a slide's notes, with the presenter's view.
