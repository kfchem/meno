import { describe, expect, it } from "vitest";
import { FRAMES, grow, sidesOf } from "./assemble";
import { layout2D, roomForHydrogens, scorer } from "./engine";
import { macrocycleShape } from "./macrocycle";
import { hydrogenSpot, layoutMetrics } from "./metrics";
import { segmentMeetsBox } from "./names";
import { dist } from "./geometry";
import { perceive, type LayoutBond, type LayoutInput } from "./perceive";
import { shownBySolid, solidOf } from "./cage";
import { readSmiles } from "../chem/smiles";
import { kekuleOrders } from "../chem/kekulize";
import { implicitHydrogens } from "../chem/molecule";
import { fromSmiles } from "./testdata/fromSmiles";

/** Carbons joined by the bonds given, as [a, b, order?]. */
function carbons(n: number, bonds: [number, number, number?][], extra: Partial<LayoutBond>[] = []): LayoutInput {
  return {
    atoms: Array.from({ length: n }, () => ({ el: "C" })),
    bonds: bonds.map(([a, b, order], i) => ({ a, b, order: order ?? 1, ...extra[i] })),
  };
}

const ring = (from: number, size: number): [number, number][] =>
  Array.from({ length: size }, (_, i) => [from + i, from + ((i + 1) % size)]);

const bondLengths = (input: LayoutInput) => {
  const { x, y } = layout2D(input);
  return input.bonds.map(({ a, b }) => Math.hypot(x[a] - x[b], y[a] - y[b]));
};

const measure = (input: LayoutInput) => {
  const { x, y } = layout2D(input);
  return layoutMetrics({
    x,
    y,
    edges: input.bonds.map(({ a, b }) => [a, b] as const),
    orders: input.bonds.map((b) => b.order),
  });
};

