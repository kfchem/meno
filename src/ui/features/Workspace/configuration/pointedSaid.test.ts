import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import type { ChemMarks } from "../chem/marks";
import { pointedSaid } from "./pointedSaid";

// Why an R or S asked for is not there, said where the pointer rests on its atom (docs/EDITOR-2D.md, *Meno's own*); nothing said on a
// wedge or on an atom for what the drawing states (the maintainer's report: a chip nobody understands).

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

describe("what is said where the pointer rests", () => {
  it("says nothing on a wedge, nor on its centre, whether or not R or S is shown", () => {
    const m = butanol();
    const placeOf = (id: number) => m.atoms.find((a) => a.id === id);
    const shown = { ...m, atoms: m.atoms.map((a) => (a.id === 1 ? { ...a, stereoShown: true as const } : a)) };
    const marks = { centres: new Map([[1, "R"]]), doubleBonds: new Map(), valence: new Map(), said: new Map() } as unknown as ChemMarks;
    for (const model of [m, shown]) {
      expect(pointedSaid(model, null, null, 12, placeOf)).toBeNull();
      expect(pointedSaid(model, null, 1, null, placeOf)).toBeNull();
      expect(pointedSaid(model, marks, null, 12, placeOf)).toBeNull();
      expect(pointedSaid(model, marks, 1, null, placeOf)).toBeNull();
    }
  });

  it("says why an R or S asked for is not there, at its atom - and only where it was asked for", () => {
    const m = butanol();
    const placeOf = (id: number) => m.atoms.find((a) => a.id === id);
    const why = "No R or S: no configuration is drawn here.";
    const marks = { centres: new Map(), doubleBonds: new Map(), valence: new Map(), said: new Map([["centre-3", why]]) } as unknown as ChemMarks;
    expect(pointedSaid(m, marks, 3, null, placeOf)).toBeNull();
    const asked = { ...m, atoms: m.atoms.map((a) => (a.id === 3 ? { ...a, stereoShown: true as const } : a)) };
    const said = pointedSaid(asked, marks, 3, null, placeOf)!;
    expect(said.text).toBe(why);
    expect([said.x, said.y, said.w, said.h]).toEqual([m.atoms[2].x, m.atoms[2].y, 0, 0]);
  });
});
