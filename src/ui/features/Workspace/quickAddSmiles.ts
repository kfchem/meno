/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin } from "../../../lib/roles/worker";
import type { RoleId } from "../../../lib/plugins/roles";
import type { Reading } from "./chem/resolve";

/** What came of it: drawn (null), or why not - and, where no plugin here reads it, the role the plugins online are offered for (./RoleOffer). */
export type SmilesRead = null | { error: string; needs: RoleId | null };

/**
 * A SMILES read and drawn (`onSmiles`), or why not. Read again once the
 * plugin offered for it is added (./RoleOffer `done`): what was typed is
 * drawn then, not typed again.
 */
export async function readSmiles(smiles: string, onSmiles: (smiles: string) => Promise<void>): Promise<SmilesRead> {
  try {
    await onSmiles(smiles);
    return null;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), needs: err instanceof NoPlugin ? err.role : null };
  }
}

/**
 * The plugin offered for the SMILES typed added (./RoleOffer `done`): what
 * was typed read again, and drawn - unless the field is empty, or a read is
 * under way already; then the offer and what it said only let go.
 */
export function afterAdded(typed: string, reading: boolean, read: (smiles: string) => void, letGo: () => void): void {
  const smiles = typed.trim();
  if (smiles && !reading) read(smiles);
  else letGo();
}

/**
 * The rows offered under the field: each reading of the text - offered only
 * where the dictionary has it, or where a lookup is offered beside them - and
 * the lookup, last, where a plugin looks names up and the field is not
 * empty: first only where nothing else reads (docs/EDITOR-2D.md, *Quick Add*).
 */
export function fieldRows(readings: readonly Reading[], lookable: boolean): { offered: readonly Reading[]; lookup: boolean; rows: number } {
  const offered = readings.some((r) => r.as === "label") || lookable ? readings : [];
  return { offered, lookup: lookable, rows: offered.length + (lookable ? 1 : 0) };
}

/** What Enter does in the field: draws one of several found, looks the text up, draws the dictionary's molecule, or reads the text as a SMILES. */
export type EnterDoes = "found" | "look up" | "named" | "smiles";

/**
 * What Enter does, with the row `choice` chosen among `rows`, and several
 * found by a lookup on show or not. A lookup is sent only where its row is
 * the one chosen: never by typing, and never in place of a reading - which
 * comes first, chosen till another is.
 */
export function enterDoes(rows: ReturnType<typeof fieldRows>, choice: number, several: boolean): EnterDoes {
  if (several) return "found";
  const at = Math.min(choice, Math.max(0, rows.rows - 1));
  if (rows.lookup && at === rows.offered.length) return "look up";
  return rows.offered[at]?.as === "label" ? "named" : "smiles";
}
