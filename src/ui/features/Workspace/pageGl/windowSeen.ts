import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { tellWindowSeen } from "./runningTick";

/** The event the back end tells the page by whether Meno's window can be seen, and the command that says it now (src-tauri/src/windowseen.rs). */
export const WINDOW_SEEN_EVENT = "window:seen";
export const WINDOW_SEEN_COMMAND = "window_seen";

let heard: Promise<void> | null = null;

/**
 * Hears the back end's word on whether Meno's window can be seen - minimised
 * or hidden, it cannot - and gives it to the running marks' gate
 * (runningTick): asked once as it starts (a window started minimised), then
 * told at each change. Outside the app, or where asking fails, no word: the
 * window taken as seen. Once for the page, however often it is called.
 */
export function hearWindowSeen(): Promise<void> {
  heard ??= (async () => {
    if (!isTauri()) return;
    try {
      await listen<boolean>(WINDOW_SEEN_EVENT, (e) => tellWindowSeen(e.payload));
      tellWindowSeen(await invoke<boolean>(WINDOW_SEEN_COMMAND));
    } catch (e) {
      console.warn(`whether the window is seen not heard: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
  return heard;
}
