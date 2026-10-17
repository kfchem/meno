import { describe, expect, it } from "vitest";
import { layoutMetrics, ringIrregularity, scoreParts } from "./metrics";

/** A regular polygon's atoms and bonds, bond length 1. */
function polygon(k: number, cx = 0, cy = 0, turn = 0) {
  const r = 1 / (2 * Math.sin(Math.PI / k));
  const x = Array.from({ length: k }, (_, i) => cx + r * Math.cos(turn + (i * 2 * Math.PI) / k));
  const y = Array.from({ length: k }, (_, i) => cy + r * Math.sin(turn + (i * 2 * Math.PI) / k));
  const edges = Array.from({ length: k }, (_, i) => [i, (i + 1) % k] as [number, number]);
  return { x, y, edges };
}

describe("layoutMetrics", () => {
  it("measures a ring fusion's H before it is drawn, by where it will go", () => {
    // a hexahydronaphthalene - a double bond in each ring of its own, as
    // lovastatin's - its fusion atom 0 a stereocentre with an H: in a row,
    // the fusion bond upright, the H stands straight up outside the rings;
    // turned a quarter, it can only lie level
    const at = (deg: number, o = { x: 0, y: 0 }) => ({
      x: o.x + Math.cos((deg * Math.PI) / 180),
      y: o.y + Math.sin((deg * Math.PI) / 180),
    });
    const left = { x: -Math.sqrt(3) / 2, y: 0 };
    const right = { x: Math.sqrt(3) / 2, y: 0 };
    const row = [
      at(30, left), at(-30, left), at(-90, left), at(-150, left), at(150, left), at(90, left),
      at(30, right), at(-30, right), at(-90, right), at(90, right),
    ];
    // 0 the top of the fusion bond, 1 its foot; 2-5 round the left ring, 6-9 the right,
    // C2=C3 and C6=C7
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [1, 8], [8, 7], [7, 6], [6, 9], [9, 0],
    ];
    const orders = [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1];
    const tetra = [{ neighbours: [1, 5, 9, -1], volume: 1 }];
    const measure = (turn: number) => {
      const t = (turn * Math.PI) / 180;
      return layoutMetrics({
        x: row.map((p) => p.x * Math.cos(t) - p.y * Math.sin(t)),
        y: row.map((p) => p.x * Math.sin(t) + p.y * Math.cos(t)),
        edges,
        orders,
        tetra,
      }).substituentError;
    };
    expect(measure(0)).toBeCloseTo(0, 6);
    expect(measure(90)).toBeGreaterThan(30);
  });

  it("finds nothing wrong with a regular hexagon", () => {
    const m = layoutMetrics(polygon(6));
    expect(m.bondSpread).toBeCloseTo(0, 9);
    expect(m.ringError).toBeCloseTo(0, 9);
    expect(m.overlaps + m.crossings + m.clashes).toBe(0);
  });

  it("measures a squashed ring, and bonds that vary", () => {
    const h = polygon(6);
    const squashed = { ...h, y: h.y.map((v) => v * 0.6) };
    const m = layoutMetrics(squashed);
    expect(m.ringError).toBeGreaterThan(0.1);
    expect(m.bondSpread).toBeGreaterThan(0.05);
  });

  it("counts atoms on top of each other, and crossing bonds", () => {
    // two bonds crossing in an X, and a fifth atom right by the first
    const m = layoutMetrics({
      x: [0, 1, 0, 1, 0.05],
      y: [0, 1, 1, 0, 0.02],
      edges: [[0, 1], [2, 3]],
    });
    expect(m.crossings).toBe(1);
    expect(m.overlaps).toBeGreaterThanOrEqual(1);
  });

  it("takes a zigzag chain's angles as right, and a straight one's as wrong", () => {
    const h = Math.sqrt(3) / 2;
    const zig = {
      x: [0, h, 2 * h, 3 * h],
      y: [0, 0.5, 0, 0.5],
      edges: [[0, 1], [1, 2], [2, 3]] as [number, number][],
    };
    expect(layoutMetrics(zig).angleError).toBeCloseTo(0, 6);
    const straight = { ...zig, y: [0, 0, 0, 0] };
    expect(layoutMetrics(straight).angleError).toBeCloseTo(60, 6);
    // unless it is a triple bond, which is straight
    expect(layoutMetrics({ ...straight, orders: [1, 3, 1] }).angleError).toBeCloseTo(0, 6);
  });

  it("takes a tert-butyl's or a CF3's fan as right and a cross as wrong, but a cross for neopentane", () => {
    // O-C(CH3)3: the O to the left of the middle carbon, the methyls
    // fanned 60 degrees apart about the O's line, or set as a cross
    const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
    const tBu = (degs: number[]) => {
      const ps = [{ x: 0, y: 0 }, at(180), ...degs.map(at)];
      return {
        x: ps.map((p) => p.x),
        y: ps.map((p) => p.y),
        edges: [[0, 1], [0, 2], [0, 3], [0, 4]] as [number, number][],
        elements: ["C", "O", "C", "C", "C"],
      };
    };
    expect(layoutMetrics(tBu([-60, 0, 60])).angleError).toBeCloseTo(0, 6);
    expect(layoutMetrics(tBu([-90, 0, 90])).angleError).toBeCloseTo(30, 6);
    const neopentane = { ...tBu([-90, 0, 90]), elements: ["C", "C", "C", "C", "C"] };
    expect(layoutMetrics(neopentane).angleError).toBeCloseTo(0, 6);
    // (a CF3 likewise)
    const cf3 = (degs: number[]) => ({ ...tBu(degs), elements: ["C", "C", "F", "F", "F"] });
    expect(layoutMetrics(cf3([-60, 0, 60])).angleError).toBeCloseTo(0, 6);
    expect(layoutMetrics(cf3([-90, 0, 90])).angleError).toBeCloseTo(30, 6);
  });

  it("reads a cage's substituents the same whichever of its alike rings its smallest set holds", () => {
    // 3-vinylquinuclidine with a methyl on C2, its cage drawn in perspective
    // as quinine's is: N1 0, C2 1, C3 2, C4 3, C5 4, C6 5, C7 6, C8 7; the
    // vinyl 8=9 on C3, the methyl 10 on C8. Its three six-membered cycles
    // are each a ring as small as the rest; any two are a smallest set, and
    // which two `smallestRings` keeps goes by the order of the atoms
    const x = [4.43, 3.46, 2.96, 3.93, 4.9, 5.4, 4.43, 3.93, 3.06, 2.2, 3.46];
    const y = [0.44, 0.18, 1.05, 1.31, 1.05, 0.18, 1.53, 2.33, 2.82, 2.31, -0.82];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [0, 6], [6, 7], [7, 3], [7, 8], [8, 9], [1, 10],
    ];
    const orders = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1];
    const cycles = [
      [0, 1, 2, 3, 4, 5],
      [0, 6, 7, 3, 4, 5],
      [0, 1, 2, 3, 7, 6],
    ];
    const elements = ["N", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C"];
    const perspective = x.map((_, a) => a < 8);
    const measure = (rings: number[][]) =>
      layoutMetrics({ x, y, edges, orders, elements, perspective, rings }).substituentError;
    const each = [measure([cycles[0], cycles[1]]), measure([cycles[0], cycles[2]]), measure([cycles[1], cycles[2]])];
    expect(each[1]).toBeCloseTo(each[0], 6);
    expect(each[2]).toBeCloseTo(each[0], 6);
  });

  it("sees a ring's shape whatever it is turned to", () => {
    const h = polygon(6, 3, 4, 0.7);
    expect(ringIrregularity(h.x, h.y, [0, 1, 2, 3, 4, 5], 1)).toBeCloseTo(0, 9);
    expect(ringIrregularity(h.x, h.y, [5, 4, 3, 2, 1, 0], 1)).toBeCloseTo(0, 9);
  });
});

