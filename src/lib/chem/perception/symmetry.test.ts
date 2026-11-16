import { describe, expect, it } from "vitest";
import { canonicalWritten, symmetryClasses, symmetryOrbits, type SymmetryInput } from "./symmetry";
import { symmetryOrbits as aromaticOrbits } from "../identity";
import { fromSmiles } from "../../layout/testdata/fromSmiles";
import { shuffled, tiedCages } from "../../layout/testdata/shuffled";

// What perception/symmetry's header promises a caller, by known answers (the chemistry check's, measured on the code as it stood before the move):
// orbit sizes of the carbons, as drawn; classes coarser only in rare cages; the canonical text one for one structure and another for
// any other. Orbits are the homotopic sets: a map that turns every centre (a reflection) is none.

/** The sizes of the orbits (or classes) the carbons fall into, smallest first. */
function sizes(g: SymmetryInput, of: readonly number[]): number[] {
  const count = new Map<number, number>();
  g.atoms.forEach((a, i) => a.el === "C" && count.set(of[i], (count.get(of[i]) ?? 0) + 1));
  return [...count.values()].sort((p, q) => p - q);
}
const orbits = (smiles: string) => {
  const g = fromSmiles(smiles);
  const found = symmetryOrbits(g);
  expect(found.complete, smiles).toBe(true);
  return sizes(g, found.orbit);
};
const classes = (smiles: string) => {
  const g = fromSmiles(smiles);
  return sizes(g, symmetryClasses(g));
};
const text = (smiles: string) => {
  const w = canonicalWritten(fromSmiles(smiles));
  expect(w.complete, smiles).toBe(true);
  return w.text;
};

const TARTARIC = "OC(=O)[C@H](O)[C@@H](O)C(=O)O";
// (written backwards, a centre's neighbours come in an order one swap from its own: both centres written one way is both the other -
//  the mirror image is the same compound)
const MESO_TARTARIC = "OC(=O)[C@H](O)[C@H](O)C(=O)O";
const MESO_DIOL = "C[C@H](O)C[C@H](O)C";
const DIMETHYL = ["C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1"];

describe("symmetry: orbits as drawn", () => {
  it("benzene, a Kekule structure: one orbit of six; cubane: one of eight", () => {
    expect(orbits("C1=CC=CC=C1")).toEqual([6]);
    expect(orbits("C12C3C4C1C5C2C3C45")).toEqual([8]);
  });

  it("cuneane: orbits 2, 2, 4, its classes coarser - one of eight (the tied cage)", () => {
    expect(tiedCages.map((c) => c.name)).toContain("cuneane");
    expect(orbits("C12C3C4C3C2C5C4C51")).toEqual([2, 2, 4]);
    expect(classes("C12C3C4C3C2C5C4C51")).toEqual([8]);
  });

  it("toluene, a Kekule structure, as drawn: seven orbits of one; of its aromatic form (identity's): ipso, ortho x2, meta x2, para, methyl", () => {
    expect(orbits("CC1=CC=CC=C1")).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const g = fromSmiles("CC1=CC=CC=C1");
    expect(sizes(g, aromaticOrbits(g).orbit)).toEqual([1, 1, 1, 2, 2]);
  });

  it("tartaric acid: the chiral acid's two centres one orbit; meso-tartaric acid's apart - a reflection is no map here", () => {
    expect(orbits(TARTARIC)).toEqual([2, 2]);
    expect(orbits(MESO_TARTARIC)).toEqual([1, 1, 1, 1]);
    expect(orbits(MESO_DIOL)).toEqual([1, 1, 1, 1, 1]);
  });

  it("cis- and trans-1,4-dimethylcyclohexane: orbits 2, 2, 2, 2 each - the ring's CH2 either side of the mirror plane apart; classes 2, 2, 4", () => {
    for (const s of DIMETHYL) {
      expect(orbits(s), s).toEqual([2, 2, 2, 2]);
      expect(classes(s), s).toEqual([2, 2, 4]);
    }
  });

  it("(S)-3-methylbutan-2-ol: 1, 1, 1, 2 - the isopropyl's two methyls together, though diastereotopic", () => {
    expect(orbits("C[C@H](O)C(C)C")).toEqual([1, 1, 1, 2]);
  });
});