describe("layout2D", () => {
  it("draws benzene as a regular hexagon with two sides upright", () => {
    const benzene = carbons(6, ring(0, 6).map(([a, b], i) => [a, b, i % 2 ? 2 : 1]));
    for (const l of bondLengths(benzene)) expect(l).toBeCloseTo(1, 6);
    const { x } = layout2D(benzene);
    // an apex at the top and bottom, and two atoms on each upright side
    const xs = x.map((v) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4));
    expect(new Set(xs).size).toBe(3);
    expect(measure(benzene).tilt).toBeCloseTo(0, 6);
  });

  it("draws a chain as a level zigzag", () => {
    const hexane = carbons(6, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    const m = measure(hexane);
    expect(m.angleError).toBeCloseTo(0, 6);
    expect(m.chainTilt).toBeCloseTo(0, 6);
    expect(m.tilt).toBeCloseTo(0, 6);
  });

  it("draws a double bond cis or trans as it is", () => {
    for (const cis of [true, false]) {
      const butene = carbons(4, [[0, 1], [1, 2, 2], [2, 3]], [
        {},
        { stereo: { refs: [0, 3], cis } },
        {},
      ]);
      const { x, y } = layout2D(butene);
      const side = (i: number) =>
        Math.sign((x[2] - x[1]) * (y[i] - y[1]) - (y[2] - y[1]) * (x[i] - x[1]));
      expect(side(0) === side(3)).toBe(cis);
    }
  });

  it("draws a cis double bond in a long chain as a step in a straight chain", () => {
    // octadec-9-ene, cis: the chain either side of C9=C10 on one line
    const bonds: [number, number, number?][] = Array.from({ length: 17 }, (_, i) => [i, i + 1, i === 8 ? 2 : 1]);
    const chain = carbons(18, bonds, bonds.map((_, i) => (i === 8 ? { stereo: { refs: [7, 10], cis: true } } : {})));
    // as it is grown, in every frame - before anything is tried the other way
    const mol = perceive(chain);
    for (const frame of FRAMES) {
      const pos = grow(mol, mol.pieces[0], new Map(), frame, sidesOf(mol));
      const axis = (from: number, to: number) =>
        Math.atan2(pos.get(to)!.y - pos.get(from)!.y, pos.get(to)!.x - pos.get(from)!.x);
      const turn = Math.abs(Math.atan2(Math.sin(axis(0, 8) - axis(10, 17)), Math.cos(axis(0, 8) - axis(10, 17))));
      expect(Math.min(turn, Math.PI - turn)).toBeLessThan((10 * Math.PI) / 180);
    }
  });

  it("fuses two five-membered rings on neighbouring sides of a six, as saxitoxin's are, both whole and clear of each other", () => {
    // a hexagon 0-5; a pentagon on its side 0-1, another on its side 1-2: three rings meeting at atom 1
    const input = carbons(12, [...ring(0, 6), [0, 6], [6, 7], [7, 8], [8, 1], [1, 9], [9, 10], [10, 11], [11, 2]]);
    const { x, y } = layout2D(input);
    const d = (i: number, j: number) => Math.hypot(x[i] - x[j], y[i] - y[j]);
    for (const { a, b } of input.bonds) expect(d(a, b)).toBeGreaterThan(0.8);
    const bonded = new Set(input.bonds.map(({ a, b }) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (!bonded.has(`${i}-${j}`)) expect(d(i, j)).toBeGreaterThan(0.55);
  });

  it("draws a flavone with its ring O at the top, as flavonoids always are", () => {
    // flavone: O=C1C=C(Oc2ccccc12)c1ccccc1
    const el = ["O", "C", "C", "C", "O", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C"];
    const bonds: [number, number, number][] = [
      [0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 1],
      [5, 6, 2], [6, 7, 1], [7, 8, 2], [8, 9, 1], [9, 10, 2], [10, 5, 1], [10, 1, 1],
      [3, 11, 1], [11, 12, 2], [12, 13, 1], [13, 14, 2], [14, 15, 1], [15, 16, 2], [16, 11, 1],
    ];
    const input: LayoutInput = { atoms: el.map((e) => ({ el: e })), bonds: bonds.map(([a, b, order]) => ({ a, b, order })) };
    const { y } = layout2D(input);
    const fused = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const middle = fused.reduce((sum, a) => sum + y[a], 0) / fused.length;
    expect(y[4]).toBeGreaterThan(middle);
    expect(y[0]).toBeLessThan(middle);
  });

  it("draws berberine with its ring N at the bottom, before the O of its methylenedioxy", () => {
    // the maintainer, 2026-10-11: as it is always drawn - the N is in two
    // rings fused to benzene rings, the O's in one
    const s = readSmiles("COC1=C(C2=C[N+]3=C(C=C2C=C1)C4=CC5=C(C=C4CC3)OCO5)OC");
    const input: LayoutInput = {
      atoms: s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })),
      bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
    };
    const { y } = layout2D(input);
    const n = s.atoms.findIndex((a) => a.el === "N");
    const bondedTo = (a: number) => s.bonds.flatMap((b) => (b.a1 === a ? [b.a2] : b.a2 === a ? [b.a1] : []));
    // the methylenedioxy's O: those on a carbon between two O
    const dioxy = s.atoms
      .map((_, i) => i)
      .filter((i) => s.atoms[i].el === "O" && bondedTo(i).some((c) => bondedTo(c).filter((o) => s.atoms[o].el === "O").length === 2));
    expect(dioxy).toHaveLength(2);
    for (const o of dioxy) expect(y[n]).toBeLessThan(y[o]);
  });

  it("draws tetrodotoxin as a solid only with every stereocentre on the page, and morphine still flat with its bridge across", () => {
    const input = (smiles: string): LayoutInput => {
      const s = readSmiles(smiles);
      const orders = kekuleOrders(s.atoms, s.bonds);
      const sum = s.atoms.map(() => 0);
      s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
      return {
        atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
        bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
      };
    };
    // (tetrodotoxin's flat drawing crosses bonds; its solid, once its C4a is
    // turned the way it is given, has none. Its centres in a chair or a boat,
    // or in a ring bridged across another, show themselves by its shape; the
    // rest are wedged)
    const smiles = "C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O";
    const given = input(smiles);
    const ttx = layout2D(given);
    const centres = given.atoms.flatMap((a, i) => (a.tetra && ttx.depth[i] != null ? [i] : []));
    expect(given.atoms.filter((_, i) => ttx.depth[i] != null)).toHaveLength(14);
    const mol = perceive(given);
    const sys = mol.systems.find((x) => x.atoms.length === 14)!;
    const shown = shownBySolid(mol, sys, centres.concat(given.atoms.flatMap((_, i) => (ttx.solid[i] ? [i] : []))), (a) => ({ x: ttx.x[a], y: ttx.y[a] }));
    for (const c of centres) {
      if (ttx.solid[c]) expect(shown.has(c), `C${c} shown by the solid's shape`).toBe(true);
      else expect(ttx.wedges.some((w) => w.from === c), `C${c} wedged`).toBe(true);
    }
    // (morphine's solid reads as given now too, but its flat drawing has no
    // fault - its bonds a little uneven, its bridge passing behind a ring -
    // and it is drawn so, as everywhere)
    const morphine = layout2D(input("CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O"));
    expect(morphine.solid.some(Boolean)).toBe(false);
    // (the whole engine on tetrodotoxin's cage and morphine: about a second
    // alone, a few times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("draws tetrodotoxin level, its guanidine ring beside the cage, not under it", () => {
    const s = readSmiles("C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const given: LayoutInput = {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    };
    const ttx = layout2D(given);
    const mol = perceive(given);
    const sys = mol.systems.find((x) => x.atoms.length === 14)!;
    // (the guanidine ring: the one with its two ring N's)
    const guanidine = mol.rings.find((r) => r.filter((a) => given.atoms[a].el === "N").length === 2)!;
    const cage = sys.atoms.filter((a) => !guanidine.includes(a));
    const mid = (atoms: readonly number[]) => ({
      x: atoms.reduce((t, a) => t + ttx.x[a], 0) / atoms.length,
      y: atoms.reduce((t, a) => t + ttx.y[a], 0) / atoms.length,
    });
    const [g, c] = [mid(guanidine), mid(cage)];
    expect(Math.abs(g.x - c.x)).toBeGreaterThan(Math.abs(g.y - c.y));
    // (the whole engine on tetrodotoxin's cage: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("draws bilobalide's C4 with its bonds spread round it, its wedges read one way only", () => {
    // three five-membered rings round one carbon leave 36 degrees between
    // C4 and C9: their groups, pointed into that gap at each other, sent
    // C4's OH into its ring and left all four of C4's bonds in half the page
    const input = bilobalide();
    const { x, y } = layout2D(input);
    const c4 = 4;
    const around = input.bonds.flatMap((b) => (b.a === c4 ? [b.b] : b.b === c4 ? [b.a] : []));
    expect(around).toHaveLength(4);
    const t = around.map((n) => Math.atan2(y[n] - y[c4], x[n] - x[c4])).sort((p, q) => p - q);
    const widest = Math.max(...t.map((v, k) => (k + 1 < t.length ? t[k + 1] : t[0] + 2 * Math.PI) - v));
    expect(widest).toBeLessThan(Math.PI - (12 * Math.PI) / 180);
  });

  it("opens bilobalide's gap between C4 and C9, its tert-butyl clear of C9's OH", () => {
    // left at 36 degrees, the two were 0.62 of a bond apart, and C4's
    // tert-butyl ran through the OH on C9
    const input = bilobalide();
    const { x, y } = layout2D(input);
    const at = (a: number) => ({ x: x[a], y: y[a] });
    const L = input.bonds.reduce((t, b) => t + dist(at(b.a), at(b.b)), 0) / input.bonds.length;
    expect(dist(at(4), at(9))).toBeGreaterThan(0.75 * L);
    const toBond = (p: { x: number; y: number }, a: number, b: number) => {
      const v = { x: x[b] - x[a], y: y[b] - y[a] };
      const k = Math.max(0, Math.min(1, ((p.x - x[a]) * v.x + (p.y - y[a]) * v.y) / (v.x * v.x + v.y * v.y)));
      return Math.hypot(p.x - x[a] - k * v.x, p.y - y[a] - k * v.y);
    };
    // (the OH's O, atom 17; the tert-butyl, atoms 0 to 3 on C4)
    for (const [a, b] of [[4, 1], [1, 0], [1, 2], [1, 3]]) expect(toBond(at(17), a, b)).toBeGreaterThan(0.5 * L);
  });

  it("draws huperzine A with room for its ethylidene, no atom on another", () => {
    // its one-atom bridge laid flat across a ring's face put the ethylidene's carbon on that ring
    const s = readSmiles("CC=C1C2CC3=C(C1(CC(=C2)C)N)C=CC(=O)N3");
    const input: LayoutInput = {
      atoms: s.atoms.map((a) => ({ el: a.el })),
      bonds: s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
    };
    const { x, y } = layout2D(input);
    for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) expect(Math.hypot(x[i] - x[j], y[i] - y[j])).toBeGreaterThan(0.3);
  });

  it("fuses rings on a shared side", () => {
    const naphthalene = carbons(10, [...ring(0, 6), [1, 6], [6, 7], [7, 8], [8, 9], [9, 2]]);
    for (const l of bondLengths(naphthalene)) expect(l).toBeCloseTo(1, 6);
    const m = measure(naphthalene);
    expect(m.ringError).toBeCloseTo(0, 6);
    expect(m.overlaps + m.crossings).toBe(0);
  });

  it("points a substituent straight out of its ring", () => {
    const methylcyclohexane = carbons(7, [...ring(0, 6), [0, 6]]);
    const { x, y } = layout2D(methylcyclohexane);
    const cx = x.slice(0, 6).reduce((s, v) => s + v, 0) / 6;
    const cy = y.slice(0, 6).reduce((s, v) => s + v, 0) / 6;
    // on the line from the centre through its ring atom, a bond further out
    expect(Math.hypot(x[6] - cx, y[6] - cy)).toBeCloseTo(2, 6);
  });

  it("sets a steroid as it is always drawn: A and B in a row, C and D above to the right", () => {
    // gonane, C1 to C17 as atoms 0 to 16
    const c = (k: number) => k - 1;
    const bonds: [number, number][] = [
      [c(1), c(2)], [c(2), c(3)], [c(3), c(4)], [c(4), c(5)], [c(5), c(10)], [c(10), c(1)],
      [c(5), c(6)], [c(6), c(7)], [c(7), c(8)], [c(8), c(9)], [c(9), c(10)],
      [c(9), c(11)], [c(11), c(12)], [c(12), c(13)], [c(13), c(14)], [c(14), c(8)],
      [c(14), c(15)], [c(15), c(16)], [c(16), c(17)], [c(17), c(13)],
    ];
    const gonane = carbons(17, bonds);
    const m = measure(gonane);
    expect(m.ringOrder).toBe(0);
    const { x, y } = layout2D(gonane);
    // ring A (C1-C5, C10) lower left of ring D (C13-C17)
    const mid = (ks: number[]) => ({
      x: ks.reduce((s, k) => s + x[c(k)], 0) / ks.length,
      y: ks.reduce((s, k) => s + y[c(k)], 0) / ks.length,
    });
    const a = mid([1, 2, 3, 4, 5, 10]);
    const d = mid([13, 14, 15, 16, 17]);
    expect(a.x).toBeLessThan(d.x);
    expect(a.y).toBeLessThan(d.y);
  });

  it("draws a macrocycle as a closed zigzag, not a round polygon", () => {
    const shape = macrocycleShape(14);
    for (let i = 0; i < 14; i++) {
      const p = shape[i];
      const q = shape[(i + 1) % 14];
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(1, 6);
    }
    const m = measure(carbons(14, ring(0, 14)));
    expect(m.macroAngleError).toBeCloseTo(0, 6);
    // lying wide
    expect(m.macroAspect).toBeLessThan(1);
  });

  it("sets a macrocycle that runs through rings round a circle, the rings regular", () => {
    // three benzene rings joined para to para by CH2CH2 bridges: a ring of rings
    const bonds: [number, number, number?][] = [];
    for (let k = 0; k < 3; k++) {
      const b = k * 8;
      for (const [i, j] of ring(b, 6)) bonds.push([i, j, (i - b) % 2 ? 2 : 1]);
      // para positions b+0 and b+3; the bridge b+6, b+7 to the next ring's b+0
      bonds.push([b + 3, b + 6], [b + 6, b + 7], [b + 7, ((k + 1) % 3) * 8]);
    }
    const cyclophane = carbons(24, bonds);
    for (const l of bondLengths(cyclophane)) expect(l).toBeCloseTo(1, 3);
    const m = measure(cyclophane);
    expect(m.ringError).toBeCloseTo(0, 3);
    expect(m.overlaps + m.crossings).toBe(0);
  });

  it("draws adamantane as it is always drawn: a chair, its axial bonds upright to the fourth bridgehead", () => {
    // four bridgeheads (0-3), six CH2 between them
    const cage = carbons(10, [
      [0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 0],
      [0, 7], [7, 3], [1, 8], [8, 3], [2, 9], [9, 3],
    ]);
    const { x, y, depth } = layout2D(cage);
    for (const l of bondLengths(cage)) expect(l).toBeCloseTo(1, 3);
    const upright = cage.bonds.filter(({ a, b }) => Math.abs(x[a] - x[b]) < 1e-6);
    expect(upright).toHaveLength(3);
    // one bond passes behind another, and is drawn broken there
    const m = layoutMetrics({ x, y, edges: cage.bonds.map(({ a, b }) => [a, b] as const) });
    expect(m.crossings).toBe(1);
    expect(m.overlaps).toBe(0);
    expect(depth.every((d) => d != null)).toBe(true);
  });

  it("draws norbornane as a boat with its bridge above it", () => {
    // bridgeheads 0 and 3; the bridge 6
    const norbornane = carbons(7, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]]);
    const { x, y } = layout2D(norbornane);
    expect(Math.max(...y)).toBeCloseTo(y[6], 6);
    // straight above the front bridgehead, a bond's length from the back one
    const lengths = [0, 3].map((h) => Math.hypot(x[6] - x[h], y[6] - y[h])).sort((p, q) => p - q);
    expect(lengths[0]).toBeCloseTo(1, 3);
    expect(lengths[1]).toBeCloseTo(Math.sqrt(3), 3);
    expect([0, 3].some((h) => Math.abs(x[6] - x[h]) < 1e-6)).toBe(true);
  });

  it("draws a bicyclo[3.3.1] cage as 9-BBN is drawn: two chairs stood on end, its one-atom bridge on top", () => {
    // the one-atom bridge 0, the bridgeheads 1 and 5, the bridges 2-3-4 and 8-7-6
    const twin = carbons(9, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 8], [8, 7], [7, 6], [6, 5]]);
    const { x, y, depth } = layout2D(twin);
    expect(Math.max(...y)).toBeCloseTo(y[0], 6);
    // the bridgeheads under it, the nearer one the lower
    const [near, far] = depth[1]! > depth[5]! ? [1, 5] : [5, 1];
    expect(y[near]).toBeLessThan(y[far]);
    expect(y[far]).toBeLessThan(y[0]);
    // the bridges either side, each a chair's foot the lowest of the drawing
    expect(Math.sign(x[3] - x[0])).toBe(-Math.sign(x[7] - x[0]));
    expect(Math.min(y[3], y[7])).toBeCloseTo(Math.min(...y), 6);
    // nothing on anything; the one bond passing behind another drawn broken
    const m = layoutMetrics({ x, y, edges: twin.bonds.map(({ a, b }) => [a, b] as const), depth });
    expect(m.overlaps).toBe(0);
  });

  it("hangs what the one-atom bridge of a bicyclo[3.3.1] cage carries straight up from it", () => {
    // bicyclo[3.3.1]nonan-9-one
    const ketone = carbons(10, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 8], [8, 7], [7, 6], [6, 5], [0, 9, 2]]);
    const input: LayoutInput = { ...ketone, atoms: ketone.atoms.map((a, i) => (i === 9 ? { el: "O" } : a)) };
    const { x, y } = layout2D(input);
    expect(y[9]).toBeGreaterThan(y[0] + 0.9);
    expect(Math.abs(x[9] - x[0])).toBeLessThan(1e-6);
  });

  it("draws a cage as the solid it is, not its mirror image", () => {
    // camphor: C1 (0) with its methyl (8), the ketone at C2 (1), C4 (3) the
    // other bridgehead, C7 (6) with its two methyls - and each hand of it
    for (const volume of [1, -1] as const) {
      const skeleton = carbons(11, [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3], [1, 7, 2], [0, 8], [6, 9], [6, 10],
      ]);
      const camphor: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((a, i) =>
          i === 7 ? { el: "O" } : i === 3 ? { el: "C", tetra: { neighbours: [2, 4, 6, -1], volume } } : a,
        ),
      };
      const mol = perceive(camphor);
      const solid = solidOf(mol, mol.systems[0]);
      const { x, y, depth } = layout2D(camphor);
      // the linear map that takes the solid (about its middle) to the drawing
      // (x, y and depth) best turns it the right way: a mirror would not
      const atoms = mol.systems[0].atoms;
      const mid = (f: (a: number) => number) => atoms.reduce((s, a) => s + f(a), 0) / atoms.length;
      const from = atoms.map((a) => {
        const p = solid.get(a)!;
        return [0, 1, 2].map((k) => p[k] - mid((b) => solid.get(b)![k]));
      });
      const to = atoms.map((a) => [x[a] - mid((b) => x[b]), y[a] - mid((b) => y[b]), depth[a]! - mid((b) => depth[b]!)]);
      const cross = (u: number, v: number) => from.reduce((s, p, i) => s + p[u] * to[i][v], 0);
      const M = [0, 1, 2].map((u) => [0, 1, 2].map((v) => cross(u, v)));
      const det =
        M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
        M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
        M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      expect(det).toBeGreaterThan(0);
    }
  });

  it("draws a bicyclo[3.3.1] cage as the solid it is, not its mirror image", () => {
    // 2-methylbicyclo[3.3.1]nonane, each hand of it: the methyl (9) on 2
    for (const volume of [1, -1] as const) {
      const skeleton = carbons(10, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 8], [8, 7], [7, 6], [6, 5], [2, 9]]);
      const input: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((a, i) => (i === 2 ? { el: "C", tetra: { neighbours: [1, 3, 9, -1], volume } } : a)),
      };
      const mol = perceive(input);
      const solid = solidOf(mol, mol.systems[0]);
      const { x, y, depth } = layout2D(input);
      const atoms = mol.systems[0].atoms;
      const mid = (f: (a: number) => number) => atoms.reduce((s, a) => s + f(a), 0) / atoms.length;
      const from = atoms.map((a) => [0, 1, 2].map((k) => solid.get(a)![k] - mid((b) => solid.get(b)![k])));
      const to = atoms.map((a) => [x[a] - mid((b) => x[b]), y[a] - mid((b) => y[b]), depth[a]! - mid((b) => depth[b]!)]);
      const M = [0, 1, 2].map((u) => [0, 1, 2].map((v) => from.reduce((s, p, i) => s + p[u] * to[i][v], 0)));
      const det =
        M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
        M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
        M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      expect(det).toBeGreaterThan(0);
    }
  });

  it("draws a cage from above, its back at the top, however the frame is set", () => {
    for (const volume of [1, -1] as const) {
      const skeleton = carbons(11, [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3], [1, 7, 2], [0, 8], [6, 9], [6, 10],
      ]);
      const camphor: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((a, i) =>
          i === 7 ? { el: "O" } : i === 3 ? { el: "C", tetra: { neighbours: [2, 4, 6, -1], volume } } : a,
        ),
      };
      const { y, depth } = layout2D(camphor);
      // round the six-membered ring the cage is drawn on, the higher on the
      // page the further from the viewer
      const cage = [0, 1, 2, 3, 4, 5];
      const my = cage.reduce((s, a) => s + y[a], 0) / cage.length;
      const md = cage.reduce((s, a) => s + depth[a]!, 0) / cage.length;
      const together = cage.reduce((s, a) => s + (y[a] - my) * (depth[a]! - md), 0);
      expect(together).toBeLessThan(0);
    }
  });

  it("draws an H at a centre hemmed in by rings clear of every bond", () => {
    // perhydrophenalene: the centre (0) in three rings, its H drawn
    const bonds: [number, number][] = [
      [0, 1], [0, 5], [0, 9], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
      [11, 12], [12, 1],
    ];
    const skeleton = carbons(13, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((a, i) => (i === 0 ? { el: "C", tetra: { neighbours: [1, 5, 9, -1], volume: 1 } } : a)),
    };
    const { x, y, hydrogens } = layout2D(input);
    const h = hydrogens.find((d) => d.on === 0)!;
    expect(h).toBeDefined();
    for (let a = 1; a < 13; a++) expect(Math.hypot(x[a] - h.at.x, y[a] - h.at.y)).toBeGreaterThan(0.6);
    for (const [a, b] of bonds) {
      if (a === 0 || b === 0) continue;
      const vx = x[b] - x[a];
      const vy = y[b] - y[a];
      const k = Math.max(0, Math.min(1, ((h.at.x - x[a]) * vx + (h.at.y - y[a]) * vy) / (vx * vx + vy * vy)));
      expect(Math.hypot(h.at.x - x[a] - k * vx, h.at.y - y[a] - k * vy)).toBeGreaterThan(0.4);
    }
  });

  it("runs a ring of sugars along each sugar's barer side, its secondary OHs outside", () => {
    // alpha-cyclodextrin: through each glucose by its ring O and C5 (one
    // group, the CH2OH, inside), not by C2 and C3 (two OHs each inside)
    const g = fromSmiles(
      "C([C@@H]1[C@@H]2[C@@H]([C@H]([C@H](O1)O[C@@H]3[C@H](O[C@@H]([C@@H]([C@H]3O)O)O[C@@H]4[C@H](O[C@@H]([C@@H]([C@H]4O)O)O[C@@H]5[C@H](O[C@@H]([C@@H]([C@H]5O)O)O[C@@H]6[C@H](O[C@@H]([C@@H]([C@H]6O)O)O[C@@H]7[C@H](O[C@H](O2)[C@@H]([C@H]7O)O)CO)CO)CO)CO)CO)O)O)O",
    );
    const { x, y } = layout2D(g);
    const macro = perceive(g).rings.reduce((p, q) => (q.length > p.length ? q : p));
    const inside = (a: number) => {
      let odd = false;
      for (let i = 0, j = macro.length - 1; i < macro.length; j = i++) {
        const [p, q] = [macro[i], macro[j]];
        if (y[p] > y[a] !== y[q] > y[a] && x[a] < ((x[q] - x[p]) * (y[a] - y[p])) / (y[q] - y[p]) + x[p]) odd = !odd;
      }
      return odd;
    };
    const ohs = g.atoms.flatMap((a, i) => (a.el === "O" && (a.hs ?? 0) > 0 ? [i] : []));
    expect(ohs.filter(inside)).toHaveLength(6);
  }, 30_000);

  it("draws macrocycles strung through benzene rings as chains, never round", () => {
    // a benzene hub, a macrocycle through it and each of two more benzenes
    // by an ether and a chain of six
    const benzene = (o: number): [number, number, number][] =>
      [0, 1, 2, 3, 4, 5].map((i) => [o + i, o + ((i + 1) % 6), i % 2 ? 1 : 2]);
    const bonds: [number, number, number?][] = [
      ...benzene(0), ...benzene(6), ...benzene(12),
      [0, 18], [18, 6], [9, 19], [19, 20], [20, 21], [21, 22], [22, 28], [28, 29], [29, 2],
      [5, 23], [23, 12], [15, 24], [24, 25], [25, 26], [26, 27], [27, 30], [30, 31], [31, 3],
    ];
    const skeleton = carbons(32, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((a, i) => (i === 18 || i === 23 ? { el: "O" } : a)),
    };
    const { x, y } = layout2D(input);
    for (const l of bondLengths(input)) expect(Math.abs(l - 1)).toBeLessThan(0.05);
    const m = layoutMetrics({ x, y, edges: input.bonds.map(({ a, b }) => [a, b] as const) });
    expect(m.overlaps + m.crossings).toBe(0);
    expect(m.ringError).toBeLessThan(0.01);
    // the chains zigzags - their angles 120 degrees, most of them exactly,
    // none opened out toward an arc's (154 degrees round a ring of 14)
    const angles = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((c) => {
      const [p, q] = input.bonds.filter(({ a, b }) => a === c || b === c).map(({ a, b }) => (a === c ? b : a));
      const t = Math.abs(Math.atan2(y[p] - y[c], x[p] - x[c]) - Math.atan2(y[q] - y[c], x[q] - x[c]));
      return (Math.min(t, 2 * Math.PI - t) * 180) / Math.PI;
    });
    for (const t of angles) {
      expect(t).toBeGreaterThan(100);
      expect(t).toBeLessThan(145);
    }
    expect(angles.filter((t) => Math.abs(t - 120) < 2).length).toBeGreaterThanOrEqual(0.6 * angles.length);
  });

  it("keeps a five-membered ring hemmed in by others a pentagon, its bonds giving instead", () => {
    // acenaphthene: the five-membered ring across naphthalene's peri positions
    const acenaphthene = carbons(12, [
      [0, 1, 2], [1, 2], [2, 3, 2], [3, 4], [4, 5, 2], [5, 0], [5, 6], [6, 7, 2], [7, 8], [8, 9, 2], [9, 0],
      [1, 10], [10, 11], [11, 9],
    ]);
    const { x, y } = layout2D(acenaphthene);
    const ring = [0, 1, 10, 11, 9];
    const off = ring.map((a, i) => {
      const p = ring[(i + 4) % 5];
      const q = ring[(i + 1) % 5];
      const t = Math.abs(Math.atan2(y[p] - y[a], x[p] - x[a]) - Math.atan2(y[q] - y[a], x[q] - x[a]));
      return Math.abs((Math.min(t, 2 * Math.PI - t) * 180) / Math.PI - 108);
    });
    expect(off.reduce((sum, t) => sum + t, 0) / 5).toBeLessThan(8);
    for (const l of bondLengths(acenaphthene)) expect(l).toBeGreaterThan(0.95);
  });

  it("hangs a tropane's two-carbon bridge from its chair on upright bonds", () => {
    // cocaine
    const bonds: [number, number, number?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [7, 9], [9, 10], [10, 11, 2], [10, 12],
      [12, 13, 2], [13, 14], [14, 15, 2], [15, 16], [16, 17, 2], [6, 18], [18, 19, 2], [18, 20], [20, 21], [5, 1],
      [8, 2], [17, 12],
    ];
    const skeleton = carbons(22, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((a, i) => (i === 1 ? { el: "N" } : [9, 11, 19, 20].includes(i) ? { el: "O" } : a)),
    };
    const { x, y, solid } = layout2D(input);
    // every bond of the cage near upright is upright
    for (const { a, b } of input.bonds) {
      if (!solid[a] || !solid[b]) continue;
      const t = Math.abs(Math.atan2(y[b] - y[a], x[b] - x[a]));
      const off = Math.abs(t - Math.PI / 2);
      if (off < (25 * Math.PI) / 180) expect(off).toBeLessThan(1e-6);
    }
  });

  it("draws a ring system with a ring fused on a side flat, its bridge across a ring", () => {
    // 9,10-dihydro-9,10-ethanoanthracene: the bridge (14, 15) across the
    // middle ring of an anthracene
    const bonds: [number, number, number?][] = [
      [0, 2], [2, 3, 2], [3, 4], [4, 5, 2], [5, 6], [6, 7, 2], [7, 2], [7, 1],
      [0, 8], [8, 9, 2], [9, 10], [10, 11, 2], [11, 12], [12, 13, 2], [13, 8], [13, 1],
      [0, 14], [14, 15], [15, 1],
    ];
    const input = carbons(16, bonds);
    const { x, y, depth, solid } = layout2D(input);
    expect(solid.some((s) => s)).toBe(false);
    for (const l of bondLengths(input)) expect(l).toBeCloseTo(1, 3);
    // the fused rings flat, the bridge in front of them or behind
    expect(depth.slice(0, 14).every((d) => d === 0)).toBe(true);
    expect(Math.abs(depth[14]!)).toBe(1);
    expect(depth[15]).toBe(depth[14]);
    const m = layoutMetrics({ x, y, edges: input.bonds.map(({ a, b }) => [a, b] as const), depth });
    expect(m.overlaps + m.crossings).toBe(0);
    expect(m.ringError).toBeLessThan(0.05);
    // (the whole engine on a bridged system with a ring fused on its side:
    // about a second alone, a few times that on a machine busy with the rest of
    // the tests)
  }, 30_000);

  it("draws a ring system from the face its angular groups are on, whichever hand it is", () => {
    // artemisinin: its angular methyl (18) on the ketal carbon (14) in
    // front of the page, on a wedge, as a steroid's are
    const els = "CCCCCCCOOCCCCCCOOOCC";
    const bonds: [number, number, number?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7, 2], [6, 8], [8, 9], [9, 10], [10, 11], [11, 12],
      [12, 13], [13, 14], [14, 15], [14, 16], [16, 17], [14, 18], [5, 19], [11, 1], [10, 4], [15, 9], [17, 10],
    ];
    const centres: [number, number[], 1 | -1][] = [
      [1, [0, 2, 11, -1], 1], [4, [3, 5, 10, -1], -1], [5, [4, 6, 19, -1], 1], [9, [8, 10, 15, -1], -1],
      [10, [4, 9, 11, 17], -1], [11, [1, 10, 12, -1], -1], [14, [13, 15, 16, 18], 1],
    ];
    for (const hand of [1, -1] as const) {
      const skeleton = carbons(els.length, bonds);
      const input: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((_, i) => {
          const c = centres.find(([a]) => a === i);
          return { el: els[i], ...(c && { tetra: { neighbours: c[1], volume: (c[2] * hand) as 1 | -1 } }) };
        }),
      };
      const { wedges } = layout2D(input);
      expect(wedges.find((w) => w.from === 14 && w.to === 18)?.stereo).toBe("up");
    }
  });

  it("puts the heteroatom of a ring fused to a benzene below it, before how the other rings lie", () => {
    // strychnine: its benzene ring (19-24) on the left, the indoline N (12)
    // below it, as IUPAC draws strychnidine
    const els = "CCNCCCCOCCCONCCCCCCCCCCCC";
    const bonds: [number, number, number?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5, 2], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11, 2], [10, 12],
      [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 20, 2], [20, 21], [21, 22, 2],
      [22, 23], [23, 24, 2], [18, 0], [17, 2], [15, 4], [14, 8], [24, 12], [18, 13], [24, 19],
    ];
    const centres: [number, number[], 1 | -1][] = [
      [8, [7, 9, 14, -1], -1], [13, [12, 14, 18, -1], -1], [14, [8, 13, 15, -1], -1], [15, [4, 14, 16, -1], -1],
      [17, [2, 16, 18, -1], -1], [18, [0, 13, 17, 19], 1],
    ];
    const skeleton = carbons(els.length, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((_, i) => {
        const c = centres.find(([a]) => a === i);
        return { el: els[i], ...(c && { tetra: { neighbours: c[1], volume: c[2] } }) };
      }),
    };
    const { x, y } = layout2D(input);
    const mid = (atoms: number[], v: number[]) => atoms.reduce((s, a) => s + v[a], 0) / atoms.length;
    const benzene = [19, 20, 21, 22, 23, 24];
    const both = [...benzene, 12, 13, 18];
    expect(y[12]).toBeLessThan(mid(both, y) - 0.1);
    expect(mid(benzene, x)).toBeLessThan(mid([...Array(els.length).keys()], x));
    // (the whole engine on each of the fused systems: about a second alone, a
    // few times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("draws tryptophan as an amino acid, its indole N below", () => {
    // the NH2 (14) below the alpha carbon (10), the COOH (11) on its right
    // with its C=O (12) up, and the indole's N (8) below the middle of it
    const els = "CCCCCCCCNCCCOON";
    const skeleton = carbons(els.length, [
      [0, 1, 2], [1, 2], [2, 3, 2], [3, 4], [4, 5, 2], [4, 6], [6, 7, 2], [7, 8], [6, 9], [9, 10], [10, 11],
      [11, 12, 2], [11, 13], [10, 14], [5, 0], [8, 3],
    ]);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((_, i) =>
        i === 10
          ? { el: "C", hs: 1, tetra: { neighbours: [9, 11, 14, -1], volume: -1 } }
          : { el: els[i], hs: [1, 1, 1, 0, 0, 1, 0, 1, 1, 2, 1, 0, 0, 1, 2][i] },
      ),
    };
    const { x, y } = layout2D(input);
    expect(y[14]).toBeLessThan(y[10] - 0.25);
    expect(x[11]).toBeGreaterThan(x[10]);
    expect(y[12]).toBeGreaterThan(y[11] + 0.2);
    const indole = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(y[8]).toBeLessThan(indole.reduce((s, a) => s + y[a], 0) / indole.length - 0.1);
  });

  it("draws a triphosphate as one straight line, each P=O above it", () => {
    // methyl triphosphate: CH3-O-P(=O)(OH)-O-P(=O)(OH)-O-P(=O)(OH)2
    const els = "COPOOOPOOOPOOO";
    const skeleton = carbons(els.length, [
      [0, 1], [1, 2], [2, 3, 2], [2, 4], [2, 5], [5, 6], [6, 7, 2], [6, 8], [6, 9], [9, 10], [10, 11, 2], [10, 12],
      [10, 13],
    ]);
    const input: LayoutInput = { ...skeleton, atoms: skeleton.atoms.map((_, i) => ({ el: els[i], hs: [3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1][i] })) };
    const { y } = layout2D(input);
    // P, O, P, O, P on one level line
    for (const a of [5, 6, 9, 10]) expect(y[a]).toBeCloseTo(y[2], 6);
    for (const [p, o] of [[2, 3], [6, 7], [10, 11]]) expect(y[o]).toBeGreaterThan(y[p] + 0.9);
  });

  it("sets a macrolide's lactone at its lower left, numbered counterclockwise from it", () => {
    // a fourteen-membered lactone: its ring O (0), C1 (1) with its C=O
    // (14), and methyls on C2, C4, C6, C8 and C10
    const bonds: [number, number, number?][] = [...ring(0, 14), [1, 14, 2]];
    for (const [c, m] of [[2, 15], [4, 16], [6, 17], [8, 18], [10, 19]]) bonds.push([c, m]);
    const skeleton = carbons(20, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((a, i) => (i === 0 || i === 14 ? { el: "O" } : a)),
    };
    const { x, y } = layout2D(input);
    const cx = [...Array(14).keys()].reduce((sum, a) => sum + x[a], 0) / 14;
    const cy = [...Array(14).keys()].reduce((sum, a) => sum + y[a], 0) / 14;
    expect(x[1]).toBeLessThan(cx - 0.5);
    expect(y[1]).toBeLessThan(cy - 0.5);
    expect((x[1] - cx) * (y[2] - cy) - (y[1] - cy) * (x[2] - cx)).toBeGreaterThan(0);
  });

  it("makes room for an OH's H by moving a bond, never setting the H under it", () => {
    // hydroxyacetone, HO-CH2-C(=O)-CH3, drawn by hand with the OH's H (on
    // the left of its O, as HO) on the ketone's O
    const input: LayoutInput = {
      atoms: [{ el: "O", hs: 1 }, { el: "C" }, { el: "C" }, { el: "O" }, { el: "C" }],
      bonds: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 2, b: 4, order: 1 },
      ],
    };
    const mol = perceive(input);
    const s3 = Math.sqrt(3) / 2;
    const pos = new Map([
      [0, { x: -s3, y: 0.5 }],
      [1, { x: 0, y: 0 }],
      [2, { x: -s3, y: -0.5 }],
      [3, { x: -2 * s3, y: 0 }],
      [4, { x: -s3, y: -1.5 }],
    ]);
    const piece = [0, 1, 2, 3, 4];
    const score = scorer(mol, piece, [], [], 1);
    const spot = (p: Map<number, { x: number; y: number }>) => {
      const o = p.get(0)!;
      const c = p.get(1)!;
      const h = hydrogenSpot([{ x: (c.x - o.x) / dist(c, o), y: (c.y - o.y) / dist(c, o) }]);
      return { x: o.x + h.x, y: o.y + h.y, beside: h.y === 0 };
    };
    const clearOf = (h: { x: number; y: number }, p: { x: number; y: number }) =>
      Math.abs(h.x - p.x) > 0.65 || Math.abs(h.y - p.y) > 0.58;
    expect(clearOf(spot(pos), pos.get(3)!)).toBe(false);
    const room = roomForHydrogens(mol, piece, pos, score(pos), score);
    expect(room.score).toBeLessThan(score(pos));
    const h = spot(room.pos);
    expect(h.beside).toBe(true);
    expect(clearOf(h, room.pos.get(3)!)).toBe(true);
  });

  it("sets the pieces of a salt side by side", () => {
    const input: LayoutInput = {
      atoms: [{ el: "Na", charge: 1 }, { el: "C" }, { el: "C" }, { el: "O" }, { el: "O", charge: -1 }],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 2, b: 4, order: 1 },
      ],
    };
    const { x, y } = layout2D(input);
    for (let i = 1; i < 5; i++) {
      expect(Math.hypot(x[0] - x[i], y[0] - y[i])).toBeGreaterThan(1);
    }
  });

  it("leaves paper between pieces whose labels face each other", () => {
    // ibuprofen, its acid at the right-hand end, and an ethanol beside it
    // (0-14), whose O comes first (15-17): OH and HO face each other
    const input: LayoutInput = {
      atoms: [
        ...Array.from({ length: 13 }, () => ({ el: "C" })),
        { el: "O", hs: 0 },
        { el: "O", hs: 1 },
        { el: "O", hs: 1 },
        { el: "C" },
        { el: "C" },
      ],
      bonds: (
        [
          [0, 1], [1, 2], [1, 3], [3, 4], [4, 5, 2], [5, 6], [6, 7, 2], [7, 8], [8, 9, 2], [9, 4],
          [7, 10], [10, 11], [10, 12], [12, 13, 2], [12, 14], [15, 16], [16, 17],
        ] as [number, number, number?][]
      ).map(([a, b, order]) => ({ a, b, order: order ?? 1 })),
    };
    const { x } = layout2D(input);
    const ethanol = [15, 16, 17];
    const ibuprofen = x.map((_, i) => i).filter((i) => !ethanol.includes(i));
    expect(Math.max(...ibuprofen.map((i) => x[i]))).toBeCloseTo(x[14], 6);
    expect(Math.min(...ethanol.map((i) => x[i]))).toBeCloseTo(x[15], 6);
    // each O's H half a bond beside it, 0.4 of a bond across: more than a
    // bond of paper between the two H's
    expect(x[15] - 0.5 - 0.2 - (x[14] + 0.5 + 0.2)).toBeGreaterThan(1);
  });

  it("keeps two lone ions apart", () => {
    const input: LayoutInput = { atoms: [{ el: "Na", charge: 1 }, { el: "Cl", charge: -1 }], bonds: [] };
    const { x, y } = layout2D(input);
    expect(Math.hypot(x[0] - x[1], y[0] - y[1])).toBeGreaterThan(1.5);
  });
});

