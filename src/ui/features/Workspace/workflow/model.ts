/**
 * A workflow's parts as the document holds them (docs/WORKFLOWS.md): sets,
 * steps and wires, numbered from one counter - each change an edit to the
 * document, so that undo takes it back and Save keeps it.
 */
import type { WorkspaceDocument } from "../document";
import type { StepRunKept, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import type { OptionValues } from "../../../../lib/options";
import { setMembers, structuresOf, type Frame } from "./entries";
import { drawnBox } from "../../../../utils/importers";
import { SET_PAD, SET_TOP } from "./look";
import { canWire, wireInto } from "./flow";
import type { StepKind } from "./kinds";

const idOf = (doc: WorkspaceDocument) => doc.nextWorkflowId ?? 1;

/** A frame with its corners in order: x0 left of x1, y0 below y1. */
export const framed = (f: Frame): Frame => ({ x0: Math.min(f.x0, f.x1), y0: Math.min(f.y0, f.y1), x1: Math.max(f.x0, f.x1), y1: Math.max(f.y0, f.y1) });

/** `doc` with a set round `frame`; it is numbered `nextWorkflowId`. Made by a step, it says so; named, it has the name. */
export function addSet(doc: WorkspaceDocument, frame: Frame, made?: WorkflowSet["made"], name?: string): WorkspaceDocument {
  const id = idOf(doc);
  return { ...doc, nextWorkflowId: id + 1, sets: [...(doc.sets ?? []), { id, ...framed(frame), ...(made ? { made } : {}), ...(name ? { name } : {}) }] };
}

/** A chemist's set named anew - a step's set is named for what made it - its name taken away where the new one is empty. */
export function renameSet(doc: WorkspaceDocument, id: number, name: string): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set || set.made || (set.name ?? "") === name.trim()) return doc;
  const { name: _was, ...rest } = set;
  const next = name.trim() ? { ...rest, name: name.trim() } : rest;
  return { ...doc, sets: (doc.sets ?? []).map((b) => (b.id === id ? next : b)) };
}

function withSet(doc: WorkspaceDocument, id: number, change: (b: WorkflowSet) => WorkflowSet): WorkspaceDocument {
  const sets = doc.sets ?? [];
  const i = sets.findIndex((b) => b.id === id);
  if (i < 0) return doc;
  const next = change(sets[i]);
  return next === sets[i] ? doc : { ...doc, sets: sets.map((b, k) => (k === i ? next : b)) };
}

/** A set's frame, sized anew. */
export function resizeSet(doc: WorkspaceDocument, id: number, frame: Frame): WorkspaceDocument {
  const f = framed(frame);
  return withSet(doc, id, (b) => (b.x0 === f.x0 && b.y0 === f.y0 && b.x1 === f.x1 && b.y1 === f.y1 ? b : { ...b, ...f }));
}

/** A set moved by (dx, dy), with all it holds: the structures drawn, the molecules in 3D and the pictures inside it. */
export function moveSet(doc: WorkspaceDocument, id: number, dx: number, dy: number): WorkspaceDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set || (dx === 0 && dy === 0)) return doc;
  const { structures, molecules, pictures } = setMembers(doc, set);
  const atoms = new Set(structures.flat());
  const moved = new Set(molecules);
  const shown = new Set(pictures);
  return {
    ...withSet(doc, id, (b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
    model: atoms.size ? { ...doc.model, atoms: doc.model.atoms.map((a) => (atoms.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)) } : doc.model,
    molecules3d: moved.size ? (doc.molecules3d ?? []).map((m) => (moved.has(m.id) ? { ...m, at: { ...m.at, x: m.at.x + dx, y: m.at.y + dy } } : m)) : doc.molecules3d,
    pictures: shown.size ? (doc.pictures ?? []).map((p) => (shown.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) : doc.pictures,
  };
}

/** `doc` without a set - and the wires from it: what it held stays where it is. */
export function removeSet(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const sets = (doc.sets ?? []).filter((b) => b.id !== id);
  if (sets.length === (doc.sets ?? []).length) return doc;
  return { ...doc, sets, wires: (doc.wires ?? []).filter((w) => !("set" in w.from && w.from.set === id)) };
}

/** `doc` with a step of `kind`, done by `by` - Meno, or a plugin - whose card's top left is at (x, y); it is numbered `nextWorkflowId`. */
export function addStep(doc: WorkspaceDocument, kind: StepKind, x: number, y: number, options?: OptionValues, by?: string): WorkspaceDocument {
  const id = idOf(doc);
  const step: WorkflowStep = { id, kind, x, y, ...(by ? { by } : {}), ...(options && Object.keys(options).length ? { options } : {}) };
  return { ...doc, nextWorkflowId: id + 1, steps: [...(doc.steps ?? []), step] };
}

function withStep(doc: WorkspaceDocument, id: number, change: (s: WorkflowStep) => WorkflowStep): WorkspaceDocument {
  const steps = doc.steps ?? [];
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const next = change(steps[i]);
  return next === steps[i] ? doc : { ...doc, steps: steps.map((s, k) => (k === i ? next : s)) };
}

export function moveStep(doc: WorkspaceDocument, id: number, x: number, y: number): WorkspaceDocument {
  return withStep(doc, id, (s) => (s.x === x && s.y === y ? s : { ...s, x, y }));
}

/** A step's options changed - or its kind, to another who does it fills, with the options it takes for that one. */
export function updateStep(doc: WorkspaceDocument, id: number, patch: { options?: OptionValues; kind?: StepKind }): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    const next: WorkflowStep = { ...s, ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.options ? { options: patch.options } : {}) };
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}

