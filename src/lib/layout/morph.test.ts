import { describe, expect, it } from "vitest";
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
});
