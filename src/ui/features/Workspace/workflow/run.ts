/**
 * A step run (docs/WORKFLOWS.md, *Running*), where Meno does it: first any
 * step before it that has not run or has changed, then it, on what comes
 * in - what it gave coming in as a result set to the right of it, or in
 * the one it made before, in place of what that held. One edit: an undo
 * takes the run's results away.
 */
import { addMolecules3d, appendModel, moveMolecules3d, removeMolecules3d, removePictures, withoutAtoms, type WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord, Member, Model, Molecule3D, SeriesCore, StepRunKept, Turn3D, WorkflowSet, WorkflowStep } from "../store/types";
import { boxOf } from "../chem/make3d";
import { partOf } from "../chem/cleanUp";
import { levelOf } from "../../../../lib/calc/output";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { turnAfter, turnOver } from "../utils/align3d";
import { calcProperties, compoundLetter, entryOfSet, holdsOf, numberShown, setMembers, setMolecules, setEntries, frameXyz, framesOf, entriesIn, keptOf, keptAlike, imaginaryOf, marksOf, unlikeMade, structureMember, recordNumber, recordOn, LARGE_SET, plainAmong, keptKnown, type DrawnEntry, type Frame, type SetEntry } from "./entries";
import { chipWide, hasChip } from "./selectionSet";
export { chipWide };
import { findSet, givesOf, inputKey, inputOf, moleculesSeen, resultOf, stateOf, stepOf, stepsBefore, tableInto, tableWired, wireInto, wiresInto } from "./flow";
import { chartOfTable, chartSaid, type ChartValue } from "../../../../lib/chart";
import { diagramOf, diagramSaid, levelNamer, type DiagramValue, type RowCompound } from "../../../../lib/energyDiagram";
import { asideExit, exitsOf, inputsOf, kindInfo, laterPortsNeed, MENO_DOES, optionsOf, ONE_INPUT, readsAsTable, takenBy, restHolds, type Holds3D, type SetHolds, type SetKind, type StepKind, type ValueKind, isSetKind } from "./kinds";
import { VALUE_KINDS } from "../../../../lib/plugins/steps";
import { inputsFor, takesBy, takesNothingBy } from "./doers";
import { BETWEEN, SET_PAD, SET_TOP, CHIP, drawnShown, PX, SUMMARY_PX } from "./look";
import { clearOf, columnWidth, frameAt, placeAgain, placeBelow, placeFor } from "./place";

export { frameAt, placeFor } from "./place";
import { keptNames, takeFrames, type Which } from "./takeFrames";
import { notResults, PAIRED, pushTo, runMeno, runMenoDrawn, runMenoPair, type Outcome, type Outcome3D } from "./meno";
import { measuredSet } from "./structureSteps";
import { addSet, CHART_SET, heldPut, holdChart, holdNumber, NUMBER_SET, holdCollection, holdTable, TABLE_SET, holdMembers, holdNothing, holdRest, moveSet, resizeSet, markMade, setRan, setForExit, withStepRuns } from "./model";
import { rmsd } from "./rmsd";
import { notFinishedRows, structuresAsTable } from "./structuresTable";
import { diagramNeeds } from "./diagramOptions";
import type { NumberValue, Table } from "../../../../lib/table";
import { addedSet, numberOf } from "./addStep";

/**
 * What a run needs of the canvas: how far a molecule in 3D reaches on the
 * page about its middle - left, right, down and up - in any of its frames,
 * turned by `turn`, where it is; who does a step; and the time.
 */
export type RunWith = { extentOf: (m: Omit<Molecule3D, "id">, turn?: Turn3D) => Frame; byOf: (step: WorkflowStep) => string; now: number };

/** What each kind of set is called, where a step says what it takes. */
const SET_NAMES: Record<ValueKind, string> = { structures: "structures drawn", molecules: "molecules in 3D", conformers: "conformer sets", table: "a table", number: "a number" };

/** `doc` with the step `id` run - and first the steps before it that need it. */
export function runStep(doc: WorkspaceDocument, id: number, w: RunWith, depth = 0): WorkspaceDocument {
  const step = stepOf(doc, id);
  if (!step || depth > 200) return doc;
  // what comes in, made first where it has not been, or is out of date -
  // or where any step before it, however far back, is: what that gives
  // anew comes down to it
  const stale = (sid: number) => {
    const s = stepOf(doc, sid);
    return !!s && stateOf(doc, s, w.byOf(s)) !== "done";
  };
  // (into each of its inputs, where it has several)
  for (const wire of wiresInto(doc, id)) {
    const before = findSet(doc, wire.from.set)?.made?.step;
    const prior = before != null ? stepOf(doc, before) : undefined;
    if (prior && [prior.id, ...stepsBefore(doc, prior.id)].some(stale)) doc = runStep(doc, prior.id, w, depth + 1);
  }

  const by = w.byOf(step);
  const input = inputOf(doc, id);
  const key = inputKey(doc, step, by);
  const as = { kind: step.kind, ...(step.options ? { options: step.options } : {}) };
  const fail = (said: string) => setRan(keepRun(doc, step, false), id, { at: w.now, ok: false, said, input: key, ...as });
  const why = whyNot(doc, step, by);
  if (why) return fail(why);
  // (a branch that gave nothing this time: ended at once, its exits empty, saying what came in empty)
  const none = emptyIn(doc, step, by);
  if (none) return ranEmpty(doc, id, none, key, w);
  if (by !== "meno" || !MENO_DOES.includes(step.kind)) return fail("Nothing added does this step");
  // (a chart: a table's columns, one against the other)
  if (step.kind === "chart") return chartRun(doc, step, w, key);
  // (an energy diagram: molecules' energies as levels, joined as a table says)
  if (step.kind === "energy-diagram") return diagramRun(doc, step, w, key);
  // (two inputs, each a set's entries: Merge, Re-bond, Compare bonding - whyNot has seen each comes in, as each takes)
  if (PAIRED.includes(step.kind)) {
    const [p, q] = inputsOf(step.kind).map((port) => inputOf(doc, id, port.id)!);
    const entriesOf = (x: typeof p) => ({ entries: setEntries(x.molecules, x.holds as Holds3D), holds: x.holds as Holds3D });
    return ranAs(doc, id, runMenoPair(step.kind, entriesOf(p), entriesOf(q), step.options), key, w);
  }
  // (a number from its options alone: nothing comes in)
  if (step.kind === "number") {
    const n = numberOf(optionsOf(kindInfo(step.kind).options ?? [], step.options));
    if ("why" in n) return fail(n.why);
    return setRan(placeNumber(keepRun(doc, step), step, { ...n, by: { ...n.by, step: String(step.id) } }), id, { at: w.now, ok: true, said: numberShown(n), input: key, ...as });
  }
  // (a sum on each entry of what comes into Molecules - and the number into Number, where one is wired)
  if (step.kind === "add") {
    const into = inputOf(doc, id, "in");
    if (!into) return fail("Nothing comes into Molecules");
    const numberSet = wireInto(doc, id, "number")?.from;
    const number = numberSet ? findSet(doc, numberSet.set)?.number : undefined;
    if (numberSet && !number) return fail("Number holds no number yet");
    const o = optionsOf(kindInfo(step.kind).options ?? [], step.options);
    return ranAs(doc, id, addedSet(setEntries(into.molecules, into.holds as Holds3D), into.holds as Holds3D, o, number), key, w);
  }
  if (!input) return fail("Nothing comes into it");
  // (frames of molecules with frames: read from the molecules themselves - a set takes a path as its last frame alone)
  if (step.kind === "take-frames") {
    const o = optionsOf(kindInfo(step.kind).options ?? [], step.options);
    return ranAs(doc, id, takeFrames(input.molecules, (o.which as Which) ?? "highest", Number(o.either), keptNames(String(o.keep ?? ""))), key, w);
  }
  // (Measure's atoms from a table wired into Atoms, where its card says so - and, typed, a table wired in said not read, never passed over unsaid;
  //  what comes in is molecules: it takes nothing else)
  if (step.kind === "measure") {
    const o = optionsOf(kindInfo(step.kind).options ?? [], step.options);
    const entries = setEntries(input.molecules, input.holds as Holds3D);
    if (o.from === "table") return ranAs(doc, id, measuredSet(entries, input.holds as Holds3D, "", { table: tableInto(doc, id, "atoms"), rows: String(o.rows ?? "") }), key, w);
    const typed = measuredSet(entries, input.holds as Holds3D, String(o.measurements ?? ""));
    const unread = wireInto(doc, id, "atoms") && typed.ok ? { ...typed, said: `${typed.said} \u00b7 the table wired into Atoms not read: atoms typed` } : typed;
    return ranAs(doc, id, unread, key, w);
  }
  const outcome =
    input.holds === "structures"
      ? runMenoDrawn(step.kind, inputEntries(doc.model, input), step.options, doc.style)
      : runMeno(step.kind, setEntries(input.molecules, input.holds), input.holds, step.options, energiesBy(input.molecules), energyLevels(input.molecules));
  return ranAs(doc, id, outcome, key, w);
}

