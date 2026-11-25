import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { factor } from "../../../../lib/units";
import { Growing, packed, roundSent, roundTaken, unpacked, type ShownWith } from "./growing";
import { asThePageShows } from "./pageConformers";
import { CHLOROETHANE, chloroethane, CHLOROPROPANE, chloropropane, roundOf } from "./testdata/turnedConformers";

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
    // (a third round, lower again and turned again: the first still where it was first shown - laid over that, not the lowest since)
    const third = ROUND([4], [-1], Math.PI / 3);
    g.add(third, third.energies!);
    g.shown()!.frames[2].forEach((v, i) => expect(v).toBeCloseTo(was[i], 3));
  });

  it("shows each conformer it showed after every round after the next, atom by atom as it was - only its place in the list moves", () => {
    // (chloroethane: its methyl turned, each a conformer of its own; round 2 finds a lower one, B, and S again a little lower, its
    //  H's named from another; round 3 one lower again and A again lower - by hand, A and S as first shown, the new ones after)
    const [A, S, B, C] = [chloroethane([60, 180, 300]), chloroethane([30, 150, 270]), chloroethane([120, 240, 0]), chloroethane([45, 165, 285])];
    const sAgain = chloroethane([150, 270, 30]);
    const aAgain = chloroethane([300, 60, 180]);
    const rounds = [roundOf(CHLOROETHANE, [A, S], [-100, -99.9999]), roundOf(CHLOROETHANE, [sAgain, B], [-99.99995, -100.0001]), roundOf(CHLOROETHANE, [C, aAgain], [-100.0002, -100.00001])];
    const g = new Growing(CHLOROETHANE.atoms, CHLOROETHANE.bonds, 5, { ...PLAIN, parts: [[0, 1, 2, 3, 4, 5, 6, 7]] });
    const counts: number[] = [];
    let was: Conformers | null = null;
    for (const r of rounds) {
      g.add(r, r.energies!);
      const now = g.shown()!;
      counts.push(now.frames.length);
      // (each shown before shown now, every atom within a thousandth of an angstrom of where it was, its energy its own)
      if (was)
        was.frames.forEach((f, k) => {
          const at = now.frames.findIndex((h) => h.every((v, i) => Math.abs(v - f[i]) < 1e-3));
          expect(at).toBeGreaterThanOrEqual(0);
          expect(now.energies![at]).toBe(was!.energies![k]);
        });
      was = now;
    }
    expect(counts).toEqual([2, 3, 4]);
    expect(was!.energies).toEqual([-100.0002, -100.0001, -100, -99.9999]);
  });

  it("keeps the one shown where a later round finds it again lower, its methyls named the other way round: 2-chloropropane", () => {
    const g = new Growing(CHLOROPROPANE.atoms, CHLOROPROPANE.bonds, 5, { ...PLAIN, parts: [[0, 1, 2, 3, 4]] });
    const one = roundOf(CHLOROPROPANE, [chloropropane(["C1", "C2"])], [-500]);
    g.add(one, one.energies!);
    const was = g.shown()!;
    const two = roundOf(CHLOROPROPANE, [chloropropane(["C2", "C1"])], [-500.00001]);
    g.add(two, two.energies!);
    const now = g.shown()!;
    expect(now.frames).toHaveLength(1);
    now.frames[0].forEach((v, i) => expect(v).toBeCloseTo(was.frames[0][i], 3));
    expect(now.energies).toEqual([-500]);
  });

  it("says how each round was made where they said it otherwise, round by round", () => {
    const g = new Growing(ROUND([], []).atoms, ROUND([], []).bonds, 5, PLAIN);
    const one = { ...ROUND([0], [0]), how: [{ label: "Kept", text: "10 of 10" }] };
    const two = { ...ROUND([1], [1]), how: [{ label: "Kept", text: "9 of 10" }] };
    g.add(one, one.energies!);
    g.add(two, two.energies!);
    expect(g.shown([{ label: "Rounds", text: "searching on" }])!.how?.slice(0, 2)).toEqual([
      { label: "Kept", text: "round 1: 10 of 10; round 2: 9 of 10" },
      { label: "Rounds", text: "searching on" },
    ]);
  });
});
