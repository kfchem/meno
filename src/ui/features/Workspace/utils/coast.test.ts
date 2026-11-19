/**
 * A molecule in 3D let go while turning (utils/coast): its time counted from the release, each frame turning it as far as it
 * went since the one before, slower each frame to its stop - its last frames pinned.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COAST_HELD_MS, COAST_STILL, coastFrame, coastFrom, coastsFrame, type Coast } from "./coast";
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
    expect(coastFrom(AXIS, 4, 990, 1000, 1000)).toEqual({ axis: AXIS, speed: 4, at: 990 });
    expect(coastFrom(AXIS, 4, 1000 - COAST_HELD_MS, 1000, 1000)).toBeNull();
    expect(coastFrom(AXIS, COAST_STILL, 990, 1000, 1000)).toBeNull();
  });

  it("goes on from the last move: let go just after it, its first frame turns it as far as a frame of the drag", () => {
    // (the last move at 1000, drawn in its frame; let go at 1004; the next frame a frame after the move)
    const { angle } = coastFrame(coastFrom(AXIS, 6, 1000, 1004, 1004)!, 1000 + FRAME, DAMPING);
    expect(angle).toBeCloseTo(6 * (FRAME / 1000), 12);
  });

  it("counts no more than a frame of a moment held still before it is let go: its first frame turns it no further than one frame's", () => {
    // (the last move at 1000; held still to 1060, let go; the next frame at 1070)
    const { angle } = coastFrame(coastFrom(AXIS, 6, 1000, 1060, 1060)!, 1070, DAMPING);
    expect(angle).toBeCloseTo(6 * ((10 + FRAME) / 1000), 12);
    expect(angle).toBeLessThan(6 * ((2 * FRAME) / 1000));
  });

  it("keeps its time in the frames' clock, where the pointer's events have another: its first frame turns it a frame's way, not the clocks' difference", () => {
    // (the last move at 5000 and the release at 5004 by the events' clock; the frames' clock reads 1004 at the release)
    const c = coastFrom(AXIS, 6, 5000, 5004, 1004)!;
    expect(c.at).toBeCloseTo(1000, 12);
    expect(coastFrame(c, 1000 + FRAME, DAMPING).angle).toBeCloseTo(6 * (FRAME / 1000), 12);
  });

  it("slows each frame to its stop, never turning further in a frame than in the one before, and stops in a frame slower than a stop", () => {
    for (const speed of [0.5, 3, 12, 40]) {
      const angles = framesOf(coastFrom(AXIS, speed, 0, 1, 1)!, () => FRAME);
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
    const c = coastFrom(AXIS, 8, 0, 1, 1)!;
    const even = framesOf(c, () => FRAME);
    // (its tenth frame drawn a frame late: the frames before it unchanged, that one as far as the two it takes the place of, to within a frame's slowing)
    const late = framesOf(c, (k) => (k === 9 ? 2 * FRAME : FRAME));
    expect(late.slice(0, 9)).toEqual(even.slice(0, 9));
    expect(late[9]).toBeGreaterThan(even[9] + even[10] - 1e-12);
    expect(late[9]).toBeLessThan((even[9] + even[10]) * (2 / (2 - DAMPING)) + 1e-12);
  });

  it("stops at once where its style does not let it go on (a damping of 1), and a frame of no time turns it not at all", () => {
    const c = coastFrom(AXIS, 5, 0, 1, 1)!;
    expect(coastFrame(c, FRAME, 1).next).toBeNull();
    expect(coastFrame(c, 0, DAMPING)).toEqual({ angle: 0, next: { ...c } });
  });

  it("goes on at a stop's speed exactly, stopping only below it, and a frame's time before its own turns it not at all, never back", () => {
    const at: Coast = { axis: AXIS, speed: COAST_STILL, at: 1000 };
    expect(coastFrame(at, 1000 + FRAME, 0).next).not.toBeNull();
    expect(coastFrame(at, 1000 + FRAME, DAMPING).next).toBeNull();
    const back = coastFrame({ axis: AXIS, speed: 5, at: 1000 }, 990, DAMPING);
    expect(back.angle).toBe(0);
    expect(back.next?.at).toBe(1000);
  });

  it("turns every coast each frame, keeps each for the next, and lets each go once it has stopped", () => {
    const coasts = new Map<number, Coast>([
      [1, { axis: AXIS, speed: 6, at: 0 }],
      [2, { axis: AXIS, speed: 0.05, at: 0 }],
    ]);
    const turned: [number, number][] = [];
    const turn = (key: number, _: THREE.Vector3, angle: number) => void turned.push([key, angle]);
    expect(coastsFrame(coasts, FRAME, DAMPING, turn)).toBe(true);
    expect(turned.map(([k]) => k)).toEqual([1, 2]);
    expect(coasts.get(1)?.at).toBe(FRAME);
    // (the second, slow, stops within a few frames; the first turns on, each frame from where the one before left it)
    let frames = 1;
    while (coasts.has(2)) coastsFrame(coasts, ++frames * FRAME, DAMPING, turn);
    expect(frames).toBeLessThan(20);
    expect(coasts.has(1)).toBe(true);
    const ones = turned.filter(([k]) => k === 1).map(([, a]) => a);
    expect(ones).toHaveLength(frames);
    for (let k = 1; k < ones.length; k++) expect(ones[k]).toBeLessThan(ones[k - 1]);
    expect(ones[1]).toBeCloseTo(6 * (1 - DAMPING) * (FRAME / 1000), 12);
  });

  it("is worked out each frame after the camera is moved and before the molecules are placed", () => {
    expect(FRAME_ORDER.camera).toBeLessThan(FRAME_ORDER.turning);
    expect(FRAME_ORDER.turning).toBeLessThan(FRAME_ORDER.molecules);
    expect(FRAME_ORDER.molecules).toBeLessThan(0);
  });
});
