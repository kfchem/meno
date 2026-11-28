/**
 * A step's jobs as a workspace's file keeps them (docs/FILE-IO.md, *A
 * step's jobs*): every job of its run and of the runs it keeps - what it
 * was given, what its program wrote, and its logs - by their SHA-256, as
 * the workspace is saved. Where a job's folder is on this computer, its
 * files are listed from it (src-tauri keptjobs.rs) and added to the file
 * from the disk as it is written (`appended`); where it is not - the
 * workspace opened from a file made elsewhere - they are kept again from
 * wherever Meno finds them whole (src-tauri keptjobs.rs `job_files_where`):
 * the file saved to before, as it is now, whoever wrote it; a copy kept
 * beside it; a file it was opened from or saved to this session; its job's
 * folder - each taken only if it is what its SHA-256 says (`appended`,
 * `from`). Only one found nowhere is sent from what the page holds of it,
 * one file at a time, each set down by Meno before the save is written
 * (`staged`); never all of them at once. A step's *Don't keep raw outputs* keeps only what
 * a job was given, what was read back of it, and its logs; what it leaves
 * out, or what is not to be had, each job's record names, with its size.
 */
import { readTextFile } from "@tauri-apps/plugin-fs";
import { clearSavedFolders, fileNow, jobFilesWhere, jobKept, stageJobFile, unstageJobFiles, writeJobBack, type AskedJobFile, type ClearedSaved, type FoundJobFile, type KeptJobFile } from "../../../../lib/jobs";
import type { Appended } from "../../../../lib/io/writeDocument";
import { JOB_FILE_MEDIA, MOST_FILE, MOST_WORKSPACE_FILE, type KeptFile, type MenoFile } from "../../../../lib/doc/menoFile";
import { kindInfo } from "./kinds";
import type { KeptJob, KeptJobEntry, LeftJobEntry, StepRan, WorkflowStep } from "../store/types";

/** What a save keeps of the steps' jobs. */
export type JobsKept = {
  /** Each job's record, by its id: what is kept of it, and what is not. */
  records: Map<string, KeptJob>;
  /** The files to be added from the disk, listed with the workspace's files as it is written (`files.json`). */
  listed: KeptFile[];
  appended: Appended[];
  /** Where the files Meno found nowhere are set down, sent from what the page holds of them one at a time (`stageJobFile`): the save's own, none where none is. */
  staged: string | null;
  /** Those files, to be sent once the save is to be written (`sendPieces`) - never before the size warning is answered: each by its SHA-256 and name, read only as it is sent. */
  pending: Piece[];
  /** How many job files this save could have from nowhere - not in the file, or anywhere Meno looked, and held of nothing by the page: each recorded as not had, and said (`jobFilesNotHadSaid`). */
  notHad: number;
  /** About how much each step's jobs add to the file, deflated, largest first. */
  steps: { step: number; bytes: number }[];
  /** About how much they all add. */
  bytes: number;
  /** About how much those added from the disk add, deflated: what the file as the page writes it does not hold. */
  adds: number;
  /** The largest file kept, as it is: past what a workspace's file keeps of one (`MOST_FILE`), it cannot be saved as it is. */
  largest: number;
  /** About how much each file kept comes to in the file, deflated, by SHA-256: held for the next save, where its folder goes once this one holds it. */
  packed: Map<string, number>;
};

/** A file found nowhere but in what the page holds of it: read only as it is sent. */
export type Piece = { sha256: string; name: string; read: () => Promise<Uint8Array | null> | Uint8Array | null };

/**
 * The files a save found nowhere but in what the page holds of them
 * (`pending`), sent one at a time - each read as it is sent, and let go -
 * and set down by Meno for the save `staged` (`stage`) until it is written:
 * only once the save is to be written, its size warning answered. Where one
 * is no longer held, or is not set down, those set down for it are taken
 * away, and the save is not written.
 */
