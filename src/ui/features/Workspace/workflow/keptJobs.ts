/**
 * A step's jobs as a workspace's file keeps them (docs/FILE-IO.md, *A
 * step's jobs*): every job of its run and of the runs it keeps - what it
 * was given, what its program wrote, and its logs - by their SHA-256, as
 * the workspace is saved. Where a job's folder is on this computer, its
 * files are listed from it (src-tauri keptjobs.rs) and added to the file
 * from the disk as it is written (`appended`); where it is not - the
 * workspace opened from a file made elsewhere - they are kept again from
 * that file: read from it by Meno as the new one is written, where it is
 * still as it was opened (`appended`, `from`); else from what was held of
 * it as it was opened (`carried`). A step's *Don't keep raw outputs* keeps only what
 * a job was given, what was read back of it, and its logs; what it leaves
 * out, or what is not to be had, each job's record names, with its size.
 */
import { fileNow, jobKept, type KeptJobFile } from "../../../../lib/jobs";
import type { Appended } from "../../../../lib/io/writeDocument";
import { JOB_FILE_MEDIA, MOST_FILE, MOST_WORKSPACE_FILE, type KeptData, type KeptFile, type MenoFile } from "../../../../lib/doc/menoFile";
import { kindInfo } from "./kinds";
import type { KeptJob, KeptJobEntry, LeftJobEntry, StepRan, WorkflowStep } from "../store/types";

/** What a save keeps of the steps' jobs. */
export type JobsKept = {
  /** Each job's record, by its id: what is kept of it, and what is not. */
  records: Map<string, KeptJob>;
  /** The files to be added from the disk, listed with the workspace's files as it is written (`files.json`). */
  listed: KeptFile[];
  appended: Appended[];
  /** The files of jobs not on this computer, kept again from what was held of the file the workspace was opened from: where that file has changed since, or it was opened with no path. */
  carried: KeptData[];
  /** About how much each step's jobs add to the file, deflated, largest first. */
  steps: { step: number; bytes: number }[];
  /** About how much they all add. */
  bytes: number;
  /** About how much those added from the disk add, deflated: what the file as the page writes it does not hold. */
  adds: number;
  /** The largest file kept, as it is: past what a workspace's file keeps of one (`MOST_FILE`), it cannot be saved as it is. */
  largest: number;
};

/** A step's jobs, of its run and the runs it keeps, each once. */
export const jobsOfStep = (s: WorkflowStep): string[] => [...new Set([s.ran, ...(s.runs ?? [])].flatMap((r) => r?.jobs ?? []))];

/** What the file a workspace was opened from kept of a job. */
const recordOf = (s: WorkflowStep, job: string): KeptJob | undefined => [s.ran, ...(s.runs ?? [])].flatMap((r) => r?.kept ?? []).find((k) => k.job === job);

/** A workspace's file opened this session, where it was: its path, and its size and when it was written as it was opened. */
export type OpenedFrom = { path: string; size: number; mtime: number | null };

/** The job files the workspace files opened this session keep, by SHA-256: each read from the file held only when wanted - and where that file is. */
const held = new Map<string, { read: () => Uint8Array | null; from?: OpenedFrom }>();

/** Holds the job files a workspace's file keeps, as it is opened - from where it was (`from`), where that is known: each read from it only when wanted. */
export function holdJobFilesOf(file: MenoFile, from?: OpenedFrom): void {
  for (const f of file.files) if (f.media === JOB_FILE_MEDIA && !held.has(f.sha256)) held.set(f.sha256, { read: () => file.data(f.sha256), ...(from ? { from } : {}) });
}

/** A job file a workspace's file opened this session keeps, as its bytes; none where none is held, or it does not read. */
export const heldJobFile = (sha256: string): Uint8Array | null => held.get(sha256)?.read() ?? null;