/**
 * `doc` with Meno's step `id` run, its outcome worked out already - in
 * turns, while the page went on (store `runMenoInTurns`) - on what came in
 * as `key` says: its results put in, or why not said. As it was where the
 * step has gone meanwhile; changed since, where what comes in has.
 */
export function ranAs(doc: WorkspaceDocument, id: number, outcome: Outcome, key: string, w: RunWith): WorkspaceDocument {
  const step = stepOf(doc, id);
  if (!step) return doc;
  const as = { kind: step.kind, ...(step.options ? { options: step.options } : {}) };
  if (!outcome.ok) return setRan(keepRun(doc, step, false), id, { at: w.now, ok: false, said: outcome.said, input: key, ...as });
  return setRan(withResults(keepRun(doc, step), step, outcome, w), id, { at: w.now, ok: true, said: outcome.said, input: key, ...as });
}

/** Names in words: "Molecules", "Molecules and Reference", "First, Second and Third". */
const namesSaid = (names: readonly string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Where a step ends at once, nothing done, its exits empty (docs/WORKFLOWS.md,
 * *An empty set*): an input that holds entries is wired with a set a step
 * before it gave empty this time, having run ok - a branch that gave
 * nothing, such as a last round of restraints that held none. What it says:
 * "Nothing came in"; of a step of several inputs, into which: "Nothing came
 * into Reference". None - the step runs, or fails, as ever - where no input
 * is so; where an empty one is a set no step gave, or one whose step has
 * not run ok; and for Merge with the other input not empty, which takes
 * that one's entries (`runMenoPair`).
 */
export function emptyIn(doc: WorkspaceDocument, step: WorkflowStep, by: string): string | null {
  const ports = inputsFor(step.kind, by);
  if (!ports.length) return null;
  const empty: string[] = [];
  let full = 0;
  for (const port of ports) {
    const at = ports.length > 1 ? port.id : undefined;
    const wire = wireInto(doc, step.id, at);
    const input = wire ? inputOf(doc, step.id, at) : null;
    // (not wired, or a table or a number: no entries of its own to give)
    if (!wire || !input) continue;
    if (input.molecules.length || input.structures.length || input.held?.length) {
      full++;
      continue;
    }
    const made = findSet(doc, wire.from.set)?.made;
    if (!made || stepOf(doc, made.step)?.ran?.ok !== true) return null;
    empty.push(port.name);
  }
  if (!empty.length || (step.kind === "merge" && full)) return null;
  return ports.length > 1 ? `Nothing came into ${namesSaid(empty)}` : "Nothing came in";
}

/**
 * `doc` with step `id` ended at once on an empty input (`emptyIn`), saying
 * `said`: done, what it last did kept among its runs, and every one of its
 * exits' sets emptied of what an earlier run put in it - its molecules in
 * 3D, the atoms it put on the page, its pictures, and a chart, table,
 * number or molecules held in it - so that none stands under a step that
 * says nothing came in.
 */
export function ranEmpty(doc: WorkspaceDocument, id: number, said: string, key: string, w: RunWith): WorkspaceDocument {
  const step = stepOf(doc, id);
  if (!step) return doc;
  doc = keepRun(doc, step);
  for (const exit of exitsOf(step.kind)) {
    const set = resultOf(doc, id, exit.id);
    if (!set) continue;
    doc = removePictures(emptied(doc, set), setMembers(doc, set).pictures);
    doc = holdNothing(doc, set.id);
  }
  return setRan(doc, id, { at: w.now, ok: true, said, input: key, kind: step.kind, ...(step.options ? { options: step.options } : {}) });
}

/**
 * Why a step cannot run as things are, whoever does it: the step before it
 * failed this time; nothing comes into it; what does is not what it takes;
 * nothing added does it; what it comes to needs of its options (an Energy
 * diagram's reference: diagramOptions `diagramNeeds`). None, where it can.
 */
/** Whether what a set holds flows along a wire into a step - a set's kind, a table, a number - and not a chart or pictures, which none takes. */
const isValueKind = (h: SetHolds): h is ValueKind => (VALUE_KINDS as readonly string[]).includes(h);

export function whyNot(doc: WorkspaceDocument, step: WorkflowStep, by: string): string | null {
  // (not on what a step before it gave on an earlier run: it failed this time - before any of its inputs)
  const failed = wiresInto(doc, step.id).some((wire) => {
    const before = findSet(doc, wire.from.set)?.made?.step;
    return before != null && stepOf(doc, before)?.ran?.ok === false;
  });
  if (failed) return "The step before it failed";
  // (a step that takes nothing in needs only someone to do it)
  if (takesNothingBy(step.kind, by)) return by ? null : "Nothing added does this step";
  // (a kind of several inputs: its first, which it cannot run without; the others, where wired, it takes as they are)
  const ports = inputsFor(step.kind, by);
  const first = ports.length > 1 ? ports[0] : undefined;
  const input = inputOf(doc, step.id, first?.id);
  // (a table wired in - a set's, or molecules seen as one: no entries of its own to give)
  const holds = input?.holds ?? (tableWired(doc, step.id, first?.id) ? "table" : null);
  if (!holds) return first ? `Nothing comes into ${first.name}` : "Nothing comes into it";
  // (a set that came to mix conformer sets with other molecules after it was wired)
  const from = wireInto(doc, step.id, first?.id)?.from;
  const mixed = input?.holds === "molecules" && from && !findSet(doc, from.set)?.made && !readsAsTable(step.kind, first?.id ?? ONE_INPUT) ? plainAmong(input.molecules) : null;
  if (mixed) return mixed;
  if (first && !takenBy(first.takes, holds)) return `${first.name} takes ${first.takes.map((s) => SET_NAMES[s]).join(" or ")}`;
  if (!first && !takesBy(step.kind, by, holds)) return `Takes ${kindInfo(step.kind).takes.filter((s) => takesBy(step.kind, by, s)).map((s) => SET_NAMES[s]).join(" or ")}`;
  if (!by) return "Nothing added does this step";
  // (its later inputs: each it cannot run without wired, an optional one where wanted - two that go together, both or neither -
  //  and each wired one taking what comes into it; Merge's second of the kind its first is)
  const missing = laterPortsNeed(ports, (port) => !!wireInto(doc, step.id, port));
  if (missing) return missing;
  // (a wired one - optional or not - giving what it takes, by what its set gives, run or not yet: a wire that gives nothing it can use
  //  is never passed as if it were not there, nor as if it gave something)
  for (const port of ports.slice(1)) {
    const wire = wireInto(doc, step.id, port.id);
    if (!wire) continue;
    const gives = givesOf(doc, wire.from);
    if (!gives) return `Nothing comes into ${port.name}`;
    if (!isValueKind(gives) || !takenBy(port.takes, gives)) return `${port.name} takes ${port.takes.map((s) => SET_NAMES[s]).join(" or ")}`;
    if (step.kind === "merge" && gives !== holds) return `${ports[0].name} holds ${SET_NAMES[holds]} and ${port.name} ${SET_NAMES[gives]}: Merge makes one set of two of one kind`;
  }
  if (step.kind === "energy-diagram") return diagramNeeds(doc, step) ?? null;
  return null;
}

/**
 * `doc` with a Chart step run (docs/WORKFLOWS.md, *Charts*): what comes in
 * seen as a table (flow `tableInto`), the columns its options name - or its
 * first two of numbers - one against the other (lib/chart `chartOfTable`),
 * in its result set: made to the right of it, or the one it made before.
 * Why not, where it cannot be.
 */
function chartRun(doc: WorkspaceDocument, step: WorkflowStep, w: RunWith, key: string): WorkspaceDocument {
  const as = { kind: step.kind, ...(step.options ? { options: step.options } : {}) };
  const said = (ok: boolean, text: string) => ({ at: w.now, ok, said: text, input: key, ...as });
  // (structures drawn come in: seen as a table, a row each (structuresTable) - a point stands on its record's values as results: a row
  //  failed, or edited since its values were given, refuses the chart, each named, as molecules' do; one set aside is finished, and charted)
  const from = wireInto(doc, step.id)?.from;
  const set = from && !tableWired(doc, step.id) ? findSet(doc, from.set) : undefined;
  const drawn = set && holdsOf(doc, set) === "structures" ? setStructuresTable(doc, set) : null;
  // (those it shows on the page first, then those it holds off it: these said to be, where named)
  const notFinished = drawn && set && notFinishedRows(drawn, setMembers(doc, set).structures.length);
  if (notFinished) return setRan(keepRun(doc, step), step.id, said(false, notFinished));
  const table = drawn ?? tableInto(doc, step.id);
  if (!table) return setRan(keepRun(doc, step), step.id, said(false, "Nothing comes into it"));
  // (molecules come in: a point stands on its entry's values as results - one that failed, by any kind, or whose marks did
  //  not read refuses the chart, each named, as an Energy diagram's levels do: never plotted as if it were one)
  const seen = moleculesSeen(doc, step.id);
  const bad = seen && notResults(seen.entries, (k) => compoundLetter(seen.entries[k].compound));
  if (bad) return setRan(keepRun(doc, step), step.id, said(false, bad));
  const o = step.options ?? {};
  const chart = chartOfTable(table, typeof o.x === "string" && o.x.trim() ? o.x.trim() : undefined, typeof o.y === "string" && o.y.trim() ? o.y.trim() : undefined);
  if ("why" in chart) return setRan(keepRun(doc, step), step.id, said(false, chart.why));
  // (and what of the set wired in did not read from its step's files - never charted round unsaid)
  const wired = from ? findSet(doc, from.set) : undefined;
  const unread = wired?.unread ?? 0;
  const noun = wired && holdsOf(doc, wired) === "structures" ? ["structure", "structures"] : ["molecule", "molecules"];
  const notRead = unread ? ` \u00b7 ${unread} ${unread === 1 ? `${noun[0]} could` : `${noun[1]} could`} not be read and ${unread === 1 ? "is" : "are"} not charted` : "";
  return setRan(placeChart(keepRun(doc, step), step, chart), step.id, said(true, `${chartSaid(chart)}${notRead}`));
}

/**
 * `doc` with an Energy diagram step run (docs/WORKFLOWS.md, *Energy
 * diagrams*): the molecules that come into its *Levels* seen as a table
 * (flow `tableInto`), each name a level at its lowest, relative to the one
 * its options name - joined as the table into *Connects* says,
 * or each to the next (lib/energyDiagram `diagramOf`) - in its result set.
 * Why not, where it cannot be.
 */
function diagramRun(doc: WorkspaceDocument, step: WorkflowStep, w: RunWith, key: string): WorkspaceDocument {
  const as = { kind: step.kind, ...(step.options ? { options: step.options } : {}) };
  const said = (ok: boolean, text: string) => ({ at: w.now, ok, said: text, input: key, ...as });
  const seen = moleculesSeen(doc, step.id, "levels");
  if (!seen) return setRan(keepRun(doc, step), step.id, said(false, "Nothing comes into Levels"));
  const levels = seen.table;
  // (a level stands on its entries' energies as results: one that failed, did not converge or whose marks did not read refuses it - never the lowest of the rest, which may not be its lowest)
  const levelOf = levelNamer(levels);
  const bad = notResults(seen.entries, (k) => levelOf(levels.rows[k]) || "A level");
  if (bad) return setRan(keepRun(doc, step), step.id, said(false, bad));
  const joined = wireInto(doc, step.id, "connects");
  const connects = joined ? tableWired(doc, step.id, "connects") : null;
  if (joined && !connects) return setRan(keepRun(doc, step), step.id, said(false, "Connects holds no table"));
  const o = step.options ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const d = diagramOf(
    levels,
    { ...(text(o.quantity) ? { quantity: text(o.quantity) } : {}), ...(text(o.reference) ? { reference: text(o.reference) } : {}), ...(text(o.levels) ? { levels: text(o.levels) } : {}) },
    connects ?? undefined,
    rowCompounds(levels, seen.entries),
  );
  if ("why" in d) return setRan(keepRun(doc, step), step.id, said(false, d.why));
  // (each level with the imaginary frequencies of the entry it stands at: said, not judged)
  const withFrequencies = { ...d, levels: d.levels.map((l) => ({ ...l, lowest: { ...l.lowest, imaginary: imaginaryOf(seen.entries[l.lowest.row]) } })) };
  return setRan(placeChart(keepRun(doc, step), step, withFrequencies), step.id, said(true, diagramSaid(d)));
}

/**
 * What each row of molecules seen as a table is, as an energy diagram's
 * level sums it (lib/energyDiagram `RowCompound`): its compound - its
 * constitution (the table's), and the charge and spin in use, given or as
 * its atoms say them (`entryOfSet`) - its atoms' elements, and its charge.
 */
function rowCompounds(table: Table, entries: readonly SetEntry[]): RowCompound[] {
  const at = table.columns.findIndex((c) => c.name === "constitution");
  return entries.map((e, k) => {
    const species = entryOfSet(e, String(k)).species;
    const charge = species?.charge ?? e.atoms.reduce((n, a) => n + (a.charge ?? 0), 0);
    return {
      key: `${String(table.rows[k][at])}|${charge}|${species?.multiplicity ?? ""}`,
      elements: e.atoms.map((a) => a.el),
      charge,
      ...(species ? { multiplicity: species.multiplicity } : {}),
    };
  });
}

/** `doc` with a chart a step made in its result set: the set it made before - emptied of what it held - or one made to the right of it, as large as a chart is drawn. */
/** `doc` with a Number step's number in its result set (`holdNumber`), placed as a chart's is: where it was, else beside the step. */
function placeNumber(doc: WorkspaceDocument, step: WorkflowStep, number: NumberValue): WorkspaceDocument {
  const exit = exitsOf(step.kind)[0].id;
  const madeBy = { step: step.id, exit, holds: "number" as const };
  const was = resultOf(doc, step.id, exit);
  const frame = was ? placeAgain(doc, step, was, NUMBER_SET.w, NUMBER_SET.h) : placeFor(doc, step, NUMBER_SET.w, NUMBER_SET.h);
  if (was) return holdNumber(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, number);
  const id = doc.nextWorkflowId ?? 1;
  return holdNumber(markMade(addSet(doc, frame, madeBy), id, madeBy), id, number);
}

function placeChart(doc: WorkspaceDocument, step: WorkflowStep, chart: ChartValue | DiagramValue): WorkspaceDocument {
  const exit = exitsOf(step.kind)[0].id;
  const madeBy = { step: step.id, exit, holds: "chart" as const };
  const was = resultOf(doc, step.id, exit);
  // (what it held before - a frame of a step not run yet holds nothing - gone; the frame as large as a chart is drawn)
  if (was) doc = removeMolecules3d(doc, setMembers(doc, was).molecules);
  const frame = was ? placeAgain(doc, step, was, CHART_SET.w, CHART_SET.h) : placeFor(doc, step, CHART_SET.w, CHART_SET.h);
  if (was) return holdChart(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, chart);
  const id = doc.nextWorkflowId ?? 1;
  return holdChart(markMade(addSet(doc, frame, madeBy), id, madeBy), id, chart);
}

/**
 * What the energies of molecules in 3D are, where a calculation worked them
 * out: its program and level (lib/calc `levelOf`), as the first that says them -
 * "RDKit · ETKDG v3, MMFF94", "xtb · GFN2-xTB · gas phase". None, where none says.
 */
export function energiesBy(molecules: readonly Pick<Molecule3D, "calc" | "energies">[]): string | undefined {
  const c = molecules.find((m) => m.energies?.length && (m.calc?.program || m.calc?.method))?.calc;
  if (!c) return undefined;
  return [c.program, levelOf(c)].filter(Boolean).join(" \u00b7 ");
}

/** Each molecule's energies' program and level, by its id, where its calculation said either: how Duplicates tells energies of two levels apart across molecules. */
export function energyLevels(molecules: readonly Pick<Molecule3D, "id" | "calc">[]): Map<number, string> {
  return new Map(molecules.flatMap((m) => (m.calc && (m.calc.program || levelOf(m.calc)) ? [[m.id, [m.calc.program, levelOf(m.calc)].filter(Boolean).join(" \u00b7 ")] as const] : [])));
}

/** What a run gave, exit by exit: the molecules its first exit holds, those its second holds - what it set aside - and what kind of set they make; with how many of each did not read from a file. */
export type RunResults = NonNullable<StepRunKept["results"]>;

/** The structures drawn that come into a step, as its entries: each as it is drawn, with its record where it has one, in the set's order. */
export function drawnEntries(model: Model, structures: readonly (readonly number[])[], records: readonly (DrawnRecord | undefined)[] = []): DrawnEntry[] {
  return structures.map((ids, place) => ({ place, drawn: partOf(model, new Set(ids)), ...(records[place] ? { record: records[place] } : {}) }));
}

/** A structure drawn as a run gives it and keeps it: the drawing, with its record where it has one. */
const drawnModel = (e: DrawnEntry): DrawnModel => ({ ...e.drawn, ...(e.record ? { record: e.record } : {}) });

/** The structures drawn that come into a step (flow `inputOf`), as its entries, in order: those on the page as they are drawn now, then those a result set holds off the page, as it holds them - each with its record. */
export function inputEntries(model: Model, input: { structures: readonly (readonly number[])[]; records?: readonly (DrawnRecord | undefined)[]; held?: readonly DrawnModel[] }): DrawnEntry[] {
  const shown = drawnEntries(model, input.structures, input.records);
  return [...shown, ...(input.held ?? []).map(({ record, ...drawn }, k) => ({ place: shown.length + k, drawn, ...(record ? { record } : {}) }))];
}

/** Every structure drawn a set holds, as a step after it takes them (`inputEntries`): those on the page, then those it holds off it. */
export function setStructures(doc: Pick<WorkspaceDocument, "model" | "molecules3d" | "pictures">, set: WorkflowSet): DrawnEntry[] {
  const { structures, records } = set.members ? setMembers(doc, set) : { structures: [], records: [] };
  return inputEntries(doc.model, { structures, records, ...(set.drawnCollection ? { held: set.drawnCollection } : {}) });
}

/** A set of structures drawn as a table (structuresTable): every structure it holds (`setStructures`), each row's id the set's and its place. */
export function setStructuresTable(doc: Pick<WorkspaceDocument, "model" | "molecules3d" | "pictures">, set: WorkflowSet): Table {
  return structuresAsTable(setStructures(doc, set), (k) => `structure:${set.id}#${k}`);
}

/** What a step's result set holds now, as a run kept keeps it; none, where it has made none - or made pictures, which a run kept does not keep. */
export function resultsNow(doc: WorkspaceDocument, step: WorkflowStep): RunResults | undefined {
  const set = resultOf(doc, step.id);
  if (!set?.made?.holds || !isSetKind(set.made.holds)) return undefined;
  const second = asideExit(step.kind);
  if (set.made.holds === "structures") {
    // (each structure as it is drawn now: moved, or an atom changed by hand since, as it is)
    const drawn = (b: WorkflowSet | undefined): DrawnModel[] => {
      if (!b) return [];
      // (those on the page, then those it holds off the page, as it holds them)
      const on = setMembers(doc, b);
      return [...drawnEntries(doc.model, on.structures, on.records).map(drawnModel), ...(b.drawnCollection ?? [])];
    };
    const restSet = second ? resultOf(doc, step.id, second.id) : undefined;
    return {
      molecules: [],
      rest: [],
      holds: "structures",
      drawn: { made: drawn(set), rest: drawn(restSet), ...(set.core ? { core: set.core } : {}) },
      ...(set.unread ? { unread: set.unread } : {}),
      ...(restSet?.unread ? { restUnread: restSet.unread } : {}),
    };
  }
  // (each exit's set: its collection, where it holds one, else its molecules on the page)
  const held = (b: WorkflowSet | undefined) => (b ? (b.collection ?? setMolecules(doc, b).map(({ id: _id, at: _at, ...m }) => m)) : []);
  const restSet = second ? resultOf(doc, step.id, second.id) : undefined;
  return {
    molecules: held(set),
    rest: held(restSet),
    holds: set.made.holds,
    ...(set.unread ? { unread: set.unread } : {}),
    ...(restSet?.unread ? { restUnread: restSet.unread } : {}),
  };
}

/**
 * `doc` with what a step last did kept among its earlier runs, its results
 * with it - as a new run is about to take its place (docs/WORKFLOWS.md,
 * *Earlier runs*): the run before this one is kept in full, and so is every
 * run the chemist keeps (`keep`); the others are dropped (`dropsOnRun`),
 * as the step's menu said before it ran - but only where the new run
 * starts (`starts`): one refused before it began drops nothing, what the
 * step last did kept with the rest. One that did nothing is not kept
 * itself, and then none is dropped.
 */
export function keepRun(doc: WorkspaceDocument, step: WorkflowStep, starts = true): WorkspaceDocument {
  const ran = step.ran;
  if (!ran || (!ran.ok && ran.took == null)) return doc;
  const results = resultsNow(doc, step);
  const kept: StepRunKept = { ...ran, kind: ran.kind ?? step.kind, ...((ran.options ?? step.options) ? { options: ran.options ?? step.options } : {}), ...(results ? { results } : {}) };
  return withStepRuns(doc, step.id, [kept, ...(step.runs ?? []).filter((r) => !starts || r.keep)]);
}

/** `doc` with a step's run kept, or no longer (`keep`): what it last did at -1, an earlier run by its place among them. */
export function keptRun(doc: WorkspaceDocument, id: number, index: number, keep: boolean): WorkspaceDocument {
  const step = stepOf(doc, id);
  const set = <R extends { keep?: true }>({ keep: _k, ...r }: R) => (keep ? { ...r, keep: true as const } : r);
  if (!step) return doc;
  if (index < 0) return step.ran ? setRan(doc, id, set(step.ran)) : doc;
  const runs = step.runs ?? [];
  return index < runs.length ? withStepRuns(doc, id, runs.map((r, i) => (i === index ? (set(r) as StepRunKept) : r))) : doc;
}

/** The earlier runs a step drops as it runs again (`keepRun`): those it does not keep - none, where what it last did is not kept in their place. */
export function dropsOnRun(step: WorkflowStep): StepRunKept[] {
  const ran = step.ran;
  if (!ran || (!ran.ok && ran.took == null)) return [];
  return (step.runs ?? []).filter((r) => !r.keep);
}

/**
 * `doc` with an earlier run of a step shown again: its results in the
 * step's result set and it as what the step last did - and what the step
 * showed till then kept among its runs in its place.
 */
export function showRun(
  doc: WorkspaceDocument,
  id: number,
  index: number,
  w: Pick<RunWith, "extentOf">,
  lay?: (results: RunResults, kind: StepKind) => (Turn3D | undefined)[] | undefined,
): WorkspaceDocument {
  const step = stepOf(doc, id);
  const shown = step?.runs?.[index];
  if (!step || !shown) return doc;
  const { results, ...ran } = shown;
  const now = step.ran ? resultsNow(doc, step) : undefined;
  const others = step.runs!.filter((_, i) => i !== index);
  const was = step.ran;
  const current: StepRunKept[] = was
    ? [{ ...was, kind: was.kind ?? step.kind, ...((was.options ?? step.options) ? { options: was.options ?? step.options } : {}), ...(now ? { results: now } : {}) }]
    : [];
  doc = withStepRuns(doc, id, [...current, ...others]);
  if (results) doc = placeResults(doc, stepOf(doc, id)!, results, w, lay?.(results, ran.kind ?? step.kind));
  return setRan(doc, id, ran);
}

/** A frame `w` wide and `h` tall, its top left at (x, y). */

/** The most a row of molecules in a result set spans before the next row begins - of a few; of many, as wide as `SET_ASPECT` makes it (`rowMost`). */
export const ROW_MOST = 12 * NOMINAL_BOND_LENGTH;
/**
 * How wide a result set of many molecules is laid out against how tall:
 * about a window's, 3 : 2, so that fitted to the view it reads as a grid -
 * not as a column one molecule wide.
 */
export const SET_ASPECT = 3 / 2;

/** How wide a result set's rows go: `ROW_MOST`, or - for many molecules - as wide as their room, laid out `SET_ASPECT` wide to tall, takes. */
export function rowMost(rooms: readonly (Frame & { chip: number })[]): number {
  let area = 0;
  for (const r of rooms) area += (r.x1 - r.x0 + BETWEEN) * (r.y1 - r.y0 + r.chip + BETWEEN);
  return Math.max(ROW_MOST, Math.sqrt(area * SET_ASPECT));
}
/** The least a result set's inside is wide: its name and count read whole. */
export const LEAST_W = 120 * PX;
/** The room a numbered structure's number takes under it (Workflow2D `numbered`): half a bond, and a line of 16 px. */
const NUMBER_ROOM = NOMINAL_BOND_LENGTH / 2 + 16 * PX;

/** A large result set's frame (`LARGE_SET`), as wide and as tall as its summary takes. */
export const SUMMARY_W = SUMMARY_PX.w * PX + 2 * SET_PAD;
export const SUMMARY_H = SET_TOP + SUMMARY_PX.h * PX + SET_PAD;

/**
 * What a step gave as an entry, where a program worked it out: besides its
 * geometry and energy, the path that led to it - an optimisation's
 * geometries before it, each with its energy - and what the calculation
 * says of it (lib/calc).
 */
export type Worked = SetEntry & {
  path?: number[][];
  pathEnergies?: number[];
  /** The path's frames after it, where it is a point the path goes on past - the highest a path search refined - and their energies: its entry is then that point, not the path's last. */
  after?: number[][];
  afterEnergies?: number[];
  /** Its share of its compound, where the program that found it worked one out (a conformer search's populations). */
  share?: number;
};

/** What a molecule made in 3D for a step keeps besides its atoms, bonds and places (entries `keptOf`). */
export { keptOf };

/**
 * What a step of `kind` gave, as its exits' sets are to hold it: its
 * molecules in 3D, those it set aside - made into the kind of set its
 * second exit holds (Choose one's, the conformers not chosen, a conformer
 * set still) - and what kind of set the first make.
 */
export function resultsOf(outcome: Extract<Outcome, { ok: true }>, kind: StepKind): RunResults {
  // (structures drawn, each as the step gave it: what it set aside too, in its second exit's set)
  if (outcome.holds === "structures") return { molecules: [], rest: [], holds: "structures", drawn: { made: outcome.kept.map(drawnModel), rest: outcome.aside.map(drawnModel), ...(outcome.core ? { core: outcome.core } : {}) } };
  // (what it set aside is molecules as what it kept is: its second exit's set holds them, in plain view)
  // (of molecules in 3D, molecules in 3D: no kind's second exit gives structures drawn of them)
  const asideHolds = (restHolds(kind, outcome.holds) ?? outcome.holds) as Holds3D;
  const rest = outcome.aside.length ? moleculesOf({ ...outcome, holds: asideHolds, kept: outcome.aside, shares: undefined }) : [];
  // (structures drawn it could not make in 3D - Conformers' - in its aside exit's set as they came: there to be followed, and wired on)
  const asideDrawn = "asideDrawn" in outcome && outcome.asideDrawn?.length ? { drawn: { made: [], rest: outcome.asideDrawn.map(drawnModel) } } : {};
  return { molecules: moleculesOf(outcome, kind === "conformers"), rest, holds: outcome.holds, ...asideDrawn, ...(outcome.tables ? { tables: { ...outcome.tables } } : {}) };
}

/** `doc` with what a step gave as the entries of its result set: made to the right of it, or the one it made before, emptied of what it held - each molecule given room as `turns` turns it. */
export function withResults(
  doc: WorkspaceDocument,
  step: WorkflowStep,
  outcome: Extract<Outcome, { ok: true }>,
  w: Pick<RunWith, "extentOf">,
  turns?: readonly (Turn3D | undefined)[],
): WorkspaceDocument {
  return placeResults(doc, step, resultsOf(outcome, step.kind), w, turns);
}

/** The kinds of step whose results are what came in, worked out: each laid over what it was worked out from as it is put down (`laidOver`). */
export const LAID_OVER: readonly StepKind[] = ["optimise", "minimise", "energy", "frequencies", "nci"];

/**
 * How each molecule a step gave is first turned, where it is what came in
 * worked out (docs/WORKFLOWS.md, *Results*): as what it was worked out from
 * lies - its geometry as it is shown, its last frame, laid best over that of
 * the entry of the same atoms nearest to it (Horn's quaternion,
 * utils/align3d), and turned as that entry's molecule is (`turnOf`). A
 * program may give a molecule turned and moved - Gaussian, in its standard
 * orientation - and it is seen as it went. Unset, where no entry has its
 * atoms.
 */
export function laidOver(
  molecules: readonly Pick<Molecule3D, "atoms" | "frames">[],
  entries: readonly SetEntry[],
  turnOf: (e: SetEntry) => Turn3D | undefined,
): (Turn3D | undefined)[] {
  return molecules.map((m) => {
    const xyz = frameXyz(m, framesOf(m) - 1);
    let best: SetEntry | undefined;
    let least = Infinity;
    for (const e of entries) {
      if (e.atoms.length !== m.atoms.length || e.atoms.some((a, i) => a.el !== m.atoms[i].el)) continue;
      const d = rmsd(xyz, e.xyz);
      if (d < least) {
        least = d;
        best = e;
      }
    }
    if (!best) return undefined;
    const fit = turnOver(xyz, best.xyz);
    const turn = turnOf(best);
    return turn ? turnAfter(turn, fit) : fit;
  });
}

/**
 * `doc` with a step's results - its molecules in 3D, those it set aside,
 * and what kind of set they make - as the entries of its result set: made
 * to the right of it, or the one it made before, emptied of what it held.
 * Each molecule is given room as it will be turned (`turns`), where it is.
 */
export function placeResults(
  doc: WorkspaceDocument,
  step: WorkflowStep,
  results: RunResults,
  w: Pick<RunWith, "extentOf">,
  turns?: readonly (Turn3D | undefined)[],
): WorkspaceDocument {
  const { molecules: made, rest, holds, unread, restUnread } = results;
  const first = exitsOf(step.kind)[0];
  const aside = asideExit(step.kind);
  if (holds === "structures") {
    // (with how many of each did not read from a file, said in its frame as molecules' are)
    doc = keepExitsUnder(fillDrawn(doc, step, first.id, results.drawn?.made ?? [], results.drawn?.core, unread), step);
    return aside ? fillDrawn(doc, step, aside.id, results.drawn?.rest ?? [], results.drawn?.core, restUnread) : doc;
  }
  doc = keepExitsUnder(fillExit(doc, step, first.id, made, holds, unread, w, turns), step);
  // (what it set aside, in its aside exit's set: counted and in plain view, and it can be wired on - structures drawn it could not make in 3D as they came)
  if (aside && results.drawn?.rest.length) doc = fillDrawn(doc, step, aside.id, results.drawn.rest, undefined, restUnread);
  else if (aside) doc = fillExit(doc, step, aside.id, rest, restHolds(step.kind, holds) ?? holds, restUnread, w);
  // (a table it gave at a later exit - a Reaction's bond changes - in that exit's set: under the others as they have grown)
  const tables = Object.entries(results.tables ?? {});
  for (const [exit, table] of tables) doc = fillTable(doc, step, exit, table);
  return tables.length ? keepExitsUnder(doc, step) : doc;
}

/**
 * `doc` with an exit's set holding `table`, a step's (a Reaction's bond
 * changes): the set that exit made, what it held gone, as large as a table
 * set is put down - in its place, or made now.
 */
function fillTable(doc: WorkspaceDocument, step: WorkflowStep, exit: string, table: Table): WorkspaceDocument {
  const madeBy = { step: step.id, exit, holds: "table" as const };
  const was = resultOf(doc, step.id, exit);
  if (was) doc = removeMolecules3d(doc, setMembers(doc, was).molecules);
  const frame = was ? placeAgain(doc, step, was, TABLE_SET.w, TABLE_SET.h) : placeFor(doc, step, TABLE_SET.w, TABLE_SET.h);
  if (was) return holdTable(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, table);
  const id = doc.nextWorkflowId ?? 1;
  return holdTable(markMade(addSet(doc, frame, madeBy), id, madeBy), id, table);
}

/**
 * `doc` with a step's later exits' sets kept under its first, as they were
 * made (`withExits`): each moved down, with what it holds, where the one
 * above it has grown onto it - never up, nor sideways.
 */
function keepExitsUnder(doc: WorkspaceDocument, step: Pick<WorkflowStep, "id" | "kind">): WorkspaceDocument {
  const exits = exitsOf(step.kind);
  let above = resultOf(doc, step.id, exits[0].id);
  for (const [k, exit] of exits.slice(1).entries()) {
    const b = resultOf(doc, step.id, exit.id);
    if (!above || !b) break;
    const reach = above.y0 - BETWEEN;
    // (under the one above where it reached over it - and lower still, where something else is there: clear of all, as any set -
    //  but the step's sets of exits after it, which go under it in turn)
    const under = b.y1 > reach && b.x0 < above.x1 + BETWEEN && b.x1 > above.x0 - BETWEEN;
    const after = new Set(exits.slice(k + 2).flatMap((e) => resultOf(doc, step.id, e.id)?.id ?? []));
    const self = { set: b.id, sets: after, molecules: new Set(setMembers(doc, b).molecules), step: step.id };
    if (under || !clearOf(doc, b, self)) {
      const to = placeBelow(doc, b.x0, Math.min(b.y1, reach), b.x1 - b.x0, b.y1 - b.y0, self);
      doc = moveSet(doc, b.id, to.x0 - b.x0, to.y1 - b.y1);
    }
    above = resultOf(doc, step.id, exit.id);
  }
  return doc;
}

/**
 * `doc` with an exit's set holding `made`, molecules in 3D: the set that
 * exit made - emptied of what its step put there - or one made now, sized
 * to what it holds and laid out as a run lays its results; more than are
 * laid out on the page, held in the set itself. With how many did not read
 * from a file (`unread`), where any.
 */
function fillExit(
  doc: WorkspaceDocument,
  step: WorkflowStep,
  exit: string,
  made: readonly Omit<Molecule3D, "id" | "at">[],
  holds: SetKind,
  unread: number | undefined,
  w: Pick<RunWith, "extentOf">,
  turns?: readonly (Turn3D | undefined)[],
): WorkspaceDocument {
  // (more than are laid out on the page: held in the set, its frame summing them up - docs/WORKFLOWS-FOUNDATION.md, *What a set shows*)
  if (made.reduce((n, m) => n + entriesIn(m), 0) > LARGE_SET) return filled(doc, step, { exit, holds, unread, collection: [...made] }, [], () => ({ doc, members: [] }));
  const rooms = made.map((m, i) => roomOf(m, w.extentOf({ ...m, at: { x: 0, y: 0 } }, turns?.[i])));
  return filled(doc, step, { exit, holds, unread }, rooms, (d, at) => {
    // (all put on the page at once: one at a time copied the page's molecules again for each)
    const there = new Set((d.molecules3d ?? []).map((m) => m.id));
    d = addMolecules3d(d, made.map((m, i) => ({ ...m, at: at[i] })));
    return { doc: d, members: (d.molecules3d ?? []).filter((m) => !there.has(m.id)).map((m) => ({ molecule: m.id })) };
  });
}

/**
 * `doc` with an exit's set holding the structures drawn `made`, each as it
 * was given: the set that exit made - emptied of what its step put there -
 * or one made now, sized to what it holds, each laid out as a run lays its
 * results (`laidOut`) by its atoms' box (chem/make3d `boxOf`), and put on
 * the page as it was drawn, moved whole. Each its own structure, its atoms
 * numbered afresh, as a paste is; and the set keeps which atoms they are
 * (`WorkflowSet.put`), for the next run to take away those alone. As many
 * as take no more of the page than `DRAWN_ON_PAGE` allows are put on it,
 * in the step's order; the rest are held in the set itself, after them,
 * off the page (`WorkflowSet.drawnCollection`). With how many did not read
 * from a file (`unread`), where any.
 */
function fillDrawn(doc: WorkspaceDocument, step: WorkflowStep, exit: string, given: readonly DrawnModel[], core?: SeriesCore, unread?: number): WorkspaceDocument {
  // (each about the middle of its box)
  const boxes = given.map(boxOf);
  const middles = boxes.map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }));
  // (a structure its step numbered given room for its number under it, as Workflow2D shows it: half a bond down, a line of 16 px)
  const all = boxes.map((b, i) => ({ x0: b.x0 - middles[i].x, x1: b.x1 - middles[i].x, y0: b.y0 - middles[i].y, y1: b.y1 - middles[i].y, chip: recordNumber(given[i].record) != null ? NUMBER_ROOM : 0 }));
  // (those the page shows, by the room they take; the rest held in the set)
  const shown = drawnShown(all);
  const made = given.slice(0, shown);
  const rooms = all.slice(0, shown);
  const filledIn = filled(doc, step, { exit, holds: "structures", unread, ...(core ? { core } : {}) }, rooms, (d, at) => {
    // (all put on the page at once, as one model - one at a time copied the page's drawing again for each - their ids made apart first: two given in one numbering, as a template's products are, would be one structure)
    const apart = numberedApart(made.map((m, i) => movedBy(m, at[i].x - middles[i].x, at[i].y - middles[i].y)));
    const there = new Set(d.model.atoms.map((a) => a.id));
    d = appendModel(d, apart);
    // (each structure's atoms, as many as it brought)
    const added = d.model.atoms.filter((a) => !there.has(a.id)).map((a) => a.id);
    let from = 0;
    // (each with its record, where the step gave it one: of that structure, as it is drawn now)
    return {
      doc: d,
      members: made.map((m) => {
        const ids = added.slice(from, (from += m.atoms.length));
        return structureMember(ids, m.record && recordOn(m.record, d.model, ids));
      }),
      put: added,
    };
  });
  const set = resultOf(filledIn, step.id, exit);
  return set ? holdRest(filledIn, set.id, given.slice(shown)) : filledIn;
}

