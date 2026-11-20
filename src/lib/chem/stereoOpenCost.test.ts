// Held beside stereoOpen.test.ts: stereoLeft asks the core about an atom's kind only where the answer can be an N+ with an H. Each
// ask of `notCandidate` reads the whole structure again, so asked of every flagged centre it costs the flagged centres times the
// structure: a chain of glucose units with every ring carbon flagged took 360 ms at 40 units against 3 ms without it.
import { describe, expect, it, vi } from "vitest";
import { readSmiles } from "./smiles";

const asked = vi.hoisted(() => ({ n: 0 }));
vi.mock("./perception/stereo/candidates", async (original) => {
  const actual = await original<typeof import("./perception/stereo/candidates")>();
  return {
    ...actual,
    notCandidate: (...args: Parameters<typeof actual.notCandidate>) => {
      asked.n++;
      return actual.notCandidate(...args);
    },
  };
});
import { stereoLeft } from "./stereoOpen";

const mol = (smiles: string) => {
  const s = readSmiles(smiles);
  return { atoms: s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0, ...(a.hs != null ? { hs: a.hs } : {}) })), bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) };
};
const flag = (atoms: { el: string }[], only: (el: string) => boolean) => atoms.flatMap((a, at) => (only(a.el) ? [{ kind: "centre" as const, at, state: "unspecified" as const }] : []));

describe("stereoLeft's rule by an atom's kind", () => {
  it("asks the core nothing of flagged centres that are no N+: the ring carbons of a chain of twelve glucose units", () => {
    let smiles = "OC1C(O)C(O)C(CO)OC1";
    for (let i = 1; i < 12; i++) smiles = `C1(O${smiles})C(O)C(O)C(CO)OC1`;
    const m = mol(smiles);
    asked.n = 0;
    const left = stereoLeft(flag(m.atoms, (el) => el === "C"), m.atoms, m.bonds);
    expect(left.atoms.length).toBeGreaterThan(30);
    expect(asked.n).toBe(0);
  });

  it("still asks it of an N+, which is the one atom whose answer it needs", () => {
    const m = mol("C[NH+](CC)CCC");
    asked.n = 0;
    expect(stereoLeft(flag(m.atoms, (el) => el === "N"), m.atoms, m.bonds).atoms).toEqual([]);
    expect(asked.n).toBeGreaterThan(0);
  });
});
