/**
 * What a still picture of a molecule in 3D is made from (README.md): the
 * manifest read, strictly, and each figure made into the molecule Meno draws
 * - one frame of an XYZ file, chosen atom pairs measured, its own sticks
 * left out where asked, turned to a view chosen by atoms. The picture itself
 * is Meno's own, drawn in a browser by the app's code (page/entry.ts); none is
 * drawn here. A development script: its input may change.
 *
 * Atoms are numbered from 1, in the file's order; frames likewise.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { workspace3dOf, type Workspace3D } from "../../../src/lib/chem/workspaceStyle3d";
import { DEFAULT_STYLE_3D_CHOICE } from "../../../src/lib/chem/style3d";
import { PICTURE_DPIS, DEFAULT_APP_SETTINGS } from "../../../src/lib/settings/appSettings";
import type { Carried3D, Turn3D } from "../../../src/ui/features/Workspace/store/types";
import { principalTurn } from "../../../src/ui/features/Workspace/utils/align3d";
import { readStructures } from "../../../src/lib/io/structures";
import { bondsByDistance } from "../../../src/utils/structureParsers";

/** One picture asked for. */
export type Figure = {
  /** The PNG's file name, without ".png". */
  name: string;
  /** The XYZ file, relative to the manifest. */
  xyz: string;
  /** Which frame of it, counting from 1; the first where not given. */
  frame?: number;
  /** Atom pairs to join by a dashed line with their distance written. */
  distances?: [number, number][];
  /** Pairs whose own stick is left out, so that only their dashed line shows (a bond forming or breaking: an XYZ file's bonds are found by distance). */
  noStick?: [number, number][];
  /** False leaves out the hydrogens on carbon (the picture is then smaller than the molecule); true, the default, shows every atom. */
  hydrogens?: boolean;
  /** The view: three atoms (their plane faces the eye, the first two lying left to right), or two (that pair lies left to right, the rest spread as far as it goes up and down); none, as Meno first shows the file opened (its principal axes). */
  view?: number[];
  /** Pixels to the inch, as Settings offers them for a copied picture (300, 600 or 1200); Settings' own where not given. */
  dpi?: number;
};

const fail = (f: { name: string }, what: string): never => {
  throw new Error(`figure "${f.name}": ${what}`);
};

/** Atom numbers as the file counts them, checked against its `count` atoms, as indexes from 0. */
export function atomIndexes(f: { name: string }, what: string, numbers: readonly number[], count: number): number[] {
  return numbers.map((k) => {
    if (!Number.isInteger(k) || k < 1 || k > count) return fail(f, `${what}: atom number ${k} is not in the file (it has ${count} atoms, numbered from 1)`);
    return k - 1;
  });
}

/**
 * The turn that puts a molecule in a view chosen by atoms, from its `places`
 * (x, y, z of each atom in turn) and the atoms' indexes from 0. The screen
 * has x to the right, y up and z toward the eye.
 * - Three atoms A, B, C: A to B lies along x, C on the +y side of it, so that
 *   the three stand in the screen's plane, at one depth.
 * - Two atoms: A to B lies along x, and y is the direction across it in which
 *   the atoms spread most (so that the least of them is in depth); the atom
 *   furthest along y is up.
 */