/**
 * The part of filling an exit's set that molecules in 3D and structures
 * drawn share: the set that exit made, emptied of what its step put there
 * (`emptied`) - or, given nothing, kept as it stands, saying so - or one
 * made now, as large as `rooms` laid out need (`laidOut`), its top left
 * where the old one's was; then `place` puts what it holds on the page,
 * each at its place, and the set holds those, in the step's order - and
 * the atoms its step put, where it put any. A `collection` or a
 * `drawnCollection` - more than are laid out on the page - is held in the
 * set itself, its frame summing it up. With how many did not read from a file (`unread`), where any.
 */
function filled(
  doc: WorkspaceDocument,
  step: WorkflowStep,
  of: { exit: string; holds: SetKind; unread?: number; collection?: NonNullable<WorkflowSet["collection"]>; drawnCollection?: NonNullable<WorkflowSet["drawnCollection"]>; core?: SeriesCore },
  rooms: readonly (Frame & { chip: number })[],
  place: (doc: WorkspaceDocument, at: readonly { x: number; y: number }[]) => { doc: WorkspaceDocument; members: Member[]; put?: number[] },
): WorkspaceDocument {
  const was = resultOf(doc, step.id, of.exit);
  if (was) doc = emptied(doc, was);
  const madeBy = { step: step.id, exit: of.exit, holds: of.holds };
  if (of.collection || of.drawnCollection) {
    const frame = was ? placeAgain(doc, step, was, SUMMARY_W, SUMMARY_H) : placeFor(doc, step, SUMMARY_W, SUMMARY_H);
    const id = was ? was.id : (doc.nextWorkflowId ?? 1);
    doc = was ? markMade(resizeSet(doc, id, frame), id, madeBy) : markMade(addSet(doc, frame, madeBy), id, madeBy);
    return withCore(holdCollection(doc, id, of.collection ? { collection: of.collection } : { drawnCollection: of.drawnCollection! }, of.unread), id, of.core);
  }
  // (an exit that gave nothing keeps its frame as it stands, saying so)
  if (!rooms.length) {
    const where = setForExit(doc, step, of.exit);
    return holdMembers(markMade(where.doc, where.id, madeBy), where.id, [], of.unread);
  }
  // (in rows no wider than its step's column, where the next step's card is close: the set grows down, not over the steps after it)
  const room = columnWidth(doc, step) - 2 * SET_PAD;
  const lay = laidOut(rooms, LEAST_W, Math.max(...rooms.map((r) => r.x1 - r.x0), Math.min(rowMost(rooms), room)));
  const frame = was ? placeAgain(doc, step, was, lay.width, lay.height) : placeFor(doc, step, lay.width, lay.height);
  const put = place(doc, lay.at.map((p) => ({ x: frame.x0 + p.x, y: frame.y1 + p.y })));
  doc = put.doc;
  const id = was ? was.id : (doc.nextWorkflowId ?? 1);
  doc = was ? markMade(resizeSet(doc, id, frame), id, madeBy) : markMade(addSet(doc, frame, madeBy), id, madeBy);
  // (and the core its series shares, where it is one: none kept from a run before)
  return withCore(heldPut(holdMembers(doc, id, put.members, of.unread), id, put.put ?? []), id, of.core);
}

