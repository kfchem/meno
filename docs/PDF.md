# PDFs, pictures and texts on the page

A specification of stage 4 (WORKSPACE.md, *Stages*): a PDF, a picture
and a text each a thing on the page, as a molecule is. Each is read
where it lies or in the column beside the canvas, and its parts - words,
figures - are taken out onto the page. Stage 5 - figures read as
structures - builds on it.

Written on 2026-10-09, before anything is built, and revised the same
day with the maintainer's answers, twice. What is left to decide is at
the end.

Judge it against [PURPOSE.md](PURPOSE.md). A chemist reads a paper to
find a molecule, how it was made and what was found about it. Here the
paper lies on the page beside that molecule. A figure from it sits
beside the structure drawn from it, and later, in stage 5, is drawn as
that structure. Moving between a PDF reader, a text editor and Meno
stops being part of the work.

## Decided by the maintainer (2026-10-09)

1. **PDFium.** Meno reads and draws PDFs with PDFium, the engine Chrome
   reads PDFs with: the maintainer's choice. No way of changing engines is
   to be kept: Meno is built on PDFium.
2. **The best of what drawing with WebGL allows, joined to the
   workspace.** A PDF's pages are drawn on the canvas, not beside it.
   - Zoomed into, what a page holds comes up out of its preview.
   - Movement has depth: pages lift and settle as molecules rise.
   - Words selected in a PDF and dragged come away from it, moving, and
     become words on the page.

   It all follows Meno's own design, not another app's.
3. **Every file the workspace holds is a thing on the page**, which
   shows what it holds and through which its content is reached:
   - a PDF, its pages;
   - a text, its sheet;
   - a picture, itself;
   - a calculation's output, the molecule in 3D it gave - as it is now.

   Texts are drawn with WebGL as well, if that serves them better than
   HTML (*Texts*, below).
4. The answers to the first draft's questions:
   - **A PDF is read on the page, and in the column**, both.
   - **A figure is cut out by a drag.**
   - **Pictures from anywhere go on the page**: image files, the
     clipboard, and figures out of a PDF.
   - **A picture is drawn as a structure is**, in the drawing, and is
     moved, scaled and turned.
   - **Search looks in the PDF shown or in every PDF**, which of the two
     being chosen at the search field.
   - **PDFium runs in a process of its own**, and **is carried in the
     app**.
   - **Previews are made.** Every part of the interface is joined to
     every other.
5. The answers to the second draft's questions:
   - **A drag that starts on text selects it; one that starts where there
     is no text draws a box - and inside a figure, a box from anywhere**,
     where PDFium says the figure's paths and pictures lie (*Taking
     things out*).
   - **Words dragged out become words on the page**, the kind #177 made.
   - **Texts are coloured by Lezer** (*A text*).
   - **Texts are drawn with WebGL**, as VS Code draws its own text: Meno
     draws the text, the caret and the selection, and takes typing from a
     field kept out of sight.
   - **What is on the page is drawn as its labels are, in signed-distance
     type (troika)**, sharp at every zoom: atoms' labels and words on the
     page, as now, and a text's sheet. **What is in the column is drawn
     by the system's own type**, made into pictures line by line, as sharp
     as any editor's: the column is zoomed into only as a thing opens or
     closes.

## What a thing on the page is

- **It lies on the page** with the drawing and the molecules, in the
  order things were put there, and is handled as they are:
  - moved by a drag;
  - selected by a click, a box or a lasso (its middle inside), or
    Ctrl/⌘ and a click;
  - deleted, copied, cut and pasted with the rest of a selection;
  - undone.
- **Its name lies under it**, as a file's name lies under its icon,
  in the drawing's type.
- **It shows more of itself the nearer it is seen.** Far off it is a
  small sheet with its name; nearer, its first page or first lines come
  up, softly, then sharp; near enough, it is read where it lies.
- **It is opened beside the canvas** by a double-click, or *Read* in its
  right-click menu. Its content goes into the column, rising from where
  it lies on the page and settling there. Closed, the column's content
  goes back to it.
- **The two are one thing**:
  - the page the column shows is the page on top of the PDF on the
    canvas;
  - what is selected in one is selected in the other;
  - hovering a page in the column lights the PDF it belongs to.

## A PDF

### On the page

- **A stack of its pages**, the first on top, the others just under it.
  The stack is a little thicker the more pages it has, up to a few
  sheets' worth.
- **Read where it lies**:
  - Zoomed into, the top page's text and figures come up, sharp at
    any zoom.
  - Its pages are turned by the top page's corners, folding as the stack
    is hovered, by the arrow keys over it, or by its menu, the top page
    lifting off and going under (*Movement*, below). The wheel and two
    fingers zoom and move the view over it, as over the rest of the page.
  - The right-click menu has *Spread pages*. The pages lift off the
    stack one after another and lie side by side on the page, in rows,
    to be read and compared at once. *Gather pages* puts them back.
  - Spread, each page can be put where it is wanted - beside a structure
    drawn from it, or next to another page to compare - and gathered
    again (*Pages placed one by one*, below).
- **It comes onto the page as an icon**, its top page on it and its name
  under it. The name is set in the drawing's type, at the size of its
  labels, and the icon is five times as tall as it, as a file's icon is
  to its name on a desktop: three and a half bonds in ACS 1996's style.
  *Show full size*, in its menu, makes it the stack at the size it is
  printed; *Minimize to an icon* makes it small again. An icon is moved,
  read in the column and deleted as the stack is.
- **Its figures and words are taken out from here** as from the column
  (*Taking things out*, below).
- **Selected with the rest of the page** by a click, a box or a lasso,
  and moved, copied and deleted with it (*With the rest of the page*,
  below).

### In the column

- **Its pages one under another**, as wide as the column, scrolled
  there. A page number shows as it scrolls (*3 / 12*); a click on it asks
  for a page to go to.
- **Larger or smaller** by a pinch over the column, or Ctrl/⌘ with the
  wheel there - the column's own, never the canvas's. *Fit width* comes
  back with a double-click on the number. The column is as wide as its
  edge is dragged.
- **Its name among the texts' names** along the column's top. Closing it
  there closes the column's view of it; the PDF stays on the page.
- **Links in the PDF** work:
  - one to a figure, a reference or a section goes there, in the column
    or on the stack, and back with the system's Back keys (⌘[ on a Mac,
    Alt+← on Windows) or the mouse's back button;
  - one to a web page opens in the system's browser when it is clicked.

### Quick, then sharp

- **A page shows at once**, from a small picture of it, and the parts in
  view are then drawn at the screen's resolution, in tiles that fade in
  over it. The small picture alone is kept only where the page is shown at
  half its pixels or fewer: shown larger, its letters were all but white
  (a page put on the canvas small, found on Windows, 2026-10-16), and the
  page is drawn in tiles, as at any size.
- **While a pinch or a zoom goes on**, the tiles there are scaled on the
  graphics card, and drawn again sharper once it stops. Nothing waits
  for PDFium.
- **Drawn as it scrolls** (the maintainer, 2026-10-16: nothing was
  drawn again until a scroll stopped). While the view moves across a page
  at the same zoom - a scroll in the column, a pan on the canvas - the
  tiles coming into view are asked for every eighth of a second at the
  level the page has (in the column, a page new in view takes the quick
  one), the way it is going first; one that has left the view a moment
  before its turn is dropped. A zoom still waits for the view to stop,
  the level changing. Tiles that come are shown one a frame, each put on
  the graphics card as it is, so that none waits on several at once.
- **Light on the graphics card** (found on Windows, 2026-10-16: a PDF
  scrolled in the column kept the graphics card full).
  - A picture of a page come and faded in is drawn opaque, and its tiles
    before anything else, so that the graphics card leaves out, pixel by
    pixel, all of the page behind them - its small picture, tiles of
    another level kept under - instead of drawing each and blending the
    next over it. A page's white sheet is not drawn under its small
    picture once that is whole.
  - With the column open the full height of the window, the page is drawn
    only beside it: under it, the column's own background covers all of it.
  - Nothing is drawn again while nothing moves or changes.
- **Only what is in view is drawn**, nearest first, then the pages next
  in the way the view is going: once it stops, the column asks for the
  next screen's worth the way it last scrolled, and the canvas for half a
  screen further the way it was last moved - after all that is seen, so
  that what it goes on to is there (the maintainer, 2026-10-15). A tile no longer wanted when its turn
  comes is dropped, never sent to PDFium; one sent is drawn to the end.
  Pages far out of view are let go, and drawn again when they come back.
- **Sharp again soon after a zoom stops** (2026-10-15, after a report of
  pages staying blurred a while on a Windows tablet):
  - Pages are drawn in two passes once the view is still: first at
    about 1.41 times the screen's scale, sharp soon; then, once those
    tiles have come and faded in, at twice it, faded in over them. The
    levels lie on a grid a sixteenth of a doubling apart, so a view
    stopped a hair from where it was keeps the tiles it has.
  - Why twice: PDFium's small letters drawn at the screen's own scale come
    out lighter than drawn finer and shrunk to it. At 1 to 1.41 times, a
    paper's text was a tenth to a third lighter than 0.1.12's 1 to 2
    times (found on Windows, 2026-10-16); at twice, it is as dark at every
    zoom. Drawn at twice alone, a page of heavy figures on a slow machine
    took seconds to come; the quick pass first keeps it sharp as soon as
    before.
  - What a zoom leaves stays: tiles of any level had, finer or coarser,
    are drawn under the new level's own until those over the part seen
    have come and faded in, never the page's small picture between -
    however long the view stood still before. Parts out of view are not
    waited for, and at most 24 tiles are kept under, those of the nearest
    levels first, so that panning and zooming a long while keeps no more
    than a few screens' worth.
  - Tiles are 1024 pixels a side, four on their way at once: a quarter as
    many requests as at 512, each carrying the page's part from PDFium
    to the window.
  - Parts of pages are drawn by up to three readers side by side, one
    fewer than the machine's cores, each a process with its own PDFium:
    PDFium draws on one thread at a time in a process, so pages are drawn
    side by side only in processes of their own. The first reader is
    asked everything else, and draws only where it is the only one, so
    that a hover or a figure read never waits behind a page drawn large.
    Each keeps the six PDFs last asked about open, closing the rest.

### Text

- **In the column, a drag that starts on text selects text**, as in any
  reader: a double-click selects a word, a triple-click a line. On a
  stack, a drag moves the view, and a long press on its words selects
  from the word under it (*As built*, step 3). ⌘C copies it, and the
  right-click menu has *Copy*.
- **A line's band is its words'** (2026-10-23): a press in the white
  between two lines - half way to each - or up to a line's height past its
  ends selects from the line it is in, so a press between the rows of a
  table of coordinates, or in the gaps between its numbers, selects text
  and never draws a box. In a figure, a line of twenty letters or more (a
  table's row, a sentence) is text too; a figure's labels are the
  figure's, as before. A box is drawn from where there are no words.
- **Shift-click** in the column draws the selection on from where it was
  begun to the point clicked, on the same page or a later one - as a drag
  across pages, the column scrolling on at its top and foot, does.
- **PDFium says where each letter is**, and Meno selects and marks by
  that, on the stack and in the column alike.

### Search

- **⌘F** in a workspace holding a PDF, or *Find in PDF…* in the
  right-click menu on empty space, opens a field at the column's top, on
  the PDF it shows or else the one under the pointer. It has two choices
  beside it, *This PDF* and *All PDFs*.
- **What it finds**:
  - each place is marked on the pages, in the column and on the stacks;
  - the places are counted (*3 of 12*);
  - Enter goes to the next, Shift+Enter to the one before, and Esc
    closes the field.
- **With *All PDFs***, the places are listed under each PDF's name, and
  going to one shows that PDF.
- **How letters are matched**: by Meno's own search, over the letters
  PDFium reads, without regard to case. A line's end reads as a space,
  and a word broken by a hyphen at a line's end is found whole (*The
  trial*, below).

## Taking things out

