import { useEffect, useReducer, useRef } from "react";
import { DURATION } from "./motion";

/**
 * What is in view, and what has just gone out of it: each of `items` as it
 * is, and each that was here and is not, kept as it last was for `ms` while
 * it fades out (with CSS's `meno-fade-out`), so nothing vanishes at once.
 */
export function usePresence<T>(items: readonly T[], keyOf: (item: T) => string, ms = DURATION.quick * 1000) {
  const seen = useRef(new Map<string, { item: T; leaving: boolean }>());
  // (each gone one's own time to go - not the render's: a render before it
  // was up cleared it, and what had gone was kept, unseen, for good)
  const timers = useRef(new Map<string, number>());
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const now = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    now.add(key);
    seen.current.set(key, { item, leaving: false });
  }
  for (const [key, e] of seen.current) {
    if (!now.has(key) && !e.leaving) e.leaving = true;
  }
  useEffect(() => {
    for (const [key, t] of timers.current) {
      if (seen.current.get(key)?.leaving) continue;
      // (back before its time was up)
      window.clearTimeout(t);
      timers.current.delete(key);
    }
    for (const [key, e] of seen.current) {
      if (!e.leaving || timers.current.has(key)) continue;
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key);
          if (!seen.current.get(key)?.leaving) return;
          seen.current.delete(key);
          wake();
        }, ms),
      );
    }
  });
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of all.values()) window.clearTimeout(t);
      all.clear();
    };
  }, []);
  return [...seen.current.entries()].map(([key, e]) => ({ key, item: e.item, leaving: e.leaving }));
}
