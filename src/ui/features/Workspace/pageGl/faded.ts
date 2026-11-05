import { useEffect, useReducer, useRef } from "react";
import { DURATION } from "../../../theme/motion";

/** Where a thing is in its fade: come at `since` (ms), or going since then. */
type Seen<T> = { item: T; since: number; leaving: boolean };

/** How opaque a thing is `now` (ms), `ms` its fade's length: coming, up from none; going, down to none. */
export function fadeAt(e: { since: number; leaving: boolean }, now: number, ms: number): number {
  const t = Math.min(1, Math.max(0, (now - e.since) / ms));
  return e.leaving ? 1 - t : t;
}

/**
 * What WebGL draws on the page coming and going as its HTML did
 * (`meno-fade-in`, `meno-fade-out`, theme/presence): each of `items` faded in
 * as it comes, and each gone kept as it last was while it fades out - from
 * where it was, should it turn back mid-way - frame by frame while any
 * fades. Each with how opaque it is now, and whether it is going.
 */
export function useFaded<T>(items: readonly T[], keyOf: (item: T) => string, ms = DURATION.quick * 1000): { key: string; item: T; opacity: number; leaving: boolean }[] {
  const seen = useRef(new Map<string, Seen<T>>());
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const now = performance.now();
  const here = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    here.add(key);
    const e = seen.current.get(key);
    // (back mid-way out: in again from as far as it had gone)
    if (!e || e.leaving) seen.current.set(key, { item, since: e ? now - fadeAt(e, now, ms) * ms : now, leaving: false });
    else e.item = item;
  }
  for (const [key, e] of seen.current) {
    if (here.has(key) || e.leaving) continue;
    seen.current.set(key, { item: e.item, since: now - (1 - fadeAt(e, now, ms)) * ms, leaving: true });
  }
  const out: { key: string; item: T; opacity: number; leaving: boolean }[] = [];
  let fading = false;
  for (const [key, e] of seen.current) {
    const opacity = fadeAt(e, now, ms);
    if (e.leaving && opacity <= 0) {
      seen.current.delete(key);
      continue;
    }
    if (opacity < 1 || e.leaving) fading = true;
    out.push({ key, item: e.item, opacity, leaving: e.leaving });
  }
  useEffect(() => {
    if (!fading) return;
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });
  return out;
}
