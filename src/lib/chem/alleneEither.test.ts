import { describe, expect, it } from "vitest";
import { unspecifiedDoubles, type Atom, type Bond } from "./layout2d";

const wavyOf = (atoms: Atom[], bonds: Bond[]) => unspecifiedDoubles(atoms, bonds).flatMap((b, k) => (b.stereo === "wavy" ? [k] : []));

describe("an allene's bond marked either is no odd run's: no wavy bond is drawn for it", () => {
  // C0=C1=C2, C0 with two groups (3, 4) and C2 with two groups (5, 6); C0=C1 marked either. An allene has an axis, not a cis or trans: only
  // an odd run's double bond is taken across the run to its far end.
  const atoms: Atom[] = [[0, 0], [1.3, 0], [2.6, 0], [-0.7, 1.1], [-0.7, -1.1], [3.3, 1.1], [3.3, -1.1]].map(([x, y], i) => ({ id: i, x, y, el: "C" }));
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 2, stereo: "either" },
    { a1: 1, a2: 2, order: 2 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
    { a1: 2, a2: 5, order: 1 },
    { a1: 2, a2: 6, order: 1 },
  ];
  it("puts no wavy bond on the groups of the allene's end", () => {
    expect(wavyOf(atoms, bonds)).toEqual([]);
  });
  it("nor marked on its other double bond", () => {
    const other = bonds.map((b, k) => (k === 0 ? { ...b, stereo: undefined } : k === 1 ? { ...b, stereo: "either" as const } : b));
    expect(wavyOf(atoms, other)).toEqual([]);
  });
});

describe("a run's bond marked either is taken across the whole run: odd or even counted end to end, from whichever of its bonds is marked", () => {
  /** A straight run of `n` cumulated double bonds along x, each end with two groups; bond `marked` of the run marked either. */
  const run = (n: number, marked: number) => {
    const atoms: Atom[] = Array.from({ length: n + 1 }, (_, i) => ({ id: i, x: 1.3 * i, y: 0, el: "C" }));
    const bonds: Bond[] = Array.from({ length: n }, (_, i) => ({ a1: i, a2: i + 1, order: 2, ...(i === marked ? { stereo: "either" as const } : {}) }));
    const group = (on: number, x: number, y: number) => {
      atoms.push({ id: atoms.length, x, y, el: "C" });
      bonds.push({ a1: on, a2: atoms.length - 1, order: 1 });
    };
    group(0, -0.7, 1.1);
    group(0, -0.7, -1.1);
    group(n, 1.3 * n + 0.7, 1.1);
    group(n, 1.3 * n + 0.7, -1.1);
    return { atoms, bonds };
  };
  it("a butatriene marked on its middle bond is drawn as one marked on an end bond: an end's two groups wavy", () => {
    const end = run(3, 0);
    const middle = run(3, 1);
    expect(wavyOf(end.atoms, end.bonds)).toEqual([3, 4]);
    expect(wavyOf(middle.atoms, middle.bonds)).toEqual([3, 4]);
  });
  it("a run of four, even, has an axis: marked on any of its bonds, no wavy bond", () => {
    for (const k of [0, 1, 2, 3]) {
      const r = run(4, k);
      expect(wavyOf(r.atoms, r.bonds), `bond ${k}`).toEqual([]);
    }
  });
});
