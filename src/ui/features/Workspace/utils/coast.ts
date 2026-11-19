/**
 * A molecule in 3D let go while it was turning turns on, slowing to a stop:
 * on the page (components/Molecules3D), in a talk (presenting/Presenter) and
 * in Settings' preview (StyleEditor/Preview3D). Pure: the frame's time is
 * passed in, and each frame gives the coast that follows.
 *
 * It goes on from the pointer's last move, as it was turning then, so that
 * its first frame turns it as far as a frame of the drag would have; but of a
 * moment the pointer was held still before it came up, no more than a frame is
 * counted, so that the first frame does not turn it all of that moment at once.
 * Each frame then turns it as far as it went since the frame before, and the
 * frame that turns it draws it (FRAME_ORDER `turning`).
 */
import type * as THREE from "three";

/** A turn left to itself stops below this speed, in radians a second. */
export const COAST_STILL = 0.02;
/** A release this long after the last move leaves the molecule still, in ms. */
export const COAST_HELD_MS = 80;
/** A frame, at sixty a second, in ms: the most of a moment held still before the release that a coast counts. */
const FRAME_MS = 1000 / 60;

/** A molecule turning on by itself: about which axis, how fast (rad/s), and when it last turned (ms, `performance.now()`'s clock). */
export type Coast = { axis: THREE.Vector3; speed: number; at: number };

/**
 * The coast of a molecule let go at `now` after its pointer's last move at `moved` (ms, both the
 * pointer events' own times), turning at `speed` (rad/s) - or null where it stays still: let go too long
 * after its last move, or too slowly. `clock` is the frames' time at the release (`performance.now()`):
 * the coast's time is kept in the frames' clock, never mixing an event's time with a frame's.
 */
export function coastFrom(axis: THREE.Vector3, speed: number, moved: number, now: number, clock: number): Coast | null {
  if (now - moved >= COAST_HELD_MS || speed <= COAST_STILL) return null;
  return { axis, speed, at: clock - (now - Math.max(moved, now - FRAME_MS)) };
}

/**
 * One frame at `now` (ms): how far the coast turns the molecule (radians), and the coast after it -
 * slowed by `damping` for every sixtieth of a second (the style's `turnDamping`), or null once it
 * is slower than COAST_STILL: it has stopped.
 */
export function coastFrame(c: Coast, now: number, damping: number): { angle: number; next: Coast | null } {
  // (a frame's time before the coast's own - a clock stepped back - turns it not at all, never backwards)
  const dt = Math.max(0, now - c.at) / 1000;
  const speed = c.speed * Math.pow(1 - damping, dt * 60);
  return { angle: c.speed * dt, next: speed < COAST_STILL ? null : { ...c, speed, at: Math.max(now, c.at) } };
}

/**
 * One frame at `now` of every coast in `coasts`, by key: each turned (`turn`) as far as it went, kept for
 * the next frame - or let go, once it has stopped. Whether any is left to turn on.
 */
export function coastsFrame<K>(coasts: Map<K, Coast>, now: number, damping: number, turn: (key: K, axis: THREE.Vector3, angle: number) => void): boolean {
  for (const [key, c] of coasts) {
    const { angle, next } = coastFrame(c, now, damping);
    turn(key, c.axis, angle);
    if (next) coasts.set(key, next);
    else coasts.delete(key);
  }
  return coasts.size > 0;
}
