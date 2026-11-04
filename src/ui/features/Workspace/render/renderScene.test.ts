import { describe, expect, it } from "vitest";
import { STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import { parseXYZ } from "../../../../utils/structureParsers";
import { WORLD_PER_ANGSTROM } from "../utils/molecule3d";
import { VIBRATION_PERIOD } from "../utils/vibration3d";
import type { Carried3D } from "../store/types";
import * as THREE from "three";
import { halvesOf, ordinal, renderScene, RIBBON_FILM_MOST_POINTS, turnAt, type RenderAsk } from "./renderScene";

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

/** Five residues of a chain, an alpha carbon each, 3.8 A apart: a helix, then a coil. */
function chain(over: Partial<Carried3D> = {}): Carried3D {
  return {
    name: "chain",
    atoms: [0, 1, 2, 3, 4].map((i) => ({ el: "C", x: 3.8 * i, y: 0, z: 0 })),
    bonds: [],
    at: { x: 0, y: 0 },
    biopolymer: {
      names: ["CA", "CA", "CA", "CA", "CA"],
      residueOf: [0, 1, 2, 3, 4],
      residues: [1, 2, 3, 4, 5].map((seq) => ({ name: "ALA", chain: "A", seq, iCode: "", standard: true })),
      structure: ["helix", "helix", "helix", null, null],
    },
    ...over,
  } as Carried3D;
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

  it("makes a film's width and height even - a video's encoder refuses an odd side - its frame in the shape of its pixels", () => {
    const film = (width: number, shape: RenderAsk["shape"]) => renderScene([{ m: ethene() }], STYLE_3D, { kind: "film", width, shape, motion: "turn", seconds: 1, fps: 10 });
    for (const [width, shape, size] of [
      [360, "16:9", [360, 202]],
      [1000, "16:9", [1000, 562]],
      [1904, "16:9", [1904, 1072]],
      [1001, "4:3", [1002, 752]],
    ] as const) {
      const r = film(width, shape);
      expect([r.width, r.height]).toEqual(size);
    }
    // (a fitted shape too: ethene's own, whatever it is, comes out even - and its frame is exactly its pixels' shape)
    for (const width of [360, 1000, 999]) {
      const r = film(width, "fit");
      expect([r.width % 2, r.height % 2]).toEqual([0, 0]);
      const cam = parse(r.gltf).cameras[0].orthographic;
      expect(cam.xmag / cam.ymag).toBeCloseTo(r.width / r.height, 9);
      expect((r.page.maxX - r.page.minX) / (r.page.maxY - r.page.minY)).toBeCloseTo(r.width / r.height, 9);
    }
    // (a picture keeps its own size, odd or not)
    const still = renderScene([{ m: ethene() }], STYLE_3D, { ...PICTURE, width: 1001, shape: "16:9" });
    expect([still.width, still.height]).toEqual([1001, 563]);
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

  it("turns it once, easing in and coming to rest where it began, or as a Loop at one speed", () => {
    // (Once: still at either end, back to where it began, fastest halfway)
    expect(turnAt(0, 60, "once")).toBe(0);
    expect(turnAt(59, 60, "once")).toBeCloseTo(2 * Math.PI, 9);
    expect(turnAt(1, 60, "once")).toBeLessThan(0.01);
    expect(turnAt(30, 60, "once") - turnAt(29, 60, "once")).toBeGreaterThan((2 * Math.PI) / 60);
    // (Loop: a step short of where it began, every step the same)
    expect(turnAt(59, 60, "loop")).toBeCloseTo((2 * Math.PI * 59) / 60, 9);
    expect(turnAt(1, 60, "loop")).toBeCloseTo(turnAt(31, 60, "loop") - turnAt(30, 60, "loop"), 9);
    // (none said: Once)
    expect(turnAt(30, 60, undefined)).toBe(turnAt(30, 60, "once"));
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

  it("tags each molecule's node, its atoms' balls and its bonds' sticks, so that a renderer finds the molecule as drawn", () => {
    const g = parse(renderScene([{ m: ethene() }], STYLE_3D, PICTURE).gltf);
    const tags = g.nodes.map((n: Json) => n.extras?.meno ?? null);
    const [mol] = tags.filter((t: Json) => t && "molecule" in t);
    expect(mol.molecule).toBe(0);
    expect(mol.bonds).toContainEqual({ a: 0, b: 1, order: 2 });
    expect(mol.bonds).toHaveLength(5);
    const atoms = tags.filter((t: Json) => t && "atom" in t);
    expect(atoms.map((t: Json) => t.element)).toEqual(["C", "C", "H", "H", "H", "H"]);
    expect(atoms.map((t: Json) => t.atom)).toEqual([0, 1, 2, 3, 4, 5]);
    // (each stick says its bond: the double bond's two lines both bond 0's)
    const sticks = tags.filter((t: Json) => t && "bond" in t).map((t: Json) => t.bond);
    expect(new Set(sticks)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(sticks.filter((b: number) => mol.bonds[b].order === 2).length).toBeGreaterThanOrEqual(2);
  });

  it("writes a film of a renderer's own motion still, with no atom list besides: no keyed animation, its frames for its length", () => {
    const r = renderScene([{ m: ethene() }], STYLE_3D, { kind: "film", width: 640, shape: "16:9", motion: "a-renderers-own", seconds: 2, fps: 30 });
    expect(r.frames).toBe(60);
    const g = parse(r.gltf);
    expect(g.animations ?? []).toHaveLength(0);
    expect(g.scenes[0].extras.meno.molecules).toBeUndefined();
  });

  describe("what the canvas draws besides balls and sticks", () => {
    const meshNamed = (g: Json, start: string) => g.meshes.filter((m: Json) => m.name.startsWith(start));

    it("draws a chain as its ribbon - its atoms the ribbon stands for left out - each point in the ribbon's colour", () => {
      const r = renderScene([{ m: chain() }], STYLE_3D, PICTURE);
      const g = parse(r.gltf);
      expect(meshNamed(g, "ball")).toHaveLength(0);
      const ribbons = meshNamed(g, "ribbon");
      expect(ribbons).toHaveLength(1);
      const prim = ribbons[0].primitives[0];
      expect(g.accessors[prim.attributes.POSITION].count).toBeGreaterThan(20);
      expect(g.accessors[prim.attributes.COLOR_0]).toMatchObject({ type: "VEC4" });
      // (white beneath its colours, in the look's finish)
      expect(g.materials[prim.material].pbrMetallicRoughness.baseColorFactor).toEqual([1, 1, 1, 1]);
      // (framed as far as the ribbon reaches: along the chain, 15.2 A and more)
      expect((r.page.maxX - r.page.minX) / k).toBeGreaterThan(15.2);
    });

    it("makes a ribbon of clay one colour, and draws none where the look draws its chains as atoms", () => {
      const clay = parse(renderScene([{ m: chain() }], STYLE_3D, { ...PICTURE, molecules: "clay" }).gltf);
      expect(meshNamed(clay, "ribbon")[0].primitives[0].attributes.COLOR_0).toBeUndefined();
      const atoms: Style3D = { ...STYLE_3D, primary: { ...STYLE_3D.primary, biopolymers: "atoms" } };
      const g = parse(renderScene([{ m: chain() }], atoms, PICTURE).gltf);
      expect(meshNamed(g, "ribbon")).toHaveLength(0);
      expect(g.nodes[g.scenes[0].nodes[0]].children.length).toBe(5);
    });

    it("writes a moving chain's ribbon for each moment, each shown only then", () => {
      const move = Array.from({ length: 15 }, (_, i) => (i % 3 === 2 ? 0.3 : 0));
      const r = renderScene([{ m: chain(), move }], STYLE_3D, { kind: "film", width: 320, shape: "16:9", motion: "vibration", seconds: 1.2, fps: 10 });
      const g = parse(r.gltf);
      expect(meshNamed(g, "ribbon")).toHaveLength(r.frames);
      const steps = g.animations[0].samplers.filter((x: Json) => x.interpolation === "STEP");
      expect(steps).toHaveLength(r.frames);
      // (at each moment, one ribbon of its own at full size, the others at none)
      const scales = steps.map((x: Json) => g.accessors[x.output]);
      expect(scales.every((a: Json) => a.count === r.frames)).toBe(true);
    });

    it("writes a large moving ribbon every so many frames, each held till the next, and says so", () => {
      // (240 residues along a line, swinging: their ribbons, every frame, would come to more than a film's ribbons may weigh)
      const n = 240;
      const big = chain({
        atoms: Array.from({ length: n }, (_, i) => ({ el: "C", x: 3.8 * i, y: 0, z: 0 })),
        biopolymer: {
          names: Array<string>(n).fill("CA"),
          residueOf: Array.from({ length: n }, (_, i) => i),
          residues: Array.from({ length: n }, (_, i) => ({ name: "ALA", chain: "A", seq: i + 1, iCode: "", standard: true })),
          structure: Array<null>(n).fill(null),
        },
      });
      const move = Array.from({ length: 3 * n }, (_, i) => (i % 3 === 2 ? 0.2 : 0));
      const ask: RenderAsk = { kind: "film", width: 320, shape: "16:9", motion: "vibration", seconds: 3.6, fps: 30 };
      const r = renderScene([{ m: big, move }], STYLE_3D, ask);
      const g = parse(r.gltf);
      const ribbons = meshNamed(g, "ribbon");
      const points = g.accessors[ribbons[0].primitives[0].attributes.POSITION].count;
      const every = Math.ceil((points * r.frames) / RIBBON_FILM_MOST_POINTS);
      expect(every).toBeGreaterThan(1);
      expect(ribbons).toHaveLength(Math.ceil(r.frames / every));
      expect(r.note).toBe(`Ribbons move every ${ordinal(every)} frame`);
      // (a small one, every frame, and nothing said)
      expect(renderScene([{ m: chain(), move: move.slice(0, 15) }], STYLE_3D, ask).note).toBeUndefined();
      // (a large scene to write: given the time it takes)
    }, 30_000);

    it("writes a number as an ordinal", () => {
      expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
    });

    it("colours each half of a stick as its atom, where the look colours bonds by atom", () => {
      const byAtom: Style3D = { ...STYLE_3D, primary: { ...STYLE_3D.primary, bondColouring: "byAtom" } };
      const g = parse(renderScene([{ m: ethene() }], byAtom, PICTURE).gltf);
      const root = g.nodes[g.scenes[0].nodes[0]];
      const sticks = root.children.map((i: number) => g.nodes[i]).filter((n: Json) => g.meshes[n.mesh].name.startsWith("stick"));
      // (six lines, two halves each, each half as long as the line's half)
      expect(sticks).toHaveLength(12);
      const colours = new Set(sticks.map((n: Json) => g.meshes[n.mesh].primitives[0].material));
      expect(colours.size).toBe(2);
      const ballColours = new Set(root.children.map((i: number) => g.nodes[i]).filter((n: Json) => g.meshes[n.mesh].name.startsWith("ball")).map((n: Json) => g.meshes[n.mesh].primitives[0].material));
      expect(colours).toEqual(ballColours);
      // (one colour for every stick where it does not)
      const single = parse(renderScene([{ m: ethene() }], STYLE_3D, PICTURE).gltf);
      expect(new Set(single.meshes.filter((m: Json) => m.name.startsWith("stick")).map((m: Json) => m.primitives[0].material)).size).toBe(1);
    });

    it("draws the lines on its balls as rings lying on them, about the molecule's axes, on the balls its look lines", () => {
      const lined: Style3D = { ...STYLE_3D, primary: { ...STYLE_3D.primary, ballLines: "three", ballLinesOn: "carbon" } };
      const g = parse(renderScene([{ m: ethene() }], lined, PICTURE).gltf);
      const root = g.nodes[g.scenes[0].nodes[0]];
      const rings = root.children.map((i: number) => g.nodes[i]).filter((n: Json) => g.meshes[n.mesh].name.startsWith("line"));
      // (two carbons, three circles each, each as large as its ball)
      expect(rings).toHaveLength(6);
      const balls = root.children.map((i: number) => g.nodes[i]).filter((n: Json) => g.meshes[n.mesh].name.startsWith("ball"));
      // (each on a carbon's ball, as large as it: ethene's carbons on its axis, x = y = 0)
      for (const r of rings) {
        const ball = balls.find((b: Json) => JSON.stringify(b.translation) === JSON.stringify(r.translation));
        expect(ball.translation.slice(0, 2)).toEqual([0, 0]);
        expect(r.scale[0]).toBe(ball.scale[0]);
      }
      expect(new Set(rings.map((r: Json) => JSON.stringify(r.rotation ?? [0, 0, 0, 1]))).size).toBe(3);
      // (none where it draws none)
      expect(meshNamed(parse(renderScene([{ m: ethene() }], STYLE_3D, PICTURE).gltf), "line")).toHaveLength(0);
    });

    it("draws its measurements - a distance's dashes, an angle's arc and fan - unlit, and none to an atom left out", () => {
      const measures = [
        { id: 1, atoms: [0, 1] },
        { id: 2, atoms: [2, 0, 1] },
      ];
      const g = parse(renderScene([{ m: ethene({ measures }) }], STYLE_3D, PICTURE).gltf);
      const lines = meshNamed(g, "measure line");
      const fans = meshNamed(g, "measure fan");
      expect(lines).toHaveLength(1);
      expect(fans).toHaveLength(1);
      expect(g.materials[lines[0].primitives[0].material].extensions).toEqual({ KHR_materials_unlit: {} });
      expect(g.materials[fans[0].primitives[0].material]).toMatchObject({ alphaMode: "BLEND", doubleSided: true });
      const hiding: Style3D = { ...STYLE_3D, primary: { ...STYLE_3D.primary, hydrogens: "carbonHidden" } };
      const h = parse(renderScene([{ m: ethene({ measures }) }], hiding, PICTURE).gltf);
      // (the angle runs to a hidden hydrogen: the distance alone, no fan)
      expect(meshNamed(h, "measure line")).toHaveLength(1);
      expect(meshNamed(h, "measure fan")).toHaveLength(0);
    });

    it("halves a line's pieces at the middle of their length", () => {
      const v = (x: number) => new THREE.Vector3(x, 0, 0);
      const [one, two] = halvesOf([
        { a: v(0), b: v(1), r: 0.1 },
        { a: v(1), b: v(4), r: 0.1 },
      ]);
      expect(one.map((p) => [p.a.x, p.b.x])).toEqual([
        [0, 1],
        [1, 2],
      ]);
      expect(two.map((p) => [p.a.x, p.b.x])).toEqual([[2, 4]]);
    });
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
    const STOPPED = { look: "glass", shading: "lit", outlines: "none", outline: 3, outlineColour: "black", band: 0.5, sticks: "stopped" } as const;
    const glass = parts({ ...PICTURE, molecules: "glass", finish: STOPPED });

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

    it("leaves them where they run on inside, where the look is asked to show them", () => {
      const shown = parts({ ...PICTURE, molecules: "glass", finish: { look: "glass", shading: "lit", outlines: "none", outline: 3, outlineColour: "black", band: 0.5, sticks: "shown" } });
      expect(shown.sticks.map((n: Json) => +n.scale[1].toFixed(3)).sort()).toEqual(solid.sticks.map((n: Json) => +n.scale[1].toFixed(3)).sort());
    });

    it("keeps the balls as they are", () => {
      expect(glass.balls.map((n: Json) => n.scale)).toEqual(solid.balls.map((n: Json) => n.scale));
    });
  });
});
