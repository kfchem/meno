/**
 * Where a run ended converged (docs/WORKFLOWS.md, *The entry record*,
 * `converged`): an optimisation to its end, an optimisation to a saddle
 * point to its end, or a path's highest point refined - as the program
 * said it, of the geometry it ended at, by that geometry's key. Set only by
 * the run that converged (programs `workedOf`); carried on by what keeps
 * the geometry - a Frequencies job, a single point - while it is that
 * geometry still; of no other geometry, so that what moves the atoms
 * leaves none. A failed run has none: one started from its geometry starts
 * from a geometry no run converged at. A *Barrier* takes a start and a
 * saddle point only where each says so.
 */
import { geometryKey } from "../../../../lib/entry";

/** How a run ended converged, as the property says it: the last is *Path search*'s words for its point refined (entries `REFINED_SAID`). */
export const CONVERGED_HOW = ["optimisation", "saddle point optimisation", "highest point refined"] as const;
export type ConvergedHow = (typeof CONVERGED_HOW)[number];

/** That a run ended converged, and the geometry it ended at, by its key (lib/entry `geometryKey`). */
export type Converged = { how: ConvergedHow; geometry: string };

/** A run's ending converged at `xyz`, as `how` says. */
export const convergedAt = (how: ConvergedHow, xyz: readonly number[]): Converged => ({ how, geometry: geometryKey(xyz) });

/** An entry's record that a run ended converged at its geometry: none where it has none, where the record is of another geometry, or where it failed. */
export function convergedOf(e: { converged?: Converged; xyz: readonly number[]; failed?: unknown }): Converged | undefined {
  return e.converged && !e.failed && e.converged.geometry === geometryKey(e.xyz) ? e.converged : undefined;
}

/** A record as a file gives it, read back: how, one of `CONVERGED_HOW`, and a geometry's key; null where it does not read. */
export function convergedIn(v: unknown): Converged | null {
  const c = v as { how?: unknown; geometry?: unknown } | null;
  if (!c || typeof c !== "object" || typeof c.geometry !== "string" || !c.geometry) return null;
  return (CONVERGED_HOW as readonly unknown[]).includes(c.how) ? { how: c.how as ConvergedHow, geometry: c.geometry } : null;
}
