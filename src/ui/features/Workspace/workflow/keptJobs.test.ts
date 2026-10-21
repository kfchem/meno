import { describe, expect, it } from "vitest";
import type { KeptJobFile } from "../../../../lib/jobs";
import { JOB_FILE_MEDIA, menoFileBytes, readMenoFile } from "../../../../lib/doc/menoFile";
import type { WorkflowStep } from "../store/types";
import { heldJobFile, holdJobFilesOf, jobsOfStep, jobsToKeep, takesPast, withKeptJobs } from "./keptJobs";

const J1 = "0b6f5c1e-0000-4000-8000-000000000001";
const J2 = "0b6f5c1e-0000-4000-8000-000000000002";
const J3 = "0b6f5c1e-0000-4000-8000-000000000003";
const sha = (c: string) => c.repeat(64);

/** A job's folder as src-tauri keptjobs.rs lists it: what it was given, what was read back, its log, and a scratch file. */
const folder = (tag: "a" | "b"): KeptJobFile[] => [
  { name: "work/job.inp", size: 100, sha256: sha(tag === "a" ? "1" : "2"), deflated: 60, role: "input" },
  { name: "work/job.out", size: 1000, sha256: sha("e"), deflated: 200, role: "read" },
  { name: "work/job.tmp", size: 5000, sha256: sha(tag), deflated: 4000, role: "raw" },
  { name: "log.txt", size: 10, sha256: sha("f"), deflated: 8, role: "log" },
];

const step = (id: number, jobs: string[], more: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id,
  kind: "optimise",
  x: 0,
  y: 0,
  ran: { at: 1, ok: true, said: "done", input: "in", jobs },
  ...more,
});

