/**
 * The window given over to a talk (docs/PRESENTING.md): while a workspace
 * presents its slides, Meno's title bar - its tabs, Save, Settings - makes
 * way for it, and the window fills the screen. Which workspace presents is
 * its own; that one does, the window's.
 */
import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Whether a talk is being given in the window, and since when - or when
 * the last one ended. What the window would say in its corners meanwhile -
 * the network's cards, notices, a question about the network, an update
 * ready - waits until it ends (the maintainer, 2026-10-11): nothing comes
 * up over a talk, and nothing is missed.
 */
export const usePresentingWindow = create<{ on: boolean; since?: number; ended?: number }>(() => ({ on: false }));

/** A talk begun in the window, or ended. */
export function setPresentingWindow(on: boolean): void {
  const now = Date.now();
  usePresentingWindow.setState((s) => (on ? { on: true, since: now, ended: undefined } : { on: false, since: s.since, ended: now }));
}

/**
 * The window full screen for a talk, or back as it was: `on`, made full
 * screen where it was not, and told whether it was made so - so that only
 * a window the talk made full screen is put back. On a Mac, over the
 * screen where the window is - its menu bar and Dock hidden - as slides
 * software plays a talk, not in a space of its own, which the system slides
 * to and away from; elsewhere, the system's full screen (src-tauri
 * present.rs). Outside the app (a page in a browser), the page's own full
 * screen.
 */
export async function windowFullScreen(on: boolean): Promise<boolean> {
  try {
    if (isTauri()) return await invoke<boolean>("present_window", { on });
    if (typeof document === "undefined") return false;
    if (on) {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return false;
      await document.documentElement.requestFullscreen();
      return true;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    return true;
  } catch {
    // (a window that cannot be made full screen gives the talk what it has)
    return false;
  }
}
