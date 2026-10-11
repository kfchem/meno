/**
 * Meno keeping itself up to date (src-tauri/src/update.rs): it looks on the
 * project's GitHub Releases for a newer Meno as it starts and every few
 * hours, downloads one in the background, and installs it as Meno quits -
 * or at once, when the user restarts into it.
 *
 * It uses the network as everything in Meno does (lib/net/network): under
 * its own purpose, which the user allows once (Meno asks, once, of its own
 * accord; after that only when the user turns it on in Settings), never
 * while Meno works offline, and with every connection shown as it is made.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { askToConnect, useNetwork, type ConsentRequest } from "./net/network";
import { useAppSettings } from "./settings/appSettings";
import { useGuide } from "./plugins/guides";

/** The purpose Meno's network knows updating by. */
export const UPDATE_PURPOSE = "app-update";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  /** downloaded and checked: installed as Meno quits */
  | "ready"
  /** nothing newer */
  | "current"
  | "failed"
  /** this Meno does not update itself: a development build, or one started for Office */
  | "unavailable";

export type UpdateState = {
  current: string;
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  /** When GitHub was last asked, ms since the epoch. */
  checked: number | null;
  error: string | null;
};

/** Where the updater is; null until the app has said. */
export const useUpdate = create<UpdateState | null>(() => null);

/** How soon after the settings are in Meno asks (once) whether it may keep itself up to date. */
const ASK_AFTER_MS = 3_000;
/** How soon after Meno starts it first looks, and how often after that. */
const FIRST_LOOK_MS = 20_000;
const EVERY_MS = 6 * 60 * 60 * 1000;

const CONSENT: ConsentRequest = {
  purpose: UPDATE_PURPOSE,
  title: "Keep Meno up to date?",
  detail:
    "Meno looks on GitHub for a newer version as it starts and every few hours while it runs, " +
    "downloads it in the background (about 20 MB), and installs it when you quit. Every " +
    "connection is shown as it is made, and nothing goes out while Meno works offline. " +
    "You can take this back in Settings, under Network.",
  // (GitHub hands a release's files out from release-assets, by redirect)
  sources: ["github.com", "release-assets.githubusercontent.com"],
};

/** Whether Meno may look now: online, and allowed to. */
export function mayLook(): boolean {
  const net = useNetwork.getState();
  return !net.offline && net.granted.includes(UPDATE_PURPOSE);
}

/** Looks for a newer Meno now, and downloads it - if it may. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri() || !mayLook()) return;
  useUpdate.setState(await invoke<UpdateState>("update_check"), true);
}

/** Turns keeping up to date on, asking as for any use of the network; it looks at once. */
export function keepUpToDate(): Promise<boolean> {
  return askToConnect(CONSENT);
}

/**
 * Restarts into the update downloaded: by quitting - so that unsaved work
 * is asked about first - after which it is installed and Meno started again.
 */
export async function restartIntoUpdate(): Promise<void> {
  await invoke("update_restart_after_quit");
  await getCurrentWindow().close();
}

/**
 * Starts keeping Meno up to date, once the settings are in: asks the once,
 * looks after a little while, then every few hours - and at once whenever
 * it becomes allowed (back online, or just turned on). Returns a stop.
 */
export function startUpdates(): () => void {
  if (!isTauri()) return () => {};
  let stopped = false;
  const stops: (() => void)[] = [];
  void (async () => {
    const state = await invoke<UpdateState>("update_state");
    useUpdate.setState(state, true);
    if (stopped || state.phase === "unavailable") return;
    const heard = await listen<UpdateState>("update:state", (e) => useUpdate.setState(e.payload, true));
    const askNow = () => {
      const settings = useAppSettings.getState();
      const net = useNetwork.getState();
      if (net.offline || net.granted.includes(UPDATE_PURPOSE) || settings.updates.asked) return;
      settings.setUpdates({ asked: true });
      void askToConnect(CONSENT);
    };
    let unguided: (() => void) | null = null;
    // (not over a guide being gone through: once it is closed)
    const ask = setTimeout(() => {
      if (!useGuide.getState().open) return askNow();
      unguided = useGuide.subscribe((g) => {
        if (g.open || stopped) return;
        unguided?.();
        unguided = null;
        askNow();
      });
    }, ASK_AFTER_MS);
    const first = setTimeout(() => void checkForUpdate(), FIRST_LOOK_MS);
    const every = setInterval(() => void checkForUpdate(), EVERY_MS);
    const unwatch = useNetwork.subscribe((s, prev) => {
      const now = !s.offline && s.granted.includes(UPDATE_PURPOSE);
      const before = !prev.offline && prev.granted.includes(UPDATE_PURPOSE);
      if (now && !before) void checkForUpdate();
    });
    stops.push(() => {
      heard();
      unguided?.();
      clearTimeout(ask);
      clearTimeout(first);
      clearInterval(every);
      unwatch();
    });
    if (stopped) stops.forEach((s) => s());
  })();
  return () => {
    stopped = true;
    stops.forEach((s) => s());
  };
}
