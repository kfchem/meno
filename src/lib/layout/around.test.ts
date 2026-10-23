import { describe, expect, it } from "vitest";
import { layoutAround, MISMATCH_LIMIT, type FixedDrawing } from "./around";
import { reordered } from "./canonical";
import { layout2D, type Layout2D } from "./engine";
import { dist, type Point } from "./geometry";
import { perceive, type LayoutInput } from "./perceive";
import { notAsGiven } from "./readBack";
import { fromSmiles } from "./testdata/fromSmiles";
import { measured } from "../../testing/timeouts";

const at = (out: Pick<Layout2D, "x" | "y">, a: number): Point => ({ x: out.x[a], y: out.y[a] });

/** The rest of a structure drawn as `drawing` draws it, every atom but the part's, `by` times as large: as a chemist's drawing at their own bond length. */
function restOf(drawing: Pick<Layout2D, "x" | "y">, part: readonly number[], by = 1): FixedDrawing {
  return { at: drawing.x.map((x, a) => (part.includes(a) ? null : { x: x * by, y: drawing.y[a] * by })) };
}

/** Every bond of `atoms` of a drawing, each as long as `bond` within a hair. */
function bondsOf(input: LayoutInput, out: Pick<Layout2D, "x" | "y">, atoms: readonly number[], bond: number): number[] {
  return input.bonds.filter((b) => atoms.includes(b.a) && atoms.includes(b.b)).map((b) => dist(at(out, b.a), at(out, b.b)) / bond);
}

/** A second molecule's atoms laid where a first's were: the same element, one by one, as `pairs` matches them. */
function drawnFrom(first: Pick<Layout2D, "x" | "y">, pairs: readonly [number, number][], n: number): Pick<Layout2D, "x" | "y"> {
  const x = new Array<number>(n).fill(NaN);
  const y = new Array<number>(n).fill(NaN);
  for (const [from, to] of pairs) [x[to], y[to]] = [first.x[from], first.y[from]];
  return { x, y };
}

