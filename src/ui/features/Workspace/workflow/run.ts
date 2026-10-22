/**
 * A step run (docs/WORKFLOWS.md, *Running*), where Meno does it: first any
 * step before it that has not run or has changed, then it, on what comes
 * in - what it gave coming in as a result set to the right of it, or in
 * the one it made before, in place of what that held. One edit: an undo
 * takes the run's results away.
 */
import { addMolecules3d, moveMolecules3d, removeMolecules3d, type WorkspaceDocument } from "../document";
import type { Molecule3D, StepRunKept, Turn3D, WorkflowSet, WorkflowStep } from "../store/types";
import { levelOf } from "../../../../lib/calc/output";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { turnAfter, turnOver } from "../utils/align3d";
import { setMembers, setMolecules, inside, setEntries, frameXyz, framesOf, entriesIn, keptOf, keptAlike, unlikeMade, LARGE_SET, type Frame, type SetEntry } from "./entries";
import { hasChip, named3d } from "./selectionSet";
import { findSet, inputKey, inputOf, resultOf, stateOf, stepOf, stepsBefore, wireInto } from "./flow";
import { exitsOf, kindInfo, MENO_DOES, restHolds, type SetKind, type StepKind } from "./kinds";
import { takesBy } from "./doers";
import { BETWEEN, SET_PAD, SET_TOP, CARD_H, CARD_W, CHIP, CHIP_CHAR, CHIP_SIDES, GAP, PX, SUMMARY_PX } from "./look";
import { pushTo, runMeno, type Outcome } from "./meno";
import { addSet, holdCollection, holdMembers, resizeSet, markMade, RUNS_KEPT, setRan, setForExit, withStepRuns } from "./model";
import { rmsd } from "./rmsd";

/**
 * What a run needs of the canvas: how far a molecule in 3D reaches on the
 * page about its middle - left, right, down and up - in any of its frames,
 * turned by `turn`, where it is; who does a step; and the time.
 */
export type RunWith = { extentOf: (m: Omit<Molecule3D, "id">, turn?: Turn3D) => Frame; byOf: (step: WorkflowStep) => string; now: number };

/** What each kind of set is called, where a step says what it takes. */
const SET_NAMES: Record<SetKind, string> = { structures: "structures drawn", molecules: "molecules in 3D", conformers: "conformer sets" };

/** `doc` with the step `id` run - and first the steps before it that need it. */
export function runStep(doc: WorkspaceDocument, id: number, w: RunWith, depth = 0): WorkspaceDocument {
  const step = stepOf(doc, id);
  if (!step || depth > 200) return doc;
  // what comes in, made first where it has not been, or is out of date -
  // or where any step before it, however far back, is: what that gives
  // anew comes down to it
  const from = wireInto(doc, id)?.from;
  const before = from ? findSet(doc, from.set)?.made?.step : undefined;
  const prior = before != null ? stepOf(doc, before) : undefined;
  const stale = (sid: number) => {
    const s = stepOf(doc, sid);
    return !!s && stateOf(doc, s, w.byOf(s)) !== "done";
  };
  if (prior && [prior.id, ...stepsBefore(doc, prior.id)].some(stale)) doc = runStep(doc, prior.id, w, depth + 1);

  const by = w.byOf(step);
  const input = inputOf(doc, id);
  const key = inputKey(doc, step, by);
  const as = { kind: step.kind, ...(step.options ? { options: step.options } : {}) };
  const fail = (said: string) => setRan(keepRun(doc, step), id, { at: w.now, ok: false, said, input: key, ...as });
  const why = whyNot(doc, step, by);
  if (why) return fail(why);
  if (by !== "meno" || !MENO_DOES.includes(step.kind)) return fail("Nothing added does this step");
  if (!input) return fail("Nothing comes into it");
  const outcome = runMeno(step.kind, setEntries(input.molecules, input.holds as "molecules" | "conformers"), input.holds, step.options, energiesBy(input.molecules));
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
  if (!outcome.ok) return setRan(keepRun(doc, step), id, { at: w.now, ok: false, said: outcome.said, input: key, ...as });
  return setRan(withResults(keepRun(doc, step), step, outcome, w), id, { at: w.now, ok: true, said: outcome.said, input: key, ...as });
}

