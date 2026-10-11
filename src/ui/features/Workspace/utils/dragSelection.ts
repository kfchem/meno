import type { EditorStore } from "../store";
import { setMembers } from "../workflow/entries";
import { schemeAmong } from "./copyPaste";

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
 * words among it, the molecules in 3D, pictures, texts' sheets, PDFs and slides selected with it, and a
 * workflow's sets - with what they hold - and steps selected, as one undo step - one
 * move a frame, as every move lays the drawing out again. `toWorld` takes a
 * point of the screen to the page; `done` is told when the button comes up,
 * and whether it moved.
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
  const among = schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses, captions: st.captions }, takenAtoms);
  // (and the words selected, each as one thing)
  const words = [...among.captions, ...st.captions.filter((c) => st.selCaptions.has(c.id) && !among.captions.some((a) => a.id === c.id))];
  const solids = st.molecules3d.filter((m) => takenSolids.has(m.id)).map((m) => ({ id: m.id, at: m.at }));
  const steps = st.steps.filter((s) => st.selFlow.steps.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y }));
  const pictures = st.pictures.filter((p) => st.selPictures.has(p.id)).map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const texts = st.texts.flatMap((t) => (t.at && st.selTexts.has(t.id) ? [{ id: t.id, x: t.at.x, y: t.at.y }] : []));
  const pdfs = st.pdfs.filter((p) => st.selPdfs.has(p.id)).map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const slides = st.slides.filter((s) => st.selSlides.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y }));
  const p0 = toWorld(from.x, from.y);
  const gesture = `drag-${performance.now()}`;
  selectionMoving.active = true;
  let frame: number | null = null;
  let last = p0;
  const apply = () => {
    frame = null;
    const dx = last.x - p0.x;
    const dy = last.y - p0.y;
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
    });
  };
  const onMove = (ev: PointerEvent) => {
    last = toWorld(ev.clientX, ev.clientY);
    if (frame == null) frame = window.requestAnimationFrame(apply);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    if (frame != null) {
      window.cancelAnimationFrame(frame);
      last = toWorld(ev.clientX, ev.clientY);
      apply();
    }
    selectionMoving.active = false;
    done(ev, last.x !== p0.x || last.y !== p0.y);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
}
