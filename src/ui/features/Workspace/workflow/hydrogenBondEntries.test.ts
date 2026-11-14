import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { blocksOf } from "../chem/make3d";
import type { Atom, Bond, Model } from "../store/types";
import { drawnHash, setMembers, structuresOf } from "./entries";
import { runMenoDrawn } from "./meno";
import { drawnEntries } from "./run";

/**
 * (Z)-4-hydroxypent-3-en-2-one (ids 1-8), its own O-H...O=C hydrogen bond drawn (18) when `own`; with `water`, a water (9) its
 * C=O holds by a hydrogen bond (19); and methylammonium (21-23) with a chloride (24) held to its N-H by a hydrogen bond (31).
 */
function page({ own = true, water = true } = {}): Model {
  const at = (id: number, deg: number, r: number, el = "C", charge?: number, dx = 0): Atom =>
    ({ id, el, x: dx + r * L * Math.cos((deg * Math.PI) / 180), y: -r * L * Math.sin((deg * Math.PI) / 180), r: 0.9, ...(charge ? { charge } : {}) }) as Atom;
  const bond = (id: number, a: number, b: number, hydrogen = false): Bond => ({ id, a, b, order: 1, ...(hydrogen ? { hydrogen: true } : {}) }) as Bond;
  return {
    atoms: [
      ...[at(1, 150, 2), at(2, 150, 1), at(3, -150, 1, "O"), at(4, 90, 1), at(5, 30, 1), at(6, -30, 1, "O"), at(7, 30, 2), at(8, -90, 1, "H")],
      ...(water ? [at(9, -90, 2, "O")] : []),
      ...[at(21, 180, 1, "C", 0, 8 * L), at(22, 0, 0, "N", 1, 8 * L), at(23, 0, 1, "H", 0, 8 * L), at(24, 0, 2, "Cl", -1, 8 * L)],
    ],
    bonds: [
      ...[bond(11, 1, 2), { ...bond(12, 2, 3), order: 2 } as Bond, bond(13, 2, 4), { ...bond(14, 4, 5), order: 2 } as Bond, bond(15, 5, 6), bond(16, 5, 7), bond(17, 6, 8)],
      ...(own ? [bond(18, 8, 3, true)] : []),
      ...(water ? [bond(19, 9, 3, true)] : []),
      ...[bond(25, 21, 22), bond(26, 22, 23), bond(31, 23, 24, true)],
    ],
  } as Model;
}
const sorted = (s: readonly number[]) => [...s].sort((p, q) => p - q);
/** Structures each sorted, and in order of their first atom: whatever order a set lists them in. */
const each = (all: readonly (readonly number[])[]) => all.map(sorted).sort((p, q) => p[0] - q[0]);

describe("a hydrogen bond drawn, as a set's entries have it", () => {
  it("makes what it alone joins two structures, two entries - as a set round them holds them - and one piece of ink as drawn", () => {
    const m = page();
    expect(structuresOf(m).map(sorted)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9], [21, 22, 23], [24]]);
    const set = { id: 1, x0: -10 * L, y0: -10 * L, x1: 20 * L, y1: 10 * L };
    expect(each(setMembers({ model: m }, set).structures)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9], [21, 22, 23], [24]]);
    // (the same entries Make 3D and a step's conformers make of it: chem/make3d `blocksOf`)
    expect(blocksOf(m, [1]).map((b) => sorted(b.atoms))).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9]]);
    // (as ink - what moves a structure out of a frame, or keeps a line clear of it - the pair is one, its hydrogen bond between)
    expect(structuresOf(m, true).map(sorted)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9], [21, 22, 23, 24]]);
  });

  it("comes into a step as two entries: Enumerate, which takes one template, is given two", () => {
    const m = page();
    const pair = structuresOf(m).filter((ids) => ids.some((id) => id <= 9));
    const entries = drawnEntries(m, pair);
    expect(entries.map((e) => e.drawn.atoms.length)).toEqual([8, 1]);
    // (the enol's own hydrogen bond kept in its drawing as drawn; the one to the water in neither)
    expect(entries[0].drawn.bonds.some((b) => b.id === 18)).toBe(true);
    expect(entries.some((e) => e.drawn.bonds.some((b) => b.id === 19))).toBe(false);
    expect(runMenoDrawn("enumerate", entries)).toEqual({ ok: false, said: "Enumerate takes one structure drawn, its template: 2 came in" });
  });

  it("gives a structure the same identity with its own hydrogen bond drawn and without it", () => {
    const enol = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(drawnHash(page({ water: false }), enol)).toBe(drawnHash(page({ own: false, water: false }), enol));
    expect(drawnHash(page(), enol)).toBe(drawnHash(page({ own: false, water: false }), enol));
  });
});
