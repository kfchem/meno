import { describe, expect, it } from "vitest";
import { STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import { parseXYZ } from "../../../../utils/structureParsers";
import { WORLD_PER_ANGSTROM } from "../utils/molecule3d";
import { VIBRATION_PERIOD } from "../utils/vibration3d";
import type { Carried3D } from "../store/types";
import { renderScene, type RenderAsk } from "./renderScene";

type Json = Record<string, any>;

/** Ethene, its double bond as such, standing on the page at (10, 20). */
function ethene(over: Partial<Carried3D> = {}): Carried3D {
  const m = parseXYZ(`6
ethene
C 0.000 0.000 0.667
C 0.000 0.000 -0.667
H 0.000 0.923 1.238
H 0.000 -0.923 1.238
H 0.000 0.923 -1.238
H 0.000 -0.923 -1.238
`)[0];
  m.bonds = m.bonds.map((b) => (b.a1 < 2 && b.a2 < 2 ? { ...b, order: 2 } : b));
  return { ...m, name: "ethene", at: { x: 10, y: 20 }, ...over } as Carried3D;
}

const PICTURE: RenderAsk = { kind: "picture", width: 1000, shape: "fit" };
const parse = (gltf: string): Json => JSON.parse(gltf);
const k = WORLD_PER_ANGSTROM;

describe("molecules in 3D written as a scene to render", () => {
  it("stands each where it stands on the page, in ångströms, its atoms as balls and its bonds' lines as sticks", () => {
    const r = renderScene([{ m: ethene() }], STYLE_3D, PICTURE);
    const g = parse(r.gltf);
    const root = g.nodes[g.scenes[0].nodes[0]];
    expect(root.name).toBe("ethene");
    expect(root.translation[0]).toBeCloseTo(10 / k, 5);
    expect(root.translation[1]).toBeCloseTo(20 / k, 5);
    const children = root.children.map((i: number) => g.nodes[i]);
    const balls = children.filter((n: Json) => g.meshes[n.mesh].name.startsWith("ball"));
    const sticks = children.filter((n: Json) => g.meshes[n.mesh].name.startsWith("stick"));
    // (six atoms; four single bonds a line each, the double bond two)
    expect(balls).toHaveLength(6);
    expect(sticks).toHaveLength(6);
    // (each ball as large as the look makes its atom)
    expect(balls.every((n: Json) => n.scale[0] > 0 && n.scale[0] === n.scale[1])).toBe(true);
  });

  it("frames it with a camera straight above, orthographic, as wide as the picture's frame on the page, in the shape asked for", () => {
    const fit = renderScene([{ m: ethene() }], STYLE_3D, PICTURE);
    const g = parse(fit.gltf);
    const cam = g.cameras[0].orthographic;
    expect(cam.xmag / cam.ymag).toBeCloseTo(fit.width / fit.height, 2);
    expect((fit.page.maxX - fit.page.minX) / k).toBeCloseTo(2 * cam.xmag, 4);
    expect((fit.page.minX + fit.page.maxX) / 2 / k).toBeCloseTo(g.nodes.find((n: Json) => n.camera === 0).translation[0], 4);
    const wide = renderScene([{ m: ethene() }], STYLE_3D, { ...PICTURE, shape: "16:9", width: 1920 });
    expect([wide.width, wide.height]).toEqual([1920, 1080]);
    const gw = parse(wide.gltf).cameras[0].orthographic;
    expect(gw.xmag / gw.ymag).toBeCloseTo(16 / 9, 4);
  });

  it("lights it as the canvas does: its key light, and the light all round said besides", () => {
    const g = parse(renderScene([{ m: ethene() }], STYLE_3D, PICTURE).gltf);
    expect(g.extensions.KHR_lights_punctual.lights[0]).toMatchObject({ type: "directional", intensity: STYLE_3D.keyLight });
    expect(g.scenes[0].extras.meno.ambientLight).toBe(STYLE_3D.ambientLight);
  });

  it("leaves out the atoms its look leaves out, and their bonds", () => {
    const hiding: Style3D = { ...STYLE_3D, primary: { ...STYLE_3D.primary, hydrogens: "carbonHidden" } };
    const g = parse(renderScene([{ m: ethene() }], hiding, PICTURE).gltf);
    const root = g.nodes[g.scenes[0].nodes[0]];
    const names = root.children.map((i: number) => g.meshes[g.nodes[i].mesh].name);
    expect(names.filter((n: string) => n.startsWith("ball"))).toHaveLength(2);
    expect(names.filter((n: string) => n.startsWith("stick"))).toHaveLength(2);
  });

  it("makes its molecules and surfaces of what is asked", () => {
    const glass = parse(renderScene([{ m: ethene() }], STYLE_3D, { ...PICTURE, molecules: "glass" }).gltf);
    expect(glass.materials.every((m: Json) => m.extensions?.KHR_materials_transmission?.transmissionFactor === 1)).toBe(true);
    const clay = parse(renderScene([{ m: ethene() }], STYLE_3D, { ...PICTURE, molecules: "clay" }).gltf);
    expect(clay.materials).toHaveLength(1);
    const surface = { plus: { positions: Float32Array.from([0, 0, 0, k, 0, 0, 0, k, 0]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]) }, minus: null };
    const seen = parse(renderScene([{ m: ethene(), surfaces: surface }], STYLE_3D, PICTURE).gltf);
    const mat = seen.materials[seen.meshes.find((m: Json) => m.name.startsWith("surface")).primitives[0].material];
    expect(mat).toMatchObject({ alphaMode: "BLEND", doubleSided: true });
    const glassy = parse(renderScene([{ m: ethene(), surfaces: surface }], STYLE_3D, { ...PICTURE, surfaces: "glass" }).gltf);
    expect(glassy.materials[glassy.meshes.find((m: Json) => m.name.startsWith("surface")).primitives[0].material].extensions.KHR_materials_transmission).toBeTruthy();
  });

  it("writes a surface another grid colours as one mesh, each point its colour, white beneath and not seen through", () => {
    const positions = Float32Array.from([0, 0, 0, k, 0, 0, 0, k, 0]);
    const plus = { positions, normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), colours: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const g = parse(renderScene([{ m: ethene(), surfaces: { plus, minus: null } }], STYLE_3D, PICTURE).gltf);
    const surfaces = g.meshes.filter((m: Json) => m.name.startsWith("surface"));
    expect(surfaces).toHaveLength(1);
    const prim = surfaces[0].primitives[0];
    // (COLOR_0: RGBA, one a point - glTF 3.7.2.1 - multiplying a white base colour, 3.9.2)
    expect(g.accessors[prim.attributes.COLOR_0]).toMatchObject({ type: "VEC4", count: 3 });
    expect(g.materials[prim.material]).toMatchObject({ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, doubleSided: true });
    expect(g.materials[prim.material].alphaMode).toBeUndefined();
    // (glossy as asked: white still, its points' colours over it)
    const glossy = parse(renderScene([{ m: ethene(), surfaces: { plus, minus: null } }], STYLE_3D, { ...PICTURE, surfaces: "glossy" }).gltf);
    const gp = glossy.meshes.find((m: Json) => m.name.startsWith("surface")).primitives[0];
    expect(glossy.materials[gp.material].extensions.KHR_materials_clearcoat).toBeTruthy();
    expect(gp.attributes.COLOR_0).toBeDefined();
  });

  it("turns it once round in a film, about the page's up, ending a frame short of where it began - so that it loops", () => {
    const r = renderScene([{ m: ethene() }], STYLE_3D, { kind: "film", width: 640, shape: "16:9", motion: "turn", seconds: 2, fps: 30 });
    expect(r.frames).toBe(60);
    const g = parse(r.gltf);
    const [a] = g.animations;
    expect(a.channels).toHaveLength(1);
    expect(a.channels[0].target).toEqual({ node: g.scenes[0].nodes[0], path: "rotation" });
    expect(g.accessors[a.samplers[0].input]).toMatchObject({ count: 60, min: [0], max: [Math.fround(59 / 30)] });
    // (the frame holds it whichever way it is turned)
    expect(r.page.maxX - r.page.minX).toBeGreaterThan(0);
  });

  it("swings it in its vibration for whole periods, its atoms and sticks moving", () => {
    const move = [0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const r = renderScene([{ m: ethene(), move }], STYLE_3D, { kind: "film", width: 640, shape: "16:9", motion: "vibration", seconds: 5, fps: 30 });
    // (5 s: four whole periods of 1.2 s)
    expect(r.frames).toBe(Math.round(4 * VIBRATION_PERIOD * 30));
    const g = parse(r.gltf);
    const paths = g.animations[0].channels.map((c: Json) => c.target.path);
    expect(paths.filter((p: string) => p === "translation")).toHaveLength(6 + 6);
    expect(paths.filter((p: string) => p === "scale")).toHaveLength(6);
  });

  it("plays its frames one into the next in a film", () => {
    const m = ethene();
    const shifted = m.atoms.flatMap((a) => [a.x + 0.1, a.y, a.z]);
    const r = renderScene([{ m: { ...m, frames: [shifted] } }], STYLE_3D, { kind: "film", width: 640, shape: "16:9", motion: "frames", seconds: 1, fps: 10 });
    expect(r.frames).toBe(10);
    expect(parse(r.gltf).animations[0].channels.length).toBeGreaterThan(0);
  });

  it("says there is nothing to render where nothing is drawn", () => {
    expect(() => renderScene([], STYLE_3D, PICTURE)).toThrow(/nothing to render/);
  });

  describe("seen through, a stick stops at its ball's surface", () => {
    const parts = (ask: RenderAsk) => {
      const g = parse(renderScene([{ m: ethene() }], STYLE_3D, ask).gltf);
      const root = g.nodes[g.scenes[0].nodes[0]];
      const children = root.children.map((i: number) => g.nodes[i]);
      return {
        balls: children.filter((n: Json) => g.meshes[n.mesh].name.startsWith("ball")),
        sticks: children.filter((n: Json) => g.meshes[n.mesh].name.startsWith("stick")),
      };
    };
    const solid = parts(PICTURE);
    const glass = parts({ ...PICTURE, molecules: "glass" });

    it("leaves the sticks of an opaque look from atom to atom", () => {
      expect(solid.sticks).toHaveLength(6);
      // (the C-H bond: 0.923 across and 0.571 along)
      const ch = Math.hypot(0.923, 1.238 - 0.667);
      expect(solid.sticks.some((n: Json) => Math.abs(n.scale[1] - ch) < 1e-4)).toBe(true);
    });

    it("stops a single bond's stick at both balls' surfaces, its own radius allowed for", () => {
      const rC = glass.balls[0].scale[0];
      const rH = glass.balls[2].scale[0];
      const ch = Math.hypot(0.923, 1.238 - 0.667);
      // (the C-H sticks: those of the bond's own radius, not the double bond's two lines)
      const singles = glass.sticks.filter((n: Json) => Math.abs(n.scale[0] - 0.1) < 1e-3);
      expect(singles).toHaveLength(4);
      const r = singles[0].scale[0];
      const reach = (R: number) => Math.sqrt(R * R - r * r);
      for (const n of singles) expect(n.scale[1]).toBeCloseTo(ch - reach(rC) - reach(rH), 3);
      expect(singles[0].scale[1]).toBeLessThan(ch - 0.5 * (rC + rH));
    });

    it("stops a double bond's two lines where each meets the sphere, off its axis", () => {
      const rC = glass.balls[0].scale[0];
      const lines = glass.sticks.filter((n: Json) => Math.abs(n.translation[2]) < 1e-6);
      expect(lines).toHaveLength(2);
      for (const n of lines) {
        const off = Math.abs(n.translation[1]);
        const r = n.scale[0];
        const reach = Math.sqrt(rC * rC - r * r);
        expect(off).toBeGreaterThan(0.05);
        expect(n.scale[1]).toBeCloseTo(1.334 - 2 * Math.sqrt(reach * reach - off * off), 3);
      }
    });

    it("keeps the balls as they are", () => {
      expect(glass.balls.map((n: Json) => n.scale)).toEqual(solid.balls.map((n: Json) => n.scale));
    });
  });
});
