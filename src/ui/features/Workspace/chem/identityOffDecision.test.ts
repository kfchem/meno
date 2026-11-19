/**
 * Where a grouped structure's identity is worked out: here where its atoms times its writings are within `IN_PLACE_MOST`, at the bound
 * too; past it, asked of the worker (chem/identityOff `identityKnown`; found in review).
 */
import { afterEach, describe, expect, it } from "vitest";
import { identity, type IdentityGroup, type IdentityInput } from "../../../../lib/chem/identity";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { forgetIdentities, identityKnown, IN_PLACE_MOST } from "./identityOff";

let asked = 0;
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: IdentityInput }) {
    asked++;
    const found = identity(m.input);
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
const answered = () => new Promise((done) => setTimeout(done, 5));

const input = (smiles: string, groups: IdentityGroup[]): IdentityInput => ({ ...(smilesInput(smiles) as unknown as IdentityInput), groups });
const and = (...atoms: number[]): IdentityGroup => ({ kind: "and", atoms });

describe("a grouped structure's identity, here or of the worker (found in review)", () => {
  it("is worked out here where its atoms times its writings are at most the bound: 4 atoms, two groups - exactly 16", () => {
    withWorker();
    const small = input("CCCC", [and(0), and(1)]);
    expect(small.atoms.length * 2 ** 2).toBe(IN_PLACE_MOST);
    expect(identityKnown(small)).toEqual(identity(small));
    expect(asked).toBe(0);
  });

  it("is asked of the worker where they pass it, though its atoms are few: 6 atoms, two groups - 24 - pending, then known once answered", async () => {
    withWorker();
    const grouped = input("C[C@@H](O)[C@H](O)C", [and(1), and(3)]);
    expect(grouped.atoms.length).toBeLessThan(IN_PLACE_MOST);
    expect(identityKnown(grouped)).toBeUndefined();
    await answered();
    expect(asked).toBe(1);
    expect(identityKnown(grouped)).toEqual(identity(grouped));
  });

  it("and the same structure with one group is worked out here (12), and with none (6)", () => {
    withWorker();
    expect(identityKnown(input("C[C@@H](O)[C@H](O)C", [and(1)]))).toBeDefined();
    expect(identityKnown({ ...input("C[C@@H](O)[C@H](O)C", []), groups: undefined })).toBeDefined();
    expect(asked).toBe(0);
  });
});
