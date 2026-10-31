/**
 * Jobs (src-tauri/src/jobs.rs; docs/WORKFLOWS.md): a program a plugin
 * names, run for a workflow's step in a folder of its own, by a runner
 * (lib/runners) - this computer's: Meno's executable started apart from
 * Meno, so that it goes on when Meno closes. Jobs wait their turn, those
 * asked for first first, running as many at once as their cores and memory
 * fit what Settings lets jobs use; each has its log, and a record of how it
 * ended.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CalculationSettings } from "./settings/appSettings";
import { runnerOf } from "./runners";

/** Where a job is. *Gone*: what ran it is no longer there, and never said how it ended (the computer was restarted, say). */
export type JobState = "waiting" | "running" | "done" | "failed" | "stopped" | "gone";

/** A job, as Meno's record of it has it. Times in ms since 1970. */
export type Job = {
  id: string;
  /** The plugin that asked for it, and the program it runs, by its name. */
  plugin: string;
  program: string;
  state: JobState;
  created: number;
  started?: number;
  ended?: number;
  /** The program's exit code, where it ended with one. */
  code?: number;
  /** Why it failed, where it failed before its program could say. */
  why?: string;
  /** Its key, as Meno asked for it with one (lib/jobKeys). */
  key?: string;
};

/** A file written into a job's folder before it starts, by its path there. */
export type JobFile = { name: string; text: string };

/** What a plugin asks to run (`prepare`): its program, files and arguments; the cores it takes, and the memory it declares. */
export type JobAsk = {
  plugin: string;
  /** A program the plugin's manifest names, in its environment. */
  program: string;
  args?: string[];
  files?: JobFile[];
  /** One of its files, given to its program as what it reads (its standard input). */
  stdin?: string;
  cores?: number;
  /** The memory it takes, in MiB, where its plugin declared it: counted against what jobs may use. */
  memory?: number;
  /** Where its program is, where it is one installed separately (lib/plugins/installed). */
  path?: string;
  /** Programs installed beside its own to run after it, by their names in its manifest (`installed[].beside`), with their arguments. */
  then?: { program: string; args: string[] }[];
  /** Its key (lib/jobKeys), kept with it: what Meno checks it by when it takes it up. */
  key?: string;
  /** What it is called, in words - its entry's name and its step's (`water Optimise`): its folder is named from it, path-safe (`water-optimise-3f9a2c1d`). */
  label?: string;
  /** The files of its folder its plugin reads back once it is done: kept, with what it was given, where its step keeps no raw outputs (lib/doc/keptJobs). */
  reads?: string[];
  /** Other plugins whose programs it needs, by id - each its plugin's manifest declares (`needs`): found as their own jobs would find them, and named in its folder. */
  needs?: string[];
};

/** Whether a job is over - and will say nothing more. */
export const finished = (state: JobState) => state !== "waiting" && state !== "running";

/** A job made and started on the runner given (this computer's, unless another is named): its id. It waits its turn. */
export const startJob = (ask: JobAsk, runner?: string) => runnerOf(runner).start(ask);
export const jobOf = (id: string) => runnerOf(id).state(id);
/** Every job of every runner, those asked for first first. */
export const listJobs = () => runnerOf().list();
/** What a job's log says from byte `from` on, and where to read from next. */
export const readJobLog = (id: string, from: number) => runnerOf(id).log(id, from);
/** The files in a job's folder, by their paths there. */
export const jobFiles = (id: string) => runnerOf(id).files(id);
export const readJobFile = (id: string, name: string) => runnerOf(id).read(id, name);
/** What a job gave, as one digest - compared when it is taken up again. */
export const jobDigest = (id: string) => runnerOf(id).digest(id);
/** A program installed separately as it is now, for a job's key: where it is, its size, and when it was written. */
export const programStamp = (path: string) => invoke<string>("program_stamp", { path });
/** Where a job's files are, for *Show files*. */
export const jobFolder = (id: string) => runnerOf(id).folder(id);

/** What a job's file is to it, kept in a workspace (src-tauri keptjobs.rs): given it, read back of it, what its programs said, or anything else it wrote. */
export type KeptRole = "input" | "read" | "log" | "raw";
/** A job's file a workspace may keep: its name in the job's folder (`work/...`, `log.txt`, `after.txt`), size, SHA-256, about how much it comes to deflated, and what it is to the job - `unsure` where the job never said (made by an older Meno). */
export type KeptJobFile = { name: string; size: number; sha256: string; deflated: number; role: KeptRole; unsure?: true };
/** A job's files a workspace may keep, where its folder is on this computer; null where it is not. */
export const jobKept = (id: string) => invoke<KeptJobFile[] | null>("job_kept", { id });
/** A file the page may read, as it is now: its size, and when it was last written (ms); none where it is not there or may not be read (src-tauri keptjobs.rs `file_now`). */
export const fileNow = (path: string) => invoke<{ size: number; mtime: number | null } | null>("file_now", { path });
export type WrittenBack = { work: string; differs: boolean };
/**
 * A file a workspace kept of the job `id` written back out (src-tauri
 * keptjobs.rs `job_write_back`): read by Meno from the workspace's file it
 * was opened from (`from`, a path), or else sent as its bytes. Where its
 * work folder is; and whether a file there that is not it was left as it is.
 */
