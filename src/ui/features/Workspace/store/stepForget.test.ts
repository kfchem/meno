/**
 * A step deleted takes away its jobs' folders - those of every run it
 * keeps, not its last alone - and, back by an undo, offers no log or files
 * of jobs whose folders went with it.
 */
import { describe, expect, it, vi } from "vitest";

const removed: string[] = [];
vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  stopJob: async () => {},
  jobOf: async (id: string) => ({ id, plugin: "xtb", program: "xtb", state: "done", created: 1 }),
  removeJob: async (id: string) => void removed.push(id),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";

describe("a step deleted", () => {
  it("takes away the folders of every run it keeps, and back by an undo, offers none of their logs", async () => {
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
    await vi.waitFor(() => expect([...removed].sort()).toEqual(["j1a", "j1b", "j2", "j3"]));
    // (back by an undo: its last run's jobs are not kept - their folders went with it)
    doc.undo();
    const back = st().steps.find((s) => s.id === id)!;
    expect(back.ran?.jobs).toEqual(["j3"]);
    expect(st().jobsKept(back)).toBe(false);
  });
});
