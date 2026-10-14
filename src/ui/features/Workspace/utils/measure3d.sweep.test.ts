import { describe, expect, it } from "vitest";
import { readStructures, type StructureKind } from "../../../../lib/io/structures";
import { kindOf as fileKindOf } from "../../../../lib/io/kinds";
import { readCube } from "../../../../lib/calc/cube";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { calcResult } from "./io";
import { kindOf, measureText, measureValue, type MeasureKind } from "./measure3d";
import { bondsAt, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";

// Every 3D structure the repository's tests stand on - its fixture files,
// and the structures its tests write out in full - read as Meno reads them,
// and every bond length, bond angle and torsion of each, in every frame,
// checked against an independent computation (measure3d.oracle.test): plain
// arithmetic in ångströms, an angle by its sine and cosine together, the
// torsion's sign by projection.
//
// Each is measured twice: over its places in world units as numbers of
// full precision, which tries measureValue's arithmetic; and over the places
// the canvas measures over - each frame about its centre, in single
// precision (molecule3d `solidOf`) - which tries what is written there.

type P = [number, number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P, b: P): P => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: P) => Math.sqrt(dot(a, a));
const scale = (a: P, k: number): P => [a[0] * k, a[1] * k, a[2] * k];

function distance(a: P, b: P): number {
  return len(sub(a, b));
}
/** The angle at B, by its sine and cosine together: as true near 0° and 180° as anywhere between. */
function angle(a: P, b: P, c: P): number {
  const u = sub(a, b);
  const v = sub(c, b);
  return (Math.atan2(len(cross(u, v)), dot(u, v)) * 180) / Math.PI;
}
/** IUPAC: looking along B to C, positive where B-A must turn clockwise, by at most 180°, to cover C-D. */
function torsion(a: P, b: P, c: P, d: P): number {
  const axis = scale(sub(c, b), 1 / len(sub(c, b)));
  const v = sub(a, b);
  const w = sub(d, c);
  const vp = sub(v, scale(axis, dot(v, axis)));
  const wp = sub(w, scale(axis, dot(w, axis)));
  return (Math.atan2(dot(axis, cross(vp, wp)), dot(vp, wp)) * 180) / Math.PI;
}
/** The sine of the angle at B. */
function sine(a: P, b: P, c: P): number {
  const u = sub(a, b);
  const v = sub(c, b);
  return len(cross(u, v)) / (len(u) * len(v));
}

// (where a measurement has no value is Meno's ruling, not arithmetic -
// measure3d: two atoms nearer than this in ångströms in one place, three
// atoms whose angle's sine is less than this in a line)
const ONE_PLACE = 1e-6;
const IN_A_LINE = 1e-3;
/** Within this, relatively, of either ruling: too near to say which side a value falls. */
const NEAR = 1e-9;

type Expected = { value: number } | { none: true } | { unsure: true };

/** What a measurement over `atoms` comes to by the independent computation, in ångströms and degrees. */
function expected(xyz: readonly P[], atoms: number[]): Expected {
  const p = atoms.map((i) => xyz[i]);
  if (p.length === 2) return { value: distance(p[0], p[1]) };
  // (an angle's two arms from its middle atom; a torsion's three bonds)
  const arms = p.slice(1).map((q, i) => distance(q, p[i]));
  if (arms.some((l) => Math.abs(l - ONE_PLACE) < NEAR * ONE_PLACE)) return { unsure: true };
  if (arms.some((l) => l < ONE_PLACE)) return { none: true };
  if (p.length === 3) return { value: angle(p[0], p[1], p[2]) };
  const sines = [sine(p[0], p[1], p[2]), sine(p[1], p[2], p[3])];
  if (sines.some((s) => Math.abs(s - IN_A_LINE) < NEAR * IN_A_LINE)) return { unsure: true };
  if (sines.some((s) => s < IN_A_LINE)) return { none: true };
  return { value: torsion(p[0], p[1], p[2], p[3]) };
}

/** How far apart two values of a kind are: a torsion's the shorter way round. */
function apart(kind: MeasureKind, a: number, b: number): number {
  const d = a - b;
  return kind === "torsion" ? Math.abs(d - 360 * Math.round(d / 360)) : Math.abs(d);
}