export const writeJobBack = (id: string, name: string, sha256: string, source: { from: string } | { bytes: Uint8Array }) =>
  "from" in source
    ? invoke<WrittenBack>("job_write_back", new Uint8Array(), { headers: { job: id, name, sha256, from: encodeURIComponent(source.from) } })
    : invoke<WrittenBack>("job_write_back", source.bytes, { headers: { job: id, name, sha256 } });
/** Asks a job to stop: its program, and everything it started - or, waiting, it never starts. */
export const stopJob = (id: string) => runnerOf(id).stop(id);
/** A finished job's folder taken away. */
export const removeJob = (id: string) => runnerOf(id).remove(id);
/** Every finished job's folder taken away: how many. */
export const clearFinishedJobs = () => runnerOf().clearFinished();
/** What a finished job's program made taken out of its folder, its log and what it was given kept: the bytes freed. (This computer's runner's: the only one there is yet.) */
export const trimJob = (id: string) => invoke<number>("job_trim", { id });
/** How many bytes the finished jobs' folders hold, all together. (This computer's runner's, as `trimJob`.) */
export const finishedJobsBytes = () => invoke<number>("jobs_finished_bytes");

/** How many finished jobs' files are kept, and how much they hold where that is known: "None", "1 job, 4 MB". */
export function keptText(kept: number, bytes: number | null): string {
  if (kept === 0) return "None";
  return `${kept === 1 ? "1 job" : `${kept} jobs`}${bytes == null ? "" : bytes >= 1e9 ? `, ${(bytes / 1e9).toFixed(1)} GB` : `, ${Math.max(1, Math.round(bytes / 1e6))} MB`}`;
}

/** Where this computer's jobs are made (Settings, *Calculations*, *Jobs*). */
export type JobsFolder = {
  /** The working folder chosen (Meno makes its `meno-jobs` in it), or Meno's own. */
  path: string;
  own: boolean;
  /** The folder chosen is not there - a drive not connected, say: no job is made until it is, or another is chosen. */
  missing: boolean;
};
/** The working folder this computer's jobs are made in, whether it is Meno's own, and whether it is there. */
export const jobsFolder = () => invoke<JobsFolder>("jobs_folder");
/** Jobs made in a working folder chosen - or in Meno's own again (null): refused, saying why, while any job waits or runs. */
export const chooseJobsFolder = (path: string | null) => invoke<JobsFolder>("jobs_folder_choose", { path });

/**
 * This computer's cores - each a thread it runs at once, two to a physical
 * core where it runs two on each - its physical cores, and its memory in MiB
 * (nought where it could not be told), as its system says.
 */
export const computerResources = () => invoke<{ cores: number; physical: number; memory: number }>("computer_resources");

/** A plugin's jobs that wait or run: those taking it away would stop. */
export async function liveJobsOf(plugin: string, list: () => Promise<Job[]> = listJobs): Promise<Job[]> {
  return (await list()).filter((j) => j.plugin === plugin && !finished(j.state));
}

/**
 * Jobs stopped, and waited for until each has ended - its program gone, so
 * that nothing it runs from is taken away under it - for `most` ms at most;
 * a job gone or ended already is ended.
 */
export async function stopJobsAndWait(
  ids: readonly string[],
  w: { stop?: (id: string) => Promise<void>; look?: (id: string) => Promise<Job>; pause?: (ms: number) => Promise<void>; most?: number } = {},
): Promise<void> {
  const { stop = stopJob, look = jobOf, pause = (ms) => new Promise((go) => setTimeout(go, ms)), most = 20_000 } = w;
  await Promise.all(ids.map((id) => stop(id).catch(() => {})));
  let left = [...ids];
  for (let waited = 0; left.length && waited < most; waited += 250) {
    const states = await Promise.all(left.map((id) => look(id).then((j) => j.state).catch((): JobState => "gone")));
    left = left.filter((_, i) => !finished(states[i]));
    if (left.length) await pause(250);
  }
}

/** This computer's cores, as far as the webview can tell. */
export const computerCores = () => Math.max(1, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 1);

/**
 * How many cores a job takes, as Settings, *Calculations*, has it: unset,
 * all those jobs may use - one at a time - never more than they may use,
 * nor than the computer has.
 */
