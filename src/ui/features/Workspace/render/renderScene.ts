/**
 * Molecules in 3D as a renderer is given them (docs/RENDER.md): a scene in
 * glTF 2.0 (lib/scene/gltf) holding what the canvas shows of them - their
 * atoms and bonds in their looks (the 3D style's primary or secondary), the
 * surfaces they show, the scene's key light, and a camera straight above
 * them, orthographic, as the canvas's is - and, for a film, how they move:
 * turning, through their frames, or in the vibration chosen.
 *
 * In ångströms, each molecule where it stands on the page, so that the
 * picture's frame is a piece of the page: what is drawn in it stands where
 * it stands there.
 */
import * as THREE from "three";
import { turnOnceAngle } from "../utils/turnOnce";
import { atomColour, ballCircles, bondRadiusOf, KEY_LIGHT_FROM, linedBall, type MoleculeLook, type Style3D } from "../../../../lib/chem/style3d";
import { writeGltf, type GltfAnimation, type GltfChannel, type GltfMaterial, type GltfMesh, type GltfNode, type GltfScene, type Quat, type Vec3 } from "../../../../lib/scene/gltf";
import { tubeAlong, unitCylinder, unitRing, unitSphere, type Shape as Solid } from "../../../../lib/scene/shapes";
import type { Mesh } from "../utils/isosurface";
import { bentPieces } from "../utils/stickBend";
import { ribbonMesh } from "../utils/ribbon";
import { chainRuns } from "../../../../lib/chem/biopolymer";
import { withCentres, bondLines, bondsAt, frameBondsOf, frameOf, heightOf, linesOf, lookOf, magnifiedOf, solidOf, WORLD_PER_ANGSTROM } from "../utils/molecule3d";
import { VIBRATION_PERIOD, vibrationOffsets } from "../utils/vibration3d";
import { MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, piecesOf } from "../utils/measure3d";
import { COLORS } from "../../../theme/colors";
import type { PresetHandOff } from "./presets";
import { MENO_MOTIONS } from "../../../../lib/plugins/manifest";
import type { Carried3D, Molecule3D } from "../store/types";

/**
 * What a film shows moving: Meno's own - each molecule turning once about the up of the page, in place ("turn"); its frames,
 * one after another ("frames"); or the vibration it shows ("vibration") - keyed into the scene; or a motion the renderer
 * declares (its manifest's `motions`, by id), which it makes itself of the scene written still.
 */
export type Motion = string;

/** A picture's or a film's shape: fitted to what is drawn, or of a width to its height. */
export type Shape = "fit" | "16:9" | "4:3" | "1:1";

/** What molecules are made of in a render: as their look has it, or glossy, metal, glass, matte, or clay - one light grey, matte. */
export type MoleculeMaterial = "meno" | "glossy" | "metal" | "glass" | "matte" | "clay" | "white";
/** What surfaces are made of: as the canvas draws them (seen through), or glass, glossy, matte. */
export type SurfaceMaterial = "meno" | "glass" | "glossy" | "matte";

/** What is rendered: a picture, or a film - how it moves, how long, at how many frames a second - its width in pixels, its shape, and what its molecules and surfaces are made of. */
export type RenderAsk = {
  kind: "picture" | "film";
  width: number;
  shape: Shape;
  motion?: Motion;
  /** A film's: easing in and coming to rest (`once`), or seamless, over and over (`loop`) - where its motion can loop. */
  mode?: "once" | "loop";
  seconds?: number;
  fps?: number;
  molecules?: MoleculeMaterial;
  surfaces?: SurfaceMaterial;
  /** How it is lit and outlined, where the renderer is asked to (the look's shading and outlines): for it to make, not for the scene's file. */
  finish?: Finish;
  /** The studio it is made in, where a plugin brings the renderer one and it is chosen (./presets): none, the scene as it is asked. */
  studio?: string;
  /** What it hands the renderer of the presets chosen - their files, their options' values (./presets `handOff`): none, none chosen. */
  presets?: PresetHandOff[];
};

/** How a picture is shaded - lit as the renderer lights it, or in one band of toon shading - and its outlines. */
export type Shading = "lit" | "toon";
export type Outlines = "none" | "thin" | "outer" | "mixed";
export type Finish = {
  look: string;
  shading: Shading;
  outlines: Outlines;
  outline: number;
  outlineColour: "black" | "white" | "grey";
  band: number;
  /** In a look that is seen through: its sticks as they are, running on inside the balls, or stopped at the balls' surfaces. */
  sticks?: Sticks;
};
export type Sticks = "shown" | "stopped";

/** A molecule in 3D as it is shown: carried as a copy carries it, the surface it shows - placed about its shown frame's centre, in ångströms - and the vibration it shows, each atom's displacement. */
export type Shown3D = { m: Carried3D; surfaces?: { plus: Mesh; minus: Mesh | null }; move?: readonly number[] };

/** The scene, and what it makes: its picture's or film's size in pixels, its frames and their rate, and the piece of the page it shows (in the page's units). */
export type Rendered = {
  gltf: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  page: { minX: number; maxX: number; minY: number; maxY: number };
  /** What is worth saying of the film it makes, where anything is: its ribbons moving only every so many frames. */
  note?: string;
};

/** A measurement's stick: thin, so coarser. */
const MEASURE_STICK = unitCylinder(12);
/** How smooth a ball and a stick are: as fine as a close look wants. */
const SPHERE = unitSphere(64, 32);
const CYLINDER = unitCylinder(32);
/** The room round what is drawn, as a part of its larger side. */
const MARGIN = 0.06;
/** A surface's look, as the canvas draws it (components/Surface3D). */
const SURFACE_OPACITY = 0.6;
const SURFACE_ROUGHNESS = 0.55;
/** The most points a film's ribbons come to, all its moments told: past it, a moving ribbon is written every so many frames. */
export const RIBBON_FILM_MOST_POINTS = 1_500_000;
/** The most frames a film may have: a minute at 60 a second. */
export const FILM_MOST_FRAMES = 3600;