/** The value as written, rounded by decimal arithmetic; null where it lies too near a tie to say - or, a torsion, so near ±180° that its sign is the coordinates' last digit. */
function written(kind: MeasureKind, v: number): string | null {
  const k = kind === "distance" ? 100 : 10;
  const x = v * k;
  if (Math.abs(Math.abs(x - Math.trunc(x)) - 0.5) < 1e-6) return null;
  if (kind === "torsion" && 180 - Math.abs(v) < 1e-6) return null;
  const r = Math.round(Math.abs(x)) / k;
  const n = r.toFixed(kind === "distance" ? 2 : 1);
  const s = v < 0 && r !== 0 ? `−${n}` : n;
  return kind === "distance" ? `${s} Å` : `${s}°`;
}

/** A molecule in 3D as Meno reads it: its atoms, bonds, frames, and how its bonds are found. */
type Read3D = Pick<Molecule3D, "atoms" | "bonds" | "frames" | "bondsFrom">;

/** Every bond, bond angle at an atom, and torsion about a bond, of the bonds given: atoms in order. */
function measurements(n: number, bonds: readonly { a1: number; a2: number }[]): number[][] {
  const neighbours = Array.from({ length: n }, () => [] as number[]);
  for (const b of bonds) {
    neighbours[b.a1].push(b.a2);
    neighbours[b.a2].push(b.a1);
  }
  const all: number[][] = bonds.map((b) => [b.a1, b.a2]);
  for (let j = 0; j < n; j++) for (const i of neighbours[j]) for (const k of neighbours[j]) if (i < k) all.push([i, j, k]);
  for (const b of bonds)
    for (const i of neighbours[b.a1]) for (const l of neighbours[b.a2]) if (i !== b.a2 && l !== b.a1 && i !== l) all.push([i, b.a1, b.a2, l]);
  return all;
}

/** A measurement whose value the canvas writes otherwise than its file's coordinates give it. */
type Misread = { frame: number; atoms: number[]; value: number; shown: number; wanted: string; written: string };

/**
 * Checks every measurement of every frame of `ms`: says how many of each
 * kind were checked, what was wrong (the first few), and each measurement
 * the canvas writes otherwise than the file's coordinates, rounded, have it.
 */
function sweep(ms: readonly Read3D[]): { checked: Record<MeasureKind, number>; wrong: string[]; misread: Misread[] } {
  const checked = { distance: 0, angle: 0, torsion: 0 };
  const wrong: string[] = [];
  const misread: Misread[] = [];
  // (checked by hand rather than by expect: there are a hundred thousand of them)
  const fault = (what: string) => wrong.length < 10 && wrong.push(what);
  for (const m of ms) {
    const n = m.atoms.length;
    // (its frames as the canvas holds them: the first its atoms, any that does not hold every atom left out - solidOf)
    const frames = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * n)];
    const canvas = solidOf({ ...m, id: 0, at: { x: 0, y: 0 } } as Molecule3D, STYLE_3D).frames;
    if (canvas.length !== frames.length) fault(`${canvas.length} frames on the canvas, not ${frames.length}`);
    frames.forEach((f, frame) => {
      const xyz: P[] = Array.from({ length: n }, (_, i) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]]);
      const places = Float64Array.from(f, (v) => v * WORLD_PER_ANGSTROM);
      const shownPlaces = canvas[frame];
      const shownXyz: P[] = Array.from({ length: n }, (_, i) => scale([shownPlaces[3 * i], shownPlaces[3 * i + 1], shownPlaces[3 * i + 2]], 1 / WORLD_PER_ANGSTROM));
      for (const atoms of measurements(n, bondsAt(m, frame))) {
        const kind = kindOf(atoms);
        const at = `frame ${frame}, ${kind} ${atoms.join("-")}`;
        const want = expected(xyz, atoms);
        const got = measureValue(places, atoms);
        const shown = measureValue(shownPlaces, atoms);
        checked[kind]++;
        if ("unsure" in want) continue;
        if ("none" in want) {
          if (!Number.isNaN(got) || measureText(kind, got) !== "–") fault(`${at}: ${got}, where there is none`);
          continue;
        }
        // its arithmetic: to 1e-9 over the file's coordinates, and written as they give it
        if (!(apart(kind, got, want.value) < 1e-9 * Math.max(1, Math.abs(want.value)))) fault(`${at}: ${got}, not ${want.value}`);
        const text = written(kind, want.value);
        if (text && measureText(kind, got) !== text) fault(`${at}: written ${measureText(kind, got)}, not ${text}`);
        // on the canvas: to 1e-9 over the places it measures over, which are
        // the file's to single precision - and written as the file's give it
        const onCanvas = expected(shownXyz, atoms);
        if (!("value" in onCanvas)) continue;
        if (!(apart(kind, shown, onCanvas.value) < 1e-9 * Math.max(1, Math.abs(onCanvas.value)))) fault(`${at} on the canvas: ${shown}, not ${onCanvas.value}`);
        if (!(apart(kind, shown, want.value) < (kind === "distance" ? 1e-5 : 1e-2))) fault(`${at} on the canvas: ${shown}, far from ${want.value}`);
        if (text && measureText(kind, shown) !== text) misread.push({ frame, atoms, value: want.value, shown, wanted: text, written: measureText(kind, shown) });
      }
    });
  }
  return { checked, wrong, misread };
}

