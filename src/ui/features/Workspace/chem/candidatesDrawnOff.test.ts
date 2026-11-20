/**
 * The R/S and E/Z menu opens at once (chem/candidatesDrawn): a large structure's places are asked of identity off the drawing
 * thread, never worked out on it - a centre not yet answered is offered by its shape, and as identity says once the answer has
 * landed. PdCl2(PPh3)2's P are settled with no identity asked at all (found in review).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdentityInput } from "../../../../lib/chem/identity";
import { candidatesDrawn } from "./candidatesDrawn";
import { forgetIdentities } from "./identityOff";
import { drawnFromSmiles } from "./testdata/identityCases";
import { measured } from "../../../../testing/timeouts";

const onThread = vi.hoisted(() => ({ identities: 0 }));
vi.mock("../../../../lib/chem/identity", async (actual) => {
  const lib = await actual<typeof import("../../../../lib/chem/identity")>();
  return {
    ...lib,
    identity: (...args: Parameters<typeof lib.identity>) => {
      onThread.identities++;
      return lib.identity(...args);
    },
  };
});

const asked: string[] = [];
/** A worker that answers after the task at hand, as the real one does, by the actual library - not counted as on the thread. */
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: IdentityInput; kind?: string }) {
    asked.push(m.kind ?? "identity");
    void (async () => {
      const lib = await vi.importActual<typeof import("../../../../lib/chem/identity")>("../../../../lib/chem/identity");
      const { cageLabelled } = await import("./cageLabelled");
      const found = m.kind === "cage labels" ? { text: cageLabelled(m.input), complete: true } : lib.identity(m.input);
      setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, found } } as MessageEvent), 0);
    })();
  }
  terminate() {}
}
const withWorker = () => {
  (globalThis as { Worker?: unknown }).Worker = LaterWorker;
  asked.length = 0;
  onThread.identities = 0;
  forgetIdentities();
};
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
  forgetIdentities();
});
const answered = () => new Promise((done) => setTimeout(done, 50));

/** The atoms offered of `smiles` drawn, by element and place. */
const offered = (smiles: string) => {
  const m = drawnFromSmiles(smiles);
  const ask = candidatesDrawn(m);
  return m.atoms.flatMap((a, i) => (ask.atom(a.id) ? [`${a.el}${i}`] : []));
};

describe("the menu asks identity off the drawing thread (found in review)", () => {
  it("PdCl2(PPh3)2: no P offered, and no identity asked, here or of the worker", () => {
    withWorker();
    const ph3p = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
    expect(offered(`Cl[Pd](Cl)(${ph3p})${ph3p}`)).toEqual([]);
    expect(onThread.identities).toBe(0);
    expect(asked).toEqual([]);
  }, measured(800));

  it("a large structure's centre: offered by its shape while identity is asked, none worked out here; as identity says once answered", async () => {
    withWorker();
    const smiles = "CC(C)Cc1ccc(cc1)C(C)C(=O)OCCCCCCCCCC";
    expect(offered(smiles)).toEqual(["C10"]);
    expect(onThread.identities).toBe(0);
    expect(asked.length).toBeGreaterThan(0);
    await answered();
    expect(offered(smiles)).toEqual(["C10"]);
    expect(onThread.identities).toBe(0);
  }, measured(350));

  it("a large cage's bridgeheads: offered by shape while the CIP is asked off the thread; once answered, where the CIP labels them", async () => {
    withWorker();
    // (camphor with a long ester on its methyl: its two bridgeheads drawn, C4 at place 3 and C1 at place 6)
    const smiles = "CC1(C)[C@@H]2CC[C@@]1(COC(=O)CCCCCCCCC)C(=O)C2";
    expect(offered(smiles)).toEqual(["C3", "C6"]);
    expect(asked).toContain("cage labels");
    await answered();
    expect(offered(smiles)).toEqual(["C3", "C6"]);
    expect(onThread.identities).toBe(0);
  }, measured(1_000));
});
