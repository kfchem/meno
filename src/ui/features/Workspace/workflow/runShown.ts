/**
 * What the end of a run shows - *Run*, *Run from here* and *Run all* alike
 * (docs/WORKFLOWS.md, *Starting and stopping*): the sets its steps made, as what is put down is shown
 * (utils/viewShow) - the view eased along, or out as little as needed, only
 * where they are not seen whole; and only where the chemist has done
 * nothing on the page since they asked for it (`untouchedSince`).
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

/** How the page stood as a run was asked for, or stands as it ends: the view, the presses and keys so far, what is selected, the tab in front. */
export type PageNow = { view: Box | null; acts: number; selected: readonly unknown[]; tab: unknown; held: boolean; typing: boolean; };

/**
 * Whether a run's end may move the view: only where the chemist has done nothing on the page since they asked for it - no
 * press, no key (an edit, a menu, a card opened, a text written all take one), the same things selected, the same tab in
 * front, the view where it stood - and no press is held or text being written as it ends. Anything done: the view stays,
 * and nothing is said; what the run made is on the page beside its step.
 */
export function untouchedSince(began: PageNow, now: PageNow): boolean {
  if (now.held || now.typing || now.acts !== began.acts || now.selected.length !== began.selected.length || now.selected.some((x, i) => x !== began.selected[i]) || now.tab !== began.tab) return false;
  return viewStillSince(began.view, now.view);
}

/** Whether the view stands where it stood: none known, never. */
export function viewStillSince(began: Box | null, now: Box | null): boolean {
  if (!began || !now) return false;
  const tol = 1e-6 * Math.max(began.x1 - began.x0, began.y1 - began.y0, 1e-9);
  return (["x0", "x1", "y0", "y1"] as const).every((k) => Math.abs(began[k] - now[k]) <= tol);
}