/** Where the workspace's file is that a job file held was opened from, where it is there still as it was opened - its size, and when it was written - so that Meno reads it from there (src-tauri keptjobs.rs); none else. */
export async function heldJobSource(sha256: string, now: (path: string) => Promise<{ size: number; mtime: number | null } | null> = (p) => fileNow(p).catch(() => null)): Promise<string | null> {
  const from = held.get(sha256)?.from;
  if (!from) return null;
  const is = await now(from.path);
  return is && is.size === from.size && is.mtime === from.mtime ? from.path : null;
}


/**
 * What a save keeps of `steps`' jobs: each job's files listed from its
 * folder (`read`) where it is on this computer, or else as the file it was
 * opened from kept them (`bytesOf`). A job with neither - its folder gone,
 * and never kept - has nothing to keep and no record.
 */
export async function jobsToKeep(
  steps: readonly WorkflowStep[],
  read: (job: string) => Promise<KeptJobFile[] | null> = jobKept,
  bytesOf: (sha256: string) => Uint8Array | null = heldJobFile,
  sourceOf: (sha256: string) => Promise<string | null> = heldJobSource,
): Promise<JobsKept> {
  const out: JobsKept = { records: new Map(), listed: [], appended: [], carried: [], steps: [], bytes: 0, adds: 0, largest: 0 };
  const seen = new Set<string>();
  for (const step of steps) {
    const raw = step.keepRaw !== false;
    let bytes = 0;
    for (const job of jobsOfStep(step)) {
      if (out.records.has(job)) continue;
      const files: KeptJobEntry[] = [];
      const left: LeftJobEntry[] = [];
      const here = await read(job).catch(() => null);
      if (here) {
        for (const f of here) {
          if (!raw && f.role === "raw") {
            left.push({ name: f.name, size: f.size, why: "raw" });
            continue;
          }
          files.push({ name: f.name, sha256: f.sha256, size: f.size, role: f.role });
          if (seen.has(f.sha256)) continue;
          seen.add(f.sha256);
          out.listed.push({ sha256: f.sha256, name: f.name, media: JOB_FILE_MEDIA, size: f.size });
          out.appended.push({ sha256: f.sha256, job, name: f.name });
          out.largest = Math.max(out.largest, f.size);
          bytes += f.deflated;
          out.adds += f.deflated;
        }
      } else {
        const was = recordOf(step, job);
        if (!was) continue;
        for (const f of was.files) {
          if (!raw && f.role === "raw") {
            left.push({ name: f.name, size: f.size, why: "raw" });
            continue;
          }
          if (seen.has(f.sha256)) {
            files.push(f);
            continue;
          }
          // (read by Meno from the file it was opened from, where that is as it was: never through the page)
          const from = await sourceOf(f.sha256);
          if (from) {
            files.push(f);
            seen.add(f.sha256);
            out.listed.push({ sha256: f.sha256, name: f.name, media: JOB_FILE_MEDIA, size: f.size });
            out.appended.push({ sha256: f.sha256, job, name: f.name, from });
            out.largest = Math.max(out.largest, f.size);
            bytes += f.size;
            out.adds += f.size;
            continue;
          }
          const data = bytesOf(f.sha256);
          if (!data) {
            left.push({ name: f.name, size: f.size, why: "not had" });
            continue;
          }
          files.push(f);
          seen.add(f.sha256);
          out.carried.push({ sha256: f.sha256, name: f.name, media: JOB_FILE_MEDIA, data });
          out.largest = Math.max(out.largest, data.length);
          bytes += data.length;
        }
        // (what that file had left out, still left out - and said)
        left.push(...(was.left ?? []).filter((l) => !left.some((x) => x.name === l.name)));
      }
      out.records.set(job, { job, files, ...(left.length ? { left } : {}) });
    }
    if (bytes) out.steps.push({ step: step.id, bytes });
    out.bytes += bytes;
  }
  out.steps.sort((a, b) => b.bytes - a.bytes);
  return out;
}

