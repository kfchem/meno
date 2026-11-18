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

  it("takes no other structure's last read: two triols side by side, syn and anti, the syn one dragged keeps its own labels", () => {
    // (pentane-2,3,4-triol, and1 on C2 and C4, C3 wedged in no group: C2 and C4 syn, C3 a centre - "and1" at each; anti, C3 none -
    //  "and enantiomer" beneath)
    const triol = (first: number, dx: number, c4: "up" | "down") => {
      const at = (id: number, x: number, y: number, el = "C", extra = {}) => ({ id: first + id, x: dx + x * L * 0.866, y: y * L, el, ...extra });
      const and1 = { stereoGroup: { kind: "and" as const, n: 1 } };
      const atoms: Atom[] = [at(1, 0, 0), at(2, 1, 0.5, "C", and1), at(3, 2, 0), at(4, 3, 0.5, "C", and1), at(5, 4, 0), at(6, 1, 1.5, "O"), at(7, 2, -1, "O"), at(8, 3, 1.5, "O")];
      const bonds: Bond[] = [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
        { a1: 3, a2: 4, order: 1 },
        { a1: 1, a2: 5, order: 1, stereo: "up", narrow: 1 },
        { a1: 2, a2: 6, order: 1, stereo: "up", narrow: 2 },
        { a1: 3, a2: 7, order: 1, stereo: c4, narrow: 3 },
      ];
      return { atoms, bonds };
    };
    const syn = triol(0, 0, "up");
    const anti = triol(100, 20 * L, "down");
    const atoms = [...syn.atoms, ...anti.atoms];
    const bonds = [...syn.bonds, ...anti.bonds.map((b) => ({ ...b, a1: b.a1 + 8, a2: b.a2 + 8 }))];
    const o = acsWorldOptions([], [], { units: "world" });
    const kept = structureLayouts();
    const said = (t: { text: string }[]) => [t.filter((x) => x.text === "and1").length, t.filter((x) => x.text === "and enantiomer").length];
    expect(said(layoutByStructure(atoms, bonds, o, 40, kept).texts)).toEqual([2, 1]);
    // (the syn one's end atom dragged: its labels stay its own at every frame)
    for (let f = 1; f <= 3; f++) {
      const moved = atoms.map((a, i) => (i === 4 ? { ...a, y: a.y + f * 0.02 } : a));
      expect(said(layoutByStructure(moved, bonds, o, 40, kept, [], true).texts), `frame ${f}`).toEqual([2, 1]);
    }
  });
});