describe("a ring system drawn as a solid", () => {
  const input = (smiles: string): LayoutInput => {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    return {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    };
  };

  it("shows the centres of a ring bridged across another by its shape, with no wedge: gelsemine's, ibogaine's", () => {
    // (all but one at most, each read for sure by its bonds as drawn; with
    // wedges wherever no chair or boat showed them, gelsemine had seven)
    for (const smiles of ["CN1C[C@]2([C@@H]3C[C@@H]4[C@]5([C@H]2[C@H]1[C@H]3CO4)C6=CC=CC=C6NC5=O)C=C", "CC[C@H]1C[C@@H]2C[C@@H]3[C@H]1N(C2)CCC4=C3NC5=C4C=C(C=C5)OC"]) {
      const g = input(smiles);
      const out = layout2D(g);
      const mol = perceive(g);
      const rings = mol.systems.flatMap((sys) => sys.rings.map((r) => mol.rings[r]));
      const bridged = rings.filter((r) => rings.some((q) => q !== r && q.filter((a) => r.includes(a)).length >= 3));
      const centres = g.atoms.flatMap((a, i) => (a.tetra && bridged.some((r) => r.includes(i)) ? [i] : []));
      expect(centres.length, smiles).toBeGreaterThanOrEqual(4);
      expect(centres.filter((c) => out.wedges.some((w) => w.from === c)).length, smiles).toBeLessThanOrEqual(1);
    }
  }, 30000);
});

