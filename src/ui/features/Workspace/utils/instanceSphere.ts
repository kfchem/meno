import * as THREE from "three";

/**
 * An instanced mesh's bounding sphere made again from its instances: a
 * sphere round them all, read off their matrices - the box of their middles,
 * and past it as far as the largest of them reaches. Not each instance's
 * own sphere taken into it, as three.js's `computeBoundingSphere` does,
 * which over tens of thousands of atoms and bonds took milliseconds at
 * every frame they moved. It holds every instance, and is at most about
 * half as large again as three.js's: what it is for - the ray tried
 * against it before the instances, the shadow fitted round it - only needs
 * it to hold them.
 */
export function boundInstances(mesh: THREE.InstancedMesh): void {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const own = geometry.boundingSphere!;
  const m = mesh.instanceMatrix.array;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  let scale = 0;
  for (let i = 0; i < mesh.count; i++) {
    const o = 16 * i;
    const x = m[o + 12];
    const y = m[o + 13];
    const z = m[o + 14];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
    const s = Math.max(
      m[o] * m[o] + m[o + 1] * m[o + 1] + m[o + 2] * m[o + 2],
      m[o + 4] * m[o + 4] + m[o + 5] * m[o + 5] + m[o + 6] * m[o + 6],
      m[o + 8] * m[o + 8] + m[o + 9] * m[o + 9] + m[o + 10] * m[o + 10],
    );
    if (s > scale) scale = s;
  }
  const sphere = (mesh.boundingSphere ??= new THREE.Sphere());
  if (mesh.count === 0) {
    sphere.makeEmpty();
    return;
  }
  sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  sphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + (own.radius + own.center.length()) * Math.sqrt(scale);
}
