# Conversations on the page

A conversation with a language model, as an object on the page: a card in
a frame, whose frame is what the conversation may see. Its design comes in
a pull request of its own; what is built of it is below, as it is built.

## As built

### The frame is its scope (2026-11-04)

What a conversation sees is what lies inside its frame
(`ui/features/Workspace/conversation/scope.ts`, `inScope`): each thing
whose middle is inside it, as a set's members are found (`lyingIn`) and as
a box selects. That covers:

- structures drawn;
- molecules in 3D and pictures;
- text sheets (by their sheet's middle) and PDFs (by the middle of their pages as they lie);
- arrows and pluses;
- words on the page;
- a workflow's sets (by their frame's middle) and steps (by their card's middle).

Words that go with an arrow are the arrow's. A conversation made one of
the whole page sees all of it.

The scope is worked out anew from the page as it is, each time a tool
asks. A thing moved in is seen by the next call; one moved out is not. The
frame moved alone changes what lies inside it, as a set's does, and moves
nothing on the page.

A text without a sheet of its own lies nowhere on the page, and is never
seen. That covers a step's log and a calculation's output shown from a
molecule: a whole log or output is not a conversation's to read.

### Meno's tools to read (2026-11-04)

Meno's own commands, called with plain data, never gestures replayed
(`conversation/tools.ts`, `callTool`). A thing is named by its kind and
id: `molecule:3`, `step:12`. A structure drawn is named by its first
atom's id, which it keeps however it is edited while that atom stays.

- **`list`** gives each thing in scope, as a line:
  - *a structure drawn: CO*;
  - *a molecule in 3D: H2O · B3LYP/def2-SVP · gas phase*;
  - *a step: Energy window · by meno · done*.
- **`read`** gives one in full.
  - A structure drawn: its atoms and bonds as Meno keeps them, and its SMILES as Meno writes it from the drawing. Where the drawing says stereo, which that SMILES does not write, it says so.
  - A molecule in 3D: its formula and atoms (up to 2000; past that, its counts alone), how many frames, its energies in hartrees, and its calculation (program, level, charge and multiplicity). Where it has imaginary frequencies, how many each frame has.
  - A text: its name and words, cut after 100,000 characters, saying so.
  - A PDF: its name and how many pages.
  - An arrow: the words that go with it.
  - Words on the page: their text.
  - A set: its name, and how many structures, molecules and pictures it holds.
  - A step: its kind, who does it, its options, and what its last run said - done or not, and its line. It also says whether it is running.

A thing outside the scope is answered as one that is not on the page, in
the same words: *There is no such object*. Nothing is learnt of what
lies outside.

The tools never give a job's folder or its files, a whole log or output,
an input file, a wavefunction kept, or anything of where Meno keeps its
own. None of them lies on the page.

A tool Meno does not have is said to be none: *There is no tool called
"run"*.

The tests play a scripted test model's calls on a page and check each
answer.
