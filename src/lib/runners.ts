/**
 * Runners (docs/WORKFLOWS-FOUNDATION.md, *Where jobs run, and when a job is
 * the same job*): a program plugin says what to run; a runner says where.
 * It submits a job, says how it stands, gives its log and files, stops it
 * and takes it away. This computer's is Meno's own (src-tauri/src/jobs.rs);
 * one for another machine is a plugin of its own, later, hung on this same
 * seam - its jobs named by its id before theirs (`<runner>:<job>`), so that
 * every job says which runner has it. Core knows no scheduler.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Job, JobAsk } from "./jobs";

/** What a runner does: each of a job's ways, by the job's id. */
export type Runner = {
  /** Its id, and what it is called where the chemist chooses one. */
  id: string;
  name: string;
  start(ask: JobAsk): Promise<string>;
  state(id: string): Promise<Job>;
  /** Every job it has, those asked for first first. */
  list(): Promise<Job[]>;
  log(id: string, from: number): Promise<{ text: string; next: number }>;
  files(id: string): Promise<string[]>;
  read(id: string, name: string): Promise<string>;
  /** What a job gave, as one digest: its log and every file it wrote, hashed (jobs.rs `digest_of`). */
  digest(id: string): Promise<string>;
  /** Where a job's files are, where the chemist can open them. */
  folder(id: string): Promise<string>;
  stop(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Every finished job's folder taken away: how many. */
  clearFinished(): Promise<number>;
};

/** This computer's runner: Meno's executable, started apart from Meno for each job, in Meno's own jobs folder. */
export const THIS_COMPUTER: Runner = {
  id: "this-computer",
  name: "This computer",
  start: (ask) => invoke<string>("job_start", { payload: ask }),
  state: (id) => invoke<Job>("job_state", { id }),
  list: () => invoke<Job[]>("jobs_list"),
  log: (id, from) => invoke<{ text: string; next: number }>("job_log", { id, from }),
  files: (id) => invoke<string[]>("job_files", { id }),
  read: (id, name) => invoke<string>("job_read", { id, name }),
  digest: (id) => invoke<string>("job_digest", { id }),
  folder: (id) => invoke<string>("job_folder", { id }),
  stop: (id) => invoke<void>("job_stop", { id }),
  remove: (id) => invoke<void>("job_remove", { id }),
  clearFinished: () => invoke<number>("jobs_clear_finished"),
};

const RUNNERS = new Map<string, Runner>([[THIS_COMPUTER.id, THIS_COMPUTER]]);

/**
 * The runner a job - by its id - or a runner's id names: one named before a
 * job's own (`<runner>:<job>`), else this computer's, whose jobs' ids are
 * its own alone. Unknown, this computer's: it says it has no such job.
 */
export function runnerOf(idOrJob?: string): Runner {
  if (!idOrJob) return THIS_COMPUTER;
  const named = RUNNERS.get(idOrJob) ?? (idOrJob.includes(":") ? RUNNERS.get(idOrJob.slice(0, idOrJob.indexOf(":"))) : undefined);
  return named ?? THIS_COMPUTER;
}

/** The runners there are, this computer's first. */
export const runners = (): Runner[] => [...RUNNERS.values()];
