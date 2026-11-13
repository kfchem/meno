import { describe, expect, it } from "vitest";
import { ABBREVIATIONS } from "./abbreviations";
import { aromaticRefusal, kekulized } from "./kekulize";
import { COUNTER_IONS, LIGANDS } from "./ligands";
import { REAGENTS } from "./reagents";
import { readSmiles } from "./smiles";
import { typedRingRefused } from "./smilesWhy";
import { smilesInput } from "../layout/smilesInput";

/** A SMILES's aromatic ring refused as typed - its ring's atoms by place - or none. */
const refused = (smiles: string) => {
  const r = readSmiles(smiles);
  return aromaticRefusal(r.atoms, r.bonds);
};

describe("an aromatic SMILES that cannot be given single and double bonds as written", () => {
  it("is refused as typed, its ring named - an H nobody wrote never added in silence", () => {
    // (cyclopentadiene's ring written aromatic: its fifth carbon has no double bond - read so, an H was added)
    expect(refused("c1cccc1")).toEqual([0, 1, 2, 3, 4]);
    // (pyrrole without its [nH]: the n would carry an H nobody wrote)
    expect(refused("c1ccnc1")).toEqual([0, 1, 2, 3, 4]);
    // (imidazole without its [nH]: which n carries it is not written - refused too)
    expect(refused("c1cncn1")).toEqual([0, 1, 2, 3, 4]);
    // (only the ring at fault named: a phenyl beside it is not)
    expect(refused("c1ccccc1-c1cccc1")).toEqual([6, 7, 8, 9, 10]);
    expect(typedRingRefused([0, 1, 2, 3, 4])).toBe("its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds: is a charge or an H missing?");
  });

  it("is read as written where it can be: every H and charge it needs written", () => {
    for (const smiles of ["c1ccccc1", "c1ccncc1", "c1cc[nH]c1", "c1cc[cH-]c1", "c1ccoc1", "c1ccsc1", "c1cnc[nH]1", "c1ccc2ccccc2c1", "C[n+]1ccccc1", "c1cc[o+]cc1", "O=c1cc[nH]cc1", "c1ccc2[nH]ccc2c1"]) expect(refused(smiles), smiles).toBeNull();
  });

  it("reads an azolide as written: its [n-] lends its pair and takes no double bond, as an N-H's N - every class of them", () => {
    const anions = [
      "c1c[n-]cn1", // imidazolide
      "c1cnc[n-]1",
      "c1[n-]cnc1",
      "c1nc[n-]n1", // 1,2,4-triazolide
      "c1ncn[n-]1",
      "c1cn[n-]n1", // 1,2,3-triazolide
      "c1nn[n-]n1", // tetrazolide
      "[n-]1nnnc1",
      "c1[n-]nnn1",
      "[n-]1ccnc1",
      "c1[n-]ncn1",
      "[n-]1cnc2ccccc12", // benzimidazolide
      "c1ccc2[n-]cnc2c1",
      "c1ccc2c(c1)[n-]cn2",
      "c1ccc2c(c1)[n-]nn2", // benzotriazolide
      "c1cnc2[n-]cnc2n1", // a purine's anion
      "[n-]1cccc1", // pyrrolide
      "c1cn[n-]c1", // pyrazolide
    ];
    for (const smiles of anions) {
      expect(refused(smiles), smiles).toBeNull();
      // (its [n-] bare: no double bond on it)
      const r = readSmiles(smiles);
      const { orders } = kekulized(r.atoms, r.bonds);
      const minus = r.atoms.findIndex((a) => a.el === "N" && a.charge === -1);
      expect(r.bonds.some((b, k) => (b.a1 === minus || b.a2 === minus) && orders[k] === 2), smiles).toBe(false);
    }
  });

  it("reads a ring of arsenic, silicon or boron as written, as nitrogen's and carbon's are - arsabenzene, a silabenzene, borabenzene", () => {
    for (const smiles of ["c1cc[as]cc1", "c1cc[siH]cc1", "c1ccbcc1"]) expect(refused(smiles), smiles).toBeNull();
  });

  it("is still read leniently from a file's aromatic bonds - the atoms left without their double bond said, the orders as before", () => {
    // (as a MOL file's bond type 4 gives c1ccnc1: the n read as an N-H, and named left)
    const r = readSmiles("c1ccnc1");
    const k = kekulized(r.atoms, r.bonds);
    expect(k.left).toEqual([3]);
    expect(k.orders.filter((o) => o === 2)).toHaveLength(2);
    // (an imidazole's: Meno's choice of which n, as before - and left, as typed input would be refused)
    const im = readSmiles("c1cncn1");
    expect(kekulized(im.atoms, im.bonds)).toMatchObject({ hChosen: [4], left: [4] });
  });

  it("is refused where Meno lays a typed SMILES out, in smilesWhy's words", () => {
    expect(() => smilesInput("c1cccc1")).toThrow("This SMILES could not be read: its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds: is a charge or an H missing?");
    expect(() => smilesInput("c1ccccc1")).not.toThrow();
  });
});

