/**
 * The computer kept awake while a plugin's worker works on what it was
 * asked (docs/PLUGINS.md, *When plugins run*), as it is while a job runs: a
 * step its worker computes itself - conformers made on the page, a step of
 * Meno's asked of it - can take long, and a computer gone to sleep halfway
 * through it loses the time. A question still unanswered `AWAKE_AFTER_MS`
 * after it was asked holds it, for every worker at once; the last one at
 * work answered, it is let go `LET_GO_MS` later, unless asked again. A
 * quick question - a structure checked as it is drawn - holds nothing.
 * Settings' "Keep the computer awake while calculations run" holds for this too:
 * the backend asks it as it holds (src-tauri/src/jobs.rs `worker_awake`).
 */
import { invoke } from "@tauri-apps/api/core";
import type { Watch } from "../calc/client";

/** How long a question goes unanswered before the computer is kept awake for it. */
export const AWAKE_AFTER_MS = 10_000;
/** How long after the last question at work is answered the computer is let go: a step asked of a worker in rounds holds it once. */
export const LET_GO_MS = 3_000;

/** One worker's questions, as its queue hears them; `end` once it is gone, letting go of what it held. */
export type AwakeWatch = Watch & { end(): void };

/**
 * Workers kept awake together: `tell(true)` as the first of them has been
 * at work `ms`, `tell(false)` once none is, `letGo` after the last.
 */
export function workersAwake(tell: (held: boolean) => void, ms = AWAKE_AFTER_MS, letGo = LET_GO_MS): { watch(): AwakeWatch } {
  let working = 0;
  let held = false;
  let release: ReturnType<typeof setTimeout> | undefined;
  const more = () => {
    if (release !== undefined) clearTimeout(release);
    release = undefined;
    working++;
    if (!held) {
      held = true;
      tell(true);
    }
  };
  const less = () => {
    if (--working > 0) return;
    release = setTimeout(() => {
      release = undefined;
      if (working > 0) return;
      held = false;
      tell(false);
    }, letGo);
  };
  return {
    watch() {
      const asked = new Set<number>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let holding = false;
      const done = (id: number) => {
        asked.delete(id);
        if (asked.size) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (holding) {
          holding = false;
          less();
        }
      };
      return {
        sent: (id) => {
          asked.add(id);
          if (holding || timer !== undefined) return;
          // (asked as the hold is about to be let go - the next round of a step: kept at once)
          if (release !== undefined) {
            holding = true;
            return more();
          }
          timer = setTimeout(() => {
            timer = undefined;
            if (!asked.size || holding) return;
            holding = true;
            more();
          }, ms);
        },
        settled: done,
        overdue: done,
        end: () => {
          for (const id of [...asked]) done(id);
        },
      };
    },
  };
}

/** Meno's workers, kept awake through the backend. */
export const awake = workersAwake((held) => void invoke("worker_awake", { held }).catch(() => {}));
