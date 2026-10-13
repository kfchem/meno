import * as THREE from "three";
import type { InstancedMesh } from "three";
import { boundInstances } from "../utils/instanceSphere";

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
  boundInstances(mesh);
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
