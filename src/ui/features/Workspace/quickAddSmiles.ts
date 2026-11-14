/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin, type ChemState } from "../../../lib/roles/worker";
import type { RoleId } from "../../../lib/plugins/roles";

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
 * The one line under the SMILES field saying where chemistry stands, where it is not ready: the step its set-up is at, in the words
 * the first start's card says it in - the plugin's files downloading, how far they have come (`share`, 0 to 1, rounded as the card
 * rounds it) where that is reported, else its environment set up, which reports none - and, where a SMILES typed waits for it (`waiting`), that it is drawn
 * when ready; or being started. None where it is ready, or nothing has asked for it yet (what is said of a plugin missing, or
 * offline, is said as before).
 */
export function chemistryLine(chem: ChemState, share: number | undefined, waiting: boolean): string | null {
  if (chem.state === "setting-up") {
    const step = share != null ? `downloading ${chem.plugin} (${Math.round(Math.min(1, Math.max(0, share)) * 100)}%)` : `setting up ${chem.plugin}'s environment`;
    return `Setting up chemistry: ${step}.${waiting ? " This is drawn when it is ready." : ""}`;
  }
  if (chem.state === "starting") return "Starting chemistry. The first one takes a moment.";
  return null;
}