const k = WORLD_PER_ANGSTROM;

/** A colour as glTF takes it: linear, with its alpha. */
function linear(css: string, alpha = 1): [number, number, number, number] {
  const c = new THREE.Color(css);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [clamp(c.r), clamp(c.g), clamp(c.b), alpha];
}

const RATIOS: Record<Exclude<Shape, "fit">, number> = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 };

/**
 * What a film shows of a molecule at moment `t` (0 to 1 through the film):
 * each atom's place about its centre, in ångströms - its frames, blended
 * one into the next (or, of a conformer set, one after another), or
 * swinging in its vibration - and its turn.
 */
type Sample = { places: Float32Array; turn: THREE.Quaternion; presence: Float32Array | null };

/** Whether a see-through look's sticks stop at the balls' surfaces: where the look - or the choice - says so. */
export function sticksStopped(ask: Pick<RenderAsk, "finish">): boolean {
  return ask.finish?.sticks === "stopped";
}

/**
 * Where a stick's end stops: the move of `end`, along the line towards `other`, to the surface of the ball about
 * `centre` of radius `radius` - the stick's own radius allowed for, so that the flat end's rim, not its middle,
 * meets the surface. A line that does not meet the ball, or whose end is outside it, is not moved.
 */
export function stoppedAt(end: THREE.Vector3, centre: THREE.Vector3, radius: number, stick: number, other: THREE.Vector3): THREE.Vector3 {
  const along = other.clone().sub(end);
  const len = along.length();
  if (len < 1e-9) return new THREE.Vector3();
  along.divideScalar(len);
  const rel = end.clone().sub(centre);
  const reach = Math.sqrt(Math.max(radius * radius - stick * stick, 0));
  const d = rel.dot(along);
  const across2 = rel.lengthSq() - d * d;
  if (reach * reach <= across2) return new THREE.Vector3();
  const exit = -d + Math.sqrt(reach * reach - across2);
  if (exit <= 0) return new THREE.Vector3();
  return along.multiplyScalar(Math.min(exit, len));
}

/**
 * A line's pieces (end to end, from one atom to the other) in two halves of equal length along them: the piece the
 * middle falls in cut there.
 */
export function halvesOf<P extends { a: THREE.Vector3; b: THREE.Vector3; r: number }>(pieces: readonly P[]): [P[], P[]] {
  const lengths = pieces.map((p) => p.a.distanceTo(p.b));
  const half = lengths.reduce((s, x) => s + x, 0) / 2;
  let run = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (run + lengths[i] >= half || i === pieces.length - 1) {
      const u = lengths[i] > 1e-12 ? Math.min(1, Math.max(0, (half - run) / lengths[i])) : 0.5;
      const cut = pieces[i].a.clone().lerp(pieces[i].b, u);
      const one = [...pieces.slice(0, i), { ...pieces[i], a: pieces[i].a.clone(), b: cut.clone() }];
      const two = [{ ...pieces[i], a: cut.clone(), b: pieces[i].b.clone() }, ...pieces.slice(i + 1)];
      return [one, two];
    }
    run += lengths[i];
  }
  return [[...pieces], []];
}

/**
 * How far round a film turning its molecules has come at its frame `s` of `count`, in radians. Once: easing in and coming to
 * rest just as it began, as the canvas's turn once does. Loop: at one speed, its last frame a step short of its first, so that
 * the film plays on round without a seam.
 */
export function turnAt(s: number, count: number, mode: RenderAsk["mode"]): number {
  return mode === "loop" ? (2 * Math.PI * s) / count : turnOnceAngle(count > 1 ? s / (count - 1) : 0);
}

