/**
 * PDFs (docs/PDF.md), as the window reaches them: PDFium, in a process of
 * Meno's own (src-tauri/src/pdf.rs), which holds each PDF in Meno's cache by
 * its SHA-256 and draws parts of its pages.
 *
 * Pictures come back as PNGs - a page is mostly white, so a tile is a
 * quarter of its pixels' size or less, and carrying bytes to the window is
 * what takes the time, above all on Windows - and are taken apart off the
 * main thread (`createImageBitmap`), upside down, as WebGL takes them.
 * Requests wait their turn, at most a few at once, nearest first; one no
 * longer wanted before its turn is dropped.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { markHad, markNotHad } from "../doc/notHad";

/** A PDF held: what it is known by, its size, and each page's width and height, in points. */
export type HeldPdf = { sha256: string; size: number; pages: [number, number][] };

/** A PDF held now: had, and so marked as not had no more (lib/doc/notHad). */
const had = (h: HeldPdf) => (markHad(h.sha256), h);

/** A PDF on the disk, held. */
export const holdPdfPath = (path: string) => invoke<HeldPdf>("pdf_hold_path", { path }).then(had);

/** A PDF's bytes held - dropped, pasted, or kept in a workspace's file. */
export const holdPdfBytes = (bytes: Uint8Array) => invoke<HeldPdf>("pdf_hold_bytes", bytes).then(had);

/** A PDF held, as its bytes: what a workspace's file keeps. */
export async function pdfBytes(sha256: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("pdf_bytes", { sha: sha256 }));
}

/** PDFs being held, by SHA-256: drawing one waits for it (a workspace's file opened holds its PDFs as it opens). */
const holding = new Map<string, Promise<unknown>>();

/** A workspace's file, as far as its PDFs go: each kept, by its SHA-256, with its name; and its bytes. */
type KeptPdfs = { files: { sha256: string; media: string; name?: string }[]; data(sha256: string): Uint8Array | null };

/**
 * Each PDF a workspace's file keeps, held as it opens (lib/doc/menoFile) -
 * `refused` told of each that cannot be, by its name, with why: drawn, it
 * would be blank, and it is marked as not had (lib/doc/notHad) until it is
 * held from elsewhere.
 */
export function holdPdfsOf(file: KeptPdfs, refused: (name: string, why: string) => void = () => {}): void {
  if (isTauri()) holdEachKept(file, holdPdfBytes, refused, holding);
}

/** Each PDF `file` keeps held by `hold`, and each that is not - its bytes missing or refused - told to `refused`. */
export function holdEachKept(file: KeptPdfs, hold: (bytes: Uint8Array) => Promise<unknown>, refused: (name: string, why: string) => void, held: Map<string, Promise<unknown>>): void {
  for (const f of file.files) {
    if (f.media !== "application/pdf" || held.has(f.sha256)) continue;
    const name = f.name || "A PDF";
    const bytes = file.data(f.sha256);
    if (!bytes) {
      markNotHad(f.sha256);
      refused(name, "the workspace's file does not hold it whole");
      continue;
    }
    held.set(
      f.sha256,
      hold(bytes).then(
        () => markHad(f.sha256),
        (e: unknown) => {
          markNotHad(f.sha256);
          refused(name, e instanceof Error ? e.message : String(e));
        },
      ),
    );
  }
}

/** A part of a page drawn: its picture, as WebGL takes it, its size in pixels, and how long PDFium took. */
export type DrawnPart = { bitmap: ImageBitmap; w: number; h: number; ms: number };

/** What is asked to be drawn: a page's part at a scale, in pixels a point. */
export type PartAsk = { sha256: string; page: number; scale: number; x?: number; y?: number; w?: number; h?: number };

async function draw(ask: PartAsk): Promise<DrawnPart> {
  await holding.get(ask.sha256);
  const buf = await invoke<ArrayBuffer>("pdf_render", {
    sha: ask.sha256,
    page: ask.page,
    scale: ask.scale,
    x: Math.round(ask.x ?? 0),
    y: Math.round(ask.y ?? 0),
    w: ask.w != null ? Math.round(ask.w) : null,
    h: ask.h != null ? Math.round(ask.h) : null,
    packed: true,
  });
  const view = new DataView(buf);
  const w = view.getUint32(0, true);
  const h = view.getUint32(4, true);
  const ms = view.getFloat32(8, true);
  const packed = view.getUint32(12, true) === 1;
  const body = new Uint8Array(buf, 16);
  const bitmap = packed
    ? await createImageBitmap(new Blob([body], { type: "image/png" }), { imageOrientation: "flipY", premultiplyAlpha: "none" })
    : await createImageBitmap(new ImageData(new Uint8ClampedArray(body.buffer, body.byteOffset, body.byteLength), w, h), { imageOrientation: "flipY" });
  return { bitmap, w, h, ms };
}

