import { describe, expect, it } from "vitest";
import { SAME_CONFORMER, Sameness } from "./sameConformer";
import { runMeno } from "./meno";
import { entryOfSet, setEntries, type SetEntry } from "./entries";

/** A geometry turned about z by `deg` and moved by `by`. */
const turned = (xyz: readonly number[], deg: number, by = [0, 0, 0]) => {
  const t = (deg * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i < xyz.length; i += 3) out.push(Math.cos(t) * xyz[i] - Math.sin(t) * xyz[i + 1] + by[0], Math.sin(t) * xyz[i] + Math.cos(t) * xyz[i + 1] + by[1], xyz[i + 2] + by[2]);
  return out;
};
/** A geometry with its atoms renumbered: atom k of the result is atom `order[k]` of `xyz`. */
const renumbered = (xyz: readonly number[], order: readonly number[]) => order.flatMap((i) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]]);

/** Hydrogen peroxide, H-O-O-H at a dihedral of `deg`: O, O, H on the first, H on the second. */
function peroxide(deg: number): number[] {
  const t = (deg * Math.PI) / 180;
  const h = 0.97 * Math.sin((100 * Math.PI) / 180);
  const along = -0.97 * Math.cos((100 * Math.PI) / 180);
  return [0, 0, 0, 1.47, 0, 0, -along, h, 0, 1.47 + along, h * Math.cos(t), h * Math.sin(t)];
}
const PEROXIDE = { atoms: [{ el: "O" }, { el: "O" }, { el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }, { a1: 1, a2: 3, order: 1 }] };

/** Ethane, staggered: C, C, then three H on each. */
function ethane(): number[] {
  const out = [0, 0, 0, 0, 0, 1.53];
  for (const [z, from] of [[-0.36, 0], [1.89, 60]] as const)
    for (let k = 0; k < 3; k++) {
      const a = ((from + 120 * k) * Math.PI) / 180;
      out.push(1.03 * Math.cos(a), 1.03 * Math.sin(a), z);
    }
  return out;
}
const ETHANE = {
  atoms: [{ el: "C" }, { el: "C" }, ...Array.from({ length: 6 }, () => ({ el: "H" }))],
  bonds: [{ a1: 0, a2: 1, order: 1 }, ...[2, 3, 4].map((h) => ({ a1: 0, a2: h, order: 1 })), ...[5, 6, 7].map((h) => ({ a1: 1, a2: h, order: 1 }))],
};