describe("what a chemist sees in a macrocycle, wedges and labels", () => {
  it("takes a zigzag macrocycle as right and a round one as wrong", () => {
    const round = polygon(14);
    expect(layoutMetrics(round).macroAngleError).toBeGreaterThan(30);
    // naphthalene's outline as a ten-membered ring: every angle 120° or 240°
    const h = Math.sqrt(3) / 2;
    const x = [0, -h, -h, 0, h, 2 * h, 3 * h, 3 * h, 2 * h, h];
    const y = [1, 0.5, -0.5, -1, -0.5, -1, -0.5, 0.5, 1, 0.5];
    const edges = x.map((_, i) => [i, (i + 1) % x.length] as [number, number]);
    expect(layoutMetrics({ x, y, edges }).macroAngleError).toBeCloseTo(0, 6);
  });

  it("counts wedges on ring bonds, and labels that crowd", () => {
    const h = polygon(6);
    // a seventh atom off the ring, its bond wedged; one on the ring too
    const x = [...h.x, h.x[0] + 1];
    const y = [...h.y, h.y[0]];
    const edges = [...h.edges, [0, 6] as [number, number]];
    // (atom 0 a centre: its H, with its three bonds)
    const hydrogens = [1, 2, 2, 2, 2, 2, 3];
    const m = layoutMetrics({ x, y, edges, wedged: [0, 6], hydrogens });
    expect(m.ringWedges).toBe(1);
    // an axis of chirality's wedge, on a ring bond as it must be: neither end a centre
    expect(layoutMetrics({ x, y, edges, wedged: [0], hydrogens: [0, 1, 2, 2, 2, 2, 3] }).ringWedges).toBe(0);
    const labels = layoutMetrics({
      x: [0, 0.6],
      y: [0, 0],
      edges: [],
      labelled: [true, true],
    });
    expect(labels.crowdedLabels).toBe(1);
  });
});

