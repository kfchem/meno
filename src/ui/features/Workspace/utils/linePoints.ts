import * as THREE from "three";

/**
 * A line's points put in its geometry, which grows as they do: three.js
 * keeps a geometry's buffer at the size it first had - `setFromPoints` on
 * it only warns, "Buffer size too small" - so a chain's trail, set again
 * each frame as the pointer goes, was drawn no further than its first
 * points. Room is made for twice as many each time it runs out; the line
 * is drawn as far as the points go.
 */
export function setLinePoints(g: THREE.BufferGeometry, pts: readonly { x: number; y: number }[], z: number): void {
  let pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < pts.length) {
    pos = new THREE.BufferAttribute(new Float32Array(Math.max(16, pts.length * 2) * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
  }
  for (let i = 0; i < pts.length; i++) pos.setXYZ(i, pts[i].x, pts[i].y, z);
  pos.needsUpdate = true;
  g.setDrawRange(0, pts.length);
}
