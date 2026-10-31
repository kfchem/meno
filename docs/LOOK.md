# How Meno looks

Meno is judged by how it looks as much as by what it does: a control not
Meno's own, a colour picked by eye, a highlight that is not the
canvas's own, each says the tool was not made with care (the maintainer,
2026-10-23). This is the standard every screen is held to. Its values are
taken from what Meno already uses; where two things differed, the one used
most is the standard and the other is listed under *Not yet*.

Every pull request that changes what is seen carries before and after
shots, and is checked against this page (*The look check*, below).

## Rules

1. **Meno's own controls only.** No `<select>`, radio or checkbox drawn by
   the browser: the shared controls in `src/ui/controls` (*Controls*,
   below). A new kind of control is added there, not drawn in place.
2. **Colours from the tokens only.** No colour written as a literal in
   the interface (`#…`, `rgb(…)`, a Tailwind default such as `gray-200` or
   `red-700`): the tokens below, in CSS by their Tailwind names, in code
   from `src/ui/theme/colors.ts`. A colour made from data (a swatch, a
   gradient's stop, a value worked out) is written by `colourCss()` from
   the same file, never by hand. A drawing's own colours - elements,
   ink, a ribbon's palette, a colour set - are the drawing's, not the
   interface's, and live with it.
3. **One highlight.** What is pointed at or picked of a structure,
   wherever it is drawn - the canvas, a PDF, a card - is shaded as the
   canvas shades it (*Highlights*).
4. **Nothing changes at a jump** (`src/ui/theme/motion.ts`): a highlight,
   a hover, a menu, a card, a move, each eased in the times and curves
   below.
5. **Room round what is shown.** Ink never touches a frame's line or its
   neighbour's ink (*Room*).
6. **Nothing on the canvas is the page's text.** The canvas and what lies
   over it - notes, chips, cards, a set's words - never show the browser's
   own text selection: they are `select-none`, and a selection that reaches
   there all the same is let go. What is selected there is Meno's own
   selection. Text fields, and the words in the column, stay selectable;
   on the canvas, only what a chemist copies - a step card's failure, its
   program's line, a run's line (`COPYABLE`, with `select-text`).
7. **On the page, WebGL draws; HTML is for what a person handles** (the
   maintainer, 2026-10-27). What sits on the page and moves with it - a
   mark, a label, a note, a frame, R/S - is drawn by WebGL, with the page,
   so it never lags a pan or fades apart from it. HTML over the page is
   kept for controls (a button, a slider, a field, a handle to drag) and
   for words a person may copy (`COPYABLE`). A thing with both draws its
   ink in WebGL and lays only its control over it in HTML, and only while
   it can be used - a measure's field while it is being edited, a tip
   while it is pointed at. The valence and "either way" boxes and R/S, in
   2D and beside a molecule in 3D, are drawn so (`MarkBoxes2D`, `Texts2D`,
   `StereoInk3D`); the rest of the page's HTML moves over in turn.

## Colours

The source is `src/App.css` (`@theme`); `src/ui/theme/colors.ts` holds
the same values for what is drawn in code (the canvas, WebGL, SVG), and a
test keeps the two the same (`src/ui/theme/colors.test.ts`).

| Token | Value | For |
|---|---|---|
| `gh-black` | rgb(31, 35, 40) | text |
| `gh-gray` | rgb(89, 99, 110) | text that says less: notes, shortcuts, a disabled item |
| `gh-line` | rgb(209, 217, 224) | every line of the interface: borders, separators |
| `gh-base` | rgb(246, 248, 250) | a row or button under the pointer; a chosen chip; a panel's ground |
| `gh-background`, `accel-white` | white | menus, cards, the page |
| `accel-base` | rgb(49, 118, 137) | Meno's own colour: what is chosen (a segment, a radio's dot, a checkbox's tick, a switch on, a slider's thumb), a primary button, a focused control's border |
| `accel-lightbase` | rgb(207, 231, 238) | a chosen card or chip's ground (a look, a format), with an `accel-base` border |
| `accel-accent` | rgb(205, 69, 96) | what asks for attention: an error, a refusal, something left open |
| `accel-lightaccent` | rgb(245, 218, 223) | an error's ground |
| `highlight` | rgb(30, 144, 255) | what is pointed at or picked (*Highlights*), only there |
| `found` | rgb(212, 167, 44) | what a search found in a text |

