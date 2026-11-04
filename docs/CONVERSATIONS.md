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

A Conversation object has one connection: a model plugin, or a program
outside Meno that connects to it. Its frame bounds both alike.

- **A model plugin**, of a new kind of role, *language model* (PLUGINS.md,
  *Roles*).
  - Core holds the conversation, the tools, the scope, the rights, the send log and the history.
  - The plugin only converts: Meno's messages and tools into a request for its service, and the reply back into words and tool calls. It names its service and its hosts as a plugin names its program; core names none.
  - Its connections go through the app's network gate under a purpose of their own. The consent names its hosts, and every connection is in the network's record.
  - **Core makes the request, and the key never reaches the plugin.** The plugin's worker builds a request's body from Meno's messages and reads the reply; core sends it, over https, to a host the consent names, and puts the key in it itself. A worker never sees the key, and never connects anywhere of its own: a model plugin's worker is given no network.
  - The key is the person's own, typed by them in Settings. It is kept in the system's keychain (the Keychain on macOS, the Credential Manager on Windows, the Secret Service on Linux), by the `keyring` crate. It is never in the .meno, a log, the send log, a job folder, a worker or a file Meno writes. Where the system has no keychain, a model plugin is not run, saying why; the key is never kept in a file instead.
- **A program outside Meno**, connecting by the model-tool protocol, reaches
  the same tools by another entrance.
  - Meno starts a local server for one Conversation object, on the person's click. It listens on a local socket only, never on TCP: a Unix socket in a folder of the person's own, readable and writable by them alone (mode 0600); on Windows, a named pipe whose access is the person's alone.
  - **Its token.** Random, from the system's generator, at least 128 bits; one per object; compared in constant time; dead once the object's server stops. It is never put in a program's arguments, which other people on the machine can see. The person is shown it only on their click, and the bridge reads it from its environment or from a file only they can read.
  - Most such programs start their tools as a command over standard input and output. Meno ships a small bridge command: the program starts it, and it connects to the object's socket with the token.
  - It sees that object's frame and nothing else. It stops when the object is closed or deleted, or when the person stops it.
  - The card says so plainly: any program of the person's own that can read the token can drive that conversation, within its rights.
  - Each call is in the send log.
- **A scripted test model**: a plugin of the same kind whose worker plays
  back a script of replies and tool calls. It is for tests alone, never
  offered.

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
  unsent.
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
  - a key typed is in the keychain and in no file Meno writes: the workspace, the logs and the settings file are searched for it; nor is it in anything a worker is given;
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
| 7 | The *language model* kind of role: its manifest, its worker with no network of its own, core's request to the hosts its consent names, the key in the keychain. |
| 8 | A first model plugin, checked live by the maintainer with their own key. |
| 9 | The outside entrance: the local server for one object, its token, start and stop, the bridge command, every call in the send log. |

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
3. **A conversation of the whole page:** a flag on its card, in Meno's
   warning colour, not a frame the size of the page.
4. **The exchange:** saved in the .meno by default, with *Clear* on the
   card and a warning, once, on *Save as*.

## As built

Nothing yet: each pull request of *Stage 1* adds its part here.
