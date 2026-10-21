/**
 * How a workflow's parts are joined (docs/WORKFLOWS.md, *Wires*): what
 * each port gives, what may be wired to what, what comes into a step, and
 * what state a step is in.
 */
import type { WorkspaceDocument } from "../document";
import type { Model, Molecule3D, Wire, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import { signatureOf } from "../utils/drawnLink";
import { holdsOf, setMembers, setMolecules } from "./entries";
import { kindInfo, optionsOf, type SetHolds, type SetKind } from "./kinds";
import { byOf, optionsFor, takesBy } from "./doers";

type Flow = Pick<WorkspaceDocument, "model" | "molecules3d" | "sets" | "steps" | "wires" | "pictures">;

export const stepOf = (doc: Flow, id: number): WorkflowStep | undefined => doc.steps?.find((s) => s.id === id);
export const findSet = (doc: Flow, id: number): WorkflowSet | undefined => doc.sets?.find((b) => b.id === id);

/** The wire into a step, where it has one. */
export const wireInto = (doc: Flow, step: number): Wire | undefined => doc.wires?.find((w) => w.to === step);

/** The set a step made, where it has run. */
export const resultOf = (doc: Flow, step: number): WorkflowSet | undefined => doc.sets?.find((b) => b.made?.step === step);

/** What a port gives: a set, the kind of set it holds; a step, what it made - or, not run, what it will make of what comes into it. Null where that is not known yet. */
export function givesOf(doc: Flow, end: WireEnd, seen: ReadonlySet<number> = new Set()): SetHolds | null {
  if ("set" in end) {
    const set = findSet(doc, end.set);
    return set ? holdsOf(doc, set) : null;
  }
  const step = stepOf(doc, end.step);
  if (!step || seen.has(step.id)) return null;
  const made = resultOf(doc, step.id);
  if (made?.made) return made.made.holds;
  const g = kindInfo(step.kind).gives;
  if (g !== "same") return g;
  const into = wireInto(doc, step.id);
  return into ? givesOf(doc, into.from, new Set([...seen, step.id])) : null;
}

/** The steps before a step, nearest first, as its wires lead back. */
export function stepsBefore(doc: Flow, step: number): number[] {
  const out: number[] = [];
  let at = wireInto(doc, step)?.from;
  for (let guard = 0; at && guard < 1000; guard++) {
    if ("set" in at) {
      const made = findSet(doc, at.set)?.made?.step;
      if (made == null || out.includes(made) || made === step) break;
      out.push(made);
      at = wireInto(doc, made)?.from;
    } else {
      if (out.includes(at.step) || at.step === step) break;
      out.push(at.step);
      at = wireInto(doc, at.step)?.from;
    }
  }
  return out;
}

/** Whether a wire may go from `from` into the step `to`: the step - done by whom it is - takes what it gives, or what that is is not known yet; and no loop is made. */
export function canWire(doc: Flow, from: WireEnd, to: number): boolean {
  const step = stepOf(doc, to);
  if (!step) return false;
  if ("step" in from && (from.step === to || !stepOf(doc, from.step))) return false;
  if ("set" in from) {
    const set = findSet(doc, from.set);
    if (!set || set.made?.step === to) return false;
  }
  // (nothing it gives may come back round to it)
  const madeBy = "step" in from ? from.step : findSet(doc, from.set)?.made?.step;
  if (madeBy != null && [madeBy, ...stepsBefore(doc, madeBy)].includes(to)) return false;
  const holds = givesOf(doc, from);
  // (pictures - a Render step's - no step takes)
  return holds == null || (holds !== "pictures" && takesBy(step.kind, byOf(step), holds));
}

/** What comes into a step: the kind of set, and its molecules in 3D and structures drawn, in order. Null where nothing does - or what would has not been made yet, or is pictures, which no step takes. */
export function inputOf(doc: Flow, step: number): { holds: SetKind; molecules: Molecule3D[]; structures: number[][] } | null {
  const from = wireInto(doc, step)?.from;
  if (!from) return null;
  const set = "set" in from ? findSet(doc, from.set) : resultOf(doc, from.step);
  if (!set) return null;
  const holds = holdsOf(doc, set);
  if (holds === "pictures") return null;
  const { structures } = setMembers(doc, set);
  return { holds, molecules: setMolecules(doc, set), structures };
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
