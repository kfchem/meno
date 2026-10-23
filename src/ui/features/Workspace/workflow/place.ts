/**
 * Where a workflow's sets go on the page (docs/WORKFLOWS.md, *Where a
 * result set goes*): clear of its other sets, its steps' cards, its
 * structures, its molecules in 3D and its wires - never over one. One
 * place for the rule, for a step's result sets as it runs (run) and its
 * exits' frames as it is added (model `withExits`).
 */
import type { WorkspaceDocument } from "../document";
import { inside, type Frame } from "./entries";
import { inputsOf } from "./kinds";
import { BETWEEN, CARD_H, CARD_W, GAP, setGives, setTakes, stepGives, stepTakes, wireCurve } from "./look";

/** A frame `w` by `h`, its top left at (x, y). */
export const frameAt = (x: number, y: number, w: number, h: number): Frame => ({ x0: x, x1: x + w, y0: y - h, y1: y });

/**
 * Where a step's result set goes (docs/WORKFLOWS.md, *Where a result set
 * goes*): to the right of the step, level with it - or, where something is
 * there already, lower, as far as it must to keep clear of the page's sets,
 * steps' cards, structures, molecules and wires, its own line from the step
 * crossing no card or set (`clearOf`). Below all of them is clear, so there
 * is always a place: it never lies over another. `self`: the set it is,
 * where it was made before, and what goes with it.
 */
export function placeFor(doc: WorkspaceDocument, step: { id: number; x: number; y: number }, width: number, height: number, self?: Self): Frame {
  // (half a card at a time, down to below all that is on the page)
  return placeBelow(doc, step.x + CARD_W + GAP, step.y, width, height, { ...self, step: step.id });
}

/**
 * A set being placed: itself, the molecules it holds, and other sets that
 * go with it - none of them in its way; and the step whose result it is,
 * its line from that step's card to be clear too, as the wires from it to
 * the steps it goes into are.
 */
export type Self = { set?: number; molecules?: ReadonlySet<number>; sets?: ReadonlySet<number>; step?: number };

/** How many points along a wire stand for it, as `clearOf` keeps clear of it. */
const WIRE_POINTS = 24;

type Pt = { x: number; y: number };
/** What a frame keeps clear of: frames - a card's with its step - and points; and the lines its own wires would be, each with the card at its far end, which it meets. */
type Taken = { frames: (Frame & { card?: number })[]; points: Pt[]; from?: { step: number; at: Pt }; to: { step: number; at: Pt }[] };

/**
 * What a frame keeps clear of on the page: its sets and steps' cards, as
 * frames; its structures' atoms, its molecules in 3D, and its wires - each
 * a curve as Workflow2D draws it (look `wireCurve`), its points along it -
 * as points. Not `self`, nor what it holds, nor the wires to and from it:
 * those move with it, and are kept clear of the rest themselves.
 */
function takenOn(doc: WorkspaceDocument, self?: Self): Taken {
  const own = (id: number) => id === self?.set || !!self?.sets?.has(id);
  const sets = new Map((doc.sets ?? []).map((b) => [b.id, b]));
  const steps = new Map((doc.steps ?? []).map((s) => [s.id, s]));
  const takes = (s: { x: number; y: number; kind: Parameters<typeof inputsOf>[0] }, port: string) => stepTakes(s, Math.max(0, inputsOf(s.kind).findIndex((p) => p.id === port)));
  const frames: Taken["frames"] = [...(doc.sets ?? []).filter((b) => !own(b.id)), ...(doc.steps ?? []).map((s) => ({ ...frameAt(s.x, s.y, CARD_W, CARD_H), card: s.id }))];
  const points: Pt[] = [...doc.model.atoms.map((a) => ({ x: a.x, y: a.y })), ...(doc.molecules3d ?? []).filter((m) => !self?.molecules?.has(m.id)).map((m) => m.at)];
  const to: Taken["to"] = [];
  // (each wire from a set into a step's input, and each line from a step to its result set)
  for (const w of doc.wires ?? []) {
    const b = sets.get(w.from.set);
    const s = steps.get(w.to.step);
    if (!b || !s) continue;
    if (b.id === self?.set) to.push({ step: s.id, at: takes(s, w.to.port) });
    else if (!own(b.id)) points.push(...wireCurve(setGives(b), takes(s, w.to.port), WIRE_POINTS));
  }
  for (const b of doc.sets ?? []) {
    const s = b.made ? steps.get(b.made.step) : undefined;
    if (s && !own(b.id)) points.push(...wireCurve(stepGives(s), setTakes(b), WIRE_POINTS));
  }
  const step = self?.step != null ? steps.get(self.step) : undefined;
  return { frames, points, ...(step ? { from: { step: step.id, at: stepGives(step) } } : {}), to };
}

