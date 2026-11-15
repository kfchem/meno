import { afterEach, describe, expect, it } from "vitest";
import { identity, identityKeyOf } from "../../../../lib/chem/identity";
import { NOT_YET } from "../../../../lib/table";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawnHash, recordNow, whenDrawnKnown } from "../workflow/entries";
import { identityInputOf, labelsDrawnOut } from "./identityOf";
import { constitutionKnown, forgetIdentities, identitiesAsked, identityKnown, IN_PLACE_MOST, useIdentitiesAnswered } from "./identityOff";

// Identities worked out off the drawing thread (./identityOff): a worker stood in for by one that answers later, on a timer, as a
// real one answers after the drawing thread has gone on - what the drawing thread does in the meantime is what is tested.

/** How many structures the stand-in worker has been asked for. */
let asked = 0;
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: Parameters<typeof identity>[0] }) {
    asked++;
    setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, found: identity(m.input) } } as MessageEvent), 0);
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
const answered = () => new Promise((done) => setTimeout(done, 5));

const PPH3 = "P(c1ccccc1)(c1ccccc1)c1ccccc1";

describe("a structure's identity, off the drawing thread", () => {
  it("is pending on the drawing thread where it is large and not yet answered, asked of the worker once, and known once answered", async () => {
    withWorker();
    const large = identityInputOf(drawnFromSmiles(PPH3)).input;
    expect(large.atoms.length).toBeGreaterThan(IN_PLACE_MOST);
    const before = useIdentitiesAnswered.getState().answered;
    expect(identityKnown(large)).toBeUndefined();
    expect(identityKnown(large)).toBeUndefined();
    await answered();
    expect(asked).toBe(1);
    expect(identityKnown(large)).toEqual(identity(large));
    expect(useIdentitiesAnswered.getState().answered).toBe(before + 1);
  });

  it("is worked out here where it is small, the worker not asked", () => {
    withWorker();
    const small = identityInputOf(drawnFromSmiles("CC(O)C")).input;
    expect(identityKnown(small)).toEqual(identity(small));
    expect(asked).toBe(0);
  });

  it("is known by what it is, not where it lies: the same structure moved is answered at once", async () => {
    withWorker();
    const m = drawnFromSmiles(PPH3);
    await identitiesAsked([identityInputOf(m).input]);
    const moved = { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x + 3, y: a.y - 2 })) };
    expect(identityKnown(identityInputOf(moved).input)).toBeDefined();
    expect(asked).toBe(1);
  });
});

describe("what waits on an identity", () => {
  it("keeps a record as it stands while its structure's identity is pending - never taken for another - and judges it once known", async () => {
    withWorker();
    const m = drawnFromSmiles(PPH3);
    const ids = m.atoms.map((a) => a.id);
    const record = { of: "not this structure", properties: { x: { value: 1, unit: "none" as const, status: "computed" as const } } };
    expect(drawnHash(m, ids)).toBeUndefined();
    expect(recordNow(record, m, ids)).toBe(record);
    await answered();
    expect(recordNow(record, m, ids)?.properties).toBeUndefined();
  });

  it("puts a step's structures down once their identities are known: at once where they are, after the answer where not", async () => {
    withWorker();
    let ran = 0;
    whenDrawnKnown([drawnFromSmiles("CC(O)C")], () => ran++);
    expect(ran).toBe(1);
    whenDrawnKnown([drawnFromSmiles(PPH3)], () => ran++);
    expect(ran).toBe(1);
    await answered();
    expect(ran).toBe(2);
  });

  it("writes a table's constitution cell as still being worked out while pending, and its key once answered", async () => {
    withWorker();
    const input = identityInputOf(labelsDrawnOut(drawnFromSmiles(PPH3))).input;
    expect(constitutionKnown(input)).toBe(NOT_YET);
    await answered();
    expect(constitutionKnown(input)).toBe(identityKeyOf(identity(input).text));
  });
});
