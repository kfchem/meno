/**
 * Which of a metal's donors are across from each other (lib/chem/arrangement),
 * and identity told by it: the chemistry check's known answers - cisplatin and transplatin, a place that sets nothing filled in,
 * a chelate's two ends never across - and its count of arrangements for
 * each kind of square-planar and octahedral complex, counted by identity
 * over every pairing that can be.
 */
import { describe, expect, it } from "vitest";
import type { LayoutInput } from "../layout/perceive";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { SHUFFLE_SEEDS, shuffled } from "../layout/testdata/shuffled";
import { ACROSS_FOUR, arrangementKey, arrangementsIn3d, pairingDrawn, pairingIn3d } from "./arrangement";
import { arrangementOpen, constitutionKey, filledIn, identityText } from "./identity";
import { symmetryClasses } from "../layout/canonical";

/** The structure's one metal, and its donors in the order of its bonds. */
function metalOf(g: LayoutInput): { m: number; donors: number[] } {
  const m = g.atoms.findIndex((a) => ["Pt", "Pd", "Ni", "Co", "Zn", "Rh"].includes(a.el));
  return { m, donors: g.bonds.flatMap((b) => (b.a === m ? [b.b] : b.b === m ? [b.a] : [])) };
}

/** `smiles` with its metal's donors (by their place among its bonds) paired as `pairs`; as it is where `pairs` is null. */
function arranged(smiles: string, pairs: [number, number][] | null): LayoutInput {
  const g = fromSmiles(smiles);
  const { m, donors } = metalOf(g);
  return pairs ? { ...g, arrangements: [{ metal: m, pairs: pairs.map(([p, q]) => [donors[p], donors[q]] as const) }] } : g;
}

/** Every way of pairing off `k` donors by their places. */
function pairings(k: number): [number, number][][] {
  const go = (left: number[]): [number, number][][] => {
    if (!left.length) return [[]];
    const [first, ...rest] = left;
    return rest.flatMap((q) => go(rest.filter((r) => r !== q)).map((more) => [[first, q] as [number, number], ...more]));
  };
  return go(Array.from({ length: k }, (_, i) => i));
}

/** Whether two donors of the metal are joined, not through it, by a ring of seven atoms or fewer, the metal counted. */
function chelated(g: LayoutInput, m: number, p: number, q: number): boolean {
  const around: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  let at = [p];
  const seen = new Set([p, m]);
  for (let d = 1; d <= 5; d++) {
    const next: number[] = [];
    for (const x of at)
      for (const y of around[x]) {
        if (y === q) return true;
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
        }
      }
    at = next;
  }
  return false;
}

/** How many arrangements a complex has, by pairs: the identities over every pairing that puts no chelate's two ends across. */
function countOf(smiles: string): number {
  const g = fromSmiles(smiles);
  const { m, donors } = metalOf(g);
  const can = pairings(donors.length).filter((ps) => ps.every(([p, q]) => !chelated(g, m, donors[p], donors[q])));
  return new Set(can.map((ps) => identityText(arranged(smiles, ps)))).size;
}

const CIS = "Cl[Pt](Cl)(N)N"; // donors: Cl, Cl, N, N