/** Turns a drawing through `deg` degrees about the origin. */
function turned<T extends { x: number[]; y: number[] }>(g: T, deg: number): T {
  const t = (deg * Math.PI) / 180;
  return {
    ...g,
    x: g.x.map((v, i) => v * Math.cos(t) - g.y[i] * Math.sin(t)),
    y: g.x.map((v, i) => v * Math.sin(t) + g.y[i] * Math.cos(t)),
  };
}

/** A zigzag of `k` bonds, bond length 1, running level to the right. */
function zigzag(k: number) {
  const h = Math.sqrt(3) / 2;
  const x = Array.from({ length: k + 1 }, (_, i) => i * h);
  const y = Array.from({ length: k + 1 }, (_, i) => (i % 2 ? 0.5 : 0));
  const edges = Array.from({ length: k }, (_, i) => [i, i + 1] as [number, number]);
  return { x, y, edges };
}

describe("how a drawing sits", () => {
  it("measures how far it is turned off the lattice", () => {
    // pointed at the top, two sides upright: square
    const h = polygon(6, 0, 0, Math.PI / 2);
    expect(layoutMetrics(h).tilt).toBeCloseTo(0, 6);
    expect(layoutMetrics(turned(h, 10)).tilt).toBeCloseTo(10, 1);
    // turned a whole step of the lattice, it is square again
    expect(layoutMetrics(turned(h, 30)).tilt).toBeCloseTo(0, 1);
  });

  it("takes the largest ring system as the frame, and a ring hung off it askew as askew", () => {
    // naphthalene, square, with a benzene ring hung off it turned 13 degrees
    const s3 = Math.sqrt(3) / 2;
    const nx = [0, s3, s3, 0, -s3, -s3, 2 * s3, 2 * s3, 3 * s3, 3 * s3];
    const ny = [1, 0.5, -0.5, -1, -0.5, 0.5, 1, -1, 0.5, -0.5];
    const nEdges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [1, 6], [6, 8], [8, 9], [9, 7], [7, 2],
    ];
    const ring = turned(polygon(6, 0, 0, Math.PI / 2), 13);
    // hung from atom 0 of naphthalene, straight up, by one bond
    const top = ring.y.indexOf(Math.min(...ring.y));
    const dx = -ring.x[top];
    const dy = 2 - ring.y[top];
    const x = [...nx, ...ring.x.map((v) => v + dx)];
    const y = [...ny, ...ring.y.map((v) => v + dy)];
    const edges = [
      ...nEdges,
      ...ring.edges.map(([a, b]) => [a + 10, b + 10] as [number, number]),
      [0, 10 + top] as [number, number],
    ];
    const m = layoutMetrics({ x, y, edges });
    expect(m.tilt).toBeCloseTo(0, 6);
    expect(m.gridError).toBeGreaterThan(3);
  });

  it("takes a chain running level as right, and one running up the page as wrong", () => {
    const z = zigzag(8);
    expect(layoutMetrics(z).chainTilt).toBeCloseTo(0, 6);
    // turned a lattice step, still on the lattice, but running up at 60 degrees
    const up = turned(z, 60);
    expect(layoutMetrics(up).tilt).toBeCloseTo(0, 1);
    expect(layoutMetrics(up).chainTilt).toBeCloseTo(60, 1);
  });

  it("lets a short chain hung on a ring run straight out from it", () => {
    // a propyl group on the top of an upright hexagon, running up
    const h = polygon(6, 0, 0, Math.PI / 2);
    const s3 = Math.sqrt(3) / 2;
    const top = h.y.indexOf(Math.max(...h.y));
    const x = [...h.x, 0, s3, s3];
    const y = [...h.y, 2, 2.5, 3.5];
    const edges = [...h.edges, [top, 6], [6, 7], [7, 8]] as [number, number][];
    expect(layoutMetrics({ x, y, edges }).chainTilt).toBeCloseTo(0, 6);
  });

  it("reads an acid at the end of a chain on the right, and leaves one on a ring alone", () => {
    // a zigzag with a carboxylic acid on its left end, its C=O up
    const z = zigzag(6);
    const elements = z.x.map(() => "C");
    const x = [...z.x, -Math.sqrt(3) / 2, 0];
    const y = [...z.y, 0.5, -1];
    const edges = [...z.edges, [0, 7], [0, 8]] as [number, number][];
    const orders = [...z.edges.map(() => 1), 2, 1];
    const acid = {
      x,
      y,
      edges,
      orders,
      elements: [...elements, "O", "O"],
      hydrogens: [...elements.map(() => 2), 0, 1],
    };
    expect(layoutMetrics(acid).readingOrder).toBe(1);
    // mirrored, the acid is on the right, its C=O still up
    const mirrored = { ...acid, x: acid.x.map((v) => -v) };
    expect(layoutMetrics(mirrored).readingOrder).toBe(0);
    // turned half round, it is on the right but its C=O is down
    expect(layoutMetrics(turned(acid, 180)).readingOrder).toBe(1);
  });

  it("counts a label's H that runs into another label", () => {
    // C-OH, the H on the right of the O, and another O a little way off
    const base = {
      edges: [[0, 1]] as [number, number][],
      elements: ["C", "O", "O"],
      hydrogens: [3, 1, 0],
      labelled: [false, true, true],
    };
    const clear = layoutMetrics({ ...base, x: [0, 1, 3], y: [0, 0, 0] });
    const onIt = layoutMetrics({ ...base, x: [0, 1, 1.9], y: [0, 0, 0.3] });
    expect(onIt.crowdedLabels).toBeGreaterThan(clear.crowdedLabels);
  });

  it("counts a bond between two labels that their letters all but cover", () => {
    // Pd-NH, the N a bond off at 30 degrees (a chelate's ring bond, drawn
    // as long as the rest): the d reaches along the bond nearly to the N;
    // straight down, the two clear each other
    const at = (nx: number, ny: number) =>
      layoutMetrics({
        x: [-2, -1, 0, nx, nx, nx],
        y: [0, 0, 0, ny, ny + 1, ny + 2],
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
        elements: ["C", "C", "Pd", "N", "C", "C"],
        hydrogens: [3, 2, 0, 1, 2, 3],
        labelled: [false, false, true, true, false, false],
        hydrogenRoom: 0,
      }).crowdedLabels;
    expect(at(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6))).toBe(1);
    expect(at(0, -1)).toBe(0);
  });

  it("counts an H's count that runs into a label below it", () => {
    // an NH2 between two bonds rising either side, its H under it and the 2
    // after that, an O a little further down
    const at = (hs: number) =>
      layoutMetrics({
        x: [0, -0.866, 0.866, 0.1],
        y: [0, 0.5, 0.5, -1.22],
        edges: [
          [0, 1],
          [0, 2],
        ],
        elements: ["N", "C", "C", "O"],
        hydrogens: [hs, 3, 3, 0],
        labelled: [true, false, false, true],
      }).crowdedLabels;
    expect(at(1)).toBe(0);
    expect(at(2)).toBeGreaterThan(0);
  });

  it("counts an atom of something else inside a small ring drawn flat, in a complex, as an overlap", () => {
    // a cyclohexyl (0-5) on a palladium (6) with a chlorine (7) on it:
    // outside, then dropped inside the ring
    const h = polygon(6, 0, 0, Math.PI / 2);
    const at = (cx: number, cy: number, metal = "Pd") =>
      layoutMetrics({
        x: [...h.x, 3, cx],
        y: [...h.y, 0, cy],
        edges: [...h.edges, [0, 6], [6, 7]] as [number, number][],
        elements: ["C", "C", "C", "C", "C", "C", metal, "Cl"],
        labelled: [false, false, false, false, false, false, true, true],
      }).overlaps;
    expect(at(4, 0)).toBe(0);
    expect(at(0, 0)).toBe(1);
    // (not in a molecule with no metal, which is drawn well without it)
    expect(at(0, 0, "Si")).toBe(0);
  });

  it("counts a name's letters running into an atom, read outward from a bond coming in from the right", () => {
    // OTBS (0) on a carbon (1), and a carbon (2) 1.2 bonds from it on the
    // side its letters run to, or the other side
    const crowding = (from: number, other: number, nameRoom?: number) =>
      layoutMetrics({
        x: [0, from, other],
        y: [0, -0.8, 0],
        edges: [[0, 1]],
        elements: ["OTBS", "C", "C"],
        labelled: [true, false, false],
        hydrogens: [0, 0, 0],
        ...(nameRoom != null ? { nameRoom } : {}),
      }).crowdedLabels;
    // its bond from the left: OTBS, rightward
    expect(crowding(-0.6, 1.2)).toBe(1);
    expect(crowding(-0.6, -1.2)).toBe(0);
    // from the right: TBSO, leftward
    expect(crowding(0.6, -1.2)).toBe(1);
    expect(crowding(0.6, 1.2)).toBe(0);
    // (not counted while a layout sets its parts)
    expect(crowding(-0.6, 1.2, 0)).toBe(0);
  });

  it("adds up its parts to the score", () => {
    const m = layoutMetrics(turned(zigzag(8), 20));
    const sum = Object.values(scoreParts(m)).reduce((a, b) => a + b, 0);
    expect(m.score).toBeCloseTo(sum, 9);
    expect(m.score).toBeGreaterThan(0);
  });
});

