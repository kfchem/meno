import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { factor } from "../../../../lib/units";
import { inRounds, roundEnergies, roundSizes, RoundsSeen, roundsSaid, SEARCH_BUDGET_MS } from "./conformerRounds";

const KCAL = factor("Eh", "kcal/mol");
const ATOMS = [
  { el: "O", charge: 0 },
  { el: "H", charge: 0 },
  { el: "H", charge: 0 },
];
const BONDS = [
  { a1: 0, a2: 1, order: 1 as const },
  { a1: 0, a2: 2, order: 1 as const },
];
/** A water's geometry `k`: its second hydrogen further along - each `k` a conformer of its own. */
const geo = (k: number) => [0, 0, 0, 1, 0, 0, -0.3, 0.95 + k * 0.4, 0];
/** Conformers `ks` of the water, each `kcal[k]` above -76 Eh. */
const made = (ks: number[], kcal: (k: number) => number, extra: Partial<Conformers> = {}): Conformers =>
  ({ atoms: ATOMS, bonds: BONDS, frames: ks.map(geo), energies: ks.map((k) => -76 + kcal(k) / KCAL), field: "MMFF94", ...extra }) as Conformers;

describe("the rounds of a conformer search", () => {
  it("are the first, as many again, then each twice the one before - the last kept to the most", () => {
    expect(roundSizes(50, 5000)).toEqual([50, 50, 100, 200, 400, 800, 1600, 1800]);
    expect(roundSizes(50, 5000).reduce((s, n) => s + n, 0)).toBe(5000);
    expect(roundSizes(300, 500)).toEqual([300, 200]);
    expect(roundSizes(10, 10)).toEqual([10]);
  });

  it("are judged by the molecule's energies, else its model's - none where neither is one for each frame", () => {
    expect(roundEnergies({ frames: [[0], [0]], energies: [1, 2], modelEnergies: [3, 4] })).toEqual([1, 2]);
    expect(roundEnergies({ frames: [[0], [0]], modelEnergies: [3, 4] })).toEqual([3, 4]);
    expect(roundEnergies({ frames: [[0], [0]], energies: [1] })).toBeNull();
  });
});

describe("what is new in a round", () => {
  it("is a conformer within the window of the lowest so far - this round's among them - that none before is", () => {
    const seen = new RoundsSeen(ATOMS, BONDS, 2);
    const kcal = (k: number) => [0, 1, 1.5, 5, -1][k];
    // (the first round: 0, 1 and 1.5 within 2 kcal/mol; 3, 5 up, not)
    expect(seen.add([0, 1, 2, 3].map(geo), [0, 1, 2, 3].map((k) => -76 + kcal(k) / KCAL))).toBe(3);
    // (the same again: none new - nor one twice in a round, nor one outside)
    expect(seen.add([0, 1, 1, 3].map(geo), [0, 1, 1, 3].map((k) => -76 + kcal(k) / KCAL))).toBe(0);
    // (one lower: new, as the lowest; those found before are not new again)
    expect(seen.add([4, 0].map(geo), [4, 0].map((k) => -76 + kcal(k) / KCAL))).toBe(1);
    // (a geometry moved by less than the same conformer's: not new)
    expect(seen.add([geo(0).map((v, i) => (i === 7 ? v + 0.001 : v))], [-76])).toBe(0);
  });

  it("is none where no energy is a number", () => {
    expect(new RoundsSeen(ATOMS, BONDS, 2).add([geo(0)], [Number.NaN])).toBe(0);
  });
});

