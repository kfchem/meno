# Testing

Unit tests run with Vitest (`npm test`, `vitest.config.ts`): pure TypeScript
in Node, without the app's Vite plugins. What they cannot reach - the
canvas, the webview, the plugins' Python - is checked by hand or with the
GUI harness (`scripts/gui`).

## Timeouts

A test's timeout is there to stop a test that hangs, never one that is
slow because the machine is busy. On the development Mac several lanes run
the suite, builds and the app at once, and a test has been seen to take 10
to 20 times as long as it does alone. A test that times out under that load
is a false failure, and it costs whoever meets it the time to find out.

**The rule.** A test is given at least twenty times the time it was
measured to take, rounded up to a step: 30 s, 60 s, 120 s, 300 s, 600 s or
1200 s. A test measured at 250 ms or less keeps Vitest's own 5 s.

**How it is written.** `measured(ms)` in `src/testing/timeouts.ts` turns a
measured time into the timeout, so the test says how long it took and the
next person need not guess:

```ts
it("draws aconitine ...", () => {
  // ...
}, measured(16_000));
```

A list of molecules run through one helper (`testdata/readBack.ts`,
`testdata/inAnyOrder.ts`) is given the time of its slowest molecule, which
sets the timeout for all of them.

**How to measure.**
- Run the whole suite on a machine with nothing else running.
- Read each test's own duration from the run, with Vitest's JSON reporter
  (`npx --no-install vitest run --reporter=json --outputFile=<file>`) or a
  reporter of your own.
- Take the larger of two runs.

The whole suite runs its files side by side, one per core, so a test's
time in it includes its share of a busy machine. That is the time to use,
not the time of the file run alone. A new test that takes more than 250 ms
gets `measured(...)` when it is written. A test that becomes slower gets
its number raised when it is changed.

**Past the largest step.** A test measured at over a minute (Stryker's
reagent, about 68 s) gets 1200 s and no more. A test that slow wants making
quicker rather than more time.

### The sweep of 2026-10-19

Measured on a MacBook Air (Apple M4, 10 cores) with Node 26.5 and Vitest
5.0.3. The whole suite took 68 s. The load average was about 2 at the start,
and the larger of two runs was taken. A third run, with other lanes at a
load average of 17 to 28, took at most 3 times as long per test (median 1.3
times for tests over 0.5 s). Ten pull requests tried together on a busy
day saw `axial.test.ts`'s slowest test take 67.8 s against its 60 s
timeout.

Every test whose timeout was under twenty times its measured time was
raised. A list whose timeout comes from its slowest molecule takes the
rule's step whichever way that goes, so one came down: the cages list,
from 120 s to 30 s, still 77 times its slowest molecule (0.39 s). The
table lists every timeout changed; all others are as they were:

| Test file | Test | Measured | Timeout before | Timeout now |
|---|---|---:|---:|---:|
| ui/features/Workspace/chem/cleanUp.test.ts | cleans up Stryker's reagent just drawn out, and writes its phosphin... | 67.7 s | 240 s | 1200 s |
| ui/features/Workspace/chem/axial.test.ts | is drawn, written out, by one wedge at the axis as the descriptor s... | 32.6 s | 60 s | 1200 s |
| lib/layout/dictionary.test.ts | are laid out without throwing: the groups, the complexes, and a tub... | 28.7 s | 60 s | 600 s |
| lib/layout/inAnyOrder.heldout.test.ts | every molecule (slowest: Aconitine) | 15.5 s | 120 s | 600 s |
| lib/layout/readBack.heldout.test.ts | every molecule (slowest: Aconitine) | 15.4 s | 60 s | 600 s |
| ui/features/Workspace/chem/expandReagent.test.ts | is drawn as Clean-up draws it: a complex cleaned up after it is wri... | 13.0 s | 60 s | 300 s |
| lib/layout/hapto.test.ts | turn crowded aryl rings as a propeller where that reads better, the... | 9.8 s | 30 s | 300 s |
| lib/chem/ligands.test.ts | are set as formulas are, and written out as their structures | 9.4 s | 120 s | 300 s |
| lib/layout/inAnyOrder.benchmark.test.ts | every molecule (slowest: Tacrolimus) | 8.6 s | 120 s | 300 s |
| lib/layout/readBack.benchmark.test.ts | every molecule (slowest: Tacrolimus) | 8.4 s | 60 s | 300 s |
| lib/layout/hapto.test.ts | tries each way of setting separate chelates round it, nothing of it... | 6.0 s | 60 s | 120 s |
| lib/layout/engine.test.ts | shows the centres of a ring bridged across another by its shape, wi... | 3.9 s | 30 s | 120 s |
| ui/features/Workspace/chem/cleanUp.test.ts | writes taxol's esters and amide by name, their letters clear of eve... | 3.4 s | 30 s | 120 s |
| ui/features/Workspace/chem/cleanUp.test.ts | writes tetrodotoxin's C4, shown by the drawing with no wedge, to a ... | 3.1 s | 30 s | 120 s |
| lib/layout/engine.test.ts | draws tetrodotoxin as a solid only with every stereocentre on the p... | 3.1 s | 30 s | 120 s |
| lib/layout/engine.test.ts | runs a ring of sugars along each sugar's barer side, its secondary ... | 2.9 s | 30 s | 60 s |
| lib/layout/readBack.diastereomers.test.ts | every molecule (slowest: Ibogaine, atom 6 inverted) | 2.8 s | 60 s | 60 s |
| lib/layout/hapto.test.ts | close a chelate through a ferrocene at the metal, its two bonds alike | 2.3 s | 30 s | 60 s |
| ui/features/Workspace/chem/cleanUp.test.ts | draws a cage in perspective, its stereocentres shown by the drawing... | 2.2 s | 30 s | 60 s |
| lib/layout/engine.test.ts | draws every double bond of an odd macrocycle, or of one with two tr... | 2.1 s | 30 s | 60 s |
| ui/features/Workspace/chem/axial.test.ts | is kept by Clean-up, and written to a MOL file as a wedge from the ... | 2.0 s | 30 s | 60 s |
| ui/features/Workspace/chem/expandReagent.test.ts | shows the configuration Clean-up reads back as the reagent's own | 1.9 s | 30 s | 60 s |
| lib/layout/drawn.test.ts | says a perspective centre to a flat reader on a bond no other centr... | 1.9 s | 30 s | 60 s |
| lib/chem/contract.test.ts | draw a group's own reagent, and a ligand - its own picture - out | 1.8 s | 30 s | 60 s |
| lib/layout/cage.test.ts | is drawn in perspective where the whole will not lie flat - adamant... | 1.8 s | 30 s | 60 s |
| lib/layout/engine.test.ts | is settled clear of the H of ginkgolide B's OH beside it | 1.6 s | 30 s | 60 s |
| lib/layout/hapto.test.ts | is a tub facing the metal: each C=C cis, nothing crossing, its near... | 1.1 s | 5 s | 30 s |
| ui/features/Workspace/components/drawnLayout.test.ts | fills two thousand rings, each ring's bonds read, not every bond fo... | 1.0 s | 5 s | 30 s |
| lib/layout/engine.test.ts | draws bilobalide's C4 with its bonds spread round it, its wedges re... | 0.8 s | 5 s | 30 s |
| ui/features/Workspace/utils/stroke.test.ts | draws phenanthrene and anthracene ring after ring, however each is ... | 0.7 s | 5 s | 30 s |
| ui/features/Workspace/utils/backToFront.test.ts | sorts a large surface in little more than the time it takes to read... | 0.7 s | 5 s | 30 s |
| ui/features/Workspace/components/drawnLayout.test.ts | gives a thousand rings' circles their rings' colours, each ring's b... | 0.6 s | 5 s | 30 s |
| lib/chem/reagents.test.ts | are drawn with wedges where an abbreviation is written out, each na... | 0.6 s | 5 s | 30 s |
| lib/layout/engine.test.ts | draws a ring system from the face its angular groups are on, whiche... | 0.6 s | 5 s | 30 s |
| ui/features/Workspace/components/raycast3d.test.ts | is the atom three.js finds, at the same place, but where the ray on... | 0.6 s | 5 s | 30 s |
| ui/features/Workspace/components/raycast3d.test.ts | reads no triangle of an atom, and only the triangles of the residue... | 0.5 s | 5 s | 30 s |
| lib/layout/ringSets.test.ts | is tried among at most eight sets, those whose rings are bridged ac... | 0.5 s | 5 s | 30 s |
| utils/structureParsers.test.ts | finds the same bonds, in the same order, cube by cube in a big stru... | 0.4 s | 5 s | 30 s |
| lib/doc/menoFile.test.ts | gives each of thousands of files kept, as it was, without reading t... | 0.4 s | 5 s | 30 s |
| lib/chem/reagents.test.ts | are drawn as atoms where a structure says more, and a radical or a ... | 0.4 s | 5 s | 30 s |
| ui/features/Workspace/components/pdfPictures.test.ts | stay few however long the view is panned and zoomed: none kept unde... | 0.4 s | 5 s | 30 s |
| ui/features/Workspace/components/textBatch.test.ts | lets a chunk left empty go: a page set again whole, again and again... | 0.4 s | 5 s | 30 s |
| ui/features/Workspace/chem/expandReagent.test.ts | binds a ligand's neutral donor by a coordination bond, which takes ... | 0.4 s | 5 s | 30 s |
| lib/layout/inAnyOrder.cages.test.ts | every molecule (slowest: basketane) | 0.4 s | 120 s | 30 s |
| ui/features/Workspace/workflow/workflow.test.ts | do Duplicates in turns that let the page go on, saying how far they... | 0.4 s | 5 s | 30 s |
| ui/features/Workspace/chem/fromSmiles.test.ts | is laid out in the style of the drawing it goes into, where one is ... | 0.4 s | 5 s | 30 s |
| ui/features/Workspace/utils/copyPaste.test.ts | is written as a molfile, and Clean-up finds the next free id past it | 0.4 s | 5 s | 30 s |
| lib/layout/engine.test.ts | draws adamantane as it is always drawn: a chair, its axial bonds up... | 0.3 s | 5 s | 30 s |
| lib/text/colouring.test.ts | are a long text's as far as it is read, and again from where it cha... | 0.3 s | 5 s | 30 s |
| lib/layout/hapto.test.ts | lie level, their bridges above and below between them, each one's l... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/utils/stacks.test.ts | shows its first record, lays its records out as a grid, and places ... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/utils/frames.property.test.ts | a PDB file's models (readStructures) | 0.3 s | 5 s | 30 s |
| lib/layout/cage.test.ts | keeps atoms not bonded to each other apart: scopolamine's tropane s... | 0.3 s | 5 s | 30 s |
| ui/features/SettingsPanel/widths.test.tsx | are one width for every section, and one measure for every explanat... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/utils/figures.test.ts | reads a label drawn as one path of all its letters (or not: true), ... | 0.3 s | 5 s | 30 s |
| lib/layout/rings.test.ts | finds a thousand molecules' rings at the cost of a thousand small s... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/store/chargeMultiplicity.test.ts | through chains of steps, whoever does each | 0.3 s | 5 s | 30 s |
| lib/layout/engine.test.ts | draws huperzine A with room for its ethylidene, no atom on another | 0.3 s | 5 s | 30 s |
| lib/layout/cage.test.ts | are as given in a solid found from bond distances, a ring fusion th... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/utils/frames.property.test.ts | an XYZ file, as the page takes it (readStructures, then checkedStru... | 0.3 s | 5 s | 30 s |
| ui/features/Workspace/components/drawnZoom.test.tsx | is read through useDrawnZoom by every layer of the drawing sized on... | 0.3 s | 5 s | 30 s |
