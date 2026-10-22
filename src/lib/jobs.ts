/**
 * Jobs (src-tauri/src/jobs.rs; docs/WORKFLOWS.md): a program a plugin
 * names, run for a workflow's step in a folder of its own in Meno's local
 * data folder, by Meno's executable started apart from Meno - so that it goes on
 * when Meno closes. Jobs wait their turn, as many running at once as
 * Settings allows; each has its log, and a record of how it ended.
 */
import { invoke } from "@tauri-apps/api/core";
import type { CalculationSettings } from "./settings/appSettings";

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
};

/** A file written into a job's folder before it starts, by its path there. */
export type JobFile = { name: string; text: string };

/** What a plugin asks to run (`prepare`), and how many may run at once and how many cores each may use. */
export type JobAsk = {
  plugin: string;
  /** A program the plugin's manifest names, in its environment. */
  program: string;
  args?: string[];
  files?: JobFile[];
  /** One of its files, given to its program as what it reads (its standard input). */
  stdin?: string;
  slots?: number;
  cores?: number;
  /** Where its program is, where it is one installed separately (lib/plugins/installed). */
  path?: string;
  /** Programs installed beside its own to run after it, by their names in its manifest (`installed[].beside`), with their arguments. */
  then?: { program: string; args: string[] }[];
  /** The files of its folder its plugin reads back once it is done: kept, with what it was given, where its step keeps no raw outputs (lib/doc/keptJobs). */
  reads?: string[];
};

/** Whether a job is over - and will say nothing more. */
export const finished = (state: JobState) => state !== "waiting" && state !== "running";

/** A job made and started: its id. It waits its turn. */
export const startJob = (ask: JobAsk) => invoke<string>("job_start", { payload: ask });
export const jobOf = (id: string) => invoke<Job>("job_state", { id });
/** Every job in Meno's data folder, those asked for first first. */
export const listJobs = () => invoke<Job[]>("jobs_list");
/** What a job's log says from byte `from` on, and where to read from next. */
export const readJobLog = (id: string, from: number) => invoke<{ text: string; next: number }>("job_log", { id, from });
/** The files in a job's folder, by their paths there. */
export const jobFiles = (id: string) => invoke<string[]>("job_files", { id });
export const readJobFile = (id: string, name: string) => invoke<string>("job_read", { id, name });
/** Where a job's files are, for *Show files*. */
export const jobFolder = (id: string) => invoke<string>("job_folder", { id });

/** What a job's file is to it, kept in a workspace (src-tauri keptjobs.rs): given it, read back of it, what its programs said, or anything else it wrote. */
export type KeptRole = "input" | "read" | "log" | "raw";
/** A job's file a workspace may keep: its name in the job's folder (`work/...`, `log.txt`, `after.txt`), size, SHA-256, about how much it comes to deflated, and what it is to the job - `unsure` where the job never said (made by an older Meno). */
export type KeptJobFile = { name: string; size: number; sha256: string; deflated: number; role: KeptRole; unsure?: true };
/** A job's files a workspace may keep, where its folder is on this computer; null where it is not. */
export const jobKept = (id: string) => invoke<KeptJobFile[] | null>("job_kept", { id });
/** Writes a file a workspace kept of a job back out, where the job's folder is not on this computer; where its work folder now is. */
export const writeJobBack = (id: string, name: string, bytes: Uint8Array) => invoke<string>("job_write_back", bytes, { headers: { job: id, name } });
/** Asks a job to stop: its program, and everything it started - or, waiting, it never starts. */
export const stopJob = (id: string) => invoke<void>("job_stop", { id });
/** A finished job's folder taken away. */
export const removeJob = (id: string) => invoke<void>("job_remove", { id });
/** Every finished job's folder taken away: how many. */
export const clearFinishedJobs = () => invoke<number>("jobs_clear_finished");
/** What a finished job's program made taken out of its folder, its log and what it was given kept: the bytes freed. */
export const trimJob = (id: string) => invoke<number>("job_trim", { id });
/** How many bytes the finished jobs' folders hold, all together. */
export const finishedJobsBytes = () => invoke<number>("jobs_finished_bytes");

/** How many finished jobs' files are kept, and how much they hold where that is known: "None", "1 job, 4 MB". */
export function keptText(kept: number, bytes: number | null): string {
  if (kept === 0) return "None";
  return `${kept === 1 ? "1 job" : `${kept} jobs`}${bytes == null ? "" : bytes >= 1e9 ? `, ${(bytes / 1e9).toFixed(1)} GB` : `, ${Math.max(1, Math.round(bytes / 1e6))} MB`}`;
}

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
 * How many jobs run at once and how many cores each may use, as Settings,
 * *Calculations*, has them: unset, one at once, and the computer's cores
 * shared among those at once - never more than it has.
 */
export function runningOf(c: Pick<CalculationSettings, "atOnce" | "cores">, cores = computerCores()): { slots: number; cores: number } {
  const slots = c.atOnce ?? 1;
  return { slots, cores: Math.min(c.cores ?? Math.max(1, Math.floor(cores / slots)), cores) };
}

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