export function renderScene(shown: readonly Shown3D[], style: Style3D, ask: RenderAsk): Rendered {
  const film = ask.kind === "film";
  const fps = film ? Math.max(1, Math.round(ask.fps ?? 30)) : 1;
  const seconds = Math.max(0.1, ask.seconds ?? 8);
  const motion: Motion | undefined = film ? (ask.motion ?? "turn") : undefined;
  // (a vibration loops: a whole number of its periods)
  const length = motion === "vibration" ? Math.max(1, Math.round(seconds / VIBRATION_PERIOD)) * VIBRATION_PERIOD : seconds;
  const count = film ? Math.min(FILM_MOST_FRAMES, Math.max(2, Math.round(length * fps))) : 1;

  const materials: GltfMaterial[] = [];
  const materialOf = new Map<string, number>();
  const kept = (key: string, made: () => GltfMaterial) => {
    let i = materialOf.get(key);
    if (i === undefined) {
      i = materials.length;
      materials.push(made());
      materialOf.set(key, i);
    }
    return i;
  };
  /** An atom's or a bond's material: its colour, in its look's finish - or as the material asked for makes it. */
  const material = (colour: string, look: Pick<MoleculeLook, "roughness" | "metalness">) =>
    // (clay: one, whatever the colour)
    kept(ask.molecules === "clay" ? "clay" : `${ask.molecules ?? "meno"} ${colour} ${look.roughness} ${look.metalness}`, () => moleculeMaterial(colour, look, ask.molecules ?? "meno"));
  /** A surface's: its sign's colour, as the material asked for makes it. */
  const surfaceMaterial = (colour: string) => kept(`surface ${ask.surfaces ?? "meno"} ${colour}`, () => surfaceMade(colour, ask.surfaces ?? "meno"));
  /** A surface coloured point by point by another grid: white, its points' colours over it. */
  const colouredMaterial = () => kept(`surface ${ask.surfaces ?? "meno"} coloured`, () => colouredSurfaceMade(ask.surfaces ?? "meno"));
  const meshes: GltfMesh[] = [];
  // (a ball or a stick in each material: one mesh each, every atom or bond of it a node placing it)
  const shapeMeshes = new Map<string, number>();
  const shapeIn = (shape: "ball" | "stick", mat: number) => {
    const key = `${shape} ${mat}`;
    let i = shapeMeshes.get(key);
    if (i === undefined) {
      const s = shape === "ball" ? SPHERE : CYLINDER;
      i = meshes.length;
      meshes.push({ name: `${shape} ${materials[mat].name}`, positions: s.positions, normals: s.normals, indices: s.indices, material: mat });
      shapeMeshes.set(key, i);
    }
    return i;
  };

  const nodes: GltfNode[] = [];
  const roots: number[] = [];
  const channels: GltfChannel[] = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const reach = (x: number, y: number, z: number, r: number) => {
    bounds.minX = Math.min(bounds.minX, x - r);
    bounds.maxX = Math.max(bounds.maxX, x + r);
    bounds.minY = Math.min(bounds.minY, y - r);
    bounds.maxY = Math.max(bounds.maxY, y + r);
    bounds.minZ = Math.min(bounds.minZ, z - r);
    bounds.maxZ = Math.max(bounds.maxZ, z + r);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();

  const made: { atoms: { el: string; p: Vec3 }[]; bonds: { a: number; b: number; order: number }[] }[] = [];
  const ownMotion = film && !!motion && !(MENO_MOTIONS as readonly string[]).includes(motion);
  // (the fewest frames a moving ribbon is written at: every one, or every so many)
  let ribbonEvery = 1;
  for (const { m, surfaces, move } of shown) {
    const molecule = { ...m, id: 0 } as Molecule3D;
    const solid = solidOf(molecule, style);
    const look = lookOf(molecule);
    const drawn = style[look];
    const radii = solid.radii[look];
    const left = solid.hidden[look];
    const n = m.atoms.length;
    const shownFrame = frameOf(solid, m.frame);
    // where it stands: on the page, as high as it stands, turned as it is
    const centre: Vec3 = [m.at.x / k, m.at.y / k, heightOf(molecule, solid, look) / k];
    const turned = m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion();
    // its bonds: those any frame has, where they come and go frame by frame (each frame's say which), less those to an atom left out
    const fb = frameBondsOf(molecule);
    // (and its sticks to ring centres, after them: withCentres)
    const all = withCentres(molecule, fb ? fb.bonds : bondsAt(molecule, shownFrame));
    const keep = all.map((b) => !left[b.a1] && !left[b.a2]);
    const bonds = all.filter((_, i) => keep[i]);
    const presenceAt = (f: number) => (fb ? Float32Array.from(fb.present[f].filter((_, i) => keep[i])) : null);
    const bondR = bondRadiusOf(drawn);
    const frames = solid.frames.map((f) => Float32Array.from(f, (x) => x / k));
    const moving = film && motion === "frames" && frames.length > 1;
    const swinging = film && motion === "vibration" && move?.length === 3 * n;
    const turning = film && motion === "turn";

    const sampleAt = (s: number): Sample => {
      const u = count > 1 ? s / (count - 1) : 0;
      if (turning) {
        const spin = new THREE.Quaternion().setFromAxisAngle(up, turnAt(s, count, ask.mode));
        return { places: frames[shownFrame], turn: spin.multiply(turned), presence: presenceAt(shownFrame) };
      }
      if (moving) {
        const last = frames.length - 1;
        if (m.conformerSet) {
          // (conformers one after another: none is a step on the way to the next)
          const f = Math.min(last, Math.floor((s * frames.length) / count));
          return { places: frames[f], turn: turned, presence: presenceAt(f) };
        }
        const at = u * last;
        const f0 = Math.floor(at);
        const f1 = Math.min(last, f0 + 1);
        const w = at - f0;
        const places = frames[f0].map((x, i) => x + (frames[f1][i] - x) * w);
        const p0 = presenceAt(f0);
        const p1 = presenceAt(f1);
        return { places, turn: turned, presence: p0 && p1 ? p0.map((x, i) => x + (p1[i] - x) * w) : null };
      }
      if (swinging) {
        const offsets = vibrationOffsets(move!, Math.sin((2 * Math.PI * s * (1 / fps)) / VIBRATION_PERIOD));
        return { places: frames[shownFrame].map((x, i) => x + offsets[i] / k), turn: turned, presence: presenceAt(shownFrame) };
      }
      return { places: frames[shownFrame], turn: turned, presence: presenceAt(shownFrame) };
    };
    const samples = Array.from({ length: count }, (_, s) => sampleAt(s));
    const animated = moving || swinging;
    // (what it is made of, for a renderer that makes a motion of its own: each atom drawn, its element and where it stands in the
    // scene, in ångströms, and its bonds between them - Meno's own data, written only for such a motion: a large entry's every
    // atom would only weigh down any other scene)
    if (ownMotion) {
      const at = new Map<number, number>();
      const atoms: { el: string; p: Vec3 }[] = [];
      const mag0 = magnifiedOf(molecule);
      for (let i = 0; i < n; i++) {
        if (left[i] || radii[i] <= 0) continue;
        const p0 = samples[0].places;
        v.set(p0[3 * i], p0[3 * i + 1], p0[3 * i + 2]).applyQuaternion(samples[0].turn).multiplyScalar(mag0);
        at.set(i, atoms.length);
        atoms.push({ el: m.atoms[i].el, p: [centre[0] + v.x, centre[1] + v.y, centre[2] + v.z] });
      }
      made.push({ atoms, bonds: bonds.filter((b) => at.has(b.a1) && at.has(b.a2)).map((b) => ({ a: at.get(b.a1)!, b: at.get(b.a2)!, order: b.order })) });
    }

    // the molecule: a node where it stands, turned as it is, holding its atoms, bonds and surfaces
    const root = nodes.length;
    // (as large as it is shown, about where it stands: docs/WORKSPACE.md, *Magnified display*)
    const mag = magnifiedOf(molecule);
    nodes.push({ name: m.name ?? "Molecule", translation: centre, rotation: quat(samples[0].turn), ...(mag !== 1 ? { scale: [mag, mag, mag] as Vec3 } : {}), children: [] });
    roots.push(root);
    const children = nodes[root].children!;
    if (turning) channels.push({ node: root, path: "rotation", values: continuous(samples.map((x) => x.turn)) });

    // each atom drawn: a ball of its radius, placed
    for (let i = 0; i < n; i++) {
      if (left[i] || radii[i] <= 0) continue;
      const r = radii[i] / k;
      const node = nodes.length;
      const p0 = samples[0].places;
      nodes.push({ mesh: shapeIn("ball", material(atomColour(m.atoms[i].el, drawn), drawn)), translation: [p0[3 * i], p0[3 * i + 1], p0[3 * i + 2]], scale: [r, r, r] });
      children.push(node);
      if (animated) channels.push({ node, path: "translation", values: Float32Array.from(samples.flatMap((x) => [x.places[3 * i], x.places[3 * i + 1], x.places[3 * i + 2]])) });
      for (const x of samples) {
        v.set(x.places[3 * i], x.places[3 * i + 1], x.places[3 * i + 2]).applyQuaternion(x.turn).multiplyScalar(mag);
        reach(centre[0] + v.x, centre[1] + v.y, centre[2] + v.z, r * mag);
      }
    }

    // the lines on its balls, where its look draws them (`ballLines`): great circles about the molecule's own axes - x and y, or
    // all three - each a thin ring lying on the ball, as wide as the look has them in ångströms, in their colour, moving with it
    const circles = ballCircles(drawn);
    if (circles) {
      const lineMat = kept(`ball line ${drawn.ballLinesColor}`, () => ({ name: `line ${drawn.ballLinesColor}`, colour: linear(drawn.ballLinesColor), metallic: 0, roughness: 0.6 }));
      const ringOf = new Map<string, number>();
      const ring = (r: number) => {
        // (one ring a ball's size: its tube's share of the radius)
        const tube = Math.max(drawn.ballLinesWidth / 2 / r, 1e-4);
        const key = tube.toFixed(5);
        let i = ringOf.get(key);
        if (i === undefined) {
          const shape = unitRing(tube);
          i = meshes.length;
          meshes.push({ name: `line ${drawn.ballLinesColor}`, positions: shape.positions, normals: shape.normals, indices: shape.indices, material: lineMat });
          ringOf.set(key, i);
        }
        return i;
      };
      // (the ring lies about +Y: turned to lie about x, y and z)
      const about = [new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(1, 0, 0)), new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 0, 1))].slice(0, circles);
      for (let i = 0; i < n; i++) {
        if (left[i] || radii[i] <= 0 || !linedBall(m.atoms[i].el, drawn)) continue;
        const r = radii[i] / k;
        const p0 = samples[0].places;
        for (const turn of about) {
          const node = nodes.length;
          nodes.push({ mesh: ring(r), translation: [p0[3 * i], p0[3 * i + 1], p0[3 * i + 2]], rotation: quat(turn), scale: [r, r, r] });
          children.push(node);
          if (animated) channels.push({ node, path: "translation", values: Float32Array.from(samples.flatMap((x) => [x.places[3 * i], x.places[3 * i + 1], x.places[3 * i + 2]])) });
        }
      }
    }

    // each bond's lines (a double bond two, a triple three), as sticks from atom to atom - where the look colours a bond by its
    // atoms, each line in two halves, each its atom's colour
    if (bondR > 0 && bonds.length) {
      const byAtom = drawn.bondColouring === "byAtom";
      // (which bond each line is of, a bond's lines side by side)
      const lineOf = bonds.flatMap((b, i) => Array<number>(linesOf(b.order)).fill(i));
      const seeThrough = sticksStopped(ask);
      // (a line curving in to a lone atom, as straight pieces along its curve: a plugin's sticks are straight; seen through, a line stops
      // at the surface of the ball it leaves - the lone atom's end, with no ball of its own to speak of, runs to it)
      const linesIn = (x: Sample) =>
        // (bondLines works in whatever units it is given: here ångströms)
        bondLines({ ...molecule, bonds }, x.places, bondR, solid.ends[look], drawn.multipleBonds === "one").map((l, li) => {
          const pieces = bentPieces(l);
          if (seeThrough) {
            const b = bonds[lineOf[li]];
            const ball = (atom: number) => (left[atom] || radii[atom] <= 0 ? 0 : radii[atom] / k);
            const centre = (atom: number) => new THREE.Vector3(x.places[3 * atom], x.places[3 * atom + 1], x.places[3 * atom + 2]);
            const first = pieces[0];
            if (pieces.length === 1) {
              if (ball(b.a1) > 0) first.a.add(stoppedAt(first.a, centre(b.a1), ball(b.a1), first.r, first.b));
              if (ball(b.a2) > 0 && !l.centre) first.b.add(stoppedAt(first.b, centre(b.a2), ball(b.a2), first.r, first.a));
            } else {
              // (the straight end is the atom's: a bend's `atB` says which)
              const atom = l.bend?.atB ? b.a1 : b.a2;
              if (ball(atom) > 0) first.a.add(stoppedAt(first.a, centre(atom), ball(atom), first.r, first.b));
            }
          }
          return pieces;
        });
      // (the sticks drawn: each line whole - or, coloured by atom, its two halves - as its pieces, and the atom whose colour it is)
      const strandsIn = (x: Sample) =>
        linesIn(x).flatMap((pieces, li) => {
          if (!byAtom) return [{ pieces, line: li, atom: -1 }];
          const b = bonds[lineOf[li]];
          const [one, two] = halvesOf(pieces);
          const at = (atom: number) => new THREE.Vector3(x.places[3 * atom], x.places[3 * atom + 1], x.places[3 * atom + 2]);
          // (the half that starts nearer the bond's first atom is that atom's)
          const firstIsA1 = one[0].a.distanceToSquared(at(b.a1)) <= one[0].a.distanceToSquared(at(b.a2));
          return [
            { pieces: one, line: li, atom: firstIsA1 ? b.a1 : b.a2 },
            { pieces: two, line: li, atom: firstIsA1 ? b.a2 : b.a1 },
          ];
        });
      const strands0 = strandsIn(samples[0]);
      // (each strand's material: the bond colour, or its atom's)
      const strandMat = strands0.map((st) => material(st.atom < 0 ? drawn.bondColor : atomColour(m.atoms[st.atom].el, drawn), drawn));
      const piecesAt = (x: Sample) =>
        strandsIn(x).flatMap((st) =>
          st.pieces.map((l) => {
            const along = l.b.clone().sub(l.a);
            const len = along.length();
            return { mid: l.a.clone().add(l.b).multiplyScalar(0.5), turn: len > 1e-9 ? new THREE.Quaternion().setFromUnitVectors(up, along.divideScalar(len)) : new THREE.Quaternion(), len, r: l.r };
          }),
        );
      // (which strand each piece is of)
      const pieceStrand = strands0.flatMap((st, i) => Array<number>(st.pieces.length).fill(i));
      const each = samples.map(piecesAt);
      // (a strand that bends, in a render that does not move: one smooth tube along its curve, not straight pieces end to end)
      const pieceOfBent = !animated ? strands0.flatMap((st) => Array<boolean>(st.pieces.length).fill(st.pieces.length > 1)) : [];
      if (!animated) {
        strands0.forEach((st, i) => {
          const pcs = st.pieces;
          if (pcs.length < 2) return;
          const there = samples[0].presence ? (samples[0].presence![lineOf[st.line]] ?? 1) : 1;
          const r = pcs[0].r * there;
          if (r <= 0) return;
          const tube = tubeAlong([pcs[0].a, ...pcs.map((q) => q.b)], r, 24);
          if (!tube.indices.length) return;
          const mat = strandMat[i];
          const mesh = meshes.length;
          meshes.push({ name: `stick ${materials[mat].name}`, positions: tube.positions, normals: tube.normals, indices: tube.indices, material: mat });
          const node = nodes.length;
          nodes.push({ mesh });
          children.push(node);
        });
      }
      for (let l = 0; l < each[0].length; l++) {
        // (a line of no thickness - a multiple bond drawn as one stick - is given as nothing; one that bends is its tube, above)
        if (each.every((x) => x[l].r === 0)) continue;
        if (pieceOfBent[l]) continue;
        const at = (s: number) => {
          const x = each[s][l];
          const there = samples[s].presence ? (samples[s].presence![lineOf[strands0[pieceStrand[l]].line]] ?? 1) : 1;
          return { ...x, r: x.r * there };
        };
        const first = at(0);
        const node = nodes.length;
        nodes.push({ mesh: shapeIn("stick", strandMat[pieceStrand[l]]), translation: [first.mid.x, first.mid.y, first.mid.z], rotation: quat(first.turn), scale: [first.r || 1e-6, first.len || 1e-6, first.r || 1e-6] });
        children.push(node);
        if (animated) {
          const keys = samples.map((_, s) => at(s));
          channels.push({ node, path: "translation", values: Float32Array.from(keys.flatMap((x) => [x.mid.x, x.mid.y, x.mid.z])) });
          channels.push({ node, path: "rotation", values: continuous(keys.map((x) => x.turn)) });
          channels.push({ node, path: "scale", values: Float32Array.from(keys.flatMap((x) => [x.r || 1e-6, x.len || 1e-6, x.r || 1e-6])) });
        }
      }
    }

    // its chains as ribbons, where its look draws them so (the atoms they stand for being left out, above): in their colours,
    // each point its own (COLOR_0, over white), in the look's finish or the material asked for - clay and white, one colour
    if (solid.ribbons[look] && m.biopolymer) {
      const bp = m.biopolymer;
      const runs = chainRuns(bp, m.atoms);
      const made = ask.molecules ?? "meno";
      const plain = made === "clay" || made === "white";
      const mat = kept(`ribbon ${made} ${drawn.roughness} ${drawn.metalness}`, () => ({ ...moleculeMaterial("#ffffff", drawn, made), name: `ribbon ${made}` }));
      const ribbonOf = (x: Sample) => {
        // (ribbonMesh sizes the ribbon in its places' units to the ångström: here ångströms)
        const r = ribbonMesh(x.places, runs, bp, style.ribbonColours, 1, 1);
        const at = meshes.length;
        meshes.push({ name: `ribbon ${materials[mat].name}`, positions: r.positions, normals: r.normals, indices: r.indices, ...(plain ? {} : { colours: rgba(r.colours) }), material: mat });
        // (as far as it reaches: turning, from the molecule's centre whichever way it is turned; else turned as it is)
        if (turning) {
          let most = 0;
          for (let i = 0; i < r.positions.length; i += 3) most = Math.max(most, Math.hypot(r.positions[i], r.positions[i + 1], r.positions[i + 2]));
          reach(centre[0], centre[1], centre[2], most * mag);
        } else
          for (let i = 0; i < r.positions.length; i += 3) {
            v.set(r.positions[i], r.positions[i + 1], r.positions[i + 2]).applyQuaternion(x.turn).multiplyScalar(mag);
            reach(centre[0] + v.x, centre[1] + v.y, centre[2] + v.z, 0);
          }
        return { mesh: at, points: r.positions.length / 3 };
      };
      if (!animated) {
        // (still, or turning with the whole molecule: one ribbon)
        const one = ribbonOf(samples[0]);
        const node = nodes.length;
        nodes.push({ mesh: one.mesh });
        children.push(node);
      } else {
        // (its atoms moving: the ribbon of each moment, shown only then - and, where a film's ribbons would weigh too much, of
        // every so many moments, each held till the next)
        const first = ribbonOf(samples[0]);
        const every = Math.max(1, Math.ceil((first.points * count) / RIBBON_FILM_MOST_POINTS));
        ribbonEvery = Math.max(ribbonEvery, every);
        const keys = Array.from({ length: Math.ceil(count / every) }, (_, j) => j * every);
        keys.forEach((s0, j) => {
          const mesh = j ? ribbonOf(samples[s0]).mesh : first.mesh;
          const on = (s: number) => Math.floor(s / every) === j;
          const node = nodes.length;
          nodes.push({ mesh, ...(on(0) ? {} : { scale: [0, 0, 0] as Vec3 }) });
          children.push(node);
          channels.push({ node, path: "scale", interpolation: "STEP", values: Float32Array.from({ length: 3 * count }, (_, i) => (on(Math.floor(i / 3)) ? 1 : 0)) });
        });
      }
    }

    // its measurements, as the canvas draws them: lines - a distance's dashed - and an angle's faint fan, in the canvas's blue,
    // unlit (marks, not things), none to an atom its look leaves out; a moving molecule's of each moment, shown only then
    const measures = (m.measures ?? []).filter((x) => x.atoms.length >= 2 && x.atoms.every((i) => i >= 0 && i < n && !left[i]));
    if (measures.length) {
      const lineMat = kept("measure line", () => ({ name: "measure line", colour: linear(COLORS.highlight), metallic: 0, roughness: 1, unlit: true }));
      const fanMat = kept("measure fan", () => ({ name: "measure fan", colour: linear(COLORS.highlight, MEASURE_FAN_OPACITY), metallic: 0, roughness: 1, unlit: true, blend: true, doubleSided: true }));
      const marksAt = (x: Sample) => {
        // (measureMarks works in the page's units: there and back)
        const world = Float32Array.from(x.places, (q) => q * k);
        const pieces: [THREE.Vector3, THREE.Vector3][] = [];
        const fan: THREE.Vector3[] = [];
        for (const one of measures) {
          const marks = measureMarks(world, one.atoms);
          for (const [a, b] of piecesOf(marks)) pieces.push([a.clone().divideScalar(k), b.clone().divideScalar(k)]);
          for (const p of marks.fan) fan.push(p.clone().divideScalar(k));
        }
        return { lines: sticksOf(pieces, MEASURE_RADIUS), fan: fanOf(fan) };
      };
      const put = (shape: Solid, mat: number, name: string, x: Sample) => {
        if (!shape.indices.length) return -1;
        const at = meshes.length;
        meshes.push({ name, positions: shape.positions, normals: shape.normals, indices: shape.indices, material: mat });
        for (let i = 0; i < shape.positions.length; i += 3) {
          v.set(shape.positions[i], shape.positions[i + 1], shape.positions[i + 2]).applyQuaternion(x.turn).multiplyScalar(mag);
          reach(centre[0] + v.x, centre[1] + v.y, centre[2] + v.z, 0);
        }
        return at;
      };
      const each = animated ? samples : [samples[0]];
      each.forEach((x, s) => {
        const made = marksAt(x);
        for (const mesh of [put(made.lines, lineMat, "measure line", x), put(made.fan, fanMat, "measure fan", x)]) {
          if (mesh < 0) continue;
          const node = nodes.length;
          nodes.push({ mesh, ...(animated && s ? { scale: [0, 0, 0] as Vec3 } : {}) });
          children.push(node);
          if (animated) channels.push({ node, path: "scale", interpolation: "STEP", values: Float32Array.from({ length: 3 * count }, (_, i) => (Math.floor(i / 3) === s ? 1 : 0)) });
        }
      });
    }

    // the surface it shows, where it shows one: its two signs in their colours, seen through, as the canvas draws it - or,
    // coloured by another grid (NCI's), one surface, each point its colour on the scale, not seen through
    if (surfaces) {
      const coloured = !surfaces.minus && !!surfaces.plus.colours && surfaces.plus.colours.length === surfaces.plus.positions.length;
      const sides: [Mesh | null, string][] = coloured
        ? [[surfaces.plus, "coloured"]]
        : [
            [surfaces.plus, style.surfacePlus],
            [surfaces.minus, style.surfaceMinus],
          ];
      for (const [mesh, colour] of sides) {
        if (!mesh || mesh.positions.length < 9) continue;
        const mat = coloured ? colouredMaterial() : surfaceMaterial(colour);
        const positions = Float32Array.from(mesh.positions, (x) => x / k);
        // (COLOR_0: RGBA, linear, as the canvas's colours are - glTF 3.7.2.1)
        const colours = coloured ? rgba(mesh.colours!) : undefined;
        meshes.push({ name: `surface ${colour}`, positions, normals: normalised(mesh.normals), ...(colours ? { colours } : {}), material: mat });
        const node = nodes.length;
        nodes.push({ mesh: meshes.length - 1 });
        children.push(node);
        // (turning, as far as it reaches from the molecule's centre, whichever way it is turned)
        if (turning) {
          let most = 0;
          for (let i = 0; i < positions.length; i += 3) most = Math.max(most, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
          reach(centre[0], centre[1], centre[2], most * mag);
        } else
          for (let i = 0; i < positions.length; i += 3) {
            v.set(positions[i], positions[i + 1], positions[i + 2]).applyQuaternion(samples[0].turn).multiplyScalar(mag);
            reach(centre[0] + v.x, centre[1] + v.y, centre[2] + v.z, 0);
          }
      }
    }
  }
  if (!Number.isFinite(bounds.minX)) throw new Error("There is nothing to render.");

  // the frame: what is drawn, with room round it, in the shape asked for
  let w = bounds.maxX - bounds.minX;
  let h = bounds.maxY - bounds.minY;
  const room = MARGIN * Math.max(w, h);
  w += 2 * room;
  h += 2 * room;
  const ratio = ask.shape === "fit" ? w / h : RATIOS[ask.shape];
  if (w / h < ratio) w = h * ratio;
  else h = w / ratio;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  // (a film's width and height each the nearest even number: its video, H.264 in 4:2:0, keeps colour for each 2x2 pixels,
  // and an encoder refuses an odd side - 360 px at 16:9 would be 203 high. A picture keeps its own)
  const even = (n: number) => (film ? 2 * Math.round(n / 2) : Math.round(n));
  const width = Math.max(16, even(ask.width));
  const height = Math.max(16, even(width / ratio));
  // (the frame in the shape of its pixels, as rounded: grown, never cut, so that nothing is stretched or lost)
  if (width / height > w / h) w = h * (width / height);
  else h = w * (height / width);

  // the camera straight above, looking down, as the canvas's - orthographic
  const above = bounds.maxZ + 1;
  const camera = nodes.length;
  nodes.push({ name: "Camera", camera: 0, translation: [cx, cy, above] });
  roots.push(camera);
  // the key light, from where the canvas has it, shining at the page's origin
  const light = nodes.length;
  const toward = new THREE.Vector3(...KEY_LIGHT_FROM).negate().normalize();
  nodes.push({ name: "Key light", light: 0, rotation: quat(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), toward)) });
  roots.push(light);

  const animations: GltfAnimation[] = channels.length ? [{ name: motion ?? "Film", times: Float32Array.from({ length: count }, (_, s) => s / fps), channels }] : [];
  const scene: GltfScene = {
    name: "Meno",
    materials,
    meshes,
    nodes,
    roots,
    cameras: [{ name: "Camera", xmag: w / 2, ymag: h / 2, znear: 0.01, zfar: Math.max(1, above - Math.min(0, bounds.minZ) + 1) }],
    lights: [{ name: "Key light", type: "directional", colour: [1, 1, 1], intensity: style.keyLight }],
    animations,
    // (what glTF has no word for: the scene's even light, and what the film is)
    extras: { meno: { ambientLight: style.ambientLight, keyLight: style.keyLight, width, height, frames: count, fps, film, ...(ownMotion ? { molecules: made } : {}) } },
  };
  return {
    gltf: writeGltf(scene),
    width,
    height,
    frames: count,
    fps,
    page: { minX: (cx - w / 2) * k, maxX: (cx + w / 2) * k, minY: (cy - h / 2) * k, maxY: (cy + h / 2) * k },
    ...(ribbonEvery > 1 ? { note: `Ribbons move every ${ordinal(ribbonEvery)} frame` } : {}),
  };
}

