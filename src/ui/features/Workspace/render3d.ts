import * as THREE from "three";
import { atomColour, bondRadiusOf, KEY_LIGHT_FROM, type MoleculeLook, type Style3D } from "../../../lib/chem/style3d";
import { solidsBounds } from "../../../lib/chem/layout2d";
import { EYE_HEIGHT } from "./utils/page";
import { bondLines, bondsAt, frameOf, heightOf, lookOf, pictureMarks, solidOf, WORLD_PER_ANGSTROM } from "./utils/molecule3d";
import { MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, piecesOf } from "./utils/measure3d";
import { COLORS } from "../../theme/colors";
import { chainRuns } from "../../../lib/chem/biopolymer";
import { ribbonMesh } from "./utils/ribbon";
import type { Carried3D, Molecule3D } from "./store/types";

/** How smooth a ball and a stick are in a picture: finer than on the canvas, a picture being looked at closely - a ball finer still where it is large in it (`ballSegmentsFor`). */
const BALL_SEGMENTS = 48;
const BOND_SEGMENTS = 16;
/** How far a ball's outline in a picture may stray from a circle, in pixels: too little to see. */
const OUTLINE_PX = 0.15;
/** The most segments round a ball, and the most triangles a picture's balls come to, all told, before they are drawn coarser. */
const MOST_SEGMENTS = 256;
const MOST_TRIANGLES = 20_000_000;

/**
 * How many segments round a ball in a picture, its largest ball
 * `radiusPx` pixels across its radius, `atoms` of them: enough that its
 * outline - and where two balls cut each other - strays from a circle by
 * under `OUTLINE_PX` (at 1200 dpi a ball can be hundreds of pixels across,
 * and a 48-sided one shows its sides), at least `BALL_SEGMENTS`, and no
 * more than keeps them all within `MOST_TRIANGLES`.
 */
export function ballSegmentsFor(radiusPx: number, atoms: number): number {
  const fine = radiusPx > OUTLINE_PX ? Math.PI / Math.acos(1 - OUTLINE_PX / radiusPx) : 0;
  // (a ball of n segments round and n / 2 from pole to pole is n * n triangles)
  const budget = Math.sqrt(MOST_TRIANGLES / Math.max(atoms, 1));
  const n = Math.ceil(Math.min(fine, budget, MOST_SEGMENTS) / 2) * 2;
  return Math.max(BALL_SEGMENTS, n);
}

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };

/**
 * The most pixels a picture's molecule is drawn in at once, either way:
 * past it, in tiles, each its part of the view, however large the picture
 * - a GPU's canvas has its limits, and quietly draws a smaller picture past
 * them.
 */
const TILE = 2048;

/** A picture `w` by `h` pixels cut into tiles at most `most` pixels either way: each its place and size, left to right, top to bottom. */
export function tilesOf(w: number, h: number, most: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < h; y += most) for (let x = 0; x < w; x += most) out.push({ x, y, w: Math.min(most, w - x), h: Math.min(most, h - y) });
  return out;
}

/**
 * Molecules in 3D drawn as the canvas draws them - lit, in depth, so that
 * where balls run into one another only what is nearer shows, their
 * measurements' lines and fans among them - for a picture: each seen as the canvas sees it, straight from above - or, given
 * `eyeHeight`, in perspective from that far straight above its centre - as
 * a picture lays them out (utils/molecule3d's pictureMarks), on a canvas
 * covering where they all reach on the page, `pxPerWorld` pixels to the
 * page's unit, transparent round them - each drawn in tiles at most `tile`
 * pixels either way where it is larger. Null where there are none, or no
 * WebGL to draw them with.
 */
