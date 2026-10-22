/**
 * A step deleted takes no job's folder away - another step may have taken
 * a job up again, and a copy of the workspace saved elsewhere names the
 * same jobs: they go when finished jobs are cleared. Back by an undo, its
 * jobs' logs and files are offered still.
 */
import { describe, expect, it, vi } from "vitest";

const removed: string[] = [];
const stopped: string[] = [];
vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  stopJob: async (id: string) => void stopped.push(id),
  jobOf: async (id: string) => ({ id, plugin: "xtb", program: "xtb", state: "done", created: 1 }),
  removeJob: async (id: string) => void removed.push(id),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

describe("a step deleted", () => {
  it("takes away the folder of none of its runs' jobs, and back by an undo, offers their logs still", async () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const id = st().addStep("optimise", "xtb", 0, 0);
    const run = (at: number, jobs: string[]) => ({ at, ok: true, said: "done", input: "k", jobs, kind: "optimise" as const });
    doc.edit("ran", (d) => ({
      ...d,
      steps: d.steps!.map((s) => (s.id === id ? { ...s, ran: run(3, ["j3"]), runs: [run(1, ["j1a", "j1b"]), run(2, ["j2"]), run(3, ["j3"])] } : s)),
    }));
    expect(st().jobsKept(st().steps.find((s) => s.id === id)!)).toBe(true);
    st().removeStep(id);
    await new Promise((go) => setTimeout(go, 20));
    expect(removed).toEqual([]);
    // (ended runs' jobs: nothing to stop)
    expect(stopped).toEqual([]);
    doc.undo();
    const back = st().steps.find((s) => s.id === id)!;
    expect(back.ran?.jobs).toEqual(["j3"]);
    expect(st().jobsKept(back)).toBe(true);
  });
});
