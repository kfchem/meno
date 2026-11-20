// Held beside candidatesDrawn.test.ts and candidatesDrawnOff.test.ts: a centre two of whose groups are alike is offered where a group holds another centre drawn (a ring's far centre: 4-methylcyclohexanol), and not where none does; an undrawn cage atom is not offered, even while the CIP is still asked of the worker.
import { afterEach, describe, expect, it } from "vitest";
import type { IdentityInput } from "../../../../lib/chem/identity";
import { candidatesDrawn } from "./candidatesDrawn";
import { forgetIdentities } from "./identityOff";
import { drawnFromSmiles } from "./testdata/identityCases";
import { measured } from "../../../../testing/timeouts";

const offered = (smiles: string) => {
  const m = drawnFromSmiles(smiles);
  const ask = candidatesDrawn(m);
  return m.atoms.flatMap((a, i) => (ask.atom(a.id) ? [`${a.el}${i}`] : []));
};

describe("a centre with two alike groups, offered where a group holds another candidate", () => {
  // (both ring centres drawn: each alone turned is another structure - cis for trans - though two of its groups are alike)
  it.each([
    ["4-methylcyclohexanol: both ring centres", "C[C@H]1CC[C@@H](O)CC1", ["C1", "C4"]],
    ["1,4-cyclohexanediol", "O[C@H]1CC[C@@H](O)CC1", ["C1", "C4"]],
    ["1,4-dimethylcyclohexane", "C[C@H]1CC[C@@H](C)CC1", ["C1", "C4"]],
  ])("%s", (_what, smiles, want) => {
    expect(offered(smiles)).toEqual(want);
  });

  it.each([
    ["cyclohexanol: C1's ring neighbours alike, no other place", "OC1CCCCC1", []],
    ["propan-2-ol", "CC(C)O", []],
    ["neopentane", "CC(C)(C)C", []],
    ["triphenylphosphine", "P(c1ccccc1)(c1ccccc1)c1ccccc1", []],
  ])("and not %s", (_what, smiles, want) => {
    expect(offered(smiles)).toEqual(want);
  });
});

const asked: string[] = [];
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: IdentityInput; kind?: string }) {
    asked.push(m.kind ?? "identity");
    void (async () => {
      const lib = await import("../../../../lib/chem/identity");
      const { cageLabelled } = await import("./cageLabelled");
      const found = m.kind === "cage labels" ? { text: cageLabelled(m.input), complete: true } : lib.identity(m.input);
      setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, found } } as MessageEvent), 0);
    })();
  }
  terminate() {}
}
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
  forgetIdentities();
});

describe("an undrawn cage atom of a large structure", () => {
  it("is not offered, while the cage labels are pending nor once they have come: no configuration is drawn there", async () => {
    (globalThis as { Worker?: unknown }).Worker = LaterWorker;
    asked.length = 0;
    forgetIdentities();
    // (camphor with a long ester on its methyl, its bridgeheads undrawn: too large to be worked out in place)
    const smiles = "CC1(C)C2CCC1(COC(=O)CCCCCCCCC)C(=O)C2";
    expect(offered(smiles)).toEqual([]);
    expect(asked).not.toContain("cage labels");
    await new Promise((done) => setTimeout(done, 50));
    expect(offered(smiles)).toEqual([]);
  }, measured(550));
});
