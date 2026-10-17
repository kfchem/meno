import { describe, expect, it } from "vitest";
import {
  Atoms,
  BondType,
  SYMBOLS,
  canonicalize,
  combinations,
  getMapped,
  getMaps,
  incorporate,
  kabsch,
  pyIntSetAnd,
  pyRound1,
} from "./accelMapper";
import { ELEMENTS } from "./elements";
import type { Molecule } from "./molecule";
import { ETHANE_BONDS, dielsAlder, enol, ethaneAtoms, molecule, moved, sn2 } from "./reactionMap.fixtures";

/** A structure as ACCeL's read_mol reads a molfile. */
function atomsOf(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  for (const b of m.bonds) atoms.addBond(b.a1 + 1, b.a2 + 1, b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined);
  return atoms;
}

describe("Python's behaviour, as the original depends on it", () => {
  it("iterates an intersection of small-integer sets in CPython's order", () => {
    // each as CPython 3.12 gives list(set(a) & set(b))
    expect(pyIntSetAnd([11, 4], [4, 11, 20])).toEqual([11, 4]);
    expect(pyIntSetAnd([3, 11, 19], [19, 3, 11])).toEqual([11, 19, 3]);
    expect(pyIntSetAnd([0, 8, 16, 24], [24, 16, 8, 0])).toEqual([24, 16, 8, 0]);
    expect(pyIntSetAnd([1, 9, 17], [17, 9])).toEqual([17, 9]);
    expect(pyIntSetAnd([5, 13, 2, 21, 10], [21, 13, 5, 10, 2])).toEqual([2, 5, 10, 13, 21]);
    expect(pyIntSetAnd([], [1])).toEqual([]);
  });

  it("rounds to a tenth as round(x, 1) does, an exact half to the even tenth", () => {
    expect([0.25, 0.75, 1.25, 2.675, 0.35, 0.05, 3.45].map(pyRound1)).toEqual([0.2, 0.8, 1.2, 2.7, 0.3, 0.1, 3.5]);
  });

  it("gives combinations in itertools' order", () => {
    expect([...combinations([1, 2, 3, 4], 2)]).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
    expect([...combinations([1, 2], 3)]).toEqual([]);
  });

  it("numbers elements as ACCeL's table does: '' first, then by atomic number", () => {
    expect(SYMBOLS.length).toBe(ELEMENTS.length + 1);
    ELEMENTS.forEach((e, i) => expect(e.number).toBe(i + 1));
    expect(canonicalize("cl")).toBe("Cl");
    expect(canonicalize(" Br ")).toBe("Br");
    expect(canonicalize("Me")).toBe("");
  });
});

describe("_kabsch", () => {
  it("is zero for a structure moved rigidly, and the RMSD left otherwise", () => {
    const ref = [
      [0, 0, 0],
      [1.5, 0, 0],
      [1.9, 1.1, 0.3],
      [-0.4, -0.2, 1.2],
    ];
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    const tar = ref.map(([x, y, z]) => [c * x - s * z + 3, y - 1, s * x + c * z + 0.5]);
    expect(kabsch(ref, tar)).toBeLessThan(1e-12);
    // a mirror image is not a rotation
    const mirrored = ref.map(([x, y, z]) => [x, y, -z]);
    expect(kabsch(ref, mirrored)).toBeGreaterThan(0.1);
  });
});

describe("Modeler.incorporate", () => {
  it("sets the second structure past the first's far corner, 2 Å apart on each axis", () => {
    const a = atomsOf(molecule({ C: ["C", [0, 0, 0]], O: ["O", [1.2, 0.5, -0.3]] }, [["C", "O", 2]]));
    const b = atomsOf(molecule({ N: ["N", [-1, 2, 3]] }, []));
    incorporate(a, b);
    expect(a.length).toBe(3);
    const n = a.at(2);
    const o = a.at(1);
    // max of the first plus 2, the second's min moved there
    expect(n.x).toBeCloseTo(o.x + 2, 10);
    expect(n.y).toBeCloseTo(o.y + 2, 10);
    expect(n.z).toBeCloseTo(a.at(0).z + 2, 10);
    expect(a.bonds![0][1]).toBe(BondType.double);
  });
});

/**
 * The maps ACCeL 0.3.0's Modeler.get_maps gives for the same inputs (for
 * each product atom, its reactant atom's number, from 1), recorded from it.
 */
describe("get_maps, as ACCeL gives them", () => {
  it("ethane moved rigidly: both maps that fit, hydrogens included", () => {
    const e = ethaneAtoms();
    const r = atomsOf(molecule(e, ETHANE_BONDS));
    const p = atomsOf(molecule(moved(e, 37, [0.3, -0.2, 0.5]), ETHANE_BONDS, ["H21", "C2", "H10", "H12", "C1", "H22", "H11", "H20"]));
    expect(getMaps(p, r)).toEqual([
      [6, 2, 4, 3, 1, 7, 5, 8],
      [4, 1, 6, 8, 2, 5, 7, 3],
    ]);
  });

  it("an SN2 at a methyl", () => {
    const { reactant, product } = sn2();
    expect(getMaps(atomsOf(product), atomsOf(reactant))).toEqual([
      [2, 4, 1, 5, 3, 6],
      [2, 4, 1, 6, 3, 5],
    ]);
  });

  it("an enolisation: which methyl hydrogen goes to the oxygen", () => {
    const { reactant, product } = enol();
    expect(getMaps(atomsOf(product), atomsOf(reactant))).toEqual([
      [5, 3, 2, 7, 1, 4, 6],
      [5, 3, 2, 6, 1, 4, 7],
      [6, 3, 2, 5, 1, 4, 7],
      [7, 3, 2, 5, 1, 4, 6],
      [7, 3, 2, 6, 1, 4, 5],
      [6, 3, 2, 7, 1, 4, 5],
    ]);
  });

  it("a Diels-Alder reaction: 64 maps, the first the one it was made by", () => {
    const { reactants, product } = dielsAlder();
    const maps = getMaps(atomsOf(product), atomsOf(reactants[0]));
    expect(maps.length).toBe(64);
    expect(maps.slice(0, 4)).toEqual([
      [16, 3, 11, 7, 1, 10, 12, 5, 4, 13, 6, 8, 2, 15, 9, 14],
      [13, 3, 12, 7, 1, 10, 11, 5, 4, 16, 6, 8, 2, 14, 9, 15],
      [13, 2, 12, 9, 4, 8, 11, 6, 1, 16, 5, 10, 3, 14, 7, 15],
      [16, 2, 11, 9, 4, 8, 12, 6, 1, 13, 5, 10, 3, 15, 7, 14],
    ]);
    for (const m of maps) expect([...m].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
});

describe("get_mapped", () => {
  it("puts the product's atoms in the reactant's order, bonds with them", () => {
    const { reactant, product } = sn2();
    const p = atomsOf(product);
    const r = atomsOf(reactant);
    const [first] = getMapped(p, r);
    expect(first.list.map((a) => a.symbol)).toEqual(r.list.map((a) => a.symbol));
    // C (1) is bonded to Cl (3) in the product
    expect(first.bonds![0][2]).toBe(BondType.single);
    expect(first.bonds![0][1]).toBe(BondType.none);
  });

  it("gives nothing when a map leaves an atom out", () => {
    const { reactant } = sn2();
    const partial = molecule({ C: ["C", [0, 0, 0]], Cl: ["Cl", [-1.79, 0, 0]] }, [["C", "Cl", 1]]);
    expect(getMapped(atomsOf(partial), atomsOf(reactant))).toEqual([]);
  });
});