/**
 * Why a step cannot run as things are, whoever does it: the step before it
 * failed this time; nothing comes into it; what does is not what it takes;
 * nothing added does it. None, where it can.
 */
export function whyNot(doc: WorkspaceDocument, step: WorkflowStep, by: string): string | null {
  const from = wireInto(doc, step.id)?.from;
  const before = from ? findSet(doc, from.set)?.made?.step : undefined;
  // (not on what a step before it gave on an earlier run: it failed this time)
  if (before != null && stepOf(doc, before)?.ran?.ok === false) return "The step before it failed";
  const input = inputOf(doc, step.id);
  if (!input) return "Nothing comes into it";
  if (!takesBy(step.kind, by, input.holds)) return `Takes ${kindInfo(step.kind).takes.filter((s) => takesBy(step.kind, by, s)).map((s) => SET_NAMES[s]).join(" or ")}`;
  if (!by) return "Nothing added does this step";
  return null;
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

/** What a run gave, exit by exit: the molecules its first exit holds, those its second holds - what it set aside - and what kind of set they make; with how many of each did not read from a file. */
export type RunResults = NonNullable<StepRunKept["results"]>;

/** What a step's result set holds now, as a run kept keeps it; none, where it has made none - or made pictures, which a run kept does not keep. */
export function resultsNow(doc: WorkspaceDocument, step: WorkflowStep): RunResults | undefined {
  const set = resultOf(doc, step.id);
  if (!set?.made?.holds || set.made.holds === "pictures") return undefined;
  // (each exit's set: its collection, where it holds one, else its molecules on the page)
  const held = (b: WorkflowSet | undefined) => (b ? (b.collection ?? setMolecules(doc, b).map(({ id: _id, at: _at, ...m }) => m)) : []);
  const second = exitsOf(step.kind)[1];
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
 * with it - as a new run is about to take its place. One that did nothing -
 * refused before it began - is not kept.
 */
export function keepRun(doc: WorkspaceDocument, step: WorkflowStep): WorkspaceDocument {
  const ran = step.ran;
  if (!ran || (!ran.ok && ran.took == null)) return doc;
  const results = resultsNow(doc, step);
  const kept: StepRunKept = { ...ran, kind: ran.kind ?? step.kind, ...((ran.options ?? step.options) ? { options: ran.options ?? step.options } : {}), ...(results ? { results } : {}) };
  return withStepRuns(doc, step.id, [kept, ...(step.runs ?? [])].slice(0, RUNS_KEPT));
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
  doc = withStepRuns(doc, id, [...current, ...others].slice(0, RUNS_KEPT));
  if (results) doc = placeResults(doc, stepOf(doc, id)!, results, w, lay?.(results, ran.kind ?? step.kind));
  return setRan(doc, id, ran);
}

/** A frame `w` wide and `h` tall, its top left at (x, y). */
export const frameAt = (x: number, y: number, w: number, h: number): Frame => ({ x0: x, x1: x + w, y0: y - h, y1: y });

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
  // (what it set aside is molecules as what it kept is: its second exit's set holds them, in plain view)
  const asideHolds = restHolds(kind, outcome.holds) ?? outcome.holds;
  const rest = outcome.aside.length ? moleculesOf({ ...outcome, holds: asideHolds, kept: outcome.aside, shares: undefined }) : [];
  return { molecules: moleculesOf(outcome), rest, holds: outcome.holds };
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
export const LAID_OVER: readonly StepKind[] = ["optimise", "energy", "frequencies", "nci"];

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
  const exits = exitsOf(step.kind);
  doc = fillExit(doc, step, exits[0].id, made, holds, unread, w, turns);
  // (what it set aside, in its second exit's set: counted and in plain view, and it can be wired on)
  if (exits[1]) doc = fillExit(doc, step, exits[1].id, rest, restHolds(step.kind, holds) ?? holds, restUnread, w);
  return doc;
}

/**
 * `doc` with an exit's set holding `made`: the set that exit made - emptied
 * of what it held - or one made now, sized to what it holds and laid out as
 * a run lays its results; more than are laid out on the page, held in the
 * set itself. With how many did not read from a file (`unread`), where any.
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
  const was = resultOf(doc, step.id, exit);
  if (was) doc = removeMolecules3d(doc, setMembers(doc, was).molecules);
  const madeBy = { step: step.id, exit, holds };
  // (an exit that gave nothing keeps its frame as it stands, saying so)
  if (!made.length) {
    const where = setForExit(doc, step, exit);
    return holdMembers(markMade(where.doc, where.id, madeBy), where.id, [], unread);
  }
  // (more than are laid out on the page: held in the set, its frame summing them up - docs/WORKFLOWS-FOUNDATION.md, *What a set shows*)
  if (made.reduce((n, m) => n + entriesIn(m), 0) > LARGE_SET) {
    const frame = was ? frameAt(was.x0, was.y1, SUMMARY_W, SUMMARY_H) : placeFor(doc, step, SUMMARY_W, SUMMARY_H);
    if (was) return holdCollection(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, [...made], unread);
    const id = doc.nextWorkflowId ?? 1;
    return holdCollection(markMade(addSet(doc, frame, madeBy), id, madeBy), id, [...made], unread);
  }
  const lay = laidOut(made.map((m, i) => roomOf(m, w.extentOf({ ...m, at: { x: 0, y: 0 } }, turns?.[i]))));
  const frame = was ? frameAt(was.x0, was.y1, lay.width, lay.height) : placeFor(doc, step, lay.width, lay.height);
  // (all put on the page at once: one at a time copied the page's molecules again for each)
  const there = new Set((doc.molecules3d ?? []).map((m) => m.id));
  doc = addMolecules3d(doc, made.map((m, i) => ({ ...m, at: { x: frame.x0 + lay.at[i].x, y: frame.y1 + lay.at[i].y } })));
  // (the set holds what the step made, in the step's order)
  const members = (doc.molecules3d ?? []).filter((m) => !there.has(m.id)).map((m) => ({ molecule: m.id }));
  if (was) return holdMembers(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, members, unread);
  const id = doc.nextWorkflowId ?? 1;
  return holdMembers(markMade(addSet(doc, frame, madeBy), id, madeBy), id, members, unread);
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
function roomOf(m: Pick<Molecule3D, "frames" | "calc" | "energies" | "shares" | "numbers" | "conformerSet"> & Partial<Pick<Molecule3D, "title" | "stack">>, e: Frame): Frame & { chip: number } {
  const least = NOMINAL_BOND_LENGTH / 4;
  const half = chipWide(m) / 2;
  return { x0: Math.min(e.x0, -least, -half), x1: Math.max(e.x1, least, half), y0: Math.min(e.y0, -least), y1: Math.max(e.y1, least), chip: hasChip(m) ? CHIP : 0 };
}

/**
 * About how wide a molecule's frames chip is, shut, on the page - as
 * Frames3D writes it: "#3 · 4 / 12 · 0.00 kcal/mol · 62%", its widest
 * numbers - where it shows always, a molecule of several frames. A single
 * geometry's shows only while it is pointed at, over what is beside it:
 * none.
 */
export function chipWide(m: Pick<Molecule3D, "frames" | "energies" | "shares" | "numbers" | "conformerSet"> & Partial<Pick<Molecule3D, "title" | "stack">>): number {
  const n = framesOf(m);
  // (a single geometry called by its name: its name, and its energy where it has one)
  if (n < 2) return named3d(m) ? `${m.title}${m.energies?.length === 1 ? " · -1234.567890" : ""}`.length * CHIP_CHAR + CHIP_SIDES : 0;
  const numbered = m.numbers?.length === n && m.numbers.some((k, i) => k !== i + 1) ? `#${Math.max(...m.numbers)} · ` : "";
  const energies = m.energies?.length === n ? " · 10.0 kcal/mol" : "";
  const shares = m.shares?.length === n || (m.conformerSet && m.energies?.length === n) ? " · 100%" : "";
  return `${numbered}${n} / ${n}${energies}${shares}`.length * CHIP_CHAR + CHIP_SIDES;
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
    let lay = laidOut(rooms, least);
    if (!clearOf(doc, frameOf(lay), { set: set.id, molecules: member })) lay = laidOut(rooms, least, Math.max(least, ...rooms.map((r) => r.x1 - r.x0)));
    doc = moveMolecules3d(doc, ms.map((m, i) => ({ id: m.id, at: { x: set.x0 + lay.at[i].x, y: set.y1 + lay.at[i].y } })));
    doc = resizeSet(doc, set.id, frameOf(lay));
  }
  return doc;
}

