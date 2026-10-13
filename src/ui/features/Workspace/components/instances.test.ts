import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { colorInstances, commitInstanceMatrices } from "./instances";

// A unit disc per instance, the way the atom pick mesh is built, and a ray
// straight down the view axis, the way a click on the 2D canvas arrives.
const discs = (count: number) =>
  new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 16),
    new THREE.MeshBasicMaterial(),
    count,
  );

const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number) =>
  mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, 0));

// Which instances a click at (x, y) lands on. A little off the centre, where
// every triangle of the disc meets, and once per instance.
const picked = (mesh: THREE.InstancedMesh, x: number, y: number) => [
  ...new Set(
    new THREE.Raycaster(
      new THREE.Vector3(x + 0.3, y + 0.2, 10),
      new THREE.Vector3(0, 0, -1),
    )
      .intersectObject(mesh)
      .map((hit) => hit.instanceId),
  ),
];

describe("commitInstanceMatrices", () => {
  it("lets an instance be picked where it has been moved to", () => {
    const mesh = discs(2);
    // Something asks before the instances are placed: both still sit at the
    // origin, and that is the sphere three.js would otherwise keep.
    expect(picked(mesh, 0, 0)).toEqual([0, 1]);

    place(mesh, 1, 10, 0);
    commitInstanceMatrices(mesh);

    expect(picked(mesh, 10, 0)).toEqual([1]);
    expect(picked(mesh, 0, 0)).toEqual([0]);
  });

  it("follows an instance that moves again", () => {
    const mesh = discs(1);
    place(mesh, 0, 10, 0);
    commitInstanceMatrices(mesh);
    expect(picked(mesh, 10, 0)).toEqual([0]);

    place(mesh, 0, -10, 5);
    commitInstanceMatrices(mesh);

    expect(picked(mesh, -10, 5)).toEqual([0]);
    expect(picked(mesh, 10, 0)).toEqual([]);
  });
});

describe("colorInstances", () => {
  it("gives each instance its colour, or the base, reading each colour once however many instances have it", () => {
    const mesh = discs(3000);
    const colors = Array.from({ length: 3000 }, (_, i) => (i % 3 === 0 ? "#ff0000" : i % 3 === 1 ? "#0000ff" : undefined));
    const read = vi.spyOn(THREE.Color.prototype, "setStyle");
    colorInstances(mesh, colors, "black");
    expect(read.mock.calls.length).toBeLessThanOrEqual(3);
    read.mockRestore();
    const at = (i: number) => {
      const c = new THREE.Color();
      mesh.getColorAt(i, c);
      return c.getHexString();
    };
    expect([at(0), at(1), at(2), at(2999)]).toEqual(["ff0000", "0000ff", "000000", "000000"]);
  });
});
