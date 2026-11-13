/**
 * The inertial snap of an angle, shared by everything the drawing turns to a
 * step of its own: the bond a drag leads (ExtendPreview2D), the atom a drag
 * moves (MovePreview2D) and a selection turned by its handle
 * (Selection2D). The shown angle springs to the one it snaps to - snappy,
 * with a little bounce - and letting go of the steps eases from the snapped
 * angle to the pointer's. Pure: the frame's time is passed in.
 */

/** A spring: its stiffness (per s squared) and how damped it is (1 is none of the bounce). */
export type Spring = { k: number; zeta: number };

/** A bond's angle, and a selection's turn: snappy, a little bounce. */
export const SNAP_SPRING: Spring = { k: 800, zeta: 0.5 };
/** An atom's angle about the atom it hangs on, as it is moved. */
export const MOVE_SPRING: Spring = { k: 1000, zeta: 0.4 };

/** How long, in s, letting go of the steps takes to ease from the snapped angle to the pointer. */
export const FREE_BLEND_S = 0.18;

/** The angle `a` (radians) as the one in (-pi, pi] it is the same direction as. */
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The ease-out of letting go: quick at first, slowing onto where it ends. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * One frame of the spring: the angle and its speed after `dt` s, the angle
 * heading to `target` by the shorter way round.
 */
export function springAngle(angle: number, velocity: number, target: number, dt: number, spring: Spring = SNAP_SPRING): { angle: number; velocity: number } {
  const c = 2 * Math.sqrt(spring.k) * spring.zeta;
  const v = velocity + (-spring.k * wrapPi(angle - target) - c * velocity) * dt;
  return { angle: angle + v * dt, velocity: v };
}

/** Whether the spring has come to rest on its target: no angle to go, no speed left (radians). */
export const springSettled = (angle: number, velocity: number, target: number) => Math.abs(wrapPi(angle - target)) < 1e-4 && Math.abs(velocity) < 1e-3;

/** The angle letting go of the steps shows `t` (0 to 1) of the way from `from`, the snapped angle, to `to`, the pointer's: eased out. */
export const freedAngle = (from: number, to: number, t: number) => from + wrapPi(to - from) * easeOutCubic(Math.min(1, Math.max(0, t)));
