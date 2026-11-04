/**
 * A scene written as glTF 2.0 (docs/RENDER.md), from Khronos's
 * specification alone - glTF 2.0, registry.khronos.org/glTF/specs/2.0 - and
 * its extensions KHR_lights_punctual, KHR_materials_clearcoat,
 * KHR_materials_transmission, KHR_materials_ior, KHR_materials_volume and
 * KHR_materials_unlit
 * (github.com/KhronosGroup/glTF, extensions/2.0/Khronos): what a renderer is given to
 * make pictures and films of molecules in 3D. Its sections are cited where
 * what is written follows one.
 *
 * Plain data in, one JSON text out, its binary data in a buffer embedded as
 * a `data:` URI (3.6.1.1), so that the scene is one file of text. Units are
 * ångströms; +Y is up, +X right, and the camera looks down -Z (3.4).
 */

export type Vec3 = readonly [number, number, number];
/** A unit quaternion, x, y, z, w (3.5.3). */
export type Quat = readonly [number, number, number, number];

/** A material: the metallic-roughness model's factors (3.9.2), its colour linear, with its alpha; blended where it lets what is behind it show (3.9.4). */
export type GltfMaterial = {
  name: string;
  colour: readonly [number, number, number, number];
  metallic: number;
  roughness: number;
  /** Seen through: its alpha blends it over what is behind it. */
  blend?: boolean;
  /** Seen from both sides (3.9.5): a surface, not a closed solid. */
  doubleSided?: boolean;
  /** A clear coat over it (KHR_materials_clearcoat): how much, and how rough. */
  clearcoat?: { factor: number; roughness: number };
  /** How much light passes through it (KHR_materials_transmission): glass. */
  transmission?: number;
  /** Its index of refraction (KHR_materials_ior). */
  ior?: number;
  /** Solid through, not a thin wall (KHR_materials_volume): how thick, in the mesh's units, and the colour white light turns to over a distance in it. */
  volume?: { thickness: number; attenuationColour?: Vec3; attenuationDistance?: number };
  /** Not lit: its colour as it is, whatever light falls on it (KHR_materials_unlit) - a mark, not a thing. */
  unlit?: boolean;
};

/** A mesh of one primitive of triangles (3.7.2): its vertices' places and normals, its triangles by vertex where it shares vertices, and their colours where they have their own (COLOR_0, RGBA, linear). */
export type GltfMesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices?: Uint32Array;
  colours?: Float32Array;
  material: number;
};

/** A node (3.5.2): what it holds - a mesh, the camera, a light - and its place, turn and scale, about its parent. */
export type GltfNode = {
  name?: string;
  mesh?: number;
  camera?: number;
  light?: number;
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
  children?: number[];
  /** What the node says besides (3.12's `extras`): plain data, for the renderer. */
  extras?: Record<string, unknown>;
};

/** An orthographic camera (3.10.3.4): half its width and height, and how near and far it sees. */
export type GltfCamera = { name: string; xmag: number; ymag: number; znear: number; zfar: number };

/** A light (KHR_lights_punctual): a directional one, in lux, shining down its node's -Z; or a point, in candela. Its colour linear. */
export type GltfLight = { name: string; type: "directional" | "point"; colour: Vec3; intensity: number };

/** A node's translation, rotation or scale, one value a key (3.11). */
export type GltfChannel = { node: number; path: "translation" | "rotation" | "scale"; values: Float32Array; interpolation?: "LINEAR" | "STEP" };

/** An animation: its keys' times in seconds, shared by its channels. */
export type GltfAnimation = { name: string; times: Float32Array; channels: GltfChannel[] };

export type GltfScene = {
  name: string;
  materials: readonly GltfMaterial[];
  meshes: readonly GltfMesh[];
  nodes: readonly GltfNode[];
  /** The nodes at the scene's root. */
  roots: readonly number[];
  cameras: readonly GltfCamera[];
  lights: readonly GltfLight[];
  animations: readonly GltfAnimation[];
  /** What the scene says besides (3.12's `extras`): plain data, for the renderer. */
  extras?: Record<string, unknown>;
};

// componentType (3.6.2.2)
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
// bufferView.target (5.11.5)
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const SIZE: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