/** What a step did when it ran, kept with it. */
export function setRan(doc: WorkspaceDocument, id: number, ran: NonNullable<WorkflowStep["ran"]>): WorkspaceDocument {
  return withStep(doc, id, (s) => ({ ...s, ran }));
}

/** How many of a step's earlier runs it keeps. */
export const RUNS_KEPT = 10;

/** A step's earlier runs, newest first - none, where it keeps none. */
export function withStepRuns(doc: WorkspaceDocument, id: number, runs: StepRunKept[]): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    if (runs.length) return { ...s, runs };
    if (!s.runs) return s;
    const { runs: _r, ...rest } = s;
    return rest;
  });
}

/** A step's run while its jobs wait or run - or, ended, none: the step as it was otherwise. */
export function setRunning(doc: WorkspaceDocument, id: number, running: WorkflowStep["running"]): WorkspaceDocument {
  return withStep(doc, id, (s) => {
    if (running) return { ...s, running };
    if (!s.running) return s;
    const { running: _r, ...rest } = s;
    return rest;
  });
}

/** The steps running in `now` that `then` - what an undo or a redo would come to - has not: an undo that takes them away asks first, as deleting them does. */
export function runningGone(now: WorkspaceDocument, then: WorkspaceDocument | undefined): WorkflowStep[] {
  if (!then) return [];
  return (now.steps ?? []).filter((s) => s.running && !(then.steps ?? []).some((x) => x.id === s.id));
}

/** `doc` without a step and the wires into it and out of it. The set it made stays, with what it holds - a set like any the chemist drew (of conformers, where its molecules' frames are a conformer search's: entries `holdsOf`). */
export function removeStep(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const steps = (doc.steps ?? []).filter((s) => s.id !== id);
  if (steps.length === (doc.steps ?? []).length) return doc;
  return {
    ...doc,
    steps,
    wires: (doc.wires ?? []).filter((w) => w.to !== id && !("step" in w.from && w.from.step === id)),
    sets: (doc.sets ?? []).map((b) => (b.made?.step === id ? (({ made: _m, aside: _a, ...rest }) => rest)(b) : b)),
  };
}

/** `doc` with a wire from `from` into the step `to` - in place of one it had - where it may go there (flow `canWire`). */
export function connect(doc: WorkspaceDocument, from: WireEnd, to: number): WorkspaceDocument {
  if (!canWire(doc, from, to)) return doc;
  const was = wireInto(doc, to);
  if (was && JSON.stringify(was.from) === JSON.stringify(from)) return doc;
  const id = idOf(doc);
  return { ...doc, nextWorkflowId: id + 1, wires: [...(doc.wires ?? []).filter((w) => w.to !== to), { id, from, to }] };
}

export function removeWire(doc: WorkspaceDocument, id: number): WorkspaceDocument {
  const wires = (doc.wires ?? []).filter((w) => w.id !== id);
  return wires.length === (doc.wires ?? []).length ? doc : { ...doc, wires };
}

/** What made a set, and the entries it set aside, said of it. */
export function markMade(doc: WorkspaceDocument, id: number, made: NonNullable<WorkflowSet["made"]>, aside: WorkflowSet["aside"]): WorkspaceDocument {
  return withSet(doc, id, ({ aside: _a, ...b }) => ({ ...b, made, ...(aside?.length ? { aside } : {}) }));
}

/**
 * `doc` after an edit, its sets grown to keep inside them the structures
 * drawn on in them (docs/WORKFLOWS.md, *An input: a set from the
 * selection*): a structure that was in a set before the edit - its middle
 * inside the frame - and whose shape the edit changed - an atom added,
 * moved on its own, or made another element - is kept inside its frame,
 * its labels and all, the frame growing as far as it must. A structure
 * moved whole, or a frame sized anew, leaves the frame as it is: a
 * structure is dragged out of a set, and a set made smaller than what it
 * holds, on purpose.
 */
export function fitSets(doc: WorkspaceDocument, before: WorkspaceDocument): WorkspaceDocument {
  if (!doc.sets?.length || doc.model === before.model) return doc;
  const was = new Map(before.model.atoms.map((a) => [a.id, a]));
  const now = new Map(doc.model.atoms.map((a) => [a.id, a]));
  const shaped = structuresOf(doc.model).filter((ids) => {
    const atoms = ids.map((id) => now.get(id)!);
    if (atoms.some((a) => !was.has(a.id))) return true;
    const first = was.get(atoms[0].id)!;
    const dx = atoms[0].x - first.x;
    const dy = atoms[0].y - first.y;
    return atoms.some((a) => {
      const b = was.get(a.id)!;
      return a.el !== b.el || (a.charge ?? 0) !== (b.charge ?? 0) || Math.abs(a.x - b.x - dx) > 1e-9 || Math.abs(a.y - b.y - dy) > 1e-9;
    });
  });
  if (!shaped.length) return doc;
  let out = doc;
  for (const set of doc.sets) {
    const prior = before.sets?.find((b) => b.id === set.id);
    if (!prior) continue;
    const held = new Set(setMembers(before, prior).structures.flat());
    let frame: Frame = set;
    for (const ids of shaped) {
      if (!ids.some((id) => held.has(id))) continue;
      const atoms = new Set(ids);
      const b = drawnBox({ atoms: doc.model.atoms.filter((a) => atoms.has(a.id)), bonds: doc.model.bonds.filter((x) => atoms.has(x.a) && atoms.has(x.b)) });
      frame = {
        x0: Math.min(frame.x0, b.minX - SET_PAD),
        x1: Math.max(frame.x1, b.maxX + SET_PAD),
        y0: Math.min(frame.y0, b.minY - SET_PAD),
        y1: Math.max(frame.y1, b.maxY + SET_TOP),
      };
    }
    out = resizeSet(out, set.id, frame);
  }
  return out;
}
