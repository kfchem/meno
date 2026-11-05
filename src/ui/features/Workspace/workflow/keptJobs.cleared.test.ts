import { describe, expect, it } from "vitest";
import type { ClearedSaved, KeptJobFile } from "../../../../lib/jobs";
import type { WorkflowStep } from "../store/types";
import { clearableJobs, clearSavedJobs, heldJobSource, jobsToKeep, recordOf, type JobsKept } from "./keptJobs";

// A job's folder moved to the Trash once a workspace's file holds all of it, read back (docs/WORKFLOWS.md, *A job's
// folder*) - and the next save keeping its files all the same, from the file just written. The backend that reads the
// file back and moves the folders (src-tauri keptjobs.rs `job_clear_saved`, tested there) stood in for.
const J1 = "0b6f5c1e-0000-4000-8000-000000000011";
const J2 = "0b6f5c1e-0000-4000-8000-000000000012";
const J3 = "0b6f5c1e-0000-4000-8000-000000000013";
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

/** The backend, as asked: every job asked for gone - or those `left`, each why - and what it was asked. */
function backend(left: Record<string, { why: string; quiet?: boolean }> = {}, at: ClearedSaved["at"] = AS_SAVED) {
  const asked: { path: string; jobs: { job: string; files: { name: string; sha256: string; size: number }[] }[] }[] = [];
  const clear = async (path: string, jobs: (typeof asked)[number]["jobs"]): Promise<ClearedSaved> => {
    asked.push({ path, jobs });
    return { gone: jobs.map((j) => j.job).filter((j) => !left[j]), left: Object.entries(left).map(([job, l]) => ({ job, why: l.why, quiet: l.quiet ?? false })), at };
  };
  return { asked, clear };
}

describe("a job's folder, once the workspace's file holds all of it", () => {
  it("may go only where every file of it was added from it - not where its raw outputs were left out", async () => {
    const kept = await jobsToKeep([step(1, [J1]), step(2, [J2], { keepRaw: false })], async (j) => folder(j === J1 ? "a" : "b"));
    expect(clearableJobs(kept)).toEqual([J1]);
  });

  it("may not go where any one of its files - not only all - is kept again from another file, the save not holding it from its folder", async () => {
    const kept = await jobsToKeep([step(1, [J1])], async () => folder("a"));
    expect(clearableJobs(kept)).toEqual([J1]);
    // (one file of four from the file it was opened from: not cleared)
    const one: JobsKept = { ...kept, appended: kept.appended.map((a, k) => (k === 0 ? { ...a, from: "/elsewhere/opened.meno" } : a)) };
    expect(clearableJobs(one)).toEqual([]);
    // (one file of four not appended at all: not cleared)
    expect(clearableJobs({ ...kept, appended: kept.appended.slice(1) })).toEqual([]);
  });

  it("may not go where its record holds no file at all", async () => {
    const kept = await jobsToKeep([step(1, [J1])], async () => folder("a"));
    const empty: JobsKept = { ...kept, records: new Map([[J1, { job: J1, files: [] }]]) };
    expect(clearableJobs(empty)).toEqual([]);
  });

  it("is asked of the backend with every file of its record - name, SHA-256, size - and the path saved to", async () => {
    const kept = await jobsToKeep([step(1, [J1])], async () => folder("a"));
    const b = backend();
    await clearSavedJobs(SAVED, kept, b.clear);
    expect(b.asked).toEqual([{ path: SAVED, jobs: [{ job: J1, files: folder("a").map(({ name, sha256, size }) => ({ name, sha256, size })) }] }]);
  });

  it("goes, and the next save keeps its files all the same, from the file just written as it was read back", async () => {
    const steps = [step(1, [J1])];
    const kept = await jobsToKeep(steps, async () => folder("a"));
    expect(await clearSavedJobs(SAVED, kept, backend().clear)).toEqual({ gone: [J1], said: null });
    // (its record held for the session, as a file opened keeps one)
    expect(recordOf(steps[0], J1)).toEqual(kept.records.get(J1));
    // (saved again, its folder gone: every file read by Meno from the file just written, where that is as it was)
    const again = await jobsToKeep(steps, async () => null, () => null, (s) => heldJobSource(s, async () => AS_SAVED));
    expect(again.records.get(J1)).toEqual(kept.records.get(J1));
    expect(again.appended.map((a) => [a.name, a.from])).toEqual(folder("a").map((f) => [f.name, SAVED]));
    // (that file changed since - moved, or written by another - not read from it: said not to be had, never taken from a file it no longer is)
    const changed = await jobsToKeep(steps, async () => null, () => null, (s) => heldJobSource(s, async () => ({ ...AS_SAVED, size: 1 })));
    expect(changed.records.get(J1)?.left?.map((l) => [l.name, l.why])).toEqual(folder("a").map((f) => [f.name, "not had"]));
    // (and, gone, never asked to go again: its files now kept from the file, not its folder)
    expect(clearableJobs(again)).toEqual([]);
  });

  it("stays, nothing noted of it, where the backend leaves it - the file not holding it whole as read back, or it not finished", async () => {
    const steps = [step(1, [J2]), step(2, [J3])];
    const kept = await jobsToKeep(steps, async (j) => (j === J2 ? folder("b") : folder("a").map((f) => ({ ...f, sha256: f.sha256.replace(/./g, "9") }))));
    const b = backend({ [J2]: { why: "the file saved does not hold its work/job.out" }, [J3]: { why: "it has not finished", quiet: true } });
    expect(await clearSavedJobs(SAVED, kept, b.clear)).toEqual({ gone: [], said: "A job's folder was kept, though the workspace was saved: the file saved does not hold its work/job.out." });
    // (never noted as gone: its folder read from as before, its files never looked for in the file)
    expect(recordOf(steps[0], J2)).toBeUndefined();
    expect(await heldJobSource(sha("2"), async () => AS_SAVED)).toBeNull();
  });

  it("stays, nothing noted, where the backend fails or cannot read the file back - said once, however many jobs", async () => {
    const steps = [step(1, [J1]), step(2, [J2])];
    const kept = await jobsToKeep(steps, async (j) => folder(j === J1 ? "a" : "b"));
    const failed = await clearSavedJobs(SAVED, kept, async () => Promise.reject(new Error("the file saved could not be read back")));
    expect(failed).toEqual({ gone: [], said: "2 jobs' folders were kept, though the workspace was saved: Error: the file saved could not be read back." });
    // (the backend saying a job went, but not what the file was as it read it back: none noted)
    const unsure = await clearSavedJobs(SAVED, kept, backend({}, null).clear);
    expect(unsure.gone).toEqual([]);
    // (one it was never asked about, said gone: not noted)
    const stray = await clearSavedJobs(SAVED, { ...kept, records: new Map([[J1, kept.records.get(J1)!]]) }, async () => ({ gone: [J1, J2], left: [], at: AS_SAVED }));
    expect(stray.gone).toEqual([J1]);
  });
});