export function turnByAtoms(places: ArrayLike<number>, atoms: readonly number[]): Turn3D {
  const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
  const a = at(atoms[0]);
  const u = at(atoms[1]).sub(a);
  if (u.length() < 1e-9) throw new Error("the first two atoms are at one place");
  u.normalize();
  let y: THREE.Vector3;
  if (atoms.length === 3) {
    const n = u.clone().cross(at(atoms[2]).sub(a));
    if (n.length() < 1e-6) throw new Error("the three atoms lie on one line, so they give no plane");
    n.normalize();
    y = n.clone().cross(u);
  } else {
    // (two axes across u, and the molecule's spread about its middle along them)
    const p = Math.abs(u.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = p.sub(u.clone().multiplyScalar(p.dot(u))).normalize();
    const e2 = u.clone().cross(e1);
    const n = places.length / 3;
    const mid = new THREE.Vector3();
    for (let i = 0; i < n; i++) mid.add(at(i));
    mid.divideScalar(n);
    let s11 = 0, s12 = 0, s22 = 0;
    for (let i = 0; i < n; i++) {
      const d = at(i).sub(mid);
      const x1 = d.dot(e1), x2 = d.dot(e2);
      s11 += x1 * x1;
      s12 += x1 * x2;
      s22 += x2 * x2;
    }
    // (the direction of greatest spread: the axis of the 2 x 2 matrix's larger root)
    const t = 0.5 * Math.atan2(2 * s12, s11 - s22);
    y = e1.clone().multiplyScalar(Math.cos(t)).add(e2.clone().multiplyScalar(Math.sin(t)));
    // (the atom furthest along it up; at a tie, the first)
    let far = 0;
    for (let i = 0; i < n; i++) if (Math.abs(at(i).sub(mid).dot(y)) > Math.abs(at(far).sub(mid).dot(y)) + 1e-9) far = i;
    if (at(far).sub(mid).dot(y) < 0) y.negate();
  }
  const z = u.clone().cross(y);
  // (the basis maps the screen's axes to the file's; the turn is its inverse)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, y, z)).invert();
  return [q.x, q.y, q.z, q.w];
}

/** The keys a figure may have; any other is refused by name. */
const FIGURE_KEYS = new Set(["name", "xyz", "frame", "distances", "noStick", "hydrogens", "view", "dpi"]);
/** Keys the picture Meno draws cannot honour, and why. */
const REFUSED: Record<string, string> = {
  margin: "the picture is framed as Meno frames a copied picture, with its own small margin; it has no margin of a chosen size",
  box: "the picture is framed as Meno frames a copied picture, round what it draws; it has no frame of a chosen size",
};

/** One figure as the page is given it (page/entry.ts): the molecule as Meno carries it, its styles in 3D where they are not a new workspace's, and the resolution. */
export type StillInput = { name: string; molecule: Carried3D; docStyle3d?: Workspace3D; dpi: number };

const isPairs = (v: unknown) => Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2);

/** A figure as the manifest gives it, its keys and their kinds checked: an unknown key, or one Meno's picture cannot honour, is refused by name. */
export function checkedFigure(raw: unknown, at: number): Figure {
  const f = (raw ?? {}) as Record<string, unknown>;
  const name = typeof f.name === "string" && f.name ? f.name : `number ${at + 1}`;
  const said = { name };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(said, "is not an object");
  if (typeof f.name !== "string" || !/^[^/\\]+$/.test(f.name) || f.name === "." || f.name === "..") return fail(said, "name: give a file name, without a folder");
  for (const k of Object.keys(f)) {
    if (k in REFUSED) fail(said, `${k} is not taken: ${REFUSED[k]}`);
    if (!FIGURE_KEYS.has(k)) fail(said, `unknown key "${k}"`);
  }
  if (typeof f.xyz !== "string" || !f.xyz) fail(said, "xyz: give the path of an XYZ file");
  if (f.frame !== undefined && typeof f.frame !== "number") fail(said, "frame: give a number");
  if (f.distances !== undefined && !isPairs(f.distances)) fail(said, "distances: give pairs of atom numbers");
  if (f.noStick !== undefined && !isPairs(f.noStick)) fail(said, "noStick: give pairs of atom numbers");
  if (f.hydrogens !== undefined && typeof f.hydrogens !== "boolean") fail(said, "hydrogens: give true or false");
  if (f.view !== undefined && (!Array.isArray(f.view) || (f.view.length !== 2 && f.view.length !== 3))) fail(said, "view: give two atoms or three");
  if (f.dpi !== undefined && !(PICTURE_DPIS as readonly unknown[]).includes(f.dpi)) fail(said, `dpi: give ${PICTURE_DPIS.join(", ")} - the resolutions Meno makes a picture at`);
  return f as Figure;
}

