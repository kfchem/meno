/**
 * A box drawn on a PDF's page, taken out as a picture (docs/PDF.md,
 * *Taking things out*): carried off the page - lifting toward the viewer
 * and following the pointer (components/PictureFlight) - and let go on the
 * canvas, a picture on the page there, drawn from the PDF itself at the
 * resolution copied pictures are made at, keeping where it came from; let
 * go anywhere else, or on its own PDF, it goes back. Put on the page from
 * the box's menu, or copied, likewise drawn.
 */
import type { EditorStore } from "../store";
import type { PdfBox, PdfItem, PictureFlight, PictureToAdd } from "../store/types";
import { boxPicture } from "../../../../lib/pdf/reader";
import { pointOf } from "../../../../lib/pdf/layout";
import { holdPicture } from "../../../../lib/picture/held";
import { withDpi } from "../../../../lib/binary/png";
import { copying, writeClipboard } from "../../../../lib/clipboard";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { overCanvasAt, putDownAt, type OnScreen } from "./wordsDrag";

/** Whether a point of a page, in points from its top left, lies in a box drawn there. */
export function inBox(box: PdfBox, page: number, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = box.box;
  return box.page === page && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/** A box's picture's name: its PDF's, and its page. */
export function boxName(pdf: Pick<PdfItem, "name">, page: number): string {
  return `${pdf.name.replace(/\.pdf$/i, "")}, page ${page + 1}.png`;
}

/** A box of a PDF drawn as a picture at the resolution copied pictures are made at, held: as it goes on the page, keeping where it came from. */
export async function boxToAdd(pdf: Pick<PdfItem, "name" | "sha256">, box: PdfBox): Promise<PictureToAdd | null> {
  const drawn = await boxPicture(pdf.sha256, box.page, box.box, useAppSettings.getState().pictures.dpi);
  const held = await holdPicture(withDpi(drawn.png, drawn.dpi));
  if (!held) return null;
  return { name: boxName(pdf, box.page), sha256: held.sha256, media: "image/png", width: drawn.width, height: drawn.height, dpi: drawn.dpi, from: { sha256: pdf.sha256, page: box.page, box: box.box } };
}

/** A box of a PDF, as a picture, put on the page where `at` is - clear of what lies there - selected (its menu's *Put on the page*). */
export async function putBox(store: EditorStore, pdf: Pick<PdfItem, "name" | "sha256">, box: PdfBox, at: { x: number; y: number }): Promise<void> {
  const picture = await boxToAdd(pdf, box);
  if (picture) store.getState().addPictures([picture], at);
}

/** A box of a PDF copied as a picture, for other programs (its menu's *Copy picture*). */
export function copyBox(pdf: Pick<PdfItem, "sha256">, box: PdfBox): Promise<void> {
  return copying(async () => {
    const drawn = await boxPicture(pdf.sha256, box.page, box.box, useAppSettings.getState().pictures.dpi);
    await writeClipboard([{ flavor: "png", bytes: withDpi(drawn.png, drawn.dpi) }]);
  });
}

/**
 * A box drawn on a PDF's page carried out, from where the pointer pressed
 * it: its picture drawn at once as the screen shows it, for the flight, and
 * at the copied pictures' resolution, for the page. Let go on the canvas,
 * a picture on the page where it was held, as one step; anywhere else, or
 * on its own PDF, back.
 */
export async function dragBox(store: EditorStore, pdf: Pick<PdfItem, "id" | "name" | "sha256" | "point">, box: PdfBox, at: { x: number; y: number }, screen: OnScreen): Promise<void> {
  const corner = screen.at(box.page, box.box[0], box.box[1]);
  const flight: PictureFlight = {
    box,
    point: pointOf(pdf),
    from: { left: corner.x, top: corner.y, k: screen.pxPerPoint / pointOf(pdf) },
    grab: { x: at.x, y: at.y },
    start: performance.now(),
    now: { x: at.x, y: at.y, over: overCanvasAt(store, at.x, at.y), shown: null, end: null },
    landing: null,
  };
  store.getState().setPdfPicture(flight);
  // (as the screen shows it, at once; as it goes on the page, meanwhile)
  const dpr = window.devicePixelRatio || 1;
  void boxPicture(pdf.sha256, box.page, box.box, Math.max(36, screen.pxPerPoint * 72 * dpr))
    .then((d) => createImageBitmap(new Blob([d.png as Uint8Array<ArrayBuffer>], { type: "image/png" }), { imageOrientation: "flipY" }))
    .then((b) => (flight.now.shown = b))
    .catch(() => undefined);
  const picture = boxToAdd(pdf, box).catch(() => null);
  // (where in it the pointer holds it, in units of the page from its middle: the picture's middle goes where the pointer leaves it, less that)
  const w = (box.box[2] - box.box[0]) * pointOf(pdf);
  const h = (box.box[3] - box.box[1]) * pointOf(pdf);
  const held = { x: (at.x - corner.x) / flight.from.k - w / 2, y: h / 2 - (at.y - corner.y) / flight.from.k };
  const onMove = (e: PointerEvent) => {
    flight.now.x = e.clientX;
    flight.now.y = e.clientY;
    flight.now.over = overCanvasAt(store, e.clientX, e.clientY);
  };
  const onUp = async (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    const world = putDownAt(store, pdf.id, e);
    flight.now.end = { to: world ? "page" : "back", start: performance.now() };
    if (!world) return;
    const p = await picture;
    // (not to be drawn as a picture: back, after all)
    if (!p) {
      flight.now.end = { to: "back", start: performance.now() };
      return;
    }
    const [id] = store.getState().addPictures([p], { x: world.x - held.x, y: world.y - held.y }, true);
    if (store.getState().pdfPicture === flight) store.getState().setPdfPicture({ ...flight, landing: id ?? null });
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}
