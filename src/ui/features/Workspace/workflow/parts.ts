/**
 * A workflow's parts taken together (docs/WORKFLOWS.md, *Copying* and
 * *Procedures*): those a selection holds - copied, cut, deleted, moved as
 * the drawing's are - and a whole flow, saved as a procedure and put down
 * again. Plain data over the document; the store makes each one edit.
 */
import type { WorkspaceDocument } from "../document";
import type { Wire, WorkflowSet, WorkflowStep } from "../store/types";
import { insidePolygon } from "../utils/selection";
import { CARD_H, CARD_W } from "./look";
import { removeSet, removeStep, withExits } from "./model";
import { greatest, least } from "../../../../lib/chem/lists";

type Pt = { x: number; y: number };
type Flow = Pick<WorkspaceDocument, "sets" | "steps" | "wires">;

/**
 * Parts of a workflow, as a copy or a procedure carries them: sets - their
 * frames, and what made them where that is among them too - steps, as they
 * are set (their kind, who does them, their options, their place), and the
 * wires among them; numbered by ids of their own.
 */
export type FlowParts = { sets: WorkflowSet[]; steps: WorkflowStep[]; wires: Wire[] };

export const NO_PARTS: FlowParts = { sets: [], steps: [], wires: [] };

/** Whether a wire's two ends are both among the sets and steps given. */
const among = (w: Wire, sets: ReadonlySet<number>, steps: ReadonlySet<number>) => steps.has(w.to.step) && sets.has(w.from.set);

/**
 * The parts among the sets and steps given: those sets - one made by a step
 * not among them, as a set the chemist drew - those steps, without what they
 * did (their runs are theirs, and their jobs'), and the wires among them. A
 * set goes without its members, which are this page's, and without a large
 * set's own molecules (`collection`, and how many of them did not read),
 * which are the set's: put down elsewhere, it holds what then lies inside it
 * (workflow/model `membersSettled`), and a step's exit is empty until its
 * step runs again - its molecules never copied twice.
 */
export function partsOf(doc: Flow, sets: ReadonlySet<number>, steps: ReadonlySet<number>): FlowParts {
  return {
    sets: (doc.sets ?? [])
      .filter((b) => sets.has(b.id))
      // (a step's exit without its step is a set like the chemist's; with it, empty until that step runs again)
      .map(({ members: _m, collection: _l, drawnCollection: _d, unread: _u, keep: _k, notKept: _n, put: _p, core: _c, ...b }) =>
        b.made && !steps.has(b.made.step) ? (({ made: _m, ...rest }) => rest)(b) : b.made ? { ...b, made: { step: b.made.step, exit: b.made.exit } } : b,
      ),
    steps: (doc.steps ?? [])
      .filter((s) => steps.has(s.id))
      .map(({ ran: _r, runs: _k, running: _g, ...s }) => s),
    wires: (doc.wires ?? []).filter((w) => among(w, sets, steps)),
  };
}

/** The ids of what parts hold, as sets of ids. */
export const idsOf = (parts: FlowParts) => ({ sets: new Set(parts.sets.map((b) => b.id)), steps: new Set(parts.steps.map((s) => s.id)) });

/**
 * `doc` with `parts` added, moved by (dx, dy), numbered on from its
 * counter - the wires among them, and what made a set, numbered as they
 * are - and the ids the sets and steps were given, in order. A step put
 * down without a set for one of its exits is given one (model
 * `withExits`), so that every step has its exits.
 */
export function appendParts(doc: WorkspaceDocument, parts: FlowParts, dx = 0, dy = 0): { doc: WorkspaceDocument; sets: number[]; steps: number[] } {
  let next = doc.nextWorkflowId ?? 1;
  const setId = new Map(parts.sets.map((b) => [b.id, next++]));
  const stepId = new Map(parts.steps.map((s) => [s.id, next++]));
  const sets = parts.sets.map((b): WorkflowSet => {
    const step = b.made ? stepId.get(b.made.step) : undefined;
    const { made: _m, ...rest } = b;
    return { ...rest, ...(b.made && step != null ? { made: { ...b.made, step } } : {}), id: setId.get(b.id)!, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy };
  });
  const steps = parts.steps.map((s): WorkflowStep => ({ ...s, id: stepId.get(s.id)!, x: s.x + dx, y: s.y + dy }));
  const wires = parts.wires.flatMap((w): Wire[] => {
    const from = setId.get(w.from.set);
    const to = stepId.get(w.to.step);
    return from != null && to != null ? [{ id: next++, from: { set: from }, to: { step: to, port: w.to.port } }] : [];
  });
  let out: WorkspaceDocument = {
    ...doc,
    nextWorkflowId: next,
    sets: [...(doc.sets ?? []), ...sets],
    steps: [...(doc.steps ?? []), ...steps],
    wires: [...(doc.wires ?? []), ...wires],
  };
  for (const s of steps) out = withExits(out, s.id);
  const before = new Set((doc.sets ?? []).map((b) => b.id));
  return {
    doc: out,
    sets: (out.sets ?? []).filter((b) => !before.has(b.id)).map((b) => b.id),
    steps: steps.map((s) => s.id),
  };
}