export function runningOf(c: Pick<CalculationSettings, "cores" | "coresAll">, cores = computerCores()): { cores: number } {
  const all = Math.min(c.coresAll ?? cores, cores);
  return { cores: Math.max(1, Math.min(c.cores ?? all, all)) };
}

/**
 * How Settings' cores are counted, in plain words, where it matters: on a
 * computer that runs more than one thread on each physical core, as its
 * threads - and a program running as processes takes one physical core,
 * that many of them, for each process (lib/jobs `processesOf`; the queue's
 * `taken`). None where each core runs one thread, or its physical cores
 * cannot be told.
 */
export function coresCountedSaid(c: { cores: number; physical?: number }): string | null {
  if (!c.physical || c.physical < 1 || c.cores <= c.physical) return null;
  // (what a process takes, as the queue counts it - jobs.rs `taken`: rounded up - and its threads said as even only where they are)
  const per = Math.ceil(c.cores / c.physical);
  const has = c.cores === per * c.physical ? `${c.physical} physical cores with ${per} threads each, ${c.cores} in all` : `${c.physical} physical cores and ${c.cores} threads`;
  return `Cores here are logical: this computer has ${has}. A program that runs as separate processes uses ${per} of them for each process.`;
}

/**
 * How many processes a job of a program running as processes takes (a
 * manifest's `installed[].parallel`: MPI, ORCA's `%pal`): the cores Settings
 * gives it, one process to each - never more than the computer's physical
 * cores, each process a whole one.
 */
export function processesOf(cores: number, physical: number): number {
  return Math.max(1, Math.min(cores, physical));
}

/**
 * What this computer's jobs may use at once, in all, as Settings has it:
 * unset, all its cores and three quarters of its memory (in MiB) - never
 * more than it has. What its runner is told (`writeJobLimits`).
 */
export function limitsOf(c: Pick<CalculationSettings, "coresAll" | "memoryAll">, computer: { cores: number; memory: number }): { cores: number; memory: number } {
  const cores = Math.max(1, Math.min(c.coresAll ?? computer.cores, computer.cores));
  const most = computer.memory > 0 ? computer.memory : Infinity;
  const memory = Math.min(c.memoryAll ?? Math.floor((computer.memory * 3) / 4), most);
  return { cores, memory: Number.isFinite(memory) ? memory : 0 };
}

/**
 * What a step says of its jobs that ask for more memory than jobs may use
 * (`limits`, MiB) - none more than the computer has: those are refused -
 * in plain words: each starts once no job that declares memory runs, and
 * none that declares memory starts beside it - one that declares none
 * still may, where cores allow. Nothing where none
 * does, or where jobs may use memory without limit (nought).
 */
export function overLimits(jobs: readonly { memory?: number }[], limits: { memory: number }): string | null {
  const over = jobs.filter((j) => limits.memory > 0 && (j.memory ?? 0) > limits.memory);
  if (!over.length) return null;
  const gb = (mib: number) => `${(mib / 1024).toFixed(1)} GB`;
  const most = Math.max(...over.map((j) => j.memory!));
  return `${over.length === 1 ? "1 job asks" : `${over.length} jobs ask`} for more memory (${gb(most)}) than jobs may use (${gb(limits.memory)}): nothing else that declares memory runs beside ${over.length === 1 ? "it" : "each"}`;
}

/** What jobs may use, told to this computer's runner: every job waiting takes it up at once. */
export const writeJobLimits = (limits: { cores: number; memory: number }) => invoke<void>("jobs_limits", limits);

/** How often a job followed is looked at. */
const FOLLOW_MS = 500;

/**
 * Follows a job: what its log says as it says it, and where it is when that
 * changes, until it has finished and everything it said has been read.
 * `done` is the job as it ended; `stop` stops following it.
 */
export function followJob(
  id: string,
  on: { log?: (text: string) => void; state?: (job: Job) => void },
  every = FOLLOW_MS,
): { done: Promise<Job>; stop: () => void } {
  let stopped = false;
  let from = 0;
  let was: JobState | undefined;
  const done = (async () => {
    for (;;) {
      const job = await jobOf(id);
      // (all of it read: a long log comes in pieces)
      for (;;) {
        const read = await readJobLog(id, from);
        if (stopped) return job;
        if (read.next === from) break;
        from = read.next;
        if (read.text) on.log?.(read.text);
      }
      if (job.state !== was) {
        was = job.state;
        on.state?.(job);
      }
      if (stopped || finished(job.state)) return job;
      await new Promise((go) => setTimeout(go, every));
    }
  })();
  return {
    done,
    stop: () => {
      stopped = true;
    },
  };
}
