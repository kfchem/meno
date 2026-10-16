/**
 * How far what is selected reaches on the page, as it is drawn: the
 * structures with their labels, the arrows, "+" signs and words among them
 * and the words selected, the molecules in 3D as each is turned and shown
 * now, the pictures as they are turned, the PDFs and texts' sheets with
 * their names, and the slides. What a slide is made round
 * (docs/PRESENTING.md).
 */
import { labelSetOf, type Atom as LAtom, type Bond as LBond } from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import { wordsSet } from "../../../../lib/chem/captions";
import { shapeBounds, type ShapeGeometry } from "../../../../lib/chem/shapes";
import { inkWidth, strokesBounds } from "../../../../lib/chem/ink";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";

/** The box round an arrow's line: its ends and the corners it turns at. */
function arrowBox(a: Parameters<typeof arrowPoints>[0]): { x0: number; y0: number; x1: number; y1: number } {
  const pts = arrowPoints(a);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
import { pdfRoom } from "../../../../lib/pdf/layout";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { currentStyle3D } from "../style3d";
import type { EditorState } from "../store/types";
import { lookOf, poseOf, seenBounds, solidOf } from "./molecule3d";
import { cornersOf } from "./selection";
import { sheetRoom } from "./textSheets";
import { selectionScheme } from "./selectionScheme";
import { boxOf } from "../presenting/slides";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";

export type Box = { x0: number; y0: number; x1: number; y1: number };

type Selected = Pick<
  EditorState,
  "model" | "sel" | "sel3d" | "selCaptions" | "selArrows" | "selPluses" | "selPictures" | "selPdfs" | "selTexts" | "selSlides" | "selShapes" | "selInks" | "arrows" | "pluses" | "captions" | "molecules3d" | "turns3d" | "frames3d" | "pictures" | "pdfs" | "texts" | "slides" | "shapes" | "inks"
> &
  Partial<Pick<EditorState, "selCycles" | "cycles">>;

/** The box round what is selected, as it is drawn - or null with nothing selected. `zoom`: the view's (labels' sizes do not depend on it). */
export function selectedBox(st: Selected, style: DrawingStyle, zoom = 1, eyeHeight?: number, frames = false): Box | null {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const take = (x0: number, y0: number, x1: number, y1: number) => {
    b.x0 = Math.min(b.x0, x0);
    b.y0 = Math.min(b.y0, y0);
    b.x1 = Math.max(b.x1, x1);
    b.y1 = Math.max(b.y1, y1);
  };
  const opts = editorLayoutOptions(style);
  // the structures selected, with what their labels reach
  const atoms = st.model.atoms.filter((a) => st.sel.atoms.has(a.id));
  if (atoms.length) {
    const index = new Map<number, number>();
    const la: LAtom[] = atoms.map((a, i) => {
      index.set(a.id, i);
      return { id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a), ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}) };
    });
    const lb: LBond[] = layoutBonds(
      st.model.bonds.filter((x) => index.has(x.a) && index.has(x.b)),
      index,
    );
    const r = layoutByStructure(la, lb, opts, zoom, structureLayouts()).bounds;
    take(r.min.x, r.min.y, r.max.x, r.max.y);
  }
  // the arrows, "+" signs and words among them, and those selected for themselves
  const among = selectionScheme(st);
  for (const a of among.arrows) {
    const b = arrowBox(a);
    take(b.x0, b.y0, b.x1, b.y1);
  }
  for (const p of among.pluses) take(p.x - opts.fontPx / 2, p.y - opts.fontPx / 2, p.x + opts.fontPx / 2, p.y + opts.fontPx / 2);
  for (const c of among.captions) {
    // (at their own size, their letters as they are marked)
    const set = wordsSet(c, opts, labelSetOf(opts));
    take(c.x - set.halfW, c.y - set.halfH, c.x + set.halfW, c.y + set.halfH);
  }
  // the molecules in 3D, as each is turned and shown now
  const style3d = currentStyle3D();
  for (const m of st.molecules3d) {
    if (!st.sel3d.has(m.id)) continue;
    const pose = poseOf(m, solidOf(m, style3d), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]);
    const s = seenBounds(pose, eyeHeight == null ? undefined : { x: m.at.x, y: m.at.y, z: eyeHeight });
    take(s.minX, s.minY, s.maxX, s.maxY);
  }
  for (const q of st.pictures.filter((p) => st.selPictures.has(p.id)).flatMap(cornersOf)) take(q.x, q.y, q.x, q.y);
  for (const p of st.pdfs) if (st.selPdfs.has(p.id)) {
    const r = pdfRoom(p);
    take(r.x0, r.y0, r.x1, r.y1);
  }
  for (const t of st.texts) if (st.selTexts.has(t.id)) {
    const r = sheetRoom(t);
    if (r) take(r.x0, r.y0, r.x1, r.y1);
  }
  for (const s of st.slides) if (st.selSlides.has(s.id)) {
    const r = boxOf(s);
    take(r.x0, r.y0, r.x1, r.y1);
  }
  for (const s of st.shapes) if (st.selShapes.has(s.id)) {
    // (for guides, its frame: what lines up and is sized)
    const r = frames ? shapeFrame(s) : shapeBounds(s, opts.pointPx ?? 0);
    take(r.x0, r.y0, r.x1, r.y1);
  }
  for (const k of st.inks) if (st.selInks.has(k.id)) {
    const r = strokesBounds(k.strokes, inkWidth(k, opts.pointPx ?? 0) / 2);
    if (r) take(r.x0, r.y0, r.x1, r.y1);
  }
  // (a catalytic cycle: its circle)
  for (const c of st.cycles ?? []) if (st.selCycles?.has(c.id)) take(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
  return Number.isFinite(b.x0) && Number.isFinite(b.y0) ? b : null;
}

