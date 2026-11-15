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
  "mode-on-atoms",
  "path-search",
  "rank",
  "join",
  "restraints",
  "torsion-restraints",
  "compare-torsions",
  "number",
  "add",
  "atom-map",
  "reaction-path",
  "saddle-point",
  "barrier",
  "ensemble",
  "onto-structures",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/**
 * The kinds only Meno does: its judgements, and rules of its own that run no
 * program (docs/WORKFLOWS-FOUNDATION.md, *Enumerate is Meno's own*; the plugin
 * boundary, 2026-10-31 - a plugin runs its program and converts what it made,
 * and fills only kinds that run one). A manifest's step of one is left out, as
 * one of a kind not here is. *Check structures* is Meno's on what the plugin
 * that does the checks makes of each structure (workflow/checkStructures);
 * *Stereoisomers*, on what the plugin that finds stereoisomers perceives and
 * makes (workflow/stereoisomers).
 */
export const MENO_ONLY: readonly StepKind[] = [
  "energy-window",
  "duplicates",
  "populations",
  "as-conformers",
  "choose",
  "filter",
  "chart",
  "energy-diagram",
  "check-structures",
  "stereoisomers",
  "enumerate",
  "tag",
  "species",
  "combine",
  "measure",
  "merge",
  "rebond",
  "compare-bonding",
  "take-frames",
  "displace",
  "atom-map",
  "mode-on-atoms",
  "number",
  "add",
  "restraints",
  "torsion-restraints",
  "compare-torsions",
  "join",
  "rank",
  "ensemble",
  "barrier",
  "onto-structures",
];

/**
 * The kinds of step through which a lone atom - the ion of a salt drawn as
 * ions - passes as it came, where its plugin says its program takes none
 * (`StepDecl.noLoneAtom`): it has no conformers to find, and nothing to
 * optimise. Through any other kind, it goes to the plugin as any entry does.
 */
export const LONE_ATOM_PASSES: readonly StepKind[] = ["conformers", "optimise"];

/**
 * The kinds of step that may hold restraints as their program runs - the
 * rows of a *Restraints* table wired into their *Restraints* input
 * (workflow/kinds `RESTRAINTS_INPUT`), each molecule its own - where its
 * plugin says what it holds (`StepDecl.restraints`): a conformer search, a
 * minimisation, an optimisation, a path search, an optimisation to a saddle
 * point (its card one port's step taller for its fourth input). A row a
 * plugin does not say it holds is refused before anything is sent, never
 * left unheld unsaid, nor held another way.
 */
export const HOLDS_RESTRAINTS: readonly StepKind[] = ["conformers", "minimise", "optimise", "path-search", "saddle-point"];

/**
 * The kinds of restraint a step's program may hold as it runs (lib/entry
 * `Restraint`): atoms fixed where they stand; a distance or a torsion held
 * by a strength (restrained); or held exactly at its value (constrained:
 * `-exact`). A manifest names those its program holds; one it does not name
 * it does not hold.
 */
export const HELD_KINDS = ["fixed", "distance", "dihedral", "distance-exact", "dihedral-exact"] as const;
export type HeldKind = (typeof HELD_KINDS)[number];

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
