/**
 * Clean-up: a structure laid out afresh by Meno's own engine - the drawing a
 * chemist would make of it (docs/LAYOUT-2D.md) - where it was drawn, with
 * the groups a chemist would write by name written so (lib/chem/contract),
 * as one undo step.
 */
import { contractGraph, contractionTrials, hiddenIn } from "../../../../lib/chem/contract";
import { chemistry, implicitHydrogens } from "../../../../lib/chem/molecule";
import { styleOf, type DrawingStyle } from "../../../../lib/chem/style";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, endpointsHeld, relayout, writtenAsLabels, type WrittenAsLabel } from "../document";
import type { EditorStore } from "../store";
import type { Model } from "../store/types";
import { drawingOf } from "./drawing";
import { layoutJob, nextFree, relayoutFrom, type LayoutJob } from "./engineLayout";
import { layOut } from "./layOut";
import type { Axial, Cumulated } from "../../../../lib/layout/stereo";
import { atTrueSize } from "../../../../lib/chem/magnified2d";
import { formulaOf } from "../../../../lib/io/coordinates";

/**
 * An atom and every atom bonded to it, however far along - a haptic bond
 * joining a metal to every atom of its pi system (a Cp ring is one
 * structure with its metal) - and every atom of a structure of several parts
 * it is in (`Atom.joined`).
 */
export function fragmentOf(model: Model, atomId: number): Set<number> {
  return reached(neighboursIn(model), atomId);
}

/**
 * The atoms each atom is bonded to: through a haptic bond, every atom of the
 * pi system and its metal - and, `joined`, every atom that shares its
 * structure of several parts, bonded or not (docs/EDITOR-2D.md, *One
 * structure of several parts*). Clean-up asks without: it lays out each
 * piece as it is, and the parts keep where they stand.
 */
function neighboursIn(model: Model, joined = true): Map<number, number[]> {
  const next = new Map<number, number[]>();
  const join = (u: number, v: number) => {
    for (const [from, to] of [[u, v], [v, u]]) {
      const here = next.get(from);
      if (here) here.push(to);
      else next.set(from, [to]);
    }
  };
  for (const b of model.bonds) {
    join(b.a, b.b);
    for (const e of b.endpoints ?? []) join(b.a, e);
  }
  if (joined) {
    // (each of a number's atoms to the first of it: enough for them to be reached from one another)
    const first = new Map<number, number>();
    for (const a of model.atoms) {
      if (a.joined == null) continue;
      const f = first.get(a.joined);
      if (f == null) first.set(a.joined, a.id);
      else join(f, a.id);
    }
  }
  return next;
}

