import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { boxRaycast, SQUARE, UNSEEN } from "./partFrames";

/** A press at (x, y) on the page, seen through an orthographic camera at `zoom`: what `object` gives it. */
function pressAt(object: THREE.Object3D, camera: THREE.OrthographicCamera, x: number, y: number) {
  camera.position.set(x, y, 100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits: THREE.Intersection[] = [];
  object.raycast(raycaster, hits);
  return hits;
}

describe("what a press takes on a part, worked out as it comes", () => {
  const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
  const group = new THREE.Group();
  group.position.set(0, 0, -0.2);
  const mesh = new THREE.Mesh(SQUARE, UNSEEN);
  mesh.position.set(0, 0, 0.001);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.raycast = boxRaycast(camera, () => ({ x0: 10, x1: 20, y0: 0, y1: 5 }), 5);

  it("is the box, and as far round it as a press may miss by on the screen, at the zoom of the press", () => {
    camera.zoom = 1;
    expect(pressAt(mesh, camera, 15, 2)).toHaveLength(1);
    // (4 pixels off it: taken; 6: not)
    expect(pressAt(mesh, camera, 24, 2)).toHaveLength(1);
    expect(pressAt(mesh, camera, 26, 2)).toHaveLength(0);
    // (zoomed in four times, the same 4 pixels are a page unit: 21 taken, 22 not)
    camera.zoom = 4;
    expect(pressAt(mesh, camera, 21, 2)).toHaveLength(1);
    expect(pressAt(mesh, camera, 22.5, 2)).toHaveLength(0);
    camera.zoom = 1;
  });

  it("is where the press meets the plane the part lies in, as far from the camera as that", () => {
    const [hit] = pressAt(mesh, camera, 12, 1);
    expect(hit.object).toBe(mesh);
    expect(hit.point.x).toBeCloseTo(12, 6);
    expect(hit.point.y).toBeCloseTo(1, 6);
    expect(hit.point.z).toBeCloseTo(-0.199, 6);
    expect(hit.distance).toBeCloseTo(100.199, 3);
  });

  it("is nothing where the part gives no box", () => {
    const none = new THREE.Mesh(SQUARE, UNSEEN);
    none.raycast = boxRaycast(camera, () => null, 5);
    none.updateMatrixWorld(true);
    expect(pressAt(none, camera, 0, 0)).toHaveLength(0);
  });
});