/** The extensions a light and a material's layers need. */
const LIGHTS = "KHR_lights_punctual";
const CLEARCOAT = "KHR_materials_clearcoat";
const TRANSMISSION = "KHR_materials_transmission";
const IOR = "KHR_materials_ior";
const VOLUME = "KHR_materials_volume";
const UNLIT = "KHR_materials_unlit";

function fail(what: string): never {
  throw new Error(`The scene cannot be written: ${what}.`);
}

const finite = (v: ArrayLike<number>) => {
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return false;
  return true;
};

/** Bytes as base64, a piece at a time. */
function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** Each element's least and greatest, component by component (3.6.2.5). */
function bounds(values: Float32Array, size: number): { min: number[]; max: number[] } {
  const min = Array<number>(size).fill(Infinity);
  const max = Array<number>(size).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const c = i % size;
    if (values[i] < min[c]) min[c] = values[i];
    if (values[i] > max[c]) max[c] = values[i];
  }
  // (as a float32 holds them: the values themselves are float32)
  return { min: min.map(Math.fround), max: max.map(Math.fround) };
}

/**
 * The scene as glTF 2.0's JSON, its data in one buffer embedded in it. Each
 * accessor its own buffer view, tightly packed, starting on four bytes
 * (3.6.2.4); positions and the animations' times with their bounds
 * (3.6.2.5); every node and mesh in the one scene. Throws, saying why, where
 * what is given cannot be written as glTF says.
 */
