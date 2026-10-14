/**
 * The page's errors and warnings into Meno's log (src-tauri/src/logfile.rs,
 * docs/ARCHITECTURE.md *Meno's log*): what goes to `console.error` and
 * `console.warn`, and what is thrown and never caught, each also where it
 * went before. A line says what went wrong, never what a document holds:
 * of an error its name, message and stack, words logged as they are, a
 * number or the like as it is - of anything else only what it is
 * (`[Object]`, `[Map]`), not its content.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Level = "error" | "warn";

/** The most lines sent in a minute: past that they are counted and said to be left out, so that one error over and over does not fill the log. */
export const MOST_A_MINUTE = 100;
/** The most characters taken of one thing logged. */
const PART_MOST = 1000;
/** The most lines of a stack taken. */
const STACK_LINES = 12;

const cut = (s: string, most = PART_MOST) => (s.length > most ? `${s.slice(0, most)}…` : s);

/** One thing logged, as the log has it. */
function partOf(a: unknown): string {
  if (a instanceof Error) {
    const head = `${a.name}: ${cut(a.message)}`;
    // (a stack that begins with the error's name and message - as some
    // engines write it - without them again)
    const lines = (a.stack ?? "").split("\n").filter((l) => l.trim());
    const stack = (lines[0]?.startsWith(`${a.name}:`) ? lines.slice(1) : lines).slice(0, STACK_LINES);
    return [head, ...stack.map((l) => cut(l.trim(), 300))].join("\n");
  }
  if (typeof a === "string") return cut(a);
  if (a == null || typeof a === "number" || typeof a === "boolean" || typeof a === "bigint") return String(a);
  if (typeof a === "symbol") return a.toString();
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
