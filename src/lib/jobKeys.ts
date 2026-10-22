/**
 * A job's key (docs/WORKFLOWS-FOUNDATION.md, *Where jobs run, and when a job
 * is the same job*): the SHA-256 of what it runs - its input files, its
 * program and arguments, what it reads as its input, the programs run after
 * it - and of the versions of its plugin and its program. Same key, same
 * result: a job whose key the workspace has already run to the end is not
 * run again; what it gave is taken up again (*Reused*). Only within one
 * workspace: no cache on the computer decides what runs (question N).
 */
import { sha256Hex } from "./binary/sha256";

/** What a job's key is made of. */
export type Keyed = {
  plugin: string;
  pluginVersion: string;
  program: string;
  /** The program's version, as its plugin's worker or the program itself says it; empty, where nothing said. */
  programVersion: string;
  /** Each program installed separately the step runs, as it is now (jobs.rs `stamp_of`): where it is, its size and when it was written - one replaced, though it says the same version or none, gives another key. */
  stamps?: readonly string[];
  args: readonly string[];
  stdin?: string;
  then?: readonly { program: string; args: readonly string[] }[];
  files: readonly { name: string; text: string }[];
};

/** The form of the key: a change to what goes in makes every key anew. */
const KEY_FORM = 2;

/** The most bytes hashed at once, on Meno's way; more - a wavefunction of many MB - by the browser's own, off it. */
export const KEY_AT_ONCE = 256 * 1024;

/**
 * A job's key: 64 hex digits. Files in any order give the same key; any
 * byte of one changed, another. A large input is hashed by the browser's
 * own SHA-256 (`crypto.subtle`), off Meno's way; a small one at once, the
 * same.
 */
export async function jobKey(k: Keyed): Promise<string> {
  const files = [...k.files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((f) => [f.name, f.text]);
  const text = JSON.stringify([KEY_FORM, k.plugin, k.pluginVersion, k.program, k.programVersion, [...(k.stamps ?? [])], [...k.args], k.stdin ?? null, (k.then ?? []).map((t) => [t.program, [...t.args]]), files]);
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= KEY_AT_ONCE) return sha256Hex(bytes);
  const sum = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(sum, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether `v` is a job's key as `jobKey` gives one. */
export const isJobKey = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** A run as `reusable` reads it: its jobs, their keys, and what each gave when it was read (`StepRan.gave`). */
type RunKeyed = { jobs?: readonly string[]; keys?: readonly string[]; gave?: readonly (string | null)[] };

/**
 * The job a workspace already ran to the end under `key`, where its files
 * are still there to be read again: of the runs its steps keep - the last
 * of each, and those kept before it - one whose job has that key, whose
 * output was read and kept as a digest (`gave`), and is `done`, as its
 * runner says now (`stateOf`). With that digest: what it gives now is
 * checked against it. None where none is.
 */
export function reusable(steps: readonly { ran?: RunKeyed; runs?: readonly RunKeyed[] }[], key: string, stateOf: (id: string) => string | undefined): { id: string; gave: string } | null {
  for (const s of steps) {
    for (const run of [s.ran, ...(s.runs ?? [])]) {
      const at = run?.keys?.indexOf(key) ?? -1;
      const id = at >= 0 ? run?.jobs?.[at] : undefined;
      const gave = at >= 0 ? run?.gave?.[at] : undefined;
      if (id && gave && stateOf(id) === "done") return { id, gave };
    }
  }
  return null;
}
