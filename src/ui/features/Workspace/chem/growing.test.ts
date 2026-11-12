import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { factor } from "../../../../lib/units";
import { Growing, packed, roundSent, roundTaken, unpacked, type ShownWith } from "./growing";
import { asThePageShows } from "./pageConformers";

/** A 3D structure's search going on (chem/growing): its rounds as they are sent to a worker, and what the page shows of them. */

const KCAL = factor("Eh", "kcal/mol");
/** A bent O(-C)-C, its second carbon at `k` along; turned by `turn` radians about z - each k a conformer of its own: three heavy atoms, to be laid over one another by. */
const bent = (k: number, turn = 0): number[] => {
  const xyz = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + 0.4 * k, 0.1 * k];
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return xyz.map((v, i) => (i % 3 === 0 ? c * v - s * xyz[i + 1] : i % 3 === 1 ? s * xyz[i - 1] + c * v : v));
};
const ROUND = (ks: number[], kcal: number[], turn = 0): Conformers =>
  ({
    atoms: [{ el: "O", charge: 0 }, { el: "C", charge: 0 }, { el: "C", charge: 0 }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: ks.map((k) => bent(k, turn)),
    energies: kcal.map((e) => -76 + e / KCAL),
    field: "MMFF94",
    cip: { atoms: {}, bonds: {} },
    how: [{ label: "Embedded", text: "ETKDG v3" }],
  }) as unknown as Conformers;
/** It leaves nothing open, and is one part: nothing to choose, nothing to check, nothing to set side by side. */
const PLAIN: ShownWith = { open: { drawn: { atoms: [], bonds: [] }, configured: { atoms: {}, bonds: {} }, left: { atoms: [], bonds: [] } } as unknown as ShownWith["open"], checks: null, parts: [[0, 1, 2]], reflect: false };

describe("a round sent to its worker", () => {
  it("is its frames packed in one buffer, read back as they were, the rest of it with them", () => {
    const frames = [bent(0), bent(1), bent(2)];
    expect(unpacked(packed(frames), 9)).toEqual(frames);
    expect(unpacked(packed([]), 0)).toEqual([]);
    const got = ROUND([0, 1], [0, 1]);
    const { round, transfer } = roundSent(got, got.energies!);
    expect(transfer).toEqual([round.frames.buffer, round.energies.buffer]);
    expect(roundTaken(round)).toEqual({ got, energies: got.energies });
  });
});

describe("what the page shows of a search going on", () => {
  it("is its rounds so far made the page's, as all of them at once would be, how each round was made said", () => {
    const g = new Growing(ROUND([], []).atoms, ROUND([], []).bonds, 5, PLAIN);
    expect(g.shown()).toBeNull();
    const first = ROUND([0, 1], [0, 1]);
    expect(g.add(first, first.energies!)).toBe(2);
    const second = ROUND([1, 2], [1, 2]);
    expect(g.add(second, second.energies!)).toBe(1);
    const shown = g.shown([{ label: "Rounds", text: "searching on" }])!;
    const whole = asThePageShows({ ...first, frames: [...first.frames, ...second.frames], energies: [...first.energies!, ...second.energies!], how: [{ label: "Embedded", text: "ETKDG v3" }, { label: "Rounds", text: "searching on" }] });
    expect(shown.frames).toEqual(whole.frames);
    expect(shown.energies).toEqual(whole.energies);
    expect(shown.how).toEqual(whole.how);
  });

  it("stays where it was first shown: a lower conformer a later round finds lies over the first one shown, not the first over it", () => {
    const g = new Growing(ROUND([], []).atoms, ROUND([], []).bonds, 5, PLAIN);
    const first = ROUND([0], [1]);
    g.add(first, first.energies!);
    const was = g.shown()!.frames[0];
    // (a lower one, turned a quarter about z as it came)
    const lower = ROUND([2], [0], Math.PI / 2);
    g.add(lower, lower.energies!);
    const now = g.shown()!;
    // (the lowest first, the first shown after it where it was)
    expect(now.energies).toEqual([lower.energies![0], first.energies![0]]);
    now.frames[1].forEach((v, i) => expect(v).toBeCloseTo(was[i], 3));
    // (and the lowest laid over it, not turned a quarter away: its O-C along x as the first's)
    expect(Math.abs(now.frames[0][4] - now.frames[0][1])).toBeLessThan(0.2);
  });
});
