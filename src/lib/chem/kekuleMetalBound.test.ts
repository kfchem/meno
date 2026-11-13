import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { kekuleOrders, kekulized } from "./kekulize";
import { implicitHydrogens } from "./molecule";

/** The orders and each atom's H of `smiles`, its aromatic bonds written out (smilesInput's way). */
function kekule(smiles: string) {
  const s = readSmiles(smiles);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => {
    sum[b.a1] += orders[i];
    sum[b.a2] += orders[i];
  });
  return { s, orders, hs: s.atoms.map((a, i) => a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0)) };
}

describe("an aromatic ring bound to a metal by its N", () => {
  it("stays a pyridine, an isoquinoline: a double bond at its N, one H on each ring carbon of two ring bonds - not a dihydropyridine with a CH2", () => {
    for (const smiles of ["Cl[Pt](Cl)(n1ccccc1)n1ccccc1", "Cl[Pt](Cl)(N)n1ccccc1", "Cl[Pd](Cl)(n1ccc2ccccc2c1)n1ccc2ccccc2c1"]) {
      const { s, orders, hs } = kekule(smiles);
      s.atoms.forEach((a, i) => {
        // (an aromatic carbon's H: one where it has two ring bonds, none at a fusion - never two, a CH2)
        const own = s.bonds.filter((b) => b.a1 === i || b.a2 === i).length;
        if (a.el === "C" && s.bonds.some((b) => (b.a1 === i || b.a2 === i) && b.order === 4)) expect(hs[i], `${smiles} C${i}`).toBe(3 - own);
      });
      // (each ring N bound to its metal: a double bond in its ring)
      for (const [i, a] of s.atoms.entries()) {
        if (a.el !== "N" || !s.bonds.some((b) => (b.a1 === i || b.a2 === i) && b.order === 4)) continue;
        const toMetal = s.bonds.some((b) => (b.a1 === i || b.a2 === i) && ["Pt", "Pd"].includes(s.atoms[b.a1 === i ? b.a2 : b.a1].el));
        if (toMetal) expect(s.bonds.some((b, k) => (b.a1 === i || b.a2 === i) && orders[k] === 2), `${smiles} N${i}`).toBe(true);
      }
    }
  });

  it("takes a zinc porphine's two N on the Zn as their own bonds: 11 double bonds, those N three bonds, no CH2; so too beside another ring with no Kekule structure", () => {
    // (C20H12N4Zn: two N on the Zn as written, two bare)
    const porphine = "C1=Cc2cc3ccc4cc5nc(cc6ccc(cc1n2)[n]6[Zn][n]34)C=C5";
    for (const smiles of [porphine, `${porphine}.c1cccc1`]) {
      const { s, orders, hs } = kekule(smiles);
      // (the porphine's atoms first, the other ring's five after)
      const end = s.atoms.length - (smiles === porphine ? 0 : 5);
      const own = s.bonds.map((_, k) => k).filter((k) => s.bonds[k].a1 < end && s.bonds[k].a2 < end);
      expect(own.filter((k) => orders[k] === 2), smiles).toHaveLength(11);
      s.atoms.forEach((a, i) => {
        if (i >= end) return;
        const sum = s.bonds.reduce((t, b, k) => t + (b.a1 === i || b.a2 === i ? orders[k] : 0), 0);
        if (a.el === "N" && s.bonds.some((b) => (b.a1 === i || b.a2 === i) && [b.a1, b.a2].some((j) => s.atoms[j].el === "Zn"))) expect(sum, `${smiles} N${i}`).toBe(3);
        if (a.el === "C") expect(hs[i], `${smiles} C${i}`).toBeLessThan(2);
      });
    }
  });

  it("takes an imidazole bound by its N3, its N1 an N-H, as an imidazole: the N3 lends its pair", () => {
    const { s, orders, hs } = kekule("c1c[nH]cn1[Zn](Cl)Cl");
    const n3 = s.atoms.findIndex((a, i) => a.el === "N" && s.bonds.some((b) => (b.a1 === i || b.a2 === i) && [b.a1, b.a2].some((j) => s.atoms[j].el === "Zn")));
    expect(s.bonds.some((b, k) => (b.a1 === n3 || b.a2 === n3) && orders[k] === 2)).toBe(true);
    s.atoms.forEach((a, i) => {
      if (a.el === "C") expect(hs[i], `C${i}`).toBe(1);
    });
  });

  it("takes a pyridine bound by its N as a pyridine beside another ring of the molecule that has no Kekule structure either way", () => {
    for (const smiles of ["Cl[Pt](Cl)(n1ccccc1)Cc1cccc1", "Cl[Pt](Cl)n1ccccc1.c1cccc1"]) {
      const { s, orders } = kekule(smiles);
      const n = s.atoms.findIndex((a) => a.el === "N");
      expect(s.bonds.some((b, k) => (b.a1 === n || b.a2 === n) && orders[k] === 2), smiles).toBe(true);
      // (the six ring bonds: three double)
      const six = s.bonds.map((_, k) => k).filter((k) => s.bonds[k].order === 4 && [s.bonds[k].a1, s.bonds[k].a2].every((i) => i >= n && i <= n + 5));
      expect(six.filter((k) => orders[k] === 2), smiles).toHaveLength(3);
    }
  });

  it("writes out each ring system of a molecule with one that has no Kekule structure: a naphthalene beside it its five double bonds", () => {
    const { s, orders } = kekule("c1ccc2ccccc2c1.c1cccc1");
    expect(s.bonds.map((_, k) => k).filter((k) => s.bonds[k].a1 < 10 && s.bonds[k].a2 < 10 && orders[k] === 2)).toHaveLength(5);
  });

  it("reads each ring N bound to a metal as the ring has it - lending its pair, or the bond its own - and supplies no H where lending would do", () => {
    // (SMILES, the compound's H, its double bonds: a ring's every atom paired where it can be, two N of a porphyrin's or a
    // phthalocyanine's on the metal as their own bond)
    const pc = "[Zn]369n1c%12c2c(c1nc4n3c(c5c4cccc5)nc7n6c(c8c7cccc8)nc%10n9c(c%11c%10cccc%11)n%12)cccc2";
    for (const [smiles, h, doubles] of [
      ["Cl[Pt](Cl)([NH3])n1ccncc1", 7, 3], // a pyrazine by one N
      ["c1cnccn1[Pt](Cl)(Cl)[NH3]", 7, 3], // the same, its N written before the metal
      ["n12ccncc1.[Pt]2(Cl)(Cl)[NH3]", 7, 3], // and closed on the metal by a ring number, N first
      ["Cl[Pt](Cl)([NH3])n1ccn([Pt](Cl)(Cl)[NH3])cc1", 10, 3], // and by both
      ["Cl[Pt](Cl)([NH3])n1cnccc1", 7, 3], // a pyrimidine by one N
      ["Cl[Pt](Cl)([NH3])n1cn([Pt](Cl)(Cl)[NH3])ccc1", 10, 3], // and by both
      ["[Cu]n1cccc2cccnc12", 6, 5], // a 1,8-naphthyridine by one N
      ["[Cu]1n2cccc3cccn1c23", 6, 5], // and by both
      ["[Cu]1n2cccc3ccc4cccn1c4c32", 8, 7], // a phenanthroline by both
      ["C1=Cc2cc3ccc4cc5[n]6[Zn]7([n]2c1cc1ccc(cc6C=C5)[n]17)[n]34", 12, 11], // a zinc porphine, four N on the Zn
      ["C1=Cc2cc3ccc4cc5nc(cc6ccc(cc1n2)[n]6[Zn][n]34)C=C5", 12, 11], // and two
      [pc, 16, 19], // a zinc phthalocyanine, C32H16N8Zn
    ] as const) {
      const k = kekule(smiles);
      expect(k.hs.reduce((a, b) => a + b, 0), `${smiles}: H`).toBe(h);
      expect(k.orders.filter((o) => o === 2), `${smiles}: double bonds`).toHaveLength(doubles);
    }
  });

  it("chooses no N-H for an N bound to a metal: the metal is where the H would be", () => {
    // (the metal written first, and after its N - the N the bond's first atom)
    for (const smiles of ["C1=Cc2cc3ccc4cc5nc(cc6ccc(cc1n2)[n]6[Zn][n]34)C=C5", "[Cu]n1ccnc1", "n1([Cu])ccnc1", "[Na]n1nnnc1C", "n1([Na])nnnc1C"]) {
      const s = readSmiles(smiles);
      expect(kekulized(s.atoms, s.bonds).hChosen, smiles).toEqual([]);
    }
  });

  it("reads each ring system of a molecule with one that has no Kekule structure as it would be alone - its orders, and which N carries an H", () => {
    for (const [mixed, alone, at] of [
      ["c1cncn1.c1cccc1", "c1cncn1", 0], // an imidazole, no H written, beside a ring with none
      ["c1cccc1.c1cncn1", "c1cccc1", 0], // the ring with none, as it is alone
    ] as const) {
      const m = readSmiles(mixed);
      const a = readSmiles(alone);
      const km = kekulized(m.atoms, m.bonds);
      const ka = kekulized(a.atoms, a.bonds);
      expect(km.orders.slice(at, at + a.bonds.length), mixed).toEqual(ka.orders);
      expect(km.hChosen.filter((i) => i < a.atoms.length), mixed).toEqual(ka.hChosen);
    }
  });

  it("leaves a ring bound by none as it was: pyridine, pyridinium, pyrrole", () => {
    expect(kekule("n1ccccc1").orders.filter((o) => o === 2)).toHaveLength(3);
    expect(kekule("C[n+]1ccccc1").orders.filter((o) => o === 2)).toHaveLength(3);
    expect(kekule("[nH]1cccc1").orders.filter((o) => o === 2)).toHaveLength(2);
  });
});
