/**
 * PDFs as a workspace's file and Meno's own record of a copy list them
 * (docs/PDF.md): each as far as it reads - its file by SHA-256, its pages'
 * sizes, its place, the page on top, whether it is spread and where its
 * pages put in places of their own lie, whether it is an icon, and where it
 * was read.
 */
import type { PdfItem } from "../store/types";
import type { PagePlace } from "../../../../lib/pdf/layout";
import { readingOf } from "../document";
import { readInkPiece } from "./inkRecord";
import { leftOut } from "./readNotes";

const SHA = /^[0-9a-f]{64}$/;

/** The PDFs a workspace's JSON lists, each as far as it reads: its file by SHA-256, its pages' sizes, its place, the page on top, where it was read. */
export function readPdfs(v: unknown): Omit<PdfItem, "id">[] {
  return readPdfsAt(v).map(({ pdf }) => pdf);
}

/** The PDFs a workspace's JSON lists, as `readPdfs` reads them - each with its place in that list (`at`): what the PDF shown is said by. Each that does not read is left out, and said. */
export function readPdfsAt(v: unknown): { pdf: Omit<PdfItem, "id">; at: number }[] {
  const out: { pdf: Omit<PdfItem, "id">; at: number }[] = [];
  const listed = Array.isArray(v) ? (v as Partial<PdfItem>[]) : [];
  for (const [at, p] of listed.entries()) {
    // (its pages' sizes, each that of the page at its place: one that does not read would put every page after it a place wrong - so the PDF does not read)
    const pages =
      Array.isArray(p?.pages) && p.pages.every((s) => Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0))
        ? (p.pages as [number, number][]).slice(0, 100_000)
        : [];
    if (typeof p?.name !== "string" || typeof p.sha256 !== "string" || !SHA.test(p.sha256) || !pages.length || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      leftOut("pdf");
      continue;
    }
    const page = Number.isInteger(p.page) && (p.page as number) >= 0 && (p.page as number) < pages.length ? (p.page as number) : 0;
    const r = p.reading as { at?: unknown; zoom?: unknown } | undefined;
    const reading = r && typeof r.at === "number" && typeof r.zoom === "number" ? readingOf({ at: r.at, zoom: r.zoom }, pages.length) : null;
    const placed = placedOf(p.placed, pages.length);
    out.push({ at, pdf: {
      name: p.name.slice(0, 260),
      sha256: p.sha256,
      pages,
      x: p.x,
      y: p.y,
      page,
      ...(p.spread === true ? { spread: true } : {}),
      ...(placed.length ? { placed } : {}),
      ...(p.icon === true ? { icon: true } : {}),
      // (the point it was laid at, where it was the workspace's own: lib/pdf/layout `pointOf`)
      ...(typeof p.point === "number" && p.point > 0 && Number.isFinite(p.point) ? { point: p.point } : {}),
      ...(reading ? { reading } : {}),
      ...(() => {
        // (writing on its pages, each piece on a page it has)
        const inks = (Array.isArray(p.inks) ? (p.inks as unknown[]) : []).flatMap((raw) => {
          const page = (raw as { page?: unknown } | null)?.page;
          const piece = Number.isInteger(page) && (page as number) >= 0 && (page as number) < pages.length ? readInkPiece(raw) : null;
          if (!piece) leftOut("pdfInk");
          return piece ? [{ ...piece, page: page as number }] : [];
        });
        return inks.length ? { inks } : {};
      })(),
    } });
  }
  return out;
}

/** A PDF's pages put in places of their own, as far as they read: each a page it has, once - its last place - in the order they were put there. */
function placedOf(v: unknown, pages: number): PagePlace[] {
  const out: PagePlace[] = [];
  for (const q of Array.isArray(v) ? (v as Partial<PagePlace>[]) : []) {
    if (!Number.isInteger(q?.page) || (q.page as number) < 0 || (q.page as number) >= pages || typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) {
      leftOut("pdfPlace");
      continue;
    }
    const page = q.page as number;
    const had = out.findIndex((o) => o.page === page);
    if (had >= 0) out.splice(had, 1);
    out.push({ page, x: q.x, y: q.y });
  }
  return out;
}
