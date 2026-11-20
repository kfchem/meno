/**
 * Part 12b's move, held: each caller moved onto the core's one count (./hydrogens `hydrogenCounts`) counts as it did, on the
 * inputs it is given - a Kekule structure (a drawing's, a ligand's, a file's), with its hydrogens implicit or drawn as atoms. Its old
 * count, copied here as it stood, against the core's, for every atom of the layout benchmark, the held-out set and the probes.
 * - lib/chem/ligands `structureFormula`: its bonds by `valenceOrder`, a radical not passed (its atoms carry none);
 * - lib/chem/reactionMap `shortOfHydrogens`: orders 1 to 3, an aromatic one as one and a half, rounded; any other type nothing;
 * - lib/chem/metalHolds `donorCharge`: its bonds' orders as drawn, a haptic bond's none.
 */
import { describe, expect, it } from "vitest";
import molecules from "../../../../scripts/layout/molecules.json";
import heldOut from "../../../../scripts/layout/heldout.json";
import { readSmiles } from "../smiles";
import { hydrogenCounts, implicitHydrogens, valenceOrder } from "./hydrogens";
import { kekuleOrders } from "./kekule";

const PROBES = [
  "c1cc[nH]c1", "c1ccncc1", "c1c[nH]cn1", "CC(=O)[O-]", "C[NH3+]", "O=P(c1ccccc1)c1ccccc1", "CS(C)=O", "CS(C)(=O)=O",
  "F[P-](F)(F)(F)(F)F", "ClC(Cl)C", "C[N+](=O)[O-]", "Cl[Pd](Cl)(n1ccccc1)n1ccccc1", "[NH3][Pt](Cl)(Cl)[NH3]", "[O-][N+](=O)c1ccccc1",
];
/** Each structure as a caller is given it: Kekule orders; and with every hydrogen the core gives an atom drawn as one. */
const structures = (() => {
  const out: { name: string; atoms: { el: string; charge?: number; hs?: number }[]; bonds: { a: number; b: number; order: number }[] }[] = [];
  for (const smiles of [...molecules.molecules.map((m) => m.smiles), ...heldOut.molecules.map((m) => m.smiles), ...PROBES]) {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0, hs: a.hs })), s.bonds);
    const atoms = s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) }));
    const bonds = s.bonds.map((b, k) => ({ a: b.a1, b: b.a2, order: orders[k] }));
    out.push({ name: smiles, atoms, bonds });
    // (every hydrogen drawn as an atom)
    const hs = hydrogenCounts(s.atoms.map((a) => ({ el: a.el, charge: a.charge, ...(a.hs != null ? { hs: a.hs } : {}) })), bonds);
    const withH = { name: `${smiles} (H drawn)`, atoms: [...atoms], bonds: [...bonds] };
    hs.forEach((n, i) => {
      for (let k = 0; k < n; k++) {
        withH.atoms.push({ el: "H" });
        withH.bonds.push({ a: i, b: withH.atoms.length - 1, order: 1 });
      }
    });
    out.push(withH);
  }
  return out;
})();
const core = (s: (typeof structures)[number]) => hydrogenCounts(s.atoms, s.bonds);

describe("part 12b: each caller moved onto the core's one count counts as before", () => {
  it("the structures are many: the benchmark, the held-out set and the probes, each with its hydrogens implicit and drawn", () => {
    expect(structures.length).toBe(2 * (molecules.molecules.length + heldOut.molecules.length + PROBES.length));
  });

  it("ligands' formula: its bonds by valenceOrder", () => {
    for (const s of structures) {
      const sums = s.atoms.map(() => 0);
      for (const b of s.bonds) {
        sums[b.a] += valenceOrder(b, s.atoms[b.a].el);
        sums[b.b] += valenceOrder(b, s.atoms[b.b].el);
      }
      expect(core(s), s.name).toEqual(s.atoms.map((a, i) => implicitHydrogens(a.el, sums[i], a.charge ?? 0)));
    }
  });

  it("reactionMap's short of hydrogens: orders 1 to 3, an aromatic one as one and a half", () => {
    for (const s of structures) {
      const sums = s.atoms.map(() => 0);
      for (const b of s.bonds) {
        const o = b.order === 4 ? 1.5 : b.order >= 1 && b.order <= 3 ? b.order : 0;
        sums[b.a] += o;
        sums[b.b] += o;
      }
      expect(core(s).some((h) => h > 0), s.name).toBe(s.atoms.some((a, i) => implicitHydrogens(a.el, Math.round(sums[i]), a.charge ?? 0) > 0));
    }
  });

  it("metalHolds' donor: its bonds' orders as drawn", () => {
    for (const s of structures) {
      const drawn = s.atoms.map(() => 0);
      for (const b of s.bonds) {
        drawn[b.a] += b.order;
        drawn[b.b] += b.order;
      }
      expect(core(s), s.name).toEqual(s.atoms.map((a, i) => implicitHydrogens(a.el, drawn[i], a.charge ?? 0)));
    }
  });
});
