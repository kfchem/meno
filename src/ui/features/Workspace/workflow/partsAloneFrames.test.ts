import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { chosenMolecules, framesMolecule } from "./setTable";
import { sharesOf, sharesWithheld } from "../utils/molecule3d";

// A structure of several parts, each searched alone (Molecule3D.partsAlone), whose frames are put on the page from a set's table (framesMolecule, chosenMolecules).
const alone = {
  id: 1,
  at: { x: 0, y: 0 },
  atoms: [{ el: "C", x: 0, y: 0, z: 0 }, { el: "Na", x: 5, y: 0, z: 0 }],
  bonds: [],
  frames: [[0, 0.1, 0, 5, 0, 0], [0, 0.2, 0, 5, 0, 0]],
  energies: [0, 0.001, 0.002],
  conformerSet: true,
  partsAlone: true,
} as unknown as Molecule3D;

describe("frames of a structure of several parts, each searched alone, put on the page keep that it is one", () => {
  it("all of its frames: no shares of the whole", () => {
    const m = framesMolecule(alone, [0, 1, 2]);
    expect(m.partsAlone).toBe(true);
    expect(sharesOf(m as Molecule3D)).toBeUndefined();
    expect(sharesWithheld(m as Molecule3D)).not.toBeNull();
  });
  it("some of its frames, chosen as rows: still marked", () => {
    expect(framesMolecule(alone, [0, 2]).partsAlone).toBe(true);
    const rows = [0, 1, 2].map((f) => ({ at: f, molecule: alone, frame: f }));
    const [chosen] = chosenMolecules(rows as never, new Set([0, 1]));
    expect(chosen.partsAlone).toBe(true);
  });
});