- **Words**: a selection dragged comes off the page as Meno's own words,
  each rising from the word it was toward the viewer and going to its
  place in Meno's lines, following the pointer.
  - Let go on the canvas, they settle there as words on the page (as
    #177 made them), in the drawing's type.
  - Let go anywhere else, they go back.
  - The words keep where they came from: *Show in the PDF* in their
    right-click menu shows that place, marked for a moment.
- **A figure**: a drag that starts where there is no text - in a margin,
  or anywhere inside a figure, its own labels included - draws a box.
  Where a figure lies is known from what the page is made of: PDFium
  says where its paths and pictures are. Let go, the box stays,
  outlined.
  - Dragged on, the box lifts off as a picture and follows the pointer,
    and settles where it is let go.
  - Its right-click menu has *Put on the page*, which places it beside
    what is in view, clear of what is there, as a new molecule in 3D is
    placed, and *Copy picture*.
  - Esc, or a click elsewhere, lets the box go.
- **A picture taken out is drawn from the PDF itself**, not from the
  screen, at the resolution Settings, *Files*, sets for copied pictures
  (600 dpi by default). It is as sharp as the figure was printed.
- **Tied to where it came from**: a picture keeps which PDF, which page
  and which box, and its right-click menu has *Show in the PDF*.

## A new PDF from pages

Asked for by the maintainer on 2026-10-18: simple editing of the PDFs a
workspace holds, as a chemist needs it for a paper's supporting information.
**The PDF it is made from is never changed**: what is made is a new PDF of
its own, put on the page beside it - an icon, as one opened is, clear of the
PDFs there - one step, which an undo takes back. It is held as any other
(its bytes in Meno's cache by their SHA-256, and in the workspace's file).

- **Where.** On a PDF's right-click menu, in a group of their own: *Page
  numbers…*, *Pages…*, *Combine into one PDF* (two or more PDFs selected,
  right-clicked on one of them or on the selection) and *Save as PDF…*,
  which writes a PDF's bytes, as they are, to a file picked.
- **Page numbers…** A card shows the first page with its number where it will
  be, as it is chosen: 1, 2, 3 or S1, S2, S3 (supporting information's); the
  first page's number; at the foot's left, middle or right. *Make numbered
  copy* makes "paper (numbered 1).pdf" - "(numbered S1)", "(numbered 12)":
  the first page's number, as chosen - each page's number in Helvetica, 9 pt,
  its foot 28 pt from the page's foot (a corner's 28 pt from the side), upright
  on the page as it is shown, however the page is turned.
- **Pages…** A card of the PDF's pages, drawn small as they come into view: a
  page dragged goes where it is let go, the others making room, eased; a
  click selects that page alone, Shift and a click the run from the page
  clicked last, Ctrl (⌘ on a Mac) and a click adds a page or takes it away,
  and pages typed ("3-5", "1, 4, 7-9") select those. *Turn left* and *Turn right* turn those selected a
  quarter; *Take out* leaves them out. *Make new PDF* makes one of the pages
  as they are now ("paper (arranged).pdf"); *Extract selected* one of those
  selected alone ("paper (pages 3–5).pdf", an en dash, for a run; "paper
  (page 2).pdf" for one).
- **Names** (the Windows pre-release check, 2026-10-18): one already on the
  page is counted on - "paper (numbered S1) 2.pdf", "Combined 3.pdf" - so no
  two share a name; and the part in brackets is kept on one line under its
  icon (its spaces and dashes shown as ones a line does not break at).
- **Combine into one PDF** makes "Combined.pdf" of the PDFs selected, in the
  order they are read on the page - rows top to bottom, each left to right -
  each one's pages in order. Put in another order after, with *Pages…*.
- **How it is made** (src-tauri/src/pdfmake.rs): in the PDF reader's own
  process (*Where it runs*), as its `make`, with PDFium alone: a new
  document, each page copied into it in the order given
  (`FPDF_ImportPages`), its turn added to the one it had (`/Rotate`), and a
  page's number a text object in the standard Helvetica, which needs no font
  embedded. Pages are copied whole - their words stay words, as they were
  drawn; a link to another page of the PDF it came from may lead nowhere in
  a copy without that page.
- **What a copy does not hold**: writing by hand on a PDF in Meno (*Write on
  it*) is the workspace's, over its pages, not the PDF's - it stays with the
  PDF it was written on.

## A picture

- **From anywhere**: a figure taken out of a PDF, an image file (PNG,
  JPEG) opened or dropped, or a picture pasted from the clipboard, such
  as a screenshot - or a render of molecules in 3D, a picture or a film
  that plays where it lies ([`RENDER.md`](./RENDER.md)).
- **Drawn as a structure is**: in the drawing, in the order things were
  put there. A picture is never drawn over a molecule in 3D.
- **Moved, scaled and turned.** It is selected as a structure is, and
  the selection's frame and handles scale and turn it. A picture keeps
  its proportions.
- **Saved** in the workspace as the file it is (`files/<sha256>`). The
  workspace keeps its place, size, turn and source.
- **Read as a structure in stage 5**, from its right-click menu.

## A text

- **A sheet on the page** with its first lines, in Meno's monospaced
  type, and its name under it. A text opened, dropped or made new
  (*New text*) lies on the page as well as being in the column. Seen
  nearer, more of it shows, and it is read where it lies.
- **It comes onto the page as an icon**, as a PDF does: its sheet made
  small, its longer side as long as a PDF's icon is tall, its name
  under it at the size of the drawing's labels. *Show full size* and
  *Minimize to an icon*, in its menu, change it as they change a PDF.
- **A calculation's output keeps its molecule as its body**: the
  molecule's *Show <name>* opens the output in the column, rising from
  the molecule. No sheet is laid beside it.
- **Drawn with WebGL**, as VS Code draws its own text:
  - **On the page**, a text's sheet is set in the type atoms' labels are
    set in, signed-distance glyphs made as they are needed (troika),
    sharp at every zoom.
  - **In the column**, each line is drawn by the system's own type into a
    picture, and the pictures are textures: as sharp as an editor's, and
    any letter Meno's own fonts lack is taken from the system's, as a
    browser takes it.
  - **Between the two**, a text rising from the page into the column
    moves in the page's type, and once it has settled its lines come up
    sharp in the system's - as a PDF's tiles do.
  - **Only the lines in view are set or drawn**, so a calculation's log
    of a hundred thousand lines scrolls as a short file does.
  - **Typing**, IME included, goes into a field kept out of sight and
    kept at the caret, so that the IME's candidates show where they
    should; Meno draws the text, the caret, the selection and what the
    IME is composing. The lines around the caret are kept in that field
    too, so that a word already written can be converted again.
    Words on the page are typed in place the same way (*As built*,
    step 5).
  - **The keys are an editor's**: arrows, by word and by line, to a
    line's ends and the text's, page by page, with Shift to select, each
    as the system has them on a Mac and on Windows.
  - **What the system's text services give** - a word looked up,
    reading aloud - is not offered in the column at first; a copy of
    the text in view, kept out of sight, can bring them back later.
- **Coloured by what it is**, where that is known, by Lezer (MIT, the
  parsers CodeMirror is built on, which take up an edit without starting
  over). Lezer says which part of the text is what; Meno draws the
  colours.
  - a Python script, JSON or XML by their usual grammars;
  - a calculation's input or output by its plugin's grammar for its
    kind - its keywords, its options and values, its atoms and numbers;
    what a reader of an output looks for, what says a run went well, its
    warnings and errors - so that Meno knows no program's format of
    itself. What does not read as the grammar says - a block left open,
    a molecule with no charge - is marked.
- **A Markdown text is read formatted** (*Markdown*, below), and written
  in its source.

### Markdown

A text whose name ends `.md` or `.markdown` is read as what it says, not
as its marks (the maintainer asked that Markdown files open formatted, to
be read).

- **As CommonMark 0.31.2 reads it, with GitHub's tables, task lists,
  strikethrough and autolinks** (GitHub Flavored Markdown 0.29, its
  extensions). Markdown is a general text format, not a program's, so it
  is Meno's own, as Python, JSON and XML are, not a plugin's. Lezer's
  Markdown parser (`@lezer/markdown`, MIT) reads it; what each part means
  is as the two specifications say, and Meno sets it.
- **In the column, and on its sheet**: formatted in both, from one layout
  - in the column as wide as the column, on the page as wide as a
  sheet's 80 letters, its first rows, its type as much smaller as the
  sheet's monospaced type is. An icon shows them too, made small.
- **Set as GitHub sets Markdown, in Meno's type**: IBM Plex Sans, its
  code in IBM Plex Mono, on the palette the column's look is taken from.
  - Headings in six sizes, the first two ruled under.
  - Strong, emphasised and struck-through words, inline code on its
    ground.
  - Lists, ordered from their first number or marked by a disc - a ring
    deeper in, then a square - tight or loose as CommonMark says; a
    task's box, checked or not.
  - Block quotes in grey beside a bar.
  - Code blocks on their ground, coloured as a text is where their
    language is known: Python, JSON and XML by Lezer's grammars, a
    calculation's input by its plugin's, by the language named as a
    file's name ends (`inp`, `gjf`). On a sheet they are black, as a
    sheet's lines are.
  - Tables, their columns as wide as their cells, aligned as the
    delimiter row says, shared out where too wide, every other row on a
    ground.
  - Rules.
- **Lines broken as a reader expects**: after a word and its spaces, and
  between Chinese and Japanese letters, never before a closing mark nor
  after an opening one; a word wider than the column between its
  letters; a line's end in a paragraph a space, a break where it says.
- **Links**: a click follows one - to a heading of the text's, by the
  name GitHub gives it (`#results`), the text moving there; to the web or
  to mail (`http`, `https`, `mailto`), opened by the system, as a PDF's
  are; any other, not followed. Over a link, the system's hand.
- **Nothing a text names is fetched**: an image is its description in a
  frame. Meno reaches no network for a text, and the text's place on the
  disk is not kept (*Texts*, WORKSPACE.md), so a picture beside it could
  not be found again.
- **HTML is shown as it is written**, grey, never drawn as HTML; its
  comments are left out, and `<br>` breaks the line.
- **Read**: the wheel moves it; a drag selects its words, two clicks a
  word, three a paragraph; Cmd/Ctrl+C copies them as they read -
  paragraphs and list items on lines of their own, a table's cells apart
  by tabs - and Cmd/Ctrl+A selects it all. The arrows, Page Up and Down
  and the space bar, Home and End move it.
- **Written in its source**: *Source*, at the column's top (the brackets),
  shows the text as it is written, typed as any text is, IME and all, its
  marks coloured - headings, code, addresses, and its marks grey - and
  its code in Python, JSON or XML as those are. Pressed again, it is read
  formatted. Either way, what was at the top stays there, as near as the
  two allow.

## Movement

All movement follows Meno's rule: nothing jumps, and linked parts move
together, in short eased transitions.

- **Depth.** A page or a picture taken up rises toward the viewer, a
  little larger and with a soft shadow under it, and settles as it is
  let go. The same perspective is used for a moment as for a molecule
  rising out of the drawing (#174): only what rises is seen in
  perspective, and the page is not.
- **Turning a page** on the stack: the top page lifts at its corner,
  goes up and over, and lies under the others; or comes back.
- **Spreading and gathering**: the pages lift off one after another and
  go to their places in a short wave; gathered, they come back the same
  way. Pages put back in their rows, or moved by an undo, glide there.
- **Into the column and back**: a page or a sheet rises from where it
  lies and goes into the column as it opens, growing to the column's
  width; closed, it goes back down to its place.
- **Coming up into view**: zoomed into, a page's content fades up from
  the soft picture to the sharp one, tile by tile, never flickering.

## How it is built

### PDFium

- **PDFium** (the PDFium Authors, BSD-3-Clause, with some parts under
  Apache-2.0) reads and draws the PDF. It is part of Meno, not a plugin:
  it needs no Python and nothing fetched while Meno runs.
- **The build**: PDFium's own, as Chrome builds it, from the prebuilt
  libraries of `bblanchon/pdfium-binaries` (their build scripts MIT).
  It is built without JavaScript and without XFA forms
  (`pdf_enable_v8 = false`, `pdf_enable_xfa = false`). The release and
  each file's SHA-256 are pinned in Meno, and fetched and checked when
  Meno is built, never kept in the repository - as uv and pixi are
  pinned.
- **What PDFium carries within itself**: the fourteen standard fonts a
  PDF may name without carrying them, and the CMaps for Chinese,
  Japanese and Korean text. Nothing besides is bundled for it. A font a
  PDF names but does not carry is found among the system's, as Chrome
  finds it, and after them among Meno's own (IBM Plex Sans, Mono and
  Sans JP).
- **Reached from Rust** through `pdfium-render` (MIT or Apache-2.0).
- **What Meno asks of it**: a part of a page drawn at a scale, its text
  with where each letter is, links, and what a page is made of - paths,
  text and pictures - which stage 5 reads. Meno searches the text itself.

### Where it runs

- **In a process of its own**, as calculations' jobs are (`Meno --job`).
  Meno starts itself as a PDF reader, `Meno --pdf`, when a workspace
  first shows a PDF, and talks to it by its standard input and output.
- **A PDF that breaks PDFium breaks that process only.** The PDF says
  so on the page and in the column, with *Open again*; Meno, and the
  work not yet saved, go on. Chrome keeps PDFium apart for the same
  reason.
- **It answers one request at a time**, on one thread, in the order they
  come. Parts to draw wait in the window, nearest first, three at most
  sent at a time; one no longer wanted before it is sent is dropped.
- **Pictures come back as PNGs**, previews, tiles and figures alike:
  PDFium's pixels, in the order a WebGL texture takes them
  (`FPDF_REVERSE_BYTE_ORDER`), packed by the reader, a page being mostly
  white. They go to the window as bytes, not as text (Tauri's binary
  response), and are unpacked off its main thread.

### One canvas

- **The column is drawn on the canvas**: one WebGL canvas spans the
  workspace and the column, each with a view of its own (a camera, and
  the part of the canvas it draws in). A page or a text can then go from
  one to the other as one moving thing. The column's header - its names,
  its buttons - stays as it is, in HTML, in Meno's look.
- **A page is a sheet with textures**, its tiles. A text's sheet on the
  page is set with the type the drawing's labels are set with (troika);
  in the column, its lines are pictures the system's type draws, line by
  line as they come into view.
- **Selection, search and the caret** are drawn over them, from where
  PDFium says the letters are, or where the text's type sets them.
- **A double-click on the canvas shuts the column** (the maintainer,
  2026-10-10): on empty space, with a PDF or a text open there, the work
  comes back to the canvas; what was read goes back down to its place, as
  when the column is hidden. The next double-click opens Quick Add.
- **A picture is a texture on a sheet**. A figure at 600 dpi - a whole
  A4 page is about 5000 × 7000 pixels - fits within what the graphics
  card takes.
- **In the document**, as texts are:
  - `pdfs`: each PDF's name, the SHA-256 of its file, its place on the
    page, which page is on top or whether its pages are spread, and
    where the column was left;
  - `pictures`: each picture's file, place, size, turn and source;
  - each text, as now, with its place on the page.

  Undo, saving, the clipboard's record and the workspace file all carry
  them.

### Size

- **PDFium's library**: 7.3 MB on a Mac (Apple silicon), about 3.4 MB
  compressed (2.5 MB as the Windows installer compresses). For Windows
  and Linux, the prebuilt archives are 3.9 and 3.8 MB.
- **What it adds**: about 3 MB to each system's download (the Mac's
  disk image was 8.1 MB for 0.1.8, the Windows installer 6.6 MB), and
  about 7 MB once installed.
- **The text colouring** (Lezer): some tens of kilobytes for each
  grammar.

### Licences

Checked on 2026-10-09 against the licences shipped with the prebuilt
PDFium (chromium/8086). All allow Meno to carry PDFium within an
Apache-2.0 app:

| Part | Licence |
| --- | --- |
| PDFium | BSD-3-Clause, some files Apache-2.0 |
| FreeType (fonts) | The FreeType Project License |
| HarfBuzz (text shaping) | "Old MIT" |
| ICU (Unicode) | Unicode License v3 |
| libjpeg-turbo | IJG License, BSD-3-Clause, zlib |
| OpenJPEG (JPEG 2000) | BSD-2-Clause |
| libpng | PNG Reference Library License v2 |
| zlib | zlib License |
| Little CMS (colour) | MIT |
| Abseil | Apache-2.0 |
| Anti-Grain Geometry 2.3 | its own permissive notice |
| dragonbox, LLVM's libc | Apache-2.0 with LLVM Exceptions (dragonbox also Boost) |
| fast_float, simdutf | MIT |
| pdfium-binaries' build scripts | MIT |
| pdfium-render (Rust) | MIT or Apache-2.0 |

- **No copyleft code is in the library.** GPL text appears only in
  ICU's notice, for build scripts (Autoconf's) that are not part of it,
  under Autoconf's exception.
- **What Meno must do**:
  - ship every one of these licences, in `src-tauri/resources/licenses/`
    (`PDFium-*.txt`, and pdfium-render's in `pdfium-render-MIT.txt`);
  - credit them in the README;
  - and, as two of them ask of a program shipped without its source,
    say in its documentation that it is "based in part on the work of
    the Independent JPEG Group" and that "portions of this software are
    copyright © The FreeType Project (www.freetype.org). All rights
    reserved."

### Safety

A PDF is a file from anywhere, and is treated as such.

- **Nothing in a PDF runs.** PDFium is built without JavaScript and XFA,
  and Meno runs no form, action or launch a PDF holds.
- **Nothing a PDF names is fetched.** Its fonts and images are its own,
  read from the file, or the system's; there is no remote content. A
  web link opens in the system's browser only when it is ⌘-clicked
  (Ctrl+clicked on Windows).
- **PDFium runs apart** (*Where it runs*, above), so a PDF made to break
  it takes nothing else with it.
- **Its text and pictures go no further than the page, the column and
  the clipboard**, as the chemist moves them.

### Platforms

- **The same PDFium on every system**: the library for macOS (Apple
  silicon) and Windows (x64), from the same release; Linux's (x64) is
  pinned and fetched by the same script, for a Linux build Meno does not
  make yet.
- **Carried in the app**:
  - on a Mac, inside the app, signed with it;
  - on Windows, beside Meno's program, with a line in the installer's
    hook for when it is renamed or goes (RELEASING.md);
  - on Linux, nowhere yet: there is no Linux build.

- **On a Mac, signed as Meno is - ad hoc, with the hardened runtime -
  the app cannot load PDFium's library**: macOS's library validation
  takes a library only from the app's own team, and an ad hoc signature
  has none (the trial, below). Decided by the maintainer (2026-10-09):
  until Meno is signed with a Developer ID, which is to come soon, the
  app carries the entitlement `com.apple.security.cs.disable-library-validation`.
  Signed with a Developer ID, the app and the library are the same
  team's, and the entitlement goes.

## The trial (step 0), 2026-10-09

Built on `agent/pdf-trial`, kept off main:
- `Meno --pdf`, the reader;
- the PDF fetched and checked by `scripts/fetch-pdfium.mjs`;
- one canvas with a workspace view and a column view;
- a page's stack sharpening in tiles as it is zoomed into;
- a page rising into the column;
- a search.

It was tried on PDFs made for it - two columns of text, a figure drawn
as paths, a picture, a word broken by a hyphen at a line's end, and a
page of 30000 paths - on the Mac and on Windows (release builds), and on
Windows on a journal's article as published (8 pages, 3.2 MB: text,
figures, structures and pictures).

