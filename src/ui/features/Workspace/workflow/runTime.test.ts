import { describe, expect, it } from "vitest";
import { runTook } from "./runTime";

describe("how long a step's run took", () => {
  const H = 3_600_000;
  it("is from the first of its jobs starting to the last ending", () => {
    expect(runTook([{ started: 100, ended: 400 }, { started: 150, ended: 900 }], [{}, {}], 50, 5_000)).toBe(800);
  });

  it("counts only the jobs this run ran, not those taken up again from a run before", () => {
    // (two reused, from two days before; one run now, for forty minutes)
    const now = 50 * H;
    const records = [
      { started: 1 * H, ended: 2 * H },
      { started: 2 * H, ended: 3 * H },
      { started: 48 * H, ended: 48 * H + 40 * 60_000 },
    ];
    const jobs = [{ reused: true }, { reused: true }, {}];
    expect(runTook(records, jobs, 48 * H - 1000, now)).toBe(40 * 60_000);
  });

  it("is from the run's beginning, where every job was taken up again or none says when it ran", () => {
    expect(runTook([{ started: 1, ended: 2 }], [{ reused: true }], 1_000, 1_250)).toBe(250);
    expect(runTook([null, { started: null, ended: null }], [{}, {}], 1_000, 1_400)).toBe(400);
  });
});
