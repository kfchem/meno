/**
 * How a workflow's parts are joined (docs/WORKFLOWS.md, *Wires*): what
 * each port gives, what may be wired to what, what comes into a step, and
 * what state a step is in.
 */
import type { WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord, Molecule3D, Wire, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import { drawnKey, hash, holdsOf, plainAmong, recordKey, setMembers, setMolecules } from "./entries";
import { exitOf, inputsOf, ONE_INPUT, optionsOf, portOf, takenBy, takesNothing, type SetHolds, type SetKind, type ValueKind, isSetKind } from "./kinds";
import { byOf, doerStamp, optionsFor, takesBy } from "./doers";

type Flow = Pick<WorkspaceDocument, "model" | "molecules3d" | "sets" | "steps" | "wires" | "pictures">;

export const stepOf = (doc: Flow, id: number): WorkflowStep | undefined => doc.steps?.find((s) => s.id === id);
export const findSet = (doc: Flow, id: number): WorkflowSet | undefined => doc.sets?.find((b) => b.id === id);

/** The wire into a step's input, where it has one; its first input where none is named. */
export const wireInto = (doc: Flow, step: number, port?: string): Wire | undefined =>
  doc.wires?.find((w) => w.to.step === step && (port == null || w.to.port === port));

/** The wires into a step, one for each of its inputs that has one. */
export const wiresInto = (doc: Flow, step: number): Wire[] => (doc.wires ?? []).filter((w) => w.to.step === step);

/** The set a step's exit made - its first exit where none is named - which stands whether or not it has run. */
export const resultOf = (doc: Flow, step: number, exit?: string): WorkflowSet | undefined =>
  doc.sets?.find((b) => b.made?.step === step && (exit == null ? b.made.exit === exitOf(stepOf(doc, step)?.kind ?? "optimise", "").id : b.made.exit === exit));

/** The sets a step's exits made, in the kind's order. */
export const resultsOf = (doc: Flow, step: number): WorkflowSet[] => (doc.sets ?? []).filter((b) => b.made?.step === step);

/** What a port gives: a set, the kind of set it holds; a step, what it made - or, not run, what it will make of what comes into it. Null where that is not known yet. */
export function givesOf(doc: Flow, end: WireEnd, seen: ReadonlySet<number> = new Set()): SetHolds | null {
  const given = findSet(doc, end.set);
  if (!given) return null;
  // (a chemist's set: what lies in it; a step's exit, run: what it made)
  if (!given.made) return holdsOf(doc, given);
  if (given.made.holds) return given.made.holds;
  // (not run yet: what that exit will give of what comes into its step)
  const step = stepOf(doc, given.made.step);
  if (!step || seen.has(step.id)) return null;
  const g = exitOf(step.kind, given.made.exit).gives;
  if (g !== "same") return g;
  const into = wireInto(doc, step.id);
  return into ? givesOf(doc, into.from, new Set([...seen, step.id])) : null;
}


/** The steps before a step, nearest first, as its wires lead back. */
export function stepsBefore(doc: Flow, step: number): number[] {
  const out: number[] = [];
  const todo = wiresInto(doc, step).map((w) => w.from);
  for (let guard = 0; todo.length && guard < 1000; guard++) {
    const at = todo.shift()!;
    const made = findSet(doc, at.set)?.made?.step;
    if (made == null || out.includes(made) || made === step) continue;
    out.push(made);
    todo.push(...wiresInto(doc, made).map((w) => w.from));
  }
  return out;
}

/** Whether a wire may go from `from` into the step `to` (`wireRefusal`: none). */
export function canWire(doc: Flow, from: WireEnd, to: number, port: string = ONE_INPUT): boolean {
  return wireRefusal(doc, from, to, port) == null;
}

/** A kind of set, as a step's card says what it takes and what came. */
const SET_WORDS: Record<ValueKind, string> = { structures: "structures drawn", molecules: "molecules in 3D", conformers: "a conformer set", table: "a table", number: "a number" };

/**
 * Why a wire may not go from `from` into the step `to`, in plain words;
 * none where it may: the step - done by whom it is - takes what it gives,
 * or what that is is not known yet; and no loop is made.
 */
export function wireRefusal(doc: Flow, from: WireEnd, to: number, port: string = ONE_INPUT): string | null {
  const step = stepOf(doc, to);
  const set = findSet(doc, from.set);
  if (!step || !set) return "It is not there";
  // (a step that takes nothing in has nothing to wire to)
  if (takesNothing(step.kind)) return "It takes nothing in";
  if (set.made?.step === to) return "It is what this step gives";
  // (nothing it gives may come back round to it)
  const madeBy = set.made?.step;
  if (madeBy != null && [madeBy, ...stepsBefore(doc, madeBy)].includes(to)) return "It comes from this step: a wire back would make a loop";
  const holds = givesOf(doc, from);
  // (pictures - a Render step's - and charts no step takes)
  if (holds === "pictures" || holds === "chart") return holds === "chart" ? "A chart goes into no step" : "Pictures go into no step";
  if (holds == null) return null;
  // (a set mixing conformer sets with other molecules, which no step takes: which are the others)
  const mixed = holds === "molecules" && !set.made ? plainAmong(setMolecules(doc, set)) : null;
  if (mixed) return mixed;
  // (the input it goes to takes what it gives; a kind that takes one holds to what the doer takes of it)
  const several = inputsOf(step.kind).length > 1;
  const takes = portOf(step.kind, port).takes.filter((k) => several || takesBy(step.kind, byOf(step), k));
  // (molecules or conformer sets into a port that takes a table, seen as one: kinds `takenBy`)
  if (takenBy(takes, holds)) return null;
  const wants = takes.length ? takes.map((k) => SET_WORDS[k]).join(" or ") : "nothing that is given";
  return `It takes ${wants}, not ${SET_WORDS[holds]}`;
}

/**
 * What comes into a step: the kind of set, and its molecules in 3D and
 * structures drawn - each with its record, where it has one - in order:
 * those on the page by their atoms' ids, or, from a large result set, as
 * it holds them off the page (`held`). Null where nothing does - or what
 * would has not been made yet, or is pictures, which no step takes.
 */
export function inputOf(
  doc: Flow,
  step: number,
  port?: string,
): { holds: SetKind; molecules: Molecule3D[]; structures: number[][]; records: (DrawnRecord | undefined)[]; held?: readonly DrawnModel[] } | null {
  const from = wireInto(doc, step, port)?.from;
  if (!from) return null;
  const set = findSet(doc, from.set);
  if (!set) return null;
  const holds = holdsOf(doc, set);
  // (a table, a number, a chart - no entries to give a step that works on them)
  if (!isSetKind(holds)) return null;
  if (set.drawnCollection) return { holds, molecules: [], structures: [], records: [], held: set.drawnCollection };
  const { structures, records } = setMembers(doc, set);
  return { holds, molecules: setMolecules(doc, set), structures, records };
}

/**
 * What a molecule in 3D adds to a step's key, as text: worked out once for
 * each molecule - a molecule changed is a new one - since every step's key
 * is asked on every edit, and a trajectory's frames are many.
 */
const keyed = new WeakMap<Molecule3D, readonly string[]>();
function keyTexts(m: Molecule3D): readonly string[] {
  let texts = keyed.get(m);
  if (!texts) {
    texts = [
      // (an atom's charge, radical and isotope too: a step run on the neutral molecule has not run on its anion)
      m.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""}${a.radical ? `[${a.radical}]` : ""}${a.isotope ? `{${a.isotope}}` : ""}${a.x.toFixed(5)},${a.y.toFixed(5)},${a.z.toFixed(5)}`).join(";"),
      `${m.bonds.map((b) => `${b.a1}-${b.a2}:${b.order}`).join(";")}|${(m.frames ?? []).map((f) => f.map((v) => v.toFixed(5)).join(",")).join(";")}`,
      `${(m.energies ?? []).join(",")}|${(m.numbers ?? []).join(",")}|${(m.shares ?? []).join(",")}|${(m.degeneracies ?? []).join(",")}${m.partOf ? "|part" : ""}`,
      JSON.stringify(m.properties ?? null),
    ];
    keyed.set(m, texts);
  }
  return texts;
}

/** A key for what a step would run on: what comes into it, its options, and who does it - so that its card can say it has changed since its run. */
export function inputKey(doc: Flow, step: WorkflowStep, by: string): string {
  // (a step that takes nothing in runs on its options alone, and who does it)
  // (and what of its plugin the results hang on: its version, the files it was set up with - another prior is another run)
  if (takesNothing(step.kind)) return hash(`${step.kind}|${by}|${doerStamp(by)}|${JSON.stringify(optionsOf(optionsFor(step.kind, by), step.options))}`).toString(36);
  const input = inputOf(doc, step.id);
  if (!input) return "";
  let h = hash(`${input.holds}|${step.kind}|${by}|${JSON.stringify(optionsOf(optionsFor(step.kind, by), step.options))}`);
  for (const m of input.molecules) for (const text of keyTexts(m)) h = hash(text, h);
  input.structures.forEach((s, i) => {
    h = hash(drawnKey(doc.model, s), h);
    // (and its record: the same structure with another value from the step before has not been run on)
    const record = input.records[i];
    if (record) h = hash(recordKey(record), h);
  });
  // (and each a large result set holds, with its record)
  for (const m of input.held ?? []) {
    h = hash(drawnKey(m, m.atoms.map((a) => a.id)), h);
    if (m.record) h = hash(recordKey(m.record), h);
  }
  return h.toString(36);
}

/** The jobs a page's steps have waiting or running, by id (docs/WORKFLOWS.md, *When Meno closes*). */
export const jobsUnderWay = (doc: Pick<Flow, "steps">): string[] => (doc.steps ?? []).flatMap((s) => s.running?.jobs.map((j) => j.id) ?? []);

/**
 * What a step's card says it is: nothing coming in; ready to run; its jobs
 * waiting or running; done, failed or stopped - or changed since, in what
 * comes in, its options or who does it.
 */
export type StepState = "no-input" | "ready" | "waiting" | "running" | "done" | "failed" | "stopped" | "changed";

export function stateOf(doc: Flow, step: WorkflowStep, by: string): StepState {
  // (its jobs under way: the card says which, as they were last looked at)
  if (step.running) return "running";
  // (a step that takes nothing in is ready as it is)
  const into = takesNothing(step.kind) || !!wireInto(doc, step.id);
  if (!step.ran) return into ? "ready" : "no-input";
  // (what comes from a step not run yet, or run since, has changed)
  if (!into) return "changed";
  const key = inputKey(doc, step, by);
  if (key !== step.ran.input) return "changed";
  return step.ran.ok ? "done" : step.ran.stopped ? "stopped" : "failed";
}

/**
 * The steps to run to run `id`, in order: the furthest back before it
 * that has not run, has changed, failed, stopped or is running - however many done
 * lie between - and every step from it to `id`, which take anew what it
 * gives.
 */
export function chainTo(doc: Flow, id: number): number[] {
  const back = stepsBefore(doc, id).slice(0, 200);
  let far = -1;
  back.forEach((sid, k) => {
    const s = stepOf(doc, sid);
    if (s && (s.running || stateOf(doc, s, byOf(s)) !== "done")) far = k;
  });
  return [...back.slice(0, far + 1).reverse(), id];
}

/** The steps after a step: those that take what it gives, and those after them. */
export function stepsAfter(doc: Flow, id: number): number[] {
  const out: number[] = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const at = queue.shift()!;
    // (every exit's set: what any of them gives comes down to the steps wired from it)
    const made = new Set((doc.sets ?? []).filter((b) => b.made?.step === at).map((b) => b.id));
    for (const wire of doc.wires ?? []) {
      if (made.has(wire.from.set) && !seen.has(wire.to.step)) {
        seen.add(wire.to.step);
        out.push(wire.to.step);
        queue.push(wire.to.step);
      }
    }
  }
  return out;
}

/** The steps a run of `targets` runs (store `runSteps`): each, and those before it it runs first (`chainTo`). */
export const stepsRun = (doc: Flow, targets: readonly number[]): number[] => [...new Set(targets.flatMap((t) => chainTo(doc, t)))];

/** What *Run all* runs: every step that is not done - not run, changed, failed or stopped - or is running, one with nothing coming in left as it is; and every step after one, which takes anew what it gives. */
export function allToRun(doc: Flow): number[] {
  const stale = (doc.steps ?? []).filter((s) => s.running || !["done", "no-input"].includes(stateOf(doc, s, byOf(s)))).map((s) => s.id);
  return [...new Set(stale.flatMap((id) => [id, ...stepsAfter(doc, id)]))];
}
