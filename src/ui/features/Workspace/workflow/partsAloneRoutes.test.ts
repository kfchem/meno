import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { setEntries } from "./entries";
import { resultsOf } from "./run";

// A structure of several parts, each searched alone, through a step that gives molecules (not conformers): each molecule still says so.

function waters(above: number[], extra: Partial<Molecule3D> = {}, id = 1): Molecule3D {
  const geo = (k: number) => [0, 0, 0, 1, 0, 0, -0.3, 0.95 + k * 0.4, 0];
  const first = geo(0);
  return {
    id,
    at: { x: 0, y: 0 },
    atoms: [0, 1, 2].map((i) => ({ el: i === 0 ? "O" : "H", x: first[3 * i], y: first[3 * i + 1], z: first[3 * i + 2] })),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(above.length > 1 ? { frames: above.slice(1).map((_, k) => geo(k + 1)) } : {}),
    energies: above.map((a) => -76 + a / 627.5),
    conformerSet: true,
    ...extra,
  };
}

describe("a structure of several parts, each searched alone, through a step that holds molecules", () => {
  it("each molecule it gives still says it", () => {
    const entries = setEntries([waters([0, 0.4, 1.2], { partsAlone: true })], "conformers");
    const out = resultsOf({ ok: true, holds: "molecules", kept: entries, aside: [], said: "" }, "optimise");
    expect(out.molecules.length).toBeGreaterThan(0);
    expect(out.molecules.map((m) => m.partsAlone)).toEqual(out.molecules.map(() => true));
  });
});