/**
 * `doc` without what a result set's step put in it, as the step runs again
 * - and nothing else: its molecules in 3D, which are all its step's (a
 * result set takes in nothing dropped into it: workflow/model
 * `membersSettled`); and the atoms of the structures drawn its step put on
 * the page (`WorkflowSet.put`), with their bonds. A structure the chemist
 * joined to one of them by a bond keeps its own atoms, and one dropped into
 * the frame is none of the set's.
 */
function emptied(doc: WorkspaceDocument, set: WorkflowSet): WorkspaceDocument {
  doc = removeMolecules3d(doc, setMembers(doc, set).molecules);
  return set.put?.length ? heldPut(withoutAtoms(doc, set.put), set.id, []) : doc;
}

/** `doc` with a result set holding the core its series shares (`WorkflowSet.core`) - or none. */
function withCore(doc: WorkspaceDocument, id: number, core: SeriesCore | undefined): WorkspaceDocument {
  return { ...doc, sets: (doc.sets ?? []).map((b) => (b.id !== id ? b : core ? { ...b, core } : (({ core: _was, ...rest }) => rest)(b))) };
}

/** A structure drawn moved whole by (dx, dy): its atoms, and the marks put by hand that go with them. */
function movedBy(m: Model, dx: number, dy: number): Model {
  const at = <P extends { x: number; y: number } | undefined>(p: P): P => (p ? { ...p, x: p.x + dx, y: p.y + dy } : p);
  return {
    atoms: m.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy, ...(a.chargeAt ? { chargeAt: at(a.chargeAt) } : {}), ...(a.stereoAt ? { stereoAt: at(a.stereoAt) } : {}) })),
    bonds: m.bonds.map((b) => (b.stereoAt ? { ...b, stereoAt: at(b.stereoAt) } : b)),
  };
}

