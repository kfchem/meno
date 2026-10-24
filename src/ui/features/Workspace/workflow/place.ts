/**
 * Where a workflow's sets go on the page (docs/WORKFLOWS.md, *Where a
 * result set goes*): clear of its other sets, its steps' cards, its
 * structures, its molecules in 3D and its wires - never over one. One
 * place for the rule, for a step's result sets as it runs (run), its
 * exits' frames as it is added (model `withExits`), and a card put down
 * (`placeCard`).
 */
import type { WorkspaceDocument } from "../document";
import { inside, setMembers, structuresOf, type Frame } from "./entries";
import { boxOf } from "../chem/make3d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { inputsOf } from "./kinds";
import { BETWEEN, CARD_H, CARD_W, GAP, inputLead, nearWire, setGives, setTakes, stepGives, stepTakes, wirePath } from "./look";

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

/** A step's card, shut: where it stands on the page. */
const cardOf = (s: { x: number; y: number }): Frame => frameAt(s.x, s.y, CARD_W, CARD_H);

/** A wire as Workflow2D draws it: round its ends, and the sets and cards near it (look `nearWire`) - its whole path, close enough everywhere to stand for it (look `wirePath`). */
const routed = (p: Pt, q: Pt, e: { from?: Frame; to?: Frame; lead?: number }, round: readonly Frame[]) => wirePath(p, q, e, nearWire(p, q, e, round));


type Pt = { x: number; y: number };
/** What a frame keeps clear of: frames - a card's with its step - and points; and the lines its own wires would be, each with the card at its far end, which it meets. */
type Taken = { frames: (Frame & { card?: number })[]; round: Frame[]; points: Pt[]; from?: { step: number; at: Pt; card: Frame }; to: { step: number; at: Pt; card: Frame; lead?: number }[] };

/** How far a structure's ink may reach past its atoms, about: its labels' letters - "OSiPh2tBu" written out from its O. A structure whose atoms lie further than this from where a frame is looked for cannot reach it. */
const INK_REACH = 8 * NOMINAL_BOND_LENGTH;

/**
 * What a frame keeps clear of on the page: its sets and steps' cards, as
 * frames; its structures' atoms, its molecules in 3D, and its wires - each
 * a curve as Workflow2D draws it (look `wirePath`), its points along it -
 * as points; and each structure as far as its ink, its labels' letters too
 * (chem/make3d `boxOf`, as a set's frame keeps round it), as a frame -
 * those near `along`, the stretch across the page frames are looked for in.
 * Not `self`, nor what it holds, nor the wires to and from it: those move
 * with it, and are kept clear of the rest themselves.
 */
function takenOn(doc: WorkspaceDocument, self?: Self, along?: { x0: number; x1: number }): Taken {
  const own = (id: number) => id === self?.set || !!self?.sets?.has(id);
  const sets = new Map((doc.sets ?? []).map((b) => [b.id, b]));
  const steps = new Map((doc.steps ?? []).map((s) => [s.id, s]));
  const takes = (s: { x: number; y: number; kind: Parameters<typeof inputsOf>[0] }, port: string) => stepTakes(s, Math.max(0, inputsOf(s.kind).findIndex((p) => p.id === port)));
  // (into a card that names its inputs: in level under the name, as Workflow2D draws it)
  const lead = (s: { kind: Parameters<typeof inputsOf>[0] }, port: string) => {
    const inputs = inputsOf(s.kind);
    const name = inputs.length > 1 ? inputs.find((p) => p.id === port)?.name : undefined;
    return name ? { lead: inputLead(name) } : {};
  };
  const frames: Taken["frames"] = [...(doc.sets ?? []).filter((b) => !own(b.id)), ...(doc.steps ?? []).map((s) => ({ ...frameAt(s.x, s.y, CARD_W, CARD_H), card: s.id }))];
  // (what wires go round: the sets and cards, as Workflow2D has them go round - look `wireCurve`)
  const round = frames.slice();
  frames.push(...inkOf(doc, own, along));
  const points: Pt[] = [...doc.model.atoms.map((a) => ({ x: a.x, y: a.y })), ...(doc.molecules3d ?? []).filter((m) => !self?.molecules?.has(m.id)).map((m) => m.at)];
  const to: Taken["to"] = [];
  // (each wire from a set into a step's input, and each line from a step to its result set)
  for (const w of doc.wires ?? []) {
    const b = sets.get(w.from.set);
    const s = steps.get(w.to.step);
    if (!b || !s) continue;
    if (b.id === self?.set) to.push({ step: s.id, at: takes(s, w.to.port), card: cardOf(s), ...lead(s, w.to.port) });
    else if (!own(b.id)) {
      const e = { from: b, to: cardOf(s), ...lead(s, w.to.port) };
      const q = takes(s, w.to.port);
      points.push(...wirePath(setGives(b), q, e, nearWire(setGives(b), q, e, round)));
    }
  }
  for (const b of doc.sets ?? []) {
    const s = b.made ? steps.get(b.made.step) : undefined;
    if (s && !own(b.id)) {
      const e = { from: cardOf(s), to: b };
      points.push(...wirePath(stepGives(s), setTakes(b), e, nearWire(stepGives(s), setTakes(b), e, round)));
    }
  }
  const step = self?.step != null ? steps.get(self.step) : undefined;
  return { frames, round, points, ...(step ? { from: { step: step.id, at: stepGives(step), card: cardOf(step) } } : {}), to };
}

