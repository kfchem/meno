/**
 * When a plugin's worker has gone unused long enough to be stopped
 * (docs/PLUGINS.md, *When plugins run*; the maintainer, 2026-10-13): 15
 * minutes with nothing asked of it unanswered and nothing heard from it.
 * Each question asked holds the clock; the last one answered - or let go
 * of, or given up on - starts it again, as does each line the worker says.
 * Once the time is up, the worker's own process (lib/plugins/process) says
 * whether it was stopped; one kept - a job of its plugin waiting or running
 * - is looked at again after as long again.
 */
import type { Watch } from "../calc/client";

/** How long a worker goes unused before it is stopped. */
export const IDLE_MS = 15 * 60_000;

/** A worker's questions heard as its queue hears them, and its lines; `busy` while any is unanswered. */
export type IdleWatch = Watch & {
  /** A line the worker said: it is at work. */
  heard(): void;
  busy(): boolean;
  /** The worker gone: the clock stopped for good. */
  end(): void;
};

/**
 * The clock of one worker: `onIdle` once it has gone `ms` unused - true
 * where it stopped the worker, false where it kept it (to be looked at
 * again). The clock starts at once.
 */
export function idleWatch(onIdle: () => boolean | Promise<boolean>, ms = IDLE_MS): IdleWatch {
  const asked = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  const hold = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    hold();
    if (ended || asked.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      void Promise.resolve()
        .then(onIdle)
        .catch(() => false)
        .then((stopped) => {
          if (stopped) ended = true;
          // (kept: looked at again after as long again - unless asked something meanwhile)
          else if (timer === undefined) arm();
        });
    }, ms);
  };
  const done = (id: number) => {
    asked.delete(id);
    arm();
  };
  arm();
  return {
    sent: (id) => {
      asked.add(id);
      hold();
    },
    settled: done,
    overdue: done,
    heard: () => {
      if (!asked.size) arm();
    },
    busy: () => asked.size > 0,
    end: () => {
      ended = true;
      hold();
    },
  };
}

/** One watch hearing as several do: a worker's queue and its clock, say. */
export function watchAll(...watches: readonly Watch[]): Watch {
  return {
    sent: (id) => watches.forEach((w) => w.sent(id)),
    settled: (id) => watches.forEach((w) => w.settled(id)),
    overdue: (id) => watches.forEach((w) => w.overdue(id)),
  };
}
