import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { setLinePoints } from "./linePoints";

describe("a line's points, set again as they grow", () => {
  it("holds every point however many come, drawn as far as they go - a chain's trail set each frame", () => {
    const g = new THREE.BufferGeometry();
    const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 2 * i }));
    setLinePoints(g, pts(3), -0.03);
    expect(g.drawRange.count).toBe(3);
    setLinePoints(g, pts(40), -0.03);
    const pos = g.getAttribute("position");
    expect(pos.count).toBeGreaterThanOrEqual(40);
    expect(g.drawRange.count).toBe(40);
    expect([pos.getX(39), pos.getY(39)]).toEqual([39, 78]);
    expect(pos.getZ(39)).toBeCloseTo(-0.03, 6);
    // (fewer again: drawn as far as they go, the room kept)
    setLinePoints(g, pts(5), -0.03);
    expect(g.drawRange.count).toBe(5);
    expect(g.getAttribute("position").count).toBe(pos.count);
  });
});
