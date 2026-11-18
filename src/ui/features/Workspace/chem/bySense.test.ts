/**
 * Of conformers made of a stereoisomer that gives an axis or an odd run its configuration - Meno's own, never the plugin's to give:
 * its toolkit embeds either way - Meno keeps those that have it (chem/pageMirror `bySense`), says how many it set aside, and reads
 * each kept frame back (`notKept`).
 */
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { bySense, notKept } from "./pageMirror";

// (penta-2,3-diene: C0 C1=C2=C3 C4, its axis between C1 and C3, its refs C0 and C4 - each frame its two ends' methyls turned one way)
const frame = (turn: 1 | -1) => [-1, 1, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.6, 0, turn];
const axis = (sense: 1 | -1) => ({ centres: [], doubles: [], axes: [{ atoms: [1, 3] as [number, number], refs: [0, 4] as [number, number], sense }] });
const allene: Model = {
  atoms: ["C", "C", "C", "C", "C"].map((el, i) => ({ id: i + 1, el, x: 1.3 * i, y: 0, r: 0.9 })),
  bonds: [[1, 2, 1], [2, 3, 2], [3, 4, 2], [4, 5, 1]].map(([a, b, order], k) => ({ id: 10 + k, a, b, order: order as 1 | 2 })),
};

describe("conformers kept by the sense of an axis asked for", () => {
  const c = { frames: [frame(1), frame(-1), frame(1)], energies: [-1, -2, -3], how: [] };
  // (frame(1) turns its methyls +, as IUPAC signs a torsion: clockwise, looking from C1 to C3)
  const up = 1 as const;

  it("keeps the frames whose axis turns as asked, with their energies, and says how many it set aside", () => {
    const kept = bySense(c, axis(up))!;
    expect(kept.frames).toHaveLength(2);
    expect(kept.energies).toEqual([-1, -3]);
    expect(kept.how).toEqual([{ label: "Stereo", text: "1 of 3 embedded with the other configuration at its axis or run: set aside" }]);
    const other = bySense(c, axis(-1))!;
    expect([other.frames.length, other.energies, other.how]).toEqual([1, [-2], [{ label: "Stereo", text: "2 of 3 embedded with the other configuration at its axis or run: set aside" }]]);
  });

  it("none that has it: null - that stereoisomer cannot be made in 3D; none asked: as made", () => {
    expect(bySense({ frames: [frame(1)], how: [] }, axis(-1))).toBeNull();
    expect(bySense(c, { centres: [], doubles: [] })).toBe(c);
  });

  it("reads an axis back: named where a frame turns it the other way", () => {
    expect(notKept({ frames: [frame(1)] }, allene, axis(up))).toEqual([]);
    expect(notKept({ frames: [frame(-1)] }, allene, axis(up))).toEqual(["C2~C4"]);
  });

  it("keeps a butatriene's frames whose run is cis or trans as asked", () => {
    // (hexa-2,3,4-triene: C0 C1=C2=C3=C4 C5, its run between C1 and C4, its refs C0 and C5 - on one side, or across)
    const run = (side: 1 | -1) => [-1, 1, 0, 0, 0, 0, 1.3, 0, 0, 2.6, 0, 0, 3.9, 0, 0, 4.9, side, 0];
    const cis = (asked: boolean) => ({ centres: [], doubles: [], cumulated: [{ atoms: [1, 4] as [number, number], refs: [0, 5] as [number, number], cis: asked }] });
    const made = { frames: [run(1), run(-1)], energies: [-1, -2], how: [] };
    expect(bySense(made, cis(true))!.energies).toEqual([-1]);
    expect(bySense(made, cis(false))!.energies).toEqual([-2]);
  });
});