/** `steps` as a file writes them: each run's jobs with what is kept of them (`records`), and nothing else said of what was kept. */
export function withKeptJobs(steps: readonly WorkflowStep[], records: ReadonlyMap<string, KeptJob>): WorkflowStep[] {
  const ran = <R extends StepRan>(r: R): R => {
    const { kept: _, ...rest } = r;
    const kept = (r.jobs ?? []).flatMap((j) => records.get(j) ?? []);
    return (kept.length ? { ...rest, kept } : rest) as R;
  };
  return steps.map((s) => ({ ...s, ...(s.ran ? { ran: ran(s.ran) } : {}), ...(s.runs ? { runs: s.runs.map(ran) } : {}) }));
}

/** The size a save past which says the workspace is large, by default (docs/WORKFLOWS-FOUNDATION.md, answer Q), in MB. */
export const LARGE_WORKSPACE_MB = 500;

/**
 * Whether a save of `bytes` is one to say is large, past `threshold`: over
 * it, where the file it replaces - `before`, none where there is none - was
 * not; or grown by half of it, or more, since.
 */
export const takesPast = (bytes: number, before: number | null, threshold: number): boolean =>
  bytes > threshold && (before == null || before <= threshold || bytes - before >= threshold / 2);

/** What Show files says of the files it did not write back out: those there already that are not them, left as they are (`differs`); those it has not (`notHad`). None where it wrote them all. */
export function showFilesSaid(differs: readonly string[], notHad: readonly string[]): string | null {
  const list = (names: readonly string[]) => (names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`);
  const said = [
    ...(differs.length ? [`${list(differs)} ${differs.length === 1 ? "was" : "were"} there already, changed since, and left as ${differs.length === 1 ? "it is" : "they are"}.`] : []),
    ...(notHad.length ? [`${list(notHad)} ${notHad.length === 1 ? "is" : "are"} not in the workspace's file.`] : []),
  ];
  return said.length ? said.join(" ") : null;
}

/**
 * What the size warning says (LargeWorkspaceAsk): how large the file comes
 * to, past what, and its largest steps - by name, numbered where several
 * are of a kind - with what their jobs add; and the most a workspace's file
 * may come to (`most`), where it would be past it - when it cannot be saved
 * as it is.
 */
export type SizeAsk = { bytes: number; threshold: number; steps: { id: number; name: string; bytes: number }[]; most?: number };

/** How many of the largest steps the size warning names. */
const STEPS_NAMED = 3;

/**
 * The size warning a save of `steps` asks, where it takes the workspace past
 * `thresholdMB` (`takesPast`): the file as the page wrote it (`written`
 * bytes) with the job files added from the disk (`jobs`), against the file
 * it replaces (`before`, its size; none where there is none) - or where it
 * would be past what a workspace's file may come to (`most`), or keeps a
 * job file past what it keeps of one (`MOST_FILE`): then `written` may be
 * none, the file not written to be measured. None where it does not, or
 * there are no job files to leave out.
 */
export function sizeAsk(
  steps: readonly WorkflowStep[],
  jobs: Pick<JobsKept, "steps" | "adds" | "largest">,
  written: number,
  before: number | null,
  thresholdMB: number,
  most = MOST_WORKSPACE_FILE,
): SizeAsk | null {
  const bytes = written + jobs.adds;
  const threshold = thresholdMB * 2 ** 20;
  const over = bytes > most || jobs.largest > MOST_FILE;
  if (!jobs.steps.length || (!over && !takesPast(bytes, before, threshold))) return null;
  const nameOf = (id: number) => {
    const s = steps.find((x) => x.id === id)!;
    const name = kindInfo(s.kind).name;
    const same = steps.filter((x) => x.kind === s.kind);
    return same.length > 1 ? `${name} ${same.indexOf(s) + 1}` : name;
  };
  return { bytes, threshold, steps: jobs.steps.slice(0, STEPS_NAMED).map((s) => ({ id: s.step, name: nameOf(s.step), bytes: s.bytes })), ...(over ? { most } : {}) };
}

/** A size in bytes as Meno says it of a workspace: whole megabytes, or gigabytes to a tenth from one up. */
export const megabytes = (n: number) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 2 ** 20))} MB`);
