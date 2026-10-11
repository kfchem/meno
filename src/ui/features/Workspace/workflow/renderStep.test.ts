import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { kindInfo, KINDS } from "./kinds";
import { CARD_W, GAP } from "./look";
import { entryCarried, picturesBeside, picturesSaid } from "./renderStep";

describe("Render as a step", () => {
  it("is a kind Meno defines that takes molecules or conformers, gives no set, and has Meno's own choices for a picture", () => {
    const render = kindInfo("render");
    expect(render).toMatchObject({ name: "Render", takes: ["molecules", "conformers"], gives: null, runs: "program" });
    expect(render.own?.map((o) => o.id)).toEqual(["width", "shape", "molecules", "surfaces"]);
    // (Meno's picture defaults: wide, fitted to the molecules, as the 3D style draws them)
    expect(render.own?.map((o) => o.default)).toEqual([2400, "fit", "meno", "meno"]);
    expect(KINDS.filter((k) => k.gives === null).map((k) => k.kind)).toEqual(["render"]);
  });

  it("takes an entry at its own geometry, in its molecule's look, turned as the canvas turns it", () => {
    const e = { compound: 0, number: 2, atoms: [{ el: "H", x: 9, y: 9, z: 9 }, { el: "H", x: 9, y: 9, z: 9 }], bonds: [{ a1: 0, a2: 1, order: 1 }], xyz: [0, 0, 0, 0, 0, 0.74], name: "H2" };
    const turn = { x: 0, y: 0, z: 0, w: 1 };
    const m = entryCarried(e as never, { look: "secondary" } as never, turn as never);
    expect(m.atoms.map((a) => [a.x, a.y, a.z])).toEqual([
      [0, 0, 0],
      [0, 0, 0.74],
    ]);
    expect(m).toMatchObject({ name: "H2", look: "secondary", turn, at: { x: 0, y: 0 } });
  });

  it("lays its pictures in a row to the step's right, their tops level with its own, a bond apart", () => {
    const [a, b] = picturesBeside({ x: 10, y: 5 }, [
      [4, 2],
      [6, 3],
    ]);
    expect(a).toEqual({ x: 10 + CARD_W + GAP + 2, y: 5 - 1 });
    expect(b.x - 3 - (a.x + 2)).toBeCloseTo(NOMINAL_BOND_LENGTH);
    expect(b.y).toBe(5 - 1.5);
  });

  it("says how many pictures it made, of how many", () => {
    expect([picturesSaid(1, 1), picturesSaid(3, 3), picturesSaid(2, 3)]).toEqual(["1 picture", "3 pictures", "2 pictures of 3"]);
  });
});
