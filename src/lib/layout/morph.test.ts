import { describe, expect, it } from "vitest";
import { coreMatches } from "./scaffold";
import { commonAtoms, CORE_LEAST_SHARE, CORE_MOST_ATOMS, fitOnto, fitted, MATCH_MOST_ATOMS, matchedAtoms, morphAt, sameAtoms, unfitted, type MatchDrawing } from "./morph";

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

/** Benzene with one more atom, `el`, on its first atom: toluene, chlorobenzene, phenol. */
function phenyl(el: string, turn = 0): MatchDrawing {
  const ring = benzene(turn);
  const out = { el, x: 2 * Math.cos(turn), y: 2 * Math.sin(turn) };
  return { atoms: [...ring.atoms, out], bonds: [...ring.bonds, { a: 0, b: 6, order: 1 }] };
}

describe("two analogues, matched on the core they share", () => {
  it("match each atom of the core to its own - the ring of toluene and of chlorobenzene - and none outside it", () => {
    const m = commonAtoms(phenyl("C"), phenyl("Cl", (20 * Math.PI) / 180))!;
    expect(m.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m[6]).toBe(-1);
    // (a hydrogen drawn is never in it)
    expect(commonAtoms(phenyl("H"), phenyl("H"))![6]).toBe(-1);
  });

  it("are no match where the core is less than most of the smaller drawing, or no steps are given to look for it", () => {
    // (hexane and benzene: a ring's bonds are not a chain's - no core of two)
    const hexane: MatchDrawing = { atoms: benzene().atoms, bonds: benzene().bonds.slice(0, 5).map((b) => ({ ...b, order: 1 })) };
    expect(commonAtoms(benzene(), hexane)).toBeNull();
    // (cyclohexane and hexane, every bond single: the bond closing the ring is in one only, so the core stops at five -
    //  whichever of the two it is matched from)
    const cyclohexane: MatchDrawing = { atoms: benzene().atoms, bonds: benzene().bonds.map((b) => ({ ...b, order: 1 })) };
    expect(commonAtoms(cyclohexane, hexane)!.filter((j) => j >= 0)).toHaveLength(5);
    expect(commonAtoms(hexane, cyclohexane)!.filter((j) => j >= 0)).toHaveLength(5);
    expect(commonAtoms(phenyl("C"), phenyl("Cl"), 0)).toBeNull();
  });

  it("are matched atom for atom first, where they are one structure - however few the steps", () => {
    expect(matchedAtoms(phenyl("C"), phenyl("C"))).toEqual(sameAtoms(phenyl("C"), phenyl("C")));
    expect(matchedAtoms(phenyl("C"), phenyl("C"), 0)).toEqual(sameAtoms(phenyl("C"), phenyl("C")));
    expect(matchedAtoms(phenyl("C"), phenyl("O"))!.filter((j) => j >= 0)).toHaveLength(6);
    expect(matchedAtoms(phenyl("C"), phenyl("O"), 0)).toBeNull();
  });

  /** A chain of the atoms `els`, one after another. */
  const line = (els: readonly string[]): MatchDrawing => ({
    atoms: els.map((el, i) => ({ el, x: i * 0.87, y: i % 2 ? 0.5 : 0 })),
    bonds: els.slice(1).map((_, i) => ({ a: i, b: i + 1, order: 1 })),
  });

  it("are matched where the core is most of the smaller - not where it is half of it", () => {
    expect(CORE_LEAST_SHARE).toBe(0.6);
    // (C-C-C-C-O-O and C-C-C-C-N-N: four of six; C-C-C-O-O-O and C-C-C-N-N-N: three of six)
    expect(commonAtoms(line(["C", "C", "C", "C", "O", "O"]), line(["C", "C", "C", "C", "N", "N"]))!.filter((j) => j >= 0)).toHaveLength(4);
    expect(commonAtoms(line(["C", "C", "C", "O", "O", "O"]), line(["C", "C", "C", "N", "N", "N"]))).toBeNull();
  });

  it("are not looked for past the most atoms a core is looked for in", () => {
    const carbons = (n: number) => Array.from({ length: n }, () => "C");
    // (given steps enough to find it either way: only the most decides)
    const ample = 10 ** 7;
    expect(commonAtoms(line([...carbons(CORE_MOST_ATOMS - 1), "O"]), line([...carbons(CORE_MOST_ATOMS - 1), "N"]), ample)).not.toBeNull();
    expect(commonAtoms(line([...carbons(CORE_MOST_ATOMS), "O"]), line([...carbons(CORE_MOST_ATOMS), "N"]), ample)).toBeNull();
  });

  it("count no drawn hydrogen towards how much of the smaller the core must be", () => {
    // (benzene with its six hydrogens drawn, and chlorobenzene with five: the six carbons are all of the smaller's heavy atoms -
    //  counted with their hydrogens, they would be half of each, and too little)
    const withH = (subst: string): MatchDrawing => {
      const ring = benzene();
      const outs = ring.atoms.map((a, i) => ({ el: i === 0 ? subst : "H", x: 2 * a.x, y: 2 * a.y }));
      return { atoms: [...ring.atoms, ...outs], bonds: [...ring.bonds, ...outs.map((_, i) => ({ a: i, b: 6 + i, order: 1 }))] };
    };
    const m = commonAtoms(withH("H"), withH("Cl"))!;
    expect(m.slice(0, 6).every((j) => j >= 0 && j < 6)).toBe(true);
    expect(m.slice(6).every((j) => j === -1)).toBe(true);
  });

  it("move what is outside the core with it: a point put back by a fit is where it came from, mirrored or not", () => {
    const was = ethanol().atoms;
    // (turned; and turned and mirrored, fitted mirrored)
    const turned = was.map((a) => ({ x: -a.y + 3, y: a.x }));
    const mirrored = turned.map((a) => ({ x: -a.x, y: a.y }));
    for (const [pts, mirror, want] of [
      [turned, false, 1],
      [mirrored, true, -1],
    ] as const) {
      const f = fitOnto(pts, was, mirror);
      expect(f.mirror).toBe(want);
      const p = { x: 0.3, y: -1.2 };
      const back = unfitted(f, fitted(f, p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });
});