// ---- the fixture files: every file in src/samples, and the GUI harness's

const FILES: Record<string, string> = {
  ...import.meta.glob<string>("/src/samples/*", { eager: true, query: "?raw", import: "default" }),
  ...import.meta.glob<string>("/scripts/gui/fixtures/*", { eager: true, query: "?raw", import: "default" }),
};
const STRUCTURES: readonly string[] = ["mol", "sdf", "rxn", "xyz", "pdb"] satisfies StructureKind[];

/** A file's molecules in 3D, as Meno opens it: its kind told as Meno tells it, read by Meno's own reader. */
function opened(name: string, text: string): Read3D[] {
  const kind = fileKindOf(name, text)?.id;
  if (kind && STRUCTURES.includes(kind)) return readStructures(kind as StructureKind, name, text).molecules3d ?? [];
  if (kind === "cube") return calcResult(readCube(name, text), ["Meno"], name).molecules3d ?? [];
  return [];
}

// ---- the structures tests write out in full, each where it is from

const xyz = (name: string, text: string) => readStructures("xyz", name, text).molecules3d!;
const mol = (kind: "mol" | "sdf", name: string, text: string) => readStructures(kind, name, text).molecules3d!;
const pdb = (name: string, lines: string[]) => readStructures("pdb", name, lines.join("\n")).molecules3d!;
const output = (name: string, out: ReaderOutput) => calcResult(out, ["cclib 1.9rc1"], name).molecules3d!;

/** An ATOM or HETATM line, its fields in the format's columns (lib/io/structures.test). */
function atomLine(record: "ATOM  " | "HETATM", serial: number, el: string, x: number, y: number, z: number, more: { altLoc?: string; resSeq?: number; name?: string } = {}): string {
  const line = Array(80).fill(" ");
  const put = (from: number, s: string) => [...s].forEach((c, i) => (line[from - 1 + i] = c));
  put(1, record);
  put(7, String(serial).padStart(5));
  put(13, (more.name ? ` ${more.name}` : ` ${el}`).padEnd(4));
  put(17, more.altLoc ?? " ");
  put(18, record === "ATOM  " ? "ALA" : "LIG");
  put(22, "A");
  put(23, String(more.resSeq ?? 1).padStart(4));
  put(31, x.toFixed(3).padStart(8));
  put(39, y.toFixed(3).padStart(8));
  put(47, z.toFixed(3).padStart(8));
  put(77, el.padStart(2));
  return line.join("");
}
const het = (serial: number, el: string, x: number, y: number, z: number, more: { altLoc?: string } = {}) => atomLine("HETATM", serial, el, x, y, z, more);
const conect = (from: number, ...to: number[]) => "CONECT" + [from, ...to].map((n) => String(n).padStart(5)).join("");
const pdbModel = (n: number, atoms: string[]) => [`MODEL     ${String(n).padStart(4)}`, ...atoms, "ENDMDL"];

/** A molfile of water, its header saying 2D or 3D, its atoms at the depths given (utils/io.test). */
const water = (dim: "2D" | "3D", z: [number, number, number]) =>
  [
    "water",
    `  Meno              ${dim}`,
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    `    0.0000    0.0000${z[0].toFixed(4).padStart(10)} O   0  0`,
    `    0.7570    0.5860${z[1].toFixed(4).padStart(10)} H   0  0`,
    `   -0.7570    0.5860${z[2].toFixed(4).padStart(10)} H   0  0`,
    "  1  2  1  0",
    "  1  3  1  0",
    "M  END",
    "",
  ].join("\n");

