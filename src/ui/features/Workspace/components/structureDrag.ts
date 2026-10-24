/**
 * A structure taken out of a PDF (docs/PDF.md, *Structures picked from a
 * PDF*): pressed and dragged, Meno's own drawing of it comes off the page
 * and follows the pointer (components/StructureFlight); let go on the
 * canvas, it is a structure on the page there - read from the PDF's lines,
 * with its labels, wedges and charges, a bond as long as Meno draws one -
 * one step; let go anywhere else, it goes back. One not read whole says why,
 * and nothing is taken.
 */
import { styleOf } from "../../../../lib/chem/style";
import { DURATION } from "../../../theme/motion";
import type { EditorStore } from "../store";
import type { Model, PdfItem, PdfStructurePick } from "../store/types";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { drawingSvg, exportPxPerWorld } from "../fileActions";
import type { PageStructure } from "../utils/pageStructures";
import { overCanvasAt, putDownAt, type OnScreen } from "./wordsDrag";

/** How a store says why something could not be done: Workspace's notice, told as it comes. */
const sayers = new WeakMap<EditorStore, (why: string | null) => void>();

/** Where a store's notices are said, given as it comes - and gone, as it goes. */
export function setStructureSay(store: EditorStore, say: ((why: string | null) => void) | null): void {
  if (say) sayers.set(store, say);
  else sayers.delete(store);
}

/** Said, where a store says things: why a structure was not taken. */
export function sayWhy(store: EditorStore, why: string): void {
  sayers.get(store)?.(why);
}

/**
 * Whether a click on a structure of a PDF adds it to those picked or takes it out of them, rather than picking it alone: with
 * Ctrl (⌘ on a Mac), as everywhere in Meno - or with Shift, which does the same, structures having no range between them.
 */
export function togglesPick(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, mac?: boolean): boolean {
  return e.shiftKey || addsToSelection(e, mac);
}

/** The structures picked once `pick` is clicked: added or taken out where the click toggles (`togglesPick`), else it alone. */
export function picksAfter(was: readonly PdfStructurePick[], pick: PdfStructurePick, toggles: boolean): PdfStructurePick[] {
  if (!toggles) return [pick];
  const same = (k: PdfStructurePick) => k.page === pick.page && k.key === pick.key;
  return was.some(same) ? was.filter((k) => !same(k)) : [...was, pick];
}

/** `model` moved so that its middle - where a structure read has naught - is at `at`. */
export function movedTo(model: Model, at: { x: number; y: number }): Model {
  return { ...model, atoms: model.atoms.map((a) => ({ ...a, x: a.x + at.x, y: a.y + at.y })) };
}

/** How long a structure put down is drawn over itself on the page, and how long one let go elsewhere takes to go back, in ms. */
export const HANDOVER_MS = DURATION.base * 1000;
export const BACK_MS = DURATION.move * 1000;

/**
 * A structure of a PDF's page carried out from where the pointer pressed it
 * (`at`, in the window's pixels): Meno's drawing of it following the
 * pointer, put down on the canvas where it is let go - its middle under the
 * pointer - or gone back. One that was not read whole is not carried: why
 * is said.
 */
export function dragStructure(store: EditorStore, pdf: Pick<PdfItem, "id" | "sha256">, page: number, s: PageStructure, at: { x: number; y: number }, screen: OnScreen): void {
  if ("none" in s.read) {
    sayWhy(store, s.read.none);
    return;
  }
  const model = s.read.model;
  const st = store.getState();
  const style = styleOf(st.docStyle);
  const svg = drawingSvg(model, { aromaticEnabled: st.aromaticEnabled, aromaticRings: st.aromaticRings }, style);
  const k = exportPxPerWorld(style);
  const w = Number(/width="([\d.e+-]+)"/.exec(svg)?.[1] ?? 0) / k;
  const h = Number(/height="([\d.e+-]+)"/.exec(svg)?.[1] ?? 0) / k;
  const p = screen.at(page, s.box[0], s.box[1]);
  const q = screen.at(page, s.box[2], s.box[3]);
  const set = (now: Partial<NonNullable<ReturnType<typeof store.getState>["pdfStructureFlight"]>["now"]>) => {
    const f = store.getState().pdfStructureFlight;
    if (f) store.getState().setPdfStructureFlight({ ...f, now: { ...f.now, ...now } });
  };
  store.getState().setPdfStructureFlight({
    svg,
    w,
    h,
    from: { left: p.x, top: p.y, width: q.x - p.x, height: q.y - p.y },
    grab: at,
    start: performance.now(),
    now: { x: at.x, y: at.y, over: overCanvasAt(store, at.x, at.y), end: null },
  });
  const onMove = (e: PointerEvent) => set({ x: e.clientX, y: e.clientY, over: overCanvasAt(store, e.clientX, e.clientY) });
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
  };
  const onUp = (e: PointerEvent) => {
    stop();
    const world = putDownAt(store, pdf.id, e);
    set({ x: e.clientX, y: e.clientY, end: { to: world ? "page" : "back", start: performance.now() } });
    // (put down: its middle where the pointer let go, one step, selected - and its flight drawn over it a moment, then gone)
    if (world) store.getState().putRead(movedTo(model, world));
    window.setTimeout(() => store.getState().setPdfStructureFlight(null), world ? HANDOVER_MS : BACK_MS);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

/** Structures read, in a row - left to right, a bond apart - as one, each its atoms and bonds numbered on from the last's: the middle of all of them at naught. */
export function inRow(models: readonly Model[], gap: number): Model {
  const atoms: Model["atoms"] = [];
  const bonds: Model["bonds"] = [];
  let x = 0;
  let next = 1;
  for (const m of models) {
    if (!m.atoms.length) continue;
    const x0 = Math.min(...m.atoms.map((a) => a.x));
    const x1 = Math.max(...m.atoms.map((a) => a.x));
    const ids = new Map<number, number>();
    for (const a of m.atoms) ids.set(a.id, next++);
    for (const b of m.bonds) ids.set(-b.id - 1, next++);
    atoms.push(...m.atoms.map((a) => ({ ...a, id: ids.get(a.id)!, x: a.x - x0 + x })));
    bonds.push(...m.bonds.map((b) => ({ ...b, id: ids.get(-b.id - 1)!, a: ids.get(b.a)!, b: ids.get(b.b)! })));
    x += x1 - x0 + gap;
  }
  const xs = atoms.map((a) => a.x);
  const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  return { atoms: atoms.map((a) => ({ ...a, x: a.x - mid })), bonds };
}
