import { factor } from "../../../../lib/units";
import { least } from "../../../../lib/chem/lists";
import type { Failure } from "../workflow/failures";

/** What a molecule's frames chip says where its failures are not one to each frame. */
export const FAILURES_ASTRAY = "its frames' failures do not line up";
/** What it says of a frame's energy where none of its frames finished. */
export const NO_LOWEST = "none finished: no lowest to stand above";
/** What it says of a frame's energy where that frame did not finish, though another did. */
export const NOT_FINISHED = "not finished";
/** What it says of a frame's energy where its file gave it none, though it gave another frame one. */
export const NO_ENERGY = "no energy";

/** What a chip says of frame `k` that has no height above the lowest: why (`bars.why`), none finished, it was given no energy, or it did not finish. */
export const noneSaid = (bars: ReturnType<typeof barsAbove>, k: number): string =>
  bars.why ?? (bars.noBaseline ? NO_LOWEST : bars.given[k] ? NOT_FINISHED : NO_ENERGY);

/**
 * What a frames chip says of frame `k`'s energy, where it has one, as
 * a frames chip says it of `bars` (its widest number for one above the lowest):
 * its height above it - or, on a path whose highest point was refined
 * (`fromStart`), its height above the path's start - or why it has none.
 */
export const aboveSaid = (bars: ReturnType<typeof barsAbove>, k: number, fromStart = false): string =>
  bars.above[k] != null ? (fromStart && bars.above[0] != null ? "ΔE 10.0 kcal/mol from its start" : "10.0 kcal/mol") : noneSaid(bars, k);

/**
 * Each frame's energy above the lowest of those that finished, in kcal/mol:
 * none of one that did not - it failed, or its marks did not read
 * (`marksUnread`) - which is no frame's zero either. All of them none,
 * where none finished (`noBaseline`).
 */
export function barsAbove(
  energies: readonly number[],
  failed?: readonly (Failure | null)[],
  marksUnread?: boolean,
): { above: (number | null)[]; noBaseline: boolean; why?: string; given: boolean[] } {
  // (which frames were given an energy at all: one given none - NaN, its file's line holding none - says so, not that it did not finish)
  const given = energies.map((e) => Number.isFinite(e));
  // (failures not one to each frame say nothing of which finished: none is taken to have - never every one)
  if (failed && failed.length !== energies.length) return { above: energies.map(() => null), noBaseline: true, why: FAILURES_ASTRAY, given };
  const finished = (i: number) => !marksUnread && !failed?.[i] && given[i];
  const done = energies.filter((_, i) => finished(i));
  if (!done.length) return { above: energies.map(() => null), noBaseline: true, given };
  const lowest = least(done);
  return { above: energies.map((e, i) => (finished(i) ? (e - lowest) * factor("Eh", "kcal/mol") : null)), noBaseline: false, given };
}