/** Two records of water in 3D, one titled (lib/io/structures.test). */
const waterRecord = (title: string, z: number) =>
  [title, "  Meno            3D", "", "  3  2  0  0  0  0  0  0  0  0999 V2000",
    `    0.0000    0.0000    ${z.toFixed(4)} O   0  0  0  0  0  0  0  0  0  0  0  0`,
    "    0.7600    0.5900    0.5000 H   0  0  0  0  0  0  0  0  0  0  0  0",
    "   -0.7600    0.5900   -0.5000 H   0  0  0  0  0  0  0  0  0  0  0  0",
    "  1  2  1  0", "  1  3  1  0", "M  END", "$$$$"].join("\n");

/** A lattice of carbons, oxygens, hydrogens, nitrogens and sulfurs 1 to 1.6 Å apart, shaken (utils/structureParsers.test). */
function lattice(): string {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const els = ["C", "O", "H", "N", "S"];
  const lines = Array.from({ length: 1200 }, (_, i) => {
    const x = (i % 12) * 1.3 + rand() * 0.4 - 50;
    const y = (Math.floor(i / 12) % 10) * 1.3 + rand() * 0.4;
    const z = Math.floor(i / 120) * 1.3 + rand() * 0.4;
    return `${els[i % els.length]} ${x} ${y} ${z}`;
  });
  return `1200\nlattice\n${lines.join("\n")}\n`;
}

/** Water as a calculation's reader gives it: an optimisation's steps (lib/calc/output.test, utils/io.test, workflow/programs.test, store/stepRuns.test). */
const waterOutput = (frames: number[][]): ReaderOutput => ({ program: "ORCA", atoms: ["O", "H", "H"], frames });

const twoFrames = (comment: (i: number) => string, xs: number[], el = "H") => xs.map((x, i) => `2\n${comment(i)}\n${el} 0 0 0\n${el} ${x} 0 0\n`).join("");

