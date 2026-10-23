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
