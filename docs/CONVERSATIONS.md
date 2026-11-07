# Conversations on the page

A conversation with a language model, as an object on the page: a card in
a frame, whose frame is what the conversation may see. This is its design
for stage 1, agreed on 2026-11-04 with the maintainer's answers
(*Decided*, below), and what is built of it, as it is built (*As built*).
Judge it against [PURPOSE.md](PURPOSE.md): Meno is the chemist's
instrument, and a model is a help inside it, never the one doing the
research.

## What it is for

A model helps inside Meno; it never runs the research. What it gives back
is Meno's own things: structures drawn, arrows, texts and workflow steps
put on the page. Its words stay in the conversation. Nothing it does runs
a calculation, fetches anything or changes a setting: those stay the
person's clicks.

**A reply is plain text**, shown as text and never as a page: no HTML is
drawn, and no picture is loaded and no link opened from it. A web address
in it is shown as words, and opened only where the person clicks it, on
their own decision. A picture or link in a reply is the usual way data
leaves - fetching it sends what its address holds - so none is fetched.
The same holds for the exchange as it is saved and opened again.

## The Conversation object

- **A card on the page, inside a frame.** It opens in the right column, as
  a text sheet or a PDF does. The column shows the exchange, what was
  sent, and the changes waiting to be kept.
- **The frame is its scope.** What lies inside the frame is what the
  conversation may see and change. The rule is the one sets use: a thing
  lies inside where its middle does (`lyingIn`), extended to the kinds a
  set does not hold - text sheets, PDFs, arrows, words on the page, and a
  workflow's sets and steps.
  - Put a thing inside to let the conversation see it; move it out to
    stop that.
  - The frame moved moves its card and leaves what lay inside where it is.
    What lies inside changes with it, as a set's members do.
- **Its frame looks unlike a set's** (the maintainer, 2026-11-07): what
  lies inside it may be sent away from this computer, so its line is its
  own, dashed in Meno's colour - heavier pointed at, heavier still read in
  the column, eased - and its tab says where it may go: *May be sent to*
  the hosts its model plugin's manifest names - those its consent names
  and Meno holds it to - *Stays on this computer* for Meno's scripted
  test model, run here, or *Sends nothing* without one; its icon a cloud with an arrow
  out of it, or a computer.
- **Each conversation is apart.** Two frames never share what was said or
  sent.
- **A conversation of the whole page** is a flag on its card, not a frame
  the size of the page: *this conversation sees the whole page*, said on
  the card in Meno's warning colour. The person sets it, and it is never
  set for them.
- **Notes for a conversation are text sheets inside its frame**, under the
  same rule. Stage 1 keeps nothing across conversations or workspaces.

## The scope is held in the tools, never in what a model is told

- Each tool call works out the scope anew, at the moment of the call, from
  the page as it is.
- A thing outside the scope is answered exactly as one that does not
  exist: *There is no such object*. Nothing is learnt of what lies
  outside, and nothing of it is put into anything sent.
- What a model is given to read - a text, the words of a PDF's page, a
  name - may hold words aimed at it. It is data, never instructions, and a
  tool's answer gives it marked as data, apart from what Meno says. The
  tools are the line: the most such words can do is propose changes
  inside the frame, held for the person to keep or discard. No tool
  reaches a file, a folder, the network, Settings or a run.

## Meno's tools

Meno's own commands, called with plain data, never gestures replayed.
Listings first, and a thing in full only when asked for.

**To read**
- `list`: what lies inside, each thing as its id, its kind and a line of
  what it is.
- `read`: one thing in full.
  - A structure drawn: its atoms and bonds, and its SMILES as Meno writes it.
  - A molecule in 3D: its atoms, its charge and multiplicity, its energies with the level they were found at, and its imaginary frequencies.
  - A text: its words. A PDF: the words of the pages asked for, as Meno reads them; structures read from its pictures come in stage 2.
  - A set: how many of its members lie in scope.
  - A step: its kind, its doer, its options, and whether its last run was done or failed.
  - Never a job's folder or files, a whole log or output (they can be large, and some programs' outputs carry their licence text), an input file, a wavefunction kept, or anything of where Meno keeps its own.