describe("a macrocycle through a block of fused rings", () => {
  it("keeps a double bond at either end of the chain drawn round the block as given", () => {
    // (the chain's first and last double bonds, read with the atoms placed
    // at its ends: an E one was drawn cis)
    for (const smiles of ["C2CCCCCC/C=C/c1ccc2c3ccccc31", "C2CCCCC/C=C1/CCC2C3CCCCC31", "C1(CCCCC/C=C/2)CCC2C3CCCCC31"]) {
      const s = readSmiles(smiles);
      const orders = kekuleOrders(s.atoms, s.bonds);
      const sum = s.atoms.map(() => 0);
      s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
      const g: LayoutInput = {
        atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]) })),
        bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i], ...(b.cisTrans ? { stereo: b.cisTrans } : {}) })),
      };
      const { x, y } = layout2D(g);
      const side = (p: number, u: number, v: number) => Math.sign((x[v] - x[u]) * (y[p] - y[u]) - (y[v] - y[u]) * (x[p] - x[u]));
      for (const b of g.bonds.filter((q) => q.stereo)) {
        const [r0, r1] = b.stereo!.refs;
        // (each ref by the end it is on)
        const nearA = g.bonds.some((q) => (q.a === b.a && q.b === r0) || (q.b === b.a && q.a === r0));
        const [ra, rb] = nearA ? [r0, r1] : [r1, r0];
        expect(side(ra, b.a, b.b) === side(rb, b.a, b.b), smiles).toBe(b.stereo!.cis);
      }
    }
  });

  it("draws rifampicin's naphthalene regular, its ansa chain round it, the hydrazone outside", () => {
    // started from the macrocycle, the naphthalene was squashed to fit it;
    // started from the naphthofuranone, the ansa chain drawn round it, the
    // side that shuts in its OHs rather than its hydrazone and piperazine
    const s = readSmiles("C[C@H]1/C=C/C=C(\\C(=O)NC2=C(C(=C3C(=C2O)C(=C(C4=C3C(=O)[C@](O4)(O/C=C/[C@@H]([C@H]([C@H]([C@@H]([C@@H]([C@@H]([C@H]1O)C)O)C)OC(=O)C)C)OC)C)C)O)O)/C=N/N5CCN(CC5)C)/C");
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    const g: LayoutInput = {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i], ...(b.cisTrans ? { stereo: b.cisTrans } : {}) })),
    };
    const { x, y } = layout2D(g);
    const mol = perceive(g);
    const at = (a: number) => ({ x: x[a], y: y[a] });
    // (each six-membered ring of the naphthalene a regular hexagon: every atom a bond from its middle)
    for (const r of mol.rings.filter((q) => q.length === 6 && q.every((a) => mol.el[a] === "C" && mol.rings.some((o) => o !== q && o.length === 6 && o.filter((v) => q.includes(v)).length === 2)))) {
      const c = { x: r.reduce((t, a) => t + x[a], 0) / 6, y: r.reduce((t, a) => t + y[a], 0) / 6 };
      for (const a of r) expect(dist(at(a), c)).toBeCloseTo(1, 1);
    }
    // (the hydrazone's N=N outside the ring the ansa chain closes)
    const macro = mol.rings.find((r) => r.length >= 9)!;
    const inside = (p: { x: number; y: number }) => {
      let odd = false;
      for (let i = 0, j = macro.length - 1; i < macro.length; j = i++) {
        const [u, v] = [at(macro[i]), at(macro[j])];
        if (u.y > p.y !== v.y > p.y && p.x < ((v.x - u.x) * (p.y - u.y)) / (v.y - u.y) + u.x) odd = !odd;
      }
      return odd;
    };
    const hydrazone = g.atoms.flatMap((a, i) => (a.el === "N" && mol.neighbours[i].some((n) => g.atoms[n].el === "N") ? [i] : []));
    expect(hydrazone.length).toBeGreaterThan(0);
    for (const n of hydrazone) expect(inside(at(n)), `N${n}`).toBe(false);
  }, 30000);
});

