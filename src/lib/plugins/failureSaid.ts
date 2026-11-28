/**
 * A plugin's failure said to the chemist in Meno's words. What Meno itself
 * refuses is an `Error` it wrote, in words written for the screen ("RDKit
 * was taken away: add it in Settings, Plugins."): shown as it is. Anything
 * else - the back end's refusal, which comes as text, a plugin's answer
 * (`ChemRefusal`), the engine's own error about code (a TypeError), text
 * from beneath Meno that one of its errors carries (`CarriesBackEnd`) -
 * names files and how Meno works inside, and means nothing to a chemist.
 * It is recognised as one of a few kinds (`failureKind`), and the screen
 * says, by its kind, what could not be done and what can truly be done
 * about it (`failureSaid`). Meno's log is told which plugin, where and of
 * what kind - never the text itself, which may name a file (lib/log).
 * One way for every place that says a plugin was not added, not started
 * or did not answer: the plugin's row and its notice in Settings,
 * Plugins, the first start's card, the chemistry settings, Quick Add.
 */
import { ChemError, ChemRefusal, ChemTimeout } from "../roles/client";

/**
 * What a failure from beneath Meno is, as far as the screen needs to know:
 * `outside` - the back end refused a place outside the files Meno may touch;
 * `offline` - Meno is offline; `not-allowed` - the network was not allowed;
 * `timed-out` - no answer in time; `stopped` - the plugin's worker stopped
 * while it was asked; `not-whole` - the plugin's set-up is not there whole
 * (its environment missing, or its worker gone as it started); `answer` -
 * the plugin answered that it could not do this; `engine` - an error in
 * Meno's own code; `unknown` - anything else.
 */
export type FailureKind = "outside" | "offline" | "not-allowed" | "timed-out" | "stopped" | "not-whole" | "answer" | "engine" | "unknown";

/** Where a plugin failed: what it was asked to do. */
export type FailureWhere = "set-up" | "start" | "SMILES" | "compound" | "look-up";

/** An error Meno wrote that carries text from beneath it (a file's name, the system's words): never shown as it is. */
export class CarriesBackEnd extends Error {}

/** The engine's errors about the code that ran: never words for the screen. */
const ENGINE = new Set(["TypeError", "ReferenceError", "RangeError", "SyntaxError", "EvalError", "URIError"]);

/**
 * The back end's refusals, by their own words, each as the kind it is: a
 * test holds each to the sentence in the Rust source, so a change there is
 * noticed (failureSaid.test).
 */
const REFUSALS: readonly (readonly [RegExp, FailureKind])[] = [
  // (the webview's file scope, tauri-plugin-fs: "forbidden path: {0}")
  [/^forbidden path: /, "outside"],
  // (src-tauri lib.rs validate_sidecar: where a worker may be started from)
  [/^sidecar (entry|script) /, "outside"],
  // (src-tauri net.rs Net::begin)
  [/: Meno is offline$/, "offline"],
  [/: not allowed to use the network$/, "not-allowed"],
  // (src-tauri lib.rs ext_spawn_sidecar: no environment, no workers in place)
  [/^the Python environment is not set up$/, "not-whole"],
  [/^no worker directory$/, "not-whole"],
];

/** How a worker that went before it said it was ready is said to have gone (lib/plugins/process). */
const GONE_AS_IT_STARTED = / stopped as it started(:|$)/;

/** What a failure is, where it came from beneath Meno; null where it is in Meno's own words, to be shown as it is. */
export function failureKind(e: unknown): FailureKind | null {
  if (e instanceof ChemTimeout) return "timed-out";
  if (e instanceof ChemRefusal) return "answer";
  if (e instanceof ChemError) return GONE_AS_IT_STARTED.test(e.message) ? "not-whole" : "stopped";
  if (e instanceof CarriesBackEnd) return "unknown";
  if (e instanceof Error) return ENGINE.has(e.name) ? "engine" : null;
  const text = typeof e === "string" ? e.trim() : "";
  return REFUSALS.find(([pattern]) => pattern.test(text))?.[1] ?? "unknown";
}

