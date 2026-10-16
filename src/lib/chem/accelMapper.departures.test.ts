import { describe, expect, it } from "vitest";
import { ACCEL_EXACT, Atoms, BondType, getMaps, kabsch, type Departures } from "./accelMapper";
import type { Molecule } from "./molecule";
import { ETHANE_BONDS, ethaneAtoms, molecule, moved, oxaElectrocyclisation, sn2, trueMap } from "./reactionMap.fixtures";

/**
 * Meno's three departures from ACCeL, each beside what ACCeL itself does
 * with the same input (docs/ATOM-MAPPING.md, *Where Meno departs from
 * ACCeL*). The ACCeL side is the port run exactly (ACCEL_EXACT), which
 * agrees with ACCeL 0.3.0 on each of these inputs.
 */

function atomsOf(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  for (const b of m.bonds) atoms.addBond(b.a1 + 1, b.a2 + 1, b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined);
  return atoms;
}

const only = (d: Partial<Departures>): Departures => ({ ...ACCEL_EXACT, ...d });
/** Each product atom's reactant atom, from 0. */
const firstMap = (product: Molecule, reactant: Molecule, departures: Departures) =>
  getMaps(atomsOf(product), atomsOf(reactant), { departures })[0].map((n) => n - 1);

describe("firstOfGroupByGeometry", () => {
  const { reactant, product, productOrder } = sn2();
  const walden = trueMap(["C", "Br", "Cl", "H0", "H1", "H2"], productOrder);

  it("ACCeL pairs an SN2 methyl's first hydrogen by atom order, so the methyl comes out turned", () => {
    expect(firstMap(product, reactant, ACCEL_EXACT)).toEqual([1, 3, 0, 4, 2, 5]);
    expect(firstMap(product, reactant, ACCEL_EXACT)).not.toEqual(walden);
  });

  it("Meno pairs it with the nearest, giving the Walden map whatever the atom order", () => {
    expect(firstMap(product, reactant, only({ firstOfGroupByGeometry: true }))).toEqual(walden);
    // the same product, its atoms in another order
    const names = productOrder;
    const atoms = Object.fromEntries(names.map((k, i) => [k, [product.atoms[i].el, [product.atoms[i].x, product.atoms[i].y, product.atoms[i].z]]])) as Record<
      string,
      [string, [number, number, number]]
    >;
    const order = ["H1", "Br", "H2", "C", "H0", "Cl"];
    const reordered = molecule(
      atoms,
      [
        ["C", "Cl", 1],
        ["C", "H0", 1],
        ["C", "H1", 1],
        ["C", "H2", 1],
      ],
      order,
      { jitter: false },
    );
    expect(firstMap(reordered, reactant, only({ firstOfGroupByGeometry: true }))).toEqual(trueMap(["C", "Br", "Cl", "H0", "H1", "H2"], order));
  });
});

describe("clampTorsionCosine", () => {
  // ethane exactly staggered, moved rigidly: one hydrogen exactly anti to another
  const e = ethaneAtoms();
  const reactant = molecule(e, ETHANE_BONDS, undefined, { jitter: false });
  const product = molecule(moved(e, 37, [0.3, -0.2, 0.5]), ETHANE_BONDS, ["H21", "C2", "H10", "H12", "C1", "H22", "H11", "H20"], { jitter: false });
  const fit = (map: number[]) => {
    const placed: number[][] = new Array(map.length);
    map.forEach((r, i) => (placed[r] = [product.atoms[i].x, product.atoms[i].y, product.atoms[i].z]));
    return kabsch(
      reactant.atoms.map((a) => [a.x, a.y, a.z]),
      placed,
    );
  };

  it("ACCeL loses the exactly-anti hydrogen to rounding, and turns one methyl against the other", () => {
    expect(fit(firstMap(product, reactant, ACCEL_EXACT))).toBeGreaterThan(0.8);
  });

  it("Meno keeps it, and the ethane fits itself", () => {
    expect(fit(firstMap(product, reactant, only({ clampTorsionCosine: true })))).toBeLessThan(1e-3);
  });
});

describe("skipUnflaggedFacePair", () => {
  const { reactant, product, productOrder } = oxaElectrocyclisation();

  it("ACCeL fails on an oxa-6π electrocyclisation (bool ^ None)", () => {
    expect(() => firstMap(product, reactant, ACCEL_EXACT)).toThrow(/NoneType/);
  });

  it("Meno leaves that pair of faces out of the score, and maps it", () => {
    expect(firstMap(product, reactant, only({ skipUnflaggedFacePair: true }))).toEqual(
      trueMap(["O1", "C2", "C3", "C4", "C5", "C6", "H2", "H3", "H4", "H5", "H6a", "H6b"], productOrder),
    );
  });
});
