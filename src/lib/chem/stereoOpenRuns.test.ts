import { describe, expect, it } from "vitest";
import { cumulatedRuns, openCumulenes, type StereoBond } from "./stereoOpen";

/**
 * `cumulatedRuns` as it was before the core's runs (perception/stereo/runs) were written: the open double bonds joined wherever two share
 * an atom. Kept here, until it is deleted with this test, to show the grouping written over the core's runs gives the same answer.
 */
function before(bonds: readonly StereoBond[], open: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const i of [...open].sort((p, q) => p - q)) {
    const ends = new Set([bonds[i].a, bonds[i].b]);
    const joined = runs.filter((r) => r.some((j) => ends.has(bonds[j].a) || ends.has(bonds[j].b)));
    for (const r of joined) runs.splice(runs.indexOf(r), 1);
    runs.push([...new Set([i, ...joined.flat()])].sort((p, q) => p - q));
  }
  return runs.sort((p, q) => p[0] - q[0]);
}

/**
 * A small random structure: chains of single and double bonds with branches, no atom bonded beyond a carbon's four (so none with three
 * double bonds), numbered at random, and its bonds listed in random order.
 */
function made(seed: number): StereoBond[] {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const n = 4 + Math.floor(rand() * 12);
  const bonds: StereoBond[] = [];
  const valence = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const to = rand() < 0.75 ? i - 1 : Math.floor(rand() * i);
    const order = rand() < 0.55 && valence[to] <= 2 ? 2 : 1;
    if (valence[to] + order > 4) continue;
    bonds.push({ a: i, b: to, order });
    valence[i] += order;
    valence[to] += order;
  }
  const label = [...Array(n).keys()].sort(() => rand() - 0.5);
  const shuffled = bonds.map((b) => (rand() < 0.5 ? { a: label[b.a], b: label[b.b], order: b.order } : { a: label[b.b], b: label[b.a], order: b.order }));
  return shuffled.sort(() => rand() - 0.5);
}

describe("the open cumulated double bonds as their runs, over the core's runs", () => {
  it("gives the same groups as before on 5000 made structures: every cumulated double bond open, and a random part of them", () => {
    let seen = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const bonds = made(seed);
      const all = openCumulenes(bonds, bonds.flatMap((b, i) => (b.order === 2 ? [i] : [])));
      if (!all.length) continue;
      seen++;
      expect(cumulatedRuns(bonds, all), `seed ${seed}, all`).toEqual(before(bonds, all));
      const some = all.filter((_, k) => (seed * 7 + k * 13) % 3 !== 0);
      expect(cumulatedRuns(bonds, some), `seed ${seed}, some`).toEqual(before(bonds, some));
    }
    // (enough of them have a run to say so)
    expect(seen).toBeGreaterThan(1000);
  });
});
