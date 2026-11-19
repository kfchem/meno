import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { hasLooks, pointedSaid } from "./pointedSaid";

// What a look states, said where the pointer rests (docs/EDITOR-2D.md, *What a look states*) - on a page that shows no R, S or other
// mark at all, as on one that does: the words and where they stand do not wait on any mark being drawn.

/** Butan-2-ol drawn flat, its C-O bond (12) a wedge narrow at C2 (id 1). */
function butanol(): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
      { id: 12, a: 1, b: 4, order: 1, stereo: "up", narrow: 1 },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  } as Model;
}

describe("what a look states, with no mark on the page", () => {
  it("is said on the wedge, at its middle, and on its centre, at the atom - no R, S or other mark drawn", () => {
    const m = butanol();
    const placeOf = (id: number) => m.atoms.find((a) => a.id === id);
    const onWedge = pointedSaid(m, null, null, 12, placeOf)!;
    expect(onWedge.text).toBe("C1: set, by this wedge");
    expect(onWedge.x).toBeCloseTo((m.atoms[0].x + m.atoms[3].x) / 2, 9);
    expect(onWedge.y).toBeCloseTo((m.atoms[0].y + m.atoms[3].y) / 2, 9);
    const onCentre = pointedSaid(m, null, 1, null, placeOf)!;
    expect(onCentre.text).toBe("C1: set");
    expect([onCentre.x, onCentre.y]).toEqual([m.atoms[0].x, m.atoms[0].y]);
    // (a plain bond, nothing pointed at, a drawing with no look: nothing)
    expect(pointedSaid(m, null, null, 10, placeOf)).toBeNull();
    expect(pointedSaid(m, null, null, null, placeOf)).toBeNull();
    const plain = { ...m, bonds: m.bonds.map((b) => ({ ...b, stereo: "none" as const })) };
    expect(hasLooks(plain)).toBe(false);
    expect(pointedSaid(plain, null, 1, null, placeOf)).toBeNull();
  });
});
