import type { EditorStore } from "../store";
import { setMembers } from "../workflow/entries";
import { selectionScheme } from "./selectionScheme";
import { guideMove, type Held } from "./guiding";
import { shapePlace } from "../document";
import { strokeMoved } from "../../../../lib/chem/ink";

type Pt = { x: number; y: number };

/**
 * Whether the selection is being moved by hand now - dragged, or turned by
 * its handle: what moves with it follows the pointer, gliding nowhere (a
 * PDF moved by an undo glides; one dragged does not).
 */
export const selectionMoving = { active: false };

/**
 * The selection dragged, from the press at `from` (on the screen): moved by
 * as much as the pointer goes, off the grid, with the arrows, "+" signs and
 * words among it, the molecules in 3D, pictures, texts' sheets, PDFs, slides and shapes selected with it, and a
 * workflow's sets - with what they hold - and steps selected, as one undo step - one
 * move a frame, as every move lays the drawing out again. Escape lets it go:
 * all of it back where it was, as if it had not been dragged (the
 * maintainer, 2026-10-12). `toWorld` takes a point of the screen to the
 * page; `done` is told when the button comes up, and whether it moved (one
 * let go of by Escape did: it was no click).
 */
export function dragSelection(
  store: EditorStore,
  toWorld: (cx: number, cy: number) => Pt,
  from: Pt,
  done: (ev: PointerEvent, moved: boolean) => void,
) {
  const st = store.getState();
  // (a set selected takes what it holds along, selected or not)
  const sets = st.sets.filter((b) => st.selFlow.sets.has(b.id));
  const held = sets.map((b) => setMembers(st, b));
  const takenAtoms = new Set([...st.sel.atoms, ...held.flatMap((h) => h.structures.flat())]);
  const takenSolids = new Set([...st.sel3d, ...held.flatMap((h) => h.molecules)]);
  const atoms = st.model.atoms.filter((a) => takenAtoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
  // (the arrows, "+" signs and words among them, and those selected for themselves - each once)
  const among = selectionScheme(st, takenAtoms);
  const words = among.captions;
  const solids = st.molecules3d.filter((m) => takenSolids.has(m.id)).map((m) => ({ id: m.id, at: m.at }));
  const steps = st.steps.filter((s) => st.selFlow.steps.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y }));
  // (a set's pictures - a Render step's - with it)
  const heldPictures = new Set(held.flatMap((h) => h.pictures));
  const pictures = st.pictures.filter((p) => st.selPictures.has(p.id) || heldPictures.has(p.id)).map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const texts = st.texts.flatMap((t) => (t.at && st.selTexts.has(t.id) ? [{ id: t.id, x: t.at.x, y: t.at.y }] : []));
  const pdfs = st.pdfs.filter((p) => st.selPdfs.has(p.id)).map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const slides = st.slides.filter((s) => st.selSlides.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y }));
  const shapes = st.shapes.filter((s) => st.selShapes.has(s.id));
  const inks = st.inks.filter((k) => st.selInks.has(k.id));
  const p0 = toWorld(from.x, from.y);
  // (lined up with what is near as it goes: docs/PRESENTING.md, *Guides*)
  const guide = guideMove(store, toWorld, from);
  let keys: Held = { shiftKey: false, metaKey: false, ctrlKey: false };
  const gesture = `drag-${performance.now()}`;
  selectionMoving.active = true;
  let frame: number | null = null;
  let last = p0;
  const apply = () => {
    frame = null;
    const d = guide.step(last.x - p0.x, last.y - p0.y, keys);
    const dx = d.x;
    const dy = d.y;
    const by = (p: { id: number; x: number; y: number }) => ({ id: p.id, x: p.x + dx, y: p.y + dy });
    store.getState().moveAtoms(atoms.map(by), gesture, {
      arrows: among.arrows.map(by),
      pluses: among.pluses.map(by),
      captions: words.map(by),
      molecules3d: solids.map((m) => ({ id: m.id, at: { x: m.at.x + dx, y: m.at.y + dy } })),
      sets: sets.map((b) => ({ id: b.id, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
      steps: steps.map(by),
      pictures: pictures.map(by),
      texts: texts.map(by),
      pdfs: pdfs.map(by),
      slides: slides.map(by),
      shapes: shapes.map((s) => shapePlace(s, { x: dx, y: dy })),
      inks: inks.map((k) => ({ id: k.id, strokes: k.strokes.map((s) => strokeMoved(s, { x: dx, y: dy })) })),
    });
  };
  const onMove = (ev: PointerEvent) => {
    last = toWorld(ev.clientX, ev.clientY);
    keys = ev;
    if (frame == null) frame = window.requestAnimationFrame(apply);
  };
  let letGo = false;
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    // (back where it was; the button's release still ends the press)
    letGo = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("keydown", onKey, true);
    if (frame != null) window.cancelAnimationFrame(frame);
    frame = null;
    guide.end();
    selectionMoving.active = false;
    store.getState().dropMoveAtoms(gesture);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    if (letGo) return done(ev, true);
    if (frame != null) {
      window.cancelAnimationFrame(frame);
      last = toWorld(ev.clientX, ev.clientY);
      keys = ev;
      apply();
    }
    guide.end();
    selectionMoving.active = false;
    done(ev, last.x !== p0.x || last.y !== p0.y);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("keydown", onKey, true);
}
