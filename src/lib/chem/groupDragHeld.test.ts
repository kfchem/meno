import { describe, expect, it, vi } from "vitest";
import * as drawn from "../layout/drawn";
import { acsWorldOptions, NOMINAL_BOND_LENGTH as L } from "./acs";
import { layoutByStructure, structureLayouts } from "./layoutStructures";
import type { Atom, Bond } from "./layout2d";

vi.mock("../layout/drawn", async (importOriginal) => {
  const real = await importOriginal<typeof import("../layout/drawn")>();
  return { ...real, readStereo: vi.fn(real.readStereo) };
});

// The front end never lags: a structure with an AND group and a wedge outside it, an atom of it dragged, reads its configuration once as
// the drag ends - never at each frame of it.

/** A chain of `n` carbons, an and1 pair on its second and fifth, an OH wedged on every third. */
function chain(n: number): { atoms: Atom[]; bonds: Bond[] } {
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  for (let k = 0; k < n; k++) atoms.push({ id: k + 1, x: k * L * 0.866, y: k % 2 ? L / 2 : 0, el: "C", ...(k === 1 || k === 4 ? { stereoGroup: { kind: "and" as const, n: 1 } } : {}) });
  for (let k = 0; k < n - 1; k++) bonds.push({ a1: k, a2: k + 1, order: 1 });
  for (let k = 1; k < n - 1; k += 3) {
    atoms.push({ id: atoms.length + 1, x: k * L * 0.866, y: k % 2 ? 1.5 * L : -L, el: "O" });
    bonds.push({ a1: k, a2: atoms.length - 1, order: 1, stereo: "up", narrow: k });
  }
  return { atoms, bonds };
}

describe("a grouped, wedged structure dragged", () => {
  it("reads its configuration at no frame of the drag, and once as it ends", () => {
    const { atoms, bonds } = chain(30);
    const o = acsWorldOptions([], [], { units: "world" });
    const kept = structureLayouts();
    const read = vi.mocked(drawn.readStereo);
    const at = (f: number) => atoms.map((a, i) => (i === 29 ? { ...a, y: a.y + f * 0.02 } : a));
    layoutByStructure(atoms, bonds, o, 40, kept);
    const before = read.mock.calls.length;
    const frames = [1, 2, 3, 4, 5].map(at);
    for (const f of frames) layoutByStructure(f, bonds, o, 40, kept, [], true);
    expect(read.mock.calls.length).toBe(before);
    // (let go where it was last dragged to - the same drawing as its last frame: laid out again, read once)
    const ended = layoutByStructure(frames[4], bonds, o, 40, kept, [], false);
    expect(read.mock.calls.length).toBe(before + 1);
    expect(ended.texts.filter((t) => t.text === "and1")).toHaveLength(2);
  });
});
