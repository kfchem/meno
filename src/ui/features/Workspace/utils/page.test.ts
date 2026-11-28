import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { eyeOf, pageAt, seenAt } from "./page";

describe("what a camera sees of the page", () => {
  const ortho = () => {
    const c = new THREE.OrthographicCamera(-50, 50, 30, -30, 0.1, 2000);
    c.position.set(10, 5, 1000);
    c.zoom = 2;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    return c;
  };
  const persp = () => {
    const c = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    c.position.set(10, 5, 60);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    return c;
  };

  it("has an eye only in perspective: an orthographic camera looks straight down from anywhere", () => {
    expect(eyeOf(ortho())).toBeUndefined();
    expect(eyeOf(persp())).toMatchObject({ x: 10, y: 5, z: 60 });
  });

  it("sees a point above the page straight below it orthographically, and out from under the eye, larger, in perspective", () => {
    expect(seenAt(3, 4, 12)).toEqual({ x: 3, y: 4, k: 1 });
    const seen = seenAt(20, 5, 12, { x: 10, y: 5, z: 60 });
    expect(seen.k).toBeCloseTo(60 / 48, 9);
    expect(seen.x).toBeCloseTo(10 + 10 * (60 / 48), 9);
    expect(seen.y).toBeCloseTo(5, 9);
  });

  it("takes the middle of the screen to the page under the camera, either way", () => {
    for (const c of [ortho(), persp()]) {
      const p = pageAt(0, 0, c);
      expect(p.x).toBeCloseTo(10, 6);
      expect(p.y).toBeCloseTo(5, 6);
      expect(p.z).toBeCloseTo(0, 6);
    }
  });
});