/** One figure made ready for the page, from its XYZ file's `text`. An atom number out of range, or a frame, is an error that names the figure and the number. */
export function stillInput(f: Figure, text: string): StillInput {
  let read: ReturnType<typeof readStructures>;
  try {
    read = readStructures("xyz", `${f.xyz}`, text);
  } catch (e) {
    return fail(f, e instanceof Error ? e.message : String(e));
  }
  const m = read.molecules3d?.[0];
  if (!m) return fail(f, "no molecule in the file");
  const frames = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? [])];
  const frame = f.frame ?? 1;
  if (!Number.isInteger(frame) || frame < 1 || frame > frames.length) return fail(f, `frame ${frame} is not in the file (it has ${frames.length} whole frames, numbered from 1)`);
  const places = frames[frame - 1];
  const atoms = m.atoms.map((a, i) => ({ ...a, x: places[3 * i], y: places[3 * i + 1], z: places[3 * i + 2] }));
  const n = atoms.length;
  const pairs = (what: string, list: [number, number][] | undefined) => (list ?? []).map((p) => atomIndexes(f, what, p, n) as [number, number]);
  const shown = pairs("distances", f.distances);
  const lost = pairs("noStick", f.noStick);
  if (f.view && f.view.length !== 2 && f.view.length !== 3) return fail(f, "view: give two atoms or three");
  const view = f.view ? atomIndexes(f, "view", f.view, n) : undefined;
  const same = (p: number[], q: number[]) => (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]);
  let turn: Turn3D | undefined;
  if (view) {
    try {
      turn = turnByAtoms(places, view);
    } catch (e) {
      return fail(f, `view: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // (none asked for: as Meno first shows the file opened - along the principal axes of its atoms as the file first has them)
    turn = principalTurn(frames[0]);
  }
  const molecule: Carried3D = {
    atoms,
    // (as an XYZ file's are, by distance - less the pairs asked to have no stick)
    bonds: bondsByDistance(atoms).filter((b) => !lost.some((p) => same(p, [b.a1, b.a2]))),
    bondOrders: "unknown",
    at: { x: 0, y: 0 },
    // (each pair Meno's own measurement of a distance: utils/measure3d)
    measures: shown.map((atoms, i) => ({ id: i + 1, atoms })),
    ...(turn ? { turn } : {}),
  };
  return {
    name: f.name,
    molecule,
    // (a new workspace's styles in 3D, but for its hydrogens on carbon where they are left out)
    ...(f.hydrogens === false ? { docStyle3d: workspace3dOf({ ...DEFAULT_STYLE_3D_CHOICE, looks: { balls: { hydrogens: "carbonHidden" } } }) } : {}),
    dpi: f.dpi ?? DEFAULT_APP_SETTINGS.pictures.dpi,
  };
}

/** The manifest at `path`, read strictly, each figure made ready for the page. An unknown key, or a file that cannot be read, is an error that names the figure. */
export function readManifest(path: string): { out: string; figures: StillInput[] } {
  const file = resolve(process.cwd(), path);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  for (const k of Object.keys(manifest)) if (k !== "out" && k !== "figures") throw new Error(`the manifest: unknown key "${k}"`);
  if (typeof manifest.out !== "string" || !manifest.out) throw new Error("the manifest: out: give the folder the pictures are written to");
  if (!Array.isArray(manifest.figures)) throw new Error("the manifest: figures: give a list of figures");
  const base = dirname(file);
  const figures = manifest.figures.map((raw, i) => {
    const f = checkedFigure(raw, i);
    let text: string;
    try {
      text = readFileSync(resolve(base, f.xyz), "utf8");
    } catch {
      return fail(f, `cannot read ${f.xyz}`);
    }
    return stillInput(f, text);
  });
  const names = new Set<string>();
  for (const f of figures) {
    if (names.has(f.name)) fail(f, "two figures have this name");
    names.add(f.name);
  }
  return { out: resolve(base, manifest.out), figures };
}
