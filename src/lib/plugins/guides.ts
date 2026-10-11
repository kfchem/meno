/**
 * The guide shown (./guide): one plugin's at a time, a step at a time.
 * A plugin's guide is shown once, the first time the plugin is there - on
 * Meno's first start for one that comes added (Getting started), or as
 * soon as one is added that brings a guide - and then never of itself
 * again: gone through or skipped, it is kept as shown (settings
 * `plugins.guided`). Settings, Plugins, shows it again when asked.
 *
 * What the chemist does is noticed here (`guideNotice`): a step waiting for
 * it goes on by itself.
 */
import { create } from "zustand";
import { useAppSettings } from "../settings/appSettings";
import { ALL_PLUGINS, anyPluginById, runs, type Plugin } from "../calc/catalog";
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

/** Whether a plugin is there: added - one that runs nothing, unless taken away, before it is looked at. */
function isThere(p: Plugin): boolean {
  const state = useReaders.getState().state[p.id];
  if (state || runs(p)) return state === "added";
  return !useAppSettings.getState().plugins.removed.includes(p.id);
}

/** Shows a plugin's guide from its first step - shown before or not. */
export function showGuide(plugin: string): void {
  const p = anyPluginById(plugin);
  if (p?.guide.length) useGuide.setState({ open: { plugin, step: 0 } });
}

/** Shows the guide of the first plugin there that brings one not shown yet, where none is open - once the settings say which were shown. */
export function showGuidesDue(): void {
  if (useGuide.getState().open || !useAppSettings.getState().loaded) return;
  const { guided } = useAppSettings.getState().plugins;
  const due = ALL_PLUGINS.find((p) => p.guide.length && !guided.includes(p.id) && isThere(p));
  if (due) showGuide(due.id);
}

/** Keeps a guide as shown, so that it is not shown again of itself. */
function keepShown(plugin: string) {
  const settings = useAppSettings.getState();
  if (settings.plugins.guided.includes(plugin)) return;
  settings.setPlugins({ ...settings.plugins, guided: [...settings.plugins.guided, plugin] });
}

/** Closes the guide - gone through, or skipped - keeping it as shown; then the next plugin's due, if any. */
export function closeGuide(): void {
  const open = useGuide.getState().open;
  if (!open) return;
  useGuide.setState({ open: null });
  keepShown(open.plugin);
  showGuidesDue();
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

// (a plugin added: its guide due, if it brings one not shown; one taken
// away: its guide, where open, closed - not kept as shown)
useReaders.subscribe((s, prev) => {
  for (const [id, state] of Object.entries(s.state)) {
    if (state === prev.state[id]) continue;
    if (state === "absent" && useGuide.getState().open?.plugin === id) useGuide.setState({ open: null });
  }
  if (Object.entries(s.state).some(([id, state]) => state === "added" && prev.state[id] !== "added")) showGuidesDue();
});
