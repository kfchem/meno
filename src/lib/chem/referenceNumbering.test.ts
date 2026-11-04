import { describe, expect, it } from "vitest";
import { matchedNumbering, numberedLike, numberingCentres, throughRepresentative, type NumberedStructure, type NumberingCentre } from "./referenceNumbering";
import { mapOnto } from "./reactionMap";
import type { Molecule } from "./molecule";
import type { EntryBond } from "../entry";

/**
 * A structure from its heavy atoms, their bonds and each one's hydrogens -
 * the hydrogens numbered after every heavy atom, each heavy atom's in turn.
 */
function withHs(els: string[], heavy: [number, number, (1 | 2 | 3)?][], hs: number[]): NumberedStructure {
  const atoms = els.map((el) => ({ el }));
  const bonds: EntryBond[] = heavy.map(([a1, a2, order]) => ({ a1, a2, order: order ?? 1 }));
  hs.forEach((k, i) => {
    for (let j = 0; j < k; j++) {
      bonds.push({ a1: i, a2: atoms.length, order: 1 });
      atoms.push({ el: "H" });
    }
  });
  return { atoms, bonds };
}

/** Places for `n` atoms that no three or four of lie in a line or a plane (a seeded walk, the same each run). */
function places(n: number, seed = 7): number[] {
  let x = seed;
  const next = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648) * 4 - 2;
  return Array.from({ length: 3 * n }, next);
}

/** `xyz` with its atoms renumbered by `sigma`: atom k of the result stands where atom sigma[k] did. */
const permuted = (xyz: readonly number[], sigma: readonly number[]) => sigma.flatMap((j) => [xyz[3 * j], xyz[3 * j + 1], xyz[3 * j + 2]]);

/** The transposition of `a` and `b` among `n` atoms. */
const swap = (n: number, ...pairs: [number, number][]) => {
  const p = Array.from({ length: n }, (_, i) => i);
  for (const [a, b] of pairs) [p[a], p[b]] = [p[b], p[a]];
  return p;
};

/** The centres of `s` all read in `xyz` renumbered by `order` as in the reference - checked by reading them afresh on the renumbered places. */
function allAgree(s: NumberedStructure, ref: readonly number[], xyz: readonly number[], order: readonly number[]) {
  const centres = numberingCentres(s, ref);
  const again = numberingCentres(s, permuted(xyz, order));
  expect(again.map((c) => c.reference)).toEqual(centres.map((c) => c.reference));
}

describe("a structure's centres, as its numbering is matched", () => {
  // chloroethane: Cl0 C1 C2, C1's H 3 4, C2's H 5 6 7
  const chloroethane = withHs(["Cl", "C", "C"], [[0, 1], [1, 2]], [0, 2, 3]);

  it("an atom of four with two or three alike, read by the volume of its neighbours", () => {
    const centres = numberingCentres(chloroethane, places(8));
    expect(centres.map((c) => [c.atom, c.kind, c.atoms])).toEqual([
      [1, "tetrahedral", [0, 2, 3, 4]],
      [2, "tetrahedral", [1, 5, 6, 7]],
    ]);
    // (a CH2's one swap, a methyl's three, pair by pair)
    expect(centres.map((c) => c.swaps.length)).toEqual([1, 3]);
    expect(centres[0].swaps[0]).toEqual(swap(8, [3, 4]));
  });

  it("an atom of four alike is no centre (neopentane's middle), its methyls are", () => {
    const neopentane = withHs(["C", "C", "C", "C", "C"], [[0, 1], [0, 2], [0, 3], [0, 4]], [0, 3, 3, 3, 3]);
    expect(numberingCentres(neopentane, places(17)).map((c) => c.atom)).toEqual([1, 2, 3, 4]);
  });

  it("an atom of three with its two others alike across a double bond, read by the torsion to its partner's lowest other neighbour", () => {
    // propene: C0=C1-C2; C0's H 3 4, C1's 5, C2's 6 7 8
    const propene = withHs(["C", "C", "C"], [[0, 1, 2], [1, 2]], [2, 1, 3]);
    const centres = numberingCentres(propene, places(9));
    expect(centres.find((c) => c.atom === 0)).toMatchObject({ kind: "double bond", atoms: [3, 0, 1, 2] });
  });

  it("an allene's end, read by the volume of the four atoms on its two ends", () => {
    // 1,1-dimethylallene's other end: C0(H2)=C1=C2(C3)(C4)
    const allene = withHs(["C", "C", "C", "C", "C"], [[0, 1, 2], [1, 2, 2], [2, 3], [2, 4]], [2, 0, 0, 3, 3]);
    const centres = numberingCentres(allene, places(13));
    expect(centres.find((c) => c.atom === 0)).toMatchObject({ kind: "allene", atoms: [5, 6, 3, 4] });
    expect(centres.find((c) => c.atom === 2)).toMatchObject({ kind: "allene", atoms: [3, 4, 5, 6] });
  });

  it("an aromatic ring's atoms are no double-bond centres, whichever Kekulé structure is drawn; a methyl on it is", () => {
    // toluene: ring C0-C5, C6 the methyl; H: C1..C5 one each, C6 three
    const toluene = withHs(["C", "C", "C", "C", "C", "C", "C"], [[0, 1, 2], [1, 2], [2, 3, 2], [3, 4], [4, 5, 2], [5, 0], [0, 6]], [0, 1, 1, 1, 1, 1, 3]);
    expect(numberingCentres(toluene, places(15)).map((c) => c.atom)).toEqual([6]);
  });

  it("two like branches swapped whole, atom for atom - nothing else moved", () => {
    // 2-chloropropane: Cl0 C1 C2 C3, C1-C2-C3 with Cl on C2; C1's H 4 5 6, C2's 7, C3's 8 9 10
    const s = withHs(["Cl", "C", "C", "C"], [[0, 2], [1, 2], [2, 3]], [0, 3, 1, 3]);
    const c2 = numberingCentres(s, places(11)).find((c) => c.atom === 2)!;
    expect(c2.swaps).toHaveLength(1);
    const g = c2.swaps[0];
    expect([g[1], g[3]]).toEqual([3, 1]);
    expect(new Set([4, 5, 6].map((h) => g[h]))).toEqual(new Set([8, 9, 10]));
    expect(g.every((x, i) => g[x] === i)).toBe(true);
    expect([0, 2, 7].map((i) => g[i])).toEqual([0, 2, 7]);
  });

  it("two alike in one ring: the ring turned over about the centre", () => {
    // methylcyclohexane: ring C0..C5, C6 the methyl on C0
    const s = withHs(["C", "C", "C", "C", "C", "C", "C"], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6]], [1, 2, 2, 2, 2, 2, 3]);
    const c0 = numberingCentres(s, places(21)).find((c) => c.atom === 0)!;
    const g = c0.swaps[0];
    expect([g[1], g[5], g[2], g[4], g[3], g[6]]).toEqual([5, 1, 4, 2, 3, 6]);
  });
});

