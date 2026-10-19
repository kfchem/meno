import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { jointNumbersMesh, jointShare, jointUniforms, setJointAttributes } from "./jointNumbers";

describe("atom numbers where the sticks meet", () => {
  it("stand there in Sticks, on the balls otherwise - gone over from one to the other as the look is", () => {
    expect(jointShare(true, true, 0)).toBe(1);
    expect(jointShare(false, false, 1)).toBe(0);
    expect(jointShare(false, true, 0)).toBe(0);
    expect(jointShare(false, true, 0.25)).toBeCloseTo(0.25, 9);
    expect(jointShare(true, false, 1)).toBe(0);
  });

  it("are one mesh for all of a molecule's atoms - one draw - each atom's number, how far shown and colour set only where they change", () => {
    const n = 1000;
    const mesh = jointNumbersMesh(n);
    expect(mesh.count).toBe(n);
    expect(jointUniforms(mesh).shown.value).toBe(0);
    const nums = Float32Array.from({ length: n }, (_, i) => i + 1);
    const shown = new Float32Array(n).fill(1);
    const inks = new Float32Array(3 * n).fill(0.5);
    setJointAttributes(mesh, nums, shown, inks);
    const attr = mesh.geometry.getAttribute("jointNumber") as THREE.InstancedBufferAttribute;
    expect(attr.array[999]).toBe(1000);
    const v = attr.version;
    setJointAttributes(mesh, nums, shown, inks);
    expect(attr.version).toBe(v);
    shown[3] = 0.5;
    setJointAttributes(mesh, nums, shown, inks);
    expect((mesh.geometry.getAttribute("jointShown") as THREE.InstancedBufferAttribute).array[3]).toBe(0.5);
  });

  it("cost a frame no more than the atoms' places and what changed: nothing written again where nothing did", () => {
    const n = 1000;
    const mesh = jointNumbersMesh(n);
    const nums = Float32Array.from({ length: n }, (_, i) => i + 1);
    const shown = new Float32Array(n).fill(1);
    const inks = new Float32Array(3 * n).fill(0.5);
    setJointAttributes(mesh, nums, shown, inks);
    const attrs = ["jointNumber", "jointShown", "jointInk"].map((k) => mesh.geometry.getAttribute(k) as THREE.InstancedBufferAttribute);
    const versions = attrs.map((a) => a.version);
    // (as at every frame of a turn, nothing about the numbers changing: no attribute sent again, nor made again)
    for (let k = 0; k < 10; k++) setJointAttributes(mesh, nums, shown, inks);
    expect(attrs.map((a) => a.version)).toEqual(versions);
    expect(["jointNumber", "jointShown", "jointInk"].map((k) => mesh.geometry.getAttribute(k))).toEqual(attrs);
    // (one fading: only how far each is shown sent again)
    shown[0] = 0.5;
    setJointAttributes(mesh, nums, shown, inks);
    expect(attrs.map((a) => a.version)).toEqual([versions[0], versions[1] + 1, versions[2]]);
    // (and however many atoms, one mesh - one draw)
    expect(mesh.isInstancedMesh).toBe(true);
    expect(mesh.count).toBe(n);
  });
});