const INLINE: [string, () => Read3D[]][] = [
  // lib/io/structures.test and ui/views/openFile.test
  ["water (XYZ)", () => xyz("w.xyz", "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n")],
  [
    "water's frames, one damaged and one cut short (XYZ)",
    () => {
      const frame = (e: string, x: string) => `3\nenergy: ${e}\nO 0 0 0\nH ${x} 0.59 0\nH -0.76 0.59 0\n`;
      return xyz("t.xyz", frame("-76.1", "0.76") + frame("-76.2", "0.7x") + frame("-76.3", "0.77") + frame("-76.4", "0.78").split("\n").slice(0, 4).join("\n"));
    },
  ],
  ["two records of water in 3D (SD)", () => mol("sdf", "w.sdf", [waterRecord("aspirin", 0), waterRecord("", 0.2)].join("\n") + "\n")],
  ["a hetero group bonded by CONECT records and by distance (PDB)", () => pdb("x.pdb", [het(1, "C", 0, 0, 0), het(2, "O", 1.2, 0, 0), het(3, "C", 0, 1.4, 0), het(4, "C", 0, -1.5, 0), conect(1, 2), conect(2, 1, 3), conect(3, 2)])],
  ["three alanines' alpha carbons in a line (PDB)", () => pdb("p.pdb", [1, 2, 3].map((k) => atomLine("ATOM  ", k, "C", 3.8 * k, 0, 0, { resSeq: k, name: "CA" })))],
  ["a hetero group in alternate locations (PDB)", () => pdb("x.pdb", [het(1, "C", 0, 0, 0, { altLoc: "A" }), het(2, "C", 0.3, 0, 0, { altLoc: "B" }), het(3, "O", 1.4, 0, 0, { altLoc: "A" }), het(4, "O", 1.5, 0.3, 0, { altLoc: "B" }), het(5, "N", 9, 9, 9)])],
  ["two models of the same atoms (PDB)", () => pdb("x.pdb", [...pdbModel(1, [het(1, "C", 0, 0, 0), het(2, "O", 1.2, 0, 0)]), ...pdbModel(2, [het(1, "C", 0, 0, 0.5), het(2, "O", 1.2, 0, 0.5)])])],
  ["two models of other atoms (PDB)", () => pdb("x.pdb", [...pdbModel(1, [het(1, "C", 0, 0, 0)]), ...pdbModel(2, [het(1, "N", 0, 0, 0), het(2, "O", 1.2, 0, 0)])])],
  // ui/features/Workspace/utils/io.test
  ["water, flat, its header saying 3D (MOL)", () => mol("mol", "water.mol", water("3D", [0, 0, 0]))],
  ["water in depth, its header saying 2D (MOL)", () => mol("mol", "water.mol", water("2D", [0, 0.3, -0.3]))],
  ["water flat and in depth (SD)", () => mol("sdf", "both.sdf", water("2D", [0, 0, 0]) + "$$$$\n" + water("3D", [0, 0.3, -0.3]) + "$$$$\n")],
  ["hydrogen's two frames (XYZ)", () => xyz("h2.xyz", twoFrames((i) => ["first", "second"][i], [0.74, 0.8]))],
  ["hydrogen's two conformers and their energies (XYZ)", () => xyz("crest_conformers.xyz", twoFrames((i) => ["  -1.1700", "  -1.1650"][i], [0.74, 0.8]))],
  [
    "water's optimisation, as a reader read it",
    () =>
      output("water_opt.out", waterOutput([
        [0, 0, 0.1, 0, 0.8, -0.5, 0, -0.8, -0.5],
        [0, 0, 0.11, 0, 0.78, -0.48, 0, -0.78, -0.48],
        [0, 0, 0.12, 0, 0.76, -0.47, 0, -0.76, -0.47],
      ])),
  ],
  // utils/structureParsers.test and lib/io/kinds.test
  ["ethane's carbons, two frames and an end (XYZ)", () => xyz("c2.xyz", "2\ncomment\nC 0 0 0\nC 1.54 0 0\n2\ncomment\nC 0 0 0\nC 1.54 0 0\nEND")],
  ["two carbons 1.5 Å apart (XYZ)", () => xyz("x.xyz", "2\n\nC 0 0 0\nC 1.5 0 0")],
  ...(["C CL", "c cl", "6 17"] as const).map(
    (els): [string, () => Read3D[]] => {
      const [c, cl] = els.split(" ");
      return [`a carbon and two chlorines, written "${c}" and "${cl}" (XYZ)`, () => xyz("ccl2.xyz", `3\n\n${c} 0 0 0\n${cl} 1.75 0 0\n${cl} -1.45 0 0`)];
    },
  ),
  ["an atom of no element (XYZ)", () => xyz("q.xyz", "1\n\nQq 0 0 0")],
  ["a lattice of 1200 atoms, shaken (XYZ)", () => xyz("lattice.xyz", lattice())],
  // render/renderScene.test
  ["ethene (XYZ)", () => xyz("ethene.xyz", "6\nethene\nC 0.000 0.000 0.667\nC 0.000 0.000 -0.667\nH 0.000 0.923 1.238\nH 0.000 -0.923 1.238\nH 0.000 0.923 -1.238\nH 0.000 -0.923 -1.238\n")],
  // lib/chem/molWriter.test: what the writer writes, read back
  [
    "ammonium (MOL, 3D)",
    () =>
      mol("mol", "ammonium.mol", [
        "ammonium",
        "  Meno              3D",
        "",
        "  5  4  0  0  0  0  0  0  0  0999 V2000",
        "    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
        "    1.0200    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400    0.9600    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400   -0.4800    0.8300 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "   -0.3400   -0.4800   -0.8300 H   0  0  0  0  0  0  0  0  0  0  0  0",
        "  1  2  1  0  0  0  0",
        "  1  3  1  0  0  0  0",
        "  1  4  1  0  0  0  0",
        "  1  5  1  0  0  0  0",
        "M  CHG  1   1   1",
        "M  ISO  1   1  15",
        "M  END",
        "",
      ].join("\n")),
  ],
  // lib/calc/cube.test: Meno's own reading of a cube, its atoms in bohr
  [
    "hydrogen's orbitals (cube, in bohr)",
    () =>
      opened("h2.cube", [
        " H2 orbitals",
        " MO coefficients",
        "   -2   -1.000000   -1.000000   -1.500000",
        "    2    2.000000    0.000000    0.000000",
        "    2    0.000000    2.000000    0.000000",
        "    3    0.000000    0.000000    1.500000",
        "    1    1.000000    0.000000    0.000000   -0.700000",
        "    1    1.000000    0.000000    0.000000    0.700000",
        "    2    1    2",
        "  1.0E-01 -1.0E-01  2.0E-01 -2.0E-01  3.0E-01 -3.0E-01",
        "  4.0E-01  4.0E-01  5.0E-01  5.0E-01  6.0E-01  6.0E-01",
        "  7.0E-02 -7.0E-02  8.0E-02 -8.0E-02  9.0E-02 -9.0E-02",
        "  1.0E-02  1.0E-02  2.0E-02  2.0E-02  3.0E-02  3.0E-02",
      ].join("\n")),
  ],
  [
    "helium's density (cube, in ångströms)",
    () =>
      opened("density.cube", [
        "Electron density",
        "PySCF Version: 2.14.0  Date: today",
        "    1    0.000000    0.000000    0.000000",
        "   -2    0.500000    0.000000    0.000000",
        "   -2    0.000000    0.500000    0.000000",
        "   -2    0.000000    0.000000    0.500000",
        "    2    2.000000    0.250000    0.250000    0.250000",
        "  0.1 0.2 0.3 0.4",
        "  0.5 0.6 0.7 0.8",
      ].join("\n")),
  ],
  // calculations' outputs as readers give them: lib/calc/output.test, lib/calc/client.test, workflow/programs.test, store/stepRuns.test
  ["water's optimisation in two steps, as a reader read it", () => output("water.out", waterOutput([[0, 0, 0.1, 0, 0.8, -0.5, 0, -0.8, -0.5], [0, 0, 0.12, 0, 0.76, -0.47, 0, -0.76, -0.47]]))],
  ["hydrogen, as a reader read it", () => output("h2.out", { atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]] })],
  ["water's optimisation by xtb, as a reader read it", () => output("xtb.out", waterOutput([[0, 0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59], [0, 0, 0.01, 0, 0.77, 0.58, 0, -0.77, 0.58]]))],
  ["water's conformers by RDKit and CREST, as a reader read them", () => output("conformers.out", waterOutput([[0, 0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59], [0, 0, 0.1, 0, 0.7, 0.6, 0, -0.7, 0.6]]))],
  ["water by Gaussian, as a reader read it", () => output("g16.log", waterOutput([[0.1, 0, 0, 0.1, -0.76, 0.59, 0.1, 0.76, 0.59]]))],
  // ui/features/Workspace/chem/make3d.test: an ethanol's two conformers, as RDKit answers them
  [
    "ethanol's skeleton in two conformers, as RDKit answers",
    () => {
      const frames = [
        [0, 0, 0, 1.3, 0.75, 0.1, 2.6, 0, -0.1, -0.9, 0.5, 0, 3.4, 0.5, 0],
        [0, 0, 0.1, 1.3, 0.75, 0, 2.6, 0, 0.2, -0.9, 0.5, 0, 3.4, 0.5, 0],
      ];
      const els = ["C", "C", "O", "H", "H"];
      return [
        {
          atoms: els.map((el, i) => ({ el, x: frames[0][3 * i], y: frames[0][3 * i + 1], z: frames[0][3 * i + 2] })),
          bonds: [[0, 1], [1, 2], [0, 3], [2, 4]].map(([a1, a2]) => ({ a1, a2, order: 1 })),
          frames: [frames[1]],
        },
      ];
    },
  ],
];

