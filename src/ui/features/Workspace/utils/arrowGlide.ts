/**
 * An arrow drawn going over to where its end or corner is put, as a bond
 * moved is (components/Arrows2D): from step to step of its snapping, never
 * jumping there.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { ArrowCorner } from "../../../../lib/chem/reactionArrow";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import { TAU, follow } from "../../../theme/motion";

/** How an arrow lies: its middle, direction, length and corners. */
export type Pose = { x: number; y: number; angle: number; length: number; corners?: readonly ArrowCorner[] };

/** An arrow's pose, and nothing else of it. */
export const poseOf = (a: Pose): Pose => ({ x: a.x, y: a.y, angle: a.angle, length: a.length, ...(a.corners ? { corners: a.corners } : {}) });

/**
 * `was` a step of `dt` seconds on towards `to`, as a bond moved goes (`follow`, TAU.quick) - the
 * direction the shorter way round, each corner from where it was (one made or taken away, at
 * once) - or none, where it is there.
 */
export function glidden(was: Pose, to: Pose, dt: number): Pose | null {
  const step = (a: number, b: number) => follow(a, b, dt, TAU.quick);
  const turn = Math.atan2(Math.sin(to.angle - was.angle), Math.cos(to.angle - was.angle));
  const same = (was.corners?.length ?? 0) === (to.corners?.length ?? 0);
  const corners = same ? to.corners?.map((c, i) => ({ along: step(was.corners![i].along, c.along), across: step(was.corners![i].across, c.across) })) : to.corners;
  const next: Pose = { x: step(was.x, to.x), y: step(was.y, to.y), angle: to.angle - step(turn, 0), length: step(was.length, to.length), ...(corners ? { corners } : {}) };
  const a = arrowPoints(next);
  const b = arrowPoints(to);
  const there = a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < 1e-4 * NOMINAL_BOND_LENGTH);
  return there ? null : next;
}
