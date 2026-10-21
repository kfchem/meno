import { describe, expect, it } from "vitest";
import { writeGltf, type GltfScene } from "./gltf";
import { unitCylinder, unitRing, unitSphere } from "./shapes";

/**
 * The glTF 2.0 Meno writes, checked against Khronos's specification
 * (registry.khronos.org/glTF/specs/2.0): its JSON's required properties,
 * its accessors' alignment and bounds, its buffer as a data: URI, its
 * nodes a tree, its cameras and animations as the specification says them
 * - read back from what was written.
 */

type Json = Record<string, any>;

const sphere = unitSphere(16, 8);

function scene(over: Partial<GltfScene> = {}): GltfScene {
  return {
    name: "test",
    materials: [{ name: "grey", colour: [0.5, 0.5, 0.5, 1], metallic: 0, roughness: 1 }],
    meshes: [{ name: "ball", positions: sphere.positions, normals: sphere.normals, indices: sphere.indices, material: 0 }],
    nodes: [{ name: "molecule", translation: [1, 2, 3], children: [1, 2] }, { mesh: 0, translation: [0.5, 0, 0], scale: [0.3, 0.3, 0.3] }, { mesh: 0, translation: [-0.5, 0, 0] }, { camera: 0, translation: [0, 0, 10] }],
    roots: [0, 3],
    cameras: [{ name: "Camera", xmag: 4, ymag: 3, znear: 0.01, zfar: 20 }],
    lights: [],
    animations: [],
    ...over,
  };
}

