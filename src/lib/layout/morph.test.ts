import { describe, expect, it } from "vitest";
import { coreMatches } from "./scaffold";
import { fitOnto, fitted, MATCH_MOST_ATOMS, morphAt, sameAtoms, type MatchDrawing } from "./morph";

/** Benzene drawn as a hexagon of side 1, its first atom at angle `turn` (radians), Kekulé bonds from atom `first`. */
function benzene(turn = 0, first = 0, at = { x: 0, y: 0 }): MatchDrawing {
  const atoms = Array.from({ length: 6 }, (_, i) => ({ el: "C", x: at.x + Math.cos(turn + (i * Math.PI) / 3), y: at.y + Math.sin(turn + (i * Math.PI) / 3) }));
  const bonds = atoms.map((_, i) => ({ a: i, b: (i + 1) % 6, order: (i + first) % 2 === 0 ? 2 : 1 }));
  return { atoms, bonds };
}

/** Ethanol drawn as a zigzag: C, C, O. */
const ethanol = (o = "O"): MatchDrawing => ({
  atoms: [
    { el: "C", x: 0, y: 0 },
    { el: "C", x: 0.87, y: 0.5 },
    { el: o, x: 1.73, y: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 1 },
  ],
});

describe("two drawings of one structure, matched", () => {
  it("match atom for atom, of a symmetric structure's ways the one that moves its atoms least - a ring turned 20 degrees, its atoms not taken round", () => {
    const was = benzene();
    // (drawn with its other Kekulé structure: one structure all the same)
    const now = benzene((20 * Math.PI) / 180, 1);
    expect(sameAtoms(was, now)).toEqual([0, 1, 2, 3, 4, 5]);
    // (turned 50 degrees: each atom matched to the one it is nearer, one place on - turned back 10 degrees, not on 50)
    expect(sameAtoms(was, benzene((50 * Math.PI) / 180))).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("are no match where the constitution differs, an atom's charge or label differs, or a drawing is too large", () => {
    expect(sameAtoms(ethanol(), ethanol("N"))).toBeNull();
    const charged = { ...ethanol(), atoms: ethanol().atoms.map((a, i) => (i === 2 ? { ...a, charge: -1 } : a)) };
    expect(sameAtoms(ethanol(), charged)).toBeNull();
    const labelled = { ...ethanol(), atoms: ethanol().atoms.map((a, i) => (i === 0 ? { ...a, label: "Me" } : a)) };
    expect(sameAtoms(ethanol(), labelled)).toBeNull();
    const big: MatchDrawing = { atoms: Array.from({ length: MATCH_MOST_ATOMS + 1 }, (_, i) => ({ el: "C", x: i, y: 0 })), bonds: Array.from({ length: MATCH_MOST_ATOMS }, (_, i) => ({ a: i, b: i + 1, order: 1 })) };
    expect(sameAtoms(big, big)).toBeNull();
  });

  it("fit a turned copy as a turn, mirrored only where asked and fitting better", () => {
    const was = ethanol().atoms;
    const turned = was.map((a) => ({ x: -a.y, y: a.x }));
    const f = fitOnto(turned, was);
    expect(f.mirror).toBe(1);
    expect(f.off).toBeLessThan(1e-9);
    turned.forEach((p, i) => expect(fitted(f, p).x).toBeCloseTo(was[i].x));
    const mirrored = was.map((a) => ({ x: -a.x, y: a.y }));
    expect(fitOnto(mirrored, was).off).toBeGreaterThan(0.1);
    expect(fitOnto(mirrored, was, true)).toMatchObject({ mirror: -1 });
  });

  it("move from where each atom was matched to its own place, turning as one the shorter way round - never more than half a turn", () => {
    const was = benzene(0, 0, { x: 5, y: 2 }).atoms;
    const now = benzene((40 * Math.PI) / 180).atoms;
    const f = fitOnto(now, was);
    now.forEach((p, i) => {
      expect(morphAt(f, was[i], p, 0).x).toBeCloseTo(was[i].x);
      expect(morphAt(f, was[i], p, 0).y).toBeCloseTo(was[i].y);
      expect(morphAt(f, was[i], p, 1).x).toBeCloseTo(p.x);
      expect(morphAt(f, was[i], p, 1).y).toBeCloseTo(p.y);
    });
    // (half-way: its middle half-way between, every bond as long - turned, not squeezed)
    const half = now.map((p, i) => morphAt(f, was[i], p, 0.5));
    const side = Math.hypot(half[1].x - half[0].x, half[1].y - half[0].y);
    expect(side).toBeCloseTo(1);
    expect(Math.abs(Math.atan2(f.sin, f.cos))).toBeLessThanOrEqual(Math.PI);
  });

  it("move a drawing that is not the other turned - a chain stretched, then curled - exactly from its places to its own, the turn half done half-way", () => {
    const h = 1.299;
    const stretched = [
      { x: 0, y: 0 },
      { x: 1.5, y: 0 },
      { x: 2.25, y: h },
      { x: 3.75, y: h },
      { x: 4.5, y: 0 },
    ];
    // (curled, and turned 170 degrees as a whole: a turn the long way round would be 190)
    const curl = [
      { x: 0, y: 0 },
      { x: 1.5, y: 0 },
      { x: 2.25, y: h },
      { x: 1.5, y: 2 * h },
      { x: 2.25, y: 3 * h },
    ];
    const t170 = (170 * Math.PI) / 180;
    const curled = curl.map((p) => ({ x: Math.cos(t170) * p.x - Math.sin(t170) * p.y + 7, y: Math.sin(t170) * p.x + Math.cos(t170) * p.y + 1 }));
    const f = fitOnto(curled, stretched);
    curled.forEach((p, i) => {
      const start = morphAt(f, stretched[i], p, 0);
      const end = morphAt(f, stretched[i], p, 1);
      expect(start.x).toBeCloseTo(stretched[i].x, 9);
      expect(start.y).toBeCloseTo(stretched[i].y, 9);
      expect(end.x).toBeCloseTo(p.x, 9);
      expect(end.y).toBeCloseTo(p.y, 9);
    });
    // (turned only - the stretched chain itself, 170 degrees round - half-way it has turned 85 degrees, the short way, not 95 the long)
    const rigid = stretched.map((p) => ({ x: Math.cos(t170) * p.x - Math.sin(t170) * p.y + 7, y: Math.sin(t170) * p.x + Math.cos(t170) * p.y + 1 }));
    const g = fitOnto(rigid, stretched);
    const mid = rigid.map((p, i) => morphAt(g, stretched[i], p, 0.5));
    const turn = (q: readonly { x: number; y: number }[]) => Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x);
    const by = Math.atan2(Math.sin(turn(mid) - turn(stretched)), Math.cos(turn(mid) - turn(stretched)));
    expect(by).toBeCloseTo((85 * Math.PI) / 180, 6);
  });

  it("are matched up to as many atoms as the most - one more, and they are not", () => {
    const chain = (n: number): MatchDrawing => ({
      atoms: Array.from({ length: n }, (_, i) => ({ el: "C", x: i * 0.87, y: i % 2 ? 0.5 : 0 })),
      bonds: Array.from({ length: n - 1 }, (_, i) => ({ a: i, b: i + 1, order: 1 })),
    });
    expect(sameAtoms(chain(MATCH_MOST_ATOMS), chain(MATCH_MOST_ATOMS))).not.toBeNull();
    expect(sameAtoms(chain(MATCH_MOST_ATOMS + 1), chain(MATCH_MOST_ATOMS + 1))).toBeNull();
  });

  it("are fitted without a mirror where a mirror fits no better - a drawing as symmetric as its mirror", () => {
    // (propane, C-C-C bent: its mirror across its own axis is itself - a tie, and the plain turn is taken)
    const propane = [
      { x: -0.87, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.87, y: 0 },
    ];
    const turned = propane.map((p) => ({ x: -p.y, y: p.x }));
    expect(fitOnto(turned, propane, true)).toMatchObject({ mirror: 1 });
  });
});

describe("a core found in a structure (scaffold.ts coreMatches)", () => {
  /** Six carbons, bonded 0-1 ... 4-5, and 5-0 closing a ring of `closing` order where it is given. */
  const six = (closing?: number) => ({
    atoms: Array.from({ length: 6 }, () => ({ el: "C" })),
    bonds: [...Array.from({ length: 5 }, (_, i) => ({ a: i, b: i + 1, order: 1 })), ...(closing ? [{ a: 5, b: 0, order: closing }] : [])],
  });

  it("is not found where a bond of it is missing - a ring against an open chain, each of whose middle atoms has as many bonds", () => {
    // (eight carbons in a chain: six of them in a row have two bonds each, as each ring atom has - only the ring's closing bond is missing)
    const chain = { atoms: Array.from({ length: 8 }, () => ({ el: "C" })), bonds: Array.from({ length: 7 }, (_, i) => ({ a: i, b: i + 1, order: 1 })) };
    expect(coreMatches(six(1), chain)).toEqual([]);
    expect(coreMatches(six(1), six())).toEqual([]);
  });

  it("is not found where a bond of it is there at another order - cyclohexene's double bond against cyclohexane's single", () => {
    expect(coreMatches(six(2), six(1))).toEqual([]);
  });

  it("is found where every bond of it is there, as it is", () => {
    expect(coreMatches(six(1), six(1)).length).toBeGreaterThan(0);
    expect(coreMatches(six(2), six(2)).length).toBeGreaterThan(0);
  });
});
