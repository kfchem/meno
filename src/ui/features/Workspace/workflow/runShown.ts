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
export type PageNow = { view: Box | null; acts: number; selected: readonly unknown[]; tab: unknown; held: boolean; typing: boolean; /** Whether the document was changed other than by a run since the press (`watchEdits`). */ edited?: boolean };

/**
 * Whether a run's end may move the view: only where the chemist has done nothing on the page since they asked for it - no
 * press, no key (an edit, a menu, a card opened, a text written all take one), the same things selected, the same tab in
 * front, the view where it stood - and no press is held or text being written as it ends. Anything done: the view stays,
 * and nothing is said; what the run made is on the page beside its step.
 */
export function untouchedSince(began: PageNow, now: PageNow): boolean {
  if (now.held || now.typing || now.edited || now.acts !== began.acts || now.selected.length !== began.selected.length || now.selected.some((x, i) => x !== began.selected[i]) || now.tab !== began.tab) return false;
  return viewStillSince(began.view, now.view);
}

/** Whether the view stands where it stood: none known, never. */
export function viewStillSince(began: Box | null, now: Box | null): boolean {
  if (!began || !now) return false;
  const tol = 1e-6 * Math.max(began.x1 - began.x0, began.y1 - began.y0, 1e-9);
  return (["x0", "x1", "y0", "y1"] as const).every((k) => Math.abs(began[k] - now[k]) <= tol);
}

/** The labels of the steps a run itself puts in the document's history (store/slices/stepRuns): what it gave, as it ran. */
export const RUN_EDITS: ReadonlySet<string> = new Set(["run", "results", "render"]);

/** A document's history as a run's end reads it (lib/doc/document `DocumentStore`). */
type Watched = { subscribe(listener: () => void): () => void; lastChange(): "edit" | "travel" | "reset" | "amend"; history(): { undoLabel?: string } };

/**
 * Whether the document is changed, from now on, other than by a run: an undo or a redo (by the keys, or the app's own menu
 * bar, which sends the page no press and no key), the document put in anew, or an edit not among a run's own (`RUN_EDITS`) -
 * a paste, a cut, a delete from the menu bar. A run's results, and a rewrite in place (`amend`), are not the chemist's.
 */
export function watchEdits(doc: Watched): { edited: () => boolean; stop: () => void } {
  let edited = false;
  const stop = doc.subscribe(() => {
    const change = doc.lastChange();
    if (change === "travel" || change === "reset" || (change === "edit" && !RUN_EDITS.has(doc.history().undoLabel ?? ""))) edited = true;
  });
  return { edited: () => edited, stop };
}
