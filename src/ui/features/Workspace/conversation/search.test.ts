import { afterEach, describe, expect, it } from "vitest";
import { constitutionKey, identity } from "../../../../lib/chem/identity";
import type { WorkspaceDocument } from "../document";
import { forgetIdentities, identityKnown, IN_PLACE_MOST } from "../chem/identityOff";
import type { Bond, Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { structureInputOf } from "../workflow/entries";
import { SEEN_KINDS, seenId, type InScope } from "./scope";
import { search, searchAsked } from "./search";

const ENOL = "OC(=CC(=O)c1ccccc1)c1ccccc1-c1ccccc1";
/** The same compound written from the other end: its drawing's atoms in another order, so another input. */
const ENOL_FROM_THE_OTHER_END = "O=C(C=C(O)c1ccccc1-c1ccccc1)c1ccccc1";
/** The enol drawn with its own hydrogen bond, O-H...O=C. */
const enolBonded = (): Model => {
  const plain = drawnFromSmiles(ENOL);
  const [oh, co] = plain.atoms.filter((a) => a.el === "O").map((a) => a.id);
  const own = { id: Math.max(...plain.bonds.map((b) => b.id)) + 1, a: oh, b: co, order: 1, hydrogen: true } as Bond;
  return { ...plain, bonds: [...plain.bonds, own] };
};
/** A page holding `m` alone, and a scope that sees it as structure 1. */
const pageOf = (m: Model): { d: WorkspaceDocument; s: InScope } => {
  const s = Object.fromEntries(SEEN_KINDS.map((k) => [k, [] as number[]])) as unknown as InScope;
  s.structure = [1];
  s.structureAtoms = new Map([[1, m.atoms.map((a) => a.id)]]);
  return { d: { model: m } as unknown as WorkspaceDocument, s };
};

let asked = 0;
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: Parameters<typeof identity>[0]; kind?: "constitution" }) {
    asked++;
    const found = m.kind === "constitution" ? { text: constitutionKey(m.input), complete: true } : identity(m.input);
    setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, found } } as MessageEvent), 0);
  }
  terminate() {}
}
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
  forgetIdentities();
});

describe("a conversation's search reads a structure as a record's key does: its own hydrogen bond no bond of it", () => {
  it("an enol drawn with its own hydrogen bond is the compound its SMILES names", () => {
    const { d, s } = pageOf(enolBonded());
    expect(search(d, s, ENOL, "same")).toEqual({ found: [seenId("structure", 1)] });
  });
  it("and is the same as the enol drawn without it", () => {
    const plain = drawnFromSmiles(ENOL);
    const { d, s } = pageOf(enolBonded());
    expect(search(d, s, ENOL, "same")).toEqual(search(pageOf(plain).d, pageOf(plain).s, ENOL, "same"));
  });
  it("its hydrogen bond holds no O-O bond", () => {
    const { d, s } = pageOf(enolBonded());
    expect(search(d, s, "OO", "holds")).toEqual({ found: [] });
    expect(search(d, s, "OC=CC=O", "holds")).toEqual({ found: [seenId("structure", 1)] });
  });
  it("what searchAsked asks of the worker is what the search reads: nothing asked again, nothing pending", async () => {
    (globalThis as { Worker?: unknown }).Worker = LaterWorker;
    asked = 0;
    forgetIdentities();
    const m = enolBonded();
    expect(m.atoms.length).toBeGreaterThan(IN_PLACE_MOST);
    const { d, s } = pageOf(m);
    await searchAsked(d, s, ENOL, "same");
    const after = asked;
    expect(after).toBeGreaterThan(0);
    expect(identityKnown(structureInputOf(m).input)).toBeDefined();
    expect(search(d, s, ENOL, "same")).toEqual({ found: [seenId("structure", 1)] });
    expect(asked).toBe(after);
  });
  it("what searchAsked asks is the structure as the search reads it, and the SMILES: both known once awaited, written differently (found in review)", async () => {
    (globalThis as { Worker?: unknown }).Worker = LaterWorker;
    forgetIdentities();
    const m = enolBonded();
    // (one compound, two inputs: asking the one does not answer the other)
    expect(JSON.stringify(structureInputOf(drawnFromSmiles(ENOL_FROM_THE_OTHER_END)).input)).not.toBe(JSON.stringify(structureInputOf(m).input));
    const { d, s } = pageOf(m);
    await searchAsked(d, s, ENOL_FROM_THE_OTHER_END, "same");
    expect(identityKnown(structureInputOf(m).input)).toBeDefined();
    expect(identityKnown(structureInputOf(drawnFromSmiles(ENOL_FROM_THE_OTHER_END)).input)).toBeDefined();
    expect(search(d, s, ENOL_FROM_THE_OTHER_END, "same")).toEqual({ found: [seenId("structure", 1)] });
  });
});
