import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { movedUnderPointer, pressMovedUnder, setPressMovedUnder, tookMovedUnderPointer } from "./viewGoal";

describe("something moved under a resting pointer", () => {
  it("is found again once, by the view of the camera it moved under", () => {
    const canvas = new THREE.OrthographicCamera();
    const other = new THREE.OrthographicCamera();
    expect(tookMovedUnderPointer(canvas)).toBe(false);
    // (a molecule turning on after it was let go, frame after frame: found again each frame it turned)
    movedUnderPointer(canvas);
    movedUnderPointer(canvas);
    expect(tookMovedUnderPointer(other)).toBe(false);
    expect(tookMovedUnderPointer(canvas)).toBe(true);
    expect(tookMovedUnderPointer(canvas)).toBe(false);
  });
});

describe("a press the view moved under", () => {
  it("is said of the camera it moved under until a new press starts afresh", () => {
    const canvas = new THREE.OrthographicCamera();
    const other = new THREE.OrthographicCamera();
    expect(pressMovedUnder(canvas)).toBe(false);
    setPressMovedUnder(canvas, true);
    expect(pressMovedUnder(canvas)).toBe(true);
    expect(pressMovedUnder(other)).toBe(false);
    // (asked again - as the button comes up, after the long press's timer - still so)
    expect(pressMovedUnder(canvas)).toBe(true);
    setPressMovedUnder(canvas, false);
    expect(pressMovedUnder(canvas)).toBe(false);
  });
});
