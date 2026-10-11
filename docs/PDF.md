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

1. **PDFium, not pdf.js.** PDFium is the engine Chrome reads PDFs with.
   The maintainer chose it for how fast and how faithfully it draws;
   viewers built on pdf.js, as some publishers' have been, left a poor
   impression. No way of changing engines is to be kept: Meno is built
   on PDFium, for the best it can give.
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
  - The wheel or two fingers over the stack go to the next page and the
    one before, the top page lifting off and going under (*Movement*,
    below).
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
  over it.
- **While a pinch or a zoom goes on**, the tiles there are scaled on the
  graphics card, and drawn again sharper once it stops. Nothing waits
  for PDFium.
- **Only what is in view is drawn**, nearest first, then the pages next
  in the way the view is going. A tile no longer wanted is dropped, not
  finished. Pages far out of view are let go, and drawn again when they
  come back.

### Text

- **A drag that starts on text selects text**, as in any reader: a
  double-click selects a word, a triple-click a line. ⌘C copies it, and
  the right-click menu has *Copy*.
- **PDFium says where each letter is**, and Meno selects and marks by
  that, on the stack and in the column alike.

### Search

- **⌘F** with the column or a PDF in front, or *Find in PDF…* in Meno's
  menu, opens a field at the column's top. It has two choices beside it,
  *This PDF* and *All PDFs*.
- **What it finds**:
  - each place is marked on the pages, in the column and on the stacks;
  - the places are counted (*3 of 12*);
  - Enter goes to the next, Shift+Enter to the one before, and Esc
    closes the field.
- **With *All PDFs***, the places are listed under each PDF's name, and
  going to one shows that PDF.
- **How letters are matched**: by PDFium's own search, without regard to
  case. Whether a word broken across a line's end is found is measured in
  the trial (step 0), and made so if PDFium does not find it.

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

## A picture

- **From anywhere**: a figure taken out of a PDF, an image file (PNG,
  JPEG) opened or dropped, or a picture pasted from the clipboard, such
  as a screenshot.
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
  with where each letter is, search, links, and what a page is made of
  - paths, text and pictures - which stage 5 reads.

### Where it runs

- **In a process of its own**, as calculations' jobs are (`Meno --job`).
  Meno starts itself as a PDF reader, `Meno --pdf`, when a workspace
  first shows a PDF, and talks to it by its standard input and output.
- **A PDF that breaks PDFium breaks that process only.** The PDF says
  so on the page and in the column, with *Open again*; Meno, and the
  work not yet saved, go on. Chrome keeps PDFium apart for the same
  reason.
- **It draws on threads of its own**, a page at a time, each part in a
  way that can be stopped. A request no longer wanted is dropped.
- **Pictures come back as they are drawn**: the colours of each pixel,
  in the order a WebGL texture takes them (PDFium's
  `FPDF_REVERSE_BYTE_ORDER`), with no image format in between. They go
  to the window as bytes, not as text (Tauri's binary response).

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
  - ship every one of these licences, in `resources/licenses/pdfium/`;
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
  web link opens in the system's browser only when it is clicked.
- **PDFium runs apart** (*Where it runs*, above), so a PDF made to break
  it takes nothing else with it.
- **Its text and pictures go no further than the page, the column and
  the clipboard**, as the chemist moves them.

### Platforms

- **The same PDFium on every system**: the library for macOS (Apple
  silicon), Windows (x64) and Linux (x64), from the same release.
- **Carried in the app**:
  - on a Mac, inside the app, signed with it;
  - on Windows, beside Meno's program, with a line in the installer's
    hook for when it is renamed or goes (RELEASING.md);
  - on Linux, beside it as well.

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
- **PDFium's own search does not find a word broken by a hyphen at a
  line's end** (the article's *computa-tional* among them): it gives the hyphen as U+0002 and the line's end as
  `\r\n`. Meno searches the page's text itself, a line's end read as a
  space and a broken word read whole, each letter pointing back to its
  box - found and marked on both lines.
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
- **Printed size.** A PDF lies on the page at the size it is printed: a point is a fourteenth and a half of a bond, as the ACS's style prints a bond 14.4 points long.
- **Spread pages** lie in rows of four, the first where the stack's top page lay.
- **PDFs lie under the drawing** for now. Their place among the other things, by when they were put there, comes with pictures (step 4).
- **The cache is never cleared yet.** A PDF stays in Meno's cache once held, so that a workspace opened later finds it, and the cache grows with the PDFs opened.

Not yet, and where it comes:
- **Selecting PDFs with others**: by a click, a box or a lasso, and copying, cutting and pasting them. This comes with pictures (step 4); for now a PDF is moved alone.
- **Pasting a PDF copied in the Finder or Explorer.** For now it is opened or dropped.
- **A double-click opening it in the column**: came in step 2.

### Step 2: a PDF read in the column (2026-10-09)