Not the interface's: element colours (`src/lib/chem`), a drawing's ink
(black, `MENO`'s #141414), colour sets, code colouring.

## Type

IBM Plex Sans throughout (Plex Sans JP for Japanese, Plex Mono for code),
from Meno's own files. Sizes:

- `text-sm` (14 px): menus, cards' and dialogs' text, Settings.
- `text-xs` (12 px): controls, chips, a card's rows, toasts.
- `text-[11px]`: a note under a control, a menu's note.
- `text-[10px]`: a chip on the page at its smallest; nothing else.

Bold is the semibold (`font-semibold`), for a card's or dialog's title.
Numbers that change in place are tabular (`tabular-nums`).

## Sizes, room and corners

- **Controls** are `h-7` (28 px): a select, a segmented choice, a button,
  an input. A menu's row is `h-8` (32 px).
- **Padding**: a control `px-2` (a button `px-2.5` or `px-3`); a menu's
  row `px-3`; a card `p-3`; a dialog `p-5`; a menu `py-1`.
- **A card's insets** are the same on both sides: what is in it - a
  list, a field and its unit, the buttons at its foot - ends on one edge
  on the right, inside the card's padding, however narrow the card (a
  step's card is 208 px).
- **Corners**: `rounded-md` (6 px) for controls, menus, chips and toasts;
  `rounded-lg` (8 px) for cards and dialogs; `rounded-full` for a dot, a
  switch, a pill. Not the bare `rounded` (4 px).
- **A box on the page** (a shape the drawing holds, not the interface's):
  its corners, rounded, are a fifth of a bond round (*Box around these*,
  *Corners…* > *Rounded*), so that they scale with the drawing; never
  more than 18% of its shorter side.
- **Lines**: 1 px, `border-gh-line`; a separator `my-1 border-t
  border-gh-line`.
- **Shadows**: `shadow-lg` for what floats over the page (menus, cards,
  dialogs); `shadow-sm` for toasts and chips; what the pointer carries (a
  structure lifted from a PDF, a picture or words in flight)
  `filter: drop-shadow(var(--meno-lift))`; nothing else.
- **Over the page**: a card's ground is `bg-white/95`, so the drawing
  shows faintly beneath. A card's foot that stays while its rows scroll
  (its buttons) is on solid `bg-white`, parted from them by `border-t
  border-gh-line`, so that nothing shows through it.

## Highlights

One look for a structure pointed at or picked, wherever it is drawn
(`src/ui/features/Workspace/components/selectionShade.ts`, the one
source of its measures):

- **Pointed at, an atom**: a filled disc of `highlight` at `ALPHA.highlight`
  (0.6), radius 0.26 of a bond, swelling in (`AtomsHoverRings2D`); **a
  bond**: a band 0.16 of a bond wide (`HoverOverlay2D`).
- **Selected**: a disc under each atom (radius 0.26 of a bond) and a band
  along each bond (1.1 times the disc's radius), in `SELECTION_SHADE`
  (the highlight at 0.45 of its strength, opaque, so that where discs
  and bands meet it is no darker), under the drawing.
- **A whole structure pointed at** (a PDF's): the selection's discs and
  bands at half its strength; picked and pointed at, 1.3 times.
- **Text**: `highlight` at 0.3 behind the letters; found, `found` at 0.3
  (0.6 for the one shown).
- **3D**: an outline blended from white towards `highlight`
  (`Molecule3DView`).

Never a rectangle, a ring or a colour of its own round a structure.

## Motion

From `src/ui/theme/motion.ts` (`--ease-meno`, `--ease-meno-leave` in CSS):

- **Times**: `DURATION.quick` 120 ms (a colour, a highlight, a hover),
  `base` 160 ms (something coming into view or going: a menu, a card, a
  mark), `move` 220 ms (the drawing or the view going somewhere).
- **Curves**: `EASE` for what comes in or moves; `EASE_LEAVE` for what
  goes out of view; `EASE_SLIDE` for a panel sliding beside the canvas.
- In CSS: `duration-150 ease-meno` for a control's colours (the base
  layer does this for every button), `meno-fade-in` and `meno-fade-out`
  for what comes and goes.
- A highlight's strength is eased, not switched: on in `quick` with
  `EASE`, off in `quick` with `EASE_LEAVE`.

## Room

- **A structure shown in a frame** (a workflow's set, a card): its ink -
  its bonds and its labels' letters, not only its atoms' centres - keeps
  at least half a bond (24 px at 48 px a bond) from the frame's line, and
  at least half a bond from the next structure's ink. A frame's name row
  is 36 px.
- **Text in a control** keeps its padding; a label never touches a
  control's edge.
- Agreed with the workspace's placement (#595): the values live in
  `workflow/look.ts`, and a structure's box includes its labels.

## Controls

`src/ui/controls` (Meno's own, matching its menus):

- **Select**: a button `h-7 rounded-md border border-gh-line bg-white
  px-2 text-xs` with a chevron in `gh-gray`, opening a menu as the
  canvas's menus are drawn (`rounded-md border border-gh-line bg-white
  py-1 shadow-lg`, rows `h-8 px-3`, `hover:bg-gh-base`, the chosen one
  ticked), by keyboard as well as pointer. The menu shows nine rows whole
  at most, so a list of nine is never cut by its own padding. A longer
  one shows half the tenth, so that it can be seen to go on (`LIST_ROWS`).
- **Segmented choice** (few short choices, all shown): `rounded-md border
  border-gh-line`, segments `h-7 px-2.5 text-xs` parted by `border-l
  border-gh-line`, the chosen one `bg-accel-base text-white`, the others
  `bg-white hover:bg-gh-base`.
- **Choice of cards** (a look, a format, each a picture or a word with a
  note): the chosen one `border-accel-base bg-accel-lightbase`.
- **Radio**: a 14 px circle, `gh-line`, the chosen one's dot
  `accel-base`.
- **Checkbox**: a 14 px square, its corners 2.5 px round, `gh-line`,
  ticked on `accel-base`.
- A small round or square mark (a radio's ring and dot, a checkbox's box)
  is drawn as an SVG shape, not a bordered box with rounded corners: a box
  14 px across is 17.5 device pixels at 125%, and its width and height
  round apart, a circle seen as a stadium.
- **Switch** (a setting turned on or off at once): a pill `h-6 w-11
  rounded-full`, `bg-gh-line` off, `accel-base` on, its white knob
  sliding; `accel-accent` on only where being on refuses something
  (working offline).
- **Number field**: a text field `h-7 rounded-md border border-gh-line
  bg-white px-2 text-right tabular-nums`, no browser steppers (up and down
  step it). It holds whatever is typed until Enter or leaving it, so a
  digit can be taken out and another typed; a number it does not take
  goes back to the last good one, fading in, the border a moment
  `accel-accent`.

Each is reachable by keyboard and shows focus with an `accel-base` border.

## Icons

- **Read without their names** (the maintainer, 2026-10-28). Every icon
  says what it does without a word under it. Where none would, a menu item
  is words alone ("Reset orientation"), or the icon is the letters
  themselves, as a chemist writes them ("3D", "R/S").
- **Each its own.** No two actions share an icon: Energy window and Check
  structures, Populations and Descriptors, As conformers and Enumerate each
  have their own; sparkles are Generate's alone, a funnel is Filter's.
- **Drawn as Quick Add's are**, where the thing itself has no icon in
  Heroicons' outline set: a 20-unit square, lines 1.8 wide (as heavy as a
  Heroicon at 2.1 on its 24), ends and corners round; solid where a solid
  reads better at 20 px (the balls of a ball-and-stick, a space-filling
  model). `menuIcons.tsx`, `workflow/icons.tsx`.
- **What a stock picture already means elsewhere is not borrowed**: no
  sparkles for Clean-up (a broom), no cube for 3D, no refresh arrows for an
  orientation, no Wi-Fi bars for frequencies (a spring), no bolt for an
  energy, no cloud for NCI's surfaces in place of the thing itself.
- **A file Meno opens** shows Meno's sheet, its folded corner and mark,
  with the format's short name on a dark band (`src-tauri/icons/formats`).

## The look check

Every pull request that changes what is seen carries before and after
shots of what changed (as the GUI harness takes them: the window only).
They are checked against this page by the look owner, who answers *LOOK
OK* or says what to change and why, rule by rule. A lint rule
(`eslint.config.js`, from `src/ui/theme/lookRules.json`) catches what can
be caught by reading the code: a native select, radio or checkbox outside
`src/ui/controls`, and a colour written out - a literal that is only a
colour, one in a CSS place (after `:`, `(`, `,` or `[`), `rgb(…)`,
`hsl(…)`, or Tailwind's default palette - outside `src/ui/theme`; and a
switch drawn in place (`role="switch"`) outside `src/ui/controls`; and a
native number field (`type="number"`) outside it.

## Not yet

Known departures, to be brought in line. `src/ui/theme/lookRules.json`
names each file that has one, with how many places, and
`lookRules.test.ts` holds each to its count as a ceiling: a new place in
a listed file fails as surely as one in a new file. A file with fewer
places than its count passes, and the test says to lower the count, so
that it comes down on purpose (a file at none leaves the list). When the look
rules were set (2026-10-23):

- **Native controls**: none since the shared controls replaced the 16
  there were; the list stays, empty, so that one cannot come back.
- **Colours written out**: 155, in 69 files. Many are a drawing's own
  ink (black and white on the 2D canvas), a ribbon's or code's palette, or
  a colour set's swatches, to be moved beside the drawing's colours; the
  rest repeat a token (gh-line, gh-base, gh-gray, accel-base written out)
  or are Tailwind's default greys and reds (`hover:bg-gray-100`,
  `text-red-700`) in place of `gh-base` and `accel-accent`.
- CSS transitions at 150 ms where `DURATION.quick` is 120 ms.
- The bare `rounded` where `rounded-md` is meant.