| | Mac (Apple M4, 2x) | Windows (WebView2, 100 %) |
| --- | --- | --- |
| Opened | 19 ms in PDFium, 32 ms all told | 44 ms, 95 ms |
| First preview | 2.7 ms, 4 ms | 2.4 ms, 10 ms |
| A 512-pixel tile | 1.7 ms, 9 ms | 1.0 ms, 15 ms |
| A page in the column | 5.5 ms, 26 ms (832 × 1178) | 2.1 ms, 33 ms (416 × 589) |
| Bytes to the window | 127-261 MB/s | 42-66 MB/s |
| Frames while zooming | 17 ms (95th: 18) | 10 ms (95th: 10) |
| Search, all pages | 22 ms | 18 ms |

The journal's article, on Windows: opened in 14 ms in PDFium (36 ms all
told); its first preview in 8.0 ms (14 ms); a tile in 3.2 ms (17 ms); a
page in the column in 10.6 ms (27 ms); searches in 0.5-19 ms; frames at
10 ms. PDFium takes three to five times as long on it as on the PDFs
made for the trial, and still far less than carrying the pictures.

What it showed:
- **PDFium draws far faster than anything waits for it**: a tile in a
  millisecond or two, a dense page of paths in 3.
- **The time is in carrying the pictures to the window**, most of all
  on Windows: a megabyte takes some 20-30 ms there, as WebView2 passes
  bytes. Step 1 carries them smaller - compressed without loss in the
  reader, a page being mostly white, and unpacked off the main thread -
  or through WebView2's shared buffers, whichever measures better on
  Windows; a tile is to reach the window within 5 ms of PDFium.
- **Zoomed into, the page is sharp a quarter of a second after the
  zoom stops** (on Windows: soft at 0.38 s, the first sharp tiles at
  0.52 s, all of them at 0.63 s). Step 1 asks for the tiles sooner:
  when the zoom slows, at the level it is going to.
- **Meno searches the page's text itself.** PDFium gives a hyphen at a
  line's end as U+0002 and the line's end as `\r\n`; Meno reads a line's
  end as a space and a broken word whole (the article's *computa-tional*
  among them), each letter pointing back to its box - found and marked on
  both lines.
- **One canvas draws both views** at the display's own rate, a page
  rising from one into the other.
- **The Mac app needs the entitlement** above.
- **The reader stays** once started, until Meno closes, ready for the
  next PDF.
- **The app is 8.8 MB larger installed**: 28.4 MB against 19.6 MB.

## As built

### Step 1: a PDF on the page (2026-10-09)

Built:
- **Putting a PDF on the page.**
  - A PDF opened (*Open…*) goes onto the page of the workspace in front, at the middle of the view, or onto a canvas of its own where none is in front.
  - A PDF dropped goes where it is dropped.
  - The view eases to take it in where it was not all in view.
- **Holding and saving it.**
  - It is held in Meno's cache by its SHA-256.
  - It is refused, and the reason said, where it is larger than 1 GiB, the most a workspace's file keeps of any one file (*it is too large*); where it does not begin as a PDF does, `%PDF-` in its first kilobyte (*it is not a PDF*); or where PDFium cannot open it: one that asks for a password, Meno giving none (*it is locked with a password*), one locked another way (*it is locked in a way Meno cannot open*), one damaged past mending - cut short, or no PDF inside (*it is damaged, or is not a PDF*) - or, where PDFium gives another reason, *Meno could not open it*, the reason to the log. A PDF whose cross-reference table is wrong, but whose objects are all there, is mended as it is opened and read. One refused is not kept in Meno's cache. Opened (*Open…*, or from outside Meno), a notice at the window's top says so, after the file's name; dropped or pasted, the canvas's alert names each refused and says why, and the rest dropped with it are put down. Kept in a workspace's file and refused as the workspace opens - or not held whole by the file - a notice in the window's corner names it and says why: drawn, it would be blank.
  - It is kept in the workspace's file, and is held again when the file is opened.
  - Its place, the page on top and whether it is spread are saved with it.
- **The stack.**
  - Its name lies under it.
  - It comes up sharp as it is zoomed into.
  - It is moved by a drag, and deleted by Delete or its menu, each as one step to undo.
- **Its pages turned, spread and gathered**, with depth. How it works: ARCHITECTURE.md, *PDFs*.

Measured on the Mac (Apple M4) on the reader, for the PDFs made for the trial:
- **Pictures sent as PNGs are 3.6-5 times smaller.** A 512-pixel tile is 0.2-0.29 MB in place of 1.05 MB, and a page at the column's width is 1.0 MB in place of 4.4 MB.
- **Packing costs little**: 0.3-1.4 ms more in the reader.

The picture is unpacked off the main thread. Windows, where carrying bytes took the time, is to be measured again.

Decided while building it, for the maintainer to confirm:
- **Turning a page: its folded corner, the arrow keys, or its menu.**
  - As the stack is hovered, its top page's lower corners fold: the right one turns to the next page, the left one to the page before.
  - Over it, the arrow keys and Page Up and Page Down turn too, and its menu has *Next page* and *Previous page*.
  - The wheel and two fingers stay the canvas's zoom and pan. Over a stack they would take the zoom away from whoever is reading the page at hand; the first draft had them turn pages.
- **Its menu:** *Next page*, *Previous page*, *Spread pages* (or *Gather pages*), and *Delete PDF*.
- **Printed size.** A PDF lies on the page at the size it is printed, at the workspace's point: a bond is as many points as the workspace's drawing style prints it - 14.4 in ACS 1996's - and a change of style keeps the PDF as large in print (docs/WORKSPACE.md, *Drawing style*).
- **Spread pages** lie in rows of four, the first where the stack's top page lay.
- **PDFs lie under the drawing** for now. Their place among the other things, by when they were put there, comes with pictures (step 4).
- **The cache is never cleared yet.** A PDF stays in Meno's cache once held, so that a workspace opened later finds it, and the cache grows with the PDFs opened.

Not yet, and where it comes:
- **Selecting PDFs with others**: by a click, a box or a lasso, and copying, cutting and pasting them. Built 2026-10-11 (*With the rest of the page*, below).
- **Pasting a PDF copied in the Finder or Explorer.** Built 2026-10-11 (*With the rest of the page*, below).
- **A double-click opening it in the column**: came in step 2.

### Step 2: a PDF read in the column (2026-10-09)