export async function sendPieces(of: { staged: string | null; pending: readonly Piece[] }, stage: (save: string, sha256: string, bytes: Uint8Array) => Promise<void> = stageJobFile): Promise<void> {
  if (!of.staged || !of.pending.length) return;
  try {
    for (const p of of.pending) {
      const bytes = await p.read();
      if (!bytes) throw new Error(`${p.name} could not be kept: it is no longer held`);
      await stage(of.staged, p.sha256, bytes);
    }
  } catch (e) {
    void unstageJobFiles(of.staged).catch(() => undefined);
    throw e;
  }
}

/** A step's jobs, of its run and the runs it keeps, each once. */
export const jobsOfStep = (s: WorkflowStep): string[] => [...new Set([s.ran, ...(s.runs ?? [])].flatMap((r) => r?.jobs ?? []))];

/** The records of the jobs whose folders this session's saves took away once the file held them whole, by job id: read as a file opened keeps them. */
const cleared = new Map<string, KeptJob>();

/** What is kept of a job, where its folder is not here: what the file a workspace was opened from kept of it, or what a save this session kept of it before its folder was taken away. */
export const recordOf = (s: WorkflowStep, job: string): KeptJob | undefined => [s.ran, ...(s.runs ?? [])].flatMap((r) => r?.kept ?? []).find((k) => k.job === job) ?? cleared.get(job);

/** A workspace's file opened this session, where it was: its path, and its size and when it was written as it was opened. */
export type OpenedFrom = { path: string; size: number; mtime: number | null };

/**
 * The job files the workspace files opened this session keep, by SHA-256:
 * each read from the file held only when wanted - where that file is, and
 * how much the file kept it at, packed: what it comes to in the next file,
 * deflated again as it is written (src-tauri keptjobs.rs).
 */
const held = new Map<string, { read: () => Uint8Array | null; from?: OpenedFrom; packed?: number; places?: string[] }>();

/** How many workspace files a job file is remembered in, newest first: places for Meno to look in, never trusted as they are. */
const MOST_PLACES = 4;

/** `places` with `path` first, each once. */
const placedIn = (path: string, places: readonly string[] = []) => [path, ...places.filter((p) => p !== path)].slice(0, MOST_PLACES);

/** The workspace files a job file held was opened from or saved to this session, newest first: where Meno is asked to look for it (`findJobFiles`). */
export const heldJobPlaces = (sha256: string): string[] => held.get(sha256)?.places ?? [];

/** Holds the job files a workspace's file keeps, as it is opened - from where it was (`from`), where that is known: each read from it only when wanted. */
export function holdJobFilesOf(file: MenoFile, from?: OpenedFrom): void {
  for (const f of file.files) {
    if (f.media !== JOB_FILE_MEDIA || held.has(f.sha256)) continue;
    const packed = file.packed(f.sha256);
    held.set(f.sha256, { read: () => file.data(f.sha256), ...(from ? { from, places: [from.path] } : {}), ...(packed != null ? { packed } : {}) });
  }
}

