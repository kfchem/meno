// Two donors a ligand holds flat are across (identity `heldFlat`): known answers beside arrangement.test.ts's, found in review and confirmed in the chemistry check.
import { describe, expect, it } from "vitest";
import type { LayoutInput } from "../layout/perceive";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { arrangementOpen } from "./identity";

// (each ligand from its SMILES, every donor - by `pick` - bonded to the metal, its H given up; then single donors)
function complex(el: string, ligands: [string, (g: LayoutInput, i: number) => boolean][], extra: string[]) {
  const atoms: LayoutInput["atoms"][number][] = [];
  const bonds: LayoutInput["bonds"][number][] = [];
  const donors: number[] = [];
  for (const [smiles, pick] of ligands) {
    const l = fromSmiles(smiles);
    const at = atoms.length;
    atoms.push(...l.atoms.map((a) => ({ ...a })));
    bonds.push(...l.bonds.map((b) => ({ ...b, a: b.a + at, b: b.b + at })));
    l.atoms.forEach((_, i) => pick(l, i) && donors.push(i + at));
  }
  const m = atoms.length;
  atoms.push({ el, hs: 0 } as LayoutInput["atoms"][number]);
  for (const d of donors) {
    if (atoms[d].hs) atoms[d] = { ...atoms[d], hs: atoms[d].hs! - 1 };
    bonds.push({ a: m, b: d, order: 1 } as LayoutInput["bonds"][number]);
  }
  for (const x of extra) {
    bonds.push({ a: m, b: atoms.length, order: 1 } as LayoutInput["bonds"][number]);
    atoms.push({ el: x, hs: 0 } as LayoutInput["atoms"][number]);
  }
  return arrangementOpen({ atoms, bonds } as LayoutInput, m);
}

const n = (g: LayoutInput, i: number) => g.atoms[i].el === "N";
const nOrMinusO = (g: LayoutInput, i: number) => g.atoms[i].el === "N" || (g.atoms[i].el === "O" && g.atoms[i].charge === -1);
/** A phosphine, or an ether O (two bonds, no H). */
const popPick = (g: LayoutInput, i: number) => g.atoms[i].el === "P" || (g.atoms[i].el === "O" && g.atoms[i].hs === 0 && g.bonds.filter((b) => b.a === i || b.b === i).length === 2);

describe("two donors a ligand holds flat are across: what the first test of the kind leaves", () => {
  it("a tridentate whose two chelate rings are of six: closed (2,6-bis(2-phenolato)pyridine, an O,N,O pincer, is meridional only)", () => {
    expect(complex("Co", [["[O-]c1ccccc1-c1cccc(-c2ccccc2[O-])n1", nOrMinusO]], ["Cl", "Cl", "Cl"])).toBe(false);
  });
  it("a porphine and a terpyridine written with single and double bonds (no aromatic bond, a pyrrole's N by its neighbours): closed", () => {
    expect(complex("Fe", [["C1=CC2=CC3=CC=C(N3)C=C4C=CC(=N4)C=C5C=CC(=N5)C=C1N2", n]], ["Cl", "Cl"])).toBe(false);
    expect(complex("Co", [["C1=CC=NC(=C1)C2=CC=CC(=N2)C3=CC=CC=N3", n]], ["Cl", "Cl", "Cl"])).toBe(false);
  });
  it("pairs that cannot all be had together close nothing: five pyridines in a row, each middle one holds its two outer neighbours across (N1-N3, N2-N4, N3-N5 at once is no pairing), so the metal stays open", () => {
    expect(complex("Co", [["c1ccc(nc1)-c1cccc(n1)-c1cccc(n1)-c1cccc(n1)-c1ccccn1", n]], ["Cl"])).toBe(true);
  });
  it("an ether O between two rings (xanthene's, in Xantphos) is not held flat for sure: its POP stays open", () => {
    expect(complex("Co", [["CC1(C)c2cccc(P(c3ccccc3)c3ccccc3)c2Oc2c(P(c3ccccc3)c3ccccc3)cccc21", popPick]], ["Cl", "Cl", "Cl"])).toBe(true);
  });
});