describe("every measurement in 3D of every structure the tests stand on", () => {
  it("finds the fixture files, and those of them in 3D", () => {
    expect(Object.keys(FILES).length).toBeGreaterThanOrEqual(8);
    const in3d = Object.entries(FILES).filter(([path, text]) => opened(path.split("/").pop()!, text).length);
    expect(in3d.map(([path]) => path)).toEqual(expect.arrayContaining(["/src/samples/cholesterol.pdb", "/src/samples/cholesterol.xyz"]));
  });

  /** Its measurements all as its coordinates give them, and written on the canvas so: how many there were. */
  const agrees = (ms: readonly Read3D[]) => {
    const r = sweep(ms);
    expect.soft(r.wrong).toEqual([]);
    expect.soft(r.misread).toEqual([]);
    return r.checked.distance + r.checked.angle + r.checked.torsion;
  };

  for (const [path, text] of Object.entries(FILES)) {
    it(`agrees with its coordinates - ${path}`, () => {
      const ms = opened(path.split("/").pop()!, text);
      const checked = agrees(ms);
      if (ms.length) expect(checked).toBeGreaterThan(200);
    });
  }

  for (const [name, read] of INLINE) {
    it(`agrees with its coordinates - ${name}`, () => {
      const ms = read();
      expect(ms.length).toBeGreaterThan(0);
      agrees(ms);
    }, 30_000);
  }
});
