/**
 * A conversation's search (docs/CONVERSATIONS.md, *Meno's tools*): among the
 * structures drawn in its scope, those that are the compound a SMILES names
 * - by Meno's identity - or that hold it - by Meno's own matcher
 * (lib/chem/substructure). Meno's judgements both, so core's. A search that
 * stops at its limit says it could not tell for that structure, never "no".
 */
import { holdsSubstructure } from "../../../../lib/chem/substructure";
import type { WorkspaceDocument } from "../document";
import { identity } from "../../../../lib/chem/identity";
import type { identityInputOf } from "../chem/identityOf";
import { identitiesAsked, identityKnown } from "../chem/identityOff";
import type { Model } from "../store/types";
import { structureInputOf } from "../workflow/entries";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { seenId, type InScope, type SeenId } from "./scope";

/** How many structures a search looks through; past that, how many it did not. */
export const SEARCH_MOST = 2000;

export type Found = { found: SeenId[]; couldNotTell?: SeenId[]; notLookedAt?: number };

type Input = ReturnType<typeof identityInputOf>["input"];

/** A structure drawn alone: its atoms, and the bonds between them. */
function structureOf(d: WorkspaceDocument, ids: readonly number[]): Model {
  const mine = new Set(ids);
  return { atoms: d.model.atoms.filter((a) => mine.has(a.id)), bonds: d.model.bonds.filter((b) => mine.has(b.a) && mine.has(b.b)) };
}

/**
 * What a structure in scope asks of identity and of the matcher: as a record's key reads it (workflow/entries
 * `structureInputOf`) - a hydrogen bond drawn in it, an enol's own, no bond of it.
 */
const inputOf = (d: WorkspaceDocument, s: InScope, id: number): Input => structureInputOf(structureOf(d, s.structureAtoms.get(id)!)).input;

/** What a structure is, as "same" compares it: its identity, as the worker answered it where it has (`searchAsked`). */
const sameAs = (input: Input): string => (identityKnown(input) ?? identity(input)).text;

/**
 * The identities a "same" search reads - the SMILES's and each structure's in scope - asked of the worker first
 * (chem/identityOff), so that the search (`search`) works none out on the drawing thread.
 */
export async function searchAsked(d: WorkspaceDocument, s: InScope, smiles: string, how: "same" | "holds"): Promise<void> {
  if (how !== "same") return;
  let query: Input;
  try {
    query = structureInputOf(drawnFromSmiles(smiles)).input;
  } catch {
    return;
  }
  await identitiesAsked([query, ...s.structure.slice(0, SEARCH_MOST).map((id) => inputOf(d, s, id))]);
}

/**
 * The structures in scope that are the compound `smiles` names (`same`) or
 * that hold it (`holds`). A SMILES Meno does not read is said to be one.
 */
export function search(d: WorkspaceDocument, s: InScope, smiles: string, how: "same" | "holds"): Found | { why: string } {
  let query: Input;
  try {
    query = structureInputOf(drawnFromSmiles(smiles)).input;
  } catch {
    return { why: `Meno does not read ${JSON.stringify(smiles.slice(0, 80))} as a SMILES` };
  }
  const looked = s.structure.slice(0, SEARCH_MOST);
  const found: SeenId[] = [];
  const couldNotTell: SeenId[] = [];
  const sameText = how === "same" ? sameAs(query) : undefined;
  for (const id of looked) {
    const target = inputOf(d, s, id);
    if (sameText !== undefined) {
      if (sameAs(target) === sameText) found.push(seenId("structure", id));
      continue;
    }
    const held = holdsSubstructure(query, target);
    if (held.found) found.push(seenId("structure", id));
    else if (!held.finished) couldNotTell.push(seenId("structure", id));
  }
  return {
    found,
    ...(couldNotTell.length ? { couldNotTell } : {}),
    ...(s.structure.length > looked.length ? { notLookedAt: s.structure.length - looked.length } : {}),
  };
}