describe("a search in rounds", () => {
  /** A plugin whose draw `d` gives conformers `pools[d]`, each `kcal[k]` up; the rounds it was asked, as [count, draw]. */
  function plugin(pools: number[][], kcal: (k: number) => number, extra: Partial<Conformers> = {}) {
    const asked: [number, number][] = [];
    const ask = async (count: number, draw: number) => {
      asked.push([count, draw]);
      return made(pools[Math.min(draw, pools.length - 1)], kcal, extra);
    };
    return { asked, ask };
  }

  it("ends where a round brings none new, every conformer made kept in the order made", async () => {
    const p = plugin([[0, 1], [2, 0], [1, 2]], (k) => k);
    const { made: m, run } = await inRounds(p.ask, { first: 50, most: 5000, window: 3, draws: true });
    expect(p.asked).toEqual([
      [50, 0],
      [50, 1],
      [100, 2],
    ]);
    expect(run).toEqual({ tried: 200, rounds: 3, ended: "settled" });
    expect(m.frames).toEqual([0, 1, 2, 0, 1, 2].map(geo));
    expect(m.energies).toHaveLength(6);
  });

  it("asks the second round however much the first found: none new is never judged on one round", async () => {
    const p = plugin([[0], [0]], () => 0);
    expect((await inRounds(p.ask, { first: 10, most: 5000, window: 3, draws: true })).run).toEqual({ tried: 20, rounds: 2, ended: "settled" });
  });

  it("ends at the most it tries, each round bringing a new one", async () => {
    const p = plugin([[0], [1], [2], [3], [4]], () => 0);
    const { run } = await inRounds(p.ask, { first: 10, most: 40, window: 3, draws: true });
    expect(p.asked).toEqual([
      [10, 0],
      [10, 1],
      [20, 2],
    ]);
    expect(run).toEqual({ tried: 40, rounds: 3, ended: "most" });
  });

  it("ends where the next round, as long for each try as those before, would take it past its time", async () => {
    let clock = 0;
    const p = plugin([[0], [1], [2], [3]], () => 0);
    // (each try a second: 10, then 10 more - 20 s; the next, 20 tries, would end at 40 s, past 30 s)
    const ask = async (count: number, draw: number) => {
      clock += count * 1000;
      return p.ask(count, draw);
    };
    const { run } = await inRounds(ask, { first: 10, most: 5000, window: 3, draws: true, budget: 30_000, now: () => clock });
    expect(run).toEqual({ tried: 20, rounds: 2, ended: "time" });
  });

  it("is asked once where its search gives no other conformers for another draw, or none of them has an energy", async () => {
    const once = plugin([[0], [1]], () => 0);
    expect((await inRounds(once.ask, { first: 50, most: 5000, window: 3, draws: false })).run).toEqual({ tried: 50, rounds: 1, ended: "one" });
    const none = plugin([[0], [1]], () => 0, { energies: undefined });
    expect((await inRounds(none.ask, { first: 50, most: 5000, window: 3, draws: true })).run).toEqual({ tried: 50, rounds: 1, ended: "unjudged" });
  });

  it("says how it ended", () => {
    const o = { window: 2.5, most: 5000, budget: SEARCH_BUDGET_MS };
    expect(roundsSaid({ tried: 400, rounds: 3, ended: "settled" }, o)).toBe("3 rounds, 400 tried: the last brought no new conformer within 2.5 kcal/mol of the lowest");
    expect(roundsSaid({ tried: 5000, rounds: 8, ended: "most" }, o)).toBe("8 rounds, 5,000 tried: the most it tries (5,000)");
    expect(roundsSaid({ tried: 1200, rounds: 5, ended: "time" }, o)).toBe("5 rounds, 1,200 tried: the 10 minutes a search takes at most");
    expect(roundsSaid({ tried: 50, rounds: 1, ended: "one" }, o)).toBe("1 round, 50 tried: its search gives no other conformers to a round after");
    expect(roundsSaid({ tried: 50, rounds: 1, ended: "unjudged" }, o)).toBe("1 round, 50 tried: no energies came with them to tell a new conformer by");
  });
});

describe("a Conformers step asked for as many as the molecule needs, in rounds", () => {
  it("needs its window - its own, else Settings' - where its plugin's search takes draws; not where it takes none, nor for a number of the chemist's own", async () => {
    const { roundsNeed } = await import("../workflow/doers");
    const { WITHIN_NEEDED } = await import("../../../../lib/chem/conformersSought");
    const needed = { sought: "needed", count: 200, within: Number.NaN, first: 0, most: 5000 };
    expect(roundsNeed("conformers", true, needed)).toBe(WITHIN_NEEDED);
    expect(roundsNeed("conformers", true, { ...needed, within: 2.5 })).toBeUndefined();
    expect(roundsNeed("conformers", false, needed)).toBeUndefined();
    expect(roundsNeed("conformers", true, { ...needed, sought: "fixed" })).toBeUndefined();
    expect(roundsNeed("optimise", true, needed)).toBeUndefined();
  });
});
