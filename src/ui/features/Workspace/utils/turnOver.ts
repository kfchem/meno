/**
 * A selection turned over (docs/EDITOR-2D.md, *What is done to a
 * selection*): about the middle of all it moves - which so stays where it
 * was - and with it the pictures, texts' sheets, PDFs, slides, shapes,
 * writing by hand and molecules in 3D selected with its atoms, each
 * mirrored by its place and drawn as it was: a picture's image, a PDF's
 * pages and a molecule in 3D are not mirrored, nor are words, nor writing
 * (each piece carried by its middle, written as it was); a picture's tilt
 * is, as its frame's.
 */
import type { EditorState } from "../store/types";
import { shapePlace, type MarkPlaces } from "../document";
import { isBox, middleOf as shapeMiddle, moved as shapeMoved } from "../../../../lib/chem/shapes";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import { pdfRoom } from "../../../../lib/pdf/layout";
import { sheetOf } from "./textSheets";
import { cornersOf } from "./selection";
import { strokeMoved, strokesBounds } from "../../../../lib/chem/ink";

type Pt = { x: number; y: number };
type Axis = "vertical" | "horizontal";

/** The arrows, "+" signs and words that go with the selection's atoms. */
type Scheme = { arrows: readonly Parameters<typeof arrowPoints>[0][]; pluses: readonly Pt[]; captions: readonly Pt[] };

/** Where a point goes, turned over about the line through `about`: upright (`vertical`: left for right) or level (`horizontal`: up for down). */
export function mirroredAbout(about: Pt, axis: Axis): (p: Pt) => Pt {
  return (p) => ({ x: axis === "vertical" ? 2 * about.x - p.x : p.x, y: axis === "horizontal" ? 2 * about.y - p.y : p.y });
}

/** The texts' sheets selected with the rest: each one's middle, and how large it is (its place is its top left). */
function sheetsOf(st: EditorState): { id: number; x: number; y: number; w: number; h: number }[] {
  return st.texts.flatMap((t) => {
    if (!t.at || !st.selTexts.has(t.id)) return [];
    const s = sheetOf(t.text, t.name);
    return [{ id: t.id, x: t.at.x + s.w / 2, y: t.at.y - s.h / 2, w: s.w, h: s.h }];
  });
}

/**
 * The middle of all a turn-over moves: the selected atoms, the arrows, "+"
 * signs and words that go with them (`scheme`), and the pictures, texts'
 * sheets, PDFs, slides, shapes and molecules in 3D selected with them -
 * none, with no atom selected.
 */
export function turnOverMiddle(st: EditorState, scheme: Scheme): Pt | null {
  const pts: Pt[] = st.model.atoms.filter((a) => st.sel.atoms.has(a.id));
  if (!pts.length) return null;
  for (const a of scheme.arrows) pts.push(...arrowPoints(a));
  pts.push(...scheme.pluses, ...scheme.captions);
  for (const p of st.pictures) if (st.selPictures.has(p.id)) pts.push(...cornersOf(p));
  for (const s of sheetsOf(st)) pts.push({ x: s.x - s.w / 2, y: s.y - s.h / 2 }, { x: s.x + s.w / 2, y: s.y + s.h / 2 });
  for (const p of st.pdfs) {
    if (!st.selPdfs.has(p.id)) continue;
    const r = pdfRoom(p);
    pts.push({ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 });
  }
  for (const s of st.slides) if (st.selSlides.has(s.id)) pts.push({ x: s.x - s.w / 2, y: s.y - s.h / 2 }, { x: s.x + s.w / 2, y: s.y + s.h / 2 });
  for (const s of st.shapes) if (st.selShapes.has(s.id)) pts.push({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }, ...(s.tail ? [s.tail] : []));
  for (const m of st.molecules3d) if (st.sel3d.has(m.id)) pts.push(m.at);
  for (const k of st.inks) {
    const b = st.selInks.has(k.id) ? strokesBounds(k.strokes, 0) : null;
    if (b) pts.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 });
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * Where the pictures, texts' sheets, PDFs, slides, shapes and molecules in
 * 3D selected with the atoms go, turned over about `about`: each by its
 * middle - a line's and an arrow's ends each mirrored, a box's middle and
 * its tail - a picture's tilt the other way.
 */
export function turnedOverRest(st: EditorState, axis: Axis, about: Pt): Pick<MarkPlaces, "pictures" | "texts" | "pdfs" | "slides" | "shapes" | "inks" | "molecules3d"> {
  const m = mirroredAbout(about, axis);
  const out: Pick<MarkPlaces, "pictures" | "texts" | "pdfs" | "slides" | "shapes" | "inks" | "molecules3d"> = {};
  const pictures = st.pictures.filter((p) => st.selPictures.has(p.id));
  if (pictures.length) out.pictures = pictures.map((p) => ({ id: p.id, ...m(p), turn: -(p.turn ?? 0) }));
  const sheets = sheetsOf(st);
  if (sheets.length)
    out.texts = sheets.map((s) => {
      const q = m(s);
      return { id: s.id, x: q.x - s.w / 2, y: q.y + s.h / 2 };
    });
  const pdfs = st.pdfs.filter((p) => st.selPdfs.has(p.id));
  if (pdfs.length) out.pdfs = pdfs.map((p) => ({ id: p.id, ...m(p) }));
  const slides = st.slides.filter((s) => st.selSlides.has(s.id));
  if (slides.length) out.slides = slides.map((s) => ({ id: s.id, ...m(s) }));
  const shapes = st.shapes.filter((s) => st.selShapes.has(s.id));
  if (shapes.length)
    out.shapes = shapes.map((s) => {
      if (!isBox(s.kind)) {
        const a = m({ x: s.x0, y: s.y0 });
        const b = m({ x: s.x1, y: s.y1 });
        return shapePlace({ ...s, x0: a.x, y0: a.y, x1: b.x, y1: b.y }, { x: 0, y: 0 });
      }
      const was = shapeMiddle(s);
      const to = m(was);
      const placed = shapeMoved(s, { x: to.x - was.x, y: to.y - was.y });
      return shapePlace({ ...placed, ...(s.tail ? { tail: m(s.tail) } : {}) }, { x: 0, y: 0 });
    });
  // (writing by hand: each piece by its middle, its strokes as they were written)
  const inks = st.inks.flatMap((k) => {
    const b = st.selInks.has(k.id) ? strokesBounds(k.strokes, 0) : null;
    if (!b) return [];
    const was = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    const to = m(was);
    return [{ id: k.id, strokes: k.strokes.map((s) => strokeMoved(s, { x: to.x - was.x, y: to.y - was.y })) }];
  });
  if (inks.length) out.inks = inks;
  const molecules = st.molecules3d.filter((x) => st.sel3d.has(x.id));
  if (molecules.length) out.molecules3d = molecules.map((x) => ({ id: x.id, at: { ...x.at, ...m(x.at) } }));
  return out;
}
