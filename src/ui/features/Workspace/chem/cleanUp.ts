/**
 * Clean-up: a structure laid out afresh by Meno's own engine - the drawing a
 * chemist would make of it (docs/LAYOUT-2D.md) - where it was drawn, with
 * the groups a chemist would write by name written so (lib/chem/contract),
 * as one undo step.
 */
import { contractGraph, contractionTrials, hiddenIn } from "../../../../lib/chem/contract";
import { chemistry } from "../../../../lib/chem/molecule";
import type { Layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, endpointsHeld, relayout, writtenAsLabels, type WrittenAsLabel } from "../document";
import type { EditorStore } from "../store";
import type { Model } from "../store/types";
import { drawingOf } from "./drawing";
import { layoutJob, nextFree, relayoutFrom, type LayoutJob } from "./engineLayout";
import { layOut } from "./layOut";

/**
 * An atom and every atom bonded to it, however far along - a haptic bond
 * joining a metal to every atom of its pi system (a Cp ring is one
 * structure with its metal).
 */
export function fragmentOf(model: Model, atomId: number): Set<number> {
  const next = new Map<number, number[]>();
  const join = (u: number, v: number) => {
    next.set(u, [...(next.get(u) ?? []), v]);
    next.set(v, [...(next.get(v) ?? []), u]);
  };
  for (const b of model.bonds) {
    join(b.a, b.b);
    for (const e of b.endpoints ?? []) join(b.a, e);
  }
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

/** The structures on the canvas, each the atoms bonded together, a lone atom not among them. */
export function fragmentsOf(model: Model): Set<number>[] {
  const seen = new Set<number>();
  const out: Set<number>[] = [];
  const bonded = new Set(model.bonds.flatMap((b) => [b.a, b.b]));
  for (const a of model.atoms) {
    if (seen.has(a.id) || !bonded.has(a.id)) continue;
    const f = fragmentOf(model, a.id);
    f.forEach((id) => seen.add(id));
    out.push(f);
  }
  return out;
}

/** The fragments that hold any of `atoms`, each once. */
export function fragmentsHolding(model: Model, atoms: Iterable<number>): Set<number>[] {
  const out: Set<number>[] = [];
  for (const id of atoms) {
    if (out.some((f) => f.has(id)) || !model.atoms.some((a) => a.id === id)) continue;
    out.push(fragmentOf(model, id));
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
  const model = store.getState().model;
  const expanded = store.getState().justExpanded();
  const parts = (
    around == null
      ? fragmentsOf(model)
      : fragmentsHolding(model, typeof around === "number" ? [around] : around)
  )
    .map((ids) => partOf(model, ids))
    .filter((part) => part.bonds.length > 0);
  if (!parts.length) return; // nothing to lay out
  const cleaned = await Promise.all(parts.map((part) => laidOutWithLabels(part, expanded)));
  if (store.getState().model !== model) {
    throw new Error(
      "The structure changed while it was being cleaned up, so nothing was moved.",
    );
  }
  const labels = cleaned.flatMap((c) => c.labels);
  const written = labels.length ? writtenAsLabels({ ...emptyWorkspaceDocument(), model }, labels).model : model;
  const changes = cleaned.map((c) => relayoutFrom(written, c.part, c.job, c.laid));
  store.getState().relayout(
    {
      atoms: changes.flatMap((c) => c.atoms),
      bonds: changes.flatMap((c) => c.bonds),
      added: changes.flatMap((c) => c.added ?? []),
      removed: changes.flatMap((c) => c.removed ?? []),
    },
    labels,
  );
}

/**
 * `model` laid out afresh by the engine as a whole - a salt's ions set out
 * together - for a structure that has only just arrived, before it is
 * added: a plugin's drawing of a SMILES.
 */
export async function laidOut(model: Model): Promise<Model> {
  if (!model.bonds.length) return model;
  const job = layoutJob(model);
  const change = relayoutFrom(model, model, job, await layOut(job.input));
  return relayout({ ...emptyWorkspaceDocument(), model, nextId: nextFree(model) }, change).model;
}
