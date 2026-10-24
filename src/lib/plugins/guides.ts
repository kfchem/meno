/**
 * The guide shown (./guide): one plugin's at a time, a step at a time.
 * A plugin's guide is shown only when asked - Settings, Plugins, Show -
 * never of itself: not on Meno's first start, nor as its plugin is added.
 *
 * What the chemist does is noticed here (`guideNotice`): a step waiting for
 * it goes on by itself.
 */
import { create } from "zustand";
import { anyPluginById, type Plugin } from "../calc/catalog";
import { useReaders } from "../calc/workers";
import type { GuideEvent, GuideStep } from "./guide";

/** The guide open: whose, and which of its steps. */
export type OpenGuide = { plugin: string; step: number };

export const useGuide = create<{ open: OpenGuide | null }>(() => ({ open: null }));

/** How long a step that waited for something stays after it is done, before the next: long enough to see it was. */
export const NOTICED_MS = 450;

/** The step shown, and its plugin; none, where no guide is open. */
export function shownStep(open = useGuide.getState().open): { plugin: Plugin; step: GuideStep; at: number; of: number } | null {
  const plugin = open ? anyPluginById(open.plugin) : undefined;
  const step = plugin?.guide[open!.step];
  return plugin && step ? { plugin, step, at: open!.step, of: plugin.guide.length } : null;
}

/** Shows a plugin's guide from its first step - shown before or not. */
export function showGuide(plugin: string): void {
  const p = anyPluginById(plugin);
  if (p?.guide.length) useGuide.setState({ open: { plugin, step: 0 } });
}

/** Closes the guide - gone through, or skipped. */
export function closeGuide(): void {
  if (useGuide.getState().open) useGuide.setState({ open: null });
}

/**
 * A key pressed while a guide is open: Escape skips it, as Skip does (the
 * maintainer, 2026-10-13) - unless something else took that Escape first
 * (`taken`: a label being written, a menu, a drag), which is all it does.
 * Whether it closed the guide.
 */
export function keyOnGuide(key: string, taken: boolean): boolean {
  if (key !== "Escape" || taken || !useGuide.getState().open) return false;
  closeGuide();
  return true;
}

/** Goes on to the guide's next step; after its last, closes it. */
export function nextStep(): void {
  const shown = shownStep();
  if (!shown) return;
  if (shown.at + 1 < shown.of) useGuide.setState({ open: { plugin: shown.plugin.id, step: shown.at + 1 } });
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
    const now = useGuide.getState().open;
    if (now && was && now.plugin === was.plugin && now.step === was.step) nextStep();
  }, NOTICED_MS);
}

// (a plugin taken away: its guide, where open, closed)
useReaders.subscribe((s, prev) => {
  for (const [id, state] of Object.entries(s.state)) {
    if (state === prev.state[id]) continue;
    if (state === "absent" && useGuide.getState().open?.plugin === id) useGuide.setState({ open: null });
  }
});