describe("symmetry: the canonical text", () => {
  it("tells apart cis- and trans-1,4-dimethylcyclohexane, (R)- and (S)-alanine, meso and chiral tartaric acid and its two hands, (E)- and (Z)-but-2-ene", () => {
    expect(text(DIMETHYL[0])).not.toBe(text(DIMETHYL[1]));
    expect(text("C[C@H](N)C(=O)O")).not.toBe(text("C[C@@H](N)C(=O)O"));
    expect(text(MESO_TARTARIC)).not.toBe(text(TARTARIC));
    expect(text(TARTARIC)).not.toBe(text("OC(=O)[C@@H](O)[C@H](O)C(=O)O"));
    expect(text("C/C=C/C")).not.toBe(text("C/C=C\\C"));
  });

  it("writes one structure one way: meso-tartaric acid with both centres one way and both the other; each dimethylcyclohexane both ways and in any atom order", () => {
    expect(text(MESO_TARTARIC)).toBe(text("OC(=O)[C@@H](O)[C@@H](O)C(=O)O"));
    for (const s of DIMETHYL) {
      const own = text(s);
      expect(text(s.replace(/@@/g, "!").replace(/@/g, "@@").replace(/!/g, "@")), s).toBe(own);
      for (const seed of [1, 7919, 104729]) expect(canonicalWritten(shuffled(fromSmiles(s), seed)).text, `${s} seed ${seed}`).toBe(own);
    }
  });

  it("writes a double bond one way whichever neighbour each end's cis or trans was given against: (E)-3-methylpent-2-ene", () => {
    const g = fromSmiles("C/C=C(/C)CC");
    const k = g.bonds.findIndex((b) => b.stereo);
    const b = g.bonds[k];
    const [p, q] = b.stereo!.refs;
    const other = g.bonds.flatMap((x) => (x.a === b.b && x.b !== b.a ? [x.b] : x.b === b.b && x.a !== b.a ? [x.a] : [])).find((m) => m !== q)!;
    const given = (refs: [number, number], cis: boolean): SymmetryInput => ({ ...g, bonds: g.bonds.map((x, i) => (i === k ? { ...x, stereo: { refs, cis } } : x)) });
    const own = canonicalWritten(given([p, q], b.stereo!.cis)).text;
    expect(canonicalWritten(given([p, other], !b.stereo!.cis)).text).toBe(own);
    expect(canonicalWritten(given([p, q], !b.stereo!.cis)).text).not.toBe(own);
  });

  it("writes a double bond with an end of two alike groups one way, given cis or trans: 2-methylbut-2-ene has no configuration to write", () => {
    const g = fromSmiles("CC=C(C)C");
    const k = g.bonds.findIndex((b) => b.order === 2);
    const b = g.bonds[k];
    const [ref1] = g.bonds.flatMap((x) => (x !== b && (x.a === b.a || x.b === b.a) ? [x.a === b.a ? x.b : x.a] : []));
    const [ref2] = g.bonds.flatMap((x) => (x !== b && (x.a === b.b || x.b === b.b) ? [x.a === b.b ? x.b : x.a] : []));
    const given = (cis: boolean): SymmetryInput => ({ ...g, bonds: g.bonds.map((x, i) => (i === k ? { ...x, stereo: { refs: [ref1, ref2] as [number, number], cis } } : x)) });
    expect(canonicalWritten(given(true)).text).toBe(canonicalWritten(given(false)).text);
  });
});

describe("symmetry: a double bond with an end of two alike groups", () => {
  it("parts no classes, given cis or trans: 2,7-dimethylocta-2,6-diene's two halves alike, one given cis and the other trans", () => {
    const g = fromSmiles("CC(C)=CCCC=C(C)C");
    const ends = (b: (typeof g.bonds)[number]) =>
      [b.a, b.b].map((e) => g.bonds.flatMap((x) => (x !== b && (x.a === e || x.b === e) ? [x.a === e ? x.b : x.a] : []))[0]) as [number, number];
    let n = 0;
    const set: SymmetryInput = { ...g, bonds: g.bonds.map((b) => (b.order === 2 ? { ...b, stereo: { refs: ends(b), cis: n++ === 0 } } : b)) };
    expect(n).toBe(2);
    expect(symmetryClasses(set)).toEqual(symmetryClasses(g));
    expect(sizes(set, symmetryClasses(set))).toEqual([2, 2, 2, 4]);
  });
});

describe("symmetry: a search that runs out of steps", () => {
  it("says so - tri-tert-butylmethanol - and its orbits are still never joined across classes", () => {
    const g = fromSmiles("CC(C)(C)C(O)(C(C)(C)C)C(C)(C)C");
    expect(canonicalWritten(g).complete).toBe(false);
    const found = symmetryOrbits(g);
    expect(found.complete).toBe(false);
    const cls = symmetryClasses(g);
    for (let a = 0; a < g.atoms.length; a++) for (let b = 0; b < g.atoms.length; b++) if (found.orbit[a] === found.orbit[b]) expect(cls[a]).toBe(cls[b]);
  });
});

describe("a double bond's cis or trans, as the canonical text writes it", () => {
  // (3-methylpent-2-ene: C1 0 - C2 1 = C3 2, C3's methyl 3 and ethyl 4-5. The text says "c" where the ends' lower-ranked other
  //  neighbours - C1, and the ethyl's CH2 before the methyl (two H before three) - are cis, "t" where trans, whichever
  //  neighbour each end was given against: an end of one other neighbour (C2's) is set against it, one of two by which of the
  //  two its reference is)
  const g = fromSmiles("CC=C(C)CC");
  const given = (ref: number, cis: boolean): SymmetryInput => ({ ...g, bonds: g.bonds.map((b, k) => (k === 1 ? { ...b, stereo: { refs: [0, ref] as [number, number], cis } } : b)) });
  const letter = (h: SymmetryInput) => canonicalWritten(h).text.match(/:2:([ct])/)?.[1];

  it("writes C1 and the ethyl cis as c, and trans as t", () => {
    expect(letter(given(4, true))).toBe("c");
    expect(letter(given(4, false))).toBe("t");
  });

  it("writes the same configuration given against the methyl the same way: the ethyl cis to C1 is the methyl trans to it", () => {
    expect(letter(given(3, false))).toBe("c");
    expect(letter(given(3, true))).toBe("t");
  });
});
