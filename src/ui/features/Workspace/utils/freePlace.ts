import { besidesBoxes, type Box } from "./extent";
import type { EditorState, Model } from "../store/types";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { buildTextLabels, labelHulls, labelSetOf } from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { CARD_H, CARD_W } from "../workflow/look";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { ImportedScheme } from "../document";
import { currentStyle3D } from "../style3d";
import { lookOf, solidOf } from "./molecule3d";
import type { ProcessedFileResult } from "./io";

type Pt = { x: number; y: number };

/**
 * Where what a file brings goes, opened onto a page near `at` - the middle
 * of the view: at `at` itself where it is clear of all there is there
 * (`there`, each thing's box), else at the nearest point about `at`, of a
 * grid `step` apart, where it is - its own box (`foot`, about the point it
 * is put at) kept `gap` from each of theirs. Of points as near, the one to
 * the right comes first, then below. At `at`, where nothing within `reach`
 * steps of it is clear.
 */
export function freePlace(there: readonly Box[], foot: Box, at: Pt, step: number, gap = step, reach = 24): Pt {
  const clear = (c: Pt) => {
    const x0 = c.x + foot.x0 - gap;
    const x1 = c.x + foot.x1 + gap;
    const y0 = c.y + foot.y0 - gap;
    const y1 = c.y + foot.y1 + gap;
    return there.every((b) => b.x1 <= x0 || b.x0 >= x1 || b.y1 <= y0 || b.y0 >= y1);
  };
  if (clear(at)) return at;
  const points: [number, number][] = [];
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) if (i || j) points.push([i, j]);
  // (nearest first; of those as near, to the right, then below - the y axis up)
  points.sort((p, q) => p[0] * p[0] + p[1] * p[1] - (q[0] * q[0] + q[1] * q[1]) || q[0] - p[0] || p[1] - q[1]);
  for (const [i, j] of points) {
    const c = { x: at.x + i * step, y: at.y + j * step };
    if (clear(c)) return c;
  }
  // (nothing near clear - beside a drawing wider than the reach: past the
  // right of all there is, else below it, never over it)
  if (!there.length) return at;
  const right = { x: Math.max(...there.map((b) => b.x1)) + gap - foot.x0 + step / 2, y: at.y };
  if (clear(right)) return right;
  return { x: at.x, y: Math.min(...there.map((b) => b.y0)) - gap - foot.y1 - step / 2 };
}

const NONE = new Set<number>();

/**
 * Boxes round all there is on the page, selected or not, each as it is
 * drawn (./extent) - and a workflow's sets and its steps' cards: a
 * structure put down in a set's frame would be taken as what the set
 * holds (workflow/entries), and one on a step's card would hide it.
 */
export function pageBoxes(st: EditorState, style: DrawingStyle): Box[] {
  const out = besidesBoxes(
    { ...st, sel: { atoms: NONE, bonds: NONE }, sel3d: NONE, selCaptions: NONE, selArrows: NONE, selPluses: NONE, selPictures: NONE, selPdfs: NONE, selTexts: NONE, selSlides: NONE, selShapes: NONE, selInks: NONE, selCycles: NONE },
    style,
  );
  for (const b of st.sets ?? []) out.push({ x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) });
  // (each as far as its card closed reaches, as workflow/parts measures them)
  for (const s of st.steps ?? []) out.push({ x0: s.x, y0: s.y - CARD_H, x1: s.x + CARD_W, y1: s.y });
  return out;
}

/**
 * How far a drawing's labels reach: about each atom that has one, as far as
 * the layout sets its letters - a reagent written over a reaction's arrow,
 * Pd(PPh3)4, reaches well past its atom.
 */
export function labelBoxes(model: Model, style: DrawingStyle): Box[] {
  const opts = editorLayoutOptions(style);
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const atoms = model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a) }));
  const set = labelSetOf(opts);
  return buildTextLabels(atoms, opts, layoutBonds(model.bonds, index)).flatMap((t) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const hull of labelHulls(t, opts.fontPx, set, false)) {
      for (const q of hull) {
        x0 = Math.min(x0, t.x + q.x);
        y0 = Math.min(y0, t.y + q.y);
        x1 = Math.max(x1, t.x + q.x);
        y1 = Math.max(y1, t.y + q.y);
      }
    }
    return x0 <= x1 ? [{ x0, y0, x1, y1 }] : [];
  });
}

