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

/** How smooth a ball and a stick are in a picture: finer than on the canvas, a picture being looked at closely. */
const BALL_SEGMENTS = 48;
const BOND_SEGMENTS = 16;

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };

/**
 * Molecules in 3D drawn as the canvas draws them - lit, in depth, so that
 * where balls run into one another only what is nearer shows, their
 * measurements' lines and fans among them - for a picture: each seen as the canvas sees it, straight from above - or, given
 * `eyeHeight`, in perspective from that far straight above its centre - as
 * a picture lays them out (utils/molecule3d's pictureMarks), on a canvas
 * covering where they all reach on the page, `pxPerWorld` pixels to the
 * page's unit, transparent round them. Null where there are none, or no
 * WebGL to draw them with.
 */
export function rendered3d(
  ms: readonly Carried3D[],
  style: Style3D,
  pxPerWorld: number,
  eyeHeight?: number,
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const ball = new THREE.SphereGeometry(1, BALL_SEGMENTS, BALL_SEGMENTS);
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
      renderer.setSize(w, h, false);
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
      // on the page
      let camera: THREE.Camera;
      if (eyeHeight == null) {
        camera = new THREE.OrthographicCamera(
          b.min.x - m.at.x,
          b.max.x - m.at.x,
          b.max.y - m.at.y,
          b.min.y - m.at.y,
          0.1,
          2 * EYE_HEIGHT,
        );
        camera.position.set(0, 0, EYE_HEIGHT);
        camera.updateMatrixWorld();
      } else {
        const near = 1;
        const D = eyeHeight;
        camera = new THREE.Camera();
        camera.position.set(0, 0, D);
        camera.updateMatrixWorld();
        const k = near / D;
        camera.projectionMatrix.makePerspective(
          (b.min.x - m.at.x) * k,
          (b.max.x - m.at.x) * k,
          (b.max.y - m.at.y) * k,
          (b.min.y - m.at.y) * k,
          near,
          D * 2,
        );
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
      renderer.render(scene, camera);
      ctx.drawImage(
        renderer.domElement,
        Math.round((b.min.x - bounds.min.x) * pxPerWorld),
        Math.round((bounds.max.y - b.max.y) * pxPerWorld),
        w,
        h,
      );
    }
  } finally {
    ball.dispose();
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

/** The most pixels across a picture's molecules in 3D take, either way, for each 300 dpi they are drawn at. */
const PICTURE_MOST_PX = 1600;

/**
 * A picture's molecules in 3D (`ms`, laid out in `layout`) drawn as the
 * canvas draws them, at `dpi` (a copied picture's, as Settings says) or at
 * most 1600 px across for each 300 of it: set on the layout, for its SVG
 * and anything drawn from that, and given as a bitmap, for an EMF. Null,
 * the layout as it was, where there are none or no WebGL.
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
  const across = Math.max(marks.max.x - marks.min.x, marks.max.y - marks.min.y) * zoom;
  const scale = Math.min(dpi / 96, (PICTURE_MOST_PX * dpi) / 300 / Math.max(across, 1));
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
