import { afterEach, describe, expect, it } from "vitest";
import { constitutionKey, identity } from "../../../../lib/chem/identity";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import type { Bond, Drawn } from "../store/types";
import { drawnHash, drawnHashesAsked, placedRecord, structureInputOf, whenDrawnKnown } from "../workflow/entries";
import { setRecordsAsked } from "../fileActions";
import { forgetIdentities, identityKnown, IN_PLACE_MOST } from "./identityOff";

// What is asked of identity is what is read (workflow/entries `structureInputOf`): a structure's own hydrogen bond drawn - an enol's -
// left out of both, at every place that asks and every place that reads. A stand-in worker answers later, on a timer, as in
// ./identityOff.test.

/** How many structures the stand-in worker has been asked for. */
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
const withWorker = () => {
  (globalThis as { Worker?: unknown }).Worker = LaterWorker;
  asked = 0;
  forgetIdentities();
};
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
  forgetIdentities();
});
// (an enol's O-H and a C=O beside it, which a hydrogen bond drawn between them holds: large enough to be asked of the worker)
const ENOL = "OC(=CC(=O)c1ccccc1)c1ccccc1-c1ccccc1";
const plainEnol = () => drawnFromSmiles(ENOL);
const enol = () => {
  const plain = plainEnol();
  const [oh, co] = plain.atoms.filter((a) => a.el === "O").map((a) => a.id);
  const own = { id: Math.max(...plain.bonds.map((b) => b.id)) + 1, a: oh, b: co, order: 1, hydrogen: true } as Bond;
  return { ...plain, bonds: [...plain.bonds, own] };
};
const ids = (m: { atoms: { id: number }[] }) => m.atoms.map((a) => a.id);

describe("a structure with its own hydrogen bond drawn, at every ask and every read of its identity", () => {
  it("setRecordsAsked: a structure a set holds off the page is known once asked", async () => {
    withWorker();
    const m = enol();
    expect(m.atoms.length).toBeGreaterThan(IN_PLACE_MOST);
    const drawn = { atoms: [], bonds: [], flow: { sets: [{ id: 1, carried: [] }] }, held: { 1: [{ ...m, record: { of: "x" } }] } } as unknown as Drawn;
    await setRecordsAsked(drawn);
    expect(asked).toBe(1);
    expect(identityKnown(structureInputOf(m).input)).toBeDefined();
  });
  it("setRecordsAsked: a structure the page carries in a set is known once asked", async () => {
    withWorker();
    const m = enol();
    const drawn = { ...m, flow: { sets: [{ id: 1, carried: [{ structure: ids(m), record: { of: "x" } }] }] } } as unknown as Drawn;
    await setRecordsAsked(drawn);
    expect(asked).toBe(1);
    expect(identityKnown(structureInputOf(m).input)).toBeDefined();
  });
  it("drawnHashesAsked: known once asked", async () => {
    withWorker();
    const m = enol();
    await drawnHashesAsked(m, [ids(m)]);
    expect(asked).toBe(1);
    expect(identityKnown(structureInputOf(m).input)).toBeDefined();
  });
  it("placedRecord, not asked first (worked out in place): the same key as the structure without its hydrogen bond", async () => {
    withWorker();
    const m = enol();
    const put = placedRecord({}, m, ids(m), () => "given").of;
    expect(put).toBeDefined();
    withWorker();
    const plain = plainEnol();
    await new Promise<void>((go) => whenDrawnKnown([plain], go));
    expect(put).toBe(drawnHash(plain, ids(plain)));
  });
});