/**
 * The part of a drawing whose labels can reach past half a bond: its atoms
 * that may carry one - all but plain carbons - and those bonded to them,
 * which decide where its letters go. A carbon written bare is no further
 * than half a bond round its atom, which every atom is given anyway; so a
 * thousand records of a stack are not all set out in letters to be
 * measured, only their labels' atoms.
 */
export function labelledPart(model: Model): Model {
  const labelled = new Set(model.atoms.filter((a) => a.el !== "C" || a.charge || a.isotope || a.radical || a.hCount != null).map((a) => a.id));
  if (!labelled.size) return { atoms: [], bonds: [] };
  const near = new Set(labelled);
  for (const b of model.bonds) {
    if (labelled.has(b.a)) near.add(b.b);
    if (labelled.has(b.b)) near.add(b.a);
  }
  return { atoms: model.atoms.filter((a) => near.has(a.id)), bonds: model.bonds.filter((b) => near.has(b.a) && near.has(b.b)) };
}

/**
 * The room what a file brings takes, about the middle of its atoms (its
 * centroid): its atoms, its labels as far as they reach - a reagent written
 * over the arrow - its molecules in 3D, its arrow and its "+" signs, as
 * `scheme` places them about that middle.
 */
export function footOf(result: ProcessedFileResult, scheme: ImportedScheme, drawingStyle: DrawingStyle): Box {
  const pad = NOMINAL_BOND_LENGTH / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  const { x: cx, y: cy } = result.centroid;
  for (const a of result.model.atoms) take(a.x - cx - pad, a.y - cy - pad, a.x - cx + pad, a.y - cy + pad);
  for (const b of labelBoxes(labelledPart(result.model), drawingStyle)) take(b.x0 - cx, b.y0 - cy, b.x1 - cx, b.y1 - cy);
  // (its "+" signs, each a label's size, as the page measures them: ./extent)
  const plusHalf = editorLayoutOptions(drawingStyle).fontPx / 2;
  for (const p of scheme.pluses ?? []) take(p.x - plusHalf, p.y - plusHalf, p.x + plusHalf, p.y + plusHalf);
  const style = currentStyle3D();
  (result.molecules3d ?? []).forEach((m, i) => {
    const at = scheme.molecules3d?.[i]?.at;
    if (!at) return;
    const r = solidOf({ ...m, id: 0, at }, style).reach[lookOf(m)];
    take(at.x - r, at.y - r, at.x + r, at.y + r);
  });
  for (const a of scheme.arrows ?? []) {
    const hx = (a.length / 2) * Math.abs(Math.cos(a.angle));
    const hy = (a.length / 2) * Math.abs(Math.sin(a.angle));
    take(a.x - hx - pad, a.y - hy - pad, a.x + hx + pad, a.y + hy + pad);
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : { x0: -pad, y0: -pad, x1: pad, y1: pad };
}

/**
 * Where what a file brings goes, opened onto `st`'s page near `at` - the
 * middle of the view: in free space (`freePlace`), clear of all there is
 * (`pageBoxes`) by a bond's length. `scheme` places its arrow, "+" signs
 * and molecules in 3D about the middle of its atoms.
 */
export function placeOpened(st: EditorState, result: ProcessedFileResult, scheme: ImportedScheme, at: Pt, drawingStyle: DrawingStyle): Pt & { beyond: boolean } {
  const reach = 24;
  const place = freePlace(pageBoxes(st, drawingStyle), footOf(result, scheme, drawingStyle), at, NOMINAL_BOND_LENGTH, NOMINAL_BOND_LENGTH, reach);
  // (put past the edge of all there is, out of the view, perhaps: the view is to go to it)
  const beyond = Math.max(Math.abs(place.x - at.x), Math.abs(place.y - at.y)) > reach * NOMINAL_BOND_LENGTH;
  return { ...place, beyond };
}
