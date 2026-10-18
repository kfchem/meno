/**
 * A new PDF made from the pages of PDFs a workspace holds (docs/PDF.md,
 * *A new PDF from pages*): its pages numbered at the foot, its pages put in
 * another order, turned, some left out, or several PDFs made one. The PDFs
 * it is made from are never changed: what is made is a PDF of its own,
 * held as one opened is, and put on the page beside them
 * (src-tauri/src/pdfmake.rs).
 */
import { invoke } from "@tauri-apps/api/core";
import type { HeldPdf } from "./reader";

/** A page taken: which, of which PDF, and how far it is turned on, clockwise, in degrees. */
export type PageTake = { sha: string; page: number; turn: number };

/** How the pages of what is made are numbered: "S" before each, as supporting information is, or nothing; from `start`; at the foot's left, middle or right. */
export type PageNumbers = { prefix: "" | "S"; start: number; at: "left" | "centre" | "right" };

/** What is to be made. */
export type MakePlan = { pages: PageTake[]; numbers?: PageNumbers };

/** The PDF a plan makes, held. */
export const makePdf = (plan: MakePlan) => invoke<HeldPdf>("pdf_make", { plan });

/** A page's number as it is written: "7", or "S7". */
export const numberText = (n: PageNumbers, index: number) => `${n.prefix}${n.start + index}`;

/** A PDF's name without its ".pdf". */
const stem = (name: string) => name.replace(/\.pdf$/i, "");

/** What a PDF made with its pages numbered is called, its first page's number in it: "paper (numbered 1).pdf", "paper (numbered S1).pdf". */
export const numberedName = (name: string, n: PageNumbers) => `${stem(name)} (numbered ${numberText(n, 0)}).pdf`;

/**
 * What a PDF made of some of a PDF's pages is called: "paper (pages 3–5).pdf" (an en dash)
 * for a run of them, "paper (page 2).pdf" for one, else "paper (arranged).pdf"
 * - pages in another order, turned, or some left out here and there.
 */
export function pagesName(name: string, taken: readonly { page: number; turn: number }[], of: number): string {
  const runs = taken.every((t, i) => t.turn % 360 === 0 && (i === 0 || t.page === taken[i - 1].page + 1));
  if (runs && taken.length === 1) return `${stem(name)} (page ${taken[0].page + 1}).pdf`;
  if (runs && taken.length < of) return `${stem(name)} (pages ${taken[0].page + 1}\u2013${taken[taken.length - 1].page + 1}).pdf`;
  return `${stem(name)} (arranged).pdf`;
}

/**
 * `name`, or - where a PDF on the page is called so already - the same with
 * the first number free after it: "paper (numbered S1) 2.pdf", 3, and on.
 * So no two made from the same PDF the same way share a name.
 */
export function unusedName(name: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  for (let n = 2; ; n++) {
    const next = `${stem(name)} ${n}.pdf`;
    if (!names.has(next)) return next;
  }
}

/**
 * A PDF's name as its icon shows it: the part in brackets at its end -
 * "(pages 3–5)", "(numbered S1)" - kept on one line, its spaces and dashes
 * ones a line does not break at (the name itself as it was).
 */
export function shownUnbroken(name: string): string {
  return name.replace(/\([^()]*\)(?=[^()]*$)/, (part) => part.replace(/ /g, "\u00a0").replace(/[-\u2013]/g, "\u2011"));
}

/**
 * The pages selected after a click on one in Pages…: a plain click, that
 * page alone; Shift and a click, the run from the page clicked last (the
 * anchor) to this one, in the order they are shown; Ctrl - Cmd on a Mac -
 * and a click, this page added, or taken away if it was selected. The anchor
 * after it: the page clicked, but for a run, which keeps its anchor.
 */
export function clickedPages(
  selected: ReadonlySet<number>,
  order: readonly number[],
  anchor: number | null,
  page: number,
  how: { shift?: boolean; toggle?: boolean },
): { selected: Set<number>; anchor: number } {
  if (how.shift && anchor != null && order.includes(anchor)) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(page)].sort((x, y) => x - y);
    return { selected: new Set(order.slice(a, b + 1)), anchor };
  }
  if (how.toggle) {
    const next = new Set(selected);
    if (!next.delete(page)) next.add(page);
    return { selected: next, anchor: page };
  }
  return { selected: new Set([page]), anchor: page };
}

/** What PDFs made one are called. */
export const COMBINED_NAME = "Combined.pdf";

/**
 * PDFs in the order they are read on the page - row by row, top to bottom,
 * and along each row left to right; a row those whose tops are within
 * `row` of the first's.
 */
export function readingOrder<T extends { x: number; y: number }>(items: readonly T[], row: number): T[] {
  const left = [...items].sort((a, b) => b.y - a.y);
  const out: T[] = [];
  while (left.length) {
    const top = left[0].y;
    const inRow = left.filter((p) => top - p.y <= row).sort((a, b) => a.x - b.x);
    out.push(...inRow);
    for (const p of inRow) left.splice(left.indexOf(p), 1);
  }
  return out;
}

/** Every page of a PDF, in order, unturned. */
export const allPages = (pdf: { sha256: string; pages: readonly unknown[] }): PageTake[] => pdf.pages.map((_, page) => ({ sha: pdf.sha256, page, turn: 0 }));

/**
 * Pages from a range typed as people type them - "3-5", "1, 4, 7-9" -
 * counted from 1, of a PDF of `of` pages: each once, in the order typed;
 * none where it does not read, or names a page not there.
 */
export function pagesTyped(typed: string, of: number): number[] | null {
  const out: number[] = [];
  const parts = typed.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > of || b > of) return null;
    const step = a <= b ? 1 : -1;
    for (let p = a; p !== b + step; p += step) if (!out.includes(p - 1)) out.push(p - 1);
  }
  return out;
}
