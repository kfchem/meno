import { describe, expect, it } from "vitest";
import { readWorkflow } from "./saved";

/** A workflow of one step, running the jobs given, as a file keeps it. */
const running = (ids: string[]) => ({
  sets: [],
  steps: [{ id: 1, kind: "optimise", x: 0, y: 0, by: "xtb", running: { at: 1, input: "k", options: {}, jobs: ids.map((id) => ({ id, entries: [0], reads: [] })) } }],
  wires: [],
});

describe("a running step's jobs, as a file keeps them", () => {
  it("are taken up by their ids as Meno names them - its label, path-safe, and eight hex - or as it did, a UUID", () => {
    const ids = ["water-optimise-3f9a2c1d", "a-render-0011aabb", "4f1c2a9e-0b7d-4e55-9a3c-2f8e1d6b7a10"];
    expect(readWorkflow(running(ids))!.steps[0].running!.jobs.map((j) => j.id)).toEqual(ids);
    // (anything else is no job of Meno's: a path, capitals, a hyphen at either end or two together)
    for (const bad of ["../water-3f9a2c1d", "Water-3f9a2c1d", "water--x-3f9a2c1d", "-water-3f9a2c1d", "water-3F9A2C1D", "water optimise-3f9a2c1d"])
      expect(readWorkflow(running([bad]))!.steps[0].running).toBeUndefined();
  });
});

describe("how a run's jobs ended, as a file keeps them", () => {
  const job = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const statesOf = (states: unknown, jobs = [job(1), job(2), job(3)]) =>
    readWorkflow({ sets: [], wires: [], steps: [{ id: 1, kind: "optimise", by: "xtb", x: 0, y: 0, ran: { at: 1, ok: false, said: "", input: "", jobs, states } }] })!.steps[0].ran!.states;

  it("reads one for each job, each a job's state - and anything else as none", () => {
    expect(statesOf(["done", "failed", "gone"])).toEqual(["done", "failed", "gone"]);
    // (one too few, one too many: none - one out of place would say a job's state of another)
    expect(statesOf(["done", "failed"])).toBeUndefined();
    expect(statesOf(["done", "failed", "done", "done"])).toBeUndefined();
    // (a state no job has, or not a word at all: none)
    expect(statesOf(["done", "exploded", "failed"])).toBeUndefined();
    expect(statesOf(["done", 3, "failed"])).toBeUndefined();
    expect(statesOf("done")).toBeUndefined();
    // (a run of one job keeps none)
    expect(statesOf(["done"], [job(1)])).toBeUndefined();
  });
});
