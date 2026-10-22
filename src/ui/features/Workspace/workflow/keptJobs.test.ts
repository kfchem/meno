import { describe, expect, it } from "vitest";
import type { KeptJobFile } from "../../../../lib/jobs";
import { JOB_FILE_MEDIA, menoFileBytes, MOST_FILE, MOST_WORKSPACE_FILE, readMenoFile } from "../../../../lib/doc/menoFile";
import type { WorkflowStep } from "../store/types";
import { readFileSync } from "node:fs";
import { heldJobFile, heldJobSource, holdJobFilesOf, jobsOfStep, jobsToKeep, showFilesSaid, sizeAsk, takesPast, withKeptJobs } from "./keptJobs";

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
    expect(kept.adds).toBe(4268 + 4060);
    expect(kept.largest).toBe(5000);
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

  it("has Meno read a job's files again from the file it was opened from, where that is as it was - never through the page", async () => {
    const opened = step(1, [J3]);
    opened.ran!.kept = [{ job: J3, files: [{ name: "work/job.out", sha256: sha("1"), size: 3, role: "read" }] }];
    const bytes = new Map([[sha("1"), new Uint8Array([1, 2, 3])]]);
    const there = await jobsToKeep([opened], async () => null, (s) => bytes.get(s) ?? null, async () => "/work/opened.meno");
    expect(there.appended).toEqual([{ sha256: sha("1"), job: J3, name: "work/job.out", from: "/work/opened.meno" }]);
    expect(there.listed.map((f) => f.sha256)).toEqual([sha("1")]);
    expect(there.carried).toEqual([]);
    expect(there.adds).toBe(3);
    // (that file changed or gone since: kept from what was held of it as it was opened)
    const changed = await jobsToKeep([opened], async () => null, (s) => bytes.get(s) ?? null, async () => null);
    expect(changed.appended).toEqual([]);
    expect(changed.carried.map((c) => c.sha256)).toEqual([sha("1")]);
  });

  it("reads again from where a file was opened only while it is there as it was", async () => {
    const data = new TextEncoder().encode("kept");
    const { sha256Hex } = await import("../../../../lib/binary/sha256");
    const real = sha256Hex(data);
    holdJobFilesOf(readMenoFile(menoFileBytes("{}", [{ sha256: real, name: "work/b.out", media: JOB_FILE_MEDIA, data }])), { path: "/w/a.meno", size: 10, mtime: 5 });
    expect(await heldJobSource(real, async () => ({ size: 10, mtime: 5 }))).toBe("/w/a.meno");
    expect(await heldJobSource(real, async () => ({ size: 10, mtime: 6 }))).toBeNull();
    expect(await heldJobSource(real, async () => ({ size: 11, mtime: 5 }))).toBeNull();
    expect(await heldJobSource(real, async () => null)).toBeNull();
    expect(await heldJobSource(sha("7"), async () => ({ size: 10, mtime: 5 }))).toBeNull();
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
    // (past it already, and grown by half of it or more since: said again)
    expect(takesPast(T + T / 2 + 10, T + 10, T)).toBe(true);
    expect(takesPast(T + T / 2 + 9, T + 10, T)).toBe(false);
  });

  it("refuses, offering only to keep no raw outputs, a workspace past what a workspace file may come to - however large it was before", () => {
    const MB = 2 ** 20;
    const steps = [step(1, [J1])];
    const jobs = { steps: [{ step: 1, bytes: 1200 * MB }], adds: 1200 * MB, largest: 600 * MB };
    expect(sizeAsk(steps, jobs, 10 * MB, 1100 * MB, 500)).toMatchObject({ bytes: 1210 * MB, most: MOST_WORKSPACE_FILE });
    // (under it: no `most`, a warning only)
    expect(sizeAsk(steps, { ...jobs, adds: 600 * MB }, 10 * MB, null, 500)!.most).toBeUndefined();
    // (one job file past what a workspace's file keeps of one - deflating well, or not yet written to be measured: refused all the same)
    expect(sizeAsk(steps, { ...jobs, adds: 300 * MB, largest: MOST_FILE + 1 }, 0, 2 * MB, 500)).toMatchObject({ most: MOST_WORKSPACE_FILE });
  });

  it("holds the same most as the save that refuses one past it (src-tauri keptjobs.rs)", () => {
    const rust = readFileSync(new URL("../../../../../src-tauri/src/keptjobs.rs", import.meta.url), "utf8");
    const most = /pub const MOST_WORKSPACE_FILE: u64 = 1 << (\d+);/.exec(rust);
    expect(most && 2 ** Number(most[1])).toBe(MOST_WORKSPACE_FILE);
  });

  it("names the largest steps, numbered where several are of a kind, with the file the page wrote and the job files added from the disk", () => {
    const MB = 2 ** 20;
    const steps = [step(1, [J1]), step(2, [J2]), step(3, [J3], { kind: "conformers" })];
    const jobs = { steps: [{ step: 2, bytes: 400 * MB }, { step: 3, bytes: 90 * MB }, { step: 1, bytes: 20 * MB }], adds: 510 * MB, largest: 300 * MB };
    expect(sizeAsk(steps, jobs, 10 * MB, null, 500)).toEqual({
      bytes: 520 * MB,
      threshold: 500 * MB,
      steps: [
        { id: 2, name: "Optimise 2", bytes: 400 * MB },
        { id: 3, name: "Conformers", bytes: 90 * MB },
        { id: 1, name: "Optimise 1", bytes: 20 * MB },
      ],
    });
    // (the file there past it already; or under the threshold Settings says; or no job files to leave out: nothing asked)
    expect(sizeAsk(steps, jobs, 10 * MB, 600 * MB, 500)).toBeNull();
    expect(sizeAsk(steps, jobs, 10 * MB, null, 1000)).toBeNull();
    expect(sizeAsk(steps, { steps: [], adds: 0, largest: 0 }, 900 * MB, null, 500)).toBeNull();
  });
});

describe("what Show files says of what it did not write back out", () => {
  it("names each file left as it was, and each the workspace's file does not hold; nothing where it wrote them all", () => {
    expect(showFilesSaid([], [])).toBeNull();
    expect(showFilesSaid(["work/a.out"], [])).toBe("work/a.out was there already, changed since, and left as it is.");
    expect(showFilesSaid(["a", "b"], ["c", "d", "e", "f"])).toBe("a, b were there already, changed since, and left as they are. c, d, e and 1 more are not in the workspace's file.");
  });
});