export function rendered3d(
  ms: readonly Carried3D[],
  style: Style3D,
  pxPerWorld: number,
  eyeHeight?: number,
  tile = TILE,
): { canvas: HTMLCanvasElement; bounds: Bounds } | null {
  if (typeof document === "undefined" || !ms.length) return null;
  const eyeOver = (m: Carried3D) => (eyeHeight == null ? undefined : { x: m.at.x, y: m.at.y, z: eyeHeight });
  const each = ms
    .map((m) => ({ m, bounds: solidsBounds(pictureMarks(m, style, eyeOver(m))) }))
    .filter((e): e is { m: Carried3D; bounds: Bounds } => !!e.bounds);
  if (!each.length) return null;
  const bounds: Bounds = {
    min: { x: Math.min(...each.map((e) => e.bounds.min.x)), y: Math.min(...each.map((e) => e.bounds.min.y)) },
    max: { x: Math.max(...each.map((e) => e.bounds.max.x)), y: Math.max(...each.map((e) => e.bounds.max.y)) },
  };
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) * pxPerWorld));
  out.height = Math.max(1, Math.ceil((bounds.max.y - bounds.min.y) * pxPerWorld));
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  } catch {
    return null;
  }
  // (as the canvas draws: its tone mapping and its colours)
  renderer.setPixelRatio(1);
  // (no larger than this GPU draws)
  const gl = renderer.getContext();
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
  const most = Math.max(1, Math.min(tile, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || tile, dims?.[0] || tile, dims?.[1] || tile));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const balls: THREE.BufferGeometry[] = [];
  const stick = new THREE.CylinderGeometry(1, 1, 1, BOND_SEGMENTS);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  // (a measurement's lines and fan as the canvas's: unlit, in its blue)
  const measureLine = new THREE.MeshBasicMaterial({ color: COLORS.highlight, toneMapped: false });
  const measureFan = new THREE.MeshBasicMaterial({
    color: COLORS.highlight,
    transparent: true,
    opacity: MEASURE_FAN_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const fans: THREE.BufferGeometry[] = [];
  const ribbons: THREE.BufferGeometry[] = [];
  const ribbonMats: THREE.Material[] = [];
  // (one for each colour in each finish: a molecule's look's)
  const material = (color: string, look: MoleculeLook) => {
    const key = `${color} ${look.roughness} ${look.metalness}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: look.roughness, metalness: look.metalness });
      materials.set(key, mat);
    }
    return mat;
  };
  const up = new THREE.Vector3(0, 1, 0);
  try {
    for (const { m, bounds: b } of each) {
      const w = Math.max(1, Math.round((b.max.x - b.min.x) * pxPerWorld));
      const h = Math.max(1, Math.round((b.max.y - b.min.y) * pxPerWorld));
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, style.ambientLight));
      const key = new THREE.DirectionalLight(0xffffff, style.keyLight);
      key.position.set(...(KEY_LIGHT_FROM as [number, number, number]));
      scene.add(key);
      // the molecule, about its centre, as high as it stands and turned as it is
      const molecule = { ...m, id: 0 } as Molecule3D;
      const solid = solidOf(molecule, style);
      const look = lookOf(molecule);
      const drawn = style[look];
      const places = solid.frames[frameOf(solid, m.frame)];
      const radii = solid.radii[look];
      // (as smooth as it is large in the picture)
      const segments = ballSegmentsFor(radii.reduce((most, r) => Math.max(most, r), 0) * pxPerWorld, m.atoms.length);
      const ball = new THREE.SphereGeometry(1, segments, segments / 2);
      balls.push(ball);
      // (an atom its look leaves out is not drawn, nor a bond to it)
      const left = solid.hidden[look];
      const group = new THREE.Group();
      group.position.set(0, 0, heightOf(molecule, solid, look));
      if (m.turn) group.quaternion.set(...m.turn);
      m.atoms.forEach((a, i) => {
        if (left[i]) return;
        const mesh = new THREE.Mesh(ball, material(atomColour(a.el), drawn));
        mesh.position.set(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
        mesh.scale.setScalar(radii[i]);
        group.add(mesh);
      });
      if (drawn.atoms === "balls") {
        // (the bonds the frame shown has, where they go frame by frame)
        const bonds = bondsAt(molecule, frameOf(solid, m.frame)).filter((b) => !left[b.a1] && !left[b.a2]);
        for (const line of bondLines({ ...molecule, bonds }, places, bondRadiusOf(drawn) * WORLD_PER_ANGSTROM)) {
          const along = line.b.clone().sub(line.a);
          const length = along.length();
          if (length < 1e-9) continue;
          const mesh = new THREE.Mesh(stick, material(drawn.bondColor, drawn));
          mesh.position.copy(line.a).add(line.b).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(up, along.divideScalar(length));
          mesh.scale.set(line.r, length, line.r);
          group.add(mesh);
        }
      }
      // its chains as ribbons, where its look draws them so
      if (solid.ribbons[look] && m.biopolymer) {
        const made = ribbonMesh(places, chainRuns(m.biopolymer, m.atoms), m.biopolymer, style.ribbonColours, 1, WORLD_PER_ANGSTROM);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(made.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(made.normals, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(made.colours, 3));
        geometry.setIndex(new THREE.BufferAttribute(made.indices, 1));
        ribbons.push(geometry);
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: drawn.roughness, metalness: drawn.metalness });
        ribbonMats.push(mat);
        group.add(new THREE.Mesh(geometry, mat));
      }
      // its measurements, as the canvas draws them: lines - a distance's
      // dashed - and an angle's faint fan, in depth among its atoms, so that
      // a line running behind a ball is hidden by it
      for (const x of m.measures ?? []) {
        if (x.atoms.length < 2 || !x.atoms.every((i) => i >= 0 && i < m.atoms.length)) continue;
        const marks = measureMarks(places, x.atoms);
        const r = MEASURE_RADIUS * WORLD_PER_ANGSTROM;
        for (const [a, b] of piecesOf(marks)) {
          const along = b.clone().sub(a);
          const length = along.length();
          if (length < 1e-9) continue;
          const mesh = new THREE.Mesh(stick, measureLine);
          mesh.position.copy(a).add(b).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(up, along.divideScalar(length));
          mesh.scale.set(r, length, r);
          group.add(mesh);
        }
        if (marks.fan.length) {
          const geometry = new THREE.BufferGeometry().setFromPoints(marks.fan);
          fans.push(geometry);
          group.add(new THREE.Mesh(geometry, measureFan));
        }
      }
      scene.add(group);
      // seen as the canvas sees it - straight from above, or in perspective
      // from eyeHeight above its centre - the view cut to where it reaches
      // on the page, and each tile to its part of that (from the top left)
      // (an orthographic camera as such, as the canvas's is: the light shows on a glossy ball as it does there)
      const ortho = eyeHeight == null ? new THREE.OrthographicCamera() : null;
      const camera = ortho ?? new THREE.Camera();
      const D = eyeHeight ?? EYE_HEIGHT;
      camera.position.set(0, 0, D);
      camera.updateMatrixWorld();
      // (in perspective, the view as it is on the near plane)
      const near = eyeHeight == null ? 0.1 : 1;
      const k = eyeHeight == null ? 1 : near / D;
      const view = { left: (b.min.x - m.at.x) * k, right: (b.max.x - m.at.x) * k, top: (b.max.y - m.at.y) * k, bottom: (b.min.y - m.at.y) * k };
      const x0 = Math.round((b.min.x - bounds.min.x) * pxPerWorld);
      const y0 = Math.round((bounds.max.y - b.max.y) * pxPerWorld);
      for (const t of tilesOf(w, h, most)) {
        const left = view.left + ((view.right - view.left) * t.x) / w;
        const right = view.left + ((view.right - view.left) * (t.x + t.w)) / w;
        const top = view.top - ((view.top - view.bottom) * t.y) / h;
        const bottom = view.top - ((view.top - view.bottom) * (t.y + t.h)) / h;
        if (ortho) {
          Object.assign(ortho, { left, right, top, bottom, near, far: 2 * EYE_HEIGHT });
          ortho.updateProjectionMatrix();
        } else {
          camera.projectionMatrix.makePerspective(left, right, top, bottom, near, D * 2);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        }
        renderer.setSize(t.w, t.h, false);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 0, 0, t.w, t.h, x0 + t.x, y0 + t.y, t.w, t.h);
      }
    }
  } finally {
    for (const g of balls) g.dispose();
    stick.dispose();
    for (const mat of materials.values()) mat.dispose();
    measureLine.dispose();
    measureFan.dispose();
    for (const g of fans) g.dispose();
    for (const g of ribbons) g.dispose();
    for (const mat of ribbonMats) mat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return { canvas: out, bounds };
}

/**
 * The most pixels a picture's molecules in 3D are drawn in, all told: past
 * it, at a lower resolution, to fit (as a copied picture is: ./picture's
 * MOST_PIXELS).
 */
const PICTURE_MOST_PIXELS = 48_000_000;

/**
 * A picture's molecules in 3D (`ms`, laid out in `layout`) drawn as the
 * canvas draws them, at `dpi` (a copied picture's, as Settings says) -
 * lower only where that would come to more than `PICTURE_MOST_PIXELS`: set
 * on the layout, for its SVG and anything drawn from that, and given as a
 * bitmap, for an EMF. Null, the layout as it was, where there are none or
 * no WebGL.
 */
export function withSolidsImage(
  ms: readonly Carried3D[],
  layout: { zoom: number; solids?: Parameters<typeof solidsBounds>[0]; solidsImage?: { href: string; bounds: Bounds } },
  style: Style3D,
  dpi = 300,
) {
  const marks = solidsBounds(layout.solids ?? []);
  if (!marks || !ms.length) return null;
  const zoom = layout.zoom > 0 ? layout.zoom : 1;
  const area = Math.max((marks.max.x - marks.min.x) * zoom, 1) * Math.max((marks.max.y - marks.min.y) * zoom, 1);
  const scale = Math.min(dpi / 96, Math.sqrt(PICTURE_MOST_PIXELS / area));
  const drawn = rendered3d(ms, style, zoom * scale);
  if (!drawn) return null;
  const { canvas, bounds } = drawn;
  const href = canvas.toDataURL("image/png");
  const binary = atob(href.slice(href.indexOf(",") + 1));
  const png = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) png[i] = binary.charCodeAt(i);
  const rgba = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  layout.solidsImage = { href, bounds };
  return { png, rgba, width: canvas.width, height: canvas.height, bounds };
}