/**
 * Structures drawn as one model, each's atoms, bonds and groups given ids
 * of their own apart from the others' - as `appendModel` renumbers what it
 * adds by id - and none of them a record of a stack (utils/stacks): each a
 * structure in its own right.
 */
function numberedApart(models: readonly Model[]): Model {
  const out: Model = { atoms: [], bonds: [] };
  let next = 1;
  for (const m of models) {
    const ids = new Map<number, number>();
    const groups = new Map<number, number>();
    for (const a of m.atoms) ids.set(a.id, next++);
    const group = (g: number) => {
      if (!groups.has(g)) groups.set(g, next++);
      return groups.get(g)!;
    };
    for (const { stack: _stack, ...a } of m.atoms) {
      out.atoms.push({
        ...a,
        id: ids.get(a.id)!,
        ...(a.sgroups ? { sgroups: a.sgroups.map((g) => ({ ...g, id: group(g.id), ...(g.parent != null ? { parent: group(g.parent) } : {}) })) } : {}),
      });
    }
    for (const b of m.bonds) {
      out.bonds.push({ ...b, id: next++, a: ids.get(b.a)!, b: ids.get(b.b)!, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => ids.get(e)!) } : {}) });
    }
  }
  return out;
}

/**
 * `doc` with molecules in 3D put on the page as a set of their own - laid
 * out as a run lays its results, named `name`, the set's middle at `at`, or where
 * `placed` moves it, told how large the set is (clear of what is there) -
 * as a chemist puts a set round them: structures read from coordinates in
 * a text (lib/io/coordinates), say.
 */
