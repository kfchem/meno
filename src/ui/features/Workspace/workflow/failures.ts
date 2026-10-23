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
 * Failures counted by kind, in plain words, most first: "2 of 81 failed (1:
 * not converged; 1: the program stopped with an error)". `of` is how many
 * there were in all.
 */
export function failuresSaid(failures: readonly Failure[], of: number): string {
  const by = new Map<FailureKind, number>();
  for (const f of failures) by.set(f.kind, (by.get(f.kind) ?? 0) + 1);
  const counts = [...by].sort((a, b) => b[1] - a[1] || FAILURE_KINDS.indexOf(a[0]) - FAILURE_KINDS.indexOf(b[0]));
  return `${failures.length} of ${of} failed (${counts.map(([k, n]) => `${n}: ${FAILURE_WORDS[k]}`).join("; ")})`;
}
