/**
 * What becomes of an entry a program step could not do (docs/WORKFLOWS.md,
 * *Failed*): the kinds of failure core knows - one list, core's, which a
 * plugin's own words are always kept beside, `failed` taking whatever is
 * none of the rest - and the kinds of warning a calculation may give, which
 * never move an entry (the maintainer, 2026-10-22).
 */

/** Why an entry failed, by kind - each said in plain words (`FAILURE_WORDS`). */
export const FAILURE_KINDS = ["not-started", "stopped", "program-error", "refused", "wrong-molecule", "no-geometry", "not-converged", "failed"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** An entry's failure: its kind, and why, in the program's or the plugin's own words. */
export type Failure = { kind: FailureKind; why: string };

/** Each kind of failure in plain words, as a step's line counts them. */
export const FAILURE_WORDS: Record<FailureKind, string> = {
  "not-started": "not started",
  stopped: "stopped before it finished",
  "program-error": "the program stopped with an error",
  refused: "refused",
  "wrong-molecule": "another molecule came back",
  "no-geometry": "no geometry came back",
  "not-converged": "not converged",
  failed: "failed",
};

/** A kind of failure as a plugin names it: one core knows, else `failed` - its words kept beside, whatever it says. */
export const failureKindOf = (v: unknown): FailureKind => ((FAILURE_KINDS as readonly unknown[]).includes(v) ? (v as FailureKind) : "failed");

export { WORDS_MOST } from "../../../../lib/calc/warnings";
export { WARNING_KINDS, WARNING_WORDS, warningKindOf, warningsOf, type Warning, type WarningKind } from "../../../../lib/calc/warnings";

/**
 * How much of a failure's why a chip says shut, in characters: the rest cut with an ellipsis - whole in its tip and its
 * record. A look number, with no other basis: a shut chip's line short enough to read at a glance.
 */
export const WHY_SHUT = 80;

/**
 * A failure in plain words - and, where the program stopped with an error, why, in its own words as its plugin read
 * them: "the program stopped with an error: <why>", on one line, cut to `most` characters with an ellipsis where given
 * (a chip shut). The other kinds say what happened already; their why is in the record.
 */
export function failureSaid(f: Failure, most?: number): string {
  const why = f.kind === "program-error" ? folded(f.why) : "";
  if (!why) return FAILURE_WORDS[f.kind];
  return `${FAILURE_WORDS[f.kind]}: ${most && why.length > most ? `${why.slice(0, most - 1).trimEnd()}\u2026` : why}`;
}

/** Words on one line: a program's text with its line breaks and runs of spaces each one space. */
export const folded = (text: string | undefined): string => (text ?? "").split(/\s+/).filter(Boolean).join(" ");

/**
 * A step's failures as its line says them: the count by kind (`failuresSaid`), and - where every job failed (`whyToo`) -
 * the first failure's why after it, folded to one line, unless the count says those words already: never twice.
 */
export function failuresLine(failures: readonly Failure[], of: number, whyToo: boolean): string[] {
  if (!failures.length) return [];
  const count = failuresSaid(failures, of);
  const why = folded(failures[0].why);
  return whyToo && why && !count.includes(why) ? [count, why] : [count];
}

/**
 * Failures counted by kind, in plain words, most first: "2 of 81 failed (1:
 * not converged; 1: the program stopped with an error)". `of` is how many
 * there were in all. Where every failure of a kind gave the same why, it is
 * said with it (`failureSaid`): "1 of 1 failed (1: the program stopped with an
 * error: <why>)"; where they differ, each is in its own record.
 */
export function failuresSaid(failures: readonly Failure[], of: number): string {
  const by = new Map<FailureKind, Failure[]>();
  for (const f of failures) by.set(f.kind, [...(by.get(f.kind) ?? []), f]);
  const counts = [...by].sort((a, b) => b[1].length - a[1].length || FAILURE_KINDS.indexOf(a[0]) - FAILURE_KINDS.indexOf(b[0]));
  const said = (k: FailureKind, all: readonly Failure[]) => (new Set(all.map((f) => failureSaid(f))).size === 1 ? failureSaid(all[0]) : FAILURE_WORDS[k]);
  return `${failures.length} of ${of} failed (${counts.map(([k, all]) => `${all.length}: ${said(k, all)}`).join("; ")})`;
}
