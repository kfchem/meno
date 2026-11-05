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
 * saddle point only where each says so. One that ran with atoms held where
 * they stood (`held`, from 0: *Hold its restraints*) says so in how, as it
 * is no stationary point: the steps that take one refuse it.
 */
import { geometryKey } from "../../../../lib/entry";
import { REFINED_SAID } from "../../../../lib/calc/paths";

/** How a run ended converged, as the property says it: the last is a path search's words for its point refined (lib/calc/paths `REFINED_SAID`). */
export const CONVERGED_HOW = ["optimisation", "saddle point optimisation", REFINED_SAID, "optimisation with atoms held", "saddle point optimisation with atoms held"] as const;
export type ConvergedHow = (typeof CONVERGED_HOW)[number];

/** That a run ended converged, and the geometry it ended at, by its key (lib/entry `geometryKey`). */
export type Converged = { how: ConvergedHow; geometry: string; held?: number[] };

/** A run's ending converged at `xyz`, as `how` says. */
export const convergedAt = (how: ConvergedHow, xyz: readonly number[], held?: readonly number[]): Converged => ({ how, geometry: geometryKey(xyz), ...(held?.length ? { held: [...held] } : {}) });

/** Whether a run converged with atoms held where they stood (`held`): no stationary point, its energy and frequencies of none. */
export const heldAt = (c: Converged | undefined): boolean => !!c?.held?.length;

/** Why a step that takes a stationary point refuses an entry optimised with atoms held (`heldAt`): which, from 1, and what to do; none where it was not. */
export function heldWhy(c: Converged | undefined): string | null {
  if (!c?.held?.length) return null;
  const atoms = `${c.held.length === 1 ? "atom" : "atoms"} ${c.held.map((a) => a + 1).join(", ")}`;
  return `Optimised with ${atoms} held where ${c.held.length === 1 ? "it" : "they"} stood: no stationary point - optimise it free of ${c.held.length === 1 ? "it" : "them"} first`;
}

/** An entry's record that a run ended converged at its geometry: none where it has none, where the record is of another geometry, or where it failed. */
export function convergedOf(e: { converged?: Converged; xyz: readonly number[]; failed?: unknown }): Converged | undefined {
  return e.converged && !e.failed && e.converged.geometry === geometryKey(e.xyz) ? e.converged : undefined;
}

/** A record as a file gives it, read back: how, one of `CONVERGED_HOW`, and a geometry's key; null where it does not read. */
export function convergedIn(v: unknown): Converged | null {
  const c = v as { how?: unknown; geometry?: unknown } | null;
  if (!c || typeof c !== "object" || typeof c.geometry !== "string" || !c.geometry) return null;
  const held = (c as { held?: unknown }).held;
  const atoms = Array.isArray(held) && held.length && held.every((a) => Number.isInteger(a) && a >= 0) ? { held: held as number[] } : {};
  return (CONVERGED_HOW as readonly unknown[]).includes(c.how) ? { how: c.how as ConvergedHow, geometry: c.geometry, ...atoms } : null;
}
