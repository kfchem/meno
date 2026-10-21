import * as THREE from "three";
import { atomColour, ballCircles, bondRadiusOf, KEY_LIGHT_FROM, linedBall, LINE_LEAST_PX, lineWidth, type Style3D } from "../../../lib/chem/style3d";
import { solidsBounds } from "../../../lib/chem/layout2d";
import { EYE_HEIGHT } from "./utils/page";
import { withCentres, bondLines, bondsAt, frameOf, heightOf, linesOf, lookOf, magnifiedOf, pictureMarks, solidOf, WORLD_PER_ANGSTROM } from "./utils/molecule3d";
import { outlineMaterial } from "./utils/outlineMaterial";
import { MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, piecesOf } from "./utils/measure3d";
import { COLORS } from "../../theme/colors";
import { chainRuns } from "../../../lib/chem/biopolymer";
import { ribbonMesh } from "./utils/ribbon";
import type { Carried3D, Molecule3D } from "./store/types";
import { backToFront } from "./utils/backToFront";
import { colourSurface, pictureSurface, SURFACE_OPACITY, surfaceGeometry, surfaceMaterial, surfaceOpacity } from "./utils/surfaceMesh";
import { atomNumbersOf, digitsOf, NUMBER_HEIGHT_MOST_A, NUMBER_LEAST_PX, numberHeight, numberPlaces, numbersShownOn } from "./utils/atomNumbers";
import { JOINT_NUMBER_A, jointNumbersMesh, jointUniforms, setJointAttributes } from "./utils/jointNumbers";
import { OCCLUSION_DIRECT, occludedMaterial, setAtomOcclusion, setBondOcclusion } from "./utils/occlusionMaterial";
import { occlusionNow, packLines } from "./utils/occlusions";
import { watchShaderErrors } from "./utils/menoShader";
import { bentStickGeometry, stickBends } from "./utils/stickBend";
import { fitShadow, lightBoxOf } from "./utils/shadows3d";
import { ScreenShade, shadeMarginPx, shadeWith } from "./utils/screenShade";

/** How smooth a ball and a stick are in a picture: finer than on the canvas, a picture being looked at closely - a ball finer still where it is large in it (`ballSegmentsFor`). */
const BALL_SEGMENTS = 48;
const BOND_SEGMENTS = 16;
/** The shadow map a picture's molecule casts its shadow in, in texels a side: finer than the canvas's, for print. */
const PICTURE_SHADOW_MAP = 4096;
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

