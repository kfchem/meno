/**
 * The page's bottom-right corner, which the notices keep to (./network/NetworkToasts):
 * left of any panel standing at the window's right side - the column of a
 * conversation, a text or a PDF, a style panel beside the canvas - at the
 * distance they keep from the window's edges with none.
 *
 * The workspace in front says how much of the window's right side its panels
 * take (features/Workspace/PageEdge); as they slide or are dragged, it says
 * so again, so what keeps to the corner moves with them.
 */
import { create } from "zustand";

/** How far the notices sit from the window's right and bottom edges, in CSS pixels (Tailwind's `3`). */
export const CORNER_GAP = 12;

/** How wide the notices are, in CSS pixels (Tailwind's `w-80`). */
export const NOTICES_WIDTH = 320;

/**
 * Where the notices' right edge lies, as a distance from the window's right
 * edge: `CORNER_GAP` with nothing there; left of panels `side` wide by the
 * same `CORNER_GAP` - but never so far that they would leave the window
 * `window` wide at its left (a column filling the workspace, a narrow
 * window): there they keep to the window's left edge, by the same gap.
 */
export function cornerRight(side: number, window = Number.POSITIVE_INFINITY): number {
  const beside = CORNER_GAP + (Number.isFinite(side) && side > 0 ? side : 0);
  return Math.max(CORNER_GAP, Math.min(beside, window - CORNER_GAP - NOTICES_WIDTH));
}

type PageCorner = {
  /** How far the notices' right edge lies from the window's right edge, in CSS pixels (`cornerRight`). */
  right: number;
  /** The tab whose panels those are. */
  of: string | null;
  /** The tab in front says where, by how much of the window its panels take. */
  say: (of: string, right: number) => void;
  /** A tab no longer in front lets go, unless another has spoken since. */
  letGo: (of: string) => void;
};

export const usePageCorner = create<PageCorner>((set, get) => ({
  right: CORNER_GAP,
  of: null,
  say: (of, right) => {
    const s = get();
    if (s.of !== of || s.right !== right) set({ of, right });
  },
  letGo: (of) => {
    if (get().of === of) set({ of: null, right: CORNER_GAP });
  },
}));