export function placeAsSet(
  doc: WorkspaceDocument,
  ms: readonly Omit<Molecule3D, "id" | "at">[],
  asked: { x: number; y: number },
  w: Pick<RunWith, "extentOf">,
  placed: (width: number, height: number) => { x: number; y: number } = () => asked,
  name?: string,
): WorkspaceDocument {
  if (!ms.length) return doc;
  const lay = laidOut(ms.map((m) => roomOf(m, w.extentOf({ ...m, at: { x: 0, y: 0 } }))));
  const at = placed(lay.width, lay.height);
  const frame = frameAt(at.x - lay.width / 2, at.y + lay.height / 2, lay.width, lay.height);
  doc = addMolecules3d(doc, ms.map((m, i) => ({ ...m, at: { x: frame.x0 + lay.at[i].x, y: frame.y1 + lay.at[i].y } })));
  return addSet(doc, frame, undefined, name);
}

/**
 * The room a molecule in a result set takes about its middle: as far as it
 * reaches (`e`), a quarter of a bond at least each way - and its frames
 * chip's below it, where it has one, as wide as the chip where that is
 * wider than the molecule (centred under it: "4 / 4 · 0.00 kcal/mol" is
 * wider than a water).
 */
function roomOf(m: Pick<Molecule3D, "frames" | "calc" | "energies" | "shares" | "numbers" | "conformerSet"> & Partial<Pick<Molecule3D, "title" | "stack" | "partOf" | "degeneracies">>, e: Frame): Frame & { chip: number } {
  const least = NOMINAL_BOND_LENGTH / 4;
  const half = chipWide(m) / 2;
  return { x0: Math.min(e.x0, -least, -half), x1: Math.max(e.x1, least, half), y0: Math.min(e.y0, -least), y1: Math.max(e.y1, least), chip: hasChip(m) ? CHIP : 0 };
}