/** What to do where the cause is not one the chemist can mend: Meno's log, for a report. */
export const REPORT = "Meno's log, in Settings, General, can be sent with a report.";

/** Where Meno is offline and a plugin needs the network: what is said, in the words the look-up row says it in. */
export const offlineWords = (plugin: string) => `${plugin} needs the network; Meno is offline`;

/** Where the network was not allowed a plugin: what is said, as a set-up says it. */
export const notAllowedWords = (plugin: string) => `${plugin} needs the network, and was not allowed it`;

/**
 * What the screen says of a failure from beneath Meno, by where and of what
 * kind, for `plugin` by its own name: each true in its case - "Try again."
 * only where trying again can help, removing and adding the plugin only
 * where that sets it up afresh (its environment taken away and made anew:
 * lib/calc/workers `removeOne`, src-tauri lib.rs `py_env_remove`).
 */
export function kindSaid(where: FailureWhere, kind: FailureKind, plugin: string): string {
  if (kind === "offline") return `${offlineWords(plugin)}.`;
  if (kind === "not-allowed") return `${notAllowedWords(plugin)}.`;
  const again = kind === "timed-out" || kind === "stopped";
  switch (where) {
    case "set-up":
      if (kind === "outside") return `${plugin} was not added: Meno may not reach where its files go. ${REPORT}`;
      return again ? `${plugin} was not added: its set-up did not finish. Try again.` : `${plugin} was not added: its set-up could not be finished. ${REPORT}`;
    case "start":
      if (kind === "outside") return `${plugin} could not be started: Meno may not reach its files. ${REPORT}`;
      if (kind === "not-whole") return `${plugin} could not be started: its set-up is not whole. Remove it and add it again in Settings, Plugins.`;
      return again ? `${plugin} could not be started. Try again.` : `${plugin} could not be started. ${REPORT}`;
    case "SMILES":
    case "compound": {
      const it = where === "SMILES" ? "This SMILES" : "This compound";
      if (kind === "answer") return `${it} could not be made into a structure.`;
      return again ? `${plugin} did not answer. Try again.` : `${it} could not be drawn. ${REPORT}`;
    }
    case "look-up":
      if (kind === "answer") return `${plugin} could not look this name up.`;
      return again ? `${plugin} did not answer. Try again.` : `${plugin} could not look this name up. ${REPORT}`;
  }
}

/** What Meno's log is told of a failure said by its kind: which plugin, where and what kind - no word of what came with it. */
export const loggedOf = (where: FailureWhere, kind: FailureKind, plugin: string) => `Meno: ${plugin}: ${where} failed: ${kind}.`;

/**
 * A failure as the screen says it: in Meno's words where it is in them;
 * else by its kind (`kindSaid`), and Meno's log told which plugin, where
 * and of what kind - with the engine's own error, whose name and stack the
 * log keeps.
 */
export function failureSaid(e: unknown, where: FailureWhere, plugin: string): string {
  const kind = failureKind(e);
  if (kind === null) return (e as Error).message;
  if (kind === "engine") console.warn(loggedOf(where, kind, plugin), e);
  else console.warn(loggedOf(where, kind, plugin));
  return kindSaid(where, kind, plugin);
}

/** A plugin's set-up that failed, as it is said on it and in its notice: "<plugin> was not added: ..." - Meno's own words after that, else by its kind. */
export function setUpFailed(plugin: string, e: unknown): string {
  return failureKind(e) === null ? `${plugin} was not added: ${(e as Error).message}` : failureSaid(e, "set-up", plugin);
}

/** A plugin's start that failed, as it is passed on: in Meno's words as it came, else by its kind (`failureSaid`). */
export function startFailure(plugin: string, e: unknown): Error {
  return failureKind(e) === null ? (e as Error) : new Error(failureSaid(e, "start", plugin));
}
