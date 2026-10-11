/**
 * The kinds of a workflow's step Meno defines (docs/WORKFLOWS.md, *Kinds of
 * step*), by their ids, and what flows along a wire between steps. Plugins
 * fill these kinds and bring none of their own: a manifest's step of a kind
 * not here is left out (./manifest). What each kind takes and gives, and how
 * it is shown, is the workspace's (ui/features/Workspace/workflow/kinds).
 */

export const STEP_KINDS = ["conformers", "optimise", "energy", "frequencies", "energy-window", "duplicates", "populations", "as-conformers", "choose"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** What flows along a wire: structures drawn (any not yet in 3D), molecules in 3D each a compound, or conformer sets. */
export const SET_KINDS = ["structures", "molecules", "conformers"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/** Whether an id is a kind of step Meno defines. */
export const isStepKind = (id: string): id is StepKind => (STEP_KINDS as readonly string[]).includes(id);
