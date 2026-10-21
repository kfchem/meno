/**
 * How a workflow's parts are joined (docs/WORKFLOWS.md, *Wires*): what
 * each port gives, what may be wired to what, what comes into a step, and
 * what state a step is in.
 */
import type { WorkspaceDocument } from "../document";
import type { Model, Molecule3D, Wire, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import { signatureOf } from "../utils/drawnLink";
import { holdsOf, setMembers } from "./entries";
import { exitOf, inputsOf, ONE_INPUT, optionsOf, portOf, type SetHolds, type SetKind } from "./kinds";
import { byOf, optionsFor, takesBy } from "./doers";

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

/** Whether a wire may go from `from` into the step `to`: the step - done by whom it is - takes what it gives, or what that is is not known yet; and no loop is made. */
export function canWire(doc: Flow, from: WireEnd, to: number, port: string = ONE_INPUT): boolean {
  const step = stepOf(doc, to);
  if (!step) return false;
  const set = findSet(doc, from.set);
  if (!set || set.made?.step === to) return false;
  // (nothing it gives may come back round to it)
  const madeBy = set.made?.step;
  if (madeBy != null && [madeBy, ...stepsBefore(doc, madeBy)].includes(to)) return false;
  const holds = givesOf(doc, from);
  // (pictures - a Render step's - no step takes)
  if (holds === "pictures") return false;
  // (the input it goes to takes what it gives; a kind that takes one holds to what the doer takes of it)
  const takes = portOf(step.kind, port).takes;
  if (holds == null) return true;
  return inputsOf(step.kind).length > 1 ? takes.includes(holds) : takesBy(step.kind, byOf(step), holds);
}

/** What comes into a step: the kind of set, and its molecules in 3D and structures drawn, in order. Null where nothing does - or what would has not been made yet, or is pictures, which no step takes. */
export function inputOf(doc: Flow, step: number, port?: string): { holds: SetKind; molecules: Molecule3D[]; structures: number[][] } | null {
  const from = wireInto(doc, step, port)?.from;
  if (!from) return null;
  const set = findSet(doc, from.set);
  if (!set) return null;
  const holds = holdsOf(doc, set);
  if (holds === "pictures") return null;
  const { structures, molecules } = setMembers(doc, set);
  const byId = new Map((doc.molecules3d ?? []).map((m) => [m.id, m]));
  return { holds, molecules: molecules.map((id) => byId.get(id)!), structures };
}

/** FNV-1a over a string: a short key for what came into a step. */
function hash(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
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
      `${(m.energies ?? []).join(",")}|${(m.numbers ?? []).join(",")}|${(m.shares ?? []).join(",")}|${(m.degeneracies ?? []).join(",")}`,
    ];
    keyed.set(m, texts);
  }
  return texts;
}

/**
 * What a drawn structure adds to a step's key, as text: what it is - its
 * atoms' elements, charges, masses and radicals, its bonds' orders, wedges
 * and dative bonds (`signatureOf`) - and what its drawing says by where
 * things lie: on which side of each double bond each neighbour is, the
 * other end's taken together (cis or trans), and the order the neighbours
 * go round each atom a wedge starts from. Not where it is drawn: moved
 * whole, turned, or an atom nudged without crossing a line that matters, it
 * is the same; mirrored, its wedged centres are not.
 */
const drawnKeyed = new WeakMap<Model, Map<string, string>>();
function drawnKey(model: Model, ids: readonly number[]): string {
  const known = drawnKeyed.get(model) ?? new Map<string, string>();
  drawnKeyed.set(model, known);
  const name = ids.join(",");
  const had = known.get(name);
  if (had != null) return had;
  const of = new Set(ids);
  const at = new Map(model.atoms.filter((a) => of.has(a.id)).map((a) => [a.id, a]));
  const near = new Map<number, number[]>();
  const bonds = model.bonds.filter((b) => at.has(b.a) && at.has(b.b));
  for (const b of bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const said: string[] = [];
  for (const a of at.values()) if (a.radical) said.push(`r${a.id}:${a.radical}`);
  for (const b of bonds) {
    if (b.dative) said.push(`d${b.a}-${b.b}`);
    if (b.order === 2) {
      // (each neighbour's side of the line through the bond, measured the same way at both ends)
      const p = at.get(b.a)!;
      const q = at.get(b.b)!;
      const side = (id: number) => {
        const n = at.get(id)!;
        return Math.sign((q.x - p.x) * (n.y - p.y) - (q.y - p.y) * (n.x - p.x));
      };
      for (const n of near.get(b.a) ?? []) if (n !== b.b) for (const m of near.get(b.b) ?? []) if (m !== b.a) said.push(`${n}~${m}:${side(n) * side(m)}`);
    }
    if (b.stereo && b.stereo !== "none") {
      // (round the atom it starts from, anticlockwise, from its lowest-numbered neighbour)
      const c = at.get(b.a)!;
      const round = (near.get(b.a) ?? [])
        .map((id) => ({ id, angle: Math.atan2(at.get(id)!.y - c.y, at.get(id)!.x - c.x) }))
        .sort((u, v) => u.angle - v.angle)
        .map((u) => u.id);
      const first = round.indexOf(Math.min(...round));
      said.push(`w${b.a}:${[...round.slice(first), ...round.slice(0, first)].join(">")}`);
    }
  }
  const key = `${signatureOf(model, ids)}|${said.sort().join(",")}`;
  known.set(name, key);
  return key;
}

/** A key for what a step would run on: what comes into it, its options, and who does it - so that its card can say it has changed since its run. */
export function inputKey(doc: Flow, step: WorkflowStep, by: string): string {
  const input = inputOf(doc, step.id);
  if (!input) return "";
  let h = hash(`${input.holds}|${step.kind}|${by}|${JSON.stringify(optionsOf(optionsFor(step.kind, by), step.options))}`);
  for (const m of input.molecules) for (const text of keyTexts(m)) h = hash(text, h);
  for (const s of input.structures) h = hash(drawnKey(doc.model, s), h);
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
  const into = wireInto(doc, step.id);
  if (!step.ran) return into ? "ready" : "no-input";
  // (what comes from a step not run yet, or run since, has changed)
  if (!into) return "changed";
  const key = inputKey(doc, step, by);
  if (key !== step.ran.input) return "changed";
  return step.ran.ok ? "done" : step.ran.stopped ? "stopped" : "failed";
}