Built:
- **The column lies over the canvas.** The canvas spans the window, and the column of texts lies over its right side; its header stays in HTML, and what it shows of a PDF is drawn by the canvas under it, in a view of its own (`PdfColumn.tsx`). As the column opens, shuts or is dragged wider:
  - the view moves by half as much, eased, so that what was in the middle of what could be seen stays there;
  - fitting, pasting and bringing a PDF into view use the part it does not cover;
  - what is on the page in HTML (a step's card, words being written) is cut off where the column begins.
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
- **Links on the stack** are followed by a click that does not move it; the pointer is the system's hand over them.
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
  - On a stack at full size, a drag moves the view, as a drag on empty space does. Held still a moment on its words - as a box begins on empty space, the same ring spreading - the word under the press is selected, and the selection is drawn on from it as the pointer goes. A click selects nothing; two read the PDF in the column.
  - A press between two lines, or just past a line's end, counts as on the line beside it.
  - The words selected are marked in Meno's light, the same on the stack and in the column.
  - Cmd/Ctrl+C copies them, or *Copy* in the PDF's menu; a right-click in the column opens that menu too.
  - Selecting words lets the drawing's selection go. Esc, or a click elsewhere, lets the words go.
- **Searching**, with Cmd/Ctrl+F or *Find in PDF…* in the Edit menu.
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
- **Moving a stack.** At full size, a drag on it moves the view, as on empty space. Held still a moment on its rim - by its pages' edges, on the pages under the top one, or on its name - the PDF is taken hold of: the selection's shade spreads over it from the pointer, as over a structure held, and the drag then moves it, as one step. An icon is moved by a drag.

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
- **A JPEG on the clipboard**, as some browsers copy a photograph: only a PNG or a bitmap is read for now.
- **Reading a picture as a structure**: stage 5.

### Step 4b: figures cut out of a PDF (2026-10-09)

Built:
- **Where a page's figures lie** (`pdf_objects`, `lib/pdf/figures`). PDFium lists what a page is made of - its words, paths, pictures, shadings and forms - each with its box, in points from the page's top left as it is drawn. From them:
  - A figure is where pictures and paths lie within 8 points of one another. It is at least 24 points one way and 4 the other (a chain drawn flat is a figure, a word's underline none), or it holds a picture.
  - A rule (at most 1.5 points thick and at least 150 long) is no part of one, nor is anything over most of the page, such as its frame.
  - Words over a figure or within 6 points of it, each narrower than six tenths of it, are its labels, and its box takes them in. Its caption, and a column's lines beside it, are not.
  - A page's figures are worked out once, when its words are first wanted: as it comes into the column, or onto the screen at a size its words can be read.
- **A box, in the column.** A press in a figure, or where no word is near, begins a box.
  - Let go where it was pressed, in a figure, it is that figure's box, labels and all. On a link, the link is followed instead.
  - Dragged, the box is drawn by hand from the press to the pointer, on that page. The column moves on as the pointer nears its top or foot.
  - Two clicks and three still select a word and a line.
- **A box, on a stack at full size.** A drag there moves the view, so a box begins with a long press - in a figure, or where no word is near - with the same ring spreading as words are selected with. In a figure, the figure's box comes at once; dragged on, a box is drawn by hand.
- **The box** is outlined, and shaded in Meno's light, on the stack and in the column alike. A box smaller than 6 points either way is let go. Esc, a click elsewhere, or anything else selected lets it go.
- **Carried out.** The box pressed and dragged lifts off the page toward the viewer: a white sheet, a soft shadow falling under it, its picture coming into it as soon as it has been drawn. Held where it was pressed, it follows the pointer; over the canvas it is as large as the canvas shows the page. It is drawn in the column's last pass, as words carried out are, over the column too.
  - Let go on the canvas, it settles there and is a picture on the page, just where it was let go, selected, as one step.
  - Let go anywhere else, it goes back down onto the box.
  - Pressed and let go where it was, the box stays.
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
- **A scanned page**: it is one picture over most of the page, so no figure is found on it. A box drawn by hand takes part of it.
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
- **What does not read as its grammar says is marked**: underlined in Meno's attention colour - a part read wrongly, or where something is missing, a letter's width. Not on the line the caret is on while the text is typed in, until it is left. An output's grammar takes any text, so nothing in an output is marked.
- **The grammars the plugins Meno carries bring**, each from the program's own words - its manual, or what it printed in runs made with Meno:
  - **ORCA's input** (the ORCA interface, `.inp`): simple keyword lines, blocks with their options and values and sub-blocks with their own `end`, `%maxcore` with its one value, the geometry and its atoms, a geometry read from a file, comments (ORCA's manual, *General Structure of the Input File* and *Input of Coordinates*). Marked: a block left open - at the next block or geometry - and a geometry with no closing `*`.
  - **Gaussian's input** (the Gaussian interface, `.gjf`, `.com`): Link 0 commands, the route section and its lines on, the title, the charge and multiplicity, the atoms (Cartesian or a Z-matrix), further sections, `--Link1--`, comments (Gaussian's *Input* page). Marked: no route section, and a molecule with no charge and multiplicity line.
  - **Gaussian's output** (cclib, PySCF): *SCF Done:*, the energies with thermal corrections, *Optimization completed.*, *Converged?* as what a reader looks for; *Stationary point found.*, *Normal termination of Gaussian* and a criterion's *YES* as a run gone well; a line from *Warning* on as a warning - as Gaussian 16 printed them.
  - **ORCA's output** (cclib, PySCF): *FINAL SINGLE POINT ENERGY*, *SCF CONVERGED AFTER*, the geometry's convergence, the free energy and enthalpy, the frequencies; *THE OPTIMIZATION HAS CONVERGED* and *ORCA TERMINATED NORMALLY* as a run gone well - as ORCA 6.1 printed them; *ORCA finished by error termination* as an error (ORCA's manual, *Troubleshooting*).
  - **xTB's output** (cclib): *TOTAL ENERGY*, *TOTAL FREE ENERGY*, *HOMO-LUMO GAP*, *SCC energy*; *GEOMETRY OPTIMIZATION CONVERGED* and *normal termination of xtb*; *[WARNING]* lines as warnings; *ERROR STOP* and *Error termination* as errors - as xTB 6.7 printed them.
  - Rules of dashes, equals signs, stars or dots in outputs are grey.
- **Drawn in the column**: each line's parts in their tones, the line drawn whole in each colour and kept to its parts, so that its letters lie just where they would in one. What the IME is composing is drawn uncoloured, as it is. The colours are from the palette the column's look is taken from: red keywords, dark blue strings, blue numbers, options and keys, grey comments, purple definitions and what an output's reader looks for, green XML names and atoms, a deeper green for a run gone well, amber warnings, and Meno's own attention for errors.

**Words on the page typed in place** (`components/CaptionTyping2D.tsx`, `utils/wordsEditor.ts`), in place of the field shown over them in HTML:
- **Drawn by Meno as they will be kept**: set as the drawing sets its labels (a formula's counts low, a prefix in italics), in its typeface at its size, broken into lines as wide as they were made where they were given a width, laid as they will lie - so that what is written is what is kept, its lines broken as they will be. Lit round while they are written.
- **The caret, what is selected and what the IME composes** are drawn over them, in the drawing's units: the caret blinking, the selection in Meno's light, what is composed underlined clause by clause. Where each place lies comes from how the words are set (lib/chem/captions `captionPlaces`): before each letter, a formula's count no wider than it is set, and spaces the setting runs together standing where the space it keeps does.
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
- **A letter no typeface of Meno's has - an emoji - is a white square on the page** (labels, words on the page, sheets, names), measured as one, the rest of its text drawn as ever. The canvas's text renderer looked for it on the network, which the window may not reach, and left the whole text it was in undrawn: a word typed in place with an emoji in it showed its first letters alone, and the IME's underline ran under nothing. The column draws it in the system's type, as it is. Drawing it on the page will come with a typeface fetched with leave (the maintainer, 2026-10-10: later): a purpose of its own asked about once, as Python's download is, the app fetching the typeface and keeping it, the window drawing from it - the window itself reaching nothing still (docs/ARCHITECTURE.md, *The network*). One letter at a time in one colour, as troika draws.
- **troika changed where it is installed** (`scripts/patch-troika.mjs`, after every install; the maintainer chose it, and no report to troika): it applied every GPOS lookup whatever its feature, so IBM Plex Sans JP's half-width and proportional forms closed up its ideographic comma and the letters after it lay over it (found on Windows); and it took each letter from the font the one before came from, so the Latin after a Japanese letter came from IBM Plex Sans JP, a degree sign a full em wide. Now, as a browser does: kerning and marks alone, and each letter from the first font that has it.
- **Lenient grammars.** A text written as its program reads it should never be marked: an ORCA block's `end` closes the block on the line it opens, and a sub-block's on its own line; a value block (`%maxcore`) is told by its name; Gaussian's route may go on over lines. What a grammar cannot tell without a program's list of keywords is not marked: a missing blank line after Gaussian's route section reads as more of the route.

Not yet, and where it comes:
- **Copying and pasting sheets**, and turning them with the selection's handle (it carries them not).
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
- **A stack moved by an undo still jumps** there, as before; only pages spread glide.
- **Selecting PDFs, or pages, with others**, to be moved, copied or deleted together (*Not yet* in step 1).

## In order

0. **A trial, kept off main** (done, 2026-10-09; *The trial*, above):
   - PDFium bound, in its own process, on the Mac and on Windows, and the
     Mac's signed app loading it;
   - how long a paper's first page, and a tile, take to show, and how
     fast pictures go from the process to the window;
   - one canvas drawing the workspace and the column, a page going from
     one to the other;
   - whether PDFium's search finds a word broken across a line's end.
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
Mac (and on Windows for steps 0, 1 and 5). Then stage 5: a picture read
as a structure (MolScribe or DECIMER, in the sidecar, with consent for
their weights), and the paths and text a PDF's vector figure is made of
read straight from PDFium, each drawn by Meno's engine beside it, tied
to it.

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
