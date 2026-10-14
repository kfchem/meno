/**
 * A workspace's drawing style changed, and the page with it (docs/WORKSPACE.md,
 * *Drawing style*). A bond is 1.8 units in every style and the style says
 * how long it prints, so a point is 1.8 / `bondLengthPt` units: with k the
 * old bond's length in pt over the new one's, everything on the page whose
 * place and size are its own - slides, words, pictures, PDFs, shapes, ink,
 * arrows, "+" - is scaled by k about a point, keeping its printed size and
 * its place; a structure keeps its size in units, so that it prints at the
 * new bond, and only its middle moves by k. What is given in points (words'
 * sizes, weights, ink widths, a PDF's pages) is drawn at the new point and
 * so prints as before.
 */
import { styleOf, type StyleChoice } from "../../../lib/chem/style";
import { POINT, pointFor, pointOf } from "../../../lib/pdf/layout";
import type { WorkspaceDocument } from "./document";
import type { Model, PictureItem, WorkflowSet } from "./store/types";
import { restyled3d } from "./utils/restyle3d";
import { setMembers, type Frame } from "./workflow/entries";

type Pt = { x: number; y: number };
const ORIGIN: Pt = { x: 0, y: 0 };

/** The page's parts a change of style converts: a whole document's, or a copy's - those that are there. */
export type Restylable = Partial<
  Pick<WorkspaceDocument, "model" | "arrows" | "pluses" | "captions" | "molecules3d" | "texts" | "pdfs" | "pictures" | "slides" | "shapes" | "inks" | "sets" | "steps">
>;

/** How long a style prints a bond, in pt. */
export function bondPtOf(style: StyleChoice): number {
  return styleOf(style).bondLengthPt;
}

/** The page's units in a point in a workspace of `style`: what a PDF or a text put on its page is laid at (lib/pdf/layout `pointFor`); ACS 1996's where it has none yet. */
export function pointOfStyle(style: StyleChoice | undefined): number {
  return style ? pointFor(bondPtOf(style)) : POINT;
}

/**
 * `parts` as a change of style that prints a bond k times shorter leaves
 * them, about `about`: each structure's middle (and a stack's, its records
 * as one) and each molecule in 3D's body's moved by k, keeping their size in
 * units; everything else on the page scaled by k; a workflow's sets fitted
 * round what they hold. Where k is 1, `parts` itself.
 */
export function restyled<T extends Restylable>(parts: T, k: number, about: Pt = ORIGIN): T {
  if (k === 1 || !(k > 0) || !Number.isFinite(k)) return parts;
  const x = (v: number) => about.x + (v - about.x) * k;
  const y = (v: number) => about.y + (v - about.y) * k;
  const out: Restylable = { ...parts };
  if (parts.model) out.model = structuresMoved(parts.model, k, about);
  if (parts.molecules3d) out.molecules3d = restyled3d(parts.molecules3d, k, about);
  if (parts.arrows)
    out.arrows = parts.arrows.map((a) => ({
      ...a,
      x: x(a.x),
      y: y(a.y),
      length: a.length * k,
      ...(a.corners ? { corners: a.corners.map((c) => ({ ...c, across: c.across * k })) } : {}),
    }));
  if (parts.pluses) out.pluses = parts.pluses.map((p) => ({ ...p, x: x(p.x), y: y(p.y) }));
  if (parts.captions) out.captions = parts.captions.map((c) => ({ ...c, x: x(c.x), y: y(c.y), ...(c.width != null ? { width: c.width * k } : {}) }));
  if (parts.texts) out.texts = parts.texts.map((t) => (t.at ? { ...t, at: { x: x(t.at.x), y: y(t.at.y) } } : t));
  if (parts.pdfs)
    out.pdfs = parts.pdfs.map((p) => ({
      ...p,
      x: x(p.x),
      y: y(p.y),
      // (its pages laid at a point k times larger in units: printed as before)
      point: pointOf(p) * k,
      ...(p.placed ? { placed: p.placed.map((q) => ({ ...q, x: x(q.x), y: y(q.y) })) } : {}),
    }));
  if (parts.pictures) out.pictures = parts.pictures.map((p) => ({ ...p, x: x(p.x), y: y(p.y), w: p.w * k, h: p.h * k }));
  if (parts.slides) out.slides = parts.slides.map((s) => ({ ...s, x: x(s.x), y: y(s.y), w: s.w * k, h: s.h * k }));
  if (parts.shapes)
    out.shapes = parts.shapes.map((s) => ({ ...s, x0: x(s.x0), y0: y(s.y0), x1: x(s.x1), y1: y(s.y1), ...(s.tail ? { tail: { x: x(s.tail.x), y: y(s.tail.y) } } : {}) }));
  if (parts.inks)
    out.inks = parts.inks.map((ink) => ({
      ...ink,
      strokes: ink.strokes.map((s) => {
        // (x, y and the pressure at each point: the pressure kept)
        const points = s.points.slice();
        for (let i = 0; i + 1 < points.length; i += 3) {
          points[i] = x(points[i]);
          points[i + 1] = y(points[i + 1]);
        }
        return { ...s, points };
      }),
    }));
  if (parts.steps) out.steps = parts.steps.map((s) => ({ ...s, x: x(s.x), y: y(s.y) }));
  if (parts.sets) out.sets = parts.sets.map((set) => setFollowing(set, parts, out, k, about));
  return out as T;
}