/**
 * Where a step's new result set goes: to the right of the step, level with
 * it - or, where something is there already, lower, as far as it must to
 * keep clear of the page's sets, steps, structures and molecules.
 */
export function placeFor(doc: WorkspaceDocument, step: WorkflowStep, width: number, height: number): Frame {
  const x = step.x + CARD_W + GAP;
  for (let k = 0; k < 40; k++) {
    const f = frameAt(x, step.y - k * (CARD_H / 2), width, height);
    if (clearOf(doc, f)) return f;
  }
  return frameAt(x, step.y, width, height);
}

/**
 * Whether a frame keeps `BETWEEN` clear of what is on the page - its sets,
 * its steps' cards, its structures and its molecules in 3D - but for the
 * set `self` and the molecules it holds.
 */
function clearOf(doc: WorkspaceDocument, f: Frame, self?: { set: number; molecules: ReadonlySet<number> }): boolean {
  const taken: Frame[] = [
    ...(doc.sets ?? []).filter((b) => b.id !== self?.set),
    ...(doc.steps ?? []).map((s) => frameAt(s.x, s.y, CARD_W, CARD_H)),
  ];
  const points = [...doc.model.atoms.map((a) => ({ x: a.x, y: a.y })), ...(doc.molecules3d ?? []).filter((m) => !self?.molecules.has(m.id)).map((m) => m.at)];
  return (
    !taken.some((t) => t.x0 < f.x1 + BETWEEN && t.x1 > f.x0 - BETWEEN && t.y0 < f.y1 + BETWEEN && t.y1 > f.y0 - BETWEEN) &&
    !points.some((p) => inside({ x0: f.x0 - BETWEEN, x1: f.x1 + BETWEEN, y0: f.y0 - BETWEEN, y1: f.y1 + BETWEEN }, p))
  );
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

function moleculesOf(outcome: Extract<Outcome, { ok: true }>): Omit<Molecule3D, "id" | "at">[] {
  const atomsAt = (e: SetEntry, xyz: readonly number[] = e.xyz) => e.atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
  // (the shares a step worked out - Meno's Populations - else those the program that found them gave)
  const share = new Map(outcome.kept.map((e, i) => [e, outcome.shares?.[i] ?? (e as Worked).share]));
  if (outcome.holds !== "conformers") {
    return (outcome.kept as Worked[]).map((e) => {
      const path = e.path?.length ? e.path : undefined;
      const energies = path ? (e.pathEnergies?.length === path.length && e.energy != null ? [...e.pathEnergies, e.energy] : undefined) : e.energy != null ? [e.energy] : undefined;
      return {
        atoms: atomsAt(e, path ? path[0] : e.xyz),
        bonds: e.bonds.map((b) => ({ ...b })),
        ...(path ? { frames: [...path.slice(1).map((f) => [...f]), [...e.xyz]], path: true as const } : {}),
        ...(energies ? { energies } : {}),
        ...(e.calc ? { calc: e.calc } : speciesKept(e)),
        ...(e.name ? { name: e.name } : {}),
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
      ...(calc ? { calc: { ...calc, results: undefined, source: undefined } } : speciesKept(first)),
      conformerSet: true,
      ...(first.name ? { name: first.name } : {}),
      ...(alike ? keptAlike(g) : {}),
    };
  });
}
