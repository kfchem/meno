import { describe, expect, it } from "vitest";
import type { Atom, Bond, Model } from "../store/types";
import { behindRemapped, crossingsHeld, crossingsOf, orderBetween, orderedCrossing, turnedOverCrossings } from "./crossings";

// Two bonds drawn across each other by hand: 10 from (0, 0) to (2, 2) and 11 from (0, 2) to (2, 0), crossing at (1, 1); a third, 12, from
// atom 4 at (2, 1) to atom 1, that crosses neither; and a bond 13 of another structure (atoms 5 and 6) lying over the crossing.
const atom = (id: number, x: number, y: number, z?: number): Atom => ({ id, x, y, el: "C", r: 0.9, ...(z != null ? { z } : {}) });
const bond = (id: number, a: number, b: number, more: Partial<Bond> = {}): Bond => ({ id, a, b, order: 1, ...more });
const atoms: Atom[] = [atom(0, 0, 0), atom(1, 2, 2), atom(2, 0, 2), atom(3, 2, 0), atom(4, 2, 1), atom(5, 1, 0), atom(6, 1, 2)];
// (the two crossing bonds made one structure by a bond between their ends: 0-2)
const base: Model = { atoms, bonds: [bond(10, 0, 1), bond(11, 2, 3), bond(12, 4, 1), bond(14, 0, 2), bond(13, 5, 6)] };
const of = (m: Model, id: number) => m.bonds.find((b) => b.id === id)!;

describe("which bond is in front where two cross, said by the chemist", () => {
  it("says a bond behind the other: it keeps the other's id; in front: the other keeps its id; said again, nothing is said", () => {
    const behind = orderedCrossing(base, 10, 11, "behind");
    expect(of(behind, 10).behind).toEqual([11]);
    expect(of(behind, 11).behind).toBeUndefined();
    expect(orderBetween(behind, 10, 11)).toBe("behind");
    expect(orderBetween(behind, 11, 10)).toBe("front");
    const front = orderedCrossing(behind, 10, 11, "front");
    expect(of(front, 10).behind).toBeUndefined();
    expect(of(front, 11).behind).toEqual([10]);
    // (never both ways)
    expect(front.bonds.filter((b) => b.behind?.length)).toHaveLength(1);
    // (the chosen one again: nothing said, no field left)
    const off = orderedCrossing(front, 10, 11, "front");
    expect(off.bonds.every((b) => b.behind === undefined)).toBe(true);
    expect(orderBetween(off, 10, 11)).toBeNull();
  });

  it("refuses a bond with itself or one that is not there", () => {
    expect(orderedCrossing(base, 10, 10, "behind")).toBe(base);
    expect(orderedCrossing(base, 10, 99, "behind")).toBe(base);
  });

  describe("kept whole after every edit", () => {
    it("takes away the id of a bond that is gone: either bond deleted, the other whole and its field empty", () => {
      const said = orderedCrossing(base, 10, 11, "behind");
      const gone = { ...said, bonds: said.bonds.filter((b) => b.id !== 11) };
      const held = crossingsHeld(gone, said);
      expect(of(held, 10).behind).toBeUndefined();
      expect(held.bonds.some((b) => b.behind)).toBe(false);
    });

    it("keeps one way only where an edit made both: the newer kept, else the one on the smaller id; and drops a bond's own id and a repeat", () => {
      const both: Model = { ...base, bonds: base.bonds.map((b) => (b.id === 10 ? { ...b, behind: [11] } : b.id === 11 ? { ...b, behind: [10] } : b)) };
      const was: Model = { ...base, bonds: base.bonds.map((b) => (b.id === 11 ? { ...b, behind: [10] } : b)) };
      // (10's is the new one: kept)
      const held = crossingsHeld(both, was);
      expect(of(held, 10).behind).toEqual([11]);
      expect(of(held, 11).behind).toBeUndefined();
      // (no before: the smaller id's kept)
      expect(of(crossingsHeld(both), 10).behind).toEqual([11]);
      const odd: Model = { ...base, bonds: base.bonds.map((b) => (b.id === 10 ? { ...b, behind: [10, 11, 11, 99] } : b)) };
      expect(of(crossingsHeld(odd), 10).behind).toEqual([11]);
    });

    it("leaves a model with nothing said as it is, the same object", () => {
      expect(crossingsHeld(base)).toBe(base);
    });
  });

  it("puts a bond's marks on new ids, dropping one whose bond did not come with it", () => {
    expect(behindRemapped([11, 12], (id) => (id === 11 ? 111 : undefined))).toEqual({ behind: [111] });
    expect(behindRemapped([12], () => undefined)).toEqual({});
    expect(behindRemapped(undefined, () => 1)).toEqual({});
  });

  it("exchanges front and behind for bonds turned over together, as a depth turns; one turned alone keeps what it says", () => {
    const said = orderedCrossing(base, 10, 11, "behind");
    const turned = turnedOverCrossings(said, new Set([0, 1, 2, 3, 4]));
    expect(turned).toEqual(expect.arrayContaining([{ id: 10, behind: [] }, { id: 11, behind: [10] }]));
    // (bond 11's atoms not turned: nothing exchanged)
    expect(turnedOverCrossings(said, new Set([0, 1]))).toEqual([]);
  });

  describe("the crossings a bond's menu offers", () => {
    it("finds the bond of its own structure it crosses and where, not one that touches it, not another structure's", () => {
      const found = crossingsOf(base, 10);
      expect(found.map((c) => c.other)).toEqual([11]);
      expect(found[0].at.x).toBeCloseTo(1, 12);
      expect(found[0].at.y).toBeCloseTo(1, 12);
      // (bond 12 shares atom 1 with bond 10: none; bond 13 of the other structure lies over the crossing: none)
      expect(crossingsOf(base, 12)).toEqual([]);
      expect(crossingsOf(base, 13)).toEqual([]);
    });

    it("offers none where all four atoms of the two carry a depth: the depth says it; one atom without depth, the mark is asked", () => {
      const deep: Model = { ...base, atoms: base.atoms.map((a) => (a.id <= 3 ? { ...a, z: a.id } : a)) };
      expect(crossingsOf(deep, 10)).toEqual([]);
      const half: Model = { ...base, atoms: base.atoms.map((a) => (a.id <= 2 ? { ...a, z: a.id } : a)) };
      expect(crossingsOf(half, 10).map((c) => c.other)).toEqual([11]);
    });

    it("gives the crossing nearest the pointer first", () => {
      // (a fourth bond across 10 near its far end: 15 from atom 7 at (1.4, 1.8) to atom 8 at (1.8, 1.4), bonded into the structure by 16)
      const more: Model = { atoms: [...base.atoms, atom(7, 1.4, 1.8), atom(8, 1.8, 1.4)], bonds: [...base.bonds, bond(15, 7, 8), bond(16, 8, 4)] };
      expect(crossingsOf(more, 10, { x: 1.7, y: 1.7 }).map((c) => c.other)).toEqual([15, 11]);
      expect(crossingsOf(more, 10, { x: 0.9, y: 0.9 }).map((c) => c.other)).toEqual([11, 15]);
    });
  });
});
