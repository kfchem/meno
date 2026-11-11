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

/** The document the printer sees: nothing of Meno's, but the pictures, a page each, as large as the paper allows. */
export const PRINT_CSS = `
#meno-print { display: none; }
@media print {
  @page { margin: 0; }
  body > *:not(#meno-print) { display: none !important; }
  html, body { margin: 0; padding: 0; background: #fff; }
  #meno-print { display: block; }
  #meno-print img { display: block; width: 100vw; height: 100vh; object-fit: contain; break-after: page; page-break-after: always; }
  #meno-print img:last-child { break-after: auto; page-break-after: auto; }
}
`;

/** What printing needs from the window - each one a part that can be put in its place in a test. */
export type PrintDeps = {
  /** What the PDF's author allows. */
  allowed: (sha256: string) => Promise<Printing>;
  /** A page drawn at `dpi`: its PNG. */
  draw: (sha256: string, page: number, box: [number, number, number, number], dpi: number) => Promise<{ png: Uint8Array; width: number; height: number; dpi: number }>;
  /** A picture held by an address that is let go of with `release`. */
  hold: (png: Uint8Array) => string;
  release: (url: string) => void;
  /** The pictures laid out for the printer, the dialog asked for, and the pictures taken away once it is done with. */
  show: (urls: string[]) => Promise<void>;
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
    await deps.show(urls);
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

/** The print document as the window has it: put in the page, printed - the system's dialog - and taken out once the dialog is done with. */
async function showToPrinter(urls: string[]): Promise<void> {
  const sheet = document.createElement("div");
  sheet.id = "meno-print";
  const style = document.createElement("style");
  style.textContent = PRINT_CSS;
  sheet.append(style);
  const images = urls.map((url) => {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    sheet.append(img);
    return img;
  });
  document.body.append(sheet);
  try {
    // (decoded before the dialog asks for them, or a page may print blank)
    await Promise.all(images.map((img) => img.decode().catch(() => {})));
    await new Promise<void>((done) => {
      const finished = () => {
        window.removeEventListener("afterprint", finished);
        window.clearTimeout(limit);
        done();
      };
      window.addEventListener("afterprint", finished);
      // (a window that prints without waiting, as WebKit's does, is waited on until its dialog has gone)
      const limit = window.setTimeout(finished, MOST_WAIT_MS);
      window.print();
    });
  } finally {
    sheet.remove();
  }
}

/** The longest the printer's pictures are kept for a window that never says it has printed. */
const MOST_WAIT_MS = 10 * 60 * 1000;

const real: PrintDeps = {
  allowed: printingOf,
  draw: boxPicture,
  hold: (png) => URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" })),
  release: (url) => URL.revokeObjectURL(url),
  show: showToPrinter,
};