/** How many parts are drawn at once: PDFium draws one at a time, and the rest are on their way. */
const AT_ONCE = 4;

type Waiting = { ask: PartAsk; nearness: () => number; wanted: () => boolean; resolve: (d: DrawnPart | null) => void; reject: (e: unknown) => void };
const queue: Waiting[] = [];
let running = 0;

function pump(): void {
  while (running < AT_ONCE && queue.length) {
    // (the nearest first; one no longer wanted dropped)
    queue.sort((a, b) => a.nearness() - b.nearness());
    const next = queue.shift()!;
    if (!next.wanted()) {
      next.resolve(null);
      continue;
    }
    running++;
    draw(next.ask)
      .then(next.resolve, next.reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

/**
 * A part of a page drawn, when its turn comes: `nearness` orders the
 * queue (smaller first), and one no longer `wanted` when its turn comes is
 * not drawn - it comes to null.
 */
export function drawPart(ask: PartAsk, nearness: () => number = () => 0, wanted: () => boolean = () => true): Promise<DrawnPart | null> {
  return new Promise((resolve, reject) => {
    queue.push({ ask, nearness, wanted, resolve, reject });
    pump();
  });
}

/** The most pixels a box of a page is drawn with, as a picture: past it, its resolution is lowered to fit. */
const MOST_BOX_PIXELS = 48_000_000;

/**
 * A box of a page - left, top, right, bottom, in points from its top left -
 * drawn by PDFium as a PNG at `dpi` (lowered where it would come to more
 * than `MOST_BOX_PIXELS`): its bytes, its size in pixels, and the
 * resolution it was drawn at. What a figure taken out of a PDF is.
 */
export async function boxPicture(sha256: string, page: number, box: readonly [number, number, number, number], dpi: number): Promise<{ png: Uint8Array; width: number; height: number; dpi: number }> {
  await holding.get(sha256);
  const [x0, y0, x1, y1] = box;
  const inches = ((x1 - x0) / 72) * ((y1 - y0) / 72);
  const at = Math.min(dpi, Math.sqrt(MOST_BOX_PIXELS / Math.max(inches, 1e-6)));
  const scale = at / 72;
  const buf = await invoke<ArrayBuffer>("pdf_render", {
    sha: sha256,
    page,
    scale,
    x: Math.floor(x0 * scale),
    y: Math.floor(y0 * scale),
    w: Math.max(1, Math.ceil((x1 - x0) * scale)),
    h: Math.max(1, Math.ceil((y1 - y0) * scale)),
    packed: true,
  });
  const head = new DataView(buf, 0, 16);
  return { png: new Uint8Array(buf, 16), width: head.getUint32(0, true), height: head.getUint32(4, true), dpi: at };
}

/** A link on a page: where it lies, in points from the page's top left, and where it goes - a page of the PDF and how far down it, in points; or a web page. */
export type PdfLink ={ rect: [number, number, number, number]; page?: number; y?: number | null; uri?: string };

/** Each page's links, as they have come; asked for once. */
const links = new Map<string, PdfLink[] | "asked">();

/** A page's links, if they have come - asked for, the first time, and `came` called once they have. */
export function linksOf(sha256: string, page: number, came: () => void = () => {}): PdfLink[] | null {
  const key = `${sha256}:${page}`;
  const had = links.get(key);
  if (had && had !== "asked") return had;
  if (!had && isTauri()) {
    links.set(key, "asked");
    // (once the PDF is held, if it is being held)
    void Promise.resolve(holding.get(sha256))
      .then(() => invoke<PdfLink[]>("pdf_links", { sha: sha256, page }))
      .then((l) => {
        links.set(key, Array.isArray(l) ? l : []);
        came();
      })
      .catch(() => links.set(key, []));
  }
  return null;
}

/** The link, if any, at a point of a page, in points from its top left. */
export function linkAt(l: readonly PdfLink[], x: number, y: number): PdfLink | null {
  return l.find((k) => x >= k.rect[0] && x <= k.rect[2] && y >= k.rect[1] && y <= k.rect[3]) ?? null;
}

/** Whether a web page's address is one to open in the system's browser: the web's, or mail's. */
export const isWebAddress = (uri: string) => /^(https?:\/\/|mailto:)/i.test(uri.trim());
