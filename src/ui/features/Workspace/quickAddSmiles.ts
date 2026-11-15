/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin, type ChemState } from "../../../lib/roles/worker";
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

/**
 * Where chemistry stands while it is not ready, in one phrase said the same in each place that says it - the chip at the
 * workspace's corner (./Workspace) and the line under Quick Add's SMILES field (`chemistryLine`): the step its set-up is at -
 * the plugin's files downloading, how far they have come (`share`, 0 to 1, rounded) where that is reported, else its
 * environment set up, which reports none - or its being started. None where it is ready, or nothing has asked for it yet (what
 * is said of a plugin missing, or offline, is said as before).
 */
export function chemistryStep(chem: ChemState, share: number | undefined): string | null {
  if (chem.state === "setting-up") {
    const step = share != null ? `downloading ${chem.plugin} (${Math.round(Math.min(1, Math.max(0, share)) * 100)}%)` : `setting up ${chem.plugin}'s environment`;
    return `Setting up chemistry: ${step}`;
  }
  if (chem.state === "starting") return `Starting ${chem.plugin}`;
  return null;
}

/**
 * The one line under the SMILES field: `chemistryStep` as a sentence - and, where a SMILES typed waits for it (`waiting`), that
 * it is drawn when ready; as it starts, that the first one takes a moment.
 */
export function chemistryLine(chem: ChemState, share: number | undefined, waiting: boolean): string | null {
  const step = chemistryStep(chem, share);
  if (!step) return null;
  if (chem.state === "starting") return `${step}. The first one takes a moment.`;
  return `${step}.${waiting ? " This is drawn when it is ready." : ""}`;
}
