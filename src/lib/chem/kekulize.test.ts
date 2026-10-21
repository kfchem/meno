import { describe, expect, it } from "vitest";
import { AROMATIC_BOND, kekuleOrders, type KekuleBond } from "./kekulize";
import { readSmiles } from "./smiles";
import { implicitHydrogens } from "./molecule";

const A = AROMATIC_BOND;

// A molecule from its element symbols and its bonds as [from, to, order].
const mol = (elements: string, bonds: [number, number, number][]) => ({
  atoms: elements.split(" ").map((el) => ({ el })),
  bonds: bonds.map(([a1, a2, order]): KekuleBond => ({ a1, a2, order })),
});

// Bonds closing a ring through the given atoms, all of one order.
const ring = (ids: number[], order = A): [number, number, number][] =>
  ids.map((id, k) => [id, ids[(k + 1) % ids.length], order]);

// How many double bonds each atom ends up with.
const doublesPerAtom = (m: ReturnType<typeof mol>) => {
  const orders = kekuleOrders(m.atoms, m.bonds);
  const n = m.atoms.map(() => 0);
  m.bonds.forEach((b, i) => {
    if (orders[i] === 2) {
      n[b.a1]++;
      n[b.a2]++;
    }
  });
  return { orders, n };
};

describe("kekuleOrders", () => {
  it("gives benzene three double bonds, one at every carbon", () => {
    const { orders, n } = doublesPerAtom(mol("C C C C C C", ring([0, 1, 2, 3, 4, 5])));
    expect(orders.filter((o) => o === 2)).toHaveLength(3);
    expect(n).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("uses a pyridine's N when the ring needs it", () => {
    const { n } = doublesPerAtom(mol("N C C C C C", ring([0, 1, 2, 3, 4, 5])));
    expect(n).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("leaves a pyrrole's N-H, a furan's O and a thiophene's S single", () => {
    for (const hetero of ["N", "O", "S"]) {
      const { n } = doublesPerAtom(mol(`${hetero} C C C C`, ring([0, 1, 2, 3, 4])));
      expect(n).toEqual([0, 1, 1, 1, 1]);
    }
  });

  it("leaves an N-substituted pyrrole's N single", () => {
    const m = mol("N C C C C C", [...ring([0, 1, 2, 3, 4]), [0, 5, 1]]);
    expect(doublesPerAtom(m).n).toEqual([0, 1, 1, 1, 1, 0]);
  });

  it("puts imidazole's second double bond on one of its nitrogens", () => {
    // N1 C2 N3 C4 C5
    const { n } = doublesPerAtom(mol("N C N C C", ring([0, 1, 2, 3, 4])));
    expect(n[1]).toBe(1);
    expect(n[3]).toBe(1);
    expect(n[4]).toBe(1);
    expect(n[0] + n[2]).toBe(1);
  });

  it("handles fused rings: naphthalene, azulene, indole", () => {
    const naphthalene = mol("C C C C C C C C C C", [
      ...ring([0, 1, 2, 3, 4, 5]),
      [4, 6, A], [6, 7, A], [7, 8, A], [8, 9, A], [9, 5, A],
    ]);
    const nap = doublesPerAtom(naphthalene);
    expect(nap.orders.filter((o) => o === 2)).toHaveLength(5);
    expect(nap.n.every((k) => k === 1)).toBe(true);

    // a seven-membered ring and a five-membered one sharing the 0-6 bond
    const azulene = mol("C C C C C C C C C C", [
      ...ring([0, 1, 2, 3, 4, 5, 6]),
      [6, 7, A], [7, 8, A], [8, 9, A], [9, 0, A],
    ]);
    expect(doublesPerAtom(azulene).n.every((k) => k === 1)).toBe(true);

    // benzene 0-5 fused at 4-5 to a pyrrole 4-6-7-8(N)-5
    const indole = mol("C C C C C C C C N", [
      ...ring([0, 1, 2, 3, 4, 5]),
      [4, 6, A], [6, 7, A], [7, 8, A], [8, 5, A],
    ]);
    const ind = doublesPerAtom(indole);
    expect(ind.n.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(ind.n[8]).toBe(0);
  });

  it("keeps a ring carbon that already has a double bond out of the ring's", () => {
    // 2-pyridone: N1 C2(=O) C3 C4 C5 C6, the C=O given as a plain double bond
    const m = mol("N C C C C C O", [...ring([0, 1, 2, 3, 4, 5]), [1, 6, 2]]);
    const { orders, n } = doublesPerAtom(m);
    expect(orders[6]).toBe(2);
    expect(n).toEqual([0, 1, 1, 1, 1, 1, 1]);
    // the ring's own double bonds are C3=C4 and C5=C6
    expect(orders.slice(0, 6).filter((o) => o === 2)).toHaveLength(2);
  });

  it("works ring by ring through substituents and links", () => {
    // biphenyl with a methyl on the second ring
    const m = mol("C C C C C C C C C C C C C", [
      ...ring([0, 1, 2, 3, 4, 5]),
      ...ring([6, 7, 8, 9, 10, 11]),
      [0, 6, 1],
      [9, 12, 1],
    ]);
    const { orders, n } = doublesPerAtom(m);
    expect(n.slice(0, 12).every((k) => k === 1)).toBe(true);
    expect(n[12]).toBe(0);
    expect(orders[12]).toBe(1);
    expect(orders[13]).toBe(1);
  });

  it("passes other bonds through, and reads query bond types as single", () => {
    const m = mol("C C C C C C C C", [
      [0, 1, 1], [1, 2, 2], [2, 3, 3], [3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 8],
    ]);
    expect(kekuleOrders(m.atoms, m.bonds)).toEqual([1, 2, 3, 1, 1, 1, 1]);
  });

  it("runs a ring of aromatic bonds through query atoms, giving them a double bond where the ring needs one", () => {
    // a query's ring: an atom list, C, any atom (A), C, any but carbon (Q), C -
    // every carbon between two query atoms, which left them all single: a
    // saturated ring where the file drew an aromatic one
    const { orders, n } = doublesPerAtom(mol("L C A C Q C", ring([0, 1, 2, 3, 4, 5])));
    expect(orders.filter((o) => o === 2)).toHaveLength(3);
    expect(n).toEqual([1, 1, 1, 1, 1, 1]);
    // and a pyridine with * for one carbon: the carbons first, as for its N
    expect(doublesPerAtom(mol("* C C C C N", ring([0, 1, 2, 3, 4, 5]))).n).toEqual([1, 1, 1, 1, 1, 1]);
    // a query atom on a ring that needs none of it stays single
    expect(doublesPerAtom(mol("A C C C C C C", [...ring([1, 2, 3, 4, 5, 6]), [0, 1, A]])).n[0]).toBe(0);
  });

  it("still gives what carbons it can their double bond when no assignment works", () => {
    // cyclopentadienide read without its charge: five carbons, two double bonds
    const { orders, n } = doublesPerAtom(mol("C C C C C", ring([0, 1, 2, 3, 4])));
    expect(orders.filter((o) => o === 2)).toHaveLength(2);
    expect(Math.max(...n)).toBe(1);
  });

  // (rings whose nitrogens must take double bonds of their own, between them: a reader that gives only its
  // carbons theirs leaves two nitrogens without one, each then given a hydrogen it does not have - a formula
  // two hydrogens too many. Each as RDKit writes it in a MOL file, bond type 4, no hydrogens stated)
  it("gives 1,2,4,5-tetrazine three double bonds, one at every atom: no hydrogen on its nitrogens", () => {
    const { orders, n } = doublesPerAtom(mol("C N N C N N", ring([0, 1, 2, 3, 4, 5])));
    expect(orders.filter((o) => o === 2)).toHaveLength(3);
    expect(n).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("leaves a tetrazole one nitrogen without a double bond - its N-H - and no more: 5-phenyltetrazole, losartan's ring", () => {
    // (c1ccc(-c2nn[nH]n2)cc1: the tetrazole's C and four N, then the phenyl's six carbons)
    const m = mol("C N N N N C C C C C C", [...ring([0, 1, 2, 3, 4]), [0, 5, 1], ...ring([5, 6, 7, 8, 9, 10])]);
    const { n } = doublesPerAtom(m);
    expect(n.slice(0, 5).filter((k) => k === 0)).toHaveLength(1);
    expect(n.slice(5)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("gives a pteridine's every ring atom a double bond: methotrexate's 2,4-diaminopteridine has no N-H in its rings", () => {
    // (Nc1nc(N)c2nccnc2n1: ring atoms 1-3, 5-11; the amino N 0 and 4 outside)
    const m = mol("N C N C N C N C C N C N", [[0, 1, 1], [1, 2, A], [2, 3, A], [3, 4, 1], [3, 5, A], [5, 6, A], [6, 7, A], [7, 8, A], [8, 9, A], [9, 10, A], [10, 5, A], [10, 11, A], [11, 1, A]]);
    const { orders, n } = doublesPerAtom(m);
    expect(orders.filter((o) => o === 2)).toHaveLength(5);
    expect([1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map((i) => n[i])).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("leaves benzotriazole one N-H, its benzene ring whole", () => {
    // (c1ccc2[nH]nnc2c1, no hydrogen stated: carbons 0-3, 7, 8; nitrogens 4-6)
    const m = mol("C C C C N N N C C", [[0, 1, A], [1, 2, A], [2, 3, A], [3, 4, A], [4, 5, A], [5, 6, A], [6, 7, A], [7, 3, A], [7, 8, A], [8, 0, A]]);
    const { n } = doublesPerAtom(m);
    expect([0, 1, 2, 3, 7, 8].map((i) => n[i])).toEqual([1, 1, 1, 1, 1, 1]);
    expect([4, 5, 6].filter((i) => n[i] === 0)).toHaveLength(1);
  });

  // (an aromatic SMILES with no H stated on its nitrogens - as a MOL file of aromatic bonds gives them - read, and
  // its formula counted with each atom's H by valence; each against RDKit's formula of the molecule's own SMILES)
  const formulaOf = (smiles: string) => {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => {
      sum[b.a1] += orders[i];
      sum[b.a2] += orders[i];
    });
    const n = new Map<string, number>();
    s.atoms.forEach((a, i) => {
      n.set(a.el, (n.get(a.el) ?? 0) + 1);
      const h = implicitHydrogens(a.el, sum[i], a.charge ?? 0);
      if (h) n.set("H", (n.get("H") ?? 0) + h);
    });
    return ["C", "H", ...[...n.keys()].filter((k) => k !== "C" && k !== "H").sort()].filter((k) => n.has(k)).map((k) => k + (n.get(k)! > 1 ? n.get(k) : "")).join("");
  };

  it.each([
    // (a C=O or C=S on the ring takes its carbon's electron: the 4n + 2 a ring system counts asks for the N-H)
    ["guanine", "Nc1nc2ncnc2c(=O)n1", "C5H5N5O"],
    ["hypoxanthine", "O=c1ncnc2ncnc12", "C5H4N4O"],
    ["xanthine", "O=c1nc(=O)c2ncnc2n1", "C5H4N4O2"],
    ["isoguanine", "Nc1nc(=O)nc2ncnc12", "C5H5N5O"],
    ["allopurinol", "O=c1ncnc2nncc12", "C5H4N4O"],
    ["6-mercaptopurine", "S=c1ncnc2ncnc12", "C5H4N4S"],
    ["thioguanine", "Nc1nc(=S)c2ncnc2n1", "C5H5N5S"],
    ["urazole", "O=c1nnc(=O)n1", "C2H3N3O2"],
    ["8-azaguanine", "Nc1nc2nnnc2c(=O)n1", "C4H4N6O"],
    // (and with none: as many N-H as 4n + 2 asks - porphine's two, a tetrazine's none)
    ["porphine", "c1cc2cc3ccc(cc4ccc(cc5ccc(cc1n2)n5)n4)n3", "C20H14N4"],
    ["1,2,4,5-tetrazine", "c1nncnn1", "C2H2N4"],
    ["losartan's tetrazole", "c1ccc(-c2nnnn2)cc1", "C7H6N4"],
  ])("gives %s its formula, its hydrogens not stated", (_, smiles, formula) => {
    expect(formulaOf(smiles)).toBe(formula);
  });

  it("reads one molecule written in two orders as one: its N-H on the same atom, its double bonds the same", () => {
    // (5-phenyltetrazole, and the same atoms written backwards: the H on the tetrazole's same nitrogen - the one
    // next to its carbon, 1H - wherever the file put it first)
    const nhOf = (smiles: string) => {
      const s = readSmiles(smiles);
      const orders = kekuleOrders(s.atoms, s.bonds);
      const sum = s.atoms.map(() => 0);
      s.bonds.forEach((b, i) => {
        sum[b.a1] += orders[i];
        sum[b.a2] += orders[i];
      });
      // (each N-H by its neighbours' elements: which nitrogen it is, whatever its number)
      return s.atoms.flatMap((a, i) => (a.el === "N" && implicitHydrogens("N", sum[i]) ? [s.bonds.filter((b) => b.a1 === i || b.a2 === i).map((b) => s.atoms[b.a1 === i ? b.a2 : b.a1].el).sort().join("")] : []));
    };
    expect(nhOf("c1ccc(-c2nnnn2)cc1")).toEqual(nhOf("n1nnc(-c2ccccc2)n1"));
    expect(nhOf("n1nnc(-c2ccccc2)n1")).toEqual(nhOf("n1c(-c2ccccc2)nnn1"));
  });
});