/**
 * The document a change to `style` leaves: the style set, and the page
 * converted by the old bond's length in pt over the new one's - one edit,
 * so one undo step. (Not `setDocumentStyle`, which sets a style alone: a
 * file opened without one is given one, not converted.)
 */
export function restyledDocument(doc: WorkspaceDocument, style: StyleChoice): WorkspaceDocument {
  const k = doc.style ? bondPtOf(doc.style) / bondPtOf(style) : 1;
  return restyled({ ...doc, style }, k);
}

/**
 * The structures moved as a change of style moves them: each set of atoms
 * joined by bonds - and a stack's records, which stand in one place, as
 * one - by its middle (of its box), from `about`, times k less one; its
 * atoms keep their offsets from it, and everything drawn from them (bonds,
 * abbreviations, brackets, a ring's circle, electron arrows, a mark put by
 * hand, in ems from its atom) goes with them.
 */
function structuresMoved(model: Model, k: number, about: Pt): Model {
  if (!model.atoms.length) return model;
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const up = model.atoms.map((_, i) => i);
  const root = (i: number): number => {
    while (up[i] !== i) {
      up[i] = up[up[i]];
      i = up[i];
    }
    return i;
  };
  const join = (i: number, j: number) => {
    const a = root(i);
    const b = root(j);
    if (a !== b) up[a] = b;
  };
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i != null && j != null) join(i, j);
  }
  const stacks = new Map<number, number>();
  model.atoms.forEach((a, i) => {
    if (!a.stack) return;
    const first = stacks.get(a.stack.id);
    if (first == null) stacks.set(a.stack.id, i);
    else join(i, first);
  });
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  model.atoms.forEach((a, i) => {
    const r = root(i);
    const b = boxes.get(r);
    if (!b) boxes.set(r, { x0: a.x, y0: a.y, x1: a.x, y1: a.y });
    else {
      if (a.x < b.x0) b.x0 = a.x;
      if (a.x > b.x1) b.x1 = a.x;
      if (a.y < b.y0) b.y0 = a.y;
      if (a.y > b.y1) b.y1 = a.y;
    }
  });
  const atoms = model.atoms.map((a, i) => {
    const b = boxes.get(root(i))!;
    return { ...a, x: a.x + ((b.x0 + b.x1) / 2 - about.x) * (k - 1), y: a.y + ((b.y0 + b.y1) / 2 - about.y) * (k - 1) };
  });
  return { ...model, atoms };
}

/**
 * A workflow's set as a change of style leaves it: round what it held - its
 * structures, molecules in 3D and pictures, as they lay before - with the
 * same room about them as before, in units (their own sizes are kept, a
 * picture's scaled); scaled by k, as the page is, where it held nothing.
 */
function setFollowing(set: WorkflowSet, before: Restylable, after: Restylable, k: number, about: Pt): WorkflowSet {
  const page = { model: before.model ?? { atoms: [], bonds: [] }, molecules3d: before.molecules3d, pictures: before.pictures };
  const held = setMembers(page, set);
  const was = heldBox(held, before);
  const now = heldBox(held, after);
  if (!was || !now) {
    const x = (v: number) => about.x + (v - about.x) * k;
    const y = (v: number) => about.y + (v - about.y) * k;
    return { ...set, x0: x(set.x0), y0: y(set.y0), x1: x(set.x1), y1: y(set.y1) };
  }
  return { ...set, x0: now.x0 - (was.x0 - set.x0), y0: now.y0 - (was.y0 - set.y0), x1: now.x1 + (set.x1 - was.x1), y1: now.y1 + (set.y1 - was.y1) };
}

/** The box round what a set holds, as `parts` have it: its structures' atoms, its molecules' places, its pictures' boxes. */
function heldBox(held: ReturnType<typeof setMembers>, parts: Restylable): Frame | null {
  let b: Frame | null = null;
  const take = (x0: number, y0: number, x1: number, y1: number) => {
    if (!b) b = { x0, y0, x1, y1 };
    else b = { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) };
  };
  const atoms = new Map((parts.model?.atoms ?? []).map((a) => [a.id, a]));
  for (const ids of held.structures)
    for (const id of ids) {
      const a = atoms.get(id);
      if (a) take(a.x, a.y, a.x, a.y);
    }
  const molecules = new Map((parts.molecules3d ?? []).map((m) => [m.id, m]));
  for (const id of held.molecules) {
    const m = molecules.get(id);
    if (m) take(m.at.x, m.at.y, m.at.x, m.at.y);
  }
  const pictures = new Map((parts.pictures ?? []).map((p): [number, PictureItem] => [p.id, p]));
  for (const id of held.pictures) {
    const p = pictures.get(id);
    if (p) take(p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2);
  }
  return b;
}