/** Clay's one colour: a light, warm grey. */
const CLAY = "#d8d2c8";

/** A colour halfway to white: glass's, which its depth tints again. */
const paler = (css: string) => {
  const c = new THREE.Color(css).lerp(new THREE.Color(1, 1, 1), 0.5);
  return `#${c.getHexString()}`;
};

/**
 * What an atom or a bond is made of, in glTF's terms (lib/scene/gltf): its
 * look's finish; glossy, a clear coat over it; metal, of its colour; glass,
 * clear and tinted by its colour through its depth - a ball or a stick
 * being as thick as it is wide (its mesh's radius 1); matte; or clay.
 */
export function moleculeMaterial(colour: string, look: Pick<MoleculeLook, "roughness" | "metalness">, made: MoleculeMaterial): GltfMaterial {
  switch (made) {
    case "glossy":
      return { name: `${colour} glossy`, colour: linear(colour), metallic: 0, roughness: 0.35, clearcoat: { factor: 1, roughness: 0.04 } };
    case "metal":
      return { name: `${colour} metal`, colour: linear(colour), metallic: 1, roughness: 0.25 };
    case "glass": {
      const [r, g, b] = linear(colour);
      return { name: `${colour} glass`, colour: linear(paler(colour)), metallic: 0, roughness: 0.03, transmission: 1, ior: 1.5, volume: { thickness: 2, attenuationColour: [r, g, b], attenuationDistance: 1.5 } };
    }
    case "matte":
      return { name: `${colour} matte`, colour: linear(colour), metallic: 0, roughness: 1 };
    case "clay":
      return { name: "clay", colour: linear(CLAY), metallic: 0, roughness: 0.9 };
    case "white":
      return { name: "white", colour: linear("#ffffff"), metallic: 0, roughness: 1 };
    default:
      return { name: colour, colour: linear(colour), metallic: look.metalness, roughness: look.roughness };
  }
}

