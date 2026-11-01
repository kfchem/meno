/**
 * Grids of values about a molecule - an orbital, a density - as Meno lays
 * them and draws them, whichever reader works their values out
 * (docs/WORKSPACE.md, *Surfaces*): the one place where how far a grid
 * reaches past the atoms, how far apart its points are, and the value its
 * surface is drawn at first are set. A reader that works a grid's values
 * out on Meno's asking is given the grid itself (`gridAbout`, as `grid` in
 * `ask`) and works them out there; one that reads a grid a program wrote -
 * a cube file - takes the program's.
 */
import type { Grid } from "./results";
import { GRID_POINTS_MOST, GRID_SIDE_MOST } from "./results";

/**
 * The value an orbital's surface is drawn at first, and its negative, in
 * atomic units: chosen, not taken from elsewhere, so that an orbital's
 * lobes show apart from one another on the molecules Meno is used on. The
 * chemist moves it on each surface.
 */
export const ISO_ORBITAL = 0.05;
/**
 * The value an electron density's surface is drawn at first, in atomic
 * units (electrons per cubic bohr): a value in common use for the density
 * contour taken as a molecule's outer surface - such outer contours, and
 * the volumes they enclose, are what R. F. W. Bader, M. T. Carroll, J. R.
 * Cheeseman and C. Chang studied ("Properties of atoms in molecules:
 * atomic volumes", J. Am. Chem. Soc. 1987, 109, 7968-7979). Chosen, as the
 * orbital's is; the chemist moves it on each surface.
 */
export const ISO_DENSITY = 0.002;

/** The value a grid's surface is drawn at first: the program's own where it gives one; else by what its values are - else, two-signed, an orbital's; one-signed, a density's. */
export function isoOf(g: Pick<Grid, "iso" | "quantity" | "signed">): number {
  if (g.iso != null) return g.iso;
  const orbital = g.quantity ? g.quantity === "orbital" : !!g.signed;
  return orbital ? ISO_ORBITAL : ISO_DENSITY;
}

/**
 * How far a grid reaches past the atoms, in ångströms: chosen so that a
 * density's surface at `ISO_DENSITY`, near the molecule's van der Waals
 * size, and an orbital's lobes at `ISO_ORBITAL` lie inside it.
 */
export const GRID_MARGIN = 4;
/** How far apart a grid's points are, in ångströms, where its size allows: chosen so that a surface's mesh is smooth at the size a molecule is shown. */
export const GRID_SPACING = 0.2;

/**
 * How many points a grid Meno lays has at most: as many as the readers'
 * own grids had before (90 to a side, 729,000 points), so that a surface
 * takes no longer to work out and send than it did. A grid a program wrote
 * - a cube file - may have more (results `GRID_POINTS_MOST`).
 */
export const GRID_LAID_MOST = 90 ** 3;

/** A grid's place: its origin, its axes (each the step along it) and how many points along each, in ångströms. */
export type GridPlace = Pick<Grid, "origin" | "axes" | "counts">;

/**
 * The grid about atoms at `xyz` (ångströms: x, y, z of each): `GRID_MARGIN`
 * past them each way, its points `GRID_SPACING` apart along each axis -
 * farther apart, alike each way, only where so many would be more than
 * `GRID_LAID_MOST` (or `GRID_SIDE_MOST` to a side).
 */
export function gridAbout(xyz: readonly number[]): GridPlace {
  const low = [0, 1, 2].map((k) => Math.min(...xyz.filter((_, i) => i % 3 === k)) - GRID_MARGIN);
  const high = [0, 1, 2].map((k) => Math.max(...xyz.filter((_, i) => i % 3 === k)) + GRID_MARGIN);
  const span = [0, 1, 2].map((k) => (Number.isFinite(high[k] - low[k]) ? high[k] - low[k] : 2 * GRID_MARGIN));
  const countsAt = (step: number) => span.map((s) => Math.ceil(s / step - 1e-9) + 1);
  let step = GRID_SPACING;
  // (the least spacing at which it fits: each side, then the whole)
  step = Math.max(step, ...span.map((s) => s / (GRID_SIDE_MOST - 1)));
  const fits = (c: number[]) => c.every((n) => n <= GRID_SIDE_MOST) && c[0] * c[1] * c[2] <= Math.min(GRID_LAID_MOST, GRID_POINTS_MOST);
  while (!fits(countsAt(step))) step *= 1.01;
  const counts = countsAt(step) as [number, number, number];
  const origin = (Number.isFinite(low[0]) ? low : [-GRID_MARGIN, -GRID_MARGIN, -GRID_MARGIN]) as [number, number, number];
  return {
    origin,
    axes: [
      [step, 0, 0],
      [0, step, 0],
      [0, 0, step],
    ],
    counts,
  };
}