describe("a metal's donors across, in identity", () => {
  it("cisplatin and transplatin are two structures, each written one way however its pairs or atoms are given; given neither, a third", () => {
    const cis = identityText(arranged(CIS, [[0, 2], [1, 3]]));
    const trans = identityText(arranged(CIS, [[0, 1], [2, 3]]));
    expect(cis).not.toBe(trans);
    expect(identityText(arranged(CIS, [[0, 3], [1, 2]]))).toBe(cis);
    expect(identityText(arranged(CIS, [[2, 0], [3, 1]]))).toBe(cis);
    for (const seed of SHUFFLE_SEEDS) {
      expect(identityText(shuffled(arranged(CIS, [[0, 2], [1, 3]]), seed))).toBe(cis);
      expect(identityText(shuffled(arranged(CIS, [[0, 1], [2, 3]]), seed))).toBe(trans);
    }
    const open = identityText(arranged(CIS, null));
    expect([cis, trans]).not.toContain(open);
    // (the constitution is one, whichever)
    expect(constitutionKey(arranged(CIS, [[0, 2], [1, 3]]))).toBe(constitutionKey(arranged(CIS, null)));
  });

  it("an arrangement that sets nothing is filled in: PtCl4 2-, PtCl3(NH3)-, [Co(NH3)6]3+, [Co(NH3)5Cl]2+ and a tetrahedral NiCl4 2- are one structure given or not", () => {
    for (const [smiles, k] of [
      ["Cl[Pt-2](Cl)(Cl)Cl", 4],
      ["Cl[Pt-](Cl)(Cl)N", 4],
      ["Cl[Ni-2](Cl)(Cl)Cl", 4],
      ["N[Co+3](N)(N)(N)(N)N", 6],
      ["Cl[Co+2](N)(N)(N)(N)N", 6],
    ] as const) {
      const none = identityText(arranged(smiles, null));
      for (const ps of pairings(k)) expect(identityText(arranged(smiles, ps))).toBe(none);
    }
  });

  it("a chelate's two ends are never across in the fill: Pt(en)Cl2 and [Co(en)3]3+ given no arrangement are the one they can be; [Co(en)2Cl2]+ stays open", () => {
    // (Pt(en)Cl2: donors Cl, Cl, N, N - its N next to each other)
    expect(identityText(arranged("Cl[Pt]1(Cl)NCCN1", null))).toBe(identityText(arranged("Cl[Pt]1(Cl)NCCN1", [[0, 2], [1, 3]])));
    // ([Co(en)3]3+: donors in bond order N1 N1' N2 N2' N3 N3', each en's two by the ring)
    const en3 = "[Co+3]123(NCCN1)(NCCN2)NCCN3";
    const g = fromSmiles(en3);
    const { m, donors } = metalOf(g);
    const can = pairings(6).filter((ps) => ps.every(([p, q]) => !chelated(g, m, donors[p], donors[q])));
    expect(can.length).toBeGreaterThan(0);
    for (const ps of can) expect(identityText(arranged(en3, ps))).toBe(identityText(arranged(en3, null)));
    // ([Co(en)2Cl2]+: cis and trans can both be - left open, matching neither)
    const en2 = "Cl[Co+]12(Cl)(NCCN1)NCCN2";
    const open = identityText(arranged(en2, null));
    const texts = new Set(
      pairings(6)
        .filter((ps) => ps.every(([p, q]) => !chelated(fromSmiles(en2), metalOf(fromSmiles(en2)).m, metalOf(fromSmiles(en2)).donors[p], metalOf(fromSmiles(en2)).donors[q])))
        .map((ps) => identityText(arranged(en2, ps))),
    );
    expect(texts.size).toBe(2);
    expect(texts.has(open)).toBe(false);
  });

  it("a porphyrin's opposite N, joined by a ring of ten with the metal, may be across", () => {
    // (a ring of ten with the metal: donors bridged by eight atoms - no chelate of seven or fewer)
    const g = fromSmiles("Cl[Pt]1(Cl)NCCCCCCCN1");
    const { m, donors } = metalOf(g);
    expect(chelated(g, m, donors[2], donors[3])).toBe(false);
    expect(identityText(arranged("Cl[Pt]1(Cl)NCCCCCCCN1", [[0, 1], [2, 3]]))).not.toBe(identityText(arranged("Cl[Pt]1(Cl)NCCCCCCCN1", [[0, 2], [1, 3]])));
  });

  it("the chemistry check's counts of arrangements by pairs, every kind of square-planar and octahedral complex", () => {
    const cases: [string, string, number][] = [
      // square planar
      ["A2B2", "N[Pt](N)(Cl)Cl", 2],
      ["A2BC", "N[Pt](N)(Cl)Br", 2],
      ["ABCD", "N[Pt](Cl)(Br)I", 3],
      ["(AA)B2", "Cl[Pt]1(Cl)NCCN1", 1],
      ["(AB)2", "[Pt]12(NCC(=O)O1)NCC(=O)O2", 2],
      ["(AB)CD", "Cl[Pt]1(Br)NCC(=O)O1", 2],
      ["PtCl2Br(NH3)-", "Cl[Pt-](Cl)(Br)N", 2],
      // octahedral
      ["MA4B2", "Cl[Co](Cl)(N)(N)(N)N", 2],
      ["MA3B3", "Cl[Co](Cl)(Cl)(N)(N)N", 2],
      ["MA3B2C", "Cl[Co](Cl)(Br)(N)(N)N", 3],
      ["MA2B2C2", "Cl[Co](Cl)(Br)(Br)(N)N", 5],
      ["MABCDEF", "Cl[Co](Br)(I)(F)(N)O", 15],
      ["M(AA)3", "[Co]123(NCCN1)(NCCN2)NCCN3", 1],
      ["M(AA)2B2", "Cl[Co]12(Cl)(NCCN1)NCCN2", 2],
      ["M(AA)B2C2", "Cl[Co]1(Cl)(Br)(Br)NCCN1", 3],
      ["M(AB)3", "[Co]123(NCC(=O)O1)(NCC(=O)O2)NCC(=O)O3", 2],
      ["M(AB)2L2", "Cl[Co]12(Cl)(NCC(=O)O1)NCC(=O)O2", 5],
      ["M(AB)2LL'", "Cl[Co]12(Br)(NCC(=O)O1)NCC(=O)O2", 6],
    ];
    for (const [name, smiles, count] of cases) expect([name, countOf(smiles)]).toEqual([name, count]);
  });

  it("a metal's donors are told apart by which donor is across from them: PtCl2Br(NH3)-'s Cl across Br is not its Cl across N", () => {
    // (donors Cl, Cl, Br, N: the first Cl across Br, the second across N)
    const g = arranged("Cl[Pt-](Cl)(Br)N", [[0, 2], [1, 3]]);
    const { donors } = metalOf(g);
    const classes = symmetryClasses(g);
    expect(classes[donors[0]]).not.toBe(classes[donors[1]]);
    expect(symmetryClasses(arranged("Cl[Pt-](Cl)(Br)N", null))[donors[0]]).toBe(symmetryClasses(arranged("Cl[Pt-](Cl)(Br)N", null))[donors[1]]);
  });

  it("the chemistry check's known answers for the fill offered to every metal: Pt2Cl6 2-, Ni(cyclam) 2+ and Pt(dien)Cl+ filled - their chelates leave one pairing", () => {
    for (const smiles of ["Cl[Pt-]1(Cl)Cl[Pt-](Cl)(Cl)Cl1", "[Ni+2]123N4CCN1CCCN2CCN3CCC4", "Cl[Pt+]12NCCN1CCN2"]) {
      const text = identityText(fromSmiles(smiles));
      expect([smiles, text.includes("|m")]).toEqual([smiles, true]);
    }
  });

  it("identity's own test of 'not given' (arrangementOpen), the layout's mark's too: the whole structure tells, not the donors next to the metal", () => {
    const open = (smiles: string) => {
      const g = fromSmiles(smiles);
      return arrangementOpen(g, metalOf(g).m);
    };
    // (the chemistry check's two: four N alike next to the metal, two ligands further out)
    expect(open("CN[Pt+2](NC)(NCC)NCC")).toBe(true);
    expect(open("CN[Co+3](NC)(NC)(NC)(NCC)NCC")).toBe(true);
    expect(open(CIS)).toBe(true);
    expect(open("Cl[Co+]12(Cl)(NCCN1)NCCN2")).toBe(true);
    // (one arrangement, or every pairing one text: not open)
    for (const smiles of ["Cl[Pt-2](Cl)(Cl)Cl", "Cl[Pt-](Cl)(Cl)N", "Cl[Pt]1(Cl)NCCN1", "N[Co+3](N)(N)(N)(N)N", "[Co+3]123(NCCN1)(NCCN2)NCCN3", "[Zn]123N(CCN1)(CCN2)CCN3", "[Co-]12345N(CC(=O)O1)(CC(=O)O2)CCN5(CC(=O)O3)CC(=O)O4"]) expect([smiles, open(smiles)]).toEqual([smiles, false]);
    // ([Co(EDTA)]- read as six donors on the Co, not fewer)
    expect(metalOf(fromSmiles("[Co-]12345N(CC(=O)O1)(CC(=O)O2)CCN5(CC(=O)O3)CC(=O)O4")).donors).toHaveLength(6);
    // (a chelated square-planar centre that can be arranged two ways: Pt(gly)2)
    expect(open("[Pt]12([NH2]CC(=O)O1)[NH2]CC(=O)O2")).toBe(true);
    // (an arrangement given for it is set aside: asked of the structure as if none were; no metal, no unit)
    expect(arrangementOpen(arranged(CIS, [[0, 2], [1, 3]]), metalOf(fromSmiles(CIS)).m)).toBe(true);
    expect(arrangementOpen(fromSmiles("CC(C)O"), 1)).toBe(false);
    // (the metal's place found past hydrogens folded in before it)
    const h = fromSmiles("[H]C([H])([H])N[Pt+2](NC)(NCC)NCC");
    expect(h.atoms.filter((a) => a.el === "H")).toHaveLength(3);
    expect(arrangementOpen(h, h.atoms.findIndex((a) => a.el === "Pt"))).toBe(true);
  });

  it("two metals held by two bridges, whose cis and trans dimers differ only together: each asked alike, whatever order the atoms come in", () => {
    // ([Pt2Cl4(NH3)2] and [Pd2Cl4(PMe3)2]: open at both metals; [Pt2Cl6]2- and [(NH3)2Pt(Cl)2PtCl2]: one way only, open at neither)
    const at = (smiles: string) => {
      const g = fromSmiles(smiles);
      return g.atoms.flatMap((a, i) => (["Pt", "Pd"].includes(a.el) ? [arrangementOpen(g, i)] : []));
    };
    for (const smiles of [
      "N[Pt]1(Cl)Cl[Pt](N)(Cl)Cl1",
      "Cl[Pt]1(N)Cl[Pt](Cl)(N)Cl1",
      "Cl1[Pt](Cl)(N)Cl[Pt]1(N)Cl",
      "CP(C)(C)[Pd]1(Cl)Cl[Pd](P(C)(C)C)(Cl)Cl1",
      "Cl[Pd]1(P(C)(C)C)Cl[Pd](Cl)(P(C)(C)C)Cl1",
    ])
      expect([smiles, at(smiles)]).toEqual([smiles, [true, true]]);
    for (const smiles of ["Cl[Pt-]1(Cl)Cl[Pt-](Cl)(Cl)Cl1", "N[Pt+]1(N)Cl[Pt-](Cl)(Cl)Cl1"]) expect([smiles, at(smiles)]).toEqual([smiles, [false, false]]);
  });

  it("a metal is settled with no search of the whole structure where its donors' classes or groups decide it: PdCl2(PPh3)2, Pd(PPh3)4", () => {
    // (PdCl2(PPh3)2: Cl across Cl or across P, two pairings by class - open; Pd(PPh3)4: four PPh3 alike as wholes - one structure)
    const ph3 = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
    const pdcl2 = fromSmiles(`Cl[Pd](Cl)(${ph3})${ph3}`);
    const pd4 = fromSmiles(`[Pd](${ph3})(${ph3})(${ph3})${ph3}`);
    expect([filledIn(pdcl2).searches, filledIn(pd4).searches]).toEqual([0, 0]);
    expect([arrangementOpen(pdcl2, metalOf(pdcl2).m), arrangementOpen(pd4, metalOf(pd4).m)]).toEqual([true, false]);
    // (and the two isomers of PdCl2(PPh3)2 drawn stay two structures)
    const pairs = (p: [number, number][]) => ({ ...pdcl2, arrangements: [{ metal: metalOf(pdcl2).m, pairs: p.map(([a, b]) => [metalOf(pdcl2).donors[a], metalOf(pdcl2).donors[b]] as const) }] });
    expect(identityText(pairs([[0, 1], [2, 3]]))).not.toBe(identityText(pairs([[0, 2], [1, 3]])));
    // (all donors but one alike as wholes - RhCl(PPh3)3, PtCl3Br 2-, [CoCl5Br]3-: the odd one across any of the others, every
    //  pairing one structure, settled likewise; a pairing given is taken off)
    for (const smiles of [`Cl[Rh](${ph3})(${ph3})${ph3}`, "Cl[Pt-2](Cl)(Cl)Br", "Cl[Co-3](Cl)(Cl)(Cl)(Cl)Br"]) {
      const g = fromSmiles(smiles);
      const { m, donors } = metalOf(g);
      expect([smiles, filledIn(g).searches, filledIn(g).settledMetals, arrangementOpen(g, m)]).toEqual([smiles, 0, [m], false]);
      const given = { ...g, arrangements: [{ metal: m, pairs: pairings(donors.length)[0].map(([p, q]) => [donors[p], donors[q]] as const) }] };
      expect(identityText(given)).toBe(identityText(g));
    }
  });

  it("each metal of a structure is asked on its own: an open one and one not, whichever is asked first", () => {
    // (a hexaammine Co, never open, beside a Pt(NH3)2Cl2 with none given, open: in either order of the parts, and of asking)
    for (const smiles of ["N[Co+3](N)(N)(N)(N)N.Cl[Pt](Cl)(N)N", "Cl[Pt](Cl)(N)N.N[Co+3](N)(N)(N)(N)N"]) {
      const g = fromSmiles(smiles);
      const co = g.atoms.findIndex((a) => a.el === "Co");
      const pt = g.atoms.findIndex((a) => a.el === "Pt");
      expect([smiles, arrangementOpen(g, pt), arrangementOpen(g, co)]).toEqual([smiles, true, false]);
      const again = fromSmiles(smiles);
      expect([smiles, arrangementOpen(again, co), arrangementOpen(again, pt)]).toEqual([smiles, false, true]);
    }
  });

  it("hydrogens written as atoms before the metal: cisplatin and transplatin are the structures they are with none written", () => {
    // (each pair given by the atoms' places in the drawing as it is, the hydrogens among them: folded in, the pairs follow)
    const across = (smiles: string, cis: boolean) => {
      const g = fromSmiles(smiles);
      const { m, donors } = metalOf(g);
      const cl = donors.filter((d) => g.atoms[d].el === "Cl");
      const n = donors.filter((d) => g.atoms[d].el === "N");
      const pairs: (readonly [number, number])[] = cis ? [[cl[0], n[0]], [cl[1], n[1]]] : [[cl[0], cl[1]], [n[0], n[1]]];
      return identityText({ ...g, arrangements: [{ metal: m, pairs }] });
    };
    const written = "[H]N([H])([H])[Pt](Cl)(Cl)N([H])([H])[H]";
    expect(fromSmiles(written).atoms.findIndex((a) => a.el === "Pt")).toBe(4);
    // (the same with the ammines' hydrogens counted on their N)
    const plain = "Cl[Pt](Cl)([NH3])[NH3]";
    expect(across(written, true)).toBe(across(plain, true));
    expect(across(written, false)).toBe(across(plain, false));
    expect(across(written, true)).not.toBe(across(written, false));
  });

  it("a structure with no metal of four or six donors is written as it always was", () => {
    // (ferrocene's iron has two stars; a tripod's pairings all put a chelate across: nothing filled, nothing written)
    for (const smiles of ["CC(C)O", "[Zn]123N(CCN1)(CCN2)CCN3"]) expect(identityText(fromSmiles(smiles))).not.toContain("|m");
  });
});

