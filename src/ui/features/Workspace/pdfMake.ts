/**
 * What the workspace does with a new PDF made from PDFs it holds (docs/PDF.md,
 * *A new PDF from pages*; lib/pdf/make): put it on the page beside them,
 * make several one, and write a PDF held to a file.
 */
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { COMBINED_NAME, allPages, makePdf, readingOrder } from "../../../lib/pdf/make";
import { pdfRoom } from "../../../lib/pdf/layout";
import { pdfBytes, type HeldPdf } from "../../../lib/pdf/reader";
import type { EditorState, PdfItem } from "./store/types";

/** A new PDF put on the page beside `beside`, clear of the PDFs there - one step, which an undo takes back. */
export function putBeside(st: Pick<EditorState, "addPdfs">, held: HeldPdf, name: string, beside: Pick<PdfItem, "x" | "y">): void {
  st.addPdfs([{ name, sha256: held.sha256, pages: held.pages }], { x: beside.x, y: beside.y });
}

/** PDFs made one, in the order they are read on the page - a row those whose tops are within half the first's height - each one's pages in order. */
export async function combined(pdfs: readonly PdfItem[]): Promise<{ held: HeldPdf; name: string; first: PdfItem }> {
  const tops = pdfs.map((p) => ({ p, room: pdfRoom(p) }));
  const row = Math.max(...tops.map((t) => t.room.y1 - t.room.y0)) / 2;
  const ordered = readingOrder(tops.map((t) => ({ ...t, x: t.room.x0, y: t.room.y1 })), row).map((t) => t.p);
  const held = await makePdf({ pages: ordered.flatMap(allPages) });
  return { held, name: COMBINED_NAME, first: ordered[0] };
}

/** A PDF held written to a file the user picks: its bytes as they are. */
export async function savePdfFile(p: Pick<PdfItem, "name" | "sha256">): Promise<void> {
  const picked = await saveDialog({ title: "Save as PDF", defaultPath: p.name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!picked) return;
  const path = picked.toLowerCase().endsWith(".pdf") ? picked : `${picked}.pdf`;
  await writeFile(path, await pdfBytes(p.sha256));
}