/** Two boxes as one, either of which may be none. */
function unionOf(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a || !b) return a ?? b;
  return { min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y) }, max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y) } };
}

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
 * hollows shaded and casting the key light's shadow on themselves
 * (utils/occlusion3d, utils/shadows3d; with every ball and stick, not the
 * canvas's coarse ones), their measurements' lines and fans among them, and
 * the surface each shows (an orbital's, a density's), seen through,
 * farthest first - for a picture: each seen as the canvas sees it, straight from above - or, given
 * `eyeHeight`, in perspective from that far straight above its centre - as
 * a picture lays them out (utils/molecule3d's pictureMarks), on a canvas
 * covering where they all reach on the page, `pxPerWorld` pixels to the
 * page's unit, transparent round them - each drawn in tiles at most `tile`
 * pixels either way where it is larger. Null where there are none, or no
 * WebGL to draw them with. A style's lines - round its balls and sticks,
 * and on its balls - are as wide as the style sets them in ångströms, in
 * proportion to the molecule at any size, never thinner than its least
 * pixels, `cssPx` of the picture's to one of the screen's (a picture at
 * 300 dpi, 300 / 96); what lies further
 * back fades toward white, the page's colour, as on the canvas.
 */
/** A renderer as a picture is drawn with: its own context, its drawing kept to be read. */
export function pictureRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  watchShaderErrors(renderer);
  return renderer;
}

export function rendered3d(
  ms: readonly Carried3D[],
  style: Style3D,
  pxPerWorld: number,
  eyeHeight?: number,
  tile = TILE,
  cssPx = 1,
  // (a renderer to draw with, kept by whoever gives it - many small pictures one after another, say: each a context of
  // its own, the browser takes the oldest live ones away; else one made for this picture and let go after it)
  using?: THREE.WebGLRenderer,
): { canvas: HTMLCanvasElement; bounds: Bounds } | null {
  if (typeof document === "undefined" || !ms.length) return null;
  const eyeOver = (m: Carried3D) => (eyeHeight == null ? undefined : { x: m.at.x, y: m.at.y, z: eyeHeight });
  // (each as far as it reaches: its atoms, and the surface it shows)
  const each = ms
    .map((m) => {
      const surface = pictureSurface(m, style, eyeOver(m));
      return { m, surface, bounds: unionOf(solidsBounds(pictureMarks(m, style, eyeOver(m))), surface?.bounds ?? null) };
    })
    .filter((e): e is typeof e & { bounds: Bounds } => !!e.bounds);
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
    renderer = using ?? pictureRenderer();
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
  renderer.shadowMap.enabled = style.shadows > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // (cast once for each molecule, not again for each of its tiles: every tile the same shadow)
  renderer.shadowMap.autoUpdate = false;
  const made: { dispose(): void }[] = [];
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
  const surfaces: THREE.BufferGeometry[] = [];
  const surfaceMat = surfaceMaterial(SURFACE_OPACITY);
  // (one coloured by another grid - NCI's - not seen through, as the canvas draws it)
  const colouredMat = surfaceMaterial(surfaceOpacity(true));
  const stickOfMeasures = new THREE.CylinderGeometry(1, 1, 1, BOND_SEGMENTS);
  const up = new THREE.Vector3(0, 1, 0);
  const mtx = new THREE.Matrix4();
  const colour = new THREE.Color();
  try {
    for (const { m, surface, bounds: b } of each) {
      const w = Math.max(1, Math.round((b.max.x - b.min.x) * pxPerWorld));
      const h = Math.max(1, Math.round((b.max.y - b.min.y) * pxPerWorld));
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, style.ambientLight));
      const key = new THREE.DirectionalLight(0xffffff, style.keyLight);
      key.position.set(...(KEY_LIGHT_FROM as [number, number, number]));
      scene.add(key, key.target);
      // the molecule, about its centre, as high as it stands and turned as it is
      const molecule = { ...m, id: 0 } as Molecule3D;
      const solid = solidOf(molecule, style);
      const look = lookOf(molecule);
      const drawn = style[look];
      const places = solid.frames[frameOf(solid, m.frame)];
      const radii = solid.radii[look];
      // (as smooth as it is large in the picture)
      const segments = ballSegmentsFor(radii.reduce((most, r) => Math.max(most, r), 0) * pxPerWorld, m.atoms.length);
      // (an atom its look leaves out is not drawn, nor a bond to it)
      const left = solid.hidden[look];
      const group = new THREE.Group();
      group.position.set(0, 0, heightOf(molecule, solid, look));
      if (m.turn) group.quaternion.set(...m.turn);
      // (as large as it is shown: docs/WORKSPACE.md, *Magnified display*)
      const mag = magnifiedOf(molecule);
      group.scale.setScalar(mag);
      // its atoms, one ball each (none, for one its look leaves out), and
      // its bonds - those the frame shown has, where they go frame by frame -
      // their hollows shaded as the canvas shades them
      // (and its sticks to ring centres: withCentres)
      const bonds = drawn.atoms !== "space" ? withCentres(molecule, bondsAt(molecule, frameOf(solid, m.frame))).filter((b) => !left[b.a1] && !left[b.a2]) : [];
      const lines = bondLines({ ...molecule, bonds }, places, bondRadiusOf(drawn) * WORLD_PER_ANGSTROM, solid.ends[look], drawn.multipleBonds === "one");
      const occlusion = drawn.occlusion > 0 ? occlusionNow(places, radii, packLines(lines)) : null;
      const finish = { roughness: drawn.roughness, metalness: drawn.metalness };
      const ball = new THREE.SphereGeometry(1, segments, segments / 2);
      const atomsMat = new THREE.MeshStandardMaterial(finish);
      const ao = occludedMaterial(atomsMat, "atoms");
      const atomsMesh = new THREE.InstancedMesh(ball, atomsMat, m.atoms.length);
      made.push(ball, atomsMat);
      m.atoms.forEach((a, i) => {
        const r = left[i] ? 0 : radii[i];
        atomsMesh.setMatrixAt(i, mtx.makeScale(r, r, r).setPosition(places[3 * i], places[3 * i + 1], places[3 * i + 2]));
        atomsMesh.setColorAt(i, colour.set(atomColour(a.el, drawn)));
      });
      // (lines on its balls, where its style draws them)
      ball.setAttribute("ballLined", new THREE.InstancedBufferAttribute(Float32Array.from(m.atoms, (a) => (linedBall(a.el, drawn) ? 1 : 0)), 1));
      const circles = ballCircles(drawn);
      ao.lines.amount.value.set(circles >= 2 ? 1 : 0, circles >= 2 ? 1 : 0, circles >= 3 ? 1 : 0);
      // (in the balls' own units, the least as many of the picture's pixels as the canvas's, `cssPx` to one)
      ao.lines.width.value = drawn.ballLinesWidth * WORLD_PER_ANGSTROM;
      ao.lines.least.value = LINE_LEAST_PX * cssPx;
      ao.lines.colour.value.set(drawn.ballLinesColor).convertLinearToSRGB();
      if (occlusion) {
        setAtomOcclusion(ball, occlusion.atoms);
        ao.strength.value = drawn.occlusionBy === "atoms" ? drawn.occlusion : 0;
        ao.direct.value = OCCLUSION_DIRECT;
      }
      atomsMesh.castShadow = atomsMesh.receiveShadow = true;
      group.add(atomsMesh);
      // (the numbers shown on its atoms, as the canvas draws them - utils/atomNumbers - each in the part of its ball seen from above;
      // Sticks, where the sticks meet: utils/jointNumbers)
      if (m.atomNumbers && drawn.atoms === "sticks") {
        const nums = atomNumbersOf(molecule, m.atomNumbers.kind);
        const on = numbersShownOn(molecule);
        const joints = jointNumbersMesh(m.atoms.length);
        const inks = new Float32Array(3 * m.atoms.length);
        m.atoms.forEach((a, i) => {
          joints.setMatrixAt(i, mtx.makeTranslation(places[3 * i], places[3 * i + 1], places[3 * i + 2]));
          colour.set(atomColour(a.el, drawn)).toArray(inks, 3 * i);
        });
        joints.instanceMatrix.needsUpdate = true;
        setJointAttributes(joints, nums, Float32Array.from(m.atoms, (_, i) => (on[i] && !left[i] ? 1 : 0)), inks);
        const ju = jointUniforms(joints);
        ju.pxPer.value = pxPerWorld;
        ju.height.value = JOINT_NUMBER_A * WORLD_PER_ANGSTROM;
        // (in front of where the sticks meet, as on the canvas: past the sticks' own round ends)
        ju.lift.value = bondRadiusOf(drawn) * WORLD_PER_ANGSTROM * 1.2;
        ju.shown.value = 1;
        made.push(joints.geometry, joints.material as THREE.Material);
        group.add(joints);
      } else if (m.atomNumbers) {
        const nums = atomNumbersOf(molecule, m.atomNumbers.kind);
        const on = numbersShownOn(molecule);
        const digits = Uint8Array.from(nums, (v, i) => (on[i] ? digitsOf(v) : 0));
        group.updateMatrixWorld(true);
        const centres = new Float32Array(3 * m.atoms.length);
        const v = new THREE.Vector3();
        const rs = Float32Array.from(m.atoms, (_, i) => (left[i] ? 0 : radii[i]));
        m.atoms.forEach((_, i) => {
          v.set(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyMatrix4(group.matrixWorld);
          centres.set([v.x, v.y, v.z], 3 * i);
        });
        const heights = Float32Array.from(m.atoms, (_, i) => numberHeight(digits[i], rs[i] / WORLD_PER_ANGSTROM));
        const at = new Float32Array(3 * m.atoms.length);
        // (where they stand as the picture shows them: magnified as the molecule is - utils/molecule3d `magnifiedOf`)
        const seen = rs.map((r) => r * mag);
        numberPlaces(centres, seen, heights, digits, at, lines.length ? { bonds, r: bondRadiusOf(drawn) * WORLD_PER_ANGSTROM * mag } : null);
        ball.setAttribute("ballNumber", new THREE.InstancedBufferAttribute(nums, 1));
        ball.setAttribute("ballNumberPlace", new THREE.InstancedBufferAttribute(Float32Array.from({ length: 4 * m.atoms.length }, (_, k) => (k % 4 === 3 ? on[k >> 2] : at[3 * (k >> 2) + (k % 4)])), 4));
        ao.numbers.shown.value = 1;
        ao.numbers.pxPer.value = pxPerWorld;
        // (the least in the picture's own pixels, not the canvas's: drawn at its size in print, as the Sticks' are - a number is left out only where it would be too small to read in the picture itself)
        ao.numbers.least.value = NUMBER_LEAST_PX;
        ao.numbers.most.value = NUMBER_HEIGHT_MOST_A * WORLD_PER_ANGSTROM;
      }
      // the style's line round every ball and stick, and its depth fade (utils/outlineMaterial, occlusionMaterial)
      const fades = [ao.fade];
      const lined: { of: THREE.InstancedMesh; geometry: THREE.BufferGeometry }[] = [];
      if (drawn.outline > 0) lined.push({ of: atomsMesh, geometry: ball });
      if (lines.length) {
        const bondsMat = new THREE.MeshStandardMaterial({ ...finish, color: drawn.bondColor });
        const bo = occludedMaterial(bondsMat, "bonds");
        made.push(bondsMat);
        fades.push(bo.fade);
        // (each line's bond, for its ends' colours)
        const lineBond = bonds.flatMap((b) => Array<typeof b>(linesOf(b.order)).fill(b));
        // the straight sticks, and apart from them those that curve in to a lone atom (utils/stickBend) - drawn with the rings a curve needs
        const bent = lines.flatMap((l, k) => (l.bend ? [k] : []));
        const straight = bent.length ? lines.flatMap((l, k) => (l.bend ? [] : [k])) : lines.map((_, k) => k);
        for (const [which, stick] of [
          [straight, new THREE.CylinderGeometry(1, 1, 1, BOND_SEGMENTS)],
          [bent, bentStickGeometry(BOND_SEGMENTS)],
        ] as const) {
          if (!which.length) continue;
          // (those that bend, their own material - the straight ones' twin - so that straight sticks never pay for the bending)
          let mat = bondsMat;
          if (which === bent) {
            mat = bondsMat.clone();
            occludedMaterial(mat, "bonds", { bend: true, like: bo });
            made.push(mat);
          }
          const bondsMesh = new THREE.InstancedMesh(stick, mat, which.length);
          made.push(stick);
          if (drawn.outline > 0) lined.push({ of: bondsMesh, geometry: stick });
          // (each half in its atom's colour, where the style colours them so: its two ends')
          if (drawn.bondColouring === "byAtom") {
            const ends = [new Float32Array(3 * which.length), new Float32Array(3 * which.length)];
            which.forEach((k, j) => {
              colour.set(atomColour(m.atoms[lineBond[k].a1].el, drawn)).toArray(ends[0], 3 * j);
              colour.set(atomColour(m.atoms[lineBond[k].a2].el, drawn)).toArray(ends[1], 3 * j);
            });
            stick.setAttribute("bondEndA", new THREE.InstancedBufferAttribute(ends[0], 3));
            stick.setAttribute("bondEndB", new THREE.InstancedBufferAttribute(ends[1], 3));
            bo.byAtom.value = 1;
          }
          which.forEach((k, j) => {
            const line = lines[k];
            const along = line.b.clone().sub(line.a);
            const length = along.length();
            const way = length > 1e-9 ? along.divideScalar(length) : up;
            const at = line.a.clone().add(line.b).multiplyScalar(0.5);
            bondsMesh.setMatrixAt(j, mtx.compose(at, new THREE.Quaternion().setFromUnitVectors(up, way), new THREE.Vector3(line.r, length, line.r)));
          });
          if (which === bent) stick.setAttribute("stickBend", new THREE.InstancedBufferAttribute(stickBends(which.map((k) => lines[k])), 4));
          if (occlusion) setBondOcclusion(stick, Float32Array.from(which.flatMap((k) => [occlusion.bonds[2 * k], occlusion.bonds[2 * k + 1]])));
          bondsMesh.castShadow = bondsMesh.receiveShadow = true;
          group.add(bondsMesh);
        }
        if (occlusion) {
          bo.strength.value = drawn.occlusionBy === "atoms" ? drawn.occlusion : 0;
          bo.direct.value = OCCLUSION_DIRECT;
        }
      }
      for (const { of, geometry } of lined) {
        const o = outlineMaterial(of.geometry.getAttribute("stickBend") !== undefined);
        const mesh = new THREE.InstancedMesh(geometry, o.material, of.count);
        mesh.instanceMatrix = of.instanceMatrix;
        o.width.value = lineWidth(drawn.outline, WORLD_PER_ANGSTROM * mag, cssPx / pxPerWorld);
        o.material.color.set(drawn.outlineColor);
        fades.push(o.fade);
        made.push(o.material);
        group.add(mesh);
      }
      // (the molecule's front and back in the camera's depth: it seen from EYE_HEIGHT - or eyeHeight - above, standing as high as it does)
      const reach = solid.reach[look] * mag;
      const centre = group.position.z - (eyeHeight ?? EYE_HEIGHT);
      for (const u of fades) {
        u.fadeNear.value = centre + reach;
        u.fadeFar.value = centre - reach;
        u.fadeAmount.value = drawn.depthFade;
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
      // the surface it shows, as the canvas draws it: its phases one mesh,
      // seen through, its triangles farthest first as the picture sees them
      if (surface) {
        const { geometry, split, coloured } = surfaceGeometry(surface.plus, surface.minus);
        colourSurface(geometry, split, style.surfacePlus, style.surfaceMinus);
        const way = new THREE.Vector3(0, 0, -1).applyQuaternion(group.quaternion.clone().invert());
        backToFront(geometry.getAttribute("position").array as Float32Array, [way.x, way.y, way.z], geometry.getIndex()!.array as Uint32Array);
        surfaces.push(geometry);
        const mesh = new THREE.Mesh(geometry, coloured ? colouredMat : surfaceMat);
        mesh.renderOrder = 1;
        group.add(mesh);
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
          const mesh = new THREE.Mesh(stickOfMeasures, measureLine);
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
      // hollows shaded on the screen, where its look shades them so: as the
      // canvas does, at the picture's own resolution, each tile seeing a
      // margin round it (what shades its edge lies beyond it)
      const shade = drawn.occlusionBy === "screen" ? new ScreenShade(scene, 0.5) : null;
      if (shade) {
        // (its balls, sticks and ribbons: not its measurements)
        for (const o of group.children) {
          const mesh = o as THREE.Mesh;
          if ((mesh as THREE.InstancedMesh).isInstancedMesh || ribbonMats.includes(mesh.material as THREE.Material)) shadeWith(mesh, () => drawn.occlusion);
        }
        scene.add(shade.sheet);
        made.push(shade);
      }
      const margin = shade ? Math.min(shadeMarginPx(pxPerWorld), Math.floor(most / 4)) : 0;
      // the key light's shadow, fitted round it, as dark as the style has it
      if (style.shadows > 0) {
        group.updateMatrixWorld(true);
        atomsMesh.computeBoundingSphere();
        const box = lightBoxOf([atomsMesh.boundingSphere!.clone().applyMatrix4(atomsMesh.matrixWorld)]);
        if (box) {
          key.castShadow = true;
          key.shadow.mapSize.set(PICTURE_SHADOW_MAP, PICTURE_SHADOW_MAP);
          key.shadow.intensity = style.shadows;
          fitShadow(key, box);
          renderer.shadowMap.needsUpdate = true;
          made.push(key);
        }
      }
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
      for (const t of tilesOf(w, h, most - 2 * margin)) {
        // (with its margin, which is drawn but not kept)
        const left = view.left + ((view.right - view.left) * (t.x - margin)) / w;
        const right = view.left + ((view.right - view.left) * (t.x + t.w + margin)) / w;
        const top = view.top - ((view.top - view.bottom) * (t.y - margin)) / h;
        const bottom = view.top - ((view.top - view.bottom) * (t.y + t.h + margin)) / h;
        if (ortho) {
          Object.assign(ortho, { left, right, top, bottom, near, far: 2 * EYE_HEIGHT });
          ortho.updateProjectionMatrix();
        } else {
          camera.projectionMatrix.makePerspective(left, right, top, bottom, near, D * 2);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        }
        const tw = t.w + 2 * margin;
        const th = t.h + 2 * margin;
        renderer.setSize(tw, th, false);
        shade?.update(renderer, camera, tw, th, true);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, margin, margin, t.w, t.h, x0 + t.x, y0 + t.y, t.w, t.h);
      }
    }
  } finally {
    for (const d of made) d.dispose();
    stickOfMeasures.dispose();
    measureLine.dispose();
    measureFan.dispose();
    for (const g of fans) g.dispose();
    for (const g of ribbons) g.dispose();
    for (const g of surfaces) g.dispose();
    surfaceMat.dispose();
    colouredMat.dispose();
    for (const mat of ribbonMats) mat.dispose();
    if (!using) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
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
  const drawn = rendered3d(ms, style, zoom * scale, undefined, TILE, scale);
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
