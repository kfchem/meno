import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ScreenShade, SCREEN_LAYER, screenShadersOn, screenShadeWanted, shadeMarginPx, shadeWith } from "./screenShade";
import { lighterText } from "./largeDrawing";
import { useNotices } from "../../../notices";

describe("hollows shaded on the screen", () => {
  it("draws a molecule's mesh into its own pass, as deep as its weight says, and leaves it on the canvas too", () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
    let weight = 0.7;
    shadeWith(mesh, () => weight);
    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(mesh.layers.isEnabled(SCREEN_LAYER)).toBe(true);
    // (told its weight only when drawn with the pass's own material)
    const own = new THREE.ShaderMaterial({ uniforms: { weight: { value: 0 } } });
    own.userData.screenShade = true;
    mesh.onBeforeRender(null!, null!, null!, mesh.geometry, own, null!);
    expect(own.uniforms.weight.value).toBe(0.7);
    weight = 0.2;
    mesh.onBeforeRender(null!, null!, null!, mesh.geometry, mesh.material as THREE.Material, null!);
    expect(own.uniforms.weight.value).toBe(0.7);
  });

  it("is wanted on a canvas only while a molecule there is shaded so", () => {
    const gl = {} as THREE.WebGLRenderer;
    const set = screenShadersOn(gl);
    expect(screenShadeWanted(gl)).toBe(false);
    let w = 0;
    set.add(() => w);
    expect(screenShadeWanted(gl)).toBe(false);
    w = 0.5;
    expect(screenShadeWanted(gl)).toBe(true);
  });

  it("lays its sheet after the molecules, hidden until it is worked out; a picture's tile sees as far round as it looks", () => {
    const shade = new ScreenShade(new THREE.Scene(), 100.5);
    expect(shade.sheet.renderOrder).toBe(100.5);
    expect(shade.sheet.visible).toBe(false);
    expect(shade.sheet.frustumCulled).toBe(false);
    shade.dispose();
    expect(shadeMarginPx(10)).toBeGreaterThan(shadeMarginPx(1));
    expect(shadeMarginPx(0)).toBe(2);
  });
});

describe("a very large drawing, drawn lighter", () => {
  it("says what it changed, and nothing where it changed nothing", () => {
    expect(lighterText(true, true)).toMatch(/without shadows.*per atom/);
    expect(lighterText(true, false)).toMatch(/without shadows/);
    expect(lighterText(false, true)).toMatch(/per atom/);
    expect(lighterText(false, false)).toBeNull();
  });

  it("is said in a notice, once for its id, gone when dismissed", () => {
    const { show, dismiss } = useNotices.getState();
    show({ id: "x", title: "A", text: "first" });
    show({ id: "x", title: "A", text: "again" });
    expect(useNotices.getState().notices.map((n) => n.text)).toEqual(["again"]);
    dismiss("x");
    expect(useNotices.getState().notices).toEqual([]);
  });
});