export function writeGltf(scene: GltfScene, generator = "Meno"): string {
  const pieces: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];

  // (the same values given again - a shape every atom's mesh shares - are the same accessor)
  const known = new Map<object, number>();
  /** An accessor of `values`, in a buffer view of its own. */
  const accessor = (values: Float32Array | Uint16Array | Uint32Array, type: "SCALAR" | "VEC3" | "VEC4", opts: { target?: number; bounded?: boolean } = {}): number => {
    const again = known.get(values);
    if (again !== undefined) return again;
    const size = SIZE[type];
    if (!values.length || values.length % size) fail(`${values.length} values do not make whole ${type} elements`);
    if (values instanceof Float32Array && !finite(values)) fail("a value is not a number");
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    // (four bytes apart: every view starts on a multiple of its component's size)
    const pad = (4 - (length % 4)) % 4;
    if (pad) {
      pieces.push(new Uint8Array(pad));
      length += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, ...(opts.target ? { target: opts.target } : {}) });
    pieces.push(bytes.slice());
    length += bytes.length;
    const componentType = values instanceof Float32Array ? FLOAT : values instanceof Uint16Array ? UNSIGNED_SHORT : UNSIGNED_INT;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: values.length / size,
      type,
      ...(opts.bounded && values instanceof Float32Array ? bounds(values, size) : {}),
    });
    known.set(values, accessors.length - 1);
    return accessors.length - 1;
  };

  const used = new Set<string>();
  const unit = (v: number | undefined) => v === undefined || (v >= 0 && v <= 1);
  const materials = scene.materials.map((m) => {
    if (m.colour.length !== 4 || !finite(m.colour) || m.colour.some((c) => c < 0 || c > 1)) fail(`${m.name}'s colour is not one`);
    if (!(m.metallic >= 0 && m.metallic <= 1 && m.roughness >= 0 && m.roughness <= 1)) fail(`${m.name}'s finish is not one`);
    if (!unit(m.clearcoat?.factor) || !unit(m.clearcoat?.roughness) || !unit(m.transmission)) fail(`${m.name}'s layers are not ones`);
    // (an index of refraction of 1 or more: KHR_materials_ior - its 0, a mode of its own, never written)
    if (m.ior !== undefined && !(m.ior >= 1 && Number.isFinite(m.ior))) fail(`${m.name}'s index of refraction is not one`);
    if (m.volume && (!(m.volume.thickness >= 0) || !unit(m.volume.attenuationColour?.[0]) || !unit(m.volume.attenuationColour?.[1]) || !unit(m.volume.attenuationColour?.[2]) || (m.volume.attenuationDistance !== undefined && !(m.volume.attenuationDistance > 0))))
      fail(`${m.name}'s volume is not one`);
    const extensions: Record<string, unknown> = {};
    if (m.clearcoat) extensions[CLEARCOAT] = { clearcoatFactor: m.clearcoat.factor, clearcoatRoughnessFactor: m.clearcoat.roughness };
    if (m.transmission !== undefined) extensions[TRANSMISSION] = { transmissionFactor: m.transmission };
    if (m.ior !== undefined) extensions[IOR] = { ior: m.ior };
    // (a volume only with transmission, which it needs: KHR_materials_volume)
    if (m.volume && m.transmission !== undefined)
      extensions[VOLUME] = {
        thicknessFactor: m.volume.thickness,
        ...(m.volume.attenuationColour ? { attenuationColor: [...m.volume.attenuationColour] } : {}),
        ...(m.volume.attenuationDistance !== undefined ? { attenuationDistance: m.volume.attenuationDistance } : {}),
      };
    // (unlit: the extension's object empty - KHR_materials_unlit)
    if (m.unlit) extensions[UNLIT] = {};
    Object.keys(extensions).forEach((e) => used.add(e));
    return {
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: [...m.colour], metallicFactor: m.metallic, roughnessFactor: m.roughness },
      ...(m.blend ? { alphaMode: "BLEND" } : {}),
      ...(m.doubleSided ? { doubleSided: true } : {}),
      ...(Object.keys(extensions).length ? { extensions } : {}),
    };
  });

  const short = new Map<Uint32Array, Uint16Array>();
  const shorts = (v: Uint32Array) => short.get(v) ?? short.set(v, Uint16Array.from(v)).get(v)!;
  const meshes = scene.meshes.map((m) => {
    if (m.material < 0 || m.material >= materials.length) fail(`${m.name} has no material`);
    const vertices = m.positions.length / 3;
    if (!Number.isInteger(vertices) || !vertices || m.normals.length !== m.positions.length) fail(`${m.name}'s vertices are not whole`);
    if (m.colours && m.colours.length !== vertices * 4) fail(`${m.name}'s colours are not one a vertex`);
    // (COLOR_0 within 0 to 1: 3.7.2.1)
    if (m.colours && m.colours.some((c) => !(c >= 0 && c <= 1))) fail(`${m.name}'s colours are not colours`);
    const attributes: Record<string, number> = {
      POSITION: accessor(m.positions, "VEC3", { target: ARRAY_BUFFER, bounded: true }),
      NORMAL: accessor(m.normals, "VEC3", { target: ARRAY_BUFFER }),
      ...(m.colours ? { COLOR_0: accessor(m.colours, "VEC4", { target: ARRAY_BUFFER }) } : {}),
    };
    let indices: number | undefined;
    if (m.indices) {
      if (m.indices.length % 3 || m.indices.some((i) => i >= vertices)) fail(`${m.name}'s triangles are not its vertices'`);
      // (never the largest value of its component type: 3.7.2.1 - so unsigned shorts below 65535 vertices)
      indices = accessor(vertices < 0xffff ? shorts(m.indices) : m.indices, "SCALAR", { target: ELEMENT_ARRAY_BUFFER });
    } else if (vertices % 3) fail(`${m.name}'s vertices do not make whole triangles`);
    // (mode 4: triangles, the default - 5.24.4)
    return { name: m.name, primitives: [{ attributes, ...(indices !== undefined ? { indices } : {}), material: m.material }] };
  });

  const nodes = scene.nodes.map((n, i) => {
    const out: Record<string, unknown> = {};
    if (n.name) out.name = n.name;
    if (n.mesh !== undefined) {
      if (n.mesh < 0 || n.mesh >= meshes.length) fail(`node ${i} holds no mesh`);
      out.mesh = n.mesh;
    }
    if (n.camera !== undefined) {
      if (n.camera < 0 || n.camera >= scene.cameras.length) fail(`node ${i} holds no camera`);
      out.camera = n.camera;
    }
    if (n.light !== undefined) {
      if (n.light < 0 || n.light >= scene.lights.length) fail(`node ${i} holds no light`);
      out.extensions = { [LIGHTS]: { light: n.light } };
    }
    if (n.extras) out.extras = n.extras;
    if (n.children?.length) {
      if (n.children.some((c) => c === i || c < 0 || c >= scene.nodes.length)) fail(`node ${i}'s children are not nodes`);
      out.children = [...n.children];
    }
    if (n.translation) {
      if (!finite(n.translation)) fail(`node ${i} is nowhere`);
      out.translation = [...n.translation];
    }
    if (n.rotation) {
      // (a unit quaternion: 3.5.3)
      const len = Math.hypot(...n.rotation);
      if (!finite(n.rotation) || Math.abs(len - 1) > 1e-5) fail(`node ${i}'s turn is not a unit quaternion`);
      out.rotation = n.rotation.map((c) => c / len);
    }
    if (n.scale) {
      if (!finite(n.scale)) fail(`node ${i}'s scale is not one`);
      out.scale = [...n.scale];
    }
    return out;
  });
  // (each node one parent at most, and no node its own ancestor: 3.5.2 - a tree, from the roots)
  const parent = new Map<number, number>();
  scene.nodes.forEach((n, i) =>
    n.children?.forEach((c) => {
      if (parent.has(c)) fail(`node ${c} has two parents`);
      parent.set(c, i);
    }),
  );
  if (scene.roots.some((r) => parent.has(r) || r < 0 || r >= nodes.length)) fail("a root is another node's child");
  const reached = new Set<number>();
  const walk = (i: number) => {
    if (reached.has(i)) fail("the nodes are not a tree");
    reached.add(i);
    scene.nodes[i].children?.forEach(walk);
  };
  scene.roots.forEach(walk);

  const cameras = scene.cameras.map((c) => {
    // (3.10.3.4: magnifications never zero, far beyond near)
    if (!(c.xmag > 0 && c.ymag > 0 && c.znear >= 0 && c.zfar > c.znear) || !finite([c.xmag, c.ymag, c.znear, c.zfar])) fail(`${c.name} sees nothing`);
    return { name: c.name, type: "orthographic", orthographic: { xmag: c.xmag, ymag: c.ymag, znear: c.znear, zfar: c.zfar } };
  });

  const lights = scene.lights.map((l) => {
    if (!finite(l.colour) || l.colour.some((c) => c < 0) || !(l.intensity >= 0)) fail(`${l.name} is not a light`);
    return { name: l.name, type: l.type, color: [...l.colour], intensity: l.intensity };
  });

  const animations = scene.animations.map((a) => {
    const t = a.times;
    // (keys at times from 0, each later than the last: 3.11)
    if (!t.length || t[0] < 0 || !finite(t) || t.some((v, k) => k > 0 && !(v > t[k - 1]))) fail(`${a.name}'s times do not go forward`);
    if (!a.channels.length) fail(`${a.name} moves nothing`);
    const input = accessor(t, "SCALAR", { bounded: true });
    const samplers: Record<string, unknown>[] = [];
    const channels = a.channels.map((c) => {
      if (c.node < 0 || c.node >= nodes.length) fail(`${a.name} moves no node`);
      const size = c.path === "rotation" ? 4 : 3;
      // (as many values as keys: 3.11, LINEAR and STEP)
      if (c.values.length !== t.length * size) fail(`${a.name} has not a value for each key`);
      if (c.path === "rotation")
        for (let k = 0; k < t.length; k++) {
          const q = c.values.subarray(4 * k, 4 * k + 4);
          if (Math.abs(Math.hypot(...q) - 1) > 1e-4) fail(`${a.name} turns by what is not a unit quaternion`);
        }
      samplers.push({ input, interpolation: c.interpolation ?? "LINEAR", output: accessor(c.values, c.path === "rotation" ? "VEC4" : "VEC3") });
      return { sampler: samplers.length - 1, target: { node: c.node, path: c.path } };
    });
    return { name: a.name, channels, samplers };
  });

  const data = new Uint8Array(length);
  let at = 0;
  for (const p of pieces) {
    data.set(p, at);
    at += p.length;
  }
  if (lights.length) used.add(LIGHTS);
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0", generator },
    ...(used.size ? { extensionsUsed: [...used].sort() } : {}),
    scene: 0,
    scenes: [{ name: scene.name, nodes: [...scene.roots], ...(scene.extras ? { extras: scene.extras } : {}) }],
    nodes,
    ...(meshes.length ? { meshes } : {}),
    ...(materials.length ? { materials } : {}),
    ...(cameras.length ? { cameras } : {}),
    ...(animations.length ? { animations } : {}),
    ...(accessors.length ? { accessors, bufferViews, buffers: [{ byteLength: length, uri: `data:application/octet-stream;base64,${base64(data)}` }] } : {}),
    ...(lights.length ? { extensions: { [LIGHTS]: { lights } } } : {}),
  };
  return JSON.stringify(gltf);
}
