/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin } from "../../../lib/roles/worker";
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