/** `doc` without the sets and steps given, and every wire into or out of them: what the sets held stays where it is. */
export function removeParts(doc: WorkspaceDocument, sets: Iterable<number>, steps: Iterable<number>): WorkspaceDocument {
  let d = doc;
  for (const id of steps) d = removeStep(d, id);
  for (const id of sets) d = removeSet(d, id);
  return d;
}

/** Where a step's card stands, as a point: its middle, closed. */
export const stepMiddle = (s: Pick<WorkflowStep, "x" | "y">): Pt => ({ x: s.x + CARD_W / 2, y: s.y - CARD_H / 2 });
/** Where a set stands, as a point: the middle of its frame. */
export const setMiddle = (b: Pick<WorkflowSet, "x0" | "x1" | "y0" | "y1">): Pt => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

/** The sets and steps a box (two corners) or a lasso (three points or more) takes: those whose middle stands inside it, as with the molecules in 3D. */
export function flowIn(doc: Flow, kind: "box" | "lasso", points: readonly Pt[]): { sets: number[]; steps: number[] } {
  let inside: (p: Pt) => boolean;
  if (kind === "box") {
    if (points.length < 2) return { sets: [], steps: [] };
    const [p, q] = points;
    const [x0, x1, y0, y1] = [Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.y, q.y), Math.max(p.y, q.y)];
    inside = (m) => m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1;
  } else {
    if (points.length < 3) return { sets: [], steps: [] };
    inside = (m) => insidePolygon(m, points);
  }
  return {
    sets: (doc.sets ?? []).filter((b) => inside(setMiddle(b))).map((b) => b.id),
    steps: (doc.steps ?? []).filter((s) => inside(stepMiddle(s))).map((s) => s.id),
  };
}

/** How far parts reach on the page: their frames, and their steps' cards closed. Null where they hold nothing. */
export function partsBounds(parts: FlowParts): { x0: number; y0: number; x1: number; y1: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const b of parts.sets) {
    xs.push(b.x0, b.x1);
    ys.push(b.y0, b.y1);
  }
  for (const s of parts.steps) {
    xs.push(s.x, s.x + CARD_W);
    ys.push(s.y - CARD_H, s.y);
  }
  return xs.length ? { x0: least(xs), x1: greatest(xs), y0: least(ys), y1: greatest(ys) } : null;
}

/**
 * The whole flow a set or a step is part of: every set and step joined to
 * it by wires, either way, and each set a step made joined to that step -
 * however far along.
 */
export function flowOf(doc: Flow, start: { set: number } | { step: number }): { sets: Set<number>; steps: Set<number> } {
  const sets = new Set<number>();
  const steps = new Set<number>();
  const todo: ({ set: number } | { step: number })[] = [start];
  while (todo.length) {
    const at = todo.pop()!;
    if ("set" in at) {
      if (sets.has(at.set)) continue;
      const b = doc.sets?.find((x) => x.id === at.set);
      if (!b) continue;
      sets.add(at.set);
      if (b.made) todo.push({ step: b.made.step });
      for (const w of doc.wires ?? []) if (w.from.set === at.set) todo.push({ step: w.to.step });
    } else {
      if (steps.has(at.step)) continue;
      if (!doc.steps?.some((s) => s.id === at.step)) continue;
      steps.add(at.step);
      for (const b of doc.sets ?? []) if (b.made?.step === at.step) todo.push({ set: b.id });
      for (const w of doc.wires ?? []) if (w.to.step === at.step) todo.push({ set: w.from.set });
    }
  }
  return { sets, steps };
}

/**
 * A procedure of a flow (docs/WORKFLOWS.md, *Procedures*): its steps, as
 * they are set, the wires among them, and its sets as empty frames - those
 * the chemist drew, ready for an input, and its steps' exits, which the
 * wires lead on from; what any of them held is not kept. Placed from its
 * top left.
 */
export function procedureParts(doc: Flow, flow: { sets: ReadonlySet<number>; steps: ReadonlySet<number> }): FlowParts {
  const parts = partsOf(doc, flow.sets, flow.steps);
  const at = partsBounds(parts);
  if (!at) return parts;
  return {
    sets: parts.sets.map((b) => ({ ...b, x0: b.x0 - at.x0, x1: b.x1 - at.x0, y0: b.y0 - at.y1, y1: b.y1 - at.y1 })),
    steps: parts.steps.map((s) => ({ ...s, x: s.x - at.x0, y: s.y - at.y1 })),
    wires: parts.wires,
  };
}