/**
 * Whether frame `f` keeps `BETWEEN` clear of what is `taken` - and, `lines`,
 * its own lines, to it from its step and from it to the steps it goes into,
 * cross no card or set but those they meet.
 */
function clearIn(taken: Taken, f: Frame, lines = true): boolean {
  const near = { x0: f.x0 - BETWEEN, x1: f.x1 + BETWEEN, y0: f.y0 - BETWEEN, y1: f.y1 + BETWEEN };
  if (taken.frames.some((t) => t.x0 < near.x1 && t.x1 > near.x0 && t.y0 < near.y1 && t.y1 > near.y0) || taken.points.some((p) => inside(near, p))) return false;
  if (!lines) return true;
  const crosses = (pts: readonly Pt[], meets: number) => pts.some((p) => taken.frames.some((t) => t.card !== meets && p.x > t.x0 && p.x < t.x1 && p.y > t.y0 && p.y < t.y1));
  if (taken.from && crosses(wireCurve(taken.from.at, setTakes(f), WIRE_POINTS), taken.from.step)) return false;
  return !taken.to.some((w) => crosses(wireCurve(setGives(f), w.at, WIRE_POINTS), w.step));
}

/**
 * Whether a frame keeps `BETWEEN` clear of what is on the page - its sets,
 * its steps' cards, its structures, its molecules in 3D and its wires - but
 * for the set `self`, the molecules it holds and the sets `self.sets`; and
 * its own lines cross none.
 */
export function clearOf(doc: WorkspaceDocument, f: Frame, self?: Self): boolean {
  return clearIn(takenOn(doc, self), f);
}

/**
 * Where a step's result set made before goes as it runs again, `width` by
 * `height` now: where it was, its top left kept - or, where that would now
 * reach over something beside it (it grew), where `placeFor` puts it. Its
 * step's other exits' sets are no hindrance: they keep under it (run
 * `keepExitsUnder`).
 */
export function placeAgain(doc: WorkspaceDocument, step: { id: number; x: number; y: number }, was: Frame & { id: number }, width: number, height: number): Frame {
  const siblings = new Set((doc.sets ?? []).filter((b) => b.made?.step === step.id && b.id !== was.id).map((b) => b.id));
  const self: Self = { set: was.id, sets: siblings, step: step.id };
  const there = frameAt(was.x0, was.y1, width, height);
  return clearOf(doc, there, self) ? there : placeFor(doc, step, width, height, self);
}

/**
 * Where a frame `width` by `height` goes under one at (x, `top`): there, or
 * lower, half a card at a time, as far as it must to keep clear (`clearOf`).
 */
export function placeBelow(doc: WorkspaceDocument, x: number, top: number, width: number, height: number, self?: Self): Frame {
  const taken = takenOn(doc, self);
  const lowest = Math.min(top, ...taken.frames.map((t) => t.y0), ...taken.points.map((p) => p.y));
  const most = Math.ceil((top - lowest + height + BETWEEN) / (CARD_H / 2)) + 1;
  // (its own lines crossing nothing, where there is such a place; else - steps laid so close that a wire turns back on
  //  itself, say - clear of all the rest still, its own line crossing what it must: never over a set, a card or a wire)
  for (const lines of [true, false])
    for (let k = 0; k <= most; k++) {
      const f = frameAt(x, top - k * (CARD_H / 2), width, height);
      if (clearIn(taken, f, lines)) return f;
    }
  return frameAt(x, lowest - BETWEEN, width, height);
}

/**
 * How wide a step's result set may be and stay in its own column: from
 * where it goes (`placeFor`) to `BETWEEN` short of the next step's card to
 * the right in the same row - its card's height overlapping the step's -
 * so that the steps after it have their lines clear; none (Infinity) where
 * there is no such card.
 */
export function columnWidth(doc: WorkspaceDocument, step: { id: number; x: number; y: number }): number {
  const x = step.x + CARD_W + GAP;
  const next = (doc.steps ?? []).filter((s) => s.id !== step.id && s.x > step.x && s.y - CARD_H < step.y && s.y > step.y - CARD_H).map((s) => s.x);
  return next.length ? Math.min(...next) - BETWEEN - x : Infinity;
}
