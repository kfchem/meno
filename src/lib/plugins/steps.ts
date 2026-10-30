/**
 * The kinds of a workflow's step Meno defines (docs/WORKFLOWS.md, *Kinds of
 * step*), by their ids, and what flows along a wire between steps. Plugins
 * fill these kinds and bring none of their own: a manifest's step of a kind
 * not here is left out (./manifest). What each kind takes and gives, and how
 * it is shown, is the workspace's (ui/features/Workspace/workflow/kinds).
 */

export const STEP_KINDS = [
  "generate",
  "conformers",
  "optimise",
  "minimise",
  "energy",
  "frequencies",
  "nci",
  "render",
  "energy-window",
  "duplicates",
  "populations",
  "as-conformers",
  "choose",
  "filter",
  "check-structures",
  "stereoisomers",
  "descriptors",
  "enumerate",
  "chart",
  "energy-diagram",
  "tag",
  "species",
  "combine",
  "measure",
  "merge",
  "rebond",
  "compare-bonding",
  "take-frames",
  "displace",
  "path-search",
  "rank",
  "join",
  "restraints",
  "torsion-restraints",
  "number",
  "add",
  "reaction",
  "reaction-path",
  "saddle-point",
  "barrier",
  "ensemble",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/**
 * The kinds only Meno does, by a rule of its own that runs no program
 * (docs/WORKFLOWS-FOUNDATION.md, *Enumerate is Meno's own*): a manifest's
 * step of one is left out, as one of a kind not here is.
 */
export const MENO_ONLY: readonly StepKind[] = ["enumerate", "tag", "species", "combine", "measure", "merge", "rebond", "compare-bonding", "take-frames", "displace", "reaction", "number", "add", "restraints", "torsion-restraints", "join", "rank", "ensemble", "barrier"];

/** What flows along a wire: structures drawn (any not yet in 3D), molecules in 3D each a compound, or conformer sets. */
export const SET_KINDS = ["structures", "molecules", "conformers"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/**
 * What flows along a wire, besides (docs/WORKFLOWS-FOUNDATION.md, *Values
 * and their types*): a set's kinds, a table (lib/table) or a number with
 * its unit. Plugins take and give these, and bring none of their own; a
 * chart is Meno's alone, and goes into no step.
 */
export const VALUE_KINDS = [...SET_KINDS, "table", "number"] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

/** Whether an id is a kind of step Meno defines. */
export const isStepKind = (id: string): id is StepKind => (STEP_KINDS as readonly string[]).includes(id);