/** An atom and every atom `next` leads to from it, however far along. */
function reached(next: Map<number, number[]>, atomId: number): Set<number> {
  const seen = new Set([atomId]);
  const todo = [atomId];
  while (todo.length) {
    for (const n of next.get(todo.pop()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen;
}

/** Some of a structure: these atoms, and the bonds between them. */
export function partOf(model: Model, ids: Set<number>): Model {
  // (a haptic bond whose ring is not all in the part binds none in it)
  return endpointsHeld({
    atoms: model.atoms.filter((a) => ids.has(a.id)),
    bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)),
  });
}

/**
 * The structures on the canvas, each the atoms bonded together, a lone atom
 * not among them - or, `joined`, each structure of several parts as one, a
 * lone ion in one with the rest (Clean-up asks for the pieces).
 */
export function fragmentsOf(model: Model, joined = true): Set<number>[] {
  const seen = new Set<number>();
  const out: Set<number>[] = [];
  const bonded = new Set(model.bonds.flatMap((b) => [b.a, b.b]));
  if (joined) for (const a of model.atoms) if (a.joined != null) bonded.add(a.id);
  // (the bonds gone over once for them all, not again for each: a thousand
  // structures took 17 s)
  const next = neighboursIn(model, joined);
  for (const a of model.atoms) {
    if (seen.has(a.id) || !bonded.has(a.id)) continue;
    const f = reached(next, a.id);
    f.forEach((id) => seen.add(id));
    out.push(f);
  }
  return out;
}

/** The fragments that hold any of `atoms`, each once - a structure of several parts as one, unless not `joined` (Clean-up's pieces). */
export function fragmentsHolding(model: Model, atoms: Iterable<number>, joined = true): Set<number>[] {
  const out: Set<number>[] = [];
  const next = neighboursIn(model, joined);
  const there = new Set(model.atoms.map((a) => a.id));
  const taken = new Set<number>();
  for (const id of atoms) {
    if (taken.has(id) || !there.has(id)) continue;
    const f = reached(next, id);
    f.forEach((x) => taken.add(x));
    out.push(f);
  }
  return out;
}

/**
 * The atoms of `part` Clean-up leaves drawn out, whatever groups they are
 * in: those `expanded` holds - just drawn out of their label - a
 * stereocentre's, wedged, and any atom with more to it than its element and
 * charge (an isotope, a radical, an atom map...), which a label would not
 * say.
 */
function keptDrawn(part: Model, expanded: ReadonlySet<number>): Set<number> {
  const keep = new Set([...expanded].filter((id) => part.atoms.some((a) => a.id === id)));
  for (const a of part.atoms) {
    if (a.stereoCentre || Object.keys(chemistry(a)).some((k) => k !== "charge")) keep.add(a.id);
  }
  const drawing = drawingOf(part);
  for (const b of drawing.bonds) if (b.wedge) keep.add(part.atoms[b.wedge.narrow].id);
  return keep;
}

type Cleaned = { labels: WrittenAsLabel[]; part: Model; job: LayoutJob; laid: Layout2D };

/**
 * `part` laid out by the engine with the groups a chemist would write by
 * name written so: those the rules choose, and more, where the drawing
 * would hide something, as long as each more hides less (contractionTrials).
 */
async function laidOutWithLabels(part: Model, expanded: ReadonlySet<number>): Promise<Cleaned> {
  const index = new Map(part.atoms.map((a, i) => [a.id, i]));
  const graph = contractGraph(
    part.atoms,
    part.bonds.map((b) => ({
      a1: index.get(b.a)!,
      a2: index.get(b.b)!,
      order: b.order,
      ...(b.endpoints ? { endpoints: b.endpoints.flatMap((e) => (index.has(e) ? [index.get(e)!] : [])) } : {}),
    })),
  );
  const keep = new Set([...keptDrawn(part, expanded)].map((id) => index.get(id)!));
  const trials = contractionTrials(graph, keep);
  let best: (Cleaned & { hidden: number }) | null = null;
  for (let trial = trials.next(); !trial.done; ) {
    const labels = trial.value.map((c) => ({
      atoms: c.atoms.map((i) => part.atoms[i].id),
      at: part.atoms[c.at].id,
      label: c.label,
    }));
    const written = labels.length ? writtenAsLabels({ ...emptyWorkspaceDocument(), model: part }, labels).model : part;
    const job = layoutJob(written);
    const laid = await layOut(job.input);
    const hidden = hiddenIn(job.input, laid);
    if (!best || hidden < best.hidden) best = { labels, part: written, job, laid, hidden };
    trial = trials.next(hidden);
  }
  return best!;
}

/**
 * Cleans up the fragment an atom is in - or the fragments a selection's
 * atoms are in, or every structure on the canvas -
 * each where it was: laid out afresh by Meno's own engine (engineLayout),
 * off the drawing's thread, the groups a chemist would write by name
 * written so, and applied as one undo step. What *Expand abbreviation* has
 * just drawn out is left drawn out. Refuses, rather than changing anything,
 * if the structure changed meanwhile, or if the new layout would not say
 * the stereochemistry the old one said.
 */
export async function cleanUp(
  store: EditorStore,
  around: number | Iterable<number> | null = null,
): Promise<void> {
  // (each structure shown magnified laid out at its true size, and shown as large again: store relayout, utils/trueSize)
  const held = store.getState().model;
  const model = atTrueSize(held);
  const expanded = store.getState().justExpanded();
  const parts = (
    // (each piece as it is: a structure of several parts is laid out piece by piece, its parts keeping where they stand)
    around == null
      ? fragmentsOf(model, false)
      : fragmentsHolding(model, typeof around === "number" ? [around] : around, false)
  )
    .map((ids) => partOf(model, ids))
    .filter((part) => part.bonds.length > 0);
  if (!parts.length) return; // nothing to lay out
  // (each on its own: one whose wedges cannot be kept, refused before it is laid out, named with the rest below)
  const settled = await Promise.allSettled(parts.map((part) => laidOutWithLabels(part, expanded)));
  const cleaned = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const unlaid = settled.flatMap((r, i) => (r.status === "rejected" ? [{ part: parts[i], why: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : []));
  if (store.getState().model !== held) {
    throw new Error(
      "The structure changed while it was being cleaned up, so nothing was moved.",
    );
  }
  const allLabels = cleaned.flatMap((c) => c.labels);
  const written = allLabels.length ? writtenAsLabels({ ...emptyWorkspaceDocument(), model }, allLabels).model : model;
  // (in the style it is drawn in: a bond to a terminal label drawn long enough for its labels)
  const style = styleOf(store.getState().docStyle);
  // each structure laid out on its own: one that cannot be - its stereochemistry not kept, an atom put on
  // another - left as it is drawn, named, and the rest laid out all the same, as one step
  const tried = cleaned.map((c) => {
    try {
      return { c, change: relayoutFrom(written, c.part, c.job, c.laid, style) };
    } catch (e) {
      return { c, why: e instanceof Error ? e.message : String(e) };
    }
  });
  const done = tried.flatMap((t) => (t.change ? [{ ...t, change: t.change }] : []));
  const refused = tried.filter((t) => !t.change);
  if (done.length) {
    const changes = done.map((t) => t.change);
    store.getState().relayout(
      {
        atoms: changes.flatMap((c) => c.atoms),
        bonds: changes.flatMap((c) => c.bonds),
        added: changes.flatMap((c) => c.added ?? []),
        removed: changes.flatMap((c) => c.removed ?? []),
        eta: changes.flatMap((c) => c.eta ?? []),
      },
      done.flatMap((t) => t.c.labels),
    );
  }
  const left = [...unlaid, ...refused.map((t) => ({ part: t.c.part, why: t.why! }))];
  if (left.length) throw new CleanUpRefused(left.map((l) => ({ formula: partFormula(l.part), why: l.why })), parts.length);
}

/**
 * What Clean-up left as drawn, each structure by its formula and why: the
 * rest of what it was asked about laid out all the same (`of`, how many in
 * all). Its message says so whole.
 */
export class CleanUpRefused extends Error {
  constructor(
    readonly refused: readonly { formula: string; why: string }[],
    readonly of: number,
  ) {
    // (of one among others laid out, not "nothing was moved": that one was left as it is)
    const each = refused.map((r) => `${r.formula}: ${r.why.replace(/, so nothing was moved\.?$/, ", so it was left as it is")}`).join("; ");
    super(of === 1 ? `Clean-up left ${refused[0].formula} as drawn: ${refused[0].why}.` : `Clean-up left ${refused.length} of ${of} structures as drawn - ${each}.`);
    this.name = "CleanUpRefused";
  }
}

/** A structure's formula as Hill writes one, its H carried counted (implicitHydrogens); a label not an element written as it is. */
export function partFormula(part: Model): string {
  const used = new Map<number, number>();
  for (const b of part.bonds) {
    used.set(b.a, (used.get(b.a) ?? 0) + b.order);
    used.set(b.b, (used.get(b.b) ?? 0) + b.order);
  }
  const atoms: { el: string }[] = [];
  for (const a of part.atoms) {
    if (a.el === "*") continue;
    atoms.push({ el: a.el });
    // (a label not an element - an abbreviation - carries none counted here)
    const h = implicitHydrogens(a.el, used.get(a.id) ?? 0, a.charge ?? 0, a.radical);
    for (let k = 0; k < h; k++) atoms.push({ el: "H" });
  }
  // (and its charge, as a formula writes one: NH4+, SO4 2-)
  const charge = part.atoms.reduce((t, a) => t + (a.charge ?? 0), 0);
  return formulaOf(atoms) + (charge ? `${Math.abs(charge) > 1 ? ` ${Math.abs(charge)}` : ""}${charge > 0 ? "+" : "-"}` : "");
}

/** An allene's axes and an odd cumulene's cis or trans, as a structure's own text gives them (lib/chem/smiles), by atom index. */
export type GivenRuns = { axes: readonly Axial[]; cumulated: readonly Cumulated[] };

/** Whether `given`'s atom indices are the job's: none of the drawing's atoms folded into another's. */
const givenFits = (job: LayoutJob, model: Model) => job.input.atoms.length === model.atoms.length;

/**
 * `model` laid out afresh by the engine as a whole - a salt's ions set out
 * together - for a structure that has only just arrived, before it is
 * added: a plugin's drawing of a SMILES. In `style` - the app's, unless
 * given - as Clean-up lays one out.
 */
export async function laidOut(model: Model, style: DrawingStyle = styleOf(useAppSettings.getState().drawingStyle), given?: GivenRuns, open?: OpenDoubles): Promise<Model> {
  if (!model.bonds.length) return model;
  // (a double bond the structure's own text leaves open, with an end of two groups: a wavy bond on a group - Brecher 2006, ST-4.4)
  const either = new Set(open?.either ?? []);
  // (one left open with one group at each end, its ends kept straight on below: the plugin's own mark of either configuration taken off it,
  //  so that the drawing says it once, by its straight ends, and Clean-up keeps them straight as it keeps any drawn so - layout/drawn
  //  `straightEnds` reads no end of a bond so marked)
  const straight = new Set((open?.straight ?? []).map((i) => model.atoms[i]?.id).filter((id): id is number => id != null));
  const straightOn = (b: Model["bonds"][number]) => b.order === 2 && straight.has(b.a) && straight.has(b.b);
  const m =
    either.size || straight.size
      ? {
          ...model,
          bonds: model.bonds.map((b, i) => {
            if (either.has(i) && b.order === 2) return { ...b, stereo: "either" as const };
            if (straightOn(b) && b.stereo === "either") {
              const { stereo: _s, ...rest } = b;
              return rest;
            }
            return b;
          }),
        }
      : model;
  const read = layoutJob(m);
  // (an allene's axis and an odd cumulene's cis or trans the structure's own text says, which a plugin's drawing of it cannot: a MOL block has no way to say them - by atom, in the drawing's order)
  let job: LayoutJob = given && givenFits(read, m) ? { ...read, given: true as const, input: { ...read.input, ...(given.axes.length ? { axes: given.axes } : {}), ...(given.cumulated.length ? { cumulated: given.cumulated } : {}) } } : read;
  // (and one left open with one group at each end: each end kept straight on from it, so that it states neither cis nor trans - ST-4.4 -
  //  whatever the plugin's drawing of it said)
  if (straight.size) {
    const opened = model.bonds.filter(straightOn).map((b) => (b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`));
    const linear = new Set(job.ids.flatMap((id, k) => (straight.has(id) ? [k] : [])));
    job = {
      ...job,
      opened,
      input: {
        ...job.input,
        atoms: job.input.atoms.map((a, k) => (linear.has(k) ? { ...a, linear: true } : a)),
        // (nor asked of the engine to lay out the cis or trans the plugin's drawing read: with its ends straight on it could show none, and
        //  `opened` keeps it from being taken as the drawing's - so this keeps the engine's input to what the text says, not a case of its own)
        bonds: job.input.bonds.map((b) => (b.stereo && b.order === 2 && linear.has(b.a) && linear.has(b.b) ? { a: b.a, b: b.b, order: b.order } : b)),
      },
    };
  }
  const change = relayoutFrom(m, m, job, await layOut(job.input), style);
  return relayout({ ...emptyWorkspaceDocument(), model: m, nextId: nextFree(m) }, change).model;
}

/**
 * The double bonds a structure's own text leaves without a configuration that could have one, by the drawing's indices (layout/drawn
 * `openDoubleBonds`): the ends to keep straight on, by atom, and the bonds to give a wavy bond, by bond.
 */
export type OpenDoubles = { straight: readonly number[]; either: readonly number[] };
