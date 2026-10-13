import { createContext, useContext, useSyncExternalStore } from "react";
import type {
  Atom as LAtom,
  Bond as LBond,
  Layout,
  LayoutOptions,
} from "../../../../lib/chem/layout2d";

/**
 * The drawing as it stands, laid out, what it was laid out from, and the
 * zoom it was laid out at (`laidAt`): that changes as the layout does, not
 * as the view zooms. What the view's zoom changes is read apart from it
 * (`useDrawnZoom`), so that a zoom draws again only what it changes.
 */
export type DrawnLayout = {
  atoms: LAtom[];
  bonds: LBond[];
  opts: LayoutOptions;
  layout: Layout;
  laidAt: number;
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

/** The view's zoom as the drawing takes it up (components/DrawnLayout), for those who read it to hear of each change. */
export type DrawnZoom = {
  get: () => number;
  set: (zoom: number) => void;
  subscribe: (heard: () => void) => () => void;
};

/** A zoom to be taken up, starting at `start`. */
export function drawnZoomOf(start: number): DrawnZoom {
  let zoom = start;
  const heard = new Set<() => void>();
  return {
    get: () => zoom,
    set: (z) => {
      if (z === zoom) return;
      zoom = z;
      for (const f of heard) f();
    },
    subscribe: (f) => {
      heard.add(f);
      return () => void heard.delete(f);
    },
  };
}

export const DrawnZoomContext = createContext<DrawnZoom | null>(null);

const asIs = (zoom: number) => zoom;

/**
 * The zoom the drawing is taken up at - or what `select` makes of it,
 * drawn again only as that changes: a line kept as wide as the screen's
 * least, say, changes with the zoom only once the view is out far enough
 * for it to be kept so, and the rest of the time a zoom leaves it as it is.
 * `select` gives a number, a string, a boolean or null (compared as it is).
 */
export function useDrawnZoom(): number;
export function useDrawnZoom<T extends number | string | boolean | null>(select: (zoom: number) => T): T;
export function useDrawnZoom(select: (zoom: number) => unknown = asIs): unknown {
  const zoom = useContext(DrawnZoomContext);
  if (!zoom) {
    throw new Error("useDrawnZoom needs a DrawnLayoutProvider above it");
  }
  return useSyncExternalStore(zoom.subscribe, () => select(zoom.get()));
}