describe("what a save keeps of the steps' jobs", () => {
  it("keeps every file of a job on this computer, each once however many jobs share it, and says about how much each step adds", async () => {
    const steps = [step(1, [J1]), step(2, [J2])];
    const kept = await jobsToKeep(steps, async (j) => folder(j === J1 ? "a" : "b"));
    expect(kept.records.get(J1)).toEqual({ job: J1, files: folder("a").map(({ deflated: _, ...f }) => f) });
    // (the output and the log alike in both jobs: listed and added once)
    expect(kept.appended.map((a) => [a.job, a.name])).toEqual([
      [J1, "work/job.inp"],
      [J1, "work/job.out"],
      [J1, "work/job.tmp"],
      [J1, "log.txt"],
      [J2, "work/job.inp"],
      [J2, "work/job.tmp"],
    ]);
    expect(kept.listed.every((f) => f.media === JOB_FILE_MEDIA)).toBe(true);
    expect(kept.steps).toEqual([
      { step: 1, bytes: 60 + 200 + 4000 + 8 },
      { step: 2, bytes: 60 + 4000 },
    ]);
    expect(kept.bytes).toBe(4268 + 4060);
  });

  it("with Don't keep raw outputs, keeps what a job was given, what was read back and its logs, and names each file left out with its size", async () => {
    const kept = await jobsToKeep([step(1, [J1], { keepRaw: false })], async () => folder("a"));
    expect(kept.records.get(J1)!.files.map((f) => f.name)).toEqual(["work/job.inp", "work/job.out", "log.txt"]);
    expect(kept.records.get(J1)!.left).toEqual([{ name: "work/job.tmp", size: 5000, why: "raw" }]);
    expect(kept.appended.map((a) => a.name)).not.toContain("work/job.tmp");
  });

  it("keeps the jobs of the runs a step keeps as well as its last, whatever was kept of their results", async () => {
    const s = step(1, [J1], { runs: [{ at: 0, ok: true, said: "done", input: "in", kind: "optimise", jobs: [J2] }] });
    expect(jobsOfStep(s)).toEqual([J1, J2]);
    const kept = await jobsToKeep([s], async () => folder("a"));
    expect([...kept.records.keys()]).toEqual([J1, J2]);
  });

  it("keeps again, from the file it was opened from, a job not on this computer - and says what is not to be had", async () => {
    const opened = step(1, [J3]);
    opened.ran!.kept = [
      {
        job: J3,
        files: [
          { name: "work/job.out", sha256: sha("1"), size: 3, role: "read" },
          { name: "work/gone.bin", sha256: sha("2"), size: 7, role: "raw" },
        ],
        left: [{ name: "work/big.tmp", size: 9, why: "raw" }],
      },
    ];
    const bytes = new Map([[sha("1"), new Uint8Array([1, 2, 3])]]);
    const kept = await jobsToKeep([opened], async () => null, (s) => bytes.get(s) ?? null);
    expect(kept.records.get(J3)).toEqual({
      job: J3,
      files: [{ name: "work/job.out", sha256: sha("1"), size: 3, role: "read" }],
      left: [
        { name: "work/gone.bin", size: 7, why: "not had" },
        { name: "work/big.tmp", size: 9, why: "raw" },
      ],
    });
    expect(kept.carried).toEqual([{ sha256: sha("1"), name: "work/job.out", media: JOB_FILE_MEDIA, data: new Uint8Array([1, 2, 3]) }]);
    expect(kept.appended).toEqual([]);
  });

  it("keeps nothing, and says nothing, of a job neither on this computer nor kept before", async () => {
    const kept = await jobsToKeep([step(1, [J1])], async () => null);
    expect(kept.records.size).toBe(0);
    expect(withKeptJobs([step(1, [J1])], kept.records)[0].ran).toEqual(step(1, [J1]).ran);
  });

  it("writes each run's record afresh: an old one, of a file opened, is not written where this save keeps none", () => {
    const opened = step(1, [J1]);
    opened.ran!.kept = [{ job: J1, files: [{ name: "log.txt", sha256: sha("1"), size: 1, role: "log" }] }];
    expect(withKeptJobs([opened], new Map())[0].ran!.kept).toBeUndefined();
    const record = { job: J1, files: [{ name: "log.txt", sha256: sha("2"), size: 2, role: "log" as const }] };
    expect(withKeptJobs([opened], new Map([[J1, record]]))[0].ran!.kept).toEqual([record]);
  });

  it("holds the job files a workspace's file keeps, as it is opened, read only if they are what their SHA-256 says", () => {
    const data = new TextEncoder().encode("kept");
    const real = "5d0e1f0e9f1d6a5c1c5e2a0f4c9c3f8b0a5b1f6b2e5d4c8a9f7e6d5c4b3a2918";
    const bytes = menoFileBytes("{}", [{ sha256: real, name: "work/a.out", media: JOB_FILE_MEDIA, data }]);
    holdJobFilesOf(readMenoFile(bytes));
    // (the SHA-256 forged: not what the bytes are, so none)
    expect(heldJobFile(real)).toBeNull();
  });
});

describe("a workspace's file with its jobs' files", () => {
  it("lists the files to be added from the disk with the rest, and deflates those it carries", async () => {
    const enc = new TextEncoder();
    const out = enc.encode("SCF DONE ".repeat(5000));
    const { sha256Hex } = await import("../../../../lib/binary/sha256");
    const carried = { sha256: sha256Hex(out), name: "work/run.out", media: JOB_FILE_MEDIA, data: out };
    const bytes = menoFileBytes("{}", [carried], [{ sha256: sha("9"), name: "work/run.chk", media: JOB_FILE_MEDIA, size: 12345 }]);
    const file = readMenoFile(bytes);
    expect(file.files.map((f) => [f.name, f.size])).toEqual([
      ["work/run.out", out.length],
      ["work/run.chk", 12345],
    ]);
    expect(file.data(carried.sha256)).toEqual(out);
    // (deflated: the file far smaller than the output it carries)
    expect(bytes.length).toBeLessThan(out.length / 10);
    // (one listed but not yet added: nothing to read)
    expect(file.data(sha("9"))).toBeNull();
    holdJobFilesOf(file);
    expect(heldJobFile(carried.sha256)).toEqual(out);
  });
});

describe("the size warning", () => {
  const T = 500 * 2 ** 20;
  it("says so when a save takes the workspace past the threshold, and not again while it stays past", () => {
    expect(takesPast(T + 1, T, T)).toBe(true);
    expect(takesPast(T + 1, null, T)).toBe(true);
    expect(takesPast(T + 1, T + 5, T)).toBe(false);
    expect(takesPast(T, 0, T)).toBe(false);
  });
});
