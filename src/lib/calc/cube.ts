/**
 * Cube files: a molecule, and values on a grid about it - an orbital, a
 * density - as the programs write them themselves (Gaussian's cubegen,
 * ORCA's orca_plot and others). Read by a reader that comes with Meno
 * (docs/WORKSPACE.md, stage 3d), under the same contract as the reader
 * plugins: what it reads is a `ReaderOutput`, its grids each a promise in a
 * list, given when asked for - the file read again, nothing kept.
 *
 * The layout, as Gaussian's documentation gives it: two lines of comment;
 * the number of atoms and the grid's origin (a negative number of atoms:
 * orbitals follow, listed after the atoms); for each axis the number of
 * points and the step along it (a positive number: in bohr, a negative one:
 * in ångströms); a line for each atom - its atomic number, its charge and
 * where it is; then the values, the last axis running fastest, and where
 * there are several grids - orbitals - all theirs at each point together.
 */
import { ELEMENTS } from "../chem/elements";
import type { ReaderOutput } from "./output";
import { floatsText, type Grid } from "./results";
import { BOHR_ANGSTROM } from "../units";

/** What starts a cube file: two lines of comment, then four lines of a count and three numbers - the origin, and each axis. */
export const CUBE_MARK =
  /^[^\n]*\n[^\n]*\n\s*-?\d+(\s+[-+]?\d*\.?\d+([eEdD][-+]?\d+)?){3}(\s+\d+)?\s*\r?\n(\s*-?\d+(\s+[-+]?\d*\.?\d+([eEdD][-+]?\d+)?){3}\s*\r?\n){3}/;
/**
 * A number as a program writes it into a cube file: a sign, a point, an
 * exponent - after an E, or a D as Fortran writes one; or, where the
 * exponent takes three digits, after no letter at all ("0.10000-100" is
 * 0.1 x 10^-100), as the Fortran standard's E and D editing writes it
 * (ISO/IEC 1539-1, *E and D editing*: the exponent forms' table). A sign
 * and three digits right after a number's digits are its exponent, never
 * a number of their own: a value is written with a point.
 */
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+|[-+]\d{3}(?![\d.]))?/g;
/** A number as `NUMBER` finds it, as JavaScript reads one. */
const valueOf = (t: string) => Number(t.replace(/[dD]/, "e").replace(/(\d)([-+]\d{3})$/, "$1e$2"));
/** A value above which, in both directions, a grid is two-signed: an orbital's two phases. */
const SIGNED_LEAST = 1e-6;

type Header = {
  comments: [string, string];
  atoms: { z: number; xyz: [number, number, number] }[];
  origin: [number, number, number];
  axes: [[number, number, number], [number, number, number], [number, number, number]];
  counts: [number, number, number];
  /** The orbitals' numbers, where the grids are orbitals; otherwise each grid's place, from 1. */
  grids: number[];
  orbitals: boolean;
  /** Where the values begin in the text. */
  start: number;
};

/** Each element's symbol, by its atomic number. */
const SYMBOL = new Map(ELEMENTS.map((e) => [e.number, e.symbol]));
/** An atom's element by its atomic number - a dummy, as an unknown one. */
const symbolOf = (z: number) => SYMBOL.get(z) ?? "X";

/** A whole word that is one number as `NUMBER` finds it. */
const ONE_NUMBER = new RegExp(`^${NUMBER.source}$`);
/** The numbers of a line of text. */
const numbers = (line: string) => line.trim().split(/\s+/).map((t) => (ONE_NUMBER.test(t) ? valueOf(t) : Number(t)));