describe("a tert-butyl, and the other tridents", () => {
  const input = (smiles: string): LayoutInput => {
    const s = readSmiles(smiles);
    const orders = kekuleOrders(s.atoms, s.bonds);
    const sum = s.atoms.map(() => 0);
    s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
    return {
      atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
      bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
    };
  };
  const around = (g: LayoutInput, a: number) => g.bonds.flatMap((b) => (b.a === a ? [b.b] : b.b === a ? [b.a] : []));
  // (an end: a methyl or a halogen atom, bonded to nothing else)
  const end = (g: LayoutInput, v: number) => ["C", "F", "Cl"].includes(g.atoms[v].el) && around(g, v).length === 1;
  // (the angles round its middle atom, in degrees, from the bond into it on)
  const fan = (smiles: string) => {
    const g = input(smiles);
    const { x, y } = layout2D(g);
    const middles = g.atoms.flatMap((_, a) => (around(g, a).length === 4 && around(g, a).filter((v) => end(g, v)).length === 3 ? [a] : []));
    return middles.map((a) => {
      const into = around(g, a).find((v) => !end(g, v))!;
      const t0 = Math.atan2(y[into] - y[a], x[into] - x[a]);
      const ts = around(g, a)
        .filter((v) => v !== into)
        .map((v) => ((((Math.atan2(y[v] - y[a], x[v] - x[a]) - t0) * 180) / Math.PI) % 360 + 360) % 360)
        .sort((p, q) => p - q);
      return ts;
    });
  };

  it("has its methyls fanned 60 degrees apart about the line of the bond into it", () => {
    // (an ester's, a carbamate's, an alcohol's, on a ring, and a
    // trimethylsilyl's - grown from its middle atom, too - and the other
    // tridents: choline's trimethylammonium, a CF3, a CCl3)
    for (const smiles of [
      "CC(=O)OC(C)(C)C",
      "CC(C)(C)OC(=O)NCC(=O)O",
      "CC(C)(C)O",
      "CC1=CC(=C(C(=C1)C(C)(C)C)O)C(C)(C)C",
      "C[Si](C)(C)C#C",
      "C[N+](C)(C)CCO",
      "OC(=O)C(F)(F)F",
      "OC(O)C(Cl)(Cl)Cl",
    ]) {
      const fans = fan(smiles);
      expect(fans.length).toBeGreaterThan(0);
      for (const ts of fans) {
        expect(ts[0]).toBeCloseTo(120, 0);
        expect(ts[1]).toBeCloseTo(180, 0);
        expect(ts[2]).toBeCloseTo(240, 0);
      }
    }
  });

  it("is not neopentane, nor CF4: four like ends make a cross", () => {
    for (const smiles of ["CC(C)(C)C", "FC(F)(F)F"]) {
      const g = input(smiles);
      const { x, y } = layout2D(g);
      const ts = around(g, 1)
        .map((v) => (Math.atan2(y[v] - y[1], x[v] - x[1]) * 180) / Math.PI)
        .sort((p, q) => p - q);
      for (let i = 1; i < 4; i++) expect(ts[i] - ts[i - 1]).toBeCloseTo(90, 0);
    }
  });

  it("is settled clear of the H of ginkgolide B's OH beside it", () => {
    // turned off its ring as far as clears it, a methyl ran past a corner of the H's letter
    const g = input("C[C@@H]1C(=O)O[C@@H]2[C@]1([C@@]34C(=O)O[C@H]5[C@]3([C@@H]2O)[C@@]6([C@@H](C5)C(C)(C)C)[C@H](C(=O)O[C@H]6O4)O)O");
    const { x, y } = layout2D(g);
    const L = g.bonds.reduce((t, b) => t + Math.hypot(x[b.a] - x[b.b], y[b.a] - y[b.b]), 0) / g.bonds.length;
    const tb = 18;
    for (let o = 0; o < g.atoms.length; o++) {
      if (g.atoms[o].el !== "O" || !g.atoms[o].hs) continue;
      const h = hydrogenSpot(around(g, o).map((c) => {
        const d = Math.hypot(x[c] - x[o], y[c] - y[o]);
        return { x: (x[c] - x[o]) / d, y: (y[c] - y[o]) / d };
      }));
      const box = { x0: x[o] + (h.x - 0.35) * L, x1: x[o] + (h.x + 0.35) * L, y0: y[o] + (h.y - 0.35) * L, y1: y[o] + (h.y + 0.35) * L };
      for (const m of around(g, tb)) expect(segmentMeetsBox({ x: x[tb], y: y[tb] }, { x: x[m], y: y[m] }, box)).toBe(false);
    }
    // (the whole engine on ginkgolide B: about a second alone, a few times that
    // on a machine busy with the rest of the tests)
  }, 30_000);
});