/** The buffer's bytes, from its data: URI. */
function bytesOf(g: Json): Uint8Array {
  const uri: string = g.buffers[0].uri;
  expect(uri.startsWith("data:application/octet-stream;base64,")).toBe(true);
  const bin = atob(uri.slice(uri.indexOf(",") + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** An accessor's floats, read back as the specification lays them out. */
function floats(g: Json, i: number): Float32Array {
  const a = g.accessors[i];
  const v = g.bufferViews[a.bufferView];
  const bytes = bytesOf(g).slice(v.byteOffset, v.byteOffset + v.byteLength);
  return new Float32Array(bytes.buffer);
}

describe("a scene written as glTF 2.0", () => {
  it("says its version and holds one scene of its root nodes", () => {
    const g: Json = JSON.parse(writeGltf(scene()));
    expect(g.asset).toEqual({ version: "2.0", generator: "Meno" });
    expect(g.scene).toBe(0);
    expect(g.scenes).toEqual([{ name: "test", nodes: [0, 3] }]);
    expect(g.nodes[0]).toEqual({ name: "molecule", translation: [1, 2, 3], children: [1, 2] });
    expect(g.nodes[3]).toEqual({ camera: 0, translation: [0, 0, 10] });
  });

  it("keeps its data in one buffer, each accessor's view starting on four bytes, a mesh's positions bounded", () => {
    const g: Json = JSON.parse(writeGltf(scene()));
    expect(g.buffers).toHaveLength(1);
    expect(bytesOf(g).length).toBe(g.buffers[0].byteLength);
    for (const v of g.bufferViews) expect(v.byteOffset % 4).toBe(0);
    const prim = g.meshes[0].primitives[0];
    const pos = g.accessors[prim.attributes.POSITION];
    expect(pos).toMatchObject({ componentType: 5126, type: "VEC3", count: sphere.positions.length / 3 });
    const read = floats(g, prim.attributes.POSITION);
    for (let c = 0; c < 3; c++) {
      const each = read.filter((_, i) => i % 3 === c);
      expect(pos.min[c]).toBe(Math.min(...each));
      expect(pos.max[c]).toBe(Math.max(...each));
    }
    // (fewer vertices than unsigned shorts hold: its triangles in them, never the largest)
    expect(g.accessors[prim.indices]).toMatchObject({ componentType: 5123, type: "SCALAR", count: sphere.indices.length });
    expect(g.bufferViews[g.accessors[prim.indices].bufferView].target).toBe(34963);
    expect(g.bufferViews[pos.bufferView].target).toBe(34962);
  });

  it("writes a shape shared by meshes once", () => {
    const two = scene({
      materials: [
        { name: "a", colour: [1, 0, 0, 1], metallic: 0, roughness: 1 },
        { name: "b", colour: [0, 0, 1, 1], metallic: 0, roughness: 1 },
      ],
      meshes: [0, 1].map((m) => ({ name: `ball ${m}`, positions: sphere.positions, normals: sphere.normals, indices: sphere.indices, material: m })),
    });
    const g: Json = JSON.parse(writeGltf(two));
    expect(g.meshes[0].primitives[0].attributes).toEqual(g.meshes[1].primitives[0].attributes);
    expect(g.meshes[0].primitives[0].indices).toBe(g.meshes[1].primitives[0].indices);
    expect(g.accessors).toHaveLength(3);
  });

  it("writes materials in the metallic-roughness model, and their layers by Khronos's extensions", () => {
    const g: Json = JSON.parse(
      writeGltf(
        scene({
          materials: [
            { name: "plain", colour: [0.2, 0.3, 0.4, 1], metallic: 0.1, roughness: 0.6 },
            { name: "seen through", colour: [0.2, 0.3, 0.4, 0.6], metallic: 0, roughness: 0.5, blend: true, doubleSided: true },
            { name: "glossy", colour: [1, 0, 0, 1], metallic: 0, roughness: 0.3, clearcoat: { factor: 1, roughness: 0.05 } },
            { name: "glass", colour: [1, 1, 1, 1], metallic: 0, roughness: 0, transmission: 1, ior: 1.5, volume: { thickness: 2, attenuationColour: [0.5, 0.8, 1], attenuationDistance: 1.5 } },
          ],
        }),
      ),
    );
    expect(g.materials[0]).toEqual({ name: "plain", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.3, 0.4, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } });
    expect(g.materials[1]).toMatchObject({ alphaMode: "BLEND", doubleSided: true });
    expect(g.materials[2].extensions).toEqual({ KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.05 } });
    expect(g.materials[3].extensions).toEqual({
      KHR_materials_transmission: { transmissionFactor: 1 },
      KHR_materials_ior: { ior: 1.5 },
      KHR_materials_volume: { thicknessFactor: 2, attenuationColor: [0.5, 0.8, 1], attenuationDistance: 1.5 },
    });
    // (every extension used, said so)
    expect(g.extensionsUsed).toEqual(["KHR_materials_clearcoat", "KHR_materials_ior", "KHR_materials_transmission", "KHR_materials_volume"]);
    expect(g.extensionsRequired).toBeUndefined();
  });

  it("writes an orthographic camera and a directional light (KHR_lights_punctual)", () => {
    const g: Json = JSON.parse(
      writeGltf(scene({ lights: [{ name: "Key", type: "directional", colour: [1, 1, 1], intensity: 1 }], nodes: [...scene().nodes, { light: 0, rotation: [0, 0, 0, 1] }], roots: [0, 3, 4] })),
    );
    expect(g.cameras).toEqual([{ name: "Camera", type: "orthographic", orthographic: { xmag: 4, ymag: 3, znear: 0.01, zfar: 20 } }]);
    expect(g.extensionsUsed).toEqual(["KHR_lights_punctual"]);
    expect(g.extensions.KHR_lights_punctual.lights).toEqual([{ name: "Key", type: "directional", color: [1, 1, 1], intensity: 1 }]);
    expect(g.nodes[4].extensions).toEqual({ KHR_lights_punctual: { light: 0 } });
  });

  it("writes an animation's keys at times going forward, its input bounded, a value for each key", () => {
    const times = Float32Array.from([0, 1 / 30, 2 / 30]);
    const turns = Float32Array.from([0, 0, 0, 1, 0, Math.sin(0.1), 0, Math.cos(0.1), 0, Math.sin(0.2), 0, Math.cos(0.2)]);
    const g: Json = JSON.parse(writeGltf(scene({ animations: [{ name: "turn", times, channels: [{ node: 0, path: "rotation", values: turns }, { node: 1, path: "translation", values: new Float32Array(9) }] }] })));
    const [a] = g.animations;
    expect(a.channels).toEqual([
      { sampler: 0, target: { node: 0, path: "rotation" } },
      { sampler: 1, target: { node: 1, path: "translation" } },
    ]);
    expect(a.samplers[0].input).toBe(a.samplers[1].input);
    const input = g.accessors[a.samplers[0].input];
    expect(input).toMatchObject({ type: "SCALAR", componentType: 5126, count: 3, min: [0], max: [Math.fround(2 / 30)] });
    expect(g.accessors[a.samplers[0].output]).toMatchObject({ type: "VEC4", count: 3 });
    expect(a.samplers[0].interpolation).toBe("LINEAR");
  });

  it("refuses what the specification does not allow", () => {
    const bad: Partial<GltfScene>[] = [
      { cameras: [{ name: "C", xmag: 0, ymag: 1, znear: 0.1, zfar: 10 }] },
      { cameras: [{ name: "C", xmag: 1, ymag: 1, znear: 10, zfar: 1 }] },
      { nodes: [{ rotation: [0, 0, 0, 2] }], roots: [0] },
      { nodes: [{ children: [1] }, { children: [0] }], roots: [0] },
      { nodes: [{ children: [1] }, {}, { children: [1] }], roots: [0, 2] },
      { nodes: [{ translation: [NaN, 0, 0] }], roots: [0] },
      { materials: [{ name: "x", colour: [2, 0, 0, 1], metallic: 0, roughness: 1 }] },
      { materials: [{ name: "x", colour: [1, 0, 0, 1], metallic: 0, roughness: 1, ior: 0.5 }] },
      { meshes: [{ name: "x", positions: new Float32Array(6), normals: new Float32Array(6), material: 0 }] },
      { animations: [{ name: "a", times: Float32Array.from([0, 0]), channels: [{ node: 0, path: "translation", values: new Float32Array(6) }] }] },
      { animations: [{ name: "a", times: Float32Array.from([0, 1]), channels: [{ node: 0, path: "translation", values: new Float32Array(3) }] }] },
    ];
    for (const b of bad) expect(() => writeGltf(scene(b))).toThrow(/cannot be written/);
  });
});

describe("the shapes atoms and bonds are made of", () => {
  it("are a sphere of radius 1 and a closed cylinder of radius 1 and height 1 along +Y, each normal of unit length", () => {
    for (const s of [unitSphere(), unitCylinder()]) {
      for (let i = 0; i < s.normals.length; i += 3) expect(Math.hypot(s.normals[i], s.normals[i + 1], s.normals[i + 2])).toBeCloseTo(1, 5);
      expect(Math.max(...s.indices)).toBeLessThan(s.positions.length / 3);
    }
    const ball = unitSphere();
    for (let i = 0; i < ball.positions.length; i += 3) expect(Math.hypot(ball.positions[i], ball.positions[i + 1], ball.positions[i + 2])).toBeCloseTo(1, 5);
    const stick = unitCylinder();
    const ys = stick.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(-0.5);
    expect(Math.max(...ys)).toBe(0.5);
  });

  it("face outward: each triangle's turn, by the right hand, points away from the middle", () => {
    for (const s of [unitSphere(16, 8), unitCylinder(16)]) {
      const p = (i: number) => [s.positions[3 * i], s.positions[3 * i + 1], s.positions[3 * i + 2]];
      for (let t = 0; t < s.indices.length; t += 3) {
        const [a, b, c] = [p(s.indices[t]), p(s.indices[t + 1]), p(s.indices[t + 2])];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        expect(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]).toBeGreaterThan(0);
      }
    }
  });

  it("make a ring round +Y of radius 1, its tube as thick as asked, each triangle facing as its corners' normals do", () => {
    const r = unitRing(0.05, 32, 8);
    for (let i = 0; i < r.positions.length; i += 3) {
      const out = Math.hypot(r.positions[i], r.positions[i + 2]);
      expect(Math.hypot(out - 1, r.positions[i + 1])).toBeCloseTo(0.05, 5);
    }
    const p = (i: number) => [r.positions[3 * i], r.positions[3 * i + 1], r.positions[3 * i + 2]];
    const nn = (i: number) => [r.normals[3 * i], r.normals[3 * i + 1], r.normals[3 * i + 2]];
    for (let t = 0; t < r.indices.length; t += 3) {
      const [a, b, c] = [p(r.indices[t]), p(r.indices[t + 1]), p(r.indices[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = nn(r.indices[t]);
      expect(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]).toBeGreaterThan(0);
    }
  });
});
