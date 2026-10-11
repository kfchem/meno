import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { movedUnderPointer, tookMovedUnderPointer } from "./viewGoal";

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
