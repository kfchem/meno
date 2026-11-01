import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { canFlip, conformersSought, conformersSoughtOf, FEW_CONFORMERS, MOST_CONFORMERS, RING_CONFORMERS, soughtNumber, soughtOptions, turningBonds, type SoughtAtom, type SoughtBond } from "./conformersSought";

/** A molecule as the count reads it, from SMILES written with its double bonds (a Kekulé structure, as Meno draws one). */
function mol(smiles: string): { atoms: SoughtAtom[]; bonds: SoughtBond[] } {
  const s = readSmiles(smiles);
  return { atoms: s.atoms.map((a) => ({ el: a.el, charge: a.charge ?? 0 })), bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) };
}
const sought = (smiles: string) => {
  const m = mol(smiles);
  return conformersSought(m.atoms, m.bonds);
};
const turns = (smiles: string) => {
  const m = mol(smiles);
  return turningBonds(m.atoms, m.bonds).length;
};
const flips = (smiles: string) => {
  const m = mol(smiles);
  return canFlip(m.atoms, m.bonds);
};

describe("how many conformers are tried of a molecule", () => {
  it("tries few of a molecule that has only the one shape", () => {
    // (benzene; caffeine; adamantane and norbornane, held by their bridges; neopentane, whose one turn gives the same shape)
    for (const smiles of ["C1=CC=CC=C1", "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "C1C2CC3CC1CC(C2)C3", "C1CC2CCC1C2", "CC(C)(C)C"]) expect(sought(smiles), smiles).toBe(FEW_CONFORMERS);
  });

  it("tries more of a ring that can flip than its turning bonds would ask", () => {
    for (const smiles of ["C1CCCCC1", "C1=CC=C(C=C1)C1CCCCC1", "C1CCNCC1", "OCC1OC(O)C(O)C(O)C1O"]) expect(sought(smiles), smiles).toBeGreaterThanOrEqual(RING_CONFORMERS);
    // (a six-ring lying on a thirteen-ring can flip: ten carbons round the back are no bridge; a bicyclo[2.2.2]octane's are)
    expect(sought("C1CCCCCCCCCC2CCCC1C2")).toBeGreaterThanOrEqual(RING_CONFORMERS);
    expect(sought("C1CC2CCC1CC2")).toBe(FEW_CONFORMERS);
  });

  it("tries by the bonds that turn where no ring can flip: Ebejer, Morris and Deane's rule", () => {
    expect(sought("CC(C)CC1=CC=C(C=C1)C(C)C(=O)O")).toBe(50); // (ibuprofen: four)
    expect(sought("CCCCCCCCCCC")).toBe(200); // (undecane: eight)
    expect(sought("CCCCCCCCCCCCCCCC")).toBe(300); // (hexadecane: thirteen)
  });

  it("asks the same whether or not the molecule carries its hydrogens", () => {
    for (const smiles of ["C1=CC=C(C=C1)C1CCCCC1", "CCCCCC", "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"]) {
      const m = mol(smiles);
      const atoms = [...m.atoms];
      const bonds = [...m.bonds];
      // (a hydrogen on every carbon, as a molecule read back from 3D has them)
      m.atoms.forEach((a, i) => {
        if (a.el !== "C") return;
        atoms.push({ el: "H" });
        bonds.push({ a: i, b: atoms.length - 1, order: 1 });
      });
      expect(conformersSought(atoms, bonds), smiles).toBe(conformersSought(m.atoms, m.bonds));
    }
  });
});

describe("the bonds that turn", () => {
  it("are single bonds outside rings with more beyond each end", () => {
    expect(turns("CCCC")).toBe(1);
    expect(turns("CC")).toBe(0);
    expect(turns("C1=CC=C(C=C1)C1=CC=CC=C1")).toBe(1); // (biphenyl)
  });

  it("count a bond held flat whose two flat forms are two shapes - an amide's cis and trans, an ester's Z and E - and not one whose forms are one", () => {
    expect(turns("CC(=O)NC")).toBe(1);
    expect(turns("CCOC(=O)C")).toBe(2); // (its C(=O)-O, and its O-ethyl)
    expect(turns("CSC(=O)C")).toBe(1);
    // (an N,N-dimethylamide's two forms are one shape, its methyls alike; an N-ethyl-N-methyl's are two)
    expect(turns("CC(=O)N(C)C")).toBe(0);
    expect(sought("CC(=O)N(C)C")).toBe(FEW_CONFORMERS);
    expect(turns("CC(=O)N(C)CC")).toBe(2);
  });

  it("leave out a symmetric top, whose turn by a third gives the same shape", () => {
    expect(turns("FC(F)(F)C1=CC=CC=C1")).toBe(0);
    expect(turns("CC(C)(C)C1=CC=CC=C1")).toBe(0);
    expect(turns("C[Si](C)(C)OCC")).toBe(1); // (the O-ethyl, not the trimethylsilyl)
  });

  it("count a straight line once, and not at all where an end has nothing beyond it", () => {
    expect(turns("C1=CC=C(C=C1)C#CC1=CC=CC=C1")).toBe(1); // (diphenylacetylene: its rings turn against each other)
    expect(turns("CC#CCC")).toBe(0); // (2-pentyne)
    expect(turns("CCCC#N")).toBe(1); // (butyronitrile: the C-C, not the C-CN)
    // (an allene's end is on no line - its ethyl turns - nor is a sulfonyl's S, of two double bonds)
    expect(turns("CC=C=CCC")).toBe(1);
    expect(turns("C1=CC=C(C=C1)S(=O)(=O)NC")).toBe(2);
  });
});

describe("a ring that can flip", () => {
  it("is none held flat by 4n + 2 pi electrons - pyrrole's, a pyridone's, tropone's, azulene's five-ring, an ion's", () => {
    for (const smiles of ["C1=CNC=C1", "C1=COC=C1", "C1=CSC=C1", "C1=CC=C2C(=C1)C=CN2", "O=C1C=CC=CN1", "O=C1C=CC=CC=C1", "C1=CC2=CC=CC=CC2=C1", "[CH-]1C=CC=C1", "[CH+]1C=CC=CC=C1"])
      expect(flips(smiles), smiles).toBe(false);
  });

  it("is one with an atom out of the pi system, or of 4n pi electrons: cyclopentadiene's CH2, cyclooctatetraene's tub", () => {
    for (const smiles of ["C1C=CC=C1", "C1=CC=CC=CC=C1", "C1CC2=CC=CC=C2C1", "C=C1C=CC=C1"]) expect(flips(smiles), smiles).toBe(true);
  });

  it("is none whose atoms are bound to a metal through a star at their centre: a metallocene's", () => {
    // (ferrocene as Meno writes it from a drawing: two rings drawn neutral, a CH2 in each, a star at each centre)
    const rows = ["M  V30 1 Fe 0 0 0 0"];
    const bonds: string[] = [];
    for (const [base, y] of [[2, 1.5], [7, -1.5]]) {
      for (let i = 0; i < 5; i++) rows.push(`M  V30 ${base + i} C ${Math.cos((2 * Math.PI * i) / 5).toFixed(4)} ${(y + 0.3 * Math.sin((2 * Math.PI * i) / 5)).toFixed(4)} 0 0`);
      for (let i = 0; i < 5; i++) bonds.push(`${i === 0 || i === 2 ? 2 : 1} ${base + i} ${base + ((i + 1) % 5)}`);
    }
    rows.push("M  V30 12 * 0 1.5 0 0", "M  V30 13 * 0 -1.5 0 0");
    const lines = bonds.map((b, n) => `M  V30 ${n + 1} ${b}`);
    const block = (centres: boolean) =>
      [
        "",
        "  Meno",
        "",
        "  0  0  0     0  0            999 V3000",
        "M  V30 BEGIN CTAB",
        `M  V30 COUNTS 13 ${centres ? 12 : 10} 0 0 0`,
        "M  V30 BEGIN ATOM",
        ...rows,
        "M  V30 END ATOM",
        "M  V30 BEGIN BOND",
        ...lines,
        ...(centres ? ["M  V30 11 9 1 12 ENDPTS=(5 2 3 4 5 6) ATTACH=ALL", "M  V30 12 9 1 13 ENDPTS=(5 7 8 9 10 11) ATTACH=ALL"] : []),
        "M  V30 END BOND",
        "M  V30 END CTAB",
        "M  END",
      ].join("\n");
    expect(conformersSoughtOf(block(true))).toBe(FEW_CONFORMERS);
    // (the same rings unbound: a CH2 in each, and they pucker)
    expect(conformersSoughtOf(block(false))).toBe(RING_CONFORMERS);
    expect(conformersSoughtOf("not a block")).toBeNull();
  });
});

describe("the chemist's choice", () => {
  it("is a number of their own, kept to what may be asked, or as many as the molecule needs", () => {
    expect(soughtNumber({ sought: "fixed", count: 12 }, () => 999)).toBe(12);
    expect(soughtNumber({ sought: "fixed", count: 9000 }, () => 999)).toBe(MOST_CONFORMERS);
    expect(soughtNumber({ sought: "fixed", count: 0 }, () => 999)).toBe(1);
    expect(soughtNumber({ sought: "needed", count: 12 }, () => 50)).toBe(50);
    expect(soughtNumber({}, () => null)).toBeNull();
    expect(soughtOptions().map((o) => o.id)).toEqual(["sought", "count"]);
    expect(soughtOptions("fixed", 40).map((o) => o.default)).toEqual(["fixed", 40]);
    expect(MOST_CONFORMERS).toBe(5000);
  });
});