/** Linear RGB colours, three a point, as RGBA - each alpha 1 - within 0 to 1. */
function rgba(rgb: Float32Array): Float32Array {
  const out = new Float32Array((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = Math.min(1, Math.max(0, rgb[i]));
    out[j + 1] = Math.min(1, Math.max(0, rgb[i + 1]));
    out[j + 2] = Math.min(1, Math.max(0, rgb[i + 2]));
    out[j + 3] = 1;
  }
  return out;
}

/**
 * What a surface coloured by another grid is made of: white, so that its
 * points' colours (COLOR_0, multiplying the base colour: glTF 3.9.2) are
 * what is seen - not seen through as the canvas draws it, since its
 * colours are what it says; glass, glossy or matte as asked.
 */
export function colouredSurfaceMade(made: SurfaceMaterial): GltfMaterial {
  const both = { doubleSided: true };
  const white: [number, number, number, number] = [1, 1, 1, 1];
  switch (made) {
    case "glass":
      return { name: "coloured glass", colour: white, metallic: 0, roughness: 0.03, transmission: 1, ior: 1.33, ...both };
    case "glossy":
      return { name: "coloured glossy", colour: white, metallic: 0, roughness: 0.35, clearcoat: { factor: 1, roughness: 0.04 }, ...both };
    case "matte":
      return { name: "coloured matte", colour: white, metallic: 0, roughness: 1, ...both };
    default:
      return { name: "coloured surface", colour: white, metallic: 0, roughness: SURFACE_ROUGHNESS, ...both };
  }
}

/** What a surface is made of: as the canvas draws it, seen through; glass, thin, tinted by its colour; glossy; or matte - the last two not seen through. */
export function surfaceMade(colour: string, made: SurfaceMaterial): GltfMaterial {
  const both = { doubleSided: true };
  switch (made) {
    case "glass":
      return { name: `${colour} glass`, colour: linear(paler(colour)), metallic: 0, roughness: 0.03, transmission: 1, ior: 1.33, ...both };
    case "glossy":
      return { name: `${colour} glossy`, colour: linear(colour), metallic: 0, roughness: 0.35, clearcoat: { factor: 1, roughness: 0.04 }, ...both };
    case "matte":
      return { name: `${colour} matte`, colour: linear(colour), metallic: 0, roughness: 1, ...both };
    default:
      return { name: `${colour} surface`, colour: linear(colour, SURFACE_OPACITY), metallic: 0, roughness: SURFACE_ROUGHNESS, blend: true, ...both };
  }
}

const quat = (q: THREE.Quaternion): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return [q.x / l, q.y / l, q.z / l, q.w / l];
};

