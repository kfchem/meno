import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { casterOf, castersNow, fitShadow, lightBoxOf, SHADOW_SOFT } from "./shadows3d";

describe("the key light's shadows", () => {
  it("are cast in a box fitted round what casts them, every part of it inside the shadow camera's view", () => {
    const spheres = [new THREE.Sphere(new THREE.Vector3(10, -4, 3), 2), new THREE.Sphere(new THREE.Vector3(-6, 8, 5), 3)];
    const light = new THREE.DirectionalLight();
    light.shadow.mapSize.set(1024, 1024);
    fitShadow(light, lightBoxOf(spheres)!);
    light.shadow.updateMatrices(light);
    const m = light.shadow.matrix;
    for (const s of spheres) {
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const p = s.center.clone().add(new THREE.Vector3(...d).multiplyScalar(s.radius)).applyMatrix4(m);
        for (const v of [p.x, p.y, p.z]) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        }
      }
    }
    // (its edge as soft as SHADOW_SOFT, in texels)
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    const texel = (cam.right - cam.left) / 1024;
    expect(light.shadow.radius).toBeCloseTo(Math.min(12, Math.max(1.5, SHADOW_SOFT / texel)), 5);
  });

  it("come from coarse balls standing where the drawn ones do, which draw nothing themselves, and change as they move", () => {
    const drawn = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial(), 2);
    drawn.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0));
    drawn.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
    const caster = casterOf(drawn, "balls");
    expect(caster.instanceMatrix).toBe(drawn.instanceMatrix);
    expect(caster.castShadow).toBe(true);
    // (none of them drawn where the canvas is, all where the shadow is)
    caster.onBeforeRender(null!, null!, null!, null!, null!, null!);
    expect(caster.count).toBe(0);
    caster.onAfterRender(null!, null!, null!, null!, null!, null!);
    expect(caster.count).toBe(2);
    const group = new THREE.Group();
    group.add(caster);
    const before = castersNow([caster]);
    expect(before.atoms).toBe(2);
    expect(before.spheres[0].center.x).toBeCloseTo(2, 5);
    expect(castersNow([caster]).sign).toBe(before.sign);
    group.position.set(1, 0, 0);
    expect(castersNow([caster]).sign).not.toBe(before.sign);
    // (hidden, it casts nothing)
    group.visible = false;
    expect(castersNow([caster]).spheres).toEqual([]);
  });
});
