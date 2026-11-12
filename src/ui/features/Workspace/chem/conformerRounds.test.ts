import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { factor } from "../../../../lib/units";
import { inRounds, judgeHere, roundEnergies, roundsHow, RoundsSearch, roundSizes, RoundsSeen, roundsSaid, SEARCH_BUDGET_MS, type RoundsJudge } from "./conformerRounds";

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

  it("is judged against the lowest this round brought too: one within the window of the lowest before, not of this round's, is not new", () => {
    const seen = new RoundsSeen(ATOMS, BONDS, 2);
    expect(seen.add([geo(0)], [-76])).toBe(1);
    // (3 kcal/mol below, and 1 above the lowest before: 4 above the lowest now - not new)
    expect(seen.add([1, 2].map(geo), [-76 - 3 / KCAL, -76 + 1 / KCAL])).toBe(1);
  });

  it("keeps a conformer's mirror image new - its distances all alike, it never laid over it by reflecting it", () => {
    // (HOOH turned 110 degrees about its O-O bond, one way and the other: mirror images)
    const atoms = [
      { el: "O", charge: 0 },
      { el: "O", charge: 0 },
      { el: "H", charge: 0 },
      { el: "H", charge: 0 },
    ];
    const bonds = [
      { a1: 0, a2: 1, order: 1 as const },
      { a1: 0, a2: 2, order: 1 as const },
      { a1: 1, a2: 3, order: 1 as const },
    ];
    const turned = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      return [0, 0, 0, 1.45, 0, 0, -0.3, 0.92, 0, 1.75, 0.92 * Math.cos(t), 0.92 * Math.sin(t)];
    };
    const seen = new RoundsSeen(atoms, bonds, 2);
    expect(seen.add([turned(110)], [-151])).toBe(1);
    expect(seen.add([turned(-110)], [-151])).toBe(1);
    expect(seen.add([turned(110), turned(-110)], [-151, -151])).toBe(0);
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

  it("does not end on a round that brings no conformer at all, before any is made: none new is judged against some", async () => {
    const p = plugin([[], [0], [0]], () => 0);
    expect((await inRounds(p.ask, { first: 10, most: 5000, window: 3, draws: true })).run).toEqual({ tried: 40, rounds: 3, ended: "settled" });
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

  it("lets its judge go when it ends - and when a round fails", async () => {
    let ended = 0;
    const judge = (c: Conformers): RoundsJudge => {
      const j = judgeHere(c.atoms, c.bonds, 3);
      return { add: j.add, end: () => void ended++ };
    };
    await inRounds(plugin([[0], [0]], () => 0).ask, { first: 10, most: 5000, window: 3, draws: true }, judge);
    expect(ended).toBe(1);
    const p = plugin([[0], [1]], () => 0);
    const failing = async (count: number, draw: number) => {
      if (draw > 0) throw new Error("the search gave nothing for a round");
      return p.ask(count, draw);
    };
    await expect(inRounds(failing, { first: 10, most: 5000, window: 3, draws: true }, judge)).rejects.toThrow("gave nothing");
    expect(ended).toBe(2);
  });

  it("says how each round was made: a line every round said alike once, one of its own each round's in turn - never one round's for the whole", async () => {
    const p = plugin([[0], [1], [1]], () => 0);
    const ask = async (count: number, draw: number) => ({ ...(await p.ask(count, draw)), how: [{ label: "Embedded", text: "ETKDG" }, { label: "Kept", text: `${count} of ${count}` }] });
    const { made: m, run } = await inRounds(ask, { first: 10, most: 5000, window: 3, draws: true });
    expect(run.rounds).toBe(3);
    expect(m.how).toEqual([
      { label: "Embedded", text: "ETKDG" },
      { label: "Kept", text: "round 1: 10 of 10; round 2: 10 of 10; round 3: 20 of 20" },
    ]);
    // (one round: its own lines as they were; a line one round did not say, said so)
    expect(roundsHow([[{ label: "Kept", text: "5 of 5" }], [{ label: "Kept", text: "5 of 5" }, { label: "Pruned", text: "1" }]])).toEqual([
      { label: "Kept", text: "5 of 5" },
      { label: "Pruned", text: "round 1: none said; round 2: 1" },
    ]);
    const once = await inRounds(ask, { first: 10, most: 5000, window: 3, draws: false });
    expect(once.made.how).toEqual([{ label: "Embedded", text: "ETKDG" }, { label: "Kept", text: "10 of 10" }]);
  });

  it("goes a round at a time, told after each it goes on from, and ends where it is stopped - what came kept", async () => {
    const p = plugin([[0], [1], [2], [3]], () => 0);
    const told: number[] = [];
    let stop = false;
    const search = new RoundsSearch(p.ask, { first: 10, most: 5000, window: 3, draws: true, stopped: () => stop });
    expect(await search.next()).toBe(true);
    expect([search.rounds, search.tried, search.made?.frames.length]).toEqual([1, 10, 1]);
    expect(await search.next()).toBe(true);
    stop = true;
    expect(await search.next()).toBe(false);
    expect(search.ended).toBe("stopped");
    expect(search.result()).toMatchObject({ run: { tried: 20, rounds: 2, ended: "stopped" } });
    expect(search.result().made.frames).toEqual([0, 1].map(geo));
    // (once ended, asked nothing more)
    expect(await search.next()).toBe(false);
    expect(p.asked).toHaveLength(2);
    // (inRounds told after each round it goes on from)
    await inRounds(plugin([[0], [1], [1]], () => 0).ask, { first: 10, most: 5000, window: 3, draws: true, onRound: (_, so) => told.push(so.rounds) });
    expect(told).toEqual([1, 2]);
    expect(roundsSaid({ tried: 20, rounds: 2, ended: "stopped" }, { window: 3, most: 5000 })).toBe("2 rounds, 20 tried: stopped, what came kept");
  });

  it("always asks its first round, stopped or not; and a round after it that fails ends it failed, saying why - or stopped, where it was asked to stop", async () => {
    const p = plugin([[0], [1]], () => 0);
    const stopped = new RoundsSearch(p.ask, { first: 10, most: 5000, window: 3, draws: true, stopped: () => true });
    expect(await stopped.next()).toBe(true);
    expect(await stopped.next()).toBe(false);
    expect(stopped.result().run).toEqual({ tried: 10, rounds: 1, ended: "stopped" });
    let stop = false;
    const failing = new RoundsSearch(async (n, draw) => (draw ? Promise.reject(new Error("the plugin's worker stopped")) : p.ask(n, draw)), { first: 10, most: 5000, window: 3, draws: true, stopped: () => stop });
    await failing.next();
    await failing.next().catch(() => failing.failed());
    expect(failing.result().run).toEqual({ tried: 10, rounds: 1, ended: "failed" });
    // (said failed, not why: what a plugin's library says is none of the chemist's to read)
    expect(roundsSaid(failing.result().run, { window: 3, most: 5000 })).toBe("1 round, 10 tried: a round failed, what came kept");
    // (stopped as the round was under way: its plugin stopped with it - stopped, not failed)
    const asked = new RoundsSearch(
      async (n, draw) => {
        if (!draw) return p.ask(n, draw);
        stop = true;
        throw new Error("killed");
      },
      { first: 10, most: 5000, window: 3, draws: true, stopped: () => stop },
    );
    await asked.next();
    await asked.next().catch(() => asked.failed());
    expect(asked.result().run).toEqual({ tried: 10, rounds: 1, ended: "stopped" });
  });

  it("is held to the time its rounds take, not the time it waits between them; and to what others sharing its time leave it", async () => {
    let clock = 0;
    const p = plugin([[0], [1], [2], [3]], () => 0);
    const ask = async (count: number, draw: number) => {
      clock += count * 1000;
      return p.ask(count, draw);
    };
    const search = new RoundsSearch(ask, { first: 10, most: 5000, window: 3, draws: true, budget: 30_000, now: () => clock });
    await search.next();
    // (an hour waited before it goes on: not its time - its next round, 10 s more, ends at 20 s)
    clock += 3_600_000;
    expect(await search.next()).toBe(true);
    expect(search.spent).toBe(20_000);
    // (the next, 20 tries, would end at 40 s: past 30)
    expect(await search.next()).toBe(false);
    expect(search.ended).toBe("time");
    // (a time worked out as each round is to start: what another has left it)
    let others = 0;
    const shared = new RoundsSearch(ask, { first: 10, most: 5000, window: 3, draws: true, budget: () => 30_000 - others, now: () => clock });
    await shared.next();
    others = 15_000;
    expect(await shared.next()).toBe(false);
    expect(shared.ended).toBe("time");
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