/**
 * How a result set's molecules lie in it, each taking the room `rooms` says:
 * under its name, in rows, left to right, a row going no wider than
 * `most` (`rowMost`: of many, about a window's shape), and the whole in the middle of the set where the set is wider
 * - its inside at least `least` wide, so that its name reads whole. Each
 * molecule's place from the set's top left, and the set's width and height.
 */
export function laidOut(rooms: readonly (Frame & { chip: number })[], least = LEAST_W, most = rowMost(rooms)): { at: { x: number; y: number }[]; width: number; height: number } {
  const places: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let wide = 0;
  rooms.forEach((size) => {
    const d = size.x1 - size.x0;
    if (x > 0 && x + d > most) {
      y -= rowH + BETWEEN;
      x = 0;
      rowH = 0;
    }
    places.push({ x: x - size.x0, y: y - size.y1 });
    x += d + BETWEEN;
    rowH = Math.max(rowH, size.y1 - size.y0 + size.chip);
    wide = Math.max(wide, x - BETWEEN);
  });
  const tall = -y + rowH;
  const inner = Math.max(wide, least);
  const middle = (inner - wide) / 2;
  return {
    at: places.map((p) => ({ x: SET_PAD + middle + p.x, y: -SET_TOP + p.y })),
    width: inner + 2 * SET_PAD,
    height: SET_TOP + tall + SET_PAD,
  };
}

/**
 * `doc` with each result set whose molecules no longer fit it laid out
 * again (the maintainer, 2026-10-13): a molecule reaching past its frame
 * or onto its name, or two over one another, as each is drawn now
 * (`extentOf`, in its look and turned as `turnOf` says) - a bigger 3D look
 * chosen, say. The frame widens as far as they need, its top left where it
 * was, never narrower or shorter than it was; they lie in it as a run lays
 * them, in the order the run gave them - or, where the set would then
 * reach over something beside it (the next step's card), in rows no wider
 * than it was, the set growing downwards. A set they fit, a chemist's set and a set
 * of pictures are left as they are - and, where `only` says, a set holding
 * none of those molecules.
 */
export function fitResultSets(
  doc: WorkspaceDocument,
  extentOf: RunWith["extentOf"],
  turnOf: (id: number) => Turn3D | undefined = () => undefined,
  only?: ReadonlySet<number>,
): WorkspaceDocument {
  const EPS = 1e-6;
  for (const set of doc.sets ?? []) {
    if (!set.made || set.made.holds === "pictures") continue;
    // (in the order the run gave them - not as they read now: a molecule grown big has its middle lower than its neighbour's)
    const member = new Set(setMembers(doc, set).molecules);
    const ms = (doc.molecules3d ?? []).filter((m) => member.has(m.id));
    if (!ms.length || (only && !ms.some((m) => only.has(m.id)))) continue;
    // (its reach about its middle, wherever it is: asked of the molecule itself, which a caller may remember it by)
    const rooms = ms.map((m) => roomOf(m, extentOf(m, turnOf(m.id))));
    // (each where it is: its reach, and its chip below it)
    const boxes = ms.map((m, i) => ({ x0: m.at.x + rooms[i].x0, x1: m.at.x + rooms[i].x1, y0: m.at.y + rooms[i].y0 - rooms[i].chip, y1: m.at.y + rooms[i].y1 }));
    const within = boxes.every((b) => b.x0 >= set.x0 - EPS && b.x1 <= set.x1 + EPS && b.y0 >= set.y0 - EPS && b.y1 <= set.y1 - SET_TOP + EPS);
    const apart = boxes.every((a, i) => boxes.every((b, j) => j <= i || !(a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS)));
    if (within && apart) continue;
    const least = Math.max(LEAST_W, set.x1 - set.x0 - 2 * SET_PAD);
    const frameOf = (l: { width: number; height: number }) => frameAt(set.x0, set.y1, l.width, Math.max(l.height, set.y1 - set.y0));
    // (its step's other exits' sets are no hindrance: they move down with it)
    const siblings = new Set((doc.sets ?? []).filter((b) => b.made?.step === set.made!.step).map((b) => b.id));
    let lay = laidOut(rooms, least);
    if (!clearOf(doc, frameOf(lay), { set: set.id, molecules: member, sets: siblings, step: set.made.step })) lay = laidOut(rooms, least, Math.max(least, ...rooms.map((r) => r.x1 - r.x0)));
    doc = moveMolecules3d(doc, ms.map((m, i) => ({ id: m.id, at: { x: set.x0 + lay.at[i].x, y: set.y1 + lay.at[i].y } })));
    doc = resizeSet(doc, set.id, frameOf(lay));
    const step = doc.steps?.find((s) => s.id === set.made!.step);
    if (step) doc = keepExitsUnder(doc, step);
  }
  return doc;
}