describe("a biaryl written with no bond symbol between its rings", () => {
  // (each with the H its formula has: 2,2'-bipyridine C10H8N2, biphenyl C12H10, and so on)
  const BIARYLS: [string, number][] = [
    ["c1ccc(nc1)c1ccccn1", 8], // 2,2'-bipyridine
    ["n1ccccc1c1ccccn1", 8],
    ["c1cnccc1c1ccncc1", 8], // 4,4'-bipyridine
    ["c1ccc(cc1)c1ccccn1", 9],
    ["c1ccc(cc1)c1ccncc1", 9],
    ["c1cnc(nc1)c1ncccn1", 6], // 2,2'-bipyrimidine
    ["c1ccc(cc1)c1ncccn1", 8],
    ["c1ccc(nc1)c1cccc(n1)c1ccccn1", 11], // terpyridine
    ["c1c[nH]c(n1)c1ncc[nH]1", 6], // 2,2'-biimidazole
    ["c1ccc(nc1)c1nc2ccccc2[nH]1", 9],
    ["c1ccc(cc1)c1ccccc1", 10], // biphenyl
    ["c1ccc(cc1)c1cccs1", 8],
    ["c1ccc(cc1)c1ccco1", 8],
    ["c1csc(c1)c1cccs1", 6], // 2,2'-bithiophene
    ["c1ccc(cc1)c1cc[nH]c1", 9],
    ["c1ccc(cc1)c1cnc[nH]1", 8],
    ["c1ccc(cc1)c1nnc(o1)c1ccccc1", 10],
    ["c1ccc(cc1)c1ccc(cc1)c1ccccc1", 14], // p-terphenyl
    ["c1ccc2c(c1)ccc1ccccc21", 10], // phenanthrene: its unwritten bonds in its rings, aromatic
    ["c1ccc(cc1)n1cccc1", 9],
    ["c1ccc(cc1)n1ccnc1", 8],
    ["c1ccc(cc1)n1cccn1", 8],
    ["Cc1ccc(cc1)c1ccc(nc1)c1ccccn1", 14],
    ["c1cc(ccn1)c1nc(nc(n1)c1ccncc1)c1ccncc1", 12],
    ["c1ccc(nc1)c1ccc(cn1)c1ccccn1", 11],
    ["O=c1[nH]cccc1c1ccccn1", 8],
    ["c1ccc(cc1)c1cnccn1", 8], // 2-phenylpyrazine
    ["c1ccc(cc1)c1cccnn1", 8], // 3-phenylpyridazine
  ];

  it("is read ring by ring, the bond between them single: each with the H its formula has, none refused", () => {
    for (const [smiles, h] of BIARYLS) {
      expect(refused(smiles), smiles).toBeNull();
      expect(smilesInput(smiles).atoms.reduce((n, a) => n + (a.hs ?? 0), 0), smiles).toBe(h);
    }
    // (the bond between the rings single; written as "-" or not, alike)
    expect(smilesInput("c1ccc(nc1)c1ccccn1")).toEqual(smilesInput("c1ccc(nc1)-c1ccccn1"));
  });

  it("keeps a bond written with its symbol between two rings as written - aromatic \":\" or double \"=\" - chain or ring closure", () => {
    const between = (smiles: string, a1: number, a2: number) => readSmiles(smiles).bonds.find((b) => (b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1))?.order;
    // (a chain bond written ":" between two benzene rings: aromatic, as written)
    expect(between("c1ccccc1:c1ccccc1", 5, 6)).toBe(4);
    // (written with no symbol: single)
    expect(between("c1ccccc1c1ccccc1", 5, 6)).toBe(1);
    // (a ring-closure bond between the two, its ":" on the opening digit, or before the closing one: aromatic, as written)
    expect(between("c1ccc(cc1):2.c23ccccc3", 3, 6)).toBe(4);
    expect(between("c1ccc(cc1)2.c:23ccccc3", 3, 6)).toBe(4);
    // (and with no symbol on either: single)
    expect(between("c1ccc(cc1)2.c23ccccc3", 3, 6)).toBe(1);
    // ("=" between two rings: as written)
    expect(between("c1ccc2c(c1)C=C2", 6, 7)).toBe(2);
  });

  it("reads a long chain of rings joined so in time that grows with its length, not faster", () => {
    // (poly(p-phenylene), 60 rings - 360 atoms, two such chains in one text: each ring its own)
    const chain = "c1ccc(cc1)" + "c1ccc(cc1)".repeat(58) + "c1ccccc1";
    const t = performance.now();
    const r = readSmiles(`${chain}.${chain}`);
    expect(performance.now() - t).toBeLessThan(200);
    expect(r.bonds.filter((b) => b.order === 1)).toHaveLength(2 * 59);
  });

  it("keeps each ring its own where the bond between them closes a ring that is not aromatic - fluorene's, through its CH2", () => {
    // (fluorene, C13H10: the bond joining its benzene rings is a ring closure in its five-ring, which has a CH2 - not a ring
    //  of aromatic bonds: single, each benzene its own; carbazole's five-ring, its NH aromatic, one system of thirteen)
    expect(refused("c1ccc2c(c1)Cc1ccccc21")).toBeNull();
    expect(smilesInput("c1ccc2c(c1)Cc1ccccc21").atoms.reduce((n, a) => n + (a.hs ?? 0), 0)).toBe(10);
    expect(smilesInput("c1ccc2c(c1)Cc1ccccc21").bonds.filter((b) => b.order === 2)).toHaveLength(6);
    expect(smilesInput("c1ccc2c(c1)[nH]c1ccccc12").atoms.reduce((n, a) => n + (a.hs ?? 0), 0)).toBe(9);
    // (4,5-diazafluorene, C11H8N2: read as one system of twelve its count is 4n, and two N were given an H nobody wrote - each
    //  pyridine its own, none refused, its own eight H)
    expect(refused("c1cnc2c(c1)Cc1cccnc21")).toBeNull();
    expect(smilesInput("c1cnc2c(c1)Cc1cccnc21").atoms.reduce((n, a) => n + (a.hs ?? 0), 0)).toBe(8);
  });
});

describe("Meno's own tables", () => {
  it("hold no SMILES that would now be refused: every abbreviation, reagent, ligand and counter-ion", () => {
    const tables: [string, string][] = [
      ...ABBREVIATIONS.map((a): [string, string] => [`abbreviation ${a.label}`, a.smiles]),
      ...REAGENTS.flatMap((r): [string, string][] => (r.smiles ? [[`reagent ${r.label}`, r.smiles]] : [])),
      ...LIGANDS.map((l): [string, string] => [`ligand ${l.label}`, l.smiles]),
      ...Object.entries(COUNTER_IONS).map(([label, c]): [string, string] => [`counter-ion ${label}`, c.smiles]),
    ];
    expect(tables.length).toBeGreaterThan(300);
    const now = tables.flatMap(([what, smiles]) => {
      let r;
      try {
        r = readSmiles(smiles);
      } catch {
        return [];
      }
      return aromaticRefusal(r.atoms, r.bonds) ? [`${what}: ${smiles}`] : [];
    });
    expect(now).toEqual([]);
  });
});
