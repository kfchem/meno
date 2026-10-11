/**
 * How far what is selected reaches on the page, as it is drawn: the
 * structures with their labels, the arrows, "+" signs and words among them
 * and the words selected, the molecules in 3D as each is turned and shown
 * now, the pictures as they are turned, the PDFs and texts' sheets with
 * their names, and the slides. What a slide is made round
 * (docs/PRESENTING.md).
 */
import { labelSetOf, layoutMolecule, type Atom as LAtom, type Bond as LBond } from "../../../../lib/chem/layout2d";
import { chemistry } from "../../../../lib/chem/molecule";
import { wordsSet } from "../../../../lib/chem/captions";
import { arrowEnds } from "../../../../lib/chem/reactionScheme";
import { pdfRoom } from "../../../../lib/pdf/layout";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { currentStyle3D } from "../style3d";
import type { EditorState } from "../store/types";
import { lookOf, poseOf, seenBounds, solidOf } from "./molecule3d";
import { cornersOf } from "./selection";
import { sheetRoom } from "./textSheets";
import { schemeAmong } from "./copyPaste";
import { boxOf } from "../presenting/slides";

export type Box = { x0: number; y0: number; x1: number; y1: number };

type Selected = Pick<
  EditorState,
  "model" | "sel" | "sel3d" | "selCaptions" | "selPictures" | "selPdfs" | "selTexts" | "selSlides" | "arrows" | "pluses" | "captions" | "molecules3d" | "turns3d" | "frames3d" | "pictures" | "pdfs" | "texts" | "slides"
>;

/** The box round what is selected, as it is drawn - or null with nothing selected. `zoom`: the view's (labels' sizes do not depend on it). */
export function selectedBox(st: Selected, style: DrawingStyle, zoom = 1, eyeHeight?: number): Box | null {
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
    const r = layoutMolecule(la, lb, opts, zoom).bounds;
    take(r.min.x, r.min.y, r.max.x, r.max.y);
  }
  // the arrows, "+" signs and words among them, and the words selected
  const among = schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses, captions: st.captions }, st.sel.atoms);
  for (const a of among.arrows) {
    const e = arrowEnds(a);
    take(Math.min(e.from.x, e.to.x), Math.min(e.from.y, e.to.y), Math.max(e.from.x, e.to.x), Math.max(e.from.y, e.to.y));
  }
  for (const p of among.pluses) take(p.x - opts.fontPx / 2, p.y - opts.fontPx / 2, p.x + opts.fontPx / 2, p.y + opts.fontPx / 2);
  const words = [...among.captions, ...st.captions.filter((c) => st.selCaptions.has(c.id) && !among.captions.some((x) => x.id === c.id))];
  for (const c of words) {
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
  return Number.isFinite(b.x0) && Number.isFinite(b.y0) ? b : null;
}
