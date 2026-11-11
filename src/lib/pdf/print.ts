/**
 * Printing a PDF (docs/PDF.md, *Printing*): each page drawn by PDFium at
 * `PRINT_DPI`, one picture a page, laid out in a document of their own that
 * only the printer sees, and the webview's own print - so that the system's
 * print dialog is the one that asks where, how many copies, which pages. A
 * PDF whose author does not allow printing is refused, in words; one that
 * allows it only in a quality that cannot give a faithful copy is drawn at
 * `LOW_DPI`. Never worked around.
 */
import { invoke } from "@tauri-apps/api/core";
import { boxPicture } from "./reader";

/** What an author allows of printing a PDF: any quality, only a low one, or none (src-tauri/src/pdf.rs `printing_of`). */
export type Printing = "full" | "low" | "no";

/** Dots an inch a page is drawn at to be printed. */
export const PRINT_DPI = 300;
/** Where the PDF allows printing only in a quality from which a faithful copy cannot be made. */
export const LOW_DPI = 150;
/** The most pixels along a side the reader draws at once (src-tauri/src/pdf.rs `render`). */
const MOST_SIDE = 8192;

/** Said where printing is refused, and beside the command that cannot be used. */
export const NOT_ALLOWED = "Its author does not allow printing";

/** The tip of the Print button: what it does, or - where the author does not allow printing - why it does not. */
export const printTip = (printing: Printing | undefined, key: string): string => (printing === "no" ? `${NOT_ALLOWED}.` : `Print… (${key})`);

/** What the PDF's author allows of printing it. */
export const printingOf = (sha256: string) => invoke<Printing>("pdf_printing", { sha: sha256 });

/** What each PDF held was found to allow, once asked: what the menu and the column show before anyone presses Print. */
const known = new Map<string, Printing>();

/** What a PDF's author allows, as it was found; none until `learnPrinting` has. */
export const printingKnown = (sha256: string): Printing | undefined => known.get(sha256);

/** What a PDF's author allows, asked of the reader once for each PDF. */
export async function learnPrinting(sha256: string): Promise<Printing> {
  const had = known.get(sha256);
  if (had) return had;
  const found = await printingOf(sha256);
  known.set(sha256, found);
  return found;
}

/** A page's size in points, from the PDF's, and the dots an inch it is printed at: the resolution asked, lowered for a page so large that a side would come to more than the reader draws. */
export function printDpi(printing: "full" | "low", page: readonly [number, number]): number {
  const asked = printing === "low" ? LOW_DPI : PRINT_DPI;
  const longest = Math.max(page[0], page[1], 1);
  return Math.min(asked, ((MOST_SIDE - 1) * 72) / longest);
}

/**
 * The document the printer sees: nothing of Meno's, but the pictures, a page
 * each, as large as the paper allows. The window's own `html` and `body` are
 * the height of the window with what is beyond it cut off, which would print
 * one page and no more: for the printer they grow to hold every picture.
 */
export const PRINT_CSS = `
#meno-print { display: none; }
@media print {
  @page { margin: 0; }
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; margin: 0; padding: 0; background: #fff; }
  body > *:not(#meno-print) { display: none !important; }
  #meno-print { display: block; position: static; }
  #meno-print img { display: block; width: 100%; height: auto; max-height: 100vh; object-fit: contain; break-after: page; page-break-after: always; }
  #meno-print img:last-child { break-after: auto; page-break-after: auto; }
}
`;

/** A page's size as the paper it asks for, in points (a PDF's size, so that letter stays letter and A4 stays A4 where the printer takes the page's size). */
export type PageSize = readonly [number, number];

/** What names a size among the print document's pages. */
const sizeName = (size: PageSize) => `p${Math.round(size[0])}x${Math.round(size[1])}`;

/**
 * Each page's own paper size, as CSS names it: a named page for each size the
 * PDF has, and the picture that is a page of it put on that page. Where the
 * print engine does not take a page's size from the document, the paper is the
 * dialog's and the pictures are fitted to it.
 */
export function pageSizeCss(sizes: readonly PageSize[]): string {
  const distinct = [...new Set(sizes.map(sizeName))];
  const rules = distinct.map((name) => {
    const [w, h] = name.slice(1).split("x");
    return `  @page ${name} { size: ${w}pt ${h}pt; margin: 0; }\n  #meno-print img.${name} { page: ${name}; }`;
  });
  return rules.length ? `@media print {\n${rules.join("\n")}\n}\n` : "";
}

