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
/** Where a job's files are, for *Show files*. */
export const jobFolder = (id: string) => runnerOf(id).folder(id);
/** Asks a job to stop: its program, and everything it started - or, waiting, it never starts. */
export const stopJob = (id: string) => runnerOf(id).stop(id);
/** A finished job's folder taken away. */
export const removeJob = (id: string) => runnerOf(id).remove(id);
/** Every finished job's folder taken away: how many. */
export const clearFinishedJobs = () => runnerOf().clearFinished();

/** This computer's cores, and its memory in MiB (nought where it could not be told), as its system says. */
export const computerResources = () => invoke<{ cores: number; memory: number }>("computer_resources");

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
