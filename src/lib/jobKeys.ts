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
  args: readonly string[];
  stdin?: string;
  then?: readonly { program: string; args: readonly string[] }[];
  files: readonly { name: string; text: string }[];
};

/** The form of the key: a change to what goes in makes every key anew. */
const KEY_FORM = 1;

/** A job's key: 64 hex digits. Files in any order give the same key; any byte of one changed, another. */
export function jobKey(k: Keyed): string {
  const files = [...k.files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((f) => [f.name, f.text]);
  const text = JSON.stringify([KEY_FORM, k.plugin, k.pluginVersion, k.program, k.programVersion, [...k.args], k.stdin ?? null, (k.then ?? []).map((t) => [t.program, [...t.args]]), files]);
  return sha256Hex(new TextEncoder().encode(text));
}

/** Whether `v` is a job's key as `jobKey` gives one. */
export const isJobKey = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/**
 * The job a workspace already ran to the end under `key`, where its files
 * are still there to be read again: of the runs its steps keep - the last
 * of each, and those kept before it - one whose job has that key and is
 * `done`, as its runner says now (`stateOf`). None where none is.
 */
export function reusable(
  steps: readonly { ran?: { jobs?: readonly string[]; keys?: readonly string[] }; runs?: readonly { jobs?: readonly string[]; keys?: readonly string[] }[] }[],
  key: string,
  stateOf: (id: string) => string | undefined,
): string | null {
  for (const s of steps) {
    for (const run of [s.ran, ...(s.runs ?? [])]) {
      const at = run?.keys?.indexOf(key) ?? -1;
      const id = at >= 0 ? run?.jobs?.[at] : undefined;
      if (id && stateOf(id) === "done") return id;
    }
  }
  return null;
}