**To search** - Meno's judgements, so core:
- the same compound, by Meno's identity (`identityKey`);
- a substructure, by Meno's own matcher (WORKFLOWS-FOUNDATION.md, *Whether one structure holds another*). A search that stops at its limit says it could not tell, never "not found".
- Similarity, properties, searches in 3D and SMARTS queries come in stage 2.

**To change**
- Place a structure, from SMILES or from Meno's plain data, inside the frame and clear of what is there; place an arrow, a plus or a text sheet.
- Build a workflow's steps through the page's own calls: add a step (with Settings' defaults for its role), wire, unwire, move, put down a procedure, and set a step's options.
  - A step's kind is changed only among those its doer fills.
  - Options are checked as the step's card checks them, and what its manifest refuses is refused in words: choices, least and most, types.
  - A step that is running is removed only on the person's yes.
  - A tool never changes who does a step. A procedure it puts down has the fields left to the person (below) at their defaults, or empty.
- Left to the person, never set by a tool:
  - cores and memory: a cost for the whole machine;
  - a program's free-text keyword fields, which can change the method, how it runs in parallel or the files it writes. The tool shows what it would type, for the person to type;
  - raw outputs and wavefunctions kept: disk use;
  - anything that picks atoms by number;
  - a switch the person has not asked about: it stays at its default.
- **Never reachable from any tool:** running, stopping or adopting a step's jobs; letting an undo through; a plugin's set-up or download; Settings; choosing atoms; folders; opening files.

## Changes as one step, with who made them

- **A change set.** What one turn of a conversation changes is one change
  set, and one step of the page's history, kept under a key of its own.
  It never joins the person's edits, before or after.
- **Who made it.** Every edit says who made it, and the history keeps it,
  so that an undo says *Undo: the conversation's 3 structures and a step*.
- **Kept or discarded.** The change set is shown on the page and in the
  column, with *Keep* and *Discard*. *Discard* takes it back through the
  same guards as an undo: where a step in it is running, the person is
  asked, and its jobs are stopped only on their yes. A tool never undoes
  anything itself. Confirming each change one by one is stage 2, on the
  same change sets.
- **What a change makes run again is said before it is kept.** An option
  changed on a step that is done makes it not done, and the person's next
  *Run* below it runs it again. The change set says so plainly, with how
  many jobs that is.
- **What a conversation proposes is marked as its.** A structure or a step
  it placed says so on it, apart from Meno's own checks. It may call
  Meno's checks and attach what they say.

## Connections

**Only through a plugin** (the maintainer, 2026-11-04). Core holds no code
that talks to a model's service, and no way out for one: where no plugin
for it is added, nothing of a conversation is sent anywhere, and nothing
listens for a program outside Meno. Adding the plugin is the step of
trust, and its question says so plainly.

A Conversation object has one connection: a model plugin, or a program
outside Meno through a plugin of its own. Its frame bounds both alike.
With none added, a Conversation object can be placed and edited, sends
nothing, and its card says why in one line.

- **A model plugin**, of a new kind of role, *language model* (PLUGINS.md,
  *Roles*).
  - Core holds the conversation, the tools, the scope, the rights, the limits, the send log and the history.
  - The plugin calls its service and converts: Meno's messages and tools to its service's request, and the reply back to words and tool calls. It names its service and hosts as a plugin names its program; core names none.
  - Its connections go through the app's network gate under a purpose of their own; the consent names its hosts, and every connection made through the gate is in the network's record.
  - **What the gate is, for a worker.** A worker is a process of the person's own. It is pointed at the gate, but nothing on the system stops it opening a connection of its own: for it, the gate's hosts are a promise its plugin keeps and the record a log of what kept it, not a bar. So, in stage 1:
    - the *language model* and *outside entrance* roles are filled only by plugins of Meno's own catalogue - a plugin from elsewhere cannot fill them until a worker's network is confined by the system, or goes through Meno only: a later question;
    - those plugins' workers are reviewed to open no connection but to the hosts their consent names, and their tests - the scripted test model's too - check it;
    - adding one asks plainly: it names the service's host, and says the plugin sends what the conversation shares there, with the person's key, which goes to the plugin.
  - The key is the person's own, typed by them in Settings. Core keeps it in the system's keychain (the Keychain on macOS, the Credential Manager on Windows), by the `keyring` crate, and hands it to that plugin's worker in memory for each request: never in its arguments or environment, never in the .meno, Meno's log, the send log, a job folder or any file Meno writes. Where the system has no keychain Meno trusts, no key is kept, saying why; never in a file instead.
- **A program outside Meno**, connecting by the model-tool protocol, reaches
  the same tools through a plugin of its own kind, *outside entrance*.
  Without it added, nothing listens.
  - The plugin listens for one Conversation object, started on the person's click. It listens on a local socket only, never on TCP: a Unix socket in a folder of the person's own, readable and writable by them alone (mode 0600); on Windows, a named pipe whose access is the person's alone. Each call it takes it hands to core's tools, as a model plugin's tool calls are.
  - **Its token.** Random, from the system's generator, at least 128 bits; one per object; compared in constant time; dead once the object's listening stops. It is never put in a program's arguments or environment, which other people or programs may see: the person is shown it only on their click, and the bridge reads it from a file only they can read.
  - Most such programs start their tools as a command over standard input and output. The plugin brings a small bridge command: the program starts it, and it connects to the object's socket with the token.
  - It sees that object's frame and nothing else. It stops when the object is closed or deleted, or when the person stops it.
  - The card says so plainly: any program of the person's own that can read the token can drive that conversation, within its rights.
  - Each call is in the send log.
- **A scripted test model**: a plugin of the language-model kind whose
  worker plays back a script of replies and tool calls. It is for tests
  alone, never offered.

## Rights

Each conversation has two rights, shown on its card: *may read* what lies
inside, and *may propose changes*. A conversation with neither only talks.
A new one may read, and may not propose changes until the person turns
that on.
In stage 1, running is no right a conversation can have. A right to run,
given by the person for one conversation, is a question for stage 2: not
ruled out, and not built now.

## Limits

Each message the person sends has a limit to how many replies and tool
calls follow it, so that a loop never spends what the person pays for
their key without end. The card shows it, and *Stop* is always there; a
turn that reaches the limit stops and says so.

## The send log

- For each turn the log records what was sent: each thing by kind and id,
  how much of it, and how many characters. It also records where it went
  (the connection and its host, or the outside program) and when. The
  words sent are in the exchange, not the log; *Clear* empties both
  together.
- The card lists it. It says plainly that what was sent cannot be recalled,
  and that a thing moved out of the frame is not sent again but is not
  unsent. Not sent again means the exchange too: a tool's answer that gave
  a thing now outside the frame is sent, from then on, as withheld (*A
  turn*, as built).
- A key is never in it.

## Saved with the workspace

A conversation's exchange, send log and rights are saved in the .meno with
its object, by default. *Clear* on the card empties the exchange and the
send log. A .meno shared carries them, so *Save as* warns of that once, saying what
the file will hold: what was said, the model's words, and where they
were sent.
Deleting the object deletes them. Its connection is saved by name, never
with its key.

## Tests

- **The scripted test model drives every test.** No test calls a real
  service.
- **A real model is checked** with the maintainer's own key, typed by them.
  Nobody else types a live key.
- **Every case checks that no job folder is made.**
- The cases of stage 1:
  - a thing outside the frame is *no such object*, and in nothing sent; moved in, it is read on the next call;
  - the frame moved alone leaves the page as it was, and what lies inside changes with it;
  - both searches find only what lies inside;
  - two structures and an arrow placed are one undo, said to be the conversation's, never joined to the person's drag before or after;
  - *Discard* of a change set with a running step asks the person;
  - on a page of a conformer and transition-state search:
    - after a *Frequencies* that is done, the conversation adds *Rank* and *Ensemble* and wires them, and nothing runs until the person clicks *Run*;
    - it places an *Optimise* with valid options and nothing runs; an option out of range or unknown is refused in words;
    - it changes an option on an *Optimise* that is done; the step below is marked to run again, and the notice counts the jobs;
    - one undo of its change set while one of its steps runs asks the person;
    - it asks to run or stop a step, or to change the cores, and each is refused;
  - the send log lists what each turn sent and where;
  - a key typed is in the keychain and in no file Meno writes: the workspace, the logs and the settings file are searched for it; nor is it, or a token, in the arguments or environment of the bridge or of any worker;
  - with no model or outside-entrance plugin added, nothing is sent and nothing listens, and the card says why;
  - a reply holding HTML, a picture or a link is shown as text, and nothing is fetched for it;
  - a turn that reaches its limit stops and says so.

## Stage 1, as pull requests

Each is independent, from main, with its tests and its part of this file.

| # | What |
| --- | --- |
| 1 | This design. |
| 2 | Who made an edit: every edit says who made it, and a change set is one step of its own. |
| 3 | The scope, and the tools to read: `list` and `read`, *no such object* outside. |
| 4 | Search: the same compound, and a substructure by Meno's own matcher. |
| 5 | Changes: structures, arrows and texts placed inside the frame; steps built under the rules above; *Keep* and *Discard*; what will run again, said. |
| 6 | The Conversation object: its frame and card, the right column, the whole-page flag, saved in the .meno, *Clear* and the warning on *Save as*. |
| 7 | The *language model* kind of role: its manifest, its worker, its network purpose and hosts, the key kept in the keychain and handed to it in memory; with none added, a conversation that sends nothing, saying why. |
| 8 | A first model plugin, checked live by the maintainer with their own key. |
| 9 | The *outside entrance* kind of role, and its plugin: listening on the local socket for one object, its token, start and stop, the bridge command, every call in the send log. |

Stage 2: a model run on the person's own machine;
confirming each change; structures read from PDFs; similarity and searches
in 3D; SMARTS; notes kept across conversations; the question of a right to
run.

## Decided (2026-11-04)

The maintainer's answers to the questions of this design:

1. **The keychain:** the `keyring` crate, its licence MIT or Apache-2.0,
   its version pinned in the PR that adds it. No other new crate without
   asking.
2. **The outside entrance:** a local socket only, never TCP, with one
   token per object, and the bridge command over standard input and output.
   It is a plugin too, so that nothing listens unless it is added.
3. **A conversation of the whole page:** a flag on its card, in Meno's
   warning colour, not a frame the size of the page.
4. **The exchange:** saved in the .meno by default, with *Clear* on the
   card and a warning, once, on *Save as*.
5. **Through plugins alone:** core holds no code that talks to a model's
   service and no way out for one. Model requests are made by a
   language-model plugin only, with the key core keeps and hands it in
   memory; adding the plugin is the step of trust. Without one, nothing
   is sent.

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

- **`list`** gives each thing in scope, as a line, up to 500 of them, saying how many more there are:
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
  - A set: its name, and how many of the structures, molecules and pictures it holds lie in scope. A set's frame may reach past the conversation's, its middle inside it; what lies outside is not counted.
  - A step: its kind, who does it, its options, whether its last run was done or failed, and whether it is running. Never its run's line, which may give a program's or the system's own words, a folder's path among them, and sums up sets that may lie anywhere.

A thing outside the scope is answered as one that is not on the page, in
the same words: *There is no such object*. Nothing is learnt of what
lies outside.

The tools never give a job's folder or its files, a whole log or output,
an input file, a wavefunction kept, or anything of where Meno keeps its
own. None of them lies on the page. Nor does a thing in scope tell of
things outside it.

Names - a molecule's, a PDF's, a picture's, a text's - and texts come
from files and from people. What a conversation is given of them is
data: never words to it, however they are put. The conversation is to
hold them apart from its instructions when it is built.

A tool Meno does not have is said to be none: *There is no tool called
"run"*.

The tests play a scripted test model's calls on a page and check each
answer.

### The conversation, kept and saved (2026-11-05)

A conversation is kept with the page (`conversation/types`,
`conversation/ops`): its frame, or the whole page; its rights - a new one
may read and proposes nothing until the person lets it; the plugin it
talks through, by its id; what was said; and what was sent where. Put
down, changed and taken away, it is a step of the page's history. What is
said and sent is not: undo takes none of it back, and *Clear* empties both.
A workspace's file saves it all (`conversations`), and opening one reads it
back strictly (`conversation/saved`): one not as Meno writes it is left out
and said, as is a thing said that is not.

### Search (2026-11-05)

`search` finds, among the structures drawn in scope, those that are the
compound a SMILES names (by Meno's identity) or that hold it (by Meno's own
matcher). A structure the matcher could not finish is said to be one it
could not tell (`couldNotTell`), never one that does not hold it. A SMILES
Meno does not read is said to be one.

### The tools that change (2026-11-05)

Given only where the person has let the conversation propose changes
(`conversation/change`):

- `put_structure` draws a SMILES by Meno's own reader and layout engine
  and puts it down after the scheme's last piece, on its line, where that
  lies wholly inside the frame; else clear of what is there (`clearSpot`);
  else - the frame full - nothing: it is refused, saying the frame has no
  room left (`NO_ROOM`). Nothing is ever put over what lies there (a piece
  over another reads as a mistake), nor outside the frame;
- `put_arrow`, `put_plus` and `put_text` likewise;
- `add_step` adds a step, with Settings' defaults, of a kind its doer fills,
  in the frame's room, or is refused likewise;
- `wire` wires a set to a step, both in scope;
- `set_options` sets a step's options, checked as its card checks them.

A tool never sets an option its plugin leaves to the person (`person` in
its manifest), nor - until every plugin marks those - one of free text or
atoms, a switch, or a number with no bounds: those are "left to you to
set". Every id a change tool is given must lie in scope.

**The frame is the person's.** No tool moves it or grows it, and nothing
is put down past it: what a conversation sees is never something it can
widen by what it does (found in review, 2026-11-05 - a frame grown round
what was put down let a model sweep a strip of the page into its scope).

### A turn (2026-11-05)

`runTurn` sends the person's words through the conversation's connection,
and takes the model's replies in turn (`conversation/turn`):

- **No connection, nothing sent.** Core makes none: a turn with none sends
  nothing and says why, and nothing is kept.
- **Each go** sends what Meno tells the model, all that was said, and the
  tools its rights give it. Tool answers go as answers, apart from what
  Meno says, and the model is told they are data. A tool's answer that
  gave a thing of the page no longer in scope - moved out of the frame,
  taken away - is sent as withheld: each answer keeps the ids of what it
  gave (`things`) for that. The person's own rows keep it whole.
- **The model's words** are kept as plain text, whatever they hold.
- **Each tool it calls** is answered within the scope and rights, and the
  answer kept. A change is made at once, as its reply comes - and all the
  changes of the turn are one change set: one step to undo, said to be the
  conversation's, gone on with reply by reply (lib/doc `goneOn`), never
  joined to the person's. *Discard* drops it by its key.
- **It stops** when the model calls no tool, when the person asks, or at
  its limit of replies or of tool calls after one message, saying which -
  or where it fails part way (a tool that throws, a reply not as one is),
  saying why: its changes so far kept to keep or discard, and it is never
  left talking.
- **The send log** has an entry for each go: what of the page it carried
  - each thing by its id and characters - how many characters in all, and
  where it went.

### The scripted test model (2026-11-05)

A connection that plays back replies written beforehand and keeps every
request it was sent (`conversation/scripted`). The tests drive whole
turns with it; it sends nothing anywhere.

### Talked to from the page (2026-11-05)

The page's side of a conversation (`store/slices/conversationsSlice`), on
which its card and its column are built:

- **Put down, changed and taken away**, each a step to undo - not taken
  away while it talks.
- **Sent to** (`sendToConversation`): a turn run with what it talks
  through (`conversation/connections`: none in Meno itself, so nothing is
  sent, and why is kept to say), the person's words and the replies kept
  outside the page's history. While it talks it is marked so, and *Stop*
  ends the turn at its next reply.
- **A turn's changes** are one step, marked: *Keep* lets the mark go;
  *Discard* undoes that step - refused, and why, where a step it added is
  running, or where the page has changed since: then undo is the
  person's, step by step. The steps done before whose options it changed
  are named, as those that will run again when next run.
- **What was said, as rows** (`conversation/said`): each person's and
  model's words, each tool called with what came of it on its line - what
  a column shows, as words, never drawn as a page.

### Talking through a plugin (2026-11-05)

**The role.** *Talking with a model, in a conversation* (`language-model`,
lib/plugins/roles) is filled by a plugin that names, in its manifest, the
hosts it talks to: each a host's name exactly, 1 to 8, never a pattern, an
address or a port (`hosts`, lib/plugins/manifest `hostsOf`). Without them
the role is not its; no other role names any. Who fills it, and its
options, are chosen in Settings, *Conversations*; Settings, *Plugins*,
points there from the plugin's card.

**Its way out.** The backend reads the hosts again from the plugin's
manifest in place - never from the page - and starts the plugin's worker
pointed at the network gate under a task of its own: purpose
`model:<plugin id>@<hosts>`, the hosts in order, those hosts alone
(src-tauri/src/model.rs). The first time a conversation goes to it, Meno
asks: "Send this conversation to *hosts*, for *plugin*? What is said in it,
and what it is given, goes there." A yes is remembered, as any purpose's,
and withdrawn in Settings, *Network*; a no sends nothing. The yes is for
those hosts: a plugin updated to name others is asked of again, by the
hosts it names now. A worker started before the yes went out nowhere: it
is started again, now that it may.

**A turn, sent.** A request goes to the worker as `converse` - Meno's
words to the model, what has been said, the tools and the plugin's
options - by the one way the backend takes it (`ext_converse`), which
adds the person's key on the way. The page never holds the key: it can
neither read it nor send a key of its own, nor send `converse` by the way
other requests go: to a model plugin's worker, that way takes only whole
lines, each a JSON object, none of them a `converse`. Meno waits for the
reply whole, up to 10 minutes - as long as a model service's own SDK
waits for one request by default - and nothing of it is shown till then; a
plugin gives up within that, in words (`REPLY_MS`; replies shown as they
come are for a later version). What the plugin answers is read strictly:
its words, plain text, and the tools it calls, each by name with its
arguments - or its error; anything else is refused, never guessed at
(conversation/modelConnection `replyOf`). With them, what the plugin keeps
of the reply (`keep`, at most 2 MB as JSON): its service's own record of
it - the reasoning a service needs given back, as it gave it, with what was
said after it. Opaque to Meno, it stays with the reply while the
conversation is open and goes back to the plugin with it; it is never
saved in the .meno.

**The key.** Typed once in Settings, *Conversations*, and kept by the
system's keychain under the service "Meno", one account a plugin
(`model:<plugin id>`), so that *Forget* forgets that one alone. The page is
told only whether one is kept. Where it is kept:
- **macOS**: the person's login keychain. A Meno other than the one that
  kept it - an update, a build made for testing; Meno's Mac builds are
  signed ad hoc - is asked by the system before it reads the key, and the
  person may allow it or not.
- **Windows**: the Credential Manager, where any program running as the
  person can read it - another build of Meno as well.
- **Elsewhere**: no key is kept: "No safe place to keep a key on this
  system".

The key is never shown to the page or written to Meno's log. Should a
worker say it back, the backend takes it out of what the worker says
before the page or the log sees it - every key given to that worker, on
its output and its errors alike, until both are read to their ends, after
it was stopped too. A safeguard, not a promise for the plugin: it finds the
key as it was given, and not one the plugin writes otherwise (a `/` a JSON
writer gives as `\/`, say); what a plugin does with the key is its
review's to check.

