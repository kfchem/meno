/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin, type ChemState } from "../../../lib/roles/worker";
import type { RoleId } from "../../../lib/plugins/roles";
import { firstSetUpStep, type FirstSetUpCard } from "../../../lib/plugins/firstSetUp";

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
 * Where chemistry stands while it is not ready, in one phrase said the same in each place that says it - the chip at the
 * workspace's corner (./Workspace) and the line under Quick Add's SMILES field (`chemistryLine`): the step its set-up is at -
 * the plugin's files downloading, how far they have come (`share`, 0 to 1, rounded) where that is reported, else its
 * environment set up, which reports none - or its being started. None where it is ready, or nothing has asked for it yet (what
 * is said of a plugin missing, or offline, is said as before).
 */
export function chemistryStep(chem: ChemState, share: number | undefined, card?: FirstSetUpCard): string | null {
  // (the card's phrase: lib/plugins/firstSetUp `firstSetUpStep`)
  if (chem.state === "setting-up") return firstSetUpStep(share != null ? "files" : "environment", chem.plugin, share);
  if (chem.state === "starting") return `Starting ${chem.plugin}`;
  // (the first start's card setting chemistry up: its step, as the card says it)
  if (card?.phase === "going") return firstSetUpStep(card.step, card.plugin?.name, card.step === "files" ? share : undefined);
  return null;
}

/**
 * The one line under the SMILES field: `chemistryStep` as a sentence - and, where a SMILES typed waits for it (`waiting`), that
 * it is drawn when ready; as it starts, that the first one takes a moment.
 */
export function chemistryLine(chem: ChemState, share: number | undefined, waiting: boolean, card?: FirstSetUpCard): string | null {
  const step = chemistryStep(chem, share, card);
  if (!step) return null;
  if (chem.state === "starting") return `${step}. The first one takes a moment.`;
  return `${step}.${waiting ? " This is drawn when it is ready." : ""}`;
}
