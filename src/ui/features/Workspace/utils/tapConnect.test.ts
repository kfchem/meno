import { describe, expect, it } from "vitest";
import { newmanDrawing } from "../projections/newman";
import { tapConnects } from "./tapConnect";

describe("a double-click's second press let go beside another atom", () => {
  it("does not join a Newman pair's front atom to its back atom, which lies under the centre and is bonded to it already", () => {
    const d = newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
    // (the back atom, 2, is at the centre: the press's release there finds it)
    expect(d.atoms[1].x).toBe(d.atoms[0].x);
    expect(tapConnects(d, 1, 2)).toBe(false);
    expect(tapConnects(d, 2, 1)).toBe(false);
  });

  it("joins two atoms not bonded yet, and nothing where no atom is near", () => {
    const model = { bonds: [{ id: 1, a: 1, b: 2, order: 1 as const }] };
    expect(tapConnects(model, 1, 3)).toBe(true);
    expect(tapConnects(model, 1, null)).toBe(false);
  });
});