describe("a biaryl with something beside its bond on each ring", () => {
  it("hangs its second ring the way that puts them on opposite sides: BINAP's two PPh2 anti, no ring over another", async () => {
    // BINAP from SMILES, as a structure pasted in is drawn (../chem)
    const { drawnSmiles } = await import("../chem/abbreviationPlace");
    const d = drawnSmiles("P(c3ccccc3)(c3ccccc3)c1ccc2ccccc2c1-c1c(P(c3ccccc3)c3ccccc3)ccc2ccccc12", 1)!;
    const index = new Map(d.atoms.map((a, i) => [a.id, i]));
    const x = d.atoms.map((a) => a.x);
    const y = d.atoms.map((a) => a.y);
    const input: LayoutInput = {
      atoms: d.atoms.map((a) => ({ el: a.el })),
      bonds: d.bonds.map((b) => ({ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order })),
    };
    // two rings sharing no atom further apart than fused ones (sqrt 3)
    const centres = perceive(input).rings.map((r) => ({ r, x: r.reduce((t, a) => t + x[a], 0) / r.length, y: r.reduce((t, a) => t + y[a], 0) / r.length }));
    for (const p of centres) {
      for (const q of centres) {
        if (p === q || p.r.some((a) => q.r.includes(a))) continue;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(1.6);
      }
    }
    // C1-C1' (22-23): P (0) and P' (25) either side of it
    const side = (p: number) => Math.sign((x[23] - x[22]) * (y[p] - y[22]) - (y[23] - y[22]) * (x[p] - x[22]));
    expect(side(0)).toBe(-side(25));
  }, 30_000);
});

