/**
 * Meno keeping itself up to date (src-tauri/src/update.rs): it looks on the
 * project's GitHub Releases for a newer Meno shortly after it starts and
 * once a day while it runs, downloads one in the background, and installs it
 * as Meno quits - or at once, when the user restarts into it. On Windows, not
 * while jobs wait or run: installing would stop them (docs/WORKFLOWS.md,
 * *When Meno closes*).
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
import { askToConnect, useNetwork, type ConsentRequest, type NetTask } from "./net/network";
import { useAppSettings } from "./settings/appSettings";
import { useGuide } from "./plugins/guides";
import { afterFirstAction } from "./firstAction";

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
  /** How many jobs wait or run that installing the update would stop: it waits for them (Windows). */
  held: number;
};

/** Where the updater is; null until the app has said. */
export const useUpdate = create<UpdateState | null>(() => null);

/** How soon after Meno starts it first looks, and how often after that. */
const FIRST_LOOK_MS = 20_000;
export const EVERY_MS = 24 * 60 * 60 * 1000;
/**
 * How often Meno sees whether a day has gone by. The day is told by the wall
 * clock, not by a timer of EVERY_MS: a web view's timers do not count the
 * time a Mac sleeps, so a Mac awake 8 hours a day would look every 3 days.
 */
const TICK_MS = 10 * 60 * 1000;
/** How often, with an update ready, Meno looks again at the jobs it waits for. */
const HELD_EVERY_MS = 10_000;

/** Where keeping up to date goes: GitHub, which hands a release's files out from release-assets, by redirect. */
const UPDATE_HOSTS = ["github.com", "release-assets.githubusercontent.com"];

export const UPDATE_CONSENT: ConsentRequest = {
  purpose: UPDATE_PURPOSE,
  title: "Keep Meno up to date?",
  // (that each connection is shown and recorded, that none is made offline, and that a yes can be taken back: the
  //  dialog's small print, said once for every question - ui/network/ConsentDialog)
  detail:
    "Meno looks on GitHub for a newer version shortly after it starts and once a day while it runs, " +
    "downloads it in the background (about 20 MB), and installs it when you quit.",
  sources: UPDATE_HOSTS,
  // (and the hosts the look may reach: those alone - src-tauri/src/net.rs)
  hosts: UPDATE_HOSTS,
};

/**
 * The update's network tasks that came to download a newer Meno, by id. A
 * look and the download it leads to are one task (src-tauri/src/update.rs,
 * `look`): the task is a download once the updater says it is downloading.
 */
export const useUpdateDownloads = create<{ tasks: string[] }>(() => ({ tasks: [] }));

// (the update's task running as the download begins: a download from then on, its notice shown from its first byte)
useUpdate.subscribe((u, was) => {
  if (u?.phase !== "downloading" || was?.phase === "downloading") return;
  const running = Object.values(useNetwork.getState().tasks).filter((t) => t.purpose === UPDATE_PURPOSE && !t.ended);
  if (running.length) useUpdateDownloads.setState((d) => ({ tasks: [...new Set([...d.tasks, ...running.map((t) => t.id)])] }));
});

/**
 * Whether a task's notice shows in the corner (ui/network/NetworkToasts):
 * always, but a look for a newer Meno's where the user turned that off -
 * the one notice that can be. A look that finds a newer Meno and downloads
 * it shows its notice from the download's start: only the look itself is
 * hidden. The record keeps every look either way.
 */
export function noticeShown(
  task: Pick<NetTask, "id" | "purpose" | "ended">,
  updateNotice: boolean,
  update: { phase?: UpdatePhase; downloads: readonly string[] } = { phase: useUpdate.getState()?.phase, downloads: useUpdateDownloads.getState().tasks },
): boolean {
  if (updateNotice || task.purpose !== UPDATE_PURPOSE) return true;
  // (the update downloading now, this task still running: the download, whether or not it was seen to begin)
  if (!task.ended && update.phase === "downloading") return true;
  return update.downloads.includes(task.id);
}

/** Whether Meno may look now: online, and allowed to. */
export function mayLook(): boolean {
  const net = useNetwork.getState();
  return !net.offline && net.granted.includes(UPDATE_PURPOSE);
}

/** Where no look is due: none in this Meno, one under way, or an update ready - which a look would only report again. */
const NOT_DUE: ReadonlySet<UpdatePhase> = new Set(["unavailable", "checking", "downloading", "ready"]);

/**
 * Whether a look is due at `now` (ms since the epoch): allowed, none under
 * way, no update ready already, and a day gone by the wall clock since
 * GitHub was last asked - or never asked yet, a look missed while offline
 * among them. `checked` is set as GitHub answers, or fails to: a failure
 * before that - Meno's network not up, the updater not built, the look
 * refused a start - leaves it as it was, and the next tick tries again,
 * with nothing sent meanwhile.
 */
