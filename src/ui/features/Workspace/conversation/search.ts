/**
 * A conversation's search (docs/CONVERSATIONS.md, *Meno's tools*): among the
 * structures drawn in its scope, those that are the compound a SMILES names
 * - by Meno's identity - or that hold it - by Meno's own matcher
 * (lib/chem/substructure). Meno's judgements both, so core's. A search that
 * stops at its limit says it could not tell for that structure, never "no".
 */
import { holdsSubstructure } from "../../../../lib/chem/substructure";
import type { WorkspaceDocument } from "../document";
import { identityInputOf, identityOfDrawn, labelsDrawnOut } from "../chem/identityOf";
import { identitiesAsked, identityKnown } from "../chem/identityOff";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { seenId, type InScope, type SeenId } from "./scope";

/** How many structures a search looks through; past that, how many it did not. */
export const SEARCH_MOST = 2000;

export type Found = { found: SeenId[]; couldNotTell?: SeenId[]; notLookedAt?: number };

/** A structure drawn alone: its atoms, and the bonds between them. */
function structureOf(d: WorkspaceDocument, ids: readonly number[]): Model {
  const mine = new Set(ids);
  return { atoms: d.model.atoms.filter((a) => mine.has(a.id)), bonds: d.model.bonds.filter((b) => mine.has(b.a) && mine.has(b.b)) };
}

/** What a structure is, as "same" compares it: its identity, as the worker answered it where it has (`searchAsked`). */
const sameAs = (m: Model): string => identityKnown(identityInputOf(m).input)?.text ?? identityOfDrawn(m).text;

/**
 * The identities a "same" search reads - the SMILES's and each structure's in scope - asked of the worker first
 * (chem/identityOff), so that the search (`search`) works none out on the drawing thread.
 */
export async function searchAsked(d: WorkspaceDocument, s: InScope, smiles: string, how: "same" | "holds"): Promise<void> {
  if (how !== "same") return;
  let query: Model;
  try {
    query = labelsDrawnOut(drawnFromSmiles(smiles));
  } catch {
    return;
  }
  const looked = s.structure.slice(0, SEARCH_MOST).map((id) => labelsDrawnOut(structureOf(d, s.structureAtoms.get(id)!)));
  await identitiesAsked([query, ...looked].map((m) => identityInputOf(m).input));
}

/**
 * The structures in scope that are the compound `smiles` names (`same`) or
 * that hold it (`holds`). A SMILES Meno does not read is said to be one.
 */
export function search(d: WorkspaceDocument, s: InScope, smiles: string, how: "same" | "holds"): Found | { why: string } {
  let query: Model;
  try {
    query = labelsDrawnOut(drawnFromSmiles(smiles));
  } catch {
    return { why: `Meno does not read ${JSON.stringify(smiles.slice(0, 80))} as a SMILES` };
  }
  const looked = s.structure.slice(0, SEARCH_MOST);
  const found: SeenId[] = [];
  const couldNotTell: SeenId[] = [];
  const asked = how === "same" ? sameAs(query) : identityInputOf(query).input;
  for (const id of looked) {
    const target = labelsDrawnOut(structureOf(d, s.structureAtoms.get(id)!));
    if (how === "same") {
      if (sameAs(target) === asked) found.push(seenId("structure", id));
      continue;
    }
    const held = holdsSubstructure(asked as ReturnType<typeof identityInputOf>["input"], identityInputOf(target).input);
    if (held.found) found.push(seenId("structure", id));
    else if (!held.finished) couldNotTell.push(seenId("structure", id));
  }
  return {
    found,
    ...(couldNotTell.length ? { couldNotTell } : {}),
    ...(s.structure.length > looked.length ? { notLookedAt: s.structure.length - looked.length } : {}),
  };
}