describe("a geometry's numbering matched to the reference's", () => {
  const chloroethane = withHs(["Cl", "C", "C"], [[0, 1], [1, 2]], [0, 2, 3]);
  const ref = places(8);

  it("as it is where it already matches", () => {
    expect(matchedNumbering(numberingCentres(chloroethane, ref), ref)).toEqual({ order: [0, 1, 2, 3, 4, 5, 6, 7] });
  });

  it("a CH2's hydrogens in each other's places swapped back: the reference's places, atom for atom", () => {
    const xyz = permuted(ref, swap(8, [3, 4]));
    const r = matchedNumbering(numberingCentres(chloroethane, ref), xyz);
    expect(r).toEqual({ order: swap(8, [3, 4]) });
    if ("order" in r) expect(permuted(xyz, r.order)).toEqual(ref);
  });

  it("a methyl's hydrogens turned the other way: two of them swapped back, its handedness the reference's", () => {
    const xyz = permuted(ref, swap(8, [5, 7]));
    const r = matchedNumbering(numberingCentres(chloroethane, ref), xyz);
    if (!("order" in r)) throw new Error("not matched");
    expect(r.order.filter((x, i) => x !== i)).toHaveLength(2);
    allAgree(chloroethane, ref, xyz, r.order);
  });

  it("two like branches, each in the other's place, with their own hydrogens mixed: all set as the reference's", () => {
    const s = withHs(["Cl", "C", "C", "C"], [[0, 2], [1, 2], [2, 3]], [0, 3, 1, 3]);
    const r0 = places(11, 3);
    // (C1's branch and C3's swapped, and C1's hydrogens turned besides)
    const sigma = swap(11, [1, 3], [4, 8], [5, 10], [6, 9]);
    const xyz = permuted(r0, sigma);
    const r = matchedNumbering(numberingCentres(s, r0), xyz);
    if (!("order" in r)) throw new Error("not matched");
    expect([r.order[1], r.order[3]]).toEqual([3, 1]);
    allAgree(s, r0, xyz, r.order);
  });

  it("a ring turned over about a centre: turned back", () => {
    const s = withHs(["C", "C", "C", "C", "C", "C", "C"], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6]], [1, 2, 2, 2, 2, 2, 3]);
    const r0 = places(21, 11);
    const flip = numberingCentres(s, r0).find((c) => c.atom === 0)!.swaps[0];
    const xyz = permuted(r0, flip);
    const r = matchedNumbering(numberingCentres(s, r0), xyz);
    if (!("order" in r)) throw new Error("not matched");
    expect([r.order[1], r.order[5]]).toEqual([5, 1]);
    allAgree(s, r0, xyz, r.order);
  });

  it("a double bond's end with its hydrogens the other way round: swapped back", () => {
    const propene = withHs(["C", "C", "C"], [[0, 1, 2], [1, 2]], [2, 1, 3]);
    // (a double bond's places are not any: in its plane, C2 cis to H3)
    const r0 = [0, 0, 0, 1.34, 0, 0, 2.1, 1.25, 0, -0.55, 0.92, 0, -0.55, -0.92, 0, 1.9, -0.93, 0, 3.1, 1.0, 0.3, 1.8, 1.9, 0.85, 2.0, 1.85, -0.9];
    const xyz = permuted(r0, swap(9, [3, 4]));
    const r = matchedNumbering(numberingCentres(propene, r0), xyz);
    if (!("order" in r)) throw new Error("not matched");
    expect([r.order[3], r.order[4]]).toEqual([4, 3]);
    allAgree(propene, r0, xyz, r.order);
  });

  it("a centre no swap sets is not resolved, and no numbering is given", () => {
    const ref2 = places(5, 2);
    const stuck: NumberingCentre = { atom: 0, kind: "tetrahedral", atoms: [1, 2, 3, 4], reference: true, swaps: [] };
    const mirror = ref2.map((v, i) => (i % 3 === 0 ? -v : v));
    const sign = numberingCentres(withHs(["C", "F", "Cl", "Br", "H"], [[0, 1], [0, 2], [0, 3], [0, 4]], [0, 0, 0, 0, 0]), ref2);
    // (no alike neighbours: no centre of its own)
    expect(sign).toEqual([]);
    const r1 = matchedNumbering([stuck], ref2);
    const r2 = matchedNumbering([stuck], mirror);
    // (one of a geometry and its mirror image is not as the centre reads: that one is not resolved)
    expect([r1, r2].filter((r) => "unresolved" in r)).toEqual([{ unresolved: [0] }]);
  });
});

