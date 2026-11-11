/**
 * PDFs opened go onto the page of the workspace in front (docs/PDF.md), as
 * texts go into its column (./texts): each canvas that is a tab's own says
 * how it takes them, while it is there, and the app asks the one in front.
 * Where none is in front, a canvas opens for them.
 */
import type { HeldPdf } from "../../lib/pdf/reader";

/** A PDF opened: its name, and what Meno holds it by. */
export type OpenedPdf = HeldPdf & { name: string };

const takers = new Map<string, (pdfs: OpenedPdf[]) => void>();

/** Sets how tab `id` takes PDFs; the function returned takes it away again. */
export function setPdfTaker(id: string, take: (pdfs: OpenedPdf[]) => void): () => void {
  takers.set(id, take);
  return () => {
    if (takers.get(id) === take) takers.delete(id);
  };
}

/** How tab `id` takes PDFs, where it takes them. */
export function pdfTakerOf(id: string): ((pdfs: OpenedPdf[]) => void) | undefined {
  return takers.get(id);
}

/**
 * PDFs opened where no workspace takes them (App `openPdfs`): a workspace tab of its own, made for them - named for the first, the
 * PDFs on its page as it is made. They are where its document starts: nothing to undo, nothing unsaved, no ask as it is closed,
 * until the chemist changes anything. Save suggests the first PDF's name with `.meno` (it is the tab's `filename`, as an opened file's).
 * Opened from outside Meno (`readFilled`), its first PDF is read in the column, which fills the workspace.
 */
export function openedPdfs(pdfs: OpenedPdf[], readFilled = false): { kind: "workspace"; label: string; data: { pdfs: OpenedPdf[]; filename: string; readFilled?: true } } {
  return { kind: "workspace", label: pdfs[0].name, data: { pdfs, filename: pdfs[0].name, ...(readFilled ? { readFilled: true as const } : {}) } };
}

/**
 * What PDFs opened from outside Meno (a double-click, Open With) do, given the tabs and the PDFs each holds: those a tab holds
 * already, by SHA-256, bring that tab forward, as it was left - none opened again; the rest are opened together in a canvas of
 * their own. `forward` lists the tabs in the order the PDFs came, none twice.
 */
export function outsidePdfsPlan(pdfs: readonly OpenedPdf[], tabs: readonly { id: string; pdfs: readonly { sha256: string }[] | undefined }[]): { forward: string[]; fresh: OpenedPdf[] } {
  const forward: string[] = [];
  const fresh: OpenedPdf[] = [];
  for (const p of pdfs) {
    const tab = tabs.find((t) => t.pdfs?.some((q) => q.sha256 === p.sha256));
    if (!tab) {
      // (the same PDF twice in one go: once)
      if (!fresh.some((q) => q.sha256 === p.sha256)) fresh.push(p);
    } else if (!forward.includes(tab.id)) forward.push(tab.id);
  }
  return { forward, fresh };
}

/**
 * Where PDFs opened go: from outside Meno (`outside`), by `outsidePdfsPlan` - tabs that hold them brought forward, the rest in a canvas
 * of their own, read filled; opened by Open, or dropped, all `intoFront` - onto the page of the workspace in front, as they always were.
 */
export function pdfsDestination(
  outside: boolean,
  pdfs: readonly OpenedPdf[],
  tabs: readonly { id: string; pdfs: readonly { sha256: string }[] | undefined }[],
): { forward: string[]; fresh: OpenedPdf[]; intoFront: OpenedPdf[] } {
  return outside ? { ...outsidePdfsPlan(pdfs, tabs), intoFront: [] } : { forward: [], fresh: [], intoFront: [...pdfs] };
}
