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

  it("are placed for a thousand atoms in well under a millisecond a frame - ten thousand in a few", () => {
    for (const n of [1000, 10000]) {
      const mesh = jointNumbersMesh(n);
      const p = Float32Array.from({ length: 3 * n }, (_, k) => k * 0.01);
      const nums = Float32Array.from({ length: n }, (_, i) => i + 1);
      const shown = new Float32Array(n).fill(1);
      const inks = new Float32Array(3 * n).fill(0.5);
      const at = new THREE.Matrix4();
      const frame = () => {
        for (let i = 0; i < n; i++) mesh.setMatrixAt(i, at.makeTranslation(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        mesh.instanceMatrix.needsUpdate = true;
        setJointAttributes(mesh, nums, shown, inks);
      };
      for (let k = 0; k < 20; k++) frame();
      const t0 = performance.now();
      const frames = 100;
      for (let k = 0; k < frames; k++) frame();
      const ms = (performance.now() - t0) / frames;
      expect(ms, `${n} atoms: ${ms.toFixed(3)} ms a frame`).toBeLessThan(n === 1000 ? 1 : 8);
    }
  });
});
