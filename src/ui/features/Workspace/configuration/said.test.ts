import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { readingOf } from "./changes";
import { atomSaid, bondSaid } from "./said";

// Part 15, phase 4: what a look states, said where the pointer rests (docs/EDITOR-2D.md, *What a look states*).

/** Butan-2-ol drawn flat: C2 (id 1) with its methyl (2), its ethyl's CH2 (3) and CH3 (5), and its OH (4) on bond 12, as `stereo` says. */
function butanol(stereo?: "up" | "down" | "wavy", display?: "bold" | "dashed"): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1, ...(display ? { display } : {}) },
      { id: 12, a: 1, b: 4, order: 1, ...(stereo ? { stereo, narrow: 1 } : {}) },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  };
}
const none = () => undefined;
const r = (key: string) => (key === "centre-1" ? "R" : undefined);

describe("what a look states, where the pointer rests (part 15, phase 4)", () => {
  it("a wedge: the centre it is narrow at, with its R or S where the drawing shows one", () => {
    const m = butanol("up");
    expect(bondSaid(m, readingOf(m), 12, r)).toBe("C1: R, by this wedge");
    expect(bondSaid(m, readingOf(m), 12, none)).toBe("C1: set, by this wedge");
  });

  it("a centre: its R or S, set, or open on a wavy bond; any other atom says nothing", () => {
    const m = butanol("up");
    expect(atomSaid(m, readingOf(m), 1, r)).toBe("C1: R");
    expect(atomSaid(m, readingOf(m), 1, none)).toBe("C1: set");
    expect(atomSaid(m, readingOf(m), 3, none)).toBeNull();
    const w = butanol("wavy");
    expect(atomSaid(w, readingOf(w), 1, none)).toBe("C1: open");
    expect(bondSaid(w, readingOf(w), 12, none)).toBe("a wavy bond: C1 open");
  });

  it("a bold or dashed line on a flat drawing states no configuration; a plain bond says nothing", () => {
    for (const [display, words] of [
      ["bold", "a bold line: no configuration"],
      ["dashed", "a dashed line: no configuration"],
    ] as const) {
      const m = butanol(undefined, display);
      expect(bondSaid(m, readingOf(m), 11, none), display).toBe(words);
    }
    const m = butanol();
    expect(bondSaid(m, readingOf(m), 10, none)).toBeNull();
  });

  it("follows the drawing as it is edited: the wedge turned to a hash, the same words of the other descriptor", () => {
    const up = butanol("up");
    const down = butanol("down");
    const s = (key: string) => (key === "centre-1" ? "S" : undefined);
    expect(bondSaid(up, readingOf(up), 12, r)).toBe("C1: R, by this wedge");
    expect(bondSaid(down, readingOf(down), 12, s)).toBe("C1: S, by this wedge");
  });
});
