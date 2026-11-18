import { describe, expect, it, vi } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import type { ChemClient } from "../../../../lib/roles/client";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawingOf } from "./drawing";

// (Meno's layout refusing, stood in for: the formula is kept as the plugin drew it)
vi.mock("./cleanUp", async (actual) => ({ ...(await actual<typeof import("./cleanUp")>()), laidOut: () => Promise.reject(new Error("refused")) }));

/** Hexa-2,3,4-triene's plugin picture, its heavy atoms bent cis: both methyls up. */
const PICTURE = [
  "",
  "  Meno",
  "",
  "  6  5  0  0  0  0  0  0  0  0999 V2000",
  ...[
    [-0.75, 1.3],
    [0, 0],
    [1.5, 0],
    [3, 0],
    [4.5, 0],
    [5.25, 1.3],
  ].map(([x, y]) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0`),
  "  1  2  1  0",
  "  2  3  2  0",
  "  3  4  2  0",
  "  4  5  2  0",
  "  5  6  1  0",
  "M  END",
  "",
].join("\n");

/** The molecule in 3D: its run along x, C1's methyl up and its H down, C4's methyl down (trans) or up (cis); all bonds single. */
function triene(cis: boolean) {
  const atoms = [
    { el: "H", x: -0.7, y: -1.1, z: 0 },
    { el: "C", x: -0.7, y: 1.1, z: 0 },
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.3, y: 0, z: 0 },
    { el: "C", x: 2.6, y: 0, z: 0 },
    { el: "C", x: 3.9, y: 0, z: 0 },
    { el: "C", x: 4.6, y: cis ? 1.1 : -1.1, z: 0 },
    { el: "H", x: 4.6, y: cis ? -1.1 : 1.1, z: 0 },
  ];
  const bonds = [[1, 2], [0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7]].map(([a1, a2]) => ({ a1, a2, order: 1 }));
  return { id: 1, at: { x: 0, y: 0 }, atoms, bonds, wholeWithoutH: false };
}

describe("a molecule in 3D drawn as a formula that cannot be laid out, kept as the plugin drew it", () => {
  it("states no odd cumulene's cis or trans other than its places': the picture's other one marked unsaid, the same one kept", async () => {
    const { formulaOf } = await import("./make3d");
    const chem = { request: async () => ({ molblock: PICTURE, perceived: true }) } as unknown as ChemClient;
    const read = async (cis: boolean) => {
      const { model } = await formulaOf(chem, triene(cis) as never, 0, MENO);
      const d = drawingOf(model);
      return { runs: readStereo(d.atoms, d.bonds).cumulated.map((r) => r.cis), either: model.bonds.filter((b) => b.stereo === "either").length };
    };
    // (places trans, picture cis: marked, none read)
    expect(await read(false)).toEqual({ runs: [], either: 1 });
    // (places cis, picture cis: kept)
    expect(await read(true)).toEqual({ runs: [true], either: 0 });
  });
});