/**
 * What a step kept, as molecules in 3D: a conformer set's compounds, each a
 * molecule with its conformers as frames; a compound set's entries, each a
 * molecule of its own - an optimised one with the path that led to it as
 * its frames, ending at it, and what its calculation says.
 */
/**
 * The charge and spin an entry came in with from a calculation, where it
 * leaves a step that is not one (Meno's own: they say no calculation of
 * their own): kept as what the molecule knows of its calculation, so that
 * the next step is told them, not what its atoms say.
 */
export function speciesKept(e: SetEntry): Pick<Molecule3D, "calc"> | Record<string, never> {
  if (e.charge == null && e.multiplicity == null) return {};
  return { calc: { readers: [], ...(e.charge != null ? { charge: e.charge } : {}), ...(e.multiplicity != null ? { multiplicity: e.multiplicity } : {}) } };
}

/** The imaginary frequencies an entry was judged to have: its calculation's verdict - one a program step just made - else its own. */
const imaginaryOfEntry = (e: SetEntry): number[] | undefined => (e as Worked).calc?.imaginary ?? e.imaginary;

function moleculesOf(outcome: Extract<Outcome3D, { ok: true }>, search = false): Omit<Molecule3D, "id" | "at">[] {
  const atomsAt = (e: SetEntry, xyz: readonly number[] = e.xyz) => e.atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
  // (the shares a step worked out - Meno's Populations - else those the program that found them gave)
  const share = new Map(outcome.kept.map((e, i) => [e, outcome.shares?.[i] ?? (e as Worked).share]));
  if (outcome.holds !== "conformers") {
    return (outcome.kept as Worked[]).map((e) => {
      const path = e.path?.length ? e.path : undefined;
      // (a path that goes on past it - a path search's, its point refined between its ends: frames after it, and it the molecule's entry)
      const after = path && e.after?.length ? e.after : [];
      const afterEnergies = after.length && e.afterEnergies?.length === after.length ? e.afterEnergies : after.length ? undefined : [];
      const energies = path
        ? e.pathEnergies?.length === path.length && e.energy != null && afterEnergies
          ? [...e.pathEnergies, e.energy, ...afterEnergies]
          : undefined
        : e.energy != null
          ? [e.energy]
          : undefined;
      const tail = after.map(() => ({}));
      return {
        atoms: atomsAt(e, path ? path[0] : e.xyz),
        bonds: e.bonds.map((b) => ({ ...b })),
        ...(path ? { frames: [...path.slice(1).map((f) => [...f]), [...e.xyz], ...after.map((f) => [...f])], ...(after.length ? { entryFrames: [path.length] } : { path: true as const }) } : {}),
        ...(energies ? { energies } : {}),
        ...(e.calc ? { calc: e.calc } : speciesKept(e)),
        ...(e.name ? { name: e.name } : {}),
        // (its properties, as its last frame's: none for a path's frames before it)
        ...(e.properties ? { properties: [...(path ?? []).map(() => ({})), e.properties, ...tail] } : {}),
        ...keptKnown(e),
        // (how many it stands for, and its mirror image's atoms where one was counted in - of its last geometry; a path's
        //  frames before it, one each, none)
        ...(e.degeneracy != null && e.degeneracy !== 1 ? { degeneracies: [...(path ?? []).map(() => 1), e.degeneracy, ...after.map(() => 1)] } : {}),
        ...(e.mirror ? { mirrors: [...(path ?? []).map(() => null), [...e.mirror], ...after.map(() => null)] } : {}),
        ...(e.partOf ? { partOf: true as const } : {}),
        // (why a program step could not do it, where one could not: its Failed exit's - and its other marks - of its
        //  last frame, a path's own frames before it none)
        ...marksOf([...(path ?? []).map(() => ({})), { failed: e.failed, imaginary: imaginaryOfEntry(e), marksUnread: e.marksUnread }, ...tail]),
        // (where a run ended converged at it: of its own frame alone - a path's frames before and after it, none)
        ...(e.converged ? { converged: [...(path ?? []).map(() => null), e.converged, ...after.map(() => null)] } : {}),
        ...e.keep,
      };
    });
  }
  const groups = new Map<number, SetEntry[]>();
  for (const e of outcome.kept) pushTo(groups, e.compound, e);
  return [...groups.values()].map((g) => {
    const first = g[0];
    const alike = unlikeMade(g) == null;
    const energies = alike && g.every((e) => e.energy != null) ? g.map((e) => e.energy!) : undefined;
    const shares = alike && g.every((e) => share.get(e) != null) ? g.map((e) => share.get(e)!) : undefined;
    // (each one's degeneracy, where all said one and one is more than one: what a Boltzmann weight of the set counts in)
    const degeneracies = g.every((e) => e.degeneracy != null) && g.some((e) => e.degeneracy !== 1) ? g.map((e) => e.degeneracy!) : undefined;
    // (each conformer's properties, as it came, and what its own calculation read - its free energy, its vibrations - which
    //  the molecule's one calculation below cannot keep for each (entries `calcProperties`): an empty map where it had none)
    const carried = g.map((e) => ({ ...e.properties, ...calcProperties(e) }));
    const properties = carried.some((p) => Object.keys(p).length) ? carried : undefined;
    // (what the calculation was, where a program worked them out - each conformer's results its own, not the
    //  compound's - only where all were made alike, and of what they keep, what all keep alike: else no
    //  calculation, nor energies of different calculations in one list. Meno's As conformers refuses such a set
    //  first, saying why)
    const calc = alike ? (first as Worked).calc : undefined;
    return {
      atoms: atomsAt(first),
      bonds: first.bonds.map((b) => ({ ...b })),
      ...(g.length > 1 ? { frames: g.slice(1).map((e) => [...e.xyz]) } : {}),
      ...(energies ? { energies } : {}),
      numbers: g.map((e) => e.number),
      ...(shares ? { shares } : {}),
      ...(degeneracies ? { degeneracies } : {}),
      ...(properties ? { properties } : {}),
      ...(g.some((e) => e.mirror) ? { mirrors: g.map((e) => (e.mirror ? [...e.mirror] : null)) } : {}),
      // (what the calculation found of the first alone - its results, its imaginary frequencies - not the compound's; but a
      //  search's results, which programs conformersWorked keeps with the first, are of its run, the compound's: how it
      //  took conformers as one, as its program said - kept)
      ...(calc ? { calc: { ...calc, results: search ? calc.results : undefined, source: undefined, imaginary: undefined } } : speciesKept(first)),
      conformerSet: true,
      // (a part of a search's conformers where any of them was - As conformers grouping one with others too: its shares not shown unless a Populations step worked them out)
      ...(g.some((e) => e.partOf) ? { partOf: true as const } : {}),
      ...(first.name ? { name: first.name } : {}),
      ...keptKnown(first),
      // (each conformer's marks: why it failed, its imaginary frequencies as its calculation judged them, and whether its marks did not read)
      ...marksOf(g.map((e) => ({ failed: e.failed, imaginary: imaginaryOfEntry(e), marksUnread: e.marksUnread }))),
      // (where a run ended converged at each conformer: its own)
      ...(g.some((e) => e.converged) ? { converged: g.map((e) => e.converged ?? null) } : {}),
      ...(alike ? keptAlike(g) : {}),
    };
  });
}
