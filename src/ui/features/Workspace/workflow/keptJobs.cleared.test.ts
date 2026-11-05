import { describe, expect, it } from "vitest";
import type { KeptJobFile } from "../../../../lib/jobs";
import type { WorkflowStep } from "../store/types";
import { clearableJobs, clearSavedJobs, heldJobSource, jobsToKeep, recordOf } from "./keptJobs";

// A job's folder taken away once a workspace's file holds all of it (docs/WORKFLOWS.md, *A job's folder*) - and the next
// save keeping its files all the same, from the file just written.
const J1 = "0b6f5c1e-0000-4000-8000-000000000011";
const J2 = "0b6f5c1e-0000-4000-8000-000000000012";
const sha = (c: string) => c.repeat(64);
const folder = (tag: "a" | "b"): KeptJobFile[] => [
  { name: "work/job.inp", size: 100, sha256: sha(tag === "a" ? "1" : "2"), deflated: 60, role: "input" },
  { name: "work/job.out", size: 1000, sha256: sha(tag === "a" ? "3" : "4"), deflated: 200, role: "read" },
  { name: "work/job.tmp", size: 5000, sha256: sha(tag === "a" ? "5" : "6"), deflated: 4000, role: "raw" },
  { name: "log.txt", size: 10, sha256: sha(tag === "a" ? "7" : "8"), deflated: 8, role: "log" },
];
const step = (id: number, jobs: string[], more: Partial<WorkflowStep> = {}): WorkflowStep => ({ id, kind: "optimise", x: 0, y: 0, ran: { at: 1, ok: true, said: "done", input: "in", jobs }, ...more });
const SAVED = "/work/page.meno";
const AS_SAVED = { size: 12345, mtime: 1700000000 };

describe("a job's folder, once the workspace's file holds all of it", () => {
  it("may go only where every file of it was added from it - not where its raw outputs were left out", async () => {
    const kept = await jobsToKeep([step(1, [J1]), step(2, [J2], { keepRaw: false })], async (j) => folder(j === J1 ? "a" : "b"));
    expect(clearableJobs(kept)).toEqual([J1]);
  });

  it("is taken away after the save, and the next save keeps its files all the same, from the file just written", async () => {
    const steps = [step(1, [J1])];
    const kept = await jobsToKeep(steps, async () => folder("a"));
    const removed: string[] = [];
    expect(await clearSavedJobs(SAVED, kept, async () => AS_SAVED, async (j) => void removed.push(j))).toEqual([J1]);
    expect(removed).toEqual([J1]);
    // (its record held for the session, as a file opened keeps one)
    expect(recordOf(steps[0], J1)).toEqual(kept.records.get(J1));
    // (saved again, its folder gone: every file read by Meno from the file just written, where that is as it was)
    const again = await jobsToKeep(steps, async () => null, () => null, (s) => heldJobSource(s, async () => AS_SAVED));
    expect(again.records.get(J1)).toEqual(kept.records.get(J1));
    expect(again.appended.map((a) => [a.name, a.from])).toEqual(folder("a").map((f) => [f.name, SAVED]));
    // (that file changed since: not read from it - said not to be had, never taken from a file it no longer is)
    const changed = await jobsToKeep(steps, async () => null, () => null, (s) => heldJobSource(s, async () => ({ ...AS_SAVED, size: 1 })));
    expect(changed.records.get(J1)?.left?.map((l) => [l.name, l.why])).toEqual(folder("a").map((f) => [f.name, "not had"]));
  });

  it("is kept where the file just written cannot be looked at, and where taking it away is refused", async () => {
    const kept = await jobsToKeep([step(1, [J2])], async () => folder("b"));
    const removed: string[] = [];
    expect(await clearSavedJobs(SAVED, kept, async () => null, async (j) => void removed.push(j))).toEqual([]);
    expect(removed).toEqual([]);
    expect(await clearSavedJobs(SAVED, kept, async () => AS_SAVED, async () => Promise.reject(new Error("it has not finished")))).toEqual([]);
  });
});