Built:
- **The column lies over the canvas.** The canvas spans the window, and the column of texts lies over its right side; its header stays in HTML, and what it shows of a PDF is drawn by the canvas under it, in a view of its own (`PdfColumn.tsx`). As the column opens, shuts or is dragged wider:
  - the view moves by half as much, eased, so that what was in the middle of what could be seen stays there;
  - fitting, pasting and bringing a PDF into view use the part it does not cover;
  - what is on the page in HTML (a step's card, words being written) is cut off where the column begins.
  - that HTML is laid in a layer clipped to the canvas, not hidden past it (`overflow: clip`): no box that can be scrolled, so a focus or a selection never moves what it holds off where the page has it. A frames chip's card opened past the canvas's foot stays where it hangs, below its molecule, and runs past the edge (2026-10-29).
- **Reading a PDF there.** A double-click on its stack, or *Read* in its menu, opens it in the column. Its page rises from the stack, growing to the column's width as the column opens. Closed by its ×, or the column hidden, the page lifts from where it is and goes back down to the stack.
  - A PDF is read in three quarters of the canvas, a page being for reading; a text keeps the column's narrower width. Each keeps its own width once dragged, up to 85 % of the canvas.
  - The column hidden on a PDF and shown again (*Show texts*) opens on it, its page rising again.
  - As the column opens on a PDF, the view eases with it so that the PDF is all in what is left in view, in its middle: made smaller where it would not be, never larger, and left as it is where it already would be (`viewBesideColumn`).
  - Its name is among the texts' along the column's top. Its × closes the column's view of it; the PDF stays on the page.
  - Several can be read there, each kept where it was read; closing the one shown shows the next.
- **Its pages** lie one under another, as wide as the column.
  - The wheel and two fingers move them. A notch is eased, fingers are followed as they go.
  - A pinch, or Ctrl or ⌘ with the wheel, makes them larger or smaller about the pointer, from a quarter of the column's width to eight times it.
  - With the pointer over them, the arrow keys, Page Up and Page Down, Home and End move them, and ← and → go a page.
- **Joined to its stack.**
  - The page most in view is the page on top of the stack. The column moves it quietly, with no turn on the stack.
  - A page turned on the stack (its corner, the arrow keys, its menu, an undo) is gone to in the column.
  - A page under the pointer in the column lights the stack, as the stack is lit when hovered on the page.
- **The page number** (*3 / 12*) shows at the column's foot as it moves, and while the pointer is over it. A click asks for a page to go to; a double-click makes the pages as wide as the column again.
- **Links.**
  - A link is followed only by ⌘-click on a Mac, Ctrl+click on Windows, as the system's own are (the maintainer, 2026-10-18: a link opened at a plain click was a surprise). A plain click does what it does anywhere else on the page: the caret, a word, a box. Over a link, a hint says what ⌘-click does - *⌘-click to open* the address, *⌘-click to go to page 3* - and the pointer is the system's hand only while ⌘ (Ctrl) is held (`followsLink`, `linkHint`).
  - A link to a place in the PDF goes there: in the column where the column shows the PDF, else on the stack, its page turned.
  - Back returns to where it was: ⌘[ on a Mac, Alt+← on Windows, or the mouse's back button.
  - A link to a web page opens in the system's browser.
  - PDFium reads each page's links when the pointer first comes over it (`pdf_links`).
- **Saved** with the workspace: where each PDF read in the column is read (`reading`: pages down, and how large), and which one the column showed (`pdfShown`).
- **A PDF comes as an icon** (*Show full size* in its menu, and *Minimize to an icon* back), shrinking to it about its middle and growing back, its name going under its middle.
  - Its name is set in the drawing's type at its labels' size (10 points in ACS 1996's style), zoomed with the drawing; the icon is five times as tall (`ICON_TO_NAME`), as a file's icon is to its name on a desktop - 64 to 12 points in the Finder, 48 to 12 pixels in Explorer: three and a half bonds.
  - PDFs put down where others lie are moved along to the right, clear of them and their names.
  - Double-clicked, it is read in the column, its page rising from the icon. Saved with the workspace (`icon`).
- **Its size checked**: a benzene ring printed as ACS 1996 prints it, 14.4-point bonds, in a PDF lies the size of one Meno draws beside it.

Decided while building it, for the maintainer to confirm:
- **Three quarters of the canvas for a PDF** (the maintainer asked for a wider column for reading PDFs, about three quarters), the stack brought beside it into the quarter left (the maintainer asked for that too).
- **The column over the canvas, not beside it.** The canvas no longer narrows as the column opens. One canvas then draws the page and the column, and a page goes from one to the other as one thing (*One canvas*). The view follows the column instead.
- **The page shown** is the one most in view. After a link, *Go to page* or Back, it is the page gone to, until the column is moved by hand: a place low on a page, or the last pages all in view at the end, would otherwise show the page after it.
- **Reading is not a step to undo**, as where a text is scrolled to is not. The page the column brings on top of the stack is not one either. Turns made on the stack still are, and undoing them goes back past the column's pages, not through them.
- **Closing a PDF in the column** forgets where it was read; read again, it opens at its page on top.
- **Only the web's and mail's links open** (`http`, `https`, `mailto`). Any other a PDF holds (a file, a script, another program) is not followed.
- **Links on the stack** are followed by a ⌘-click (Ctrl+click on Windows) that does not move it; a plain click on one selects the PDF, as anywhere else on it. Over a link, a hint says what ⌘-click does; the pointer is the system's hand only while ⌘ (Ctrl) is held.
- **An icon at first** (the maintainer chose it, the full-size page being too large to put down among the drawing), its size set by its name's type (the maintainer suggested the labels' size). An icon gathers a PDF's pages first; it shows its top page's small picture alone (no tiles), and its corners do not turn. A full-size stack's name stays as small on the screen as before.
- **The look:** the column's pages on Meno's pale grey, 12-pixel margins and 10-pixel gaps; the page number a chip at the foot of the column.

Not yet, and where it comes:
- **Selecting and copying text, and search**: step 3.
- **The mouse's back button on a Mac** is not checked yet. It is heard where WebKit passes it on; ⌘[ is the Mac's own.

### Step 3: text and search (2026-10-09)

Built:
- **Each page's letters, as PDFium reads them** (`pdf_text`). Each comes with its box, in points from the page's top left as it is drawn; the letters PDFium adds itself (a space, a line's end) have none. `lib/pdf/text` keeps them a page at a time and works out:
  - the place between letters nearest the pointer;
  - a word, and a line;
  - the boxes that mark a selection;
  - the words to copy;
  - where a search finds something.
- **Selecting words**, in the column and on a stack or its pages spread.
  - In the column, a drag on words selects them at once; two clicks select a word, three a line. A selection can run across pages, and the column moves on as the pointer nears its top or foot.
  - On a stack at full size, a drag moves the view, as a drag on empty space does. Held still a moment on its words - as a box begins on empty space, the same ring spreading - the word under the press is selected, and the selection is drawn on from it as the pointer goes. A click selected nothing then (it selects the PDF since: *With the rest of the page*, below); two read the PDF in the column.
  - A press between two lines, or just past a line's end, counts as on the line beside it.
  - The words selected are marked in Meno's light, the same on the stack and in the column.
  - Cmd/Ctrl+C copies them, or *Copy* in the PDF's menu; a right-click in the column opens that menu too. They are copied as a PDF viewer copies them (2026-10-15): each of the page's lines on a line of its own, a blank line where the next stands further below than a line is tall (a paragraph's end, a heading set apart), a word broken at a line's end whole, and each page's on from the last's. Before, a line's end was copied as a space.
  - Selecting words lets the drawing's selection go. Esc, or a click elsewhere, lets the words go.
- **Searching**, with Cmd/Ctrl+F or *Find in PDF…* in the right-click menu on empty space.
  - A field opens over the top of the column, holding the words selected, if any.
  - *This PDF* or *All PDFs* choose where to look, and the count shows as *3 of 12*.
  - Enter goes to the next place and Shift+Enter to the one before. Esc closes the field.
  - Every place found is marked on the pages, in the column and on the stacks; the one gone to is marked more strongly.
  - With *All PDFs*, the places are listed under each PDF's name, with the words round each. A click goes there, showing that PDF.
- **Words taken out.** A selection pressed and dragged comes off the page as Meno's own words, the PDF left as it is - a morph, word by word.
  - Each of Meno's words first lies over the word it was in the PDF, as wide and as tall, unseen. One after another, outward from where they were pressed, each is seen as it rises toward the viewer - a little larger, its shadow falling under it - and goes to its place in Meno's lines, set as the words will be on the page. They follow the pointer, held where it pressed them; over the canvas they are as large as the canvas shows the page.
  - Let go on the canvas, they settle onto it and are words on the page there, in the drawing's type, as one step. Taken from more than one line, they are as wide as their lines were (at the size the page is printed: a point is a fourteenth and a half of a bond), broken into lines at it (EDITOR-2D.md, *Text*), and lie as those lines did: spread to both edges, to the left, to the right or about the middle.
  - Let go anywhere else, or on the PDF they came from, each word goes back down onto the word it was.
  - The words keep where they came from. *Show in the PDF*, in their menu, reads that PDF in the column, goes there, and marks the words for a moment.
- **Moving a stack.** At full size, a drag on it moves the view, as on empty space. Held still a moment on its rim - by its pages' edges, on the pages under the top one, or on its name - the PDF is taken hold of and selected alone: the selection's shade spreads over it from the pointer, as over a structure held, and the drag then moves it, as one step. An icon is moved by a drag at once; held still a moment instead, it is taken hold of and selected alone in the same way, as every other thing on the page is.

Decided while building it, for the maintainer to confirm:
- **On a stack, words are selected by a long press** (the maintainer), as a box is begun on empty space, and only where they can be read: a point at least 0.6 pixels on the screen. In the column, a drag selects at once (the maintainer).
- **A full-size stack is moved by a long press on its rim** (the maintainer), and a drag on it moves the view. The rim reaches 16 pixels in from a page's edge on the screen. Where its words are too small to be selected, a long press anywhere on it takes hold of it, there being nothing else for a hold to do there.
- **How words taken out lie is read from the lines about them too**: the paragraph they come from and those before and after it in the same column, of the same size and as far apart. Most reaching both edges is spread, most starting at the left is to the left, and so on; a line ending in a word broken by PDFium's hyphen is not counted at its right. From two lines alone, a paragraph's last line short, they lie to the left.
- **Copying and searching treat line ends and hyphens alike.** A line's end reads as a space. A word PDFium marks as broken at a line's end (U+0002) reads whole, and a search with its hyphen finds it too. A hyphen PDFium left at a line's end is a word's own, as in Diels-Alder, and is kept.
- **The search field lies over the top of what is read**, as a browser's does, so that the pages stay where the canvas draws them.
- **A selection of several pages copies as one run of words**, a page's end read as a space.
- **Words carried out come off as Meno's own, in WebGL** (the maintainer: the PDF's words stay as they are, and Meno's peel up from the pointer, fading in, close to a morph). They are drawn on the canvas in its last pass, over the column too, each word a text of its own; let go on the canvas, the words on the page take their place once they have settled, the two drawn together a moment.

Not yet, and where it comes:
- **A figure cut out by a box**: step 4.

### Step 4a: pictures on the page (2026-10-09)

Step 4 comes in two parts: pictures on the page first (4a), then figures cut out of a PDF (4b).

- **Where pictures come from.**
  - A PNG or a JPEG opened (Open offers them) or dropped on the canvas: on the page of the workspace in front, where it is looked at, or where it was dropped; on a canvas of its own where none is in front.
  - A picture pasted, such as a screenshot, where nothing on the clipboard reads as a structure. On Windows, a bitmap (CF_DIB), which is what a screenshot puts there, is taken too.
  - Several at once lie in a row, and all are put down clear of the pictures and PDFs already there. The view eases to them where they are not all in view, and they come selected, to be moved straight on.
- **How large.** A picture comes at the size it would be printed: at the resolution its file gives (a PNG's pHYs, a JPEG's JFIF density), or a screen's 96 to the inch where it gives none or 72. It is never wider or taller than a page's text (6.5 inches). A photograph turned by its camera comes turned.
- **Drawn** under the drawing and over the PDFs, each one put there later over the one before. Until it is decoded it shows as a light grey sheet. Lit round while the pointer is on it.
- **Handled as a structure is.**
  - A drag on it moves the view, as on empty space.
  - Held still a moment, it is taken hold of: the selection's shade spreads over it from the pointer, and the drag then moves it.
  - A click selects it alone. Ctrl/Cmd and a click adds it to the selection or takes it out. A box or a lasso takes those whose middle it holds, and *Select all* takes them all.
  - Selected, its frame shows, with a handle at each corner. A corner dragged makes it larger or smaller, keeping its proportions, the opposite corner where it was (Meno's own diagonal pointer). A drag on it moves the whole selection, and the selection's handle turns it with the rest, in steps of 15 degrees or freely after a pause.
  - Deleted, copied, cut and pasted with the rest of the selection, each as one step to undo. Delete over one deletes it.
  - Its right-click menu has *Copy picture* (a PNG for other programs, and Meno's record for Meno) and *Delete picture*.
- **Saved** in the workspace: its image kept as it is (`image/png` or `image/jpeg`, stored, by its SHA-256), and `pictures` in `workspace.json` listing each one's place, size, turn, size in pixels and name. A workspace's file opened holds its pictures, each read from it when first drawn.
- **Fitting the view (Cmd/Ctrl+1) takes in the pictures** with everything else.

Decided while building it, for the maintainer to confirm:
- **A picture is moved as a full-size PDF is** (the maintainer's rule for PDFs): a drag on it moves the view, and a long press takes hold of it. A click selects it.
- **Pictures lie under the drawing, over the PDFs.** Among themselves they lie in the order they were put there. A structure drawn over a picture is never hidden by it; their order among structures is left for later.
- **No name is shown under a picture.** The picture shows itself; its name is kept, for *Copy picture* and the workspace.
- **One picture copied alone goes to other programs as itself.** A selection with structures copies the drawing's picture as before, without the pictures (*Not yet*, below: pictures in Export and *Copy picture* of the drawing).
- **Pictures copied inside Meno are carried by their SHA-256.** A paste in any tab of the same Meno finds them; one copied in another Meno running is left out.

Not yet, and where it comes:
- **A figure cut out of a PDF by a box**, with *Show in the PDF*: built in step 4b, below.
- **A JPEG on the clipboard**, as some browsers copy a photograph: built 2026-10-11 (*With the rest of the page*, below).
- **Reading a picture as a structure**: stage 5.

### Step 4b: figures cut out of a PDF (2026-10-09)

Built:
- **Where a page's figures lie** (`pdf_objects`, `lib/pdf/figures`). PDFium lists what a page is made of - its words, paths, pictures, shadings and forms - each with its box, in points from the page's top left as it is drawn. From them:
  - A figure is where pictures and paths lie within 8 points of one another. It is at least 24 points one way and 4 the other (a chain drawn flat is a figure, a word's underline none), or it holds a picture. A smaller one is a figure where it is a small structure: at least 8 points one way and 4 the other, of three lines or more, its own labels taking it to 18 points - an acetate or a cisplatin drawn small - and not set in a line of running words, as an icon or an arrow in a sentence is. One line with an atom's label at an end of it, along it - CH3NH3+ - is one too, however thin: the label read as a structure's labels are (NH3+, OMe, CH3 - never a number nor a word), the line a bond and a half long at most (a bond drawn as long as its label's letters are tall and half again). A word's underline, its word over it, is none, nor a rule with a word or a number at its end ("Date ____", "____ 12", a leader).
  - A rule (at most 1.5 points thick and at least 150 long) is no part of one, nor is anything over most of the page, such as its frame, nor a filled shape across nearly all of the page's width - a panel's ground, behind an abstract's words and its figure.
  - Nor is a page scanned after all: a figure over most of the page, most of it picture, with the page's words within it - its picture in strips further apart than a scan is told by, the words read over them widening it (2026-10-14). A figure drawn with lines as large, on a page cut close round it - a scheme exported as a PDF of its own - is still one.
  - A reaction scheme is one figure (2026-10-13). An arrow is a long, thin part holding a straight line at least 25 points long, level or upright; it joins what lies beyond its ends, level with it, within 36 points. A "+" set alone (`pdf_objects` tells it from other words) joins what lies either side of it, level with it. A "+" drawn with lines - one filled cross, or a stroke each way - square, at least 2.5 points across and at most 14, by no word (a charge drawn with lines is as small, but by its label), joins them as a written one does; and a "+" written is never a line beside a structure (*Structures picked from a PDF*).
  - Words over a figure or within 6 points of it, each narrower than six tenths of it, are its labels, and its box takes them in. A short word under a figure or over it, such as a compound's number, can be up to 14 points off. The words over and under an arrow, its conditions, can be up to 24 points off, a line or two of them. A counter-ion - a short word with its charge drawn by it, a "+" or "-" in a ring or set high, as Na+ or Br- beside a structure - can be up to 30 points off, or as far from the ion before it in a row of them (three K+); a short word with no charge by it is not taken so far. Its caption is not a label, nor is a column's line beside it: no line wider than three tenths of the page (and than 150 points) is ever one.
  - A page's figures are worked out once, when its words are first wanted: as it comes into the column, or onto the screen at a size its words can be read.
- **A box, in the column.** A press in a figure, or where no word is near, begins a box.
  - Let go where it was pressed, in a figure, it is that figure's box, labels and all - on a link too; with ⌘ (Ctrl) held, the link is followed instead.
  - Dragged, the box is drawn by hand from the press to the pointer, on that page. The column moves on as the pointer nears its top or foot.
  - Two clicks and three still select a word and a line.
- **A box, on a stack at full size.** A drag there moves the view, so a box begins with a long press - in a figure, or where no word is near - with the same ring spreading as words are selected with. In a figure, the figure's box comes at once; dragged on, a box is drawn by hand.
- **The box** is outlined, and shaded in Meno's light, on the stack and in the column alike. A box smaller than 6 points either way is let go. Esc, a click elsewhere, or anything else selected lets it go.
- **Carried out.** The box pressed and dragged lifts off the page toward the viewer: a white sheet, a soft shadow falling under it, its picture coming into it as soon as it has been drawn. Held where it was pressed, it follows the pointer; over the canvas it is as large as the canvas shows the page. It is drawn in the column's last pass, as words carried out are, over the column too.
  - Let go on the canvas, it settles there and is a picture on the page, just where it was let go, selected, as one step.
  - Let go anywhere else, it goes back down onto the box.
  - Pressed and let go where it was - a click on it - the box is let go, as words selected are (2026-10-14: kept, a page boxed whole held every click on it).
- **Its menu.** With a box on it, the PDF's right-click menu starts with *Put on the page* - beside what is in view, clear of what is there, as a picture opened is - and *Copy picture*.
- **Drawn from the PDF itself**, by PDFium, at the resolution Settings, *Files*, sets for copied pictures (600 dpi by default), lowered where the picture would come to more than 48 million pixels. On the page, it is the size the figure is printed.
- **Where it came from.** The picture is named after the PDF and its page (*figures, page 2.png*), and keeps the PDF's SHA-256, the page and the box (`from` in `workspace.json`'s `pictures`, and in what a copy carries). *Show in the PDF*, in its menu, reads that PDF in the column, goes to the box and marks it for a moment.

Decided while building it, for the maintainer to confirm:
- **In the column, a click in a figure takes it whole; a drag draws a box by hand.** The click is the quick way for the common case; the drag stays for part of a figure, or for one Meno does not see as one.
- **On a stack, a box begins with a long press**, as words are selected there: a drag on a full-size stack moves the view (the maintainer).
- **A figure's caption is not part of it.** It is words, to be taken out as words.
- **The box lifts as a white sheet**, its picture fading in once drawn: a picture of the screen's resolution for the flight, drawn in a moment, and the one at the copy resolution drawn beside it for the page.
- **A picture carried out lies just where it was let go**, over another picture if it was let go there; one opened or put on the page is put clear of the rest.

Not yet, and where it comes:
- **A scanned page**: it is one picture over most of the page - or several, strips or tiles that cover it together - so no figure is found on it. A box drawn by hand takes part of it.
- **Reading a figure as a structure**: stage 5.

### Step 5: texts drawn by Meno (2026-10-10, under way)

Step 5 comes in parts: the trial of typing alone, shown first; the column's text drawn on the canvas, typed through Meno's field (5a); texts' sheets on the page (5b); the movement between the page and the column; colouring; and words on the page typed in place.

**The trial of typing** (its work goes on in 5a, with the fixes the checks on a Mac and on Windows asked for):
- **A text in the column drawn by Meno** with WebGL: each line a picture drawn by the system's own type - Meno's monospaced first, any letter it lacks from the system's - only the lines in view, numbered; the caret, what is selected and what the IME is composing drawn over them. As sharp as the textarea it took the place of, at 100% and at 175%; a log of 5000 lines scrolls as a short file does.
- **Typing through a field kept out of sight**, where the IME's candidates show at the caret, holding the caret's line and two either side, and what is selected, so that a word already written can be converted again.
  - **On a Mac** (WebKit), a textarea, lying just where the drawn lines lie. Composing, its clauses, committing, Escape, and converting again (the kana key twice) were tried with Apple's Japanese input in the built app.
  - **On Windows** (WebView2), an EditContext on the text's own element. A textarea there tells the page neither the IME's clauses - every clause was underlined alike - nor, converting again a word the caret is in, what it replaces; through the EditContext, the clause being converted is underlined thick, and the candidates follow it. Converting again from within a word, Microsoft's IME may first take away the part before the caret, then put the whole word in again at the caret: Meno takes that as one change of the word (lib/text/field `composingIn`, `withTakenAway`), undone at once, or none where it comes back as it was.
- **The keys are each system's** (lib/text/keys): on a Mac, Option by words, Command to the ends, Control's keys (A, E, B, F, P, N, H, D, K), Home, End and a page moving the view, with Option the caret; on Windows, Ctrl by words, Home and End a line's ends, Ctrl with Home or End the text's, Ctrl with an arrow up or down the view a line. A page on moves the view a page with the caret.
- **As quick to show as the textarea**: an EditContext's change comes in an event React does not know, and was drawn a frame late, 30-40 ms after the textarea's; it is now drawn in the frame after it, whatever event it came in (measured on Windows, 5-23 ms from the key to the frame).
- **What the IME composes kept in view**, its caret where it says, as typing keeps the caret in view: begun scrolled away from the caret, or at the end of a long line.

**5a: the column's text on the canvas.** A text read in the column is drawn by the workspace's one canvas, in the column's pass, as a PDF read there is (*One canvas*): on a white sheet of its own, cut off where the column is, sliding with it. Its HTML half over it is see-through: it takes the pointer - a click puts the caret, two clicks a word, three a line, a drag selects on - the wheel, and holds the field it is typed through. Each text keeps where it was read, and what was selected, while the workspace is open.

**5b: texts' sheets on the page.**
- **A text opened, dropped or made new** lies on the page as a sheet, made an icon, as well as being read in the column: where it was dropped, or beside what is in view, clear of what lies there, its name's room as a PDF's icon's. A calculation's output shown from its molecule, and a step's log, have no sheet: their molecule, or their step, is their body.
- **The sheet** shows the text's first lines as they would be printed - Meno's monospaced type at 9 points, a line every 12 - as wide as its longest line among them (at most 80 letters, at least 32), as tall as its first 40 lines (at least 3); its name lies under it, as a PDF's does. Seen from far off, its lines are grey strokes; nearer, its words come up over them, sharp at every zoom (troika). A line with a letter Meno's monospaced type lacks takes it from IBM Plex Sans JP.
- **Handled as a picture is**: a drag on it moves the view; held still, it is taken hold of, the selection's shade spreading from the pointer, and the drag moves it; a click selects it, Ctrl/Cmd and a click adds it or takes it out; a box or a lasso takes it by its middle; selected, it moves with the selection, and is deleted with it, each as one step. Delete over one deletes it. Fit takes sheets in.
- **An icon at first**, as a PDF is: the sheet made small about its middle, its longer side as long as a PDF's icon is tall (`ICON_HEIGHT`), its name under its middle at the drawing's labels' size. *Show full size* in its menu makes it the sheet; *Minimize to an icon* makes it small again - each one step, the sheet shrinking or growing about its middle as a PDF does (380 ms). An icon is moved, selected, read and deleted as the sheet is.
- **Read in the column** by two clicks, or *Read* in its right-click menu (*Read*, *Show full size* or *Minimize to an icon*, *Delete text*). A text's tab closed in the column leaves its sheet on the page, read there no longer; a text with no sheet goes, as before.
- **Saved** in the workspace: each text's sheet's place (`at`, its top left), whether it is an icon (`icon`) and whether it is read in the column (`reading`).

**Between the page and the column.**
- **Read**, by two clicks, *Read*, or as it is opened or made new, a text's lines rise from its sheet - from its icon, as small as the icon shows them - a white sheet with a soft shadow under it, and go into the column as it opens, growing to its width; the view eases so that the sheet lies beside the column, as a PDF's does. **Closed**, they go back down to the sheet as the column shuts. A tab gone to in the column, the column open already, comes as it did.
- **On the way they move in the page's type** - signed-distance glyphs, as large as the sheet shows them at one end and as the column's at the other - and once settled, the column's own lines, drawn in the system's type, take their place under them as they fade (140 ms). The flight sets off once its lines are laid out, a frame or two after, so as never to be blank.
- **A calculation's output shown from its molecule** (*Show <name>*) rises out of the molecule likewise, coming up as the column's lines made as small as the molecule, and goes back down into it as the column shuts. This holds for any output read as a molecule, opened from outside Meno or brought in by a step: its molecule is the one whose menu showed it. Shown again from another molecule read from the same file, it is that one's.
- **A step's log** (*Show log*) - what the program said as Meno ran it, read as no molecule - rises out of its step's card likewise, and goes back down into it.
- **A text without a sheet keeps what it is the text of** (`of`): its step, or its molecule. Saved in the workspace, a step by its id and a molecule by its place among the molecules, as they are numbered again when it opens. Its body gone - the step or the molecule deleted - it comes into the column and goes with it, as a text with no body does.

**Colouring** (`lib/text/colouring.ts`):
- **A Python script, JSON or XML**, told by its name (`.py`, `.json`, `.xml`), is coloured by Lezer's grammar for it: keywords, strings, numbers, comments, and what a definition names, a JSON object's keys, an XML element's names and attributes. It is parsed as far as the lines shown, 128 KB on at a time, and after an edit from where it changed, the rest of the tree kept: a long file opens and is typed in at once.
- **A calculation's input or output** is coloured by its plugin's grammar for its kind (`grammar` on a kind it knows - one it reads, writes, or only colours, told by its files' names and what its lines begin with: `kinds`, docs/PLUGINS.md): a grammar in Lezer's form, in a file in the plugin's folder, and the tone each of its parts is drawn in, by the name the grammar gives it.
  - The grammar is made into a parser as it is first wanted (`lib/text/grammars.ts`): tried in a worker within 5 s, then made on the page and kept. A grammar asking for code (`@external`, `@context`) is refused, so a plugin gives Meno data alone, and no text can hold the page up: Lezer's tokenizer reads each letter once and its parser never goes back.
  - A *value*, as a grammar's tones say, Meno colours as a number where it is one (a sign, a point, an exponent, a Fortran D's) and leaves as it is where it is not: 6-31G, def2-SVP.
  - Which grammar: a kind a plugin brings is told by what the text holds, as a file is (lib/io/kinds); a kind it writes, or knows besides, by the text's name and, where it says, what one of its first lines begins with (an ORCA input's `!`, `%` or `*`). Of two plugins that bring a kind, the first's grammar. A plugin not added colours nothing.
- **What does not read as its grammar says is marked**: underlined in Meno's attention colour (#cd4560, `COLORS.attention`) - a part read wrongly, or where something is missing, a letter's width. Not on the line the caret is on while the text is typed in, until it is left. An output's grammar takes any text, so nothing in an output is marked.
- **The grammars the plugins Meno carries bring**, each from the program's own words - its manual, or what it printed in runs made with Meno:
  - **ORCA's input** (the ORCA interface, `.inp`): simple keyword lines, blocks with their options and values and sub-blocks with their own `end`, `%maxcore` with its one value, the geometry and its atoms, a geometry read from a file, comments (ORCA's manual, *General Structure of the Input File* and *Input of Coordinates*). Marked: a block left open - at the next block or geometry - and a geometry with no closing `*`.
  - **Gaussian's input** (the Gaussian interface, `.gjf`, `.com`): Link 0 commands, the route section and its lines on, the title, the charge and multiplicity, the atoms (Cartesian or a Z-matrix), further sections, `--Link1--`, comments (Gaussian's *Input* page). Marked: no route section, and a molecule with no charge and multiplicity line.
  - **Gaussian's output** (the Gaussian interface, cclib, PySCF): *SCF Done:*, the energies with thermal corrections, *Optimization completed.*, *Converged?* as what a reader looks for; *Stationary point found.*, *Normal termination of Gaussian* and a criterion's *YES* as a run gone well; a line from *Warning* on as a warning - as Gaussian 16 printed them.
  - **ORCA's output** (cclib, PySCF): *FINAL SINGLE POINT ENERGY*, *SCF CONVERGED AFTER*, the geometry's convergence, the free energy and enthalpy, the frequencies; *THE OPTIMIZATION HAS CONVERGED* and *ORCA TERMINATED NORMALLY* as a run gone well - as ORCA 6.1 printed them; *ORCA finished by error termination* as an error (ORCA's manual, *Troubleshooting*).
  - **xTB's output** (cclib): *TOTAL ENERGY*, *TOTAL FREE ENERGY*, *HOMO-LUMO GAP*, *SCC energy*; *GEOMETRY OPTIMIZATION CONVERGED* and *normal termination of xtb*; *[WARNING]* lines as warnings; *ERROR STOP* and *Error termination* as errors - as xTB 6.7 printed them.
  - Rules of dashes, equals signs, stars or dots in outputs are grey.
- **Drawn in the column**: each line's parts in their tones, the line drawn whole in each colour and kept to its parts, so that its letters lie just where they would in one. What the IME is composing is drawn uncoloured, as it is. The colours are from the palette the column's look is taken from: red keywords, dark blue strings, blue numbers, options and keys, grey comments, purple definitions and what an output's reader looks for, green XML names and atoms, a deeper green for a run gone well, amber warnings, and Meno's attention colour (#cd4560) for errors.

**Words on the page typed in place** (`components/CaptionTyping2D.tsx`, `utils/wordsEditor.ts`), in place of the field shown over them in HTML:
- **Drawn by Meno as they will be kept**: set as the drawing sets its labels (a formula's counts low, a prefix in italics), in its typeface at its size, broken into lines as wide as they were made where they were given a width, laid as they will lie - so that what is written is what is kept, its lines broken as they will be. Lit round while they are written.
- **The caret, what is selected and what the IME composes** are drawn over them, in the drawing's units: the caret blinking, the selection in Meno's light, what is composed underlined clause by clause. Where each place lies comes from how the words are set (lib/chem/captions `captionPlaces`): before each letter, a formula's count no wider than it is set, each space between words its own place, and spaces at a line's ends hanging off it, a space apart.
- **Typed through the column's field** (TextEditor/typingField, now typing into any text Meno draws, `FieldHost`): an EditContext on Windows, a textarea on a Mac, laid with its caret on the drawn one, in the words' type at the size they are seen, so that the IME's candidates show at the caret.
  - **Drawn in the frame after a change**, as the column's text is: a change through the EditContext came in an event React does not know and was drawn a frame late - 10 ms at 100 Hz, 33 ms over Remote Desktop. Drawn at once, a conversion shows before the clauses the IME gives just after it: those it gave before are kept to what it has now (lib/text/field `clausesWithin`), where the conversion made it shorter.
  - **Checked on Windows** with Microsoft's IME (2026-10-10): composing, its clauses, Enter, Escape, converting again a word selected, the candidates at the caret after the view is zoomed or moved. Shown, the candidates stay where they are while the view moves under them, as the IME keeps them, and come to the caret again as they are next shown.
- **The keys**: an editor's, as in the column - up and down by the lines as they are set, Home and End (Command with the arrows on a Mac) to a set line's ends. Enter keeps the words, Shift+Enter starts another line, Escape lets them go; their own undo while they are written (a run of typing one step), one step for the document once kept.
- **The pointer**: a click among them puts the caret, two select a word, three a line, a drag selects on; the press is theirs - no box begun, no view moved. A press elsewhere keeps them, as before, and does what it does there.

Decided while building it, for the maintainer to confirm:
- **On a Mac the textarea, on Windows the EditContext**: each the one its system's webview takes the IME through best. WebKit has no EditContext.
- **A Mac's Home, End and Page keys move the view**, the caret staying, as in the Mac's own texts; with Option, a page moves the caret too. Tab moves the keys on, as the textarea did.
- **A sheet's size** (above), and its top left where it lies, so that a text growing at its end grows down.
- **A text's icon is its sheet made small**, not a page's shape: its longer side as long as a PDF's icon is tall, so that a few lines make a wide, low icon and a long log a tall one, as their sheets are.
- **Closing a text's tab leaves its sheet on the page**; deleting the sheet takes the text out of the workspace.
- **Colours in the column only.** A sheet on the page shows its lines as they would be printed, in black; a text rising from it takes its colours as the column's lines take its place.
- **A plugin's grammar, not patterns** (the maintainer, 2026-10-10, from a sketch of an ORCA input and a Gaussian output coloured part by part): a grammar is data that Meno makes into tables, which no text can hold up as a pattern could, and it reads an input's structure - so that what does not read as it should can be marked (the maintainer: very good). Regular expressions are still taken from no plugin (docs/FILE-IO.md, *Marks are data*).
- **Errors and landmarks only where a program's own words say them.** Gaussian's error line was found neither in Gaussian's own pages nor in what it printed here, so Gaussian's output marks its warnings, not its errors, for now.
- **The colours**, from the palette the column's look is taken from, as GitHub colours code, with purple for what an output's reader looks for and green for a run gone well (the maintainer agreed to both).
- **A letter no typeface of Meno's has - an emoji - is a white square on the page** (labels, words on the page, sheets, names), measured as one, the rest of its text drawn as ever. The window reaches no network, so the page has no typeface for it. The column draws it in the system's type, as it is. Drawing it on the page will come with a typeface fetched with leave (the maintainer, 2026-10-10: later): a purpose of its own asked about once, as Python's download is, the app fetching the typeface and keeping it, the window drawing from it - the window itself reaching nothing still (docs/ARCHITECTURE.md, *The network*). One letter at a time in one colour, as troika draws. Arabic and Hebrew letters are white squares on the page too: no typeface for them is planned (the maintainer, 2026-10-13); only emoji is to come with the typeface fetched with leave.
- **troika changed where it is installed** (`scripts/patch-troika.mjs`, after every install; the maintainer chose it, and no report to troika): it applied every GPOS lookup whatever its feature, so IBM Plex Sans JP's half-width and proportional forms closed up its ideographic comma and the letters after it lay over it (found on Windows); and it took each letter from the font the one before came from, so the Latin after a Japanese letter came from IBM Plex Sans JP, a degree sign a full em wide. Now, as a browser does: kerning and marks alone, and each letter from the first font that has it.
- **Lenient grammars.** A text written as its program reads it should never be marked: an ORCA block's `end` closes the block on the line it opens, and a sub-block's on its own line; a value block (`%maxcore`) is told by its name; Gaussian's route may go on over lines. What a grammar cannot tell without a program's list of keywords is not marked: a missing blank line after Gaussian's route section reads as more of the route.

Not yet, and where it comes:
- **Copying and pasting sheets**, and turning them with the selection's handle: built 2026-10-11 (*With the rest of the page*, below).
- **A step's card lies over the canvas**, in HTML, as all a workflow's cards do: a log's lines come out from under its step's card, and pass under the other cards on their way, as a PDF's page does.
- **More grammars**: a language Lezer has a grammar for is a line here and its few tens of kilobytes; Python, JSON and XML for now, as the specification lists.

### Markdown read formatted (2026-10-10)

Built (lane L9), as *Markdown*, above, says:
- **Read**: `lib/text/markdown.ts` reads a text into blocks and runs, each rule citing its section of CommonMark 0.31.2 or GFM 0.29; `TextEditor/markdownLayout.ts` lays them out at a width, in rows, each a line of words and what is drawn under and round it; `TextEditor/markdownReader.ts` holds where it is read and what is selected, in its words read as one text.
- **In the column**: `components/MarkdownText.tsx` draws each row in view as a picture drawn by the canvas in IBM Plex (`TextEditor/markdownPictures.ts`), its HTML half `TextEditor/MarkdownBody.tsx` taking the wheel, the pointer and the keys.
- **On the page**: a Markdown text's sheet (`utils/textSheets`) shows its first rows laid out as a sheet is wide (`components/MarkdownRows.tsx`), in troika's type: IBM Plex Sans and Mono, a strong part thickened by an outline of its own colour and an emphasised one slanted, each stretched to the width its own face sets it at - the page's type has one face of each. Far off, its words are grey strokes, as a sheet's lines are.
- **On the way between them**: rising, its sheet's rows fade, and the column's come up in their place, both growing with it (`MarkdownFlight` in `components/TextFlight.tsx`); going back down, the other way.
- **Its source**: *Source* in the column's header switches a Markdown text between read and written (`TextEditor/columnText.ts`, not saved: a Markdown text opens formatted); the source coloured by Lezer's Markdown grammar, its code by Python's, JSON's or XML's (`lib/text/colouring.ts`).

Decided while building it, for the maintainer to confirm:
- **The look is GitHub's**, as the column's colours already are: body 15 pixels on 24, headings 2 to 0.85 times it, code 13 pixels, lists 30 pixels in.
- **A sheet is as wide as 80 letters of a sheet's type**, about six inches, as a page's text is; its rows' type as much smaller than the column's as the sheet's monospaced type is.
- **A sheet's code is black**, as a sheet's lines are; the column colours it.
- **Selected words copy as they read**, not as they are written; the source is there to copy the marks.
- **The source shown is not saved**: a Markdown text opens formatted.
- **Rising to the column, the sheet's rows fade before the column's come**, the two laid out at different widths: shown at once, both together read as a blur.

Not yet, and where it comes:
- **Editing in the formatted text** (the maintainer chose read formatted, written in the source).
- **Pictures in a Markdown text**, and links to other texts: Meno does not keep where a text was opened from, and reaches no network.
- **A letter no typeface of Meno's has on a sheet** - a superscript minus, as in mol⁻¹ - is a white square there, as on any sheet; the column draws it in the system's type.
- **Math** (`$...$`), footnotes and other extensions GitHub draws but GFM 0.29 does not specify are shown as written.
- **Searching a text** (Cmd/Ctrl+F looks in PDFs).

### With the rest of the page (2026-10-11)

Built (lane L9, the maintainer's choice of the *Not yet* items):
- **A PDF is selected as a picture is.** A click on it selects it alone - on a link too; ⌘-click (Ctrl+click on Windows) on a link follows it; Ctrl/Cmd and a click adds it to the selection or takes it out; a box or a lasso takes it by the middle of what it covers; *Select all* takes it. A PDF spread is selected whole, its pages with it; a page is still moved alone by a long press on its rim. Selected, it is framed in the selection's colour, round each of its pages where they are spread.
- **Selected, it goes with the rest.** A drag on it moves the whole selection - the view no longer - and a press held still on it does what it does on any PDF (words selected, a box drawn, a page or the stack taken hold of). Delete, Cut, Copy and Paste take it with the rest, each as one step. The selection's handle carries it round, upright, by its place. Selecting words in a PDF, or drawing a box on one, lets the PDFs selected go, and selecting a PDF lets them go: one selection.
- **Copied**, a PDF goes in Meno's record by its file's SHA-256, as it lies - full size or an icon, spread, its pages' own places - but not where it was read; it is pasted from Meno's cache, where every PDF opened is kept, in any tab. Export is not offered for PDFs and texts' sheets alone, which it does not write.
- **Texts' sheets too**: copied and pasted with the selection - each text whole, a sheet of its own where it is pasted, not read in the column; a sheet alone also goes to other programs as its words - and carried round by the selection's handle, upright.
- **Files copied in the Finder or Explorer are pasted** as they would be dropped where the paste goes: PDFs, pictures, texts, workspaces and structures' files (`clipboard_file_names`, `clipboard_file`: the app reads the files the clipboard holds - the Finder's file URLs, Explorer's list of files - and the page names no path).
- **A JPEG on the clipboard**, as a browser copies a photograph, is pasted as a picture, kept as it is (`public.jpeg` on a Mac, `JFIF` on Windows).
- **A stack moved by an undo or a redo glides there** (320 ms), as pages spread do; one dragged, or moved with the selection, follows the pointer.

Decided while building it, for the maintainer to confirm:
- **A click on a full-size PDF selects it** (the maintainer), and a click on a link follows the link, not selecting it.
- **A PDF spread is selected whole** (the maintainer).
- **Selected, a drag moves the selection** at once, as for a picture; a press held still keeps its meaning.

Not yet, and where it comes:
- **A PDF copied to another program** goes as nothing yet; its file could go, as the Finder copies one.

### Pages placed one by one (2026-10-10)

Built (lane L9):
- **A page spread is moved alone.** Held still a moment on its rim - or anywhere on it, where its words are too small to read - a page spread is taken hold of, the selection's shade spreading over it alone from the pointer, and the drag moves it to a place of its own, as one step. It then lies over the other pages; of those put in places of their own, the last put there lies on top. Held so on its name, the PDF is taken hold of whole, and all its pages move together.
- **Where each lies is kept from the PDF's place** (`placed` in `workspace.json`'s `pdfs`: each page's middle from where the PDF lies, in the order they were put there), so the pages go with the PDF wherever it is moved. A page in a place of its own leaves its place in its row empty; the others keep theirs.
- **Gathered, they go back to the stack's own place**, as before, and their places are kept: spread again, each page goes back to where it was put. *Put pages in rows*, in the PDF's menu while some lie in places of their own, puts them all back in their rows, as one step.
- **A page in a place of its own shows its number under it** (*3 / 12*), as small on the screen as the PDF's name, which stays under the pages left in their rows - under the first page, where none is left there.
- **The light, hovered or taken hold of, lies round each page**, not round all of them, since they may lie far apart.
- **They glide.** Put back in their rows, or moved by an undo or a redo, the pages glide to where they now lie (320 ms), lying over one another as they did until they are there, a page's number fading as it leaves its own place or comes to one; the one being dragged follows the pointer, on top.

Decided while building it, for the maintainer to confirm:
- **A page is taken hold of as the stack is**, by a long press on its rim; its words are still selected by a long press on them, and a box drawn in a figure.
- **The number under a page is *3 / 12***, as the column's page number reads.

Not yet, and where it comes:
- **A stack moved by an undo still jumped** there, as before; only pages spread glided. Done since (*With the rest of the page*, above).
- **Selecting PDFs, or pages, with others**, to be moved, copied or deleted together: done since for PDFs, whole (*With the rest of the page*, above).

## Stage 5: figures read as structures

A figure in a paper is most often a structure, and a chemist who reads it
wants it as a structure: to look at in 3D, to calculate, to change. Meno
reads it and draws it beside where it came from, tied to it atom by atom,
for the chemist to check and put right (WORKSPACE.md, *Stages*, 5).

Two kinds of figure, read two ways:
- **A figure drawn with lines and letters** - as drawing programs export
  them, and as most journals print them - is read from what it is drawn
  with: PDFium gives its paths and its letters, and Meno reads those as
  bonds and labels. Nothing is guessed from a picture of it, and no model
  is needed: it is Meno's own, built in (part A, below).
- **A figure that is a picture** - a scanned page, a screenshot, a bitmap
  a journal printed - is read by a model that has learnt structures from
  pictures, as a plugin, its weights fetched with the chemist's consent
  (part B, below).

### Decided by the maintainer (2026-10-11)

1. **The structure keeps the figure's shape**: its atoms where the figure
   has them, its bonds as long as Meno draws a bond and drawn in Meno's
   style. Clean-up is there to lay it out as Meno would.
2. **Read from a box drawn on a PDF's page, the structure is put beside
   the PDF**, tied to where on the page each atom was drawn. Read from a
   picture cut out of a PDF, it is put beside the picture, tied the same
   way - the picture keeps where it came from.
3. **What Meno is unsure of is marked**, as a stereocentre the drawing
   shows only by luck is (LAYOUT-2D.md): a dashed ring, saying what is
   unsure while the pointer is on it. A mark goes once that atom or bond
   is changed.
4. **Structures first.** A reaction scheme's arrows, plus signs,
   conditions and compound numbers, and letters drawn as outlines, come
   after (both built, below).
5. **Two plugins read pictures, each standing alone** - MolScribe and
   MolNexTR - and the chemist chooses which, as any role's plugin is
   chosen. Meno does not read a picture with both to see whether they
   agree.
6. **What a plugin is unsure of is marked without a number**: unclear in
   the picture, no more.
7. **A figure in a PDF that is a picture is read by the chosen plugin**
   from the same *Read as structure*, without being asked again.

### Coordinates in a PDF (built 2026-10-15)

*3D structures* is in the PDF's menu where words are selected on it, or a
box is drawn on it: the coordinates in them - a paper's supporting
information - read where each word lies, a page's two columns one after
the other and its running heads and feet left out, and shown as the
structures they hold before any is placed in 3D (docs/FILE-IO.md,
*Coordinates in a text*). Where there are none, it says so.

### A figure read (part A, built 2026-10-11)

*Read as structure* is in the PDF's menu when a box is drawn on it (a click
in a figure in the column, or a long press in one on the stack, draws the
figure's box), and in a picture's menu when it was cut out of a PDF this
workspace holds. What it reads is put on the page beside the PDF or the
picture, to the right, clear of all there is on the page - structures,
words, arrows and signs, pictures, PDFs, sheets, shapes, molecules in 3D,
a workflow's sets and cards - as what Open puts down is (`pageBoxes`), its
own labels and words measured as far as they are set; the view eases to
it where it lies out of view.

**What is read** (`pdf_figure`; `lib/figure`):
- **What the figure is drawn with**: within the box, each path's steps -
  lines and curves - filled or stroked and how thick; each letter with
  its box, where its line starts and its size; through a form, a figure
  a journal placed whole, under the matrices that placed it.
- **Which way its words read**: each letter's line, as the page is shown.
  A figure whose words read down the page or up it - a scheme printed
  sideways, a page turned a quarter - is turned by that quarter and read
  upright. Its structure is drawn upright, and each atom is tied to where
  it lies on the page as shown.
- **Lines drawn again**: a short line lying on a longer one, along it and
  within it - a joint drawn as short pieces along the bonds meeting
  there, as RDKit draws one - is that line's, and left out before
  anything is measured (a piece only a few widths long need only lie
  within the line: its ends, written to a hundredth of a point, may turn
  it a few degrees). A line drawn in two colours - a bond black to
  its middle and its atom's colour on, as RDKit draws one by default -
  is one line: two lines of different colours, end to end along one
  way, with nothing else ending where they meet (a double bond's other
  line, side by side, its colour changing there too, is nothing else) -
  once: a line so joined is a bond whole, and an sp carbon's single bond
  going straight on into its triple bond's middle line is another. So is a wedge drawn in
  two colours: a filled four-cornered shape of another colour going on
  from its wide end, the same way and wider, is its wide half. A wedge
  filled and then stroked round - as RDKit draws one, its outline a path
  of its own in the PDF - has its edges as its own: a line from one of
  its corners to another is no bond. So is a line drawn down a wedge,
  within it - or reaching up to a tenth of its length past where its tip
  is taken to be, to the point a narrow end may come to - at least half
  as long: its middle line, under the fill or
  over it, as some programs draw one; else it is read as a second bond
  beside the wedge, to an atom of its own at the wide end.
- **Traces, and too much drawn**: a chart's or a spectrum's trace is no
  structure's and is left out before anything is read - an open line of
  more than a hundred corners; a path of more than 150 lines, most of them
  under 0.6 points long or four in five of them running one way (a
  spectrum's sticks up from its baseline), or of more than a thousand under
  1.5 points; however the path is split into parts. A ring's circle drawn
  as many short lines is closed and kept, and hashes drawn in one path are
  too few. A structure drawn in a spectrum's corner is read as ever. A
  figure still of more than 5,000 lines - a chart or a spectrum drawn a
  dot or a stick at a time, each a path of its own - is read as nothing:
  "This looks like a chart or a spectrum", at once, rather than holding
  Meno up for minutes (no structure has so many; a scheme page of many
  has a thousand or so). The passes that look at every line against the
  others look only at those near it, on a grid, so that a figure of many
  thousands of lines is read in time.
- **How long its bonds are drawn**: the length most of its lines that
  meet another share; a ring's inner lines and a hash's strokes, which
  meet none, do not count, nor a line shorter than its letters are tall,
  nor one more than six times as long as its labels' letters would have a
  bond (the capitals by a line's end; a caption's letters, set larger or
  smaller, are not taken, unless no letter lies by a line's end).
  Of the lines that meet, those meeting another other than square count,
  where any do: where every line meets the others square - a frame, a
  graph's axes - and no wedge is drawn, no structure is drawn, and none
  is read. A cyclobutane drawn alone, a square, and a schematic box (rings
  drawn edge-on as rectangles) are read as no structure so too. A table's
  lines are no bonds, wherever in the figure it stands: level and upright
  lines bounding cells - two level lines over each other's stretch, two
  upright between them from one to the other - where two cells or more
  share a side, as a table's rows and columns do, and short level or
  upright lines set within those cells, its dashes; a structure beside it
  is read as ever. A ring is never drawn so; a Fischer projection's
  crossing lines make no cells. Its words - those in a cell that holds no
  part of a structure nor of an arrow, a data table's cell - are the
  table's, not the scheme's, and are not put on the page with the
  structure. Words outside its cells (its caption, a footnote) and an
  arrow's words come through as ever, and a cell holding a structure or an
  arrow is a panel framing part of the scheme, whose words are kept.
  Where every line is drawn short between labels - a metal's bonds, Pt to
  N and Cl - each is measured on to the middles of the letters it is cut
  short of.
- **Bonds**:
  - a line stroked, or a thin box filled, is a single bond, and a line
    much thicker than the rest a bold one - but not one more than two and
    a half bonds long that meets others only square, or none: a frame's
    side, a graph's axis, a page's rule;
  - lines side by side - the second may be short, from three twentieths
    of a bond, where it lies alongside the first within its stretch - a fifth of a bond or so apart and alongside each
    other for most of the shorter (seven tenths: a cube's parallel edges,
    drawn in perspective half past each other, are none), are a double or a
    triple bond, its ends taken to an atom within a quarter of a bond
    where its lines run a little past it or stop short of it (not an end
    inside a label's box: that is the label's) - its ends the longer line's where one is longer, as a
    ring's second line is drawn inside it (but where the two end together at one end and the longer runs on alone past
    the other, to nothing, while the shorter ends there by other lines, that end is the shorter's), else the middle line's;
  - a filled wedge is a bond in front, narrow at its stereocentre - its
    narrow end a point, rounded, cut flat a line's width across, or
    capped with a short point its sides are cut in to (its width there
    measured nearer its end, where the point narrows it; and, its sides
    running in only to near half its wide end, filling up to three
    quarters of its narrowest box - a bar, more, is a line), and
    its wide end cut slanting along the bond it meets however far; one
    under three tenths of a bond long only where its wide end points
    into a label (a stereocentre's H set close, the wedge cut back at it),
    and one cut back so far it is wider than long - three corners, two
    sides from its tip as long, its wide end longer - narrow at that tip,
    or, its three sides near as long, at the one corner a line ends at;
  - short strokes side by side across a line, evenly spaced - a
    twenty-fifth of a bond apart or more, or two and a half of their
    widths where a long bond's many lines are set close - are a bond
    behind, narrow where its lines are shortest (its lines, not the joints
    of the bonds at its ends, drawn as dots or thinner pieces; the first
    of its own lines may be a dot: a small filled shape, or a line next to
    nothing long whose round ends make it one, as Meno's own style draws
    it) - one of them at least a line of some width: dots alone are a
    joint's. Its
    lines all go one way, so two hashes meeting at an atom, joined there
    through its joints' dots, are two; and a hash's narrow end set off
    from its atom, its first line taken as a joint's or stopping short,
    is carried on to the bond end it points at, under half a bond on -
    such a hash may be two lines;
  - a curve that goes to and fro along a line is a wavy bond;
  - a bond broken where another passes in front of it - a bridge's, a
    cage's back edge, a double bond's two lines - is joined again, however
    short one of its pieces, and its pieces are never a hash's lines; its
    gap may be near half a bond (nine twentieths), as a figure with many
    labels, more of its lines cut short of them than drawn whole, has its
    bonds read shorter than they are;
  - a ring with a circle drawn in it is given its double bonds, as an
    aromatic ring is;
  - no line more than six bonds long - a table's rule, a graph's axis, a
    frame round part of the figure - nor a short line or dash between two
    words of a line of text, a caption's "3aa, R = H, 73%": the line goes
    on past both, a word that reads as no label on each side within a
    space and a comma (a row of labels, HO-P-O-P, is a chain);
  - a short dash between two labels - two words, not one word's ends - as between S and O in a sulfonyl, is
    a bond between them, two side by side a double one, three a triple
    one (N≡N+) - never a hash, however evenly they are set (but a short
    line side by side with another that runs to no label is a hash's: its
    widest line by an H set close, the hash two lines and the dots at its
    narrow end); and so is a
    short line from a joint of bonds to a label stacked tall - an NH with
    its H over its N - cut back short of its H;
  - a short line, a sixth of a bond long or more, running straight out
    of a label to nothing - no line's end and no other word by its far
    end - is a bond to a methyl: an N-methyl in a bridge squeezed short
    and cut back at its N;
  - a line more than three twentieths of a bond long, from a joint - another
    bond's end, a wedge's or a hash's, at its own - into a label, is that
    label's bond: one cut back at the label further than most.
- **Letters drawn as outlines** - a figure whose labels were turned into
  filled shapes, as some journals print them - are read from their shapes:
  each shape as tall as a letter beside the bonds (its holes and an i's
  dot with it, an upright bar as thick as a stem beside it or touching no
  bond, a short level bar set high beside a letter a minus) is laid on a
  grid and matched against the letters as the system's own typefaces draw
  them - a sans serif and a serif, drawn by the window when first wanted:
  no letter's shape is carried in Meno. A word drawn as one shape, all
  its letters one path (Boc, MeO), is read letter by letter, each sized on
  its own. A letter whose small form is its capital made smaller (c C,
  o O, s S, v V, w W, x X, z Z) is told by the capitals beside it on its
  line: as tall as they, a capital; well under, small - and one set alone,
  no letter beside it (an O at a bond's end), by the height most of the
  figure's other capitals share. A round dot, solid - one outline, as wide
  as it is tall, filling its box as a disc does, nothing drawn within it -
  is no letter: a mark a scheme sets at a bond's end (an o and an e have
  their holes). A letter that could
  be another (l or I, O or 0) is read as the one that makes its label
  read; one that matched weakly is marked ("Its letters are drawn as
  shapes: read as "Cl"."). A stem with a dot just over it, however thin
  and however it leans (an italic i set small, as the i of an iPr is), is
  an i or a j, the nearer of the two. A minus set high after a subscript's
  digit is told by the letter before it (the - of a PF6-). A filled shape
  of straight lines with many corners and far from convex - an F, wide at
  one end - is no wedge: a wedge of more than six corners is all but
  convex. A letter read surely from its shape is no
  arrow's head, however like one an S or an N of one part is. A figure is
  taken to draw its letters so where it has a shape filled in several
  parts, or curved, or with many corners (an N, an H, of straight lines
  alone); one with no letter written, turned a quarter as a page set
  sideways is, is turned upright the way its outlines read best as
  letters.
- **Atoms**: where bonds' ends meet, a carbon (but two ends pointing into
  one word do not meet each other there: bonds drawn short of a metal
  from two sides; and an end by both ends of a bond shorter than ends lie
  apart where they meet - a hash to an H set close - meets the nearer);
  where a bond points into a
  word (one so short both its ends lie in the word's box, its other end
  coming to another label - a metal's - at the end nearer its element;
  of two it comes by, the nearer, unless it points away from that one and
  into the other - an H set under the NH it goes to)
  - its letters side by side on one line (their ink near, or their
  rooms as the PDF sets them: a 1's ink stands well inside its room, and
  small letters may be set apart; but two letters as large set over each
  other, their rooms well into each other, are two, and a letter as large
  as the word's own whose baseline is a tenth of a letter off theirs
  starts a word; two labels set touching, the first
  ending in its charge - Cl- HN+ - are two, where the word reads as
  nothing and its pieces do): two capitals as large set
  off one line, two H's of atoms side by side drawn half over each other,
  are two - the word is its atom's label (at its element: an end outside it,
  much nearer its H than its element, is a carbon set close; and a label
  with its hydrogens written - NH2, OH - takes no more bonds than they
  leave it, and an O alone two, a double bond counted twice, the ends
  nearest its element; an H set right over or under an
  N, O, S or P is that label's - an NH set between two bonds, its H stacked
  - and a bond cut back at the H, pointing on at the element, is the
  label's too; a group's name set right over or under an N, P, O or S's
  label with no bond drawn to it - a MOM written over its imidazole's N -
  is bonded to that atom, where it has a bond to spare and the name stands
  alone on its line: the Me of an R = Me is the line's), read as a label typed is read - an
  element with its hydrogens and charge, or a group's name - and turned
  round where it is written on its bond's left (HO is OH, TBSO is OTBS,
  MeO2C is CO2Me, BocHN is NHBoc), a charge written last staying last
  (H3N+ is NH3+). A subscript is a count, a superscript
  a charge (a letter the PDF gives no character for, a control code,
  drawn flat - more than twice as wide as tall - a minus: a hyphen as
  WebKit prints one), and digits set high before the element its isotope's mass
  number (13C, 18F, 2H); a count set low before any letter - the H of an
  H3N left outside the box - is no one's. A charge drawn in a small circle - a "+" or a "-" in a ring,
  as Meno draws one and as many papers do - is the charge of the atom it is
  by, however the page is turned and where a box drawn across it cuts some
  of its ring off; never a bond, nor a scheme's "+". A lone H at no
  bond's end, a short line or two across the way to it from an atom by
  it, is that atom's H behind, its hash the rest hidden by the joint at
  the atom and by the H. A small round dot
  by an atom - curved, or a polygon of a dozen corners or more, as RDKit
  draws one - half as wide again as a line or more, under a sixth of a
  bond, and at no line's end nor a hash's, is a
  radical's unpaired electron; two side by side a pair, read as a singlet
  and marked so (a triplet is drawn the same). A lone H takes one
  bond: its wedge's, where it has one. A word with a charge - written,
  or drawn in a ring beside it - by the structure (within two and a half
  bonds of its ink, its labels and all), at no bond's end and
  not an H by another atom's label (an element's ion set close by one is
  still an ion), is an ion (Na+, Br-, PF6-), as is one in parentheses,
  counted ((Cl-)2), and several set in a
  row each by the one before (three K+). A word written as a compound's
  number - 1, 12b, 3', (4) - is no atom's label, however close under a
  bond it is set.
- **Marked as unsure**, rather than guessed silently:
  - a label nothing reads ("Xq" was not read as an element or a group);
  - a label that writes more or fewer hydrogens than its atom's bonds leave
    it;
  - hashes as wide at both ends, where both ends could be a stereocentre or
    neither could (where only one could, it is that one);
  - more bonds meeting at an atom than it takes - an element's valence, a
    heavier one's highest (P(V), S(VI), I(VII)), as its charge leaves it;
    a group's label (OMe) what its atom has left past the group's own
    bonds; a metal never - however its label is drawn ("More bonds meet
    here than oxygen has."), and a charge more than its atom carries. And
    the structure is checked again as a file has it, each label written
    out as the atoms it stands for: any atom of it with more bonds than it
    takes - an H with two, or one charged; a halogen bonded to more than
    one atom that is not O nor F (an iodine to more than two that are not
    a halogen, O nor C - PhICl2 and Ph3I take theirs; one more for each
    positive charge: a diaryliodonium's iodine); a charge past four
    either way - marks the atom or
    label drawn, so that nothing whose valence is broken is put down
    looking sure;
  - a radical's dots by an atom whose bonds leave it no unpaired electron:
    no radical is read - a speck, or a letter's round shape, lies there
    as often ("A dot by it, but its bonds leave it no unpaired electron:
    no radical is read.");
  - a bond drawn twice over;
  - a bond's open end drawn short, as a bond to a label is, with no label
    read at it - a letter there not read (an I set alone), or a wavy line
    across it, the point a group is attached at: never a methyl, sure
    ("Its bond is drawn short, as one to a label is, but no label is read
    at its end.");
  - a stereocentre whose configuration the figure does not show - no
    wedge or hash narrow at it, as a cage drawn in perspective has none -
    four groups about it each other than the rest, its hydrogens one at
    most, a P=O's or an S=O's too, as Meno takes a stereocentre, but never
    a metal's: none is read, and none guessed ("A stereocentre whose
    configuration is not drawn: none is read.");
  - an O alone, or a label with its hydrogens written, with more bonds
    coming to it than it takes, where one let go was all but as near as
    those kept ("More bonds come to it than it takes: those nearest its
    letter kept.");
  - a molecule written as words in a scheme (below).

**What is put on the page**: the structure, beside the PDF or the picture -
its left two bonds past their right edge, its top level with theirs, and on
to the right past whatever lies there - selected, as one step. Where it
is not seen whole - out of view, or under the column, which is not counted
as what can be seen - the view eases to it: along first, as little as takes
it in with a margin, and out only as far as it must, never in
(docs/WORKSPACE.md, *Putting things down*; the maintainer, 2026-10-18: read
with the PDF in the column, the structure was lost from sight).

**Tied to the figure, atom by atom**: each atom keeps where on its PDF's
page it was drawn (`seen`: the PDF's SHA-256, the page, the point, and how
long the figure's bonds are there). As a molecule in 3D and its drawing
are:
- an atom under the pointer in the drawing is ringed where it was drawn -
  on the PDF's stack and its pages spread, in the column, and on a picture
  cut out of it - as the drawing rings it, the ring coming and going;
- a place under the pointer in the figure, within a third of a bond of
  where an atom was drawn, rings that atom in the drawing.

The tie is kept with the drawing - saved in the workspace, copied and
pasted with it - and goes with the atom when it is deleted.

**How well**: on PDFs made for it - twenty structures (stereocentres,
wedges and hashes, double and triple bonds, charges, ions, groups written
on either side, an aromatic ring drawn with its circle), drawn seven ways
(lines stroked; every bond a filled shape; aromatic rings as circles; end
methyls written CH3; and the letters as outlines, in Helvetica, Arial and
Times), each placed in a page as a journal places a figure - every
structure is read right, its stereochemistry with it, in about 35 ms for
the figure of twenty, 65-75 ms where its letters are outlines.

**Checked by a round trip** (`scripts/figure/roundtrip`): structures whose
SMILES is known - the layout benchmark's, and charges, isotopes,
stereochemistry, radicals and metals - drawn by Meno, exported as SVG in
each drawing style, printed to PDF (as it is, the page turned a quarter,
and in another typeface), read back as *Read as structure* reads them, and
compared with the truth by canonical SMILES, stereochemistry, isotopes and
charges kept. Every difference there is a bug of the worst kind: nothing
on the page shows it.

### A reaction scheme read (built 2026-10-12)

Decided by the maintainer (2026-10-11): Meno's arrows first gained the
kinds a scheme draws (EDITOR-2D.md, *Arrows*), and each arrow is read as
that kind. A compound's number is bold words on the page where it is
drawn, not tied to a structure. Conditions over or under an arrow are
written Meno's way, as words typed are. The scheme keeps the figure's
layout.

*Read as structure* reads a box as a scheme (`lib/figure/scheme`). Its
arrows and "+" signs are taken out of what the figure is drawn with
first; its structures are read from the rest, as above; and its letters
that no structure took are read as words - but a word on a side of the
scheme, over or under no arrow, that a "+" on its line joins to the rest,
within a bond of it (or two and a half of its letters' height, where
that is further), and that reads as a whole molecule is that
molecule: a reagent Meno reads it as (H2O, HCl, NaCl), or an element its
hydrogens and charge leave nothing to bond (I-, Na+, NH3). It is marked
("Written as words beside a "+": read as a molecule."). Words over or
under an arrow stay words, and so does any word that is no whole
molecule (decided 2026-10-14). Its bonds' length is its
lines' (above) where three or more of them that long meet another long
line at an end - a structure's joints; else, where its lines are more
than twice as long as its letters are tall, by its letters, its lines
being arrows.

- **Arrows**: a line - or a row of dashes, or lines joined at corners -
  with a head at its end. The head can be filled, whole or half (its
  edges stroked as well, as some programs draw one, go with it); an open
  chevron of two strokes or an outline; or a single barb, a half head's.
  A head may be small beside the bonds, as RDKit's reaction drawing
  draws one - a twelfth of a bond - but is two of its line's widths long
  at least.
  An arrow drawn as one filled outline, its line and its head in one
  shape, is read by how wide it is along its length, measured from its
  line's middle fitted along it.
  - heads at both ends: two heads;
  - two arrows side by side, pointing opposite ways, a short way apart
    and alongside each other: an equilibrium, its heads full where both
    are whole. It goes the way its upper line goes, as an equilibrium
    is printed (the right-hand line where they stand upright);
  - two lines ending within an open head: a retrosynthesis's arrow;
  - a cross on its middle, of two strokes or a letter x on its line and
    alone (an x in the words over it, as in 3 x 10 min, is a word's): a
    reaction that does not go;
  - a line stroked dashed, or drawn as dashes: dashed;
  - its corners, where its lines turn;
  - its weight, from its line against the bonds' (thin under three
    quarters of it, thick over 1.6 times), and its colour, where it is
    drawn in one rather than black or near it.
- **"+" signs**: a "+" set alone, two strokes crossing at their middles,
  square to each other and as long, touching nothing - no other line
  ending at its arms' ends, though a molecule may stand a little past
  them - or a filled cross.
- **Words**: letters set in lines - a smaller letter set high or low with
  its line - and lines one close under another in blocks. A space goes
  where letters stand apart, measured by how they are set: each letter's
  room as the PDF gives it, from where it starts to where the next would
  (a 1's ink stands well inside its room), or by their ink where it gives
  none.
  - A block over or under an arrow, along its longest stretch and near
    it, is that arrow's words.
  - The rest stand where they are drawn: a compound's number among them,
    bold as its typeface is.
  - Bold and italics come from the typeface. A letter set high or low is
    marked so, except a formula's count and a charge, which Meno sets low
    and high itself, and a raised o, which is a degree.
  - Each block is written as Meno writes words typed (lib/text/smartWords
    `writtenAsMeant`): a minus for a hyphen or a dash before a number, an
    en dash in a range, one space before °C.
- **The scale**: how long most of its bonds are drawn; with no structure
  in the box, as its letters are tall.

**What is put on the page**: the structures, the arrows of their kinds,
the "+" signs and the words, as they stand to each other in the figure,
with one middle and one scale for all of it (a bond as long as Meno draws
one). All of it goes beside the PDF as one step, the words selected with
the atoms. Words over an arrow go with it, and grow it to fit them, as
words put over an arrow do.

**How well**: on a scheme drawn for it - two reactants with a "+" and a
product, an arrow with words over it and under it, three compounds'
numbers in bold - and on a row of arrows of each kind, everything is read
as drawn. So is everything in 29 more figures drawn many ways:
- heads filled, barbed, curved, open, as one outline with the line, or
  filled and stroked, and lines as filled bars;
- arrows going right, left, down and at a slant;
- equilibria with half heads, with barbs, with lines of unequal length,
  and with full heads;
- retrosynthetic, dashed, crossed, thick and coloured arrows;
- words beside a downward arrow, words under an arrow with a structure
  drawn over it, and words with an x or a "+" in them, in italics, with
  formulas and footnotes;
- a "+" larger than the words, a charge's "+" beside its atom, and two
  steps one after the other.

Not yet:
- **A curved arrow** (an electron-pushing arrow's curve) is not read.
- **An equilibrium drawn with corners** is read as its two arrows, each
  a reaction's. One whose lines differ in length, one way favoured, is
  read as a plain equilibrium.
- **A scheme in a picture** - a figure that is a picture - is read by the
  plugin as one structure, not as a scheme.

### Structures picked from a PDF (decided 2026-10-23)

In a PDF whose structures are drawn with lines, a structure is picked as
words are: by itself, not by a box drawn round it.
- **Pointed at, it is lit whole**, as a word under the pointer is: its
  bonds and its own labels. Never another structure, an arrow, a "+", or
  words beside it.
- **Dragged out, it comes off the page as Meno's own drawing of it**,
  following the pointer, and let go on the canvas it is put down there:
  read from the lines, with its labels, wedges and charges, a bond as long
  as Meno draws one. Let go anywhere else, it goes back.
- **Each structure is taken at its own scale**: the length most of its own
  bonds are drawn at (those between two corners, where it has two or
  more), not the figure's, so that one drawn smaller or larger than the
  structures beside it comes in at the style's bond length too, wherever it
  is let go and however far the canvas is zoomed. With too few bonds to
  say, the figure's is used. A scheme taken whole by a box keeps one scale
  for all of it, its structures' bonds the length most are drawn at.
- **It comes in at the style's geometry, its arrangement kept** (the
  maintainer, 2026-10-27). Kept as drawn: which atom is bonded to which,
  where its rings are and how they are turned, the side each substituent
  and branch is on, and every bond's mark - which bond is wedged or hashed
  and its narrow end, wavy and bold bonds, a double bond's side. Made the
  style's: every bond its length, the standard angles, regular rings. A
  ring drawn unevenly is the regular one, where it is and turned as it is,
  as a fused system is; a chain goes the way it is drawn, a third of a turn
  at each atom, on the side it is drawn. A ring drawn as a chair, a bridged
  system and a cage are drawings in perspective, kept as drawn at the
  style's scale, with the bonds out of them. Crowded, or crossing what the
  drawing does not cross, it is cleared, its arrangement kept; where it
  cannot be, or where its stereochemistry would read otherwise, it is left
  as drawn (lib/layout/regularise).
- **Clicked, it is selected**, and Shift adds another. Its right-click menu
  has *Put on the page* and *Copy*.
- **Its own labels are its**: a press on a label's letters takes the
  structure, not the text. Words outside a structure, a compound's number
  under it among them, stay text.
- **A structure in a scheme is taken alone.** The whole scheme, its arrows
  and words with it, is still taken by a box and *Read as structure*.
- **A picture**, not lines, is still taken by a box, as before.
- **What is read is taken; the rest is marked** (the maintainer, 2026-10-24,
  reversing "never read in part"). A structure with letters inside it that no
  atom took, words at an open end of a bond not read as its label, or words
  or lines of the page outside its figure lying by it, is taken still: the
  atom nearest what is not read marked unsure, saying what lies there
  ('"OTBS" lies at this end, not read as its label.'), so its note counts it
  and the chemist puts it right. A label not read stays an atom, its words as
  written, marked unsure: nothing is dropped. A piece of three heavy atoms
  or fewer that would be so marked is refused still, as before, with why -
  most likely a cut-off bit of a drawing, or none (the maintainer,
  2026-10-24); a small molecule read whole (MeOH, CO2, a lone ion) is taken
  as ever. And what is no structure - a line of words, a chart - is refused,
  with why.
- In the column first. The PDF on the page, whose presses move the view,
  comes later.

**Read from a figure** (`utils/figureNotes`, `components/FigureNotes2D`; the look as LOOK set it, 2026-10-24; shown only while parts are unsure, the maintainer, 2026-10-24): every structure taken from a figure - picked out of a PDF, or read from a box of it or a picture - keeps where it came from with its atoms (`seen`), saved with the workspace. While parts of it are still marked unsure, and it is not said to be checked, it carries a note over it, calm and small; else where it came from is said quietly - with the pointer on the structure, and in its menu:
- **What it says**: "Read from a figure: check it · 2 parts unsure" - how many parts are still marked unsure (the dashed rings). Where the pointer is on the note: "From <file>, p. <page>, read as drawn there. Check it against the figure; right-click it to say it was checked." How it was read is never said.
- **How it looks**: as the 3D molecules' grey notes ("Edited from …"), never the accent, no icon; centred over the structure's ink, its labels and all, half a bond off; scaled with the page within 0.75 to 1.5, and a 6-pixel grey dot in its place where a bond is under 12 pixels on the screen, the same words where the pointer is on it.
- **When it goes**: when no part of it is marked unsure any longer - each part's dashed ring goes as that part is changed - or when *Checked against the figure*, in the structure's menu (a right-click on the note gives the same menu), says it was checked: one step to undo, kept with its atoms (`seen.checked`) and saved with the workspace; the note fades over `DURATION.base`, as what leaves does, and the dashed rings of its parts with it - drawn only on what is not said to be checked, as they are counted (`readMarksShown`); they stay in the drawing, so undoing the check brings both back.
- **Where it came from, quietly**: with the pointer on an atom or a bond of a structure read from a figure and showing no note - none of it unsure, or all of it said to be checked - the same grey pill says "From <file>, p. <page>" where the note would stand, fading in and out, never in the pointer's way (and nothing where a bond is under 12 pixels on the screen). Its menu has the same words, greyed, over *Checked against the figure* (that item only while it is not said to be checked).
- **Joined to another**: a structure stays unchecked while any atom of it read from a figure is not said to be checked - a checked one bonded to an unchecked one leaves the unchecked one's note - and its count of unsure parts, and where it was read from, are of the unchecked atoms.
- **When it comes**: once the structure has landed, not while it is carried out of the PDF, fading in.
- **Copied**: a noted structure copied and pasted in Meno keeps its note - it is still from the figure - and one said to be checked stays checked (`seen` goes with its atoms in Meno's own record); pasted into another program, it carries neither.
- **Its cost**: the notes are worked out again only when what they depend on changes - which atoms each bond joins, which atoms were read from a figure and which of those are checked, and whether each marked part is still as it was read (as its dashed ring is) - and where each stands only for a structure that moved or changed: dragging one structure moves only its own note, never at each frame for all.
- **Never in a picture**: a picture of the drawing - copied as one, exported or printed - has no note, as R and S marks are Meno's.

**In the column, as built** (`TextColumn`, `utils/pdfStructures`, `components/structureDrag`, `components/StructureFlight`):
- a page's letters and figures, for a press on them, are read once it is shown - the column still, its tiles come - in idle time, one page at a time, and its figures worked out in idle time once its parts have come (`lib/core/idle`): never with its turn. A figure under the pointer, pressed, or looked for is asked for at once and worked out at once - one read ahead and waiting for idle time is hurried - and a page whose reading failed, or a PDF gone from the column and come back, is read again;
- a figure is read the first time the pointer comes over it (`pdf_figure`, as *Read as structure* reads it), with all of its page that does not reach into it beside it, and kept - but lines whose box holds all of a structure (a page's background, a frame round it, a coloured panel behind it and its neighbours) are no lines beside it; lines crossing into it are;
- the structure under the pointer is lit along its bonds and over its labels, the cursor a hand; one picked is lit stronger;
- a press within half a bond of a structure takes it, before any words about it (a scheme's conditions set close by);
- dragged, Meno's drawing of it lifts off where it lay on the page, as large as it was there, and grows to the canvas's size over the canvas, held where it was pressed; let go there, it is put down with its middle under the pointer, one step, selected; let go anywhere else, it eases back and fades;
- clicked, it is picked; ⌘-click (Ctrl-click on Windows) adds it to those picked or takes it out, as everywhere in Meno, and Shift-click does the same, structures having no range between them (in words, Shift-click still draws the selection on, onto another page too); a link under a structure is not followed, the structure taken first; a right-click on one picks it, and the menu has *Put on the page* (beside the PDF, all picked in a row, one step) and *Copy*;
- one refused - a line of words - is never carried: a press says why, where the chemistry's notices are said; one taken with parts not read is carried, those marked.

**A structure, and where it lies** (`utils/pageStructures`):
- each figure of the page is read as *Read as structure* reads one (the
  one reading, `schemeDrawn`), and split into its structures: an atom and
  every atom bonded to it, on and on. A lone ion (Na+, Cl-) within 1.6
  bonds of a structure - or within 3, set level with the atom nearest it
  or with the structure's middle, as a salt's counter-ion is in a row
  beside it (Meno lays a salt's pieces out so, each centred on the row,
  ink to ink; measured from its label's ink to that atom's) - with no
  arrow nor "+" between them, is that
  structure's where the ions so by it make it neutral - it carrying their
  charge the other way: sodium acetate, an ammonium chloride, NMe4+ Br-,
  are each one structure. Any other ion by a structure - as near as that, or
  within the box round the figure's bonds - is its own, never a neutral
  molecule's nor taken across a scheme; one further out (a "Na+" of a
  caption or a table) is words. A lone label that is no ion - a lone
  metal - is the structure's it lies by so, and by none, words. A
  structure charged still, with an ion of the other charge within 4.5
  bonds of it that it did not take - the 3 and as far again as Meno sets
  one piece of a drawing from the next; level or not, read as an ion or
  left a word - one written as an ion though it reads as no label, a
  Bu4N+, too - with no arrow nor "+" between them - has
  each of its charged atoms marked unsure, saying so ('"K+" beside it is
  not taken with it: a counter-ion of it, perhaps.'): never a salt read
  without its counter-ion and none the wiser;
- a line of words read as a structure - its signs taken for bonds, "R2 =
  SPh", "PG = Boc", "t-BuNH2·BH3": every atom a label, all on one line,
  each bond level, with an "=" read as a double bond beside a label that
  names no element nor group (R2, PG, X; Ar there the aryl group, argon
  taking no double bond), or a label that reads as nothing, or a legend's
  term - a lone small letter, a bare number: "n = 1" - is refused, as a
  line of words, its labels named. A molecule
  written so - O=C=O, Me3Si-C≡C-SiMe3, Ph-N=N-Ph - is read;
- where each lies is its bonds and its labels' boxes, on the page;
- the pointer takes the nearest within a third of a bond of one of its
  bonds or labels, and none where an arrow, a "+" or words lie nearer.

### A picture read (part B, built 2026-10-11)

*Read as structure* reads, by the plugin chosen for the role *Structures
read from pictures* (Settings, *Chemistry*): a figure in a box of a PDF
that is a picture - Meno finds no lines in it - and any picture on the
page that is not a film. The first time, the plugin is set up as any is:
Meno asks first, saying what it downloads, how large, and from where.

**The plugins** - folders of their own, neither knowing of the other;
each one's code installed from its makers' repository at a fixed commit,
pinned by the archive's hash, and its trained model fetched by Meno:
- **MolScribe**: code under MIT (github.com/thomas0809/MolScribe, 7296a30);
  its trained model under MIT (huggingface.co/yujieq/MolScribe), 1.13 GB;
  53 packages, about 290 MB on a Mac, 310 MB on Windows.
- **MolNexTR**: code under Apache-2.0 (github.com/CYF2000127/MolNexTR,
  6f6502b); its trained model under Apache-2.0
  (huggingface.co/datasets/CYF200127/MolNexTR), 1.13 GB; 54 packages,
  about 290 MB on a Mac, 310 MB on Windows.

Each about 1.5 GB to download, about 2.2 GB kept; for macOS and Windows
(their locks leave out torch's GPU libraries for Linux).

**How a picture is read** (the plugins' workers; `lib/figure/picture.ts`):
- the picture goes to the worker as a PNG or a JPEG - a PDF's box drawn by
  PDFium at 200 dpi, a picture on the page as it is shown - and the model
  reads its atoms and bonds;
- **where its atoms lie**: the models give them across the picture as
  they cropped it, or across the structure itself, each way - they learnt
  from both - so the worker stretches and moves them, each way, until the
  bonds lie on the picture's lines and the atoms on what is drawn;
- **wedges**: the models say only which end of a wedge or a hash lies
  nearer - a wedge narrow at one end is a hash narrow at the other - so
  the worker looks at the picture for which end its ink draws narrow;
  where it cannot tell, Meno draws it narrow at the end that can be a
  stereocentre. An end with no other bond (a methyl, an H, a group's
  label) is never a stereocentre, so a wedge seen narrow there, its other
  end bonded on, is taken as one whose narrow end could not be told: a
  label, or a wide end drawn short of it, misleads what is measured;
- **atoms**: an element as the model reads it, with its charge (its
  notation's hydrogens and stereo marks are not a label); a group's name
  read as a typed label is; an isotope, seldom drawn, is unsure;
- the rest as a figure's lines are: the structure in Meno's units, beside
  the PDF or the picture, selected, as one step.

**Tied to the picture**: an atom read from a PDF's box keeps its place on
the page, as part A's do; one read from a picture on the page keeps its
place in the picture, in its pixels (`seen` without a page), ringed there
as it is in the drawing, and lit from there.

**Marked as unsure** (the same dashed ring as part A's, going once the
part is changed): an atom or a bond its model reports less confidence in
than the plugin sets for that model (its worker's `UNSURE_BELOW`), and an
isotope. A model can misread a picture: what it reports low confidence in
is marked, so that a mark is a hint, not a check.

**How long**: a picture takes well under a second on a Mac's processor
once its model is loaded, which the first picture waits for - a few
seconds, and about a minute the first time a computer loads it, as macOS
looks over each new library (the workers say they are ready at once, so
that this does not count against a worker's start).

**What the workers do besides**: each reads one picture at a time, in its
one process; what a model prints as it reads goes to stderr, stdout being
Meno's answers; and a package reading never loads, pyonmttok, is left out
of MolNexTR's lock. Each takes the atoms and bonds its model predicts and
leaves the model's own step of writing them as SMILES and a molfile
undone (`graphs_unwritten`): Meno does not use what it writes, and
writing a graph predicted from a picture that is no structure can run
without end or crash the worker's process.

Not yet: a picture with several structures, or a scheme, read as more
than one structure; Linux.

## In order

0. **A trial, kept off main** (done, 2026-10-09; *The trial*, above):
   - PDFium bound, in its own process, on the Mac and on Windows, and the
     Mac's signed app loading it;
   - how long a paper's first page, and a tile, take to show, and how
     fast pictures go from the process to the window;
   - one canvas drawing the workspace and the column, a page going from
     one to the other;
   - how a word broken across a line's end is found.
1. **A PDF on the page** (built, 2026-10-09; *As built*, above): opened,
   dropped or pasted, held and saved; its stack, coming up as it is zoomed
   into, its pages turned and spread.
2. **The column on the canvas** (built, 2026-10-09; *As built*, above): a
   PDF read there, joined to its stack; its page number and links; texts
   still in HTML beside it until step 5.
3. **Text and search** (built, 2026-10-09; *As built*, above): selecting
   and copying, on the stack and in the column; *This PDF* and *All PDFs*;
   words dragged out onto the page.
4. **Pictures**: from image files and the clipboard (built, 4a,
   2026-10-09; *As built*, above), and figures dragged out of a PDF
   (built, 4b, 2026-10-09; *As built*, above); moved, scaled, turned,
   tied to their source.
5. **Texts drawn with WebGL**: first a small trial of typing alone,
   Japanese through the IME on a Mac and on Windows, shown before the
   rest; then a text's sheet on the page, the column's text and its
   typing drawn by Meno, and its colouring; and words on the page written
   in place drawn by Meno too, so that they break into lines as they will
   be kept (the maintainer, 2026-10-09).

Each step is a pull request of its own, checked in the built app on the
Mac (and on Windows for steps 0, 1 and 5). Then stage 5 (*Stage 5*,
above): the paths and letters a PDF's vector figure is made of read
straight from PDFium (part A, built), and a picture read as a structure by
a model, as a plugin with consent for its weights (part B, built), each
drawn beside its figure and tied to it.

## Not yet

- **Pictures in Export and *Copy picture*** of the drawing. They come
  when it is clear how a picture should go into a picture of the
  drawing (EMF, SVG, PDF).
- **Annotating a PDF** (highlights, notes on its pages). Notes go on the
  page beside it instead.
- **Opening a PDF from the web**, by its address or its DOI.

## Questions

None left open (2026-10-09). The specification as a whole is for the
maintainer to agree to before step 0's trial is shown.
