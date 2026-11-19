/**
 * A molecule in 3D let go while turning (utils/coast): its time counted from the release, each frame turning it as far as it
 * went since the one before, slower each frame to its stop - its last frames pinned.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COAST_HELD_MS, COAST_STILL, coastFrame, coastFrom, type Coast } from "./coast";
import { FRAME_ORDER } from "./page";

const AXIS = new THREE.Vector3(0, 1, 0);
const FRAME = 1000 / 60;
/** The style's damping, as a style has it by default. */
const DAMPING = 0.1;

/** Every frame of a coast from `c`, `every` ms apart: how far each turned it, to the frame it stopped in. */
function framesOf(c: Coast, every: (k: number) => number, damping = DAMPING): number[] {
  const angles: number[] = [];
  let now = c.at;
  let left: Coast | null = c;
  for (let k = 0; left && k < 10_000; k++) {
    now += every(k);
    const { angle, next } = coastFrame(left, now, damping);
    angles.push(angle);
    left = next;
  }
  return angles;
}

describe("a molecule let go while turning", () => {
  it("coasts only where let go within the moment after its last move, and faster than a stop", () => {
    expect(coastFrom(AXIS, 4, 990, 1000)).toEqual({ axis: AXIS, speed: 4, at: 990 });
    expect(coastFrom(AXIS, 4, 1000 - COAST_HELD_MS, 1000)).toBeNull();
    expect(coastFrom(AXIS, COAST_STILL, 990, 1000)).toBeNull();
  });

  it("goes on from the last move: let go just after it, its first frame turns it as far as a frame of the drag", () => {
    // (the last move at 1000, drawn in its frame; let go at 1004; the next frame a frame after the move)
    const { angle } = coastFrame(coastFrom(AXIS, 6, 1000, 1004)!, 1000 + FRAME, DAMPING);
    expect(angle).toBeCloseTo(6 * (FRAME / 1000), 12);
  });

  it("counts no more than a frame of a moment held still before it is let go: its first frame turns it no further than one frame's", () => {
    // (the last move at 1000; held still to 1060, let go; the next frame at 1070)
    const { angle } = coastFrame(coastFrom(AXIS, 6, 1000, 1060)!, 1070, DAMPING);
    expect(angle).toBeCloseTo(6 * ((10 + FRAME) / 1000), 12);
    expect(angle).toBeLessThan(6 * ((2 * FRAME) / 1000));
  });

  it("slows each frame to its stop, never turning further in a frame than in the one before, and stops in a frame slower than a stop", () => {
    for (const speed of [0.5, 3, 12, 40]) {
      const angles = framesOf(coastFrom(AXIS, speed, 0, 1)!, () => FRAME);
      for (let k = 1; k < angles.length; k++) expect(angles[k], `${speed} rad/s, frame ${k}`).toBeLessThan(angles[k - 1]);
      // (its last frames: the one it stops in turns it by less than a stop's speed for a frame, over the step's slowing)
      const last = angles[angles.length - 1];
      expect(last).toBeLessThan((COAST_STILL / (1 - DAMPING)) * (FRAME / 1000));
      expect(last).toBeGreaterThan(0);
      // (and as far in all as each frame's speed for a frame, to the frame it stops)
      const total = angles.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThan((speed * (FRAME / 1000)) / DAMPING);
    }
  });

  it("turns, in a frame drawn late, as far as the frames it stands for between them", () => {
    const c = coastFrom(AXIS, 8, 0, 1)!;
    const even = framesOf(c, () => FRAME);
    // (its tenth frame drawn a frame late: the frames before it unchanged, that one as far as the two it takes the place of, to within a frame's slowing)
    const late = framesOf(c, (k) => (k === 9 ? 2 * FRAME : FRAME));
    expect(late.slice(0, 9)).toEqual(even.slice(0, 9));
    expect(late[9]).toBeGreaterThan(even[9] + even[10] - 1e-12);
    expect(late[9]).toBeLessThan((even[9] + even[10]) * (2 / (2 - DAMPING)) + 1e-12);
  });

  it("stops at once where its style does not let it go on (a damping of 1), and a frame of no time turns it not at all", () => {
    const c = coastFrom(AXIS, 5, 0, 1)!;
    expect(coastFrame(c, FRAME, 1).next).toBeNull();
    expect(coastFrame(c, 0, DAMPING)).toEqual({ angle: 0, next: { ...c } });
  });

  it("is worked out each frame after the camera is moved and before the molecules are placed", () => {
    expect(FRAME_ORDER.camera).toBeLessThan(FRAME_ORDER.turning);
    expect(FRAME_ORDER.turning).toBeLessThan(FRAME_ORDER.molecules);
    expect(FRAME_ORDER.molecules).toBeLessThan(0);
  });
});
