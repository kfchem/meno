/**
 * Meno's first steps, shown (./steps): a step at a time. Shown only when
 * asked - Settings, General, First steps - never of itself: not on Meno's
 * first start, nor after an update.
 *
 * What the chemist does is noticed here (`guideNotice`): a step waiting for
 * it goes on by itself.
 */
import { create } from "zustand";
import { FIRST_STEPS, type GuideEvent, type GuideStep } from "./steps";

/** The step shown, by its place among the first steps; none, where the guide is closed. */
export const useGuide = create<{ open: number | null }>(() => ({ open: null }));

/** How long a step that waited for something stays after it is done, before the next: long enough to see it was. */
export const NOTICED_MS = 450;

/** The step shown, where it is among them, and how many there are; none, where the guide is closed. */
export function shownStep(open = useGuide.getState().open): { step: GuideStep; at: number; of: number } | null {
  const step = open == null ? undefined : FIRST_STEPS[open];
  return step ? { step, at: open!, of: FIRST_STEPS.length } : null;
}

/** Shows the first steps from the first - shown before or not. */
export function showGuide(): void {
  useGuide.setState({ open: 0 });
}

/** Closes the guide - gone through, or skipped. */
export function closeGuide(): void {
  if (useGuide.getState().open != null) useGuide.setState({ open: null });
}

/**
 * A key pressed while the guide is open: Escape skips it, as Skip does (the
 * maintainer, 2026-10-13) - unless something else took that Escape first
 * (`taken`: a label being written, a menu, a drag), which is all it does.
 * Whether it closed the guide.
 */
export function keyOnGuide(key: string, taken: boolean): boolean {
  if (key !== "Escape" || taken || useGuide.getState().open == null) return false;
  closeGuide();
  return true;
}

/** Goes on to the next step; after the last, closes the guide. */
export function nextStep(): void {
  const shown = shownStep();
  if (!shown) return;
  if (shown.at + 1 < shown.of) useGuide.setState({ open: shown.at + 1 });
  else closeGuide();
}

let noticed: ReturnType<typeof setTimeout> | null = null;

/** What the chemist did: the step waiting for it goes on, after a moment. */
export function guideNotice(event: GuideEvent): void {
  const shown = shownStep();
  if (!shown || shown.step.until !== event || noticed) return;
  const was = useGuide.getState().open;
  noticed = setTimeout(() => {
    noticed = null;
    // (still the step that waited: not one the chemist went on from meanwhile)
    if (useGuide.getState().open === was) nextStep();
  }, NOTICED_MS);
}