/**
 * Each structure on the page but those the sets `own` hold, as far as its
 * ink (chem/make3d `boxOf`) - where its atoms come within `INK_REACH` of
 * `along` (all, where none is given): measuring a structure's ink lays it
 * out, so a page of a thousand is not laid out for each frame looked for.
 */
function inkOf(doc: WorkspaceDocument, own: (id: number) => boolean, along?: { x0: number; x1: number }): Frame[] {
  const held = new Set((doc.sets ?? []).filter((b) => own(b.id)).flatMap((b) => setMembers(doc, b).structures.flat()));
  const byId = new Map(doc.model.atoms.map((a) => [a.id, a]));
  const out: Frame[] = [];
  for (const ids of structuresOf(doc.model)) {
    if (ids.some((id) => held.has(id))) continue;
    const atoms = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    if (along && !atoms.some((a) => a.x > along.x0 - INK_REACH && a.x < along.x1 + INK_REACH)) continue;
    const these = new Set(ids);
    out.push(boxOf({ atoms, bonds: doc.model.bonds.filter((b) => these.has(b.a) && these.has(b.b)) }));
  }
  return out;
}

/**
 * Whether frame `f` keeps `BETWEEN` clear of what is `taken` - and, `lines`,
 * its own lines, to it from its step and from it to the steps it goes into,
 * cross no card, set or structure's ink but those they meet - nor `f`
 * itself: a wire from it into a step to the left of its right side would
 * turn back over what it holds.
 */
function clearIn(taken: Taken, f: Frame, lines = true): boolean {
  const near = { x0: f.x0 - BETWEEN, x1: f.x1 + BETWEEN, y0: f.y0 - BETWEEN, y1: f.y1 + BETWEEN };
  if (taken.frames.some((t) => t.x0 < near.x1 && t.x1 > near.x0 && t.y0 < near.y1 && t.y1 > near.y0) || taken.points.some((p) => inside(near, p))) return false;
  if (!lines) return true;
  const over = [...taken.frames, f];
  const crosses = (pts: readonly Pt[], meets: number) => pts.some((p) => over.some((t) => (t as { card?: number }).card !== meets && p.x > t.x0 && p.x < t.x1 && p.y > t.y0 && p.y < t.y1));
  if (taken.from && crosses(routed(taken.from.at, setTakes(f), { from: taken.from.card, to: f }, taken.round), taken.from.step)) return false;
  return !taken.to.some((w) => crosses(routed(setGives(f), w.at, { from: f, to: w.card, lead: w.lead }, taken.round), w.step));
}

/**
 * Whether a frame keeps `BETWEEN` clear of what is on the page - its sets,
 * its steps' cards, its structures, its molecules in 3D and its wires - but
 * for the set `self`, the molecules it holds and the sets `self.sets`; and
 * its own lines cross none.
 */
export function clearOf(doc: WorkspaceDocument, f: Frame, self?: Self): boolean {
  return clearIn(takenOn(doc, self, f), f);
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
  const taken = takenOn(doc, self, { x0: x, x1: x + width });
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
 * Where a step's card goes, put down with its top left at (x, y) - where a
 * wire was let go, or Quick Add opened: there, where it is clear of the
 * page's sets, cards, structures, molecules and wires; else lower, half a
 * card at a time, as far as it must (`placeBelow`) - never over one. Its
 * top left.
 */
export function placeCard(doc: WorkspaceDocument, x: number, y: number): { x: number; y: number } {
  const f = placeBelow(doc, x, y, CARD_W, CARD_H);
  return { x: f.x0, y: f.y1 };
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
