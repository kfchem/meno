/**
 * The page's errors and warnings into Meno's log (src-tauri/src/logfile.rs,
 * docs/ARCHITECTURE.md *Meno's log*): what goes to `console.error` and
 * `console.warn`, and what is thrown and never caught, each also where it
 * went before. A line says what went wrong, never what a document holds,
 * nor a file's name: of an error its name and stack - its message only
 * where it is the engine's about code (`CODE_ERRORS`), as a message may
 * quote what was read; Meno's own messages (`KNOWN`), words logged that are
 * none of them left out (`[text]`); a number or the like as it is; and of
 * anything else only what it is (`[Object]`, `[Map]`), not its content.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Level = "error" | "warn";

/** The most lines sent in a minute: past that they are counted and said to be left out, so that one error over and over does not fill the log. */
export const MOST_A_MINUTE = 100;
/** The most lines of a stack taken. */
const STACK_LINES = 12;

/** A line of a stack that is a frame: where the code was, as engines write it. */
const FRAME = /^\s*at \S|@(\S+:\d+(:\d+)?|\[native code\])\s*$/;

/** The errors whose message is kept: the engine's, about the code that ran (x is undefined). Any other's may quote what was read - a file's text, a SMILES, a name - and is left out. */
const CODE_ERRORS: ReadonlySet<string> = new Set(["TypeError", "ReferenceError", "RangeError"]);

/**
 * Meno's own messages, as its code logs them, each as the log keeps it:
 * words logged that are none of these are left out, as they may name a
 * file or quote a document. A message newly logged is added here.
 */
const KNOWN: readonly (readonly [RegExp, (m: RegExpExecArray) => string])[] = [
  // (ui/layouts/ErrorBoundary: the part that stopped - a tab by its name, a file's, left out)
  [/^Meno: the (window|canvas|column) stopped working\.$/, (m) => m[0]],
  [/^Meno: the tab "[\s\S]*" stopped working\.$/, () => 'Meno: the tab "…" stopped working.'],
  // (hooks/useStructureEvents, clipboardActions, useOfficeLink, chem/fromSmiles)
  [/^(initial payload|append) import failed$/, (m) => m[0]],
  [/^the structure is copied without its pictures$/, (m) => m[0]],
  [/^the document did not take the structure$/, (m) => m[0]],
  [/^the SMILES is drawn as the plugin laid it out$/, (m) => m[0]],
  // (render3d withSolidsImage: how many atom numbers a picture left out, a count only)
  [/^Meno: a picture of molecules in 3D left out \d+ of their atom numbers, too small to read in it or with no room on their balls\.$/, (m) => m[0]],
  // (installLog's own)
  [/^not caught(, in a promise)?:$/, (m) => m[0]],
  // (where in React's tree a part stopped: components' names, a line each)
  [/^(\s*(at|in) [\w$.<>]+( \([^()\n]*\))?\s*)+$/, (m) => m[0].trim()],
];

const cut = (s: string, most: number) => (s.length > most ? `${s.slice(0, most)}…` : s);

/**
 * What a message quotes in single quotes: from a quote with no letter or
 * digit before it to the first with none after it (reading 'foo'), so that
 * the apostrophe of can't or Meno's neither begins nor ends one, and one
 * inside what is quoted ('O'Brien's') does not end it early.
 */
const SINGLE_QUOTED = /(?<![\p{L}\p{N}])'[\s\S]*?'(?![\p{L}\p{N}])/gu;

/** A message with what it quotes left out, in double quotes and in single (`SINGLE_QUOTED`): "foo" cannot be parsed as a URL, Failed to execute 'foo' on 'Document'. */
const unquoted = (s: string) => s.replace(/"[^"]*"/g, '"…"').replace(SINGLE_QUOTED, "'…'");

/** One thing logged, as the log has it. */
function partOf(a: unknown): string {
  if (a instanceof Error) {
    // (of a message kept, what it quotes left out)
    const head = CODE_ERRORS.has(a.name) ? `${a.name}: ${cut(unquoted(a.message), 300)}` : a.name;
    // (a stack that begins with the error's name and message, as some engines
    // write it, without them - a message of several lines whole - and then
    // only its frames: at f (app.js:1:2), f@app.js:1:2)
    let stack = a.stack ?? "";
    const said = a.message ? `${a.name}: ${a.message}` : a.name;
    if (stack.startsWith(said)) stack = stack.slice(said.length);
    const frames = stack.split("\n").filter((l) => FRAME.test(l)).slice(0, STACK_LINES);
    return [head, ...frames.map((l) => cut(l.trim(), 300))].join("\n");
  }
  if (typeof a === "string") {
    for (const [pattern, kept] of KNOWN) {
      const m = pattern.exec(a);
      if (m) return kept(m);
    }
    return "[text]";
  }
  if (a == null || typeof a === "number" || typeof a === "boolean" || typeof a === "bigint") return String(a);
  if (typeof a === "symbol") return "[Symbol]";
  if (typeof a === "function") return "[Function]";
  const name = Object.getPrototypeOf(a)?.constructor?.name;
  return `[${typeof name === "string" && name ? name : "Object"}]`;
}

/** What was logged, as one line of the log: its parts each as `partOf` has it, with spaces between. */
export function logText(args: readonly unknown[]): string {
  return args.map(partOf).join(" ");
}

/**
 * What sends lines to the log, at most `MOST_A_MINUTE` in a minute (by
 * `now`, in ms); those past that are counted, and the next line sent says
 * how many were left out first.
 */
export function logSender(send: (level: Level, text: string) => void, now: () => number = () => Date.now()) {
  let from = -Infinity;
  let sent = 0;
  let left = 0;
  return (level: Level, args: readonly unknown[]) => {
    const t = now();
    if (t - from >= 60_000) {
      from = t;
      sent = 0;
    }
    if (sent >= MOST_A_MINUTE) {
      left++;
      return;
    }
    sent++;
    const text = logText(args);
    send(level, left ? `(${left} lines left out)\n${text}` : text);
    left = 0;
  };
}

let installed = false;

/**
 * `console.error`, `console.warn`, and errors thrown and never caught, into
 * Meno's log as well - in the app only (a page in a browser has its
 * console). Once.
 */
export function installLog(): void {
  if (!isTauri() || installed) return;
  installed = true;
  // (sent and let go: a failure to log is not logged again)
  const send = logSender((level, text) => void invoke("log_page", { level, text }).catch(() => {}));
  for (const level of ["error", "warn"] as const) {
    const was = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      was(...args);
      send(level, args);
    };
  }
  window.addEventListener("error", (e) => send("error", ["not caught:", e.error ?? e.message]));
  window.addEventListener("unhandledrejection", (e) => send("error", ["not caught, in a promise:", e.reason]));
}
