/**
 * Words taken out of a PDF (docs/PDF.md, *Taking things out*): a selection
 * dragged comes off the page as Meno's own words, rising toward the viewer
 * and following the pointer; let go on the canvas, they settle there as
 * words on the page, in the drawing's type, set as their lines were and
 * keeping where they came from; let go anywhere else, they go back.
 */
import type { EditorStore } from "../store";
import type { Caption, PdfItem, PdfSelection, WordsFlight, WordsFrom } from "../store/types";
import { blockOf, marksBetween, textOf, wordBoxesBetween, type Block, type PageText } from "../../../../lib/pdf/text";
import { POINT, pointOf } from "../../../../lib/pdf/layout";
import { onPage, ordered, selectedWords } from "../utils/pdfSelection";

/** Where the canvas is, and the page under a point of the window: what words let go are put down by. */
type CanvasPlace = { canvas: () => HTMLElement | null; worldAt: (clientX: number, clientY: number) => { x: number; y: number } | null };
const places = new WeakMap<EditorStore, CanvasPlace>();

/** The canvas a store draws on, said as it comes - and gone, as it goes. */
export function setCanvasPlace(store: EditorStore, place: CanvasPlace | null): void {
  if (place) places.set(store, place);
  else places.delete(store);
}

/** Where on the page something carried out of a PDF and let go at a point of the window is put down: on the canvas, not on the PDF it came from (`home`) - else nowhere. */
export function putDownAt(store: EditorStore, home: number, e: PointerEvent): { x: number; y: number } | null {
  const onCanvas = overCanvasAt(store, e.clientX, e.clientY);
  return e.type === "pointerup" && onCanvas && store.getState().hoveredPdf !== home ? (places.get(store)?.worldAt(e.clientX, e.clientY) ?? null) : null;
}

/** Whether a point of the window is over the canvas, not what lies over it. */
export function overCanvasAt(store: EditorStore, x: number, y: number): boolean {
  const place = places.get(store);
  const over = document.elementFromPoint(x, y);
  return !!place && !!over && over === place.canvas();
}

/** Whether a point of a page, in points from its top left, lies on the words selected there. */
export function onSelected(t: PageText, sel: PdfSelection, page: number, x: number, y: number): boolean {
  const range = onPage(sel, page, t.codes.length);
  if (!range) return false;
  return marksBetween(t, range[0], range[1]).some(([x0, y0, x1, y1]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1);
}

/**
 * How words taken from lines are set on the page: as wide as those lines
 * were, at the size the page is printed, and lying in that width as they and
 * the lines about them did (lib/pdf/text `blockOf`) - from one line, as they
 * come, on one line.
 */
export function setAsTheyWere(block: Block, pages: number, point = POINT): { width?: number; align?: Caption["align"] } {
  if (block.lines < 2 && pages < 2) return {};
  return { width: (block.x1 - block.x0) * point, ...(block.align !== "center" ? { align: block.align } : {}) };
}

/** Where a point of a PDF's page lies in the window, in its pixels: where the words are drawn, on the stack or in the column. */
export type OnScreen = { at: (page: number, x: number, y: number) => { x: number; y: number }; pxPerPoint: number };

/**
 * Words selected in a PDF carried out, from where the pointer pressed them
 * (docs/PDF.md, *Taking things out*): Meno's own words come off the PDF's,
 * the PDF left as it is, and follow the pointer (components/WordsFlight).
 * Let go on the canvas, they are words on the page there, one step - set as
 * their lines were, as wide and lying as they did - where they were held;
 * anywhere else, or on the PDF they came from, they go back down onto the
 * words they were.
 */
export async function dragWords(store: EditorStore, pdf: Pick<PdfItem, "id" | "sha256" | "point">, sel: PdfSelection, at: { x: number; y: number }, screen: OnScreen): Promise<void> {
  // (the pointer followed from the first, in case it is let go before the words are read)
  let pointer = { x: at.x, y: at.y };
  let letGo: PointerEvent | null = null;
  let flight: WordsFlight | null = null;
  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (!flight) return;
    flight.now.x = e.clientX;
    flight.now.y = e.clientY;
    flight.now.over = overCanvasAt(store, e.clientX, e.clientY);
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
  };
  const onUp = (e: PointerEvent) => {
    stop();
    letGo = e;
    if (flight) land(flight, e);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);

  const words = await selectedWords(sel, pdf);
  const { from, to } = ordered(sel);
  const source: WordsFrom = { sha256: pdf.sha256, from, to };
  // the lines they were on, on their first page, and where each word lay there
  const t = await textOf(pdf.sha256, from.page);
  const range = onPage(sel, from.page, t.codes.length);
  const block = range ? blockOf(t, range[0], range[1]) : null;
  if (!words || !range || !block) {
    stop();
    return;
  }
  const set = setAsTheyWere(block, to.page - from.page + 1, pointOf(pdf));
  const first = marksBetween(t, range[0], range[1])[0];
  const corner = set.width != null ? screen.at(from.page, block.x0, block.y0) : screen.at(from.page, first[0], first[1]);
  const boxes = wordBoxesBetween(t, range[0], range[1]).map((b) => {
    if (!b) return null;
    const p = screen.at(from.page, b[0], b[1]);
    const q = screen.at(from.page, b[2], b[3]);
    return [p.x, p.y, q.x, q.y] as [number, number, number, number];
  });

  /** Where on the page words let go are put down: on the canvas, not on the PDF they came from - else nowhere, and back. */
  const putAt = (e: PointerEvent) => putDownAt(store, pdf.id, e);
  /** Let go: words on the page where they are held; or back. */
  function land(f: WordsFlight, e: PointerEvent) {
    const world = putAt(e);
    const held = f.now.held ?? { x: 0, y: 0 };
    f.now.end = { to: world ? "page" : "back", start: performance.now() };
    if (!world) return;
    const id = store.getState().addCaption(words, world.x - held.x, world.y - held.y, undefined, source, set.width, set.align);
    store.getState().setPdfWords({ ...f, landing: id });
  }

  // (let go before they were read: put down where it was let go, at once, or not at all)
  if (letGo) {
    const world = putAt(letGo);
    if (world) store.getState().addCaption(words, world.x, world.y, undefined, source, set.width, set.align);
    return;
  }
  flight = {
    text: words,
    ...set,
    boxes,
    from: { left: corner.x, top: corner.y, k: screen.pxPerPoint / pointOf(pdf) },
    grab: { x: at.x, y: at.y },
    start: performance.now(),
    now: { x: pointer.x, y: pointer.y, over: overCanvasAt(store, pointer.x, pointer.y), held: null, end: null },
    landing: null,
  };
  store.getState().setPdfWords(flight);
}
