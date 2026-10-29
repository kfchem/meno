import { useEffect, useRef, useState } from "react";
import { DURATION, EASE, EASE_LEAVE, eased } from "./motion";

/**
 * How a card opens to more of what it says - a frames chip's details, a
 * group folded under its name - and how it shuts: it grows to its new
 * size, wide and tall together, and only then do its new lines fade in;
 * shutting, they fade out first, and then it goes back to its size. Its
 * lines are never drawn, nor laid out again, while it is still growing
 * (the maintainer, 2026-10-29).
 */

/** How long it takes to grow to its new size, or back, in milliseconds. */
export const GROW_MS = DURATION.base * 1000;
/** How long its new lines take to fade in, or out, once it has grown, in milliseconds. */
export const SHOW_MS = DURATION.quick * 1000;
/** The longest a frame is taken as, in milliseconds: a frame slow to come takes it no further than this, so the motion is seen all the way. */
const MOST_FRAME_MS = 1000 / 30;
/** How near the end of its time a motion is taken as there. */
const THERE = 1e-6;

/**
 * Where an opening is: `grown`, how far it is to its new size (0 as it was,
 * 1 there); `shown`, how far its new lines have come in (0 none, 1 whole).
 * Both are as seen - eased. `way` and `times` are how it is getting there:
 * the way it is going, and how far along its time each part is that way.
 */
export type Opening = {
  readonly grown: number;
  readonly shown: number;
  readonly way: "opening" | "shutting";
  readonly times: readonly [grow: number, show: number];
};

export const SHUT: Opening = { grown: 0, shown: 0, way: "shutting", times: [1, 1] };
export const OPENED: Opening = { grown: 1, shown: 1, way: "opening", times: [1, 1] };

/** How far along its time a curve is that has come to `value` (the inverse of `eased`). */
function timeAt(curve: readonly [number, number, number, number], value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (eased(curve, mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A part of an opening: the card growing, or its new lines fading in. */
type Part = "grow" | "show";

/**
 * The curve a part goes on: growing, Meno's curve (`EASE`), as a card's
 * width and height ease everywhere; shrinking, and the lines fading either
 * way, its going one (`EASE_LEAVE`). Quick out of its start, `EASE` took
 * the lines half-way in their first frame, and they read as there at once
 * (seen in the built app, 2026-10-29).
 */
function curveOf(part: Part, opening: boolean): readonly [number, number, number, number] {
  return part === "grow" && opening ? EASE : EASE_LEAVE;
}

/** What is seen of a part `time` along its way. */
function seenAt(part: Part, opening: boolean, time: number): number {
  if (time >= 1 - THERE) return opening ? 1 : 0;
  const along = eased(curveOf(part, opening), time);
  return opening ? along : 1 - along;
}

/** How far along the way `opening` a part is that is seen at `value`: where a turn back mid-way takes it on from. */
function timeOf(part: Part, opening: boolean, value: number): number {
  return timeAt(curveOf(part, opening), opening ? value : 1 - value);
}

/**
 * An opening `ms` on from `at`, opened or shut: opening, it grows first and
 * its lines come in after; shutting, its lines go first and it shrinks
 * after. Asked the other way mid-way, it goes back from where it is, each
 * part on the other way's curve from what is seen of it.
 */
export function openingAfter(at: Opening, open: boolean, ms: number): Opening {
  const way = open ? "opening" : "shutting";
  let [grow, show] = at.way === way ? at.times : [timeOf("grow", open, at.grown), timeOf("show", open, at.shown)];
  if (ms > 0) {
    // (the part that goes first takes the time, and what it leaves over goes to the other)
    const firstTotal = open ? GROW_MS : SHOW_MS;
    const thenTotal = open ? SHOW_MS : GROW_MS;
    let first = open ? grow : show;
    let then = open ? show : grow;
    first += ms / firstTotal;
    if (first >= 1 - THERE) {
      then += (Math.max(first - 1, 0) * firstTotal) / thenTotal;
      first = 1;
    }
    then = Math.min(then, 1);
    [grow, show] = open ? [first, then] : [then, first];
  }
  return { grown: seenAt("grow", open, grow), shown: seenAt("show", open, show), way, times: [grow, show] };
}

/** Whether an opening has come to rest, opened or shut. */
export function settled(at: Opening, open: boolean): boolean {
  return open ? at.grown === 1 && at.shown === 1 : at.grown === 0 && at.shown === 0;
}

/** Where an opening is, as `open` asks, frame by frame as they are drawn: drawn opened or shut at first, without motion. */
export function useOpening(open: boolean): Opening {
  const [at, setAt] = useState<Opening>(() => (open ? OPENED : SHUT));
  const now = useRef(at);
  useEffect(() => {
    if (settled(now.current, open)) return;
    let id = 0;
    let last = performance.now();
    const step = (t: number) => {
      now.current = openingAfter(now.current, open, Math.min(t - last, MOST_FRAME_MS));
      last = t;
      setAt(now.current);
      if (!settled(now.current, open)) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [open]);
  return at;
}

/** A length easing from `from` to `to` over `GROW_MS`, set off at `start` (ms). */
export type Easing = { readonly from: number; readonly to: number; readonly start: number };

/** Where an easing is at `now` (ms), on Meno's curve. */
export function easingAt(e: Easing, now: number): number {
  return e.from + (e.to - e.from) * eased(EASE, (now - e.start) / GROW_MS);
}

/**
 * A length that eases to `target` over `GROW_MS` each time it changes - from
 * where it is at that moment, should it change again mid-way - as a CSS
 * transition would, but frame by frame, so that it can be one term of what
 * is drawn (a card's width, of what it is and what it is opening to).
 * Its first value is drawn as it is.
 */
export function useEasedTo(target: number): number {
  const [value, setValue] = useState(target);
  const easing = useRef<Easing>({ from: target, to: target, start: 0 });
  useEffect(() => {
    const t0 = performance.now();
    const from = easingAt(easing.current, t0);
    if (from === target && easing.current.to === target) return;
    easing.current = { from, to: target, start: t0 };
    let id = 0;
    const step = (t: number) => {
      const v = easingAt(easing.current, t);
      setValue(v);
      if (t - easing.current.start < GROW_MS) id = requestAnimationFrame(step);
      else setValue(target);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target]);
  return value;
}
