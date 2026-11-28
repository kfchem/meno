/**
 * What the end of a run shows - *Run*, *Run from here* and *Run all* alike
 * (docs/WORKFLOWS.md, *Starting and stopping*): the sets its steps made, as what is put down is shown
 * (utils/viewShow) - the view eased along, or out as little as needed, only
 * where they are not seen whole; and never where the chemist has taken the
 * view meanwhile: moved it since the run began, or holding a press as it
 * ends.
 */
import type { WorkspaceDocument } from "../document";
import { setsOnPage } from "./onPage";
import { partsBounds } from "./parts";
import { stepOf, stepsRun, type Flow } from "./flow";

type Box = { x0: number; x1: number; y0: number; y1: number };

/**
 * The steps a run of `targets` runs: each, those before it it runs first (flow `stepsRun`), and those a Repeat among them
 * holds - it runs them, pass by pass.
 */
export function ranBy(doc: Flow, targets: readonly number[]): number[] {
  const ran = stepsRun(doc, targets);
  const held = ran.flatMap((id) => stepOf(doc, id)?.holds ?? []);
  return [...new Set([...ran, ...held])];
}

/** How far the sets that the steps `ran` made reach on the page: those drawn on it, not those held. Null where they made none drawn. */
export function madeByRun(doc: Pick<WorkspaceDocument, "sets" | "wires" | "steps">, ran: readonly number[]): Box | null {
  const steps = new Set(ran);
  return partsBounds({ sets: setsOnPage(doc, (doc.sets ?? []).filter((b) => b.made && steps.has(b.made.step))), steps: [], wires: [] });
}

/** Whether a run's end may move the view: it stands where it stood as the run began - none known, never - and no press is held. */
export function viewStillSince(began: Box | null, now: Box | null, held: boolean): boolean {
  if (!began || !now || held) return false;
  const tol = 1e-6 * Math.max(began.x1 - began.x0, began.y1 - began.y0, 1e-9);
  return (["x0", "x1", "y0", "y1"] as const).every((k) => Math.abs(began[k] - now[k]) <= tol);
}