/** What printing needs from the window - each one a part that can be put in its place in a test. */
export type PrintDeps = {
  /** What the PDF's author allows. */
  allowed: (sha256: string) => Promise<Printing>;
  /** A page drawn at `dpi`: its PNG. */
  draw: (sha256: string, page: number, box: [number, number, number, number], dpi: number) => Promise<{ png: Uint8Array; width: number; height: number; dpi: number }>;
  /** A picture held by an address that is let go of with `release`. */
  hold: (png: Uint8Array) => string;
  release: (url: string) => void;
  /** The pictures laid out for the printer, and the window's print dialog asked for (the pictures are let go of through `release`, which the window keeps them for while the dialog may still use them). */
  show: (urls: string[], sizes: readonly PageSize[]) => Promise<void>;
};

/** A page printed, and how it was drawn: what the test of the print document reads. */
export type Printed = { pages: number; dpi: number[] };

/**
 * A PDF's pages printed: each drawn at its resolution, held as an address,
 * and - all of them, or none - shown to the printer; every address let go of
 * after, whether it printed or not. A PDF that may not be printed is refused
 * before anything is drawn.
 */
export async function printPdf(sha256: string, pages: readonly (readonly [number, number])[], deps: PrintDeps = real): Promise<Printed> {
  const allowed = await deps.allowed(sha256);
  if (allowed === "no") throw new Error(NOT_ALLOWED);
  const urls: string[] = [];
  const dpi: number[] = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      const [w, h] = pages[i];
      const picture = await deps.draw(sha256, i, [0, 0, w, h], printDpi(allowed, pages[i]));
      dpi.push(picture.dpi);
      urls.push(deps.hold(picture.png));
    }
    await deps.show(urls, pages);
    return { pages: urls.length, dpi };
  } finally {
    for (const url of urls) deps.release(url);
  }
}

/** PDFs being printed now: a second Print for one waits for the first. */
const printing = new Set<string>();

/**
 * Prints a PDF, as the Print command does: nothing said where it printed or
 * was cancelled; where it could not - not allowed, a page that could not be
 * drawn - the words to say.
 */
export async function printed(sha256: string, pages: readonly (readonly [number, number])[], deps: PrintDeps = real): Promise<string | null> {
  if (printing.has(sha256)) return null;
  printing.add(sha256);
  try {
    await printPdf(sha256, pages, deps);
    return null;
  } catch (e) {
    return e instanceof Error && e.message === NOT_ALLOWED ? `${NOT_ALLOWED}.` : `Printing failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    printing.delete(sha256);
  }
}

/** The window asked to print what it shows: its own print dialog, as WebKit's `window.print()` shows none in the app (src-tauri/src/pdf.rs `pdf_print_window`). */
export const askWindowToPrint = () => invoke<void>("pdf_print_window");

/** Takes the print document away, and lets go of its pictures: the one on the window, if there is one. */
let retire: (() => void) | null = null;

/** Pictures printed, held as addresses until the print document is taken away. */
const kept = new Set<string>();

/**
 * The print document as the window has it: put in the page, and the window's
 * own print dialog asked for. The dialog goes on after this returns (the
 * system's is not waited on, nor does it say when it has gone), so the
 * pictures stay until the window says it has printed, the next print takes
 * them away, or a long wait is over.
 */
export async function showToPrinter(urls: string[], sizes: readonly PageSize[], ask: () => Promise<void> = askWindowToPrint): Promise<void> {
  retire?.();
  const sheet = document.createElement("div");
  sheet.id = "meno-print";
  const style = document.createElement("style");
  style.textContent = PRINT_CSS + pageSizeCss(sizes);
  sheet.append(style);
  const images = urls.map((url, i) => {
    const img = document.createElement("img");
    img.src = url;
    img.className = sizeName(sizes[i]);
    img.alt = "";
    sheet.append(img);
    return img;
  });
  document.body.append(sheet);
  const finished = () => {
    window.removeEventListener("afterprint", finished);
    window.clearTimeout(limit);
    sheet.remove();
    for (const url of kept) URL.revokeObjectURL(url);
    kept.clear();
    if (retire === finished) retire = null;
  };
  const limit = window.setTimeout(finished, MOST_WAIT_MS);
  window.addEventListener("afterprint", finished);
  retire = finished;
  try {
    // (decoded before the dialog asks for them, or a page may print blank)
    await Promise.all(images.map((img) => img.decode().catch(() => {})));
    await ask();
  } catch (e) {
    finished();
    throw e;
  }
}

/** The longest the printer's pictures are kept for a window that never says it has printed. */
const MOST_WAIT_MS = 10 * 60 * 1000;

const real: PrintDeps = {
  allowed: printingOf,
  draw: boxPicture,
  hold: (png) => URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" })),
  // (kept while the print document is on the window: the dialog draws from it after this has returned)
  release: (url) => (retire ? void kept.add(url) : URL.revokeObjectURL(url)),
  show: showToPrinter,
};
