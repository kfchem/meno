import { describe, expect, it, vi } from "vitest";

/** What was asked of the jobs: those stopped, and those taken away. */
const asked = { stopped: [] as string[], removed: [] as string[] };

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  stopJob: async (id: string) => void asked.stopped.push(id),
  jobOf: async (id: string) => ({ id, plugin: "confsweep", program: "confsweep", state: "stopped", created: 0 }),
  removeJob: async (id: string) => void asked.removed.push(id),
  listJobs: async () => [],
}));

const { connectStoreToDocument, createEditorStore } = await import(".");
const { createWorkspaceDocument } = await import("../document");
const { setRunning } = await import("../workflow/model");

/** A canvas with an Input set wired into a step whose job runs - as a run leaves it, amended, no step to undo. */
function running() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const step = st().addStep("conformers", "confsweep", 10, 0);
  st().connect({ set }, step);
  const run = { at: 1, input: "k", options: {}, jobs: [{ id: "job-1", entries: [0], reads: [] }], kind: "conformers" as const };
  doc.amend((d) => setRunning(d, step, run), { unsaved: true });
  return { doc, st, step };
}

/**
 * While a step ran, Cmd+Z took away the wire into it and then the step
 * itself, its job going on for a step that was gone. Deleting a running
 * step asks first and stops it; an undo that takes one away now does the
 * same (the maintainer, 2026-10-12).
 */
describe("an undo that would take away a running step", () => {
  it("is held, and asked about, where it takes the step away - not where it takes only its wire", () => {
    const { doc, st, step } = running();
    expect(st().holdUndo(-1)).toBe(false);
    doc.undo();
    expect(st().wires).toHaveLength(0);
    const depth = doc.history().undoDepth;
    expect(st().holdUndo(-1)).toBe(true);
    expect(st().askUndo).toEqual({ by: -1, steps: 1 });
    expect(st().steps.map((s) => s.id)).toEqual([step]);
    expect(doc.history().undoDepth).toBe(depth);
  });

  it("leaves the history where it was when the question is cancelled", () => {
    const { doc, st, step } = running();
    doc.undo();
    st().holdUndo(-1);
    st().letUndo(false);
    expect(st().askUndo).toBeNull();
    expect(st().steps.map((s) => s.id)).toEqual([step]);
    expect(asked.stopped).not.toContain("job-1");
  });

  it("stops the step's jobs, as deleting it does, and then undoes, when it is answered yes", async () => {
    const { doc, st } = running();
    doc.undo();
    st().holdUndo(-1);
    st().letUndo(true);
    expect(st().askUndo).toBeNull();
    expect(st().steps).toHaveLength(0);
    await vi.waitFor(() => expect(asked.stopped).toContain("job-1"));
  });

  it("is held too where a redo would take it away: a delete undone, the step run again", () => {
    const { doc, st, step } = running();
    // (deleted once asked, then undone: back without its jobs - and run again)
    st().removeStep(step, true);
    doc.undo();
    const run = { at: 2, input: "k", options: {}, jobs: [{ id: "job-2", entries: [0], reads: [] }], kind: "conformers" as const };
    doc.amend((d) => setRunning(d, step, run), { unsaved: true });
    expect(st().holdUndo(1)).toBe(true);
    expect(st().askUndo).toEqual({ by: 1, steps: 1 });
  });
});

/**
 * The title bar's history goes many steps back at once, and its Undo one: a
 * running step those would take away is asked about once, as the keys ask,
 * and stopped when it is answered yes.
 */
describe("many steps back at once that would take away a running step", () => {
  it("is held and asked about once, where the steps come to a page without it", () => {
    const { doc, st, step } = running();
    const depth = doc.history().undoDepth;
    expect(st().holdUndo(-2)).toBe(true);
    expect(st().askUndo).toEqual({ by: -2, steps: 1 });
    expect(st().steps.map((s) => s.id)).toEqual([step]);
    expect(doc.history().undoDepth).toBe(depth);
  });

  it("goes all the way back in one change, the step's jobs stopped first, when it is answered yes", async () => {
    const { doc, st } = running();
    const depth = doc.history().undoDepth;
    st().holdUndo(-2);
    st().letUndo(true);
    expect(st().steps).toHaveLength(0);
    expect(doc.history().undoDepth).toBe(depth - 2);
    await vi.waitFor(() => expect(asked.stopped).toContain("job-1"));
  });
});
