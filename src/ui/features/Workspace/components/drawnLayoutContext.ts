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
  zoom: number;
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