/** `s` at the places `xyz`, as a molecule. */
const at3d = (s: NumberedStructure, xyz: readonly number[]): Molecule => ({
  atoms: s.atoms.map((a, i) => ({ el: a.el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })),
  bonds: s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
});

describe("conformers numbered like their reference", () => {
  // (propene in its plane, C3 cis to H4 - and a conformer of it with H4 and H5 each in the other's place)
  const propene = withHs(["C", "C", "C"], [[0, 1, 2], [1, 2]], [2, 1, 3]);
  const r0 = [0, 0, 0, 1.34, 0, 0, 2.1, 1.25, 0, -0.55, 0.92, 0, -0.55, -0.92, 0, 1.9, -0.93, 0, 3.1, 1.0, 0.3, 1.8, 1.9, 0.85, 2.0, 1.85, -0.9];
  const swapped = permuted(r0, swap(9, [3, 4]));

  it("gives each conformer's numbering, the same as the full atom map's where only like hydrogens stood in each other's places", () => {
    const [light] = numberedLike(at3d(propene, r0), [at3d(propene, swapped)]);
    const full = mapOnto([at3d(propene, r0)], [[at3d(propene, swapped)]], { bonds: "same" });
    expect(light).toEqual({ order: swap(9, [3, 4]) });
    expect(full.mapped[0].order.slice(3, 5)).toEqual([4, 3]);
    // (both set the =CH2 as the reference has it; a methyl's hydrogens may be turned either way between them)
    if ("order" in light) {
      for (const order of [light.order, full.mapped[0].order]) expect(matchedNumbering(numberingCentres(propene, r0), permuted(swapped, order))).toEqual({ order: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
    }
  });

  it("the same as the full atom map's on two like branches each in the other's place", () => {
    const s = withHs(["Cl", "C", "C", "C"], [[0, 2], [1, 2], [2, 3]], [0, 3, 1, 3]);
    // (2-chloropropane with its methyls swapped whole: the full map and the light one both put them back)
    const r = places(11, 3);
    const xyz = permuted(r, swap(11, [1, 3], [4, 8], [5, 10], [6, 9]));
    const [light] = numberedLike(at3d(s, r), [at3d(s, xyz)]);
    const full = mapOnto([at3d(s, r)], [[at3d(s, xyz)]], { bonds: "same" });
    if (!("order" in light)) throw new Error(light.why);
    expect([light.order[1], light.order[3]]).toEqual([3, 1]);
    expect([full.mapped[0].order[1], full.mapped[0].order[3]]).toEqual([3, 1]);
  });

  it("says why where a conformer is not of the reference's structure", () => {
    const other = { ...at3d(propene, swapped), bonds: at3d(propene, swapped).bonds.slice(1) };
    expect(numberedLike(at3d(propene, r0), [other])).toEqual([{ why: "Its bonds are not the reference's: both must be bonded alike, in one numbering." }]);
  });

  it("goes through a representative: the reference's atom i is the representative's map[i], which is the conformer's", () => {
    expect(throughRepresentative([2, 0, 1], [1, 2, 0])).toEqual([0, 1, 2]);
  });
});