export function lookDue(u: UpdateState | null, now: number, allowed: boolean): boolean {
  if (!allowed || !u || NOT_DUE.has(u.phase)) return false;
  return u.checked == null || now - u.checked >= EVERY_MS;
}

/**
 * Looks once a day while Meno runs: every TICK_MS, and as its window comes
 * back - shown again, or brought to the front, as when a Mac wakes - it looks
 * if a look is due (lookDue), one at a time. Returns a stop.
 */
export function looksDaily(
  win: EventTarget,
  doc: EventTarget & { visibilityState: DocumentVisibilityState },
  look: () => Promise<void>,
): () => void {
  let looking = false;
  const maybe = () => {
    if (looking || !lookDue(useUpdate.getState(), Date.now(), mayLook())) return;
    looking = true;
    void look().finally(() => {
      looking = false;
    });
  };
  const shown = () => {
    if (doc.visibilityState === "visible") maybe();
  };
  const tick = setInterval(maybe, TICK_MS);
  win.addEventListener("focus", maybe);
  doc.addEventListener("visibilitychange", shown);
  return () => {
    clearInterval(tick);
    win.removeEventListener("focus", maybe);
    doc.removeEventListener("visibilitychange", shown);
  };
}

/** Looks for a newer Meno now, and downloads it - if it may. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri() || !mayLook()) return;
  useUpdate.setState(await invoke<UpdateState>("update_check", { hosts: UPDATE_CONSENT.hosts }), true);
}

/** Turns keeping up to date on, asking as for any use of the network; it looks at once. */
export function keepUpToDate(): Promise<boolean> {
  return askToConnect(UPDATE_CONSENT);
}

/** When an update ready goes in, in words: as Meno quits - once no job waits or runs, where it waits for some. */
export function readySaid(u: Pick<UpdateState, "version" | "held">): string {
  const ready = `Meno ${u.version ?? ""} is ready`;
  if (!u.held) return `${ready}. It goes in when you quit Meno.`;
  const jobs = u.held === 1 ? "the job waiting or running" : `the ${u.held} jobs waiting or running`;
  return `${ready}. It goes in when you quit Meno with no jobs waiting or running: installing it now would stop ${jobs}.`;
}

/**
 * Restarts into the update downloaded: by quitting - so that unsaved work
 * is asked about first - after which it is installed and Meno started again.
 * Not while jobs wait or run that installing would stop: then Meno stays,
 * and what the update waits for is said.
 */
export async function restartIntoUpdate(): Promise<void> {
  try {
    await invoke("update_restart_after_quit");
  } catch {
    useUpdate.setState(await invoke<UpdateState>("update_state"), true);
    return;
  }
  await getCurrentWindow().close();
}

/**
 * Starts keeping Meno up to date, once the settings are in: asks the once -
 * after the user's first action (lib/firstAction), once it has ended, never
 * before - looks after a little while, then once a day by the wall clock
 * (looksDaily), and at once whenever it becomes allowed (back online, or
 * just turned on). Returns a stop.
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
      // (kept as asked once answered - yes or not now: a question left open as Meno quits is asked again, after the next run's first action)
      void askToConnect(UPDATE_CONSENT).then(() => {
        const now = useAppSettings.getState();
        now.setUpdates({ ...now.updates, asked: true });
      });
    };
    // (not in the middle of what the user is doing - the pointer held - nor over a guide being gone through)
    let pressed = false;
    const ask = afterFirstAction(
      askNow,
      () => pressed || !!useGuide.getState().open,
      (changed) => {
        const down = () => {
          pressed = true;
        };
        const up = () => {
          pressed = false;
          changed();
        };
        window.addEventListener("pointerdown", down, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
        const unguided = useGuide.subscribe(changed);
        return () => {
          window.removeEventListener("pointerdown", down, true);
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", up, true);
          unguided();
        };
      },
    );
    // (the daily looks from the first on: a window brought to the front as Meno starts does not look before it)
    let daily = () => {};
    const first = setTimeout(() => {
      void checkForUpdate();
      daily = looksDaily(window, document, checkForUpdate);
    }, FIRST_LOOK_MS);
    // (an update ready: the jobs it waits for, as they start and end)
    const held = setInterval(() => {
      if (useUpdate.getState()?.phase === "ready") void invoke<UpdateState>("update_state").then((s) => useUpdate.setState(s, true));
    }, HELD_EVERY_MS);
    const unwatch = useNetwork.subscribe((s, prev) => {
      const now = !s.offline && s.granted.includes(UPDATE_PURPOSE);
      const before = !prev.offline && prev.granted.includes(UPDATE_PURPOSE);
      if (now && !before) void checkForUpdate();
    });
    stops.push(() => {
      heard();
      ask();
      clearTimeout(first);
      daily();
      clearInterval(held);
      unwatch();
    });
    if (stopped) stops.forEach((s) => s());
  })();
  return () => {
    stopped = true;
    stops.forEach((s) => s());
  };
}