/** Turns as keys: each a unit quaternion, on the same side as the one before, so that nothing between them goes the long way round. */
function continuous(qs: readonly THREE.Quaternion[]): Float32Array {
  const out = new Float32Array(qs.length * 4);
  let was: Quat | null = null;
  qs.forEach((q, i) => {
    let c = quat(q);
    if (was && c[0] * was[0] + c[1] * was[1] + c[2] * was[2] + c[3] * was[3] < 0) c = [-c[0], -c[1], -c[2], -c[3]];
    out.set(c, 4 * i);
    was = c;
  });
  return out;
}

/** Normals of unit length, as glTF wants them (3.7.2.1); one of none, up. */
function normalised(ns: Float32Array): Float32Array {
  const out = new Float32Array(ns.length);
  for (let i = 0; i < ns.length; i += 3) {
    const l = Math.hypot(ns[i], ns[i + 1], ns[i + 2]);
    if (l > 1e-12) {
      out[i] = ns[i] / l;
      out[i + 1] = ns[i + 1] / l;
      out[i + 2] = ns[i + 2] / l;
    } else out[i + 1] = 1;
  }
  return out;
}

/** Sticks of `radius` from each `a` to its `b`, as one mesh. */
function sticksOf(pieces: readonly [THREE.Vector3, THREE.Vector3][], radius: number): Solid {
  const c = MEASURE_STICK;
  const per = c.positions.length / 3;
  const positions = new Float32Array(pieces.length * c.positions.length);
  const normals = new Float32Array(pieces.length * c.normals.length);
  const indices = new Uint32Array(pieces.length * c.indices.length);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  pieces.forEach(([a, b], j) => {
    const along = b.clone().sub(a);
    const len = along.length();
    const turn = len > 1e-9 ? new THREE.Quaternion().setFromUnitVectors(up, along.divideScalar(len)) : new THREE.Quaternion();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    for (let i = 0; i < per; i++) {
      p.set(c.positions[3 * i] * radius, c.positions[3 * i + 1] * len, c.positions[3 * i + 2] * radius).applyQuaternion(turn).add(mid);
      p.toArray(positions, 3 * (j * per + i));
      p.fromArray(c.normals, 3 * i).applyQuaternion(turn).toArray(normals, 3 * (j * per + i));
    }
    for (let i = 0; i < c.indices.length; i++) indices[j * c.indices.length + i] = c.indices[i] + j * per;
  });
  return { positions, normals, indices };
}

/** Triangles, three points each, as a mesh: each its own face's normal. */
function fanOf(points: readonly THREE.Vector3[]): Solid {
  const positions = new Float32Array(3 * points.length);
  const normals = new Float32Array(3 * points.length);
  for (let t = 0; t + 2 < points.length; t += 3) {
    const [a, b, c] = [points[t], points[t + 1], points[t + 2]];
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    if (face.lengthSq() > 0) face.normalize();
    else face.set(0, 0, 1);
    for (let i = 0; i < 3; i++) {
      points[t + i].toArray(positions, 3 * (t + i));
      face.toArray(normals, 3 * (t + i));
    }
  }
  return { positions, normals, indices: Uint32Array.from({ length: points.length - (points.length % 3) }, (_, i) => i) };
}

/** 2nd, 3rd, 4th, 11th, 21st: a number as an ordinal. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}
