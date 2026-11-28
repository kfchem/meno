/** A SMILES read from Quick Add's field (./QuickAdd), plain, to be tested without a page. */
import { NoPlugin, type ChemState } from "../../../lib/roles/worker";
import type { RoleId } from "../../../lib/plugins/roles";
import { firstSetUpStep, type FirstSetUpCard } from "../../../lib/plugins/firstSetUp";
import { sameFormula, type Reading } from "./chem/resolve";
import { failureSaid } from "../../../lib/plugins/failureSaid";

/** What came of it: drawn (null), or why not - and, where no plugin here reads it, the role the plugins online are offered for (./RoleOffer). */
export type SmilesRead = null | { error: string; needs: RoleId | null };

/**
 * A SMILES read and drawn (`onSmiles`), or why not. Read again once the
 * plugin offered for it is added (./RoleOffer `done`): what was typed is
 * drawn then, not typed again.
 */
export async function readSmiles(smiles: string, onSmiles: (smiles: string) => Promise<void>, plugin: string): Promise<SmilesRead> {
  try {
    await onSmiles(smiles);
    return null;
  } catch (err) {
    return notDrawnSaid(err, "SMILES", plugin);
  }
}

/**
 * Why a structure asked for in Quick Add - a SMILES typed, a compound found by its name - was not drawn: in
 * Meno's words where they say why ("This SMILES could not be read: …"); where no plugin here draws it, that one
 * is needed, with the plugins online that do (./RoleOffer); else by what kind of failure it was, for `plugin`
 * by its name (lib/plugins/failureSaid).
 */
export function notDrawnSaid(err: unknown, where: "SMILES" | "compound", plugin: string): { error: string; needs: RoleId | null } {
  return { error: failureSaid(err, where, plugin), needs: err instanceof NoPlugin ? err.role : null };
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
 * The plugin offered under the field added (./RoleOffer `done`): where it was offered for a compound found by its
 * name (`found`), that compound drawn - not looked up again; where it was for looking names up, the offer let go
 * (a name is looked up only on the chemist's Enter); else what was typed read again (`afterAdded`).
 */
export function offerDone<F>(needs: RoleId, found: F | null, typed: string, reading: boolean, does: { read: (smiles: string) => void; draw: (found: F) => void; letGo: () => void }): void {
  if (needs === "names") does.letGo();
  else if (found) does.draw(found);
  else afterAdded(typed, reading, does.read, does.letGo);
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

/** What a reading under the SMILES field shows: its name (or "SMILES", or its label, or its formula) and its formula after it - none where the head is that formula already. */
export function readingParts(r: Reading): { head: string; headIsFormula: boolean; formula: string | null } {
  const named = r.as === "smiles" ? "SMILES" : r.as === "label" && r.name ? r.name : null;
  const head = named ?? (r.as === "label" ? r.label : r.formula);
  return { head, headIsFormula: named === null, formula: r.as === "label" && !r.name && sameFormula(r.label, r.formula) ? null : r.formula };
}

/** What a reading under the SMILES field shows, as words: its name for assistive technology (`readingParts`). */
export function readingSaid(r: Reading): string {
  const { head, formula } = readingParts(r);
  return formula ? `${head} \u00b7 ${formula}` : head;
}