/**
 * Boxes round what is on the page and not selected, each as it is drawn -
 * each structure, each reaction arrow and "+" and words, each molecule in
 * 3D, picture, PDF, text's sheet, slide and shape: what something moved lines up
 * with (presenting/guides). A structure's box is its atoms', and half a
 * label more round those that show one.
 */
export function besidesBoxes(st: Selected, style: DrawingStyle, eyeHeight?: number, leave?: { caption?: number }): Box[] {
  const out: Box[] = [];
  const opts = editorLayoutOptions(style);
  const pad = opts.fontPx * 0.45;
  // the structures not selected: each its own, its atoms joined by their bonds
  const free = st.model.atoms.filter((a) => !st.sel.atoms.has(a.id));
  if (free.length) {
    const root = new Map(free.map((a) => [a.id, a.id]));
    const find = (id: number): number => {
      let r = id;
      while (root.get(r) !== r) r = root.get(r)!;
      root.set(id, r);
      return r;
    };
    for (const b of st.model.bonds) if (root.has(b.a) && root.has(b.b)) root.set(find(b.a), find(b.b));
    const boxes = new Map<number, Box>();
    for (const a of free) {
      const r = a.el === "C" ? 0 : pad;
      const k = find(a.id);
      const b = boxes.get(k);
      boxes.set(k, b ? { x0: Math.min(b.x0, a.x - r), y0: Math.min(b.y0, a.y - r), x1: Math.max(b.x1, a.x + r), y1: Math.max(b.y1, a.y + r) } : { x0: a.x - r, y0: a.y - r, x1: a.x + r, y1: a.y + r });
    }
    out.push(...boxes.values());
  }
  // the arrows, "+" signs and words not among what is selected, nor selected themselves
  const among = selectionScheme(st);
  const taken = (xs: readonly { id: number }[], id: number) => xs.some((x) => x.id === id);
  for (const a of st.arrows) {
    if (taken(among.arrows, a.id)) continue;
    out.push(arrowBox(a));
  }
  for (const p of st.pluses) if (!taken(among.pluses, p.id)) out.push({ x0: p.x - opts.fontPx / 2, y0: p.y - opts.fontPx / 2, x1: p.x + opts.fontPx / 2, y1: p.y + opts.fontPx / 2 });
  for (const c of st.captions) {
    if (taken(among.captions, c.id) || c.id === leave?.caption) continue;
    const set = wordsSet(c, opts, labelSetOf(opts));
    out.push({ x0: c.x - set.halfW, y0: c.y - set.halfH, x1: c.x + set.halfW, y1: c.y + set.halfH });
  }
  const style3d = currentStyle3D();
  for (const m of st.molecules3d) {
    if (st.sel3d.has(m.id)) continue;
    const pose = poseOf(m, solidOf(m, style3d), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]);
    const s = seenBounds(pose, eyeHeight == null ? undefined : { x: m.at.x, y: m.at.y, z: eyeHeight });
    out.push({ x0: s.minX, y0: s.minY, x1: s.maxX, y1: s.maxY });
  }
  for (const p of st.pictures) {
    if (st.selPictures.has(p.id)) continue;
    const q = cornersOf(p);
    out.push({ x0: Math.min(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), x1: Math.max(...q.map((v) => v.x)), y1: Math.max(...q.map((v) => v.y)) });
  }
  for (const p of st.pdfs) if (!st.selPdfs.has(p.id)) out.push(pdfRoom(p));
  for (const t of st.texts) {
    if (st.selTexts.has(t.id)) continue;
    const r = sheetRoom(t);
    if (r) out.push(r);
  }
  for (const s of st.slides) if (!st.selSlides.has(s.id)) out.push(boxOf(s));
  // and the shapes, all each draws (docs/PRESENTING.md, *Shapes*)
  for (const s of st.shapes) if (!st.selShapes.has(s.id)) out.push(shapeFrame(s));
  // and writing by hand, each piece
  for (const k of st.inks) {
    if (st.selInks.has(k.id)) continue;
    const r = strokesBounds(k.strokes, inkWidth(k, opts.pointPx ?? 0) / 2);
    if (r) out.push(r);
  }
  return out;
}

/**
 * A shape's frame, as guides line it up and size it: the box its line runs
 * round - the middle of its line - or a line's or an arrow's ends; a
 * callout's tail and an arrow's heads not counted. Shapes line up by it as
 * drawn, whatever their lines' weights.
 */
export function shapeFrame(s: ShapeGeometry): Box {
  return { x0: Math.min(s.x0, s.x1), y0: Math.min(s.y0, s.y1), x1: Math.max(s.x0, s.x1), y1: Math.max(s.y0, s.y1) };
}
