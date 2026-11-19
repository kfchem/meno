/**
 * Part 12c's move, held: the page's undrawn hydrogens (chem/drawing `undrawnHydrogens`) counted by the core's one count, with a valence a
 * file sets first, count as the page's own count did - its copy here as it stood - on every atom of the identity cases and the probes,
 * their hydrogens implicit and drawn as atoms, dative and coordination bonds and a set valence among them.
 */
import { describe, expect, it } from "vitest";
import { implicitHydrogens, setValenceOrder, valenceOrder } from "../../../../lib/chem/molecule";
import { metal } from "../../../../lib/chem/perception/elements";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { undrawnHydrogens } from "./drawing";
import { drawnFromSmiles, IDENTITY_CASES } from "./testdata/identityCases";

/** The page's count as it stood before the move. */
function before(model: Model): Map<number, number> {
  const sum = new Map<number, number>();
  const setSum = new Map<number, number>();
  const el = new Map(model.atoms.map((a) => [a.id, a.el]));
  const toMetals = new Map<number, number>();
  for (const b of model.bonds) {
    sum.set(b.a, (sum.get(b.a) ?? 0) + valenceOrder(b, el.get(b.a)));
    sum.set(b.b, (sum.get(b.b) ?? 0) + valenceOrder(b, el.get(b.b)));
    if (metal.has(el.get(b.b) ?? "")) toMetals.set(b.a, (toMetals.get(b.a) ?? 0) + valenceOrder(b, el.get(b.a)));
    if (metal.has(el.get(b.a) ?? "")) toMetals.set(b.b, (toMetals.get(b.b) ?? 0) + valenceOrder(b, el.get(b.b)));
    setSum.set(b.a, (setSum.get(b.a) ?? 0) + setValenceOrder(b, el.get(b.a)));
    setSum.set(b.b, (setSum.get(b.b) ?? 0) + setValenceOrder(b, el.get(b.b)));
  }
  return new Map(
    model.atoms.map((a) => [
      a.id,
      !isElementSymbol(a.el) || a.abbrev
        ? 0
        : a.valence != null
          ? Math.max(0, a.valence - (setSum.get(a.id) ?? 0))
          : implicitHydrogens(a.el, sum.get(a.id) ?? 0, a.charge ?? 0, a.radical, toMetals.get(a.id) ?? 0),
    ]),
  );
}

const PROBES = [
  "c1cc[nH]c1", "c1ccncc1", "CC(=O)[O-]", "C[NH3+]", "O=[PH](c1ccccc1)c1ccccc1", "P(=O)(OC)OC", "CS(C)=O", "CS(C)(=O)=O", "CS=O",
  "F[P-](F)(F)(F)(F)F", "C[N+](=O)[O-]", "Cl[Pd](Cl)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1", "[NH3][Pt](Cl)(Cl)[NH3]",
  "[2H]C([2H])([2H])O", "[CH3]", "[CH2]", "C[Si](C)(C)C", "B(F)(F)F", "[BH4-]",
];
/** Each structure drawn; with every H the page counts drawn as an atom too; and with a dative bond and a set valence. */
const models = (() => {
  const out: { name: string; model: Model }[] = [];
  for (const smiles of [...IDENTITY_CASES.map((c) => c.smiles), ...PROBES]) {
    const model = drawnFromSmiles(smiles);
    out.push({ name: smiles, model });
    const hs = before(model);
    let id = Math.max(0, ...model.atoms.map((a) => a.id), ...model.bonds.map((b) => b.id)) + 1;
    const atoms = [...model.atoms];
    const bonds = [...model.bonds];
    for (const a of model.atoms)
      for (let k = 0; k < (hs.get(a.id) ?? 0); k++) {
        const h = id++;
        atoms.push({ ...a, id: h, el: "H", charge: undefined, radical: undefined, valence: undefined, x: a.x + 0.5, y: a.y + 0.5 * k });
        bonds.push({ id: id++, a: a.id, b: h, order: 1 });
      }
    out.push({ name: `${smiles} (H drawn)`, model: { ...model, atoms, bonds } });
  }
  // (an amine on a borane by a dative bond, and a carbon with a valence a file sets)
  const adduct = drawnFromSmiles("NB");
  out.push({ name: "H3N->BH3", model: { ...adduct, bonds: adduct.bonds.map((b) => ({ ...b, dative: true })) } });
  const set = drawnFromSmiles("CC");
  out.push({ name: "C with valence 3", model: { ...set, atoms: set.atoms.map((a, i) => (i === 0 ? { ...a, valence: 3 } : a)) } });
  return out;
})();

describe("part 12c: the page's undrawn hydrogens by the core's one count, as before", () => {
  it("every atom of the identity cases and the probes, hydrogens implicit and drawn, a dative bond and a set valence", () => {
    expect(models.length).toBe(2 * (IDENTITY_CASES.length + PROBES.length) + 2);
    for (const { name, model } of models) expect([...undrawnHydrogens(model)], name).toEqual([...before(model)]);
  }, 120_000);
});
