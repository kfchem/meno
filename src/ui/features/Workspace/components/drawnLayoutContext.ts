import { createContext, useContext } from "react";
import type {
  Atom as LAtom,
  Bond as LBond,
  Layout,
  LayoutOptions,
} from "../../../../lib/chem/layout2d";

/** The drawing as it stands, laid out, and what it was laid out from. */
export type DrawnLayout = {
  atoms: LAtom[];
  bonds: LBond[];
  opts: LayoutOptions;
  layout: Layout;
  /** The zoom it is laid out for: the view's - or, a very large drawing waiting for a zoom to stop, the one it was at (`waits`). */
  zoom: number;
  /** How a very large drawing waits for the view's zoom to stop before it is laid out at it (utils/largeZoom); null, laid out at every step. */
  waits: "settle" | "picture" | null;
};

export const DrawnLayoutContext = createContext<DrawnLayout | null>(null);

/** The drawing as it stands, laid out; see `DrawnLayoutProvider`. */
export function useDrawnLayout(): DrawnLayout {
  const value = useContext(DrawnLayoutContext);
  if (!value) {
    throw new Error("useDrawnLayout needs a DrawnLayoutProvider above it");
  }
  return value;
}
