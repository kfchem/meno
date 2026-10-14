/**
 * How often the page looks at the jobs of the steps that run (docs/
 * WORKFLOWS.md, *Running*): often while a run is young - a quick step seen
 * to be done as soon as it is - then easing back to the step it looked at
 * before, so that a run that goes on costs no more to watch than it did.
 * The job runner looks as often at its side (src-tauri/src/jobs.rs
 * `step_at`).
 */

/** The step a look takes once a run has gone on, in ms. */
export const LOOK_MS = 1000;
/** The step while a run is young, for how long, and by when looks are back at `LOOK_MS`. */
export const QUICK_LOOK_MS = 100;
export const QUICK_FOR_MS = 3000;
export const EASED_BY_MS = 6000;

/** How long to wait before looking again, `young` ms into the newest run: quick at first, then more each time, linearly, until `LOOK_MS`. */
export function lookEvery(young: number): number {
  if (!(young > QUICK_FOR_MS)) return QUICK_LOOK_MS;
  if (young >= EASED_BY_MS) return LOOK_MS;
  return QUICK_LOOK_MS + ((LOOK_MS - QUICK_LOOK_MS) * (young - QUICK_FOR_MS)) / (EASED_BY_MS - QUICK_FOR_MS);
}
