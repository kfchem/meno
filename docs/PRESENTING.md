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
  All in Meno's own colour, faint, the same on the screen at any zoom;
  gone while a talk is given, and never in a picture of the page.
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
- **The window is given over to it.** It fills the screen (where it did not
  already), Meno's title bar slides up out of the way, the column of texts
  shuts, the selection and anything under way on the page are let go, and
  menus close. The pointer hides after two seconds still.
- **From one slide to the next, the view zooms and moves at once**, along
  the way that asks least of the eye: out a little, across and in again,
  the farther apart the two the farther out, so that both stay in sight
  (J. J. van Wijk and W. A. A. Nuij, *Smooth and efficient zooming and
  panning*, IEEE InfoVis 2003). From 0.6 s for a slide beside the last to
  1.4 s at most, gentle at both ends.
- **Come to a slide**, it fills the screen as far as it fits, and the page
  about it goes under a veil of the page's own white - unless the slide
  shows the page around it. On the way, the page is seen whole. Its number
  (*3 / 5*) shows a moment in a corner.
- **In a slide**: a drag on a molecule in 3D turns it and lets it coast, as
  on the page, and two clicks show it in its other look; a film plays from
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
- **Ended**, the view eases back to where it was, the molecules turned in
  the talk turn back as they were, the window is as it was and the column
  opens again on what it showed. A talk changes nothing in the workspace.
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
- **Letters marked**: bold, italic, a colour, superscript and subscript
  (kcal mol⁻¹, ΔG‡, r²SCAN) - Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+Shift+= and
  Ctrl/Cmd+=. The words stay plain text; the marks are kept beside them as
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

- **Rectangles, rounded rectangles, ellipses, lines, arrows (one head or
  two) and callouts** (a rounded box with a tail that can be moved), each
  able to hold words, broken at its width and moving with it.
- **Their line** - its colour, thin, regular or thick, dashed - **and their
  fill**, from the palette and its light tints.
- **From Quick Add**: *Shapes* opens a second row, as *Calculations* does;
  a shape is drawn from where Quick Add was opened by a drag, or by moving
  the pointer and clicking, as a chain is traced; Shift makes a square or a
  circle, and keeps a line to steps of 15 degrees. The selection's menu has
  *Box around these*, a rounded rectangle round it.
- **A shape's arrow points at something; a reaction arrow is chemistry**
  (it goes into an RXN file). They are called *Arrow* and *Reaction arrow*.
- **Under the drawing, over pictures and PDFs**: a shape never hides a
  bond. A shape with no fill lets a press inside it through to what is
  under it; its line is its own.
- **Saved, copied, undone, and in pictures as vectors.**

## Guides

- **As things are moved**: the edges and middles of what is moved line up
  with those of what is near - and with a slide's edges and middle lines -
  within 6 pixels, a thin line in Meno's accent showing each that does,
  from end to end of what lines up. Spaces between things in a row or a
  column come to the same as others there, each marked. Made larger or
  smaller, a thing takes another's width or height.
- **For what is moved whole** - the selection, a structure, words, a
  picture, a shape, a slide, a PDF, a molecule in 3D - and what is made
  larger or smaller. An atom dragged alone keeps its own snapping to the
  drawing's lengths and angles.
- **Held off** while Cmd (Mac) or Ctrl (Windows) is held during the drag;
  Shift keeps the move across or up and down.
- **Fading in and out**, as everything in Meno does.

## Handwriting

- **A pen writes, always**, wherever it touches; its eraser end, or its
  button, erases. A mouse and fingers do as ever.
- **With a mouse or a trackpad**, *Pen* in Quick Add - or *Write on it* in
  a PDF's menu - begins writing, and a pen's card opens: pen, marker,
  eraser, the palette's colours, three widths, Done. Escape or Done ends
  it; a right drag and the wheel still move and zoom the view.
- **Smoothed as it is written**, so that nothing jumps when the pen is
  lifted; as thick as the pen is pressed where the system says, else even,
  its ends tapered.
- **On a PDF's page**: a stroke begun on a page is that page's, kept in its
  points, and goes wherever the page goes - stacked, spread, turned, made
  an icon, read in the column (where one can be written on too).
- **Strokes written one after another**, within a second and a half and
  near each other, are one piece of writing: selected, moved, coloured and
  deleted together. The eraser takes a stroke at a time. A marker is see-
  through and lies under the words.
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
  the surface that takes the pointer, the veil's four bands, the black or
  white screen, the slide's number. PanZoom2D stands aside while a talk
  drives the view (`viewGoal.ts` `setViewDriven`), and takes it up again
  from where the talk left it.
- `ui/presenting.ts`: the title bar's way made (App), and the window full
  screen through Tauri - which needs the window permission
  `core:window:allow-set-fullscreen` (`src-tauri/capabilities/default.json`).
- Chips that work a molecule (`meno-control-chip`: its frames, *Make
  again*) are hidden while a talk is given (`[data-presenting]` on the
  page's HTML layer).
- The window's corners wait for a talk to end (`usePresentingWindow`'s
  `since` and `ended`): NetworkToasts shows nothing meanwhile and then the
  cards of what ran during it, `ui/notices.ts` holds notices given
  meanwhile, ConsentDialog and UpdateNotice wait.

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
  seen, pictures, PDFs, texts' sheets and slides - as far off as three of
  its larger side and 200 pixels more.
- Where: a drag of the selection (`dragSelection`: a structure, words, a
  picture, a PDF, a text's sheet, a slide, a workflow's steps), molecules
  in 3D moved (`Molecules3D`), words moved alone (`Captions2D`), a slide's
  and a picture's corners, words' edges. An atom dragged alone keeps its
  own snapping to the drawing's lengths and angles.
- Ctrl (⌘ on a Mac) held during the drag holds them off; Shift keeps the
  move across or up and down, the way it has gone most.
- `components/Guides2D.tsx`: the lines and marks in Meno's accent, one
  pixel on the screen at any zoom, coming and going in a short ease.

Not yet, and where it comes: everything under *Handwriting* (its own pull
request); shapes' handles taking another's size (shapes come in their own
pull request; moved as part of the selection, they line up as everything
else); a slide's notes, with the presenter's view.
