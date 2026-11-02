/**
 * What a calculation may warn of (docs/WORKFLOWS.md, *Failed*): a kind core
 * knows, with the program's own words - shown on the molecule's chip in
 * plain words and counted on its step's line. A warning never moves an
 * entry: only a failure does (the maintainer, 2026-10-22).
 */

/** How long a failure's or a warning's own words may be, in characters. */
export const WORDS_MOST = 300;

/**
 * What a calculation may warn of, by kind - each said in plain words
 * (`WARNING_WORDS`), none moving its entry (docs/PLUGINS.md, *The
 * contract*). A kind is what the warning says, whichever program says it:
 * `hessian-not-stationary`, frequencies worked out at a geometry its
 * program says is not a stationary point - given by any plugin whose
 * program says so, beside its own words; `other`, any else.
 */
export const WARNING_KINDS = ["hessian-not-stationary", "other"] as const;
export type WarningKind = (typeof WARNING_KINDS)[number];

/** A calculation's warning: its kind, and the program's own words. */
export type Warning = { kind: WarningKind; text: string };

export const WARNING_WORDS: Record<WarningKind, string> = {
  "hessian-not-stationary": "frequencies at a geometry not fully optimised",
  other: "a warning",
};

/** A kind of warning as a plugin names it: one core knows, else `other`. */
export const warningKindOf = (v: unknown): WarningKind => ((WARNING_KINDS as readonly unknown[]).includes(v) ? (v as WarningKind) : "other");

/** A plugin's warnings, as Meno takes them: each a kind core knows, with the program's words; those that are none left out. */
export function warningsOf(raw: unknown): Warning[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w) => {
    const text = typeof (w as { text?: unknown })?.text === "string" ? (w as { text: string }).text.trim().slice(0, WORDS_MOST) : "";
    return text ? [{ kind: warningKindOf((w as { kind?: unknown }).kind), text }] : [];
  });
}

