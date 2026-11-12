import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Atom, Bond, Model } from "../store/types";
import { angleFrom, isEndOn, newmanDrawing, newmanExtension, newmansIn, newmanTurn, setOf, spokeAngles, turnedAbout, turnedTo, turnOf } from "./newman";

const pair = (at = { x: 0, y: 0 }) => newmanDrawing({ at, firstId: 1, firstBondId: 100 });

/** The pair with groups given: (atom 1 front or 2 back, angle in degrees), each a carbon a bond length out. */
function withGroups(groups: [1 | 2, number][], at = { x: 0, y: 0 }): Model {
  const d = pair(at);
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach(([of, deg], i) => {
    atoms.push({ id: 10 + i, el: "C", r: 0.9, x: at.x + L * Math.cos((deg * Math.PI) / 180), y: at.y + L * Math.sin((deg * Math.PI) / 180) });
    bonds.push({ id: 200 + i, a: of, b: 10 + i, order: 1 });
  });
  return { atoms, bonds };
}

describe("the Newman tool's drawing", () => {
  it("is two carbons at one place, the front nearer, joined by one bond seen end-on", () => {
    const d = pair({ x: 5, y: -3 });
    expect(d.atoms.map((a) => a.el)).toEqual(["C", "C"]);
    expect(d.atoms[0].x).toBe(5);
    expect(d.atoms[1].x).toBe(5);
    expect(d.atoms[0].y).toBe(-3);
    expect(d.atoms[0].z!).toBeGreaterThan(d.atoms[1].z!);
    expect(d.bonds).toHaveLength(1);
    expect(isEndOn(d.atoms[0], d.atoms[1])).toBe(true);
    expect(isEndOn({ x: 0, y: 0, z: 1 }, { x: 0.5, y: 0, z: 0 })).toBe(false);
    expect(isEndOn({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });

  it("is found as the tool's: the front atom the nearer, its groups at their angles", () => {
    const m = withGroups([[1, 90], [2, 30]]);
    const [found] = newmansIn(m);
    expect(found.front).toBe(1);
    expect(found.back).toBe(2);
    expect(found.groups.front[0].angle).toBeCloseTo(90, 6);
    expect(found.groups.back[0].angle).toBeCloseTo(30, 6);
    expect(newmansIn({ atoms: m.atoms.map((a) => ({ ...a, z: undefined })), bonds: m.bonds })).toEqual([]);
  });
});

describe("a bond led out of an atom of a Newman pair", () => {
  it("goes to the nearest of the atom's three spokes, a bond length from the centre, and says front or back", () => {
    const bare = pair();
    const front = newmanExtension(bare, 1, { x: 0, y: 5 })!;
    expect(front.name).toBe("front");
    expect(angleFrom(front.end, { x: 0, y: 0 })).toBeCloseTo(90, 6);
    expect(Math.hypot(front.end.x, front.end.y)).toBeCloseTo(L, 9);
    // (the back's, staggered to the front's: 30, 150, 270)
    const back = newmanExtension(bare, 2, { x: 5, y: 1 })!;
    expect(back.name).toBe("back");
    expect(angleFrom(back.end, { x: 0, y: 0 })).toBeCloseTo(30, 6);
    expect(angleFrom(newmanExtension(bare, 2, { x: -5, y: 1 })!.end, { x: 0, y: 0 })).toBeCloseTo(150, 6);
  });

  it("never offers a spoke a group holds, and none when all three are held or the groups are at no spoke", () => {
    const one = withGroups([[1, 90]]);
    expect(angleFrom(newmanExtension(one, 1, { x: 0, y: 5 })!.end, { x: 0, y: 0 })).not.toBeCloseTo(90, 3);
    const all = withGroups([[1, 90], [1, 210], [1, 330]]);
    expect(newmanExtension(all, 1, { x: 0, y: 5 })).toBeNull();
    const odd = withGroups([[1, 100]]);
    expect(newmanExtension(odd, 1, { x: 0, y: 5 })).toBeNull();
    expect(newmanExtension(one, 99, { x: 0, y: 5 })).toBeNull();
  });
});

describe("the sets of spokes, and turning about the bond", () => {
  it("reads which set an atom's groups lie in, the back's offset where it is the front's", () => {
    expect(setOf([{ id: 1, angle: 90 }, { id: 2, angle: 210 }], false, null)).toEqual({ set: "A", eclipsed: false });
    expect(setOf([{ id: 1, angle: 30 }], true, "A")).toEqual({ set: "B", eclipsed: false });
    expect(setOf([{ id: 1, angle: 102 }], true, "A")).toEqual({ set: "A", eclipsed: true });
    expect(setOf([{ id: 1, angle: 101 }], true, "A")).toBeNull();
    expect(turnOf(newmansIn(withGroups([[1, 90], [2, 102]]))[0])).toEqual({ front: "A", back: "A", eclipsed: true });
  });

  it("turns a spoke dragged round to the nearest of the atom's six places, the least way round, all its groups by the same angle", () => {
    // (the back atom's groups at 30, 150, 270; the front's set A: dragged to 100 degrees, it comes to rest at A's 102, the eclipsed place)
    const t = turnedTo({ held: 30, pointer: { x: Math.cos((100 * Math.PI) / 180), y: Math.sin((100 * Math.PI) / 180) }, back: true, other: "A" });
    expect(t).toMatchObject({ set: "A", eclipsed: true });
    expect(t.turn).toBeCloseTo(72, 9);
    // (to 40: the nearer place is 30, where it was: no turn)
    expect(turnedTo({ held: 30, pointer: { x: Math.cos((40 * Math.PI) / 180), y: Math.sin((40 * Math.PI) / 180) }, back: true, other: "A" }).turn).toBeCloseTo(0, 9);
    // (all the way round to 330: the least way, minus 60 - the front's own place)
    expect(turnedTo({ held: 30, pointer: { x: Math.cos((330 * Math.PI) / 180), y: Math.sin((330 * Math.PI) / 180) }, back: false, other: "B" }).turn).toBeCloseTo(-60, 9);
  });

  it("turns points about the centre, turning cyclic order and distance from the centre unchanged", () => {
    const p = turnedAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
    for (const set of ["A", "B"] as const) expect(spokeAngles(set, false, false)).toHaveLength(3);
  });
});

describe("a spoke dragged round the circle", () => {
  const polar = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  /** The pair with three groups on the back atom (30, 150, 270) and one on the front (90), a second atom hung from the back's first group. */
  const model = (): Model => {
    const m = withGroups([[2, 30], [2, 150], [2, 270], [1, 90]]);
    const [g] = m.atoms.filter((a) => a.id === 10);
    return { atoms: [...m.atoms, { id: 40, el: "C", r: 0.9, x: g.x + 0.5 * L, y: g.y }], bonds: [...m.bonds, { id: 300, a: 10, b: 40, order: 1 }] };
  };
  const apply = (m: Model, moves: { id: number; x: number; y: number }[]): Model => ({ atoms: m.atoms.map((a) => moves.find((x) => x.id === a.id) ? { ...a, ...moves.find((x) => x.id === a.id)! } : a), bonds: m.bonds });

  it("turns all three groups of the atom together, to the place nearest the pointer, with what hangs beyond them", () => {
    const m = model();
    const moves = newmanTurn(m, 10, polar(100, 3 * L))!;
    const after = apply(m, moves);
    const angles = [10, 11, 12].map((id) => angleFrom(after.atoms.find((a) => a.id === id)!, { x: 0, y: 0 }));
    // (the grabbed group at 102, the eclipsed place - the front's set is A, 90 - and the others 120 on each side)
    expect(angles[0]).toBeCloseTo(102, 6);
    expect(angles[1]).toBeCloseTo(222, 6);
    expect(angles[2]).toBeCloseTo(342, 6);
    // (what hung from the first group went with it: the same step, the same distance from its group)
    const [g, h] = [after.atoms.find((a) => a.id === 10)!, after.atoms.find((a) => a.id === 40)!];
    expect(Math.hypot(h.x - g.x, h.y - g.y)).toBeCloseTo(0.5 * L, 9);
    // (a turn about the bond: every group the same distance from the centre, the front's group where it was)
    for (const id of [10, 11, 12]) expect(Math.hypot(after.atoms.find((a) => a.id === id)!.x, after.atoms.find((a) => a.id === id)!.y)).toBeCloseTo(L, 9);
    expect(after.atoms.find((a) => a.id === 13)).toEqual(m.atoms.find((a) => a.id === 13));
  });

  it("keeps the cyclic order of the groups, whatever place it is dragged to", () => {
    const m = model();
    for (let deg = 0; deg < 360; deg += 17) {
      const after = apply(m, newmanTurn(m, 10, polar(deg, 3 * L))!);
      const order = (mm: Model) => [10, 11, 12].map((id) => angleFrom(mm.atoms.find((a) => a.id === id)!, { x: 0, y: 0 })).map((a, k, all) => (((all[(k + 1) % 3] - a) % 360) + 360) % 360);
      for (const gap of order(after)) expect(gap).toBeCloseTo(120, 6);
    }
  });

  it("moves the other atom's groups by the offset where the two sets come to be the same - and back again", () => {
    // (the front's group at 90, set A; the back's at 30, set B: staggered. The front dragged round to 150: its set is B now, the back's
    //  the same as it, so the back's groups turn by the eclipsed offset to still show)
    const m = model();
    const moves = newmanTurn(m, 13, polar(150, 3 * L))!;
    const after = apply(m, moves);
    expect(angleFrom(after.atoms.find((a) => a.id === 13)!, { x: 0, y: 0 })).toBeCloseTo(150, 6);
    expect(angleFrom(after.atoms.find((a) => a.id === 10)!, { x: 0, y: 0 })).toBeCloseTo(42, 6);
    // (and the front taken back to A: the back's again where it was)
    const back = apply(after, newmanTurn(after, 13, polar(90, 3 * L))!);
    expect(angleFrom(back.atoms.find((a) => a.id === 10)!, { x: 0, y: 0 })).toBeCloseTo(30, 6);
  });

  it("is none for an atom that is no group of a pair, and for a pair whose groups lie at none of its places", () => {
    const m = model();
    expect(newmanTurn(m, 1, polar(100))).toBeNull();
    expect(newmanTurn(m, 99, polar(100))).toBeNull();
    const odd = withGroups([[2, 33]]);
    expect(newmanTurn(odd, 10, polar(100))).toBeNull();
  });
});
