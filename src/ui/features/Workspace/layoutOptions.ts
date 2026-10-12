import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import type { Atom as LAtom, Bond as LBond, LayoutOptions } from "../../../lib/chem/layout2d";
import { layoutOptionsFor, type DrawingStyle } from "../../../lib/chem/style";
import type { Atom, Bond } from "./store/types";
import { bondChem, chemistry } from "../../../lib/chem/molecule";

/**
 * A model bond as the layout takes it, between the atoms at layout indices
 * `a1` and `a2`. Every layer converts through here, so none of them draws a
 * bond without a field the drawing depends on - which side a double bond's
 * second line takes, which way a wedge points, how the bond is displayed.
 */
export function layoutBond(b: Bond, a1: number, a2: number): LBond {
  return {
    a1,
    a2,
    order: b.order,
    stereo: b.stereo ?? "none",
    doubleMode: b.doubleMode ?? "auto",
    stereoOrient: b.stereoOrient ?? "principle",
    ...(b.display ? { display: b.display } : {}),
    ...(b.dative ? { dative: true } : {}),
    ...(b.color ? { color: b.color } : {}),
    ...(b.highlight ? { highlight: b.highlight } : {}),
    ...bondChem(b),
  };
}

/** An atom as the layout takes it - where it is, or `at`. */
export function layoutAtomOf(a: Atom, at?: { x: number; y: number }): LAtom {
  return {
    id: a.id,
    ...(at ?? { x: a.x, y: a.y }),
    el: a.el,
    ...chemistry(a),
    // (with its depth, where it is drawn in perspective: a bond behind
    // another is broken where they cross)
    ...(a.z != null ? { z: a.z } : {}),
    // (its charge where a hand put it)
    ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}),
    // (its colour, and its highlight)
    ...(a.color ? { color: a.color } : {}),
    ...(a.highlight ? { highlight: a.highlight } : {}),
  };
}

/**
 * The model's bonds as the layout takes them, by the layout index of each
 * atom id; a bond to an atom that is not there is left out.
 */
export function layoutBonds(
  bonds: readonly Bond[],
  indexOf: ReadonlyMap<number, number>,
): LBond[] {
  const out: LBond[] = [];
  for (const b of bonds) {
    const a1 = indexOf.get(b.a);
    const a2 = indexOf.get(b.b);
    if (a1 == null || a2 == null) continue;
    out.push(layoutBond(b, a1, a2));
  }
  return out;
}

/**
 * A line thinner than this on screen disappears into the background, so the
 * layout is told to keep bonds at least this wide however far out the camera
 * is.
 */
export const MIN_LINE_PX = 1.25;

/**
 * The options every part of the 2D editor draws with, in `style`, at the
 * editor's bond length in world units. Each component used to build its own,
 * which drifted: only the bonds kept a minimum on-screen width, so at low
 * zoom they and the wedges disagreed about how wide a bond was, and the SVG
 * export drew to yet another set. Pass overrides for what genuinely differs
 * (the aromatic circles a view shows, a caller's own settings).
 */
export function editorLayoutOptions(
  style: DrawingStyle,
  over?: Partial<LayoutOptions>,
): LayoutOptions {
  return layoutOptionsFor(style, NOMINAL_BOND_LENGTH, {
    units: "world",
    minLinePx: MIN_LINE_PX,
    ...over,
  });
}

/**
 * How much bigger than it prints a bond is on a canvas that opens empty,
 * and the most a fit makes of one.
 */
export const START_SCALE = 2.5;
export const MAX_FIT_SCALE = 3 * START_SCALE;

/** A bond's length in `style` as it prints, in CSS pixels (96 to the inch). */
function printedBondPx(style: DrawingStyle): number {
  return style.bondLengthPt * (96 / 72);
}

/**
 * The zoom a canvas opens at, before there is anything to fit: a bond drawn
 * there comes out two and a half times as long as it prints - big enough to
 * work on, and in proportion to the style it is drawn in.
 */
export function startingZoom(style: DrawingStyle): number {
  return (printedBondPx(style) * START_SCALE) / NOMINAL_BOND_LENGTH;
}

/**
 * The most a fit zooms in: a single bond fitted to the window would
 * otherwise fill it.
 */
export function maxFitZoom(style: DrawingStyle): number {
  return (printedBondPx(style) * MAX_FIT_SCALE) / NOMINAL_BOND_LENGTH;
}