describe("the same conformer", () => {
  it("is one geometry turned and moved, its alike atoms swapped - all atoms within 0.01 Å", () => {
    const s = new Sameness(ETHANE.atoms, ETHANE.bonds, ethane());
    const a = ethane();
    // (turned, moved, its carbons swapped, and the hydrogens on each taken in another order)
    const b = turned(renumbered(a, [1, 0, 6, 7, 5, 3, 2, 4]), 37, [2, -1, 5]);
    const laid = s.apart(a, b)!;
    expect(laid.rmsd).toBeLessThan(1e-6);
    // (staggered ethane's carbons swap onto each other by a turn too: either way, the hydrogens follow)
    expect(new Set(laid.to)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(s.same(a, b)).toBe(true);
    // (a hair beyond the definition: two)
    const moved = [...b];
    moved[3 * 7] += 0.04;
    expect(s.same(a, moved)).toBe(false);
  });

  it("keeps a conformer and its mirror image apart - and says where each atom goes in the mirror image", () => {
    const s = new Sameness(PEROXIDE.atoms, PEROXIDE.bonds, peroxide(115));
    const a = peroxide(115);
    const mirror = turned(peroxide(-115), 80, [1, 1, 1]);
    expect(s.same(a, mirror)).toBe(false);
    const m = s.mirrorOf(a, mirror)!;
    expect(m.rmsd).toBeLessThan(1e-6);
    expect(m.to).toHaveLength(4);
    // (the other gauche form is no mirror image of this one's: 60° apart)
    expect(s.mirrorOf(a, peroxide(-55))).toBeNull();
    // (and a geometry the same as itself, renumbered: the same)
    expect(s.same(a, renumbered(a, [1, 0, 3, 2]))).toBe(true);
    expect(SAME_CONFORMER).toBe(0.01);
  });

  it("takes a phenyl turned half about its bond for the same conformer, whichever ring bonds its Kekulé structure makes double", () => {
    const a = toluene();
    // (the ring and its hydrogens turned 180° about the x axis, its bond to the methyl; the methyl as it was)
    const ring = new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
    const b = a.map((v, k) => (ring.has(Math.floor(k / 3)) && k % 3 !== 0 ? -v : v));
    // (its ortho and meta carbons now each where the other was: C1=C2 lies where C1-C6 was)
    expect(Math.hypot(b[3] - a[15], b[4] - a[16], b[5] - a[17])).toBeLessThan(1e-9);
    const s = new Sameness(TOLUENE.atoms, TOLUENE.bonds, a);
    expect(s.apart(a, turned(b, 50, [1, 2, 3]))!.rmsd).toBeLessThan(1e-6);
    // (and the other Kekulé structure the same)
    expect(new Sameness(TOLUENE.atoms, TOLUENE_OTHER_KEKULE, a).same(a, b)).toBe(true);
  });

  it("keeps a cyclooctatetraene's double bonds where they are: its bonds shifted round by one are another geometry", () => {
    const a = cyclooctatetraene();
    // (each atom where the next was: the same places, its double bonds now where its single bonds were - 4n atoms, no Hückel ring)
    const shifted = renumbered(a, [1, 2, 3, 4, 5, 6, 7, 0, 9, 10, 11, 12, 13, 14, 15, 8]);
    const s = new Sameness(COT.atoms, COT.bonds, a);
    expect(s.same(a, shifted)).toBe(false);
    expect(s.same(a, turned(renumbered(a, [2, 3, 4, 5, 6, 7, 0, 1, 10, 11, 12, 13, 14, 15, 8, 9]), 20))).toBe(true);
  });
});

/** Cyclooctatetraene, flat here: C1=C2 1.34 Å, C2-C3 1.47 Å and so on round, each corner 135°; then each carbon's H, outwards. */
function cyclooctatetraene(): number[] {
  const cs: number[][] = [[0, 0, 0]];
  for (let k = 0; k < 7; k++) {
    const [x, y] = cs[k];
    const t = (k * Math.PI) / 4;
    const d = k % 2 ? 1.47 : 1.34;
    cs.push([x + d * Math.cos(t), y + d * Math.sin(t), 0]);
  }
  const c = [0, 1].map((d) => cs.reduce((m, p) => m + p[d] / 8, 0));
  const hs = cs.map(([x, y]) => {
    const r = Math.hypot(x - c[0], y - c[1]);
    return [x + (1.08 * (x - c[0])) / r, y + (1.08 * (y - c[1])) / r, 0];
  });
  return [...cs, ...hs].flat();
}
const COT = {
  atoms: [...Array.from({ length: 8 }, () => ({ el: "C" })), ...Array.from({ length: 8 }, () => ({ el: "H" }))],
  bonds: [...Array.from({ length: 8 }, (_, k) => ({ a1: k, a2: (k + 1) % 8, order: k % 2 ? 1 : 2 })), ...Array.from({ length: 8 }, (_, k) => ({ a1: k, a2: 8 + k, order: 1 }))],
};

/** Toluene: the ring's carbons C1 (ipso) to C6, the methyl's C7, H on C2 to C6, then the methyl's three, none in the ring's plane. */
function toluene(): number[] {
  const out: number[] = [];
  for (let k = 0; k < 6; k++) out.push(1.39 * Math.cos((k * Math.PI) / 3), 1.39 * Math.sin((k * Math.PI) / 3), 0);
  out.push(2.9, 0, 0);
  for (let k = 1; k < 6; k++) out.push(2.47 * Math.cos((k * Math.PI) / 3), 2.47 * Math.sin((k * Math.PI) / 3), 0);
  for (let k = 0; k < 3; k++) {
    const t = (2 * k * Math.PI) / 3 + 0.4;
    out.push(3.26, 1.03 * Math.cos(t), 1.03 * Math.sin(t));
  }
  return out;
}
const TOLUENE = {
  atoms: [...Array.from({ length: 7 }, () => ({ el: "C" })), ...Array.from({ length: 8 }, () => ({ el: "H" }))],
  bonds: [
    { a1: 0, a2: 1, order: 2 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 2 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 4, a2: 5, order: 2 },
    { a1: 5, a2: 0, order: 1 },
    { a1: 0, a2: 6, order: 1 },
    ...[1, 2, 3, 4, 5].map((c, k) => ({ a1: c, a2: 7 + k, order: 1 })),
    ...[12, 13, 14].map((h) => ({ a1: 6, a2: h, order: 1 })),
  ],
};
/** Toluene's other Kekulé structure: each of the ring's bonds the other order. */
const TOLUENE_OTHER_KEKULE = TOLUENE.bonds.map((b, k) => (k < 6 ? { ...b, order: 3 - b.order } : b));

/** Conformers of one compound, as a conformer set gives them: each geometry, its energy - and, where given, which stereoisomer it is. */
function conformers(xyzs: readonly number[][], energies: readonly number[], key?: (k: number) => string): SetEntry[] {
  const [first, ...rest] = xyzs;
  const m = {
    id: 1,
    at: { x: 0, y: 0 },
    atoms: PEROXIDE.atoms.map((a, i) => ({ ...a, x: first[3 * i], y: first[3 * i + 1], z: first[3 * i + 2] })),
    bonds: PEROXIDE.bonds,
    frames: rest.map((f) => [...f]),
    energies: [...energies],
    conformerSet: true as const,
  };
  return setEntries([m], "conformers").map((e, k) =>
    key ? { ...e, stereo: { perceived: true as const, elements: [], key: key(k), by: { plugin: "rdkit", version: "1" } } } : e,
  );
}

describe("Duplicates, on the one definition", () => {
  const gauche = peroxide(115);
  const mirror = turned(peroxide(-115), 80, [1, 1, 1]);
  const alike = turned(renumbered(gauche, [1, 0, 3, 2]), 33);

  it("sets aside the same conformer, its alike atoms swapped - and keeps a conformer's mirror image apart, by default", () => {
    const out = runMeno("duplicates", conformers([gauche, alike, mirror], [0, 1e-6, 0]), "conformers");
    expect(out.ok && out.kept.map((e) => e.number)).toEqual([1, 3]);
    expect(out.ok && out.aside.map((e) => e.number)).toEqual([2]);
    expect(out.said).toBe("2 of 3 kept");
    // (an OH turned 5° farther: another conformer)
    expect(runMeno("duplicates", conformers([gauche, peroxide(120)], [0, 0]), "conformers").said).toBe("2 of 2 kept");
  });

  it("counts a mirror image in where asked: degeneracy 2, and the atoms it swaps kept - only of one stereoisomer, known", () => {
    const set = conformers([gauche, alike, mirror], [0, 1e-6, 0], () => "achiral");
    const out = runMeno("duplicates", set, "conformers", { mirrors: "counted" });
    if (!out.ok) throw new Error(out.said);
    expect(out.said).toBe("1 of 3 kept · 1 mirror image counted in (degeneracy 2)");
    expect(out.kept.map((e) => [e.number, e.degeneracy])).toEqual([[1, 2]]);
    const swap = out.kept[0].mirror!;
    // (a permutation of its atoms: each oxygen to an oxygen, each hydrogen to a hydrogen)
    expect([...swap].sort()).toEqual([0, 1, 2, 3]);
    expect(swap.slice(0, 2).every((i) => i < 2) && swap.slice(2).every((i) => i >= 2)).toBe(true);
    // (said on the entry, as a list by atom)
    expect(entryOfSet(out.kept[0], "e1").properties.mirror).toMatchObject({ value: { list: swap, per: "atom" } });
    // (and Populations counts it twice: the gauche form and its mirror image against the trans form, all three at one energy)
    const three = runMeno("duplicates", conformers([gauche, mirror, peroxide(180)], [0, 0, 0], () => "achiral"), "conformers", { mirrors: "counted" });
    if (!three.ok) throw new Error(three.said);
    const shares = runMeno("populations", three.kept, "conformers", { temperature: 298.15 });
    expect(shares.ok && shares.shares!.map((x) => +x.toFixed(6))).toEqual([0.666667, 0.333333]);
    // (two stereoisomers - a chiral molecule's enantiomers - are never counted in, one in the other)
    const two = runMeno("duplicates", conformers([gauche, mirror], [0, 0], (k) => (k ? "S" : "R")), "conformers", { mirrors: "counted" });
    expect(two.ok && two.kept.map((e) => e.degeneracy)).toEqual([1, 1]);
    // (which stereoisomer each is not known: nothing done, saying why)
    expect(runMeno("duplicates", conformers([gauche, mirror], [0, 0]), "conformers", { mirrors: "counted" })).toEqual({
      ok: false,
      said: "Which stereoisomer entry 1 is is not known: a mirror image is counted in only where it is the same stereoisomer",
    });
  });
});

describe("past the ways it tries", () => {
  // (a centre with 7 two-carbon arms: 7! = 5,040 ways onto itself, past the 1,000 tried - its atoms taken against
  //  their own alone)
  const ARMS = 7;
  const atoms = [{ el: "W" }, ...Array.from({ length: 2 * ARMS }, () => ({ el: "C" }))];
  const bonds = Array.from({ length: ARMS }, (_, k) => [{ a1: 0, a2: 1 + 2 * k, order: 1 }, { a1: 1 + 2 * k, a2: 2 + 2 * k, order: 1 }]).flat();
  const xyz = [0, 0, 0];
  for (let k = 0; k < ARMS; k++) {
    // (each arm its own way out, none alike)
    const t = (2 * Math.PI * k) / ARMS + 0.1 * k * k;
    const z = Math.cos(1 + k);
    const r = Math.sqrt(1 - z * z);
    const d = [r * Math.cos(t), r * Math.sin(t), z];
    xyz.push(...d.map((v) => 2.1 * v), ...d.map((v) => 3.6 * v + 0.3 * (k % 2)));
  }
  // (the same conformer, two arms' labels swapped)
  const swapped = renumbered(xyz, [0, 3, 4, 1, 2, ...Array.from({ length: 2 * ARMS - 4 }, (_, i) => 5 + i)]);

  it("misses a duplicate it cannot try every way - and says so on the step's line", () => {
    const same = new Sameness(atoms, bonds, xyz);
    expect(same.capped).toBe(true);
    expect(same.same(xyz, swapped)).toBe(false);
    const m = { id: 1, at: { x: 0, y: 0 }, atoms: atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })), bonds, frames: [swapped], energies: [0, 0], conformerSet: true as const };
    const out = runMeno("duplicates", setEntries([m], "conformers"), "conformers");
    expect(out.said).toBe("2 of 2 kept · 1 compound has more than 1,000 symmetric ways: duplicates of it could be missed");
    // (one of it alone: nothing to miss, nothing said of the ways - only that it is one)
    expect(runMeno("duplicates", setEntries([{ ...m, frames: [], energies: [0] }], "conformers"), "conformers").said).toBe("1 of 1 kept · the compound has one conformer");
  });
});
