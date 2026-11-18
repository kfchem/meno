/**
 * What a selection turned by its handle (Selection2D) shows, as the pointer
 * moves and the frames come: the angle springs to its step, eases to the
 * pointer's once let go of the steps, and the drop is the step - or nothing,
 * once Escape has let the turn go. Pure: the frame's time is passed in, and
 * every function gives the state that follows.
 */
import { FREE_BLEND_S, SNAP_SPRING, freedAngle, springAngle, springSettled } from "./angleSpring";
import { turnSnapped } from "./selection";

export type TurnGesture = {
  /** The angle shown (radians), and how fast it is going. */
  shown: number;
  speed: number;
  /** Let go of the steps (a pause of FREE_MS), and, once so, where the ease to the pointer's angle began and how far along it is (0 to 1). */
  free: boolean;
  freedFrom: { angle: number; t: number } | null;
  /** The time of the last frame (ms). */
  before: number;
  /** Whether the pointer has moved since the press, and whether Escape has let the turn go. */
  moved: boolean;
  cancelled: boolean;
};

/** A turn begun at `now` (ms): nothing turned yet. */
export const turnBegun = (now: number): TurnGesture => ({ shown: 0, speed: 0, free: false, freedFrom: null, before: now, moved: false, cancelled: false });

/** The pointer moved at `now`: the first move starts the clock of the frames. */
export const turnMoved = (g: TurnGesture, now: number): TurnGesture => (g.moved ? g : { ...g, moved: true, before: now });

/** A pause of the pointer: let go of the steps. */
export const turnFreed = (g: TurnGesture): TurnGesture => (g.free ? g : { ...g, free: true });

/** Escape: the turn is let go, whatever the pointer does after. */
export const turnCancelled = (g: TurnGesture): TurnGesture => ({ ...g, cancelled: true });

/** The angle the turn is heading to: the step the pointer's turn snaps to (from the direction `reference`), or the pointer's own once let go of them. */
export const turnWanted = (g: TurnGesture, pointed: number, reference: number) => turnSnapped(pointed, g.free, reference);

/**
 * One frame at `now` (ms): the state after it, and whether it is still on its
 * way (the next frame is wanted). The time between frames is kept to what a
 * spring takes without going unstable.
 */
export function turnFrame(g: TurnGesture, pointed: number, reference: number, now: number): { gesture: TurnGesture; onItsWay: boolean } {
  const dt = Math.min(Math.max((now - g.before) / 1000, 0.001), 0.05);
  const want = turnWanted(g, pointed, reference);
  if (g.free) {
    const from = g.freedFrom ?? { angle: g.shown, t: 0 };
    const t = Math.min(1, from.t + dt / FREE_BLEND_S);
    return { gesture: { ...g, before: now, shown: freedAngle(from.angle, want, t), speed: 0, freedFrom: { angle: from.angle, t } }, onItsWay: t < 1 };
  }
  const sprung = springAngle(g.shown, g.speed, want, dt, SNAP_SPRING);
  const settled = springSettled(sprung.angle, sprung.velocity, want);
  return { gesture: { ...g, before: now, shown: settled ? want : sprung.angle, speed: sprung.velocity }, onItsWay: !settled };
}

/**
 * The angle the button's coming up puts, or null where it puts nothing - a
 * press with no move, or a turn Escape has let go: the step it is heading to,
 * or the pointer's own once let go of the steps, never an angle the spring is
 * passing through.
 */
export const turnDropped = (g: TurnGesture, pointed: number, reference: number): number | null => (g.moved && !g.cancelled ? turnWanted(g, pointed, reference) : null);
