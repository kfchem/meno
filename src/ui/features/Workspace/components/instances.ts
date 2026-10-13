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
  mesh.computeBoundingSphere();
}

const tint = new THREE.Color();

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
  colors.forEach((c, i) => mesh.setColorAt(i, tint.set(c ?? base)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (!had) for (const m of [mesh.material].flat()) m.needsUpdate = true;
}

/**
 * A plain material for instances drawn across a line - a bond's plane, `y`
 * - or round, a cap's disc, `xy`, whose width is made wider or narrower
 * than laid out on the graphics card: `width.value` times, for nothing on
 * the main thread. A very large drawing waiting for a zoom to stop keeps its
 * lines as wide as a layout at the zoom would have them so
 * (utils/largeZoom `lineWidening`).
 */
export function widenedMaterial(
  across: "y" | "xy",
  params: THREE.MeshBasicMaterialParameters,
): { material: THREE.MeshBasicMaterial; width: { value: number } } {
  const width = { value: 1 };
  const material = new THREE.MeshBasicMaterial(params);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWidth = width;
    shader.vertexShader =
      "uniform float uWidth;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n  transformed.${across} *= uWidth;`);
  };
  material.customProgramCacheKey = () => `widened-${across}`;
  return { material, width };
}
