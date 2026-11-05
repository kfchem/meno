import { useEffect, useReducer, useRef } from "react";
import { fading, presenceAt, presentAt, type Present } from "./presence";

/**
 * What WebGL draws on the page coming and going as its HTML did
 * (`meno-fade-in`, `meno-fade-out`), over Meno's base time and easing
 * (./presence): each of `items` faded in as it comes - those there as the
 * page is first drawn there at once - and each gone kept as it last was
 * while it fades out, frame by frame while any fades. Each with how
 * present it is now, and whether it is going.
 */
export function useFaded<T>(items: readonly T[], keyOf: (item: T) => string): { key: string; item: T; opacity: number; leaving: boolean }[] {
  const was = useRef<Map<string, Present<{ key: string; item: T }>> | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const now = performance.now();
  const present = presentAt(
    was.current ?? new Map(),
    items.map((item) => ({ key: keyOf(item), item })),
    now,
    was.current == null,
  );
  was.current = present;
  const still = fading(present, now);
  useEffect(() => {
    if (!still) return;
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });
  return [...present.values()].map((p) => ({ key: p.item.key, item: p.item.item, opacity: presenceAt(p, now), leaving: p.gone != null }));
}

/** A value `ms` milliseconds a step nearer `to` from `at`, `rate` a whole unit in `ms`. */
export function stepToward(at: number, to: number, dtMs: number, ms: number): number {
  const k = dtMs / ms;
  return at < to ? Math.min(to, at + k) : Math.max(to, at - k);
}

/**
 * Values by key eased toward `targets` frame by frame - a whole unit in `ms`,
 * as CSS eases a colour (a port lit, pointed at) - each a key's first value
 * as it comes; none eased while each is where it is going.
 */
export function useEasedValues(targets: ReadonlyMap<string, number>, ms = 150): ReadonlyMap<string, number> {
  const now = useRef(new Map<string, number>());
  const last = useRef<number | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const t = performance.now();
  const dt = last.current == null ? 0 : Math.min(t - last.current, 1000 / 30);
  last.current = t;
  let moving = false;
  const out = new Map<string, number>();
  for (const [key, to] of targets) {
    const at = now.current.get(key);
    const v = at == null ? to : stepToward(at, to, dt, ms);
    if (v !== to) moving = true;
    out.set(key, v);
  }
  now.current = out;
  useEffect(() => {
    if (!moving) {
      last.current = null;
      return;
    }
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });
  return out;
}

/**
 * How long each of `keys` has been here, in ms, from the first time it was
 * - frame by frame while any is younger than `until` (a mark's moment): what
 * fades a mark in and out over its time (pageGl/workflowMarks `memberPulse`).
 */
export function useAges(keys: readonly string[], until: number): ReadonlyMap<string, number> {
  const born = useRef(new Map<string, number>());
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const now = performance.now();
  const out = new Map<string, number>();
  for (const k of keys) {
    if (!born.current.has(k)) born.current.set(k, now);
    out.set(k, now - born.current.get(k)!);
  }
  for (const k of [...born.current.keys()]) if (!out.has(k)) born.current.delete(k);
  const young = [...out.values()].some((a) => a < until);
  useEffect(() => {
    if (!young) return;
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });
  return out;
}