describe("a part drawn afresh between fixed neighbours", () => {
  it("on one bond: the rest exactly where it was, the part's bond along the opening the rest left, its ring regular", () => {
    // (ethylbenzene, its ring the part; its ethyl drawn at a bond of 1.5)
    const g = fromSmiles("CCc1ccccc1");
    const ring = [2, 3, 4, 5, 6, 7];
    const fixed: FixedDrawing = { at: [{ x: 1.5 * Math.cos(Math.PI / 6), y: 0.75 }, { x: 0, y: 0 }] };
    const r = layoutAround(g, ring, fixed);
    if ("refused" in r) throw new Error(r.refused);
    expect(at(r.layout, 0)).toEqual(fixed.at[0]);
    expect(at(r.layout, 1)).toEqual({ x: 0, y: 0 });
    expect(r.moved).toEqual([]);
    expect(r.mismatch).toBe(0);
    for (const l of bondsOf(g, r.layout, [1, ...ring], 1.5)) expect(l).toBeCloseTo(1, 6);
    // (the bond to the ring at 120 degrees from the ethyl's own)
    const [u, v] = [at(r.layout, 0), at(r.layout, 2)];
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
    expect(cos).toBeCloseTo(-0.5, 6);
    expect(notAsGiven(g, r.layout)).toEqual([]);
    expect(r.crowded).toEqual([]);
  });

  it("says where it is crowded, rather than moving the rest: an ion of the rest where either way the ring could go has its atom", () => {
    // (ethylbenzene beside two chloride ions, each 0.3 of a bond past where one of the two openings at its CH2 puts the ring's first atom: on it, it would not read back)
    const g = fromSmiles("CCc1ccccc1.[Cl-].[Cl-]");
    const along = (deg: number, r = 1.5) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
    const fixed: FixedDrawing = { at: [along(30), { x: 0, y: 0 }, null, null, null, null, null, null, along(150, 1.95), along(-90, 1.95)] };
    const r = layoutAround(g, [2, 3, 4, 5, 6, 7], fixed);
    if ("refused" in r) throw new Error(r.refused);
    expect(at(r.layout, 8)).toEqual(fixed.at[8]);
    expect(at(r.layout, 9)).toEqual(fixed.at[9]);
    expect(r.crowded).toContain("C2 and Cl8 are on top of each other");
  });

  it("on two bonds: a benzene swapped for a pyridine, its substituents where they were within a hair, each moved as a whole", () => {
    // (1,3-diethylbenzene drawn; then 2,6-diethylpyridine, its ethyls where the benzene's were)
    const old = fromSmiles("CCc1cccc(CC)c1");
    const drawn = layout2D(old);
    const g = fromSmiles("CCc1cccc(CC)n1");
    const ring = [2, 3, 4, 5, 6, 9];
    const fixed = restOf(drawnFrom(drawn, [0, 1, 7, 8].map((a) => [a, a]), g.atoms.length), ring, 2);
    const r = layoutAround(g, ring, fixed);
    if ("refused" in r) throw new Error(r.refused);
    expect(r.moved).toEqual([
      [0, 1],
      [7, 8],
    ]);
    expect(r.mismatch).toBeLessThan(0.05);
    for (const a of [0, 1, 7, 8]) expect(dist(at(r.layout, a), fixed.at[a]!) / 2).toBeLessThan(0.1);
    for (const l of bondsOf(g, r.layout, g.atoms.map((_, a) => a), 2)) expect(l).toBeCloseTo(1, 6);
    expect(notAsGiven(g, r.layout)).toEqual([]);
  });

  it("on two bonds: a moved branch with one way to lie flipped over its bond to clear the rest, its kept wedge turned to hashes so that its centre reads as given", () => {
    // (a 3-hydroxybutan-2-yl, its CH bonded to two more of the rest - one way only to lie on its bond - and its CH(OH) a centre wedged as the chemist drew it)
    const old = fromSmiles("C[C@@H](O)C(C)c1cccc(CC)c1");
    const drawn = layout2D(old);
    const g = fromSmiles("C[C@@H](O)C(C)c1cccc(CC)n1.[Cl-]");
    const ring = [5, 6, 7, 8, 9, 12];
    const wedges = drawn.wedges.filter((w) => w.from === 1);
    const hydrogens = drawn.hydrogens.filter((h) => h.on === 1);
    expect(wedges.length).toBe(1);
    const rest = (ion: Point): FixedDrawing => ({
      at: [...restOf(drawnFrom(drawn, [0, 1, 2, 3, 4, 10, 11].map((a) => [a, a]), g.atoms.length), ring).at.slice(0, 13), ion],
      stereo: { wedges, hydrogens },
    });
    const clear = layoutAround(g, ring, rest({ x: 100, y: 100 }));
    if ("refused" in clear) throw new Error(clear.refused);
    expect(clear.layout.wedges.find((w) => w.from === 1)?.stereo).toBe(wedges[0].stereo);
    const [c, o] = [at(clear.layout, 1), at(clear.layout, 2)];
    const ion = { x: o.x + 0.3 * (o.x - c.x), y: o.y + 0.3 * (o.y - c.y) };
    const r = layoutAround(g, ring, rest(ion));
    if ("refused" in r) throw new Error(r.refused);
    expect(r.crowded).toEqual([]);
    expect(dist(at(r.layout, 3), at(clear.layout, 3))).toBeLessThan(1e-9);
    expect(r.layout.wedges.find((w) => w.from === 1)?.stereo).not.toBe(wedges[0].stereo);
    expect(notAsGiven(g, r.layout)).toEqual([]);
  });

  it("on three bonds: the rest drawn as the mirror image of how the part is drawn on its own - the part mirrored to meet it", () => {
    // (1,2,4-triethylbenzene: no turn takes its three ethyls onto their mirror image)
    const g = fromSmiles("CCc1ccc(CC)c(CC)c1");
    const drawn = layout2D(g);
    const ring = [2, 3, 4, 5, 8, 11];
    const fixed = restOf({ x: drawn.x.map((x) => -x), y: drawn.y }, ring);
    const r = layoutAround(g, ring, fixed);
    if ("refused" in r) throw new Error(r.refused);
    expect(r.mismatch).toBeLessThan(0.05);
    expect(notAsGiven(g, r.layout)).toEqual([]);
  });

  it("on two bonds: substituents drawn 1,2 on a benzene, the new part a biphenyl with them 4,4' - too far, so drawn whole, and said", () => {
    const old = fromSmiles("CCc1ccccc1CC");
    const drawn = layout2D(old);
    const g = fromSmiles("CCc1ccc(cc1)-c1ccc(CC)cc1");
    const rings = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15];
    const fixed = restOf(drawnFrom(drawn, [0, 1, 8, 9].map((a, k) => [a, [0, 1, 12, 13][k]]), g.atoms.length), rings);
    const r = layoutAround(g, rings, fixed);
    expect(r).toEqual({ refused: `The new part's bonds to the rest end more than ${MISMATCH_LIMIT} bond from where the rest's atoms are, so the structure is drawn whole.` });
  });

  it("through a ring: its whole ring system taken in, and said", () => {
    // (2-ethylnaphthalene, one ring of the naphthalene asked for)
    const g = fromSmiles("CCc1ccc2ccccc2c1");
    const drawn = layout2D(g);
    const r = layoutAround(g, [2, 3, 4, 5, 10, 11], restOf(drawn, []));
    if ("refused" in r) throw new Error(r.refused);
    expect(r.taken).toEqual([6, 7, 8, 9]);
    expect(r.part).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(notAsGiven(g, r.layout)).toEqual([]);
  });

  it("is refused, and says why, where it would not be honest: joined by a double bond, a metal complex, a cage, the whole structure", () => {
    const refused = (smiles: string, part: number[]) => {
      const g = fromSmiles(smiles);
      const r = layoutAround(g, part, restOf(layout2D(g), part));
      return "refused" in r ? r.refused : null;
    };
    expect(refused("CC=C1CCCCC1", [2, 3, 4, 5, 6, 7])).toBe("The part is joined to the rest by a double bond (C1-C2), so the structure is drawn whole.");
    expect(refused("CC[Zn]CC", [2])).toBe("Zn2 makes the part a metal complex, which is drawn whole.");
    expect(refused("c1ccccc1", [0])).toBe("The part is the whole structure, so it is drawn whole.");
  });

  it("is refused, and says why, where its bonds to the rest alike can be paired more ways than are compared, or its symmetries cannot all be found", () => {
    // (each way would have to be compared, or the drawing would go by the order of the atoms)
    const refused = (smiles: string, part: (i: number, bonds: number) => boolean) => {
      const g = fromSmiles(smiles);
      const atoms = g.atoms.map((_, i) => i).filter((i) => part(i, g.bonds.filter((b) => b.a === i || b.b === i).length));
      const r = layoutAround(g, atoms, { at: g.atoms.map((_, i) => (atoms.includes(i) ? null : { x: Math.cos(i), y: Math.sin(i) })) });
      return "refused" in r ? r.refused : null;
    };
    // (1,3,5-tri-tert-butylbenzene's ring and its three quaternary carbons the part, its nine methyls the rest)
    expect(refused("CC(C)(C)c1cc(C(C)(C)C)cc(C(C)(C)C)c1", (_, bonds) => bonds > 1)).toBe("The part has too many bonds to the rest that are alike to compare each way of pairing them, so the structure is drawn whole.");
    // (tri-tert-butylmethane, one methyl the rest: its symmetries more than the search finds)
    expect(refused("CC(C)(C)C(C(C)(C)C)C(C)(C)C", (i) => i !== 0)).toBe("The part is too symmetric for each of its symmetries to be found, so the structure is drawn whole.");
  });

  it("is refused where the part holds a cage, drawn in perspective", () => {
    // (ethylcubane, its cube the part: the ethyl placed by hand, so that only the part is laid out)
    const g = fromSmiles("CCC12C3C4C1C5C2C3C45");
    const r = layoutAround(g, [2, 3, 4, 5, 6, 7, 8, 9], { at: [{ x: 1.299, y: 0.75 }, { x: 0, y: 0 }] });
    expect(r).toEqual({ refused: "The part holds a cage, drawn in perspective, so the structure is drawn whole." });
    // (its cube laid out in perspective: 0.25 s alone, 3.2 s seen with other lanes running)
  }, measured(300));

  it("keeps the stereocentres of the part and of the rest as given, read back from the drawing", () => {
    // ((R)-1-phenylethanol's CH(OH) the part, between its phenyl and its methyl)
    const g = fromSmiles("C[C@@H](O)c1ccccc1");
    const drawn = layout2D(g);
    const r = layoutAround(g, [1, 2], restOf(drawn, [1, 2]));
    if ("refused" in r) throw new Error(r.refused);
    expect(notAsGiven(g, r.layout)).toEqual([]);
    expect(r.layout.wedges.some((w) => w.from === 1)).toBe(true);
  });

  it("is refused where the drawing would not read back as given: a wedge of the rest's that says the other configuration", () => {
    // ((S)-alanine's methyl ester: its ester's methyl the part; the rest's centre given a wedge turned the other way)
    const g = fromSmiles("C[C@H](N)C(=O)OC");
    const drawn = layout2D(g);
    const wedges = drawn.wedges.map((w) => ({ ...w, stereo: w.stereo === "up" ? ("down" as const) : ("up" as const) }));
    expect(wedges.length).toBeGreaterThan(0);
    const r = layoutAround(g, [6], { ...restOf(drawn, [6]), stereo: { wedges, hydrogens: drawn.hydrogens } });
    expect(r).toEqual({ refused: "Drawn so, it would not read back as the structure given (C1 (flat): the other configuration), so the structure is drawn whole." });
  });

  it("comes out the same whatever order the atoms are given in, its wedges too", () => {
    // ((R)-1-phenylethanol's CH(OH) the part)
    const g = fromSmiles("C[C@@H](O)c1ccccc1");
    const drawn = layout2D(g);
    const fixed = restOf(drawn, [1, 2]);
    const n = g.atoms.length;
    const seen = (input: LayoutInput, r: ReturnType<typeof layoutAround>) => {
      if ("refused" in r) throw new Error(r.refused);
      const p = (a: number) => `${r.layout.x[a].toFixed(6)},${r.layout.y[a].toFixed(6)}`;
      const atoms = input.atoms.map((a, i) => `${a.el}@${p(i)}`).sort().join(" ");
      const wedges = r.layout.wedges.map((w) => `${p(w.from)}>${w.to < 0 ? "H" : p(w.to)}:${w.stereo}`).sort().join(" ");
      const hydrogens = r.layout.hydrogens.map((h) => `${p(h.on)}>${h.at.x.toFixed(6)},${h.at.y.toFixed(6)}`).sort().join(" ");
      return `${atoms} | ${wedges} | ${hydrogens}`;
    };
    const first = seen(g, layoutAround(g, [1, 2], fixed));
    const orders = [g.atoms.map((_, i) => n - 1 - i), g.atoms.map((_, i) => (i + 4) % n), g.atoms.map((_, i) => (i * 7) % n)];
    for (const [k, to] of orders.entries()) {
      expect(new Set(to).size).toBe(n);
      const other = reordered(g, to);
      const atOther = new Array<Point | null>(n).fill(null);
      fixed.at.forEach((p, i) => (atOther[to[i]] = p ?? null));
      expect(seen(other, layoutAround(other, [to[1], to[2]], { at: atOther })), `order ${k + 1}`).toBe(first);
    }
  });

  it("comes out the same whatever order the atoms are given in", () => {
    const old = fromSmiles("CCc1cccc(CC)c1");
    const drawn = layout2D(old);
    const g = fromSmiles("CCc1cccc(CC)n1");
    const ring = [2, 3, 4, 5, 6, 9];
    const fixed = restOf(drawnFrom(drawn, [0, 1, 7, 8].map((a) => [a, a]), g.atoms.length), ring);
    const seen = (r: ReturnType<typeof layoutAround>, input: LayoutInput) => {
      if ("refused" in r) throw new Error(r.refused);
      const p = (a: number) => `${r.layout.x[a].toFixed(6)},${r.layout.y[a].toFixed(6)}`;
      return [input.atoms.map((a, i) => `${a.el}@${p(i)}`).sort().join(" "), r.layout.wedges.length].join(" | ");
    };
    const first = seen(layoutAround(g, ring, fixed), g);
    const n = g.atoms.length;
    const orders = [g.atoms.map((_, i) => (i + 2) % n), g.atoms.map((_, i) => (i * 3 + 1) % n), g.atoms.map((_, i) => n - 1 - i), g.atoms.map((_, i) => (i * 7) % n)];
    for (const [k, to] of orders.entries()) {
      expect(new Set(to).size).toBe(n);
      const other = reordered(g, to);
      const atOther = new Array<Point | null>(n).fill(null);
      fixed.at.forEach((p, i) => (atOther[to[i]] = p ?? null));
      expect(seen(layoutAround(other, ring.map((a) => to[a]), { at: atOther }), other), `order ${k}`).toBe(first);
    }
  });

  it("comes out the same whatever order a symmetric molecule's atoms are given in: its parts by their symmetric anchors, and a part on one atom alone", () => {
    // (p-xylene, cis- and trans-1,4-dimethylcyclohexane, 1,1-dimethylcyclohexane, 4,4'-dimethylbiphenyl, beta-cyclocitral - its ring's gem-dimethyl two anchors alike - each part a ring system, or all but a methyl)
    for (const smiles of ["Cc1ccc(C)cc1", "C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1", "CC1(C)CCCCC1", "Cc1ccc(-c2ccc(C)cc2)cc1", "CC1(C)CCCC(C)=C1C=O"]) {
      const g = fromSmiles(smiles);
      const n = g.atoms.length;
      const drawn = layout2D(g);
      const [c, s] = [Math.cos(0.7) * 1.7, Math.sin(0.7) * 1.7];
      // (turned, scaled, and each atom off by a hair, as a hand draws: atoms alike then not quite alike in where they are)
      const placed = drawn.x.map((x, i) => ({ x: c * x - s * drawn.y[i] + 0.06 * Math.sin(1.7 * i + 0.3), y: s * x + c * drawn.y[i] + 0.06 * Math.cos(2.3 * i) }));
      const parts = [...perceive(g).systems.map((sys) => [...sys.atoms].sort((p, q) => p - q)), g.atoms.map((_, i) => i).filter((i) => i !== 0)];
      const orders = [g.atoms.map((_, i) => n - 1 - i), g.atoms.map((_, i) => (i + 3) % n), g.atoms.map((_, i) => (i * 5) % n), g.atoms.map((_, i) => (i * 7 + 2) % n)].filter((to) => new Set(to).size === n);
      expect(orders.length).toBeGreaterThan(1);
      for (const part of parts) {
        const seen = (input: LayoutInput, to: readonly number[]) => {
          const at = new Array<Point | null>(n).fill(null);
          placed.forEach((p, i) => (at[to[i]] = part.includes(i) ? null : p));
          const r = layoutAround(input, part.map((a) => to[a]), { at });
          if ("refused" in r) return r.refused;
          return input.atoms.map((a, i) => `${a.el}@${r.layout.x[i].toFixed(4)},${r.layout.y[i].toFixed(4)}`).sort().join(" ");
        };
        const first = seen(g, g.atoms.map((_, i) => i));
        for (const [k, to] of orders.entries()) expect(seen(reordered(g, to), to), `${smiles}, part ${part.join(",")}, order ${k + 1}`).toBe(first);
      }
    }
  });
});