describe("which donors are across, read", () => {
  const deg = (d: number) => (d * Math.PI) / 180;

  it("in a drawing, the pairing nearest straight lines - however far from straight - and none where another is about as near", () => {
    // (the X and the upright cross; a transplatin put down with its N-Pt-N at 145)
    expect(pairingDrawn([45, 135, 225, 315].map(deg))).toEqual([2, 3, 0, 1]);
    expect(pairingDrawn([0, 90, 180, 270].map(deg))).toEqual([2, 3, 0, 1]);
    expect(pairingDrawn([0, 90, 145, 270].map(deg))).toEqual([2, 3, 0, 1]);
    // (two pairings each within 10 degrees of straight: neither said)
    expect(pairingDrawn([0, 10, 180, 190].map(deg))).toBeNull();
    // (six spokes)
    expect(pairingDrawn([0, 60, 120, 180, 240, 300].map(deg))).toEqual([3, 4, 5, 0, 1, 2]);
  });

  const octahedron = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const turnedXY = (p: number[], t: number) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t), p[2]];

  it("in 3D: a square plane's and an octahedron's pairs; none for a tetrahedron, a flattened one, a trigonal prism", () => {
    expect(pairingIn3d([0, 0, 0], octahedron.slice(0, 4))).toEqual([1, 0, 3, 2]);
    expect(pairingIn3d([0, 0, 0], octahedron)).toEqual([1, 0, 3, 2, 5, 4]);
    const tetrahedron = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ];
    expect(pairingIn3d([0, 0, 0], tetrahedron)).toBeNull();
    // (flattened, each pair's angle 145 degrees: none; less flat, at 155, a square plane bent: its pairs)
    const flattened = (across: number) => {
      const h = Math.cos(deg(across) / 2) / Math.sin(deg(across) / 2);
      return [
        [1, 0, h],
        [-1, 0, h],
        [0, 1, -h],
        [0, -1, -h],
      ];
    };
    expect(pairingIn3d([0, 0, 0], flattened(145))).toBeNull();
    expect(pairingIn3d([0, 0, 0], flattened(155))).toEqual([1, 0, 3, 2]);
    expect(ACROSS_FOUR).toBe(150);
    // (a trigonal prism: two triangles, one over the other - each donor's two widest about alike)
    const prism = [0, 120, 240].flatMap((t) => [
      [Math.cos(deg(t)), Math.sin(deg(t)), 0.85],
      [Math.cos(deg(t)), Math.sin(deg(t)), -0.85],
    ]);
    expect(pairingIn3d([0, 0, 0], prism)).toBeNull();
    // (twisted 8 degrees toward the octahedron: each donor's widest about 141, its next about 130, within 15 of it - the margin says none)
    const twisted = [0, 120, 240].flatMap((t) => [
      [Math.cos(deg(t + 4)), Math.sin(deg(t + 4)), 0.85],
      [Math.cos(deg(t - 4)), Math.sin(deg(t - 4)), -0.85],
    ]);
    expect(pairingIn3d([0, 0, 0], twisted)).toBeNull();
    // (every donor with a partner across, but not each other's: none)
    const v = (th: number, ph: number) => [Math.sin(deg(th)) * Math.cos(deg(ph)), Math.sin(deg(th)) * Math.sin(deg(ph)), Math.cos(deg(th))];
    expect(pairingIn3d([0, 0, 0], [v(150, 180), v(0, 0), v(170, 0), v(30, 105)])).toBeNull();
  });

  it("in 3D: a terpyridine's outer donors held at 145 degrees are across still", () => {
    const bent = octahedron.map((p, i) => (i < 2 ? turnedXY(p, i === 0 ? deg(17.5) : deg(-17.5)) : p));
    expect(pairingIn3d([0, 0, 0], bent)).toEqual([1, 0, 3, 2, 5, 4]);
  });

  it("in 3D: fac and mer Co(NH3)3Cl3 keyed apart, fac turned anyhow the same", () => {
    const atoms = [{ el: "Co" }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }, { el: "N" }, { el: "N" }, { el: "N" }];
    const bonds = [1, 2, 3, 4, 5, 6].map((d) => ({ a1: 0, a2: d, order: 1 }));
    const at = (places: number[][]) => [0, 0, 0, ...places.flat().map((x) => x * 2.0)];
    // (fac: the three Cl on +x, +y, +z, each across an N; mer: two Cl across each other)
    const fac = [octahedron[0], octahedron[2], octahedron[4], octahedron[1], octahedron[3], octahedron[5]];
    const mer = [octahedron[0], octahedron[1], octahedron[2], octahedron[3], octahedron[4], octahedron[5]];
    expect(arrangementsIn3d(atoms, bonds, at(fac))).toEqual([{ metal: 0, pairs: [[1, 4], [2, 5], [3, 6]] }]);
    expect(arrangementsIn3d(atoms, bonds, at(mer))).toHaveLength(1);
    expect(arrangementKey(atoms, bonds, at(fac))).not.toBe(arrangementKey(atoms, bonds, at(mer)));
    const turnedYZ = (p: number[], t: number) => [p[0], p[1] * Math.cos(t) - p[2] * Math.sin(t), p[1] * Math.sin(t) + p[2] * Math.cos(t)];
    const turned = fac.map((p) => turnedYZ(turnedXY(p, deg(30)), deg(40)));
    expect(arrangementKey(atoms, bonds, at(turned))).toBe(arrangementKey(atoms, bonds, at(fac)));
  });

  it("in 3D: cisplatin and transplatin keyed apart, each the same in another atom order; NiCl4 2- planar and tetrahedral one", () => {
    const atoms = [{ el: "Pt" }, { el: "Cl" }, { el: "Cl" }, { el: "N" }, { el: "N" }];
    const bonds = [1, 2, 3, 4].map((d) => ({ a1: 0, a2: d, order: 1 }));
    const at = (places: number[][]) => [0, 0, 0, ...places.flat().map((x) => x * 2.3)];
    const cis = at([octahedron[0], octahedron[2], octahedron[1], octahedron[3]]);
    const trans = at([octahedron[0], octahedron[1], octahedron[2], octahedron[3]]);
    expect(arrangementsIn3d(atoms, bonds, cis)).toEqual([{ metal: 0, pairs: [[1, 3], [2, 4]] }]);
    expect(arrangementKey(atoms, bonds, cis)).not.toBe(arrangementKey(atoms, bonds, trans));
    // (the N first: the same compound)
    const atoms2 = [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }];
    const cis2 = at([octahedron[1], octahedron[3], octahedron[0], octahedron[2]]);
    expect(arrangementKey(atoms2, bonds, cis2)).toBe(arrangementKey(atoms, bonds, cis));
    const ni = [{ el: "Ni", charge: -2 }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }];
    const tetra = at([
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]);
    expect(arrangementsIn3d(ni, bonds, tetra)).toEqual([]);
    expect(arrangementKey(ni, bonds, tetra)).toBe(arrangementKey(ni, bonds, at(octahedron.slice(0, 4))));
    // (CuCl4 2- in three salts' places, its widest Cl-Cu-Cl 146, 161 and 178 degrees: one compound, one key - the first read
    //  as none, the others as pairs, every pairing of four Cl one text)
    const cu = [{ el: "Cu", charge: -2 }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }];
    const bent = (across: number) => {
      const h = Math.cos(deg(across) / 2) / Math.sin(deg(across) / 2);
      return at([
        [1, 0, h],
        [-1, 0, h],
        [0, 1, -h],
        [0, -1, -h],
      ]);
    };
    expect(arrangementsIn3d(cu, bonds, bent(146))).toEqual([]);
    expect(arrangementsIn3d(cu, bonds, bent(161))).toHaveLength(1);
    expect(new Set([146, 161, 178].map((a) => arrangementKey(cu, bonds, bent(a)))).size).toBe(1);
    // (no metal of four or six donors: no key)
    expect(arrangementKey([{ el: "C" }, { el: "O" }], [{ a1: 0, a2: 1, order: 1 }], [0, 0, 0, 1.4, 0, 0])).toBeNull();
  });
});