/** How much a job file held comes to in a workspace's file, packed: none where that is not known - then its size, unpacked, stands in. */
export const heldJobPacked = (sha256: string): number | undefined => held.get(sha256)?.packed;

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
 * The jobs a save holds every file of, each added from its folder: none of
 * its files left out (a step's *Don't keep raw outputs*, or not had), and
 * none kept again from another file - the jobs whose folders may go once
 * the file is written (docs/WORKFLOWS.md, *A job's folder*).
 */
export function clearableJobs(jobs: JobsKept): string[] {
  const fromFolder = new Set(jobs.appended.filter((a) => !a.from && !a.staged).map((a) => a.sha256));
  return [...jobs.records.values()].filter((r) => !r.left?.length && r.files.length > 0 && r.files.every((f) => fromFolder.has(f.sha256))).map((r) => r.job);
}

/**
 * After a save to `path`: every job file it holds - added from its folder,
 * copied from the file it was opened from, or carried by the page - noted
 * as kept there, as the file is now (`now`: its size, and when it was
 * written), so that the next save has Meno copy each from it as it writes
 * (src-tauri keptjobs.rs `append_job_files`, which takes one only if it is
 * what its SHA-256 says), never read back into the page and packed again:
 * a save then costs what the first did, however many came before it. A job
 * whose folder is here is still listed from its folder; nothing noted where
 * the file cannot be looked at.
 */
export async function noteJobFilesSaved(
  path: string,
  jobs: Pick<JobsKept, "listed" | "packed">,
  now: (path: string) => Promise<{ size: number; mtime: number | null } | null> = (p) => fileNow(p).catch(() => null),
): Promise<void> {
  const shas = jobs.listed.map((f) => f.sha256);
  if (!shas.length) return;
  const is = await now(path);
  if (!is) return;
  const from: OpenedFrom = { path, size: is.size, mtime: is.mtime };
  for (const sha256 of shas) {
    const was = held.get(sha256);
    const packed = jobs.packed.get(sha256) ?? was?.packed;
    held.set(sha256, { read: was?.read ?? (() => null), from, places: placedIn(path, was?.places), ...(packed != null ? { packed } : {}) });
  }
}

/**
 * After a save failed, as Meno's backend said why (`message`): each file
 * its job files were to be copied from (`appended`'s `from`) that it found
 * no longer holding one, or not to be read (src-tauri keptjobs.rs
 * `carried`) - written over since it was noted - taken no longer as where
 * they are, so that a save made again keeps each from what the page holds
 * of it, or, where it holds nothing of it, says it is not had. Whether any
 * was: none, the failure was another's, and nothing is changed.
 */
export function dropNotedSources(message: string, appended: readonly Appended[]): boolean {
  const failed = new Set(
    appended.flatMap((a) => {
      const name = a.from?.split(/[\\/]/).pop();
      return a.from && name && (message.includes(`${name} no longer holds a file it kept`) || message.includes(`${name} could not be read`)) ? [a.from] : [];
    }),
  );
  if (!failed.size) return false;
  for (const [sha256, h] of held) {
    if (!h.from || !failed.has(h.from.path)) continue;
    const { from: _, ...rest } = h;
    held.set(sha256, rest);
  }
  return true;
}

/**
 * Whether a save failed (`message`, as Meno's backend said why) as a file
 * it was to take from a workspace's file, an output's own file, the PDFs
 * Meno holds, or from what the page sent,
 * was not there as it was asked for (src-tauri keptjobs.rs `carried`): the
 * file changed since Meno was asked where it is. Made again at once, Meno
 * then reads each whole to find where it is (`findJobFiles`, `whole`).
 */
export const takenFromElsewhereFailed = (message: string, appended: readonly Appended[]): boolean =>
  appended.some((a) => a.from || a.staged || a.at || a.pdf) && message.includes(" could not be kept: ");

/**
 * Where Meno's backend finds each job file asked for (`asked`), for a save
 * to `target`: in the workspace files each was opened from or saved to
 * this session (`heldJobPlaces`) and the one the canvas was last saved to
 * (`savedPath`), whoever has written them since; the file at `target` as it
 * is now; a copy kept beside any of them; its job's folder. Each by its
 * SHA-256 - where `whole`, read whole and checked; else by its name and
 * size alone, the save then checking it as it is written. None for one it
 * finds nowhere.
 */
export const findJobFiles =
  (target: string, savedPath: string | null, whole: boolean, ask: typeof jobFilesWhere = jobFilesWhere) =>
  (asked: readonly Omit<AskedJobFile, "from">[]): Promise<(FoundJobFile | null)[]> =>
    asked.length ? ask(target, asked.map((a) => ({ ...a, from: [...new Set([...heldJobPlaces(a.sha256), ...(savedPath ? [savedPath] : [])])] })), whole) : Promise.resolve([]);

/**
 * After a save to `path`: the folders of the jobs it holds whole
 * (`clearableJobs`) moved to the system's Trash by Meno's backend - each
 * only where the file there, read back, holds every file of the job's
 * record, to its size and SHA-256; where the job has finished, and its
 * folder holds nothing the record does not (`clear`). For each that went,
 * its record held for the session, and the file - as it was read back -
 * noted as where its files are, so that the next save keeps them from it,
 * and Show log and Show files read them there; nothing noted for one that
 * stayed. The jobs whose folders went, and - once, whatever the number -
 * why those that stayed though finished did.
 */
export async function clearSavedJobs(
  path: string,
  jobs: JobsKept,
  clear: (path: string, jobs: { job: string; files: { name: string; sha256: string; size: number }[] }[]) => Promise<ClearedSaved> = clearSavedFolders,
): Promise<{ gone: string[]; said: string | null }> {
  const ids = clearableJobs(jobs);
  if (!ids.length) return { gone: [], said: null };
  const asked = ids.map((job) => ({ job, files: jobs.records.get(job)!.files.map(({ name, sha256, size }) => ({ name, sha256, size })) }));
  const done = await clear(path, asked).catch((e: unknown): ClearedSaved => ({ gone: [], left: ids.map((job) => ({ job, why: String(e), quiet: false })), at: null }));
  const at = done.at;
  // (gone only as the backend says - and noted only where it says what the file was as it read it back)
  const gone = at ? done.gone.filter((id) => ids.includes(id)) : [];
  const from: OpenedFrom | null = at && { path, size: at.size, mtime: at.mtime };
  for (const id of gone) {
    const record = jobs.records.get(id)!;
    cleared.set(id, record);
    // (and how much each came to in it, deflated, as this save counted it)
    for (const f of record.files) {
      const packed = jobs.packed.get(f.sha256) ?? held.get(f.sha256)?.packed;
      held.set(f.sha256, { read: held.get(f.sha256)?.read ?? (() => null), from: from!, places: placedIn(path, held.get(f.sha256)?.places), ...(packed != null ? { packed } : {}) });
    }
  }
  const loud = done.left.filter((l) => !l.quiet);
  const said = loud.length ? `${loud.length === 1 ? "A job's folder was" : `${loud.length} jobs' folders were`} kept, though the workspace was saved: ${loud[0].why}.` : null;
  return { gone, said };
}

/** A job's log as the workspace's file holds it, where the job's folder is not here: written back out (`jobs-kept`) and read; none where the file holds none, or it cannot be had. */
export async function keptLogOf(job: string, record: KeptJob | undefined): Promise<string | null> {
  const log = record?.files.find((f) => f.name === "log.txt");
  if (!log) return null;
  const from = await heldJobSource(log.sha256);
  const bytes = from ? null : heldJobFile(log.sha256);
  if (!from && !bytes) return null;
  const back = await writeJobBack(job, log.name, log.sha256, from ? { from } : { bytes: bytes! }).catch(() => null);
  if (!back) return null;
  // (written beside its work folder, as its folder had it)
  return readTextFile(back.work.replace(/[\\/]work[\\/]?$/, "") + (back.work.includes("\\") ? "\\" : "/") + "log.txt").catch(() => null);
}

/**
 * What a save keeps of `steps`' jobs: each job's files listed from its
 * folder (`read`) where it is on this computer; else as the file it was
 * opened from kept them - each taken by Meno from wherever it finds it whole
 * (`where`, `findJobFiles`), never through the page; and only one found
 * nowhere sent from what the page holds of it (`bytesOf`), read and sent one
 * at a time (`stage`, into the save's own `staged`), so that the page never
 * holds more than one of them. One held nowhere is recorded as not had. A
 * job with neither - its folder gone, and never kept - has nothing to keep
 * and no record.
 */
export async function jobsToKeep(
  steps: readonly WorkflowStep[],
  read: (job: string) => Promise<KeptJobFile[] | null> = jobKept,
  bytesOf: (sha256: string) => Uint8Array | null = heldJobFile,
  where: (asked: readonly Omit<AskedJobFile, "from">[]) => Promise<(FoundJobFile | null)[]> = async (asked) => asked.map(() => null),
  packedOf: (sha256: string) => number | undefined = heldJobPacked,
): Promise<JobsKept> {
  const out: JobsKept = { records: new Map(), listed: [], appended: [], staged: null, pending: [], notHad: 0, steps: [], bytes: 0, adds: 0, largest: 0, packed: new Map() };
  const seen = new Set<string>();
  const stepBytes = new Map<number, number>();
  const add = (step: number, n: number) => stepBytes.set(step, (stepBytes.get(step) ?? 0) + n);
  // (the job files of jobs not here, each once: where Meno finds each is asked once for them all)
  const asked: (Omit<AskedJobFile, "from"> & { step: number; f: KeptJobEntry })[] = [];
  for (const step of steps) {
    const raw = step.keepRaw !== false;
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
          out.packed.set(f.sha256, f.deflated);
          add(step.id, f.deflated);
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
          files.push(f);
          if (seen.has(f.sha256)) continue;
          seen.add(f.sha256);
          asked.push({ sha256: f.sha256, job, name: f.name, size: f.size, step: step.id, f });
        }
        // (what that file had left out, still left out - and said)
        left.push(...(was.left ?? []).filter((l) => !left.some((x) => x.name === l.name)));
      }
      out.records.set(job, { job, files, ...(left.length ? { left } : {}) });
    }
  }
  const found = await where(asked.map(({ sha256, job, name, size }) => ({ sha256, job, name, size })));
  const notHad = new Set<string>();
  for (const [k, a] of asked.entries()) {
    const at = found[k];
    let staged: string | undefined;
    if (!at) {
      // (found nowhere: to be sent from what the page holds of it - this one alone, read as it is sent, once the save is
      //  to be written: whether it holds it known now, its bytes let go)
      if (!bytesOf(a.sha256)) {
        notHad.add(a.sha256);
        continue;
      }
      out.staged ??= crypto.randomUUID();
      out.pending.push({ sha256: a.sha256, name: a.name, read: () => bytesOf(a.sha256) });
      staged = out.staged;
    }
    out.listed.push({ sha256: a.sha256, name: a.name, media: JOB_FILE_MEDIA, size: a.size });
    out.appended.push({ sha256: a.sha256, job: a.job, name: a.name, ...(at?.from ? { from: at.from } : {}), ...(at?.via ? { via: at.via } : {}), ...(staged ? { staged } : {}) });
    out.largest = Math.max(out.largest, a.size);
    // (deflated again as it is written: about what the file it comes from kept it at - not its size, unpacked)
    const packed = packedOf(a.sha256) ?? a.size;
    out.packed.set(a.sha256, packed);
    add(a.step, packed);
    out.adds += packed;
  }
  // (one found nowhere and held nowhere: not had, in every job's record that has it)
  out.notHad = notHad.size;
  if (notHad.size)
    for (const [job, r] of out.records) {
      const gone = r.files.filter((f) => notHad.has(f.sha256));
      if (!gone.length) continue;
      const left = [...gone.map((f) => ({ name: f.name, size: f.size, why: "not had" as const })), ...(r.left ?? []).filter((l) => !gone.some((g) => g.name === l.name))];
      out.records.set(job, { job, files: r.files.filter((f) => !notHad.has(f.sha256)), left });
    }
  for (const step of steps) {
    const n = stepBytes.get(step.id);
    if (n) out.steps.push({ step: step.id, bytes: n });
    out.bytes += n ?? 0;
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

/** The job files a save could have from nowhere (`JobsKept`'s `notHad`), counted, as Save names them: none where it had them all. */
export const jobFilesNamed = (n: number): string | null => (n === 0 ? null : n === 1 ? "1 file of a step's job" : `${n.toLocaleString("en")} files of steps' jobs`);

/** What Save says of the job files a save could have from nowhere, alone (utils/workspace `notKeptSaid` says them with the rest): none where it had them all. */
export const jobFilesNotHadSaid = (n: number): string | null =>
  n === 0 ? null : n === 1 ? "Saved, but 1 file of a step's job is not in the file: it could not be read." : `Saved, but ${jobFilesNamed(n)} are not in the file: they could not be read.`;

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
