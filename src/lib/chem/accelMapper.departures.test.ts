import { describe, expect, it } from "vitest";
import { ACCEL_EXACT, Atom, Atoms, BondType, MENO_DEPARTURES, _det_ez, acosOf, getMaps, kabsch, type Departures } from "./accelMapper";
import type { Molecule } from "./molecule";
import {
  ETHANE_BONDS,
  acetoneEnol,
  chlorineShift,
  ethaneAtoms,
  ethylSn2,
  methaneChlorine,
  molecule,
  moved,
  oxaElectrocyclisation,
  sn2,
  trueMap,
  turnedMethyl,
} from "./reactionMap.fixtures";

/**
 * Meno's departures from ACCeL, each beside what ACCeL itself does
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

describe("clampEzCosine", () => {
  // a torsion exactly anti, as written to four places: its cosine rounds just past -1
  const [a, b, c, d] = [
    [0.3392, -1.2505, 0.1056],
    [0, 0, 0],
    [-1.448, -0.39, 0.0329],
    [-1.7873, 0.8605, -0.0727],
  ].map((p) => new Atom("C", p[0], p[1], p[2]));

  it("ACCeL reads an exactly anti torsion as not E (arccos not a number)", () => {
    // as ACCeL 0.3.0's _det_ez gives for these four points
    expect(_det_ez(a, b, c, d)).toBe(false);
  });

  it("Meno reads it as E", () => {
    expect(_det_ez(a, b, c, d, true)).toBe(true);
  });
});

describe("clampFaceCosine", () => {
  // the face tests ask whether an angle is 90 degrees or more: of a cosine rounded past -1
  const cos = -1.0000000000000002;

  it("ACCeL reads it as not a number, so under 90 degrees", () => {
    // np.degrees(np.arccos(-1.0000000000000002)) >= 90 is False
    expect((acosOf(cos, false) * 180) / Math.PI >= 90).toBe(false);
  });

  it("Meno reads it as 180 degrees", () => {
    expect((acosOf(cos, true) * 180) / Math.PI >= 90).toBe(true);
  });

  it("leaves a cosine that is not a number (a zero vector's) as it was", () => {
    expect(Number.isNaN(acosOf(NaN, true))).toBe(true);
  });
});

describe("signedTorsion", () => {
  const { reactant, product, productOrder } = turnedMethyl();
  const unturned = trueMap(["C", "O", "Cl", "H0", "H1", "H2"], productOrder);

  it("ACCeL pairs the hydrogens furthest from 0 degrees on each side, -124 with +125, so the methyl comes out turned 120 degrees", () => {
    const map = firstMap(product, reactant, ACCEL_EXACT);
    expect(map).not.toEqual(unturned);
    expect(map[productOrder.indexOf("H1")]).toBe(3); // product H1 (+125) from reactant H0 (-124)
  });

  it("Meno pairs it with the one nearest its torsion, sign and all: the methyl turned 5 degrees", () => {
    expect(firstMap(product, reactant, only({ signedTorsion: true }))).toEqual(unturned);
  });
});

describe("fewestBondChanges", () => {
  const { reactant, product, productOrder } = chlorineShift();
  const names = ["C1", "C2", "O", "H1", "Cl", "Ha", "Hb"];
  /** The bonds a map makes or breaks, by the reactant's atom names. */
  const changes = (map: number[]): string[] => {
    const bonds = (m: Molecule, name: (i: number) => string) => new Set(m.bonds.map((b) => [name(b.a1), name(b.a2)].sort().join("-")));
    const before = bonds(reactant, (i) => names[i]);
    const after = bonds(product, (j) => names[map[j]]);
    return [...before, ...after].filter((b) => before.has(b) !== after.has(b)).sort();
  };

  it("ACCeL puts first a map that moves the oxygen and the CH2's hydrogens, to keep from bonding two sp3 carbons", () => {
    const map = firstMap(product, reactant, ACCEL_EXACT);
    expect(names[map[productOrder.indexOf("C1")]]).toBe("C2");
    expect(changes(map).length).toBeGreaterThan(4);
  });

  it("Meno puts first the map with the fewest bonds made or broken: the chlorine and a hydrogen trade places", () => {
    const map = firstMap(product, reactant, only({ fewestBondChanges: true }));
    expect(changes(map)).toEqual(["C1-Cl", "C1-H1", "C2-Cl", "C2-H1"]);
  });
});

describe("transferAlignedH", () => {
  describe("CH4 + Cl -> CH3 + HCl, the chlorine in line with H2", () => {
    const { reactant, product, productOrder } = methaneChlorine();
    const names = ["C", "H0", "H1", "H2", "H3", "Cl"];
    const taken = (departures: Departures) => names[firstMap(product, reactant, departures)[productOrder.indexOf("H2")]];

    it("ACCeL has the chlorine take H1, which points away from it", () => {
      expect(taken(ACCEL_EXACT)).toBe("H1");
    });

    it("Meno has it take H2, the hydrogen already on the line C-H...Cl", () => {
      expect(taken(only({ transferAlignedH: true }))).toBe("H2");
    });
  });

  describe("acetone -> its enol, Hm0 eclipsing the C=O", () => {
    const names = ["C1", "C2", "C3", "O", "Hm0", "Hm1", "Hm2", "Hn0", "Hn1", "Hn2"];
    const onOxygen = (torsions: [number, number, number] | undefined, departures: Departures) => {
      const { reactant, product, productOrder } = acetoneEnol(torsions);
      return names[firstMap(product, reactant, departures)[productOrder.indexOf("Hm0")]];
    };
    const without = { ...MENO_DEPARTURES, transferAlignedH: false, localLeastTurn: false };

    it("without it, the hydrogen that moves to the oxygen is Hm2, 120 degrees round from the C=O", () => {
      expect(onOxygen(undefined, without)).toBe("Hm2");
    });

    it("with it, the one that moves is Hm0, in line with the C=O, as a 1,3-shift passes it", () => {
      expect(onOxygen(undefined, { ...without, transferAlignedH: true })).toBe("Hm0");
    });

    it("leaves ACCeL's choice where the nearest is nearer by under 60 degrees (Hm0 50 degrees round, Hm2 70): too close to tell", () => {
      const ties: [number, number, number] = [50, 170, -70];
      expect(onOxygen(ties, without)).toBe("Hm2");
      expect(onOxygen(ties, { ...without, transferAlignedH: true })).toBe("Hm2");
    });
  });
});

describe("localLeastTurn", () => {
  const { reactant, product, productOrder } = ethylSn2();
  const names = ["C", "Br", "Cl", "Cm", "Ha", "Hb", "Hm0", "Hm1", "Hm2"];
  const ch2 = (departures: Departures) => {
    const map = firstMap(product, reactant, departures);
    return ["Ha", "Hb"].map((h) => names[map[productOrder.indexOf(h)]]);
  };

  it("ACCeL swaps an SN2's CH2 hydrogens, reading the inverted centre as kept", () => {
    expect(ch2(ACCEL_EXACT)).toEqual(["Hb", "Ha"]);
  });

  it("Meno keeps each where it stood about the C-C and the axis of attack, as the umbrella folds", () => {
    expect(ch2(only({ localLeastTurn: true }))).toEqual(["Ha", "Hb"]);
    expect(ch2(MENO_DEPARTURES)).toEqual(["Ha", "Hb"]);
  });
});