describe("an atom its bonds run straight through", () => {
  it("is drawn straight, between two double bonds or by a triple one - as the middle a piece is grown from, too", () => {
    const angleAt = (input: LayoutInput, c: number) => {
      const { x, y } = layout2D(input);
      const [p, q] = input.bonds.filter((b) => b.a === c || b.b === c).map((b) => (b.a === c ? b.b : b.a));
      const u = { x: x[p] - x[c], y: y[p] - y[c] };
      const v = { x: x[q] - x[c], y: y[q] - y[c] };
      return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)))) * 180) / Math.PI;
    };
    // allene, ketene, CO2: three atoms, the middle one the root
    expect(angleAt(carbons(3, [[0, 1, 2], [1, 2, 2]]), 1)).toBeCloseTo(180, 6);
    const ketene: LayoutInput = { atoms: [{ el: "C" }, { el: "C" }, { el: "O" }], bonds: [{ a: 0, b: 1, order: 2 }, { a: 1, b: 2, order: 2 }] };
    expect(angleAt(ketene, 1)).toBeCloseTo(180, 6);
    // and in a chain: a carbodiimide's C
    const chain = carbons(7, [[0, 1], [1, 2], [2, 3, 2], [3, 4, 2], [4, 5], [5, 6]]);
    expect(angleAt(chain, 3)).toBeCloseTo(180, 6);
  });
});

/** Bilobalide, its H's counted, as a SMILES string gives it. */
function bilobalide(): LayoutInput {
  const s = readSmiles("CC(C)(C)[C@@]1(C[C@H]2[C@@]3([C@]14[C@H](C(=O)O[C@H]4OC3=O)O)CC(=O)O2)O");
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => ([sum[b.a1], sum[b.a2]] = [sum[b.a1] + orders[i], sum[b.a2] + orders[i]]));
  return {
    atoms: s.atoms.map((a, i) => ({ el: a.el, hs: a.hs ?? implicitHydrogens(a.el, sum[i]), ...(a.tetra ? { tetra: a.tetra } : {}) })),
    bonds: s.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
  };
}
