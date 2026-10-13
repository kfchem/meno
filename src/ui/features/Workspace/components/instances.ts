import * as THREE from "three";
import type { InstancedMesh } from "three";

/**
 * Tell three.js that an instanced mesh's instances have moved.
 *
 * `instanceMatrix.needsUpdate` is enough for what is drawn, but not for what
 * can be picked. `InstancedMesh.raycast` first tests the ray against a
 * bounding sphere that three.js computes the first time anything asks for it -
 * a raycast, or the frustum test when the mesh is drawn - and then keeps. An
 * instance that has since moved outside that sphere is never hit, however
 * squarely the pointer lands on it. So the sphere is recomputed with every
 * move.
 */
export function commitInstanceMatrices(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  // (a sphere round them all, read off their matrices: the box of their
  // middles, and past it as far as the largest of them reaches - not each
  // instance's own sphere taken into it, as three.js does, which over the
  // hit areas of tens of thousands of atoms and bonds took milliseconds at
  // every frame of a drag. It only has to hold them: a ray that meets it is
  // tried against each instance)
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

/**
 * Each of an instanced mesh's first `colors.length` instances in its own
 * colour - or `base`, where it has none - its material white so that it
 * tints none of them (layout2d's parts given a colour, docs/EDITOR-2D.md,
 * *Colour*). The material is made again the first time the mesh has
 * colours of its own, which three.js reads only as it makes it.
 */
export function colorInstances(mesh: InstancedMesh, colors: readonly (string | undefined)[], base: string): void {
  if (!colors.length) return;
  const had = mesh.instanceColor != null;
  // (each colour read from its CSS once, not once for each of the drawing's bonds at every frame of a drag)
  const read = new Map<string, THREE.Color>();
  colors.forEach((c, i) => {
    const css = c ?? base;
    let color = read.get(css);
    if (!color) read.set(css, (color = new THREE.Color(css)));
    mesh.setColorAt(i, color);
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (!had) for (const m of [mesh.material].flat()) m.needsUpdate = true;
}