function header(text: string, name: string): Header {
  let at = 0;
  const line = () => {
    const end = text.indexOf("\n", at);
    const s = text.slice(at, end < 0 ? text.length : end);
    at = end < 0 ? text.length : end + 1;
    return s.replace(/\r$/, "");
  };
  const bad = () => new Error(`${name} does not read as a cube file.`);
  const comments: [string, string] = [line().trim(), line().trim()];
  const first = numbers(line());
  const n = first[0];
  if (!Number.isInteger(n) || n === 0 || first.length < 4 || first.slice(0, 4).some((v) => !Number.isFinite(v))) throw bad();
  const axisLines = [numbers(line()), numbers(line()), numbers(line())];
  if (axisLines.some((a) => a.length < 4 || a.slice(0, 4).some((v) => !Number.isFinite(v)) || !Number.isInteger(a[0]) || a[0] === 0)) throw bad();
  // (a positive count: bohr; a negative one: ångströms - the first axis's sign says for all)
  const unit = axisLines[0][0] > 0 ? BOHR_ANGSTROM : 1;
  const counts = axisLines.map((a) => Math.abs(a[0])) as [number, number, number];
  const axes = axisLines.map((a) => [a[1] * unit, a[2] * unit, a[3] * unit]) as Header["axes"];
  const origin = [first[1] * unit, first[2] * unit, first[3] * unit] as [number, number, number];
  const atoms: Header["atoms"] = [];
  for (let i = 0; i < Math.abs(n); i++) {
    const a = numbers(line());
    if (a.length < 5 || a.slice(0, 5).some((v) => !Number.isFinite(v))) throw bad();
    atoms.push({ z: Math.round(a[0]), xyz: [a[2] * unit, a[3] * unit, a[4] * unit] });
  }
  let grids = [1];
  const orbitals = n < 0;
  if (orbitals) {
    // (the orbitals' count, then their numbers - over as many lines as they take)
    const listed: number[] = [];
    let count = -1;
    while (count < 0 || listed.length < count) {
      if (at >= text.length) throw bad();
      const v = numbers(line());
      if (count < 0) {
        count = v.shift() ?? 0;
        if (!Number.isInteger(count) || count < 1) throw bad();
      }
      listed.push(...v);
    }
    grids = listed.slice(0, count);
  } else if (first.length > 4 && Number.isInteger(first[4]) && first[4] > 1) {
    grids = Array.from({ length: first[4] }, (_, i) => i + 1);
  }
  return { comments, atoms, origin, axes, counts, grids, orbitals, start: at };
}

/**
 * What a grid is called in its list: an orbital by its number; otherwise
 * what the file's comments say of it - not a line of the program's version
 * or the date - or its place.
 */
function gridName(h: Header, k: number): string {
  if (h.orbitals) return `Orbital ${h.grids[k]}`;
  if (h.grids.length > 1) return `Grid ${k + 1}`;
  const said = h.comments.find((c) => c && !/version|date/i.test(c));
  return said ? said.slice(0, 60) : "Grid";
}

/** What a cube file holds: its molecule, in one geometry, and a list of its grids, each a promise. */
export function readCube(name: string, text: string): ReaderOutput {
  const h = header(text, name);
  const atoms = h.atoms.map((a) => symbolOf(a.z));
  const spacing = Math.min(...h.axes.map((a) => Math.hypot(...a)));
  return {
    schema: 1,
    program: null,
    atoms,
    frames: [h.atoms.flatMap((a) => a.xyz)],
    results: [
      {
        id: "grids",
        on: "list",
        group: h.orbitals ? "Orbitals" : "Grids",
        label: h.orbitals ? "Orbitals" : "Grids",
        columns: [{ label: "Grid" }, { label: "Points" }, { label: "Spacing", quantity: "length", digits: 2 }],
        rows: h.grids.map((_, k) => ({
          cells: [gridName(h, k), h.counts.join(" × "), spacing],
          frame: 0,
          surface: { ask: `grid:${k}` },
        })),
        // (opened at once, its first grid shown: what a cube file is opened for)
        shown: 0,
      },
    ],
  };
}

/** One of a cube file's grids, asked for by its key (`grid:<place>`). */
export function cubeGrid(name: string, text: string, key: string): Grid {
  const h = header(text, name);
  const k = Number(/^grid:(\d+)$/.exec(key)?.[1] ?? NaN);
  if (!Number.isInteger(k) || k < 0 || k >= h.grids.length) throw new Error(`${name} has no ${key}.`);
  const points = h.counts[0] * h.counts[1] * h.counts[2];
  const every = h.grids.length;
  // (each number at least a character and a space: a header that promises more than the rest of the file could
  // hold is refused before room is made for them - a few bytes may otherwise ask for gigabytes)
  if (!Number.isSafeInteger(points * every) || points * every > (text.length - h.start + 1) / 2) throw new Error(`${name} ends before its grid does.`);
  const values = new Float32Array(points);
  // (every number after the header, in turn: this grid's each `every`-th)
  const re = new RegExp(NUMBER);
  re.lastIndex = h.start;
  let seen = 0;
  let got = 0;
  for (let m = re.exec(text); m && got < points; m = re.exec(text)) {
    if (seen++ % every === k) values[got++] = valueOf(m[0]);
  }
  if (got < points) throw new Error(`${name} ends before its grid does.`);
  let low = 0;
  let high = 0;
  for (let i = 0; i < points; i++) {
    if (values[i] < low) low = values[i];
    if (values[i] > high) high = values[i];
  }
  const signed = low < -SIGNED_LEAST && high > SIGNED_LEAST;
  return {
    origin: h.origin,
    axes: h.axes,
    counts: h.counts,
    values: floatsText(values),
    ...(signed ? { signed: true } : {}),
    // (orbitals, where the file lists them: drawn as an orbital is, at first (./grids `isoOf`))
    ...(h.orbitals ? { quantity: "orbital" as const } : {}),
  };
}