describe("conventions the rules give", () => {
  it("wants a sugar's ring oxygen at the top", () => {
    // a pyranose ring, oxygen at the apex, with OH on three ring carbons -
    // the anomeric one, next to the oxygen, upper right
    const h = polygon(6, 0, 0, Math.PI / 2);
    const x = [...h.x];
    const y = [...h.y];
    const edges = [...h.edges];
    const elements = ["O", "C", "C", "C", "C", "C"];
    for (const i of [5, 4, 3]) {
      x.push(h.x[i] * 2);
      y.push(h.y[i] * 2);
      edges.push([i, x.length - 1]);
      elements.push("O");
    }
    const sugar = { x, y, edges, elements, hydrogens: elements.map(() => 1) };
    expect(layoutMetrics(sugar).readingOrder).toBe(0);
    // upside down, the oxygen is at the bottom and the anomeric carbon on the left
    expect(layoutMetrics(turned(sugar, 180)).readingOrder).toBe(2);
  });

  it("tells a lactone from a sugar", () => {
    // the same ring, its oxygen at the top, with a C=O on the carbon next
    // to the oxygen: turned upside down, it is no sugar upside down
    const h = polygon(6, 0, 0, Math.PI / 2);
    const x = [...h.x];
    const y = [...h.y];
    const edges = [...h.edges];
    const orders = h.edges.map(() => 1);
    const elements = ["O", "C", "C", "C", "C", "C"];
    for (const [i, order] of [[5, 2], [4, 1], [3, 1]]) {
      x.push(h.x[i] * 2);
      y.push(h.y[i] * 2);
      edges.push([i, x.length - 1]);
      orders.push(order);
      elements.push("O");
    }
    const lactone = { x, y, edges, orders, elements, hydrogens: elements.map((e) => (e === "O" ? 1 : 1)) };
    expect(layoutMetrics(turned(lactone, 180)).readingOrder).toBe(0);
  });

  it("reads a chain folded back on itself from its carboxyl, above its tail", () => {
    // a hairpin: an acid's chain running left along the top, turning, and
    // its tail running right along the bottom; the acid's C=O level
    const s3 = Math.sqrt(3) / 2;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 7; i++) {
      x.push(6 * s3 - i * s3);
      y.push(2 + (i % 2) * 0.5);
    }
    for (let i = 0; i < 7; i++) {
      x.push(i * s3);
      y.push(-(i % 2) * 0.5);
    }
    const edges = [...Array(13).keys()].map((i) => [i, i + 1] as [number, number]);
    // the carboxyl on the chain's first carbon (0): =O and OH either side
    x.push(7 * s3, 6 * s3 + 0.5);
    y.push(2.5, 1.2);
    edges.push([0, 14], [0, 15]);
    const hairpin = {
      x,
      y,
      edges,
      orders: [...Array<number>(13).fill(1), 2, 1],
      elements: [...x.slice(0, 14).map(() => "C"), "O", "O"],
      hydrogens: [...x.slice(0, 14).map(() => 2), 0, 1],
    };
    const upsideDown = { ...hairpin, y: hairpin.y.map((v) => -v) };
    expect(layoutMetrics(upsideDown).readingOrder).toBeGreaterThan(layoutMetrics(hairpin).readingOrder);
  });

  it("wants a sugar hung on a macrolide seen from its face, wherever its ring O falls", () => {
    // a ring of twelve carbons, and on its first atom, by an O (12), a
    // pyranose (13-18, its ring O 18) with two OHs (19, 20), its anomeric
    // carbon (13) on the left, facing the ring
    const sugar = (clockwise: boolean) => {
      const R = 1 / (2 * Math.sin(Math.PI / 12));
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < 12; i++) {
        x.push(R * Math.cos((i * 2 * Math.PI) / 12) - R);
        y.push(R * Math.sin((i * 2 * Math.PI) / 12));
      }
      x.push(1);
      y.push(0);
      // round the ring from the anomeric carbon, on the left
      const at = (k: number) => Math.PI - ((clockwise ? 1 : -1) * k * Math.PI) / 3;
      for (let k = 0; k < 6; k++) {
        x.push(3 + Math.cos(at(k)));
        y.push(Math.sin(at(k)));
      }
      for (const k of [1, 2]) {
        x.push(3 + 2 * Math.cos(at(k)));
        y.push(2 * Math.sin(at(k)));
      }
      const edges: [number, number][] = [];
      for (let i = 0; i < 12; i++) edges.push([i, (i + 1) % 12]);
      edges.push([0, 12], [12, 13]);
      for (let k = 0; k < 6; k++) edges.push([13 + k, 13 + ((k + 1) % 6)]);
      edges.push([14, 19], [15, 20]);
      const elements = [...Array(12).fill("C"), "O", "C", "C", "C", "C", "C", "O", "O", "O"];
      const hydrogens = elements.map((e, i) => (i >= 19 ? 1 : e === "C" ? 1 : 0));
      return { x, y, edges, elements, hydrogens };
    };
    // the face counts, and only the face: set without it, nothing counts
    const face = (g: ReturnType<typeof sugar>) =>
      layoutMetrics(g).readingOrder - layoutMetrics({ ...g, sugarFaces: false }).readingOrder;
    expect(face(sugar(true))).toBe(0);
    expect(face(sugar(false))).toBe(1);
  });

  it("wants fused rings in a row, the rest above and to the right", () => {
    // phenanthrene: two rings in a row, the third up and to the right
    const s3 = Math.sqrt(3) / 2;
    const hex = (cx: number, cy: number) => polygon(6, cx, cy, Math.PI / 2);
    const parts = [hex(0, 0), hex(2 * s3, 0), hex(3 * s3, 1.5)];
    const x: number[] = [];
    const y: number[] = [];
    const edges: [number, number][] = [];
    const at = (px: number, py: number) => {
      const i = x.findIndex((v, k) => Math.abs(v - px) < 1e-6 && Math.abs(y[k] - py) < 1e-6);
      if (i >= 0) return i;
      x.push(px);
      y.push(py);
      return x.length - 1;
    };
    for (const p of parts) {
      const ids = p.x.map((v, i) => at(v, p.y[i]));
      for (const [a, b] of p.edges) {
        const e: [number, number] = [ids[a], ids[b]];
        if (!edges.some(([c, d]) => (c === e[0] && d === e[1]) || (c === e[1] && d === e[0]))) edges.push(e);
      }
    }
    const g = { x, y, edges };
    expect(layoutMetrics(g).ringOrder).toBe(0);
    // turned half round, the third ring is down and to the left
    expect(layoutMetrics(turned(g, 180)).ringOrder).toBeGreaterThan(0);
  });
});
