/**
 * WFX files: a molecule's wavefunction - its nuclei, and its orbitals as
 * Gaussian primitives - as Gaussian (Output=WFX), ORCA (orca_2aim) and
 * others write it. Read by a reader that comes with Meno, under the same
 * contract as the reader plugins (docs/FILE-IO.md), and each orbital's
 * values worked out on a grid when its surface is asked for - the file read
 * again, nothing kept.
 *
 * Written from the format's specification alone: "WFX Format
 * Specification", version 1.0.4c (AIMAll, aim.tkgristmill.com/wfxformat.html).
 * - A section is its tag, `<Name>`, its lines, and `</Name>`; tags in any
 *   case, sections in any order; all data in atomic units.
 * - A nucleus's element is its atomic number (`<Atomic Numbers>`, which the
 *   specification requires where any atom has an ECP), else its nuclear
 *   charge (`<Nuclear Charges>`, required: with no ECP, the atomic number).
 *   One of 0 - a ghost atom, a non-nuclear attractor - is no atom of the
 *   molecule.
 * - The orbitals: each one's occupation, energy and spin ("Alpha and Beta",
 *   "Alpha", "Beta"), and its coefficients over the primitives - "normalized
 *   linear expansion in unnormalized primitive Cartesian Gaussian basis
 *   functions", each primitive a centre, a type (the specification's table:
 *   1 S, 2-4 P, 5-10 D, 11-20 F, 21-35 G, 36-56 H) and an exponent. So an
 *   orbital's value at a point is the sum of its coefficients times
 *   x^l y^m z^n exp(-a r^2), from each primitive's centre - nothing assumed.
 */
import { ELEMENTS } from "../chem/elements";
import type { ReaderOutput } from "./output";
import { floatsText, type Grid } from "./results";
import { gridAbout } from "./grids";
import { BOHR_ANGSTROM } from "../units";

/** The primitive types, from 1, as the specification's table numbers them: each its powers of x, y and z - S to G as it lists them, H by its loop. */
const POWERS: readonly [number, number, number][] = (() => {
  const listed = (
    "S PX PY PZ DXX DYY DZZ DXY DXZ DYZ " +
    "FXXX FYYY FZZZ FXXY FXXZ FYYZ FXYY FXZZ FYZZ FXYZ " +
    "GXXXX GYYYY GZZZZ GXXXY GXXXZ GXYYY GYYYZ GXZZZ GYZZZ GXXYY GXXZZ GYYZZ GXXYZ GXYYZ GXYZZ"
  ).split(" ");
  const out = listed.map((t) => [...t].reduce((p, c) => [p[0] + +(c === "X"), p[1] + +(c === "Y"), p[2] + +(c === "Z")], [0, 0, 0]) as [number, number, number]);
  // (H: L = 5, x's power outermost)
  for (let ix = 0; ix <= 5; ix++) for (let iy = 0; iy <= 5 - ix; iy++) out.push([ix, iy, 5 - ix - iy]);
  return out;
})();

/** The spins as the specification words them. */
const SPINS: Record<string, "both" | "alpha" | "beta"> = { "alpha and beta": "both", alpha: "alpha", beta: "beta" };

/** Each element's symbol, by its atomic number. */
const SYMBOL = new Map(ELEMENTS.map((e) => [e.number, e.symbol]));

/** A tag's name - its case and spacing set aside - and whether it closes; none where the line is no tag. */
function tagOf(line: string): [string, boolean] | null {
  const m = /^<(\/?)\s*([^<>]+?)\s*>$/.exec(line.trim());
  return m ? [m[2].split(/\s+/).join(" ").toLowerCase(), m[1] === "/"] : null;
}

type Sections = Map<string, string[]>;

/** The file's sections at its top level, by their tags' names: each its lines, a section within one kept among its lines. */
function sectionsOf(text: string, name: string): Sections {
  const out: Sections = new Map();
  const open: [string, string[]][] = [];
  for (const line of text.split(/\r?\n/)) {
    const tag = tagOf(line);
    if (tag && !tag[1]) {
      open.push([tag[0], []]);
      continue;
    }
    if (tag) {
      const top = open.pop();
      if (!top || top[0] !== tag[0]) throw new Error(`${name}: its <${tag[0]}> is closed where none is open.`);
      if (open.length) open[open.length - 1][1].push(`<${top[0]}>`, ...top[1], `</${top[0]}>`);
      else if (out.has(top[0])) throw new Error(`${name} has <${top[0]}> twice.`);
      else out.set(top[0], top[1]);
      continue;
    }
    if (open.length) open[open.length - 1][1].push(line);
  }
  if (open.length) throw new Error(`${name}: its <${open[open.length - 1][0]}> is never closed.`);
  return out;
}

/** A section's lines: by its name, or - the energy's, whose tag says what it is the sum of - by its name's first word; throws where it must be there and is not. */
function section(s: Sections, name: string, file: string, required = true): string[] | undefined {
  const lines = s.get(name) ?? [...s.entries()].find(([k]) => k.split(" ")[0] === name)?.[1];
  if (!lines && required) throw new Error(`${file} has no <${name}>.`);
  return lines;
}

/** A section's numbers, as many as `count` where it is given; throws where they are not numbers, or not so many. */
function numbers(lines: readonly string[] | undefined, what: string, file: string, count?: number, whole = false): number[] {
  const items = (lines ?? []).join(" ").split(/\s+/).filter(Boolean);
  const values = items.map(Number);
  if (values.some((v, i) => !Number.isFinite(v) || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(items[i]) || (whole && !Number.isInteger(v))))
    throw new Error(`${file}: its ${what} are not numbers.`);
  if (count != null && values.length !== count) throw new Error(`${file} has ${values.length} ${what} where it says ${count}.`);
  return values;
}

/** One number, from a section of one. */
const one = (s: Sections, name: string, file: string, whole = false, required = true) => {
  const lines = section(s, name, file, required);
  return lines ? numbers(lines, name, file, 1, whole)[0] : undefined;
};

type Nuclei = { z: number[]; bohr: number[] };

/** The nuclei: each one's atomic number (else its nuclear charge, whole) and where it is, in bohr. */
function nucleiOf(s: Sections, file: string): Nuclei {
  const n = one(s, "number of nuclei", file, true)!;
  if (n < 1) throw new Error(`${file} has no nuclei.`);
  const given = section(s, "atomic numbers", file, false);
  const z = given ? numbers(given, "atomic numbers", file, n, true) : numbers(section(s, "nuclear charges", file), "nuclear charges", file, n);
  if (z.some((v) => !Number.isInteger(v) || (v !== 0 && !SYMBOL.has(v)))) throw new Error(`${file}: a nucleus has no element's atomic number.`);
  return { z, bohr: numbers(section(s, "nuclear cartesian coordinates", file), "coordinates", file, 3 * n) };
}

/** What a WFX file holds: its molecule, in one geometry, its energy, and its orbitals, each with its surface promised where its primitives are read as they must be. */
export function readWfx(name: string, text: string): ReaderOutput {
  const s = sectionsOf(text, name);
  const { z, bohr } = nucleiOf(s, name);
  const atoms: string[] = [];
  const frame: number[] = [];
  // (ghost atoms and non-nuclear attractors: no atoms of the molecule)
  z.forEach((v, i) => {
    if (!v) return;
    atoms.push(SYMBOL.get(v)!);
    frame.push(...bohr.slice(3 * i, 3 * i + 3).map((c) => c * BOHR_ANGSTROM));
  });
  if (!atoms.length) throw new Error(`${name} has no atoms, only ghosts.`);
  const charge = one(s, "net charge", name);
  const multiplicity = one(s, "electronic spin multiplicity", name, true, false);
  const model = (section(s, "model", name, false) ?? []).join(" ").split(/\s+/).filter(Boolean).join(" ");
  const energy = one(s, "energy", name);
  const virial = one(s, "virial ratio (-v/t)", name, false, false);
  const gradients = section(s, "nuclear cartesian energy gradients", name, false);
  const results: unknown[] = [];
  if (virial != null) results.push({ id: "virial", on: "molecule", group: "Wavefunction", label: "Virial ratio (−V/T)", value: virial, quantity: "number", digits: 6 });
  const rms = gradients ? rmsGradient(gradients, z) : undefined;
  if (rms != null) results.push({ id: "rms-gradient", on: "frames", group: "Optimisation", label: "RMS gradient", unit: "Eh/bohr", digits: 6, values: [rms] });
  return {
    schema: 1,
    program: null,
    ...(model ? { method: model } : {}),
    // (a charge that is no whole number: unsaid, not rounded)
    ...(charge != null && Number.isInteger(charge) ? { charge } : {}),
    ...(multiplicity != null && multiplicity > 0 ? { multiplicity } : {}),
    atoms,
    frames: [frame],
    energies: energy != null ? [energy] : null,
    orbitals: orbitalsOf(s, name),
    results,
  };
}

/** The RMS of the gradients' components on the molecule's atoms - each line a nucleus's name and its x, y, z - where there is one to each nucleus. */
function rmsGradient(lines: readonly string[], z: readonly number[]): number | undefined {
  const rows = lines.map((l) => l.trim().split(/\s+/)).filter((r) => r.length >= 4);
  if (rows.length !== z.length) return undefined;
  const values = rows.flatMap((r, i) => (z[i] ? r.slice(-3).map(Number) : []));
  if (!values.length || values.some((v) => !Number.isFinite(v))) return undefined;
  return Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length);
}

/** Its orbitals in Meno's general form (./orbitals): each its spin, energy and occupation, and its surface promised where the wavefunction reads as it must. */
function orbitalsOf(s: Sections, name: string): ReaderOutput["orbitals"] {
  const count = one(s, "number of occupied molecular orbitals", name, true)!;
  const occupations = numbers(section(s, "molecular orbital occupation numbers", name), "orbitals' occupations", name, count);
  const energies = numbers(section(s, "molecular orbital energies", name), "orbitals' energies", name, count);
  const spins = section(s, "molecular orbital spin types", name)!
    .map((l) => l.trim().split(/\s+/).join(" ").toLowerCase())
    .filter(Boolean);
  if (spins.length !== count || spins.some((v) => !(v in SPINS))) throw new Error(`${name}: its orbitals' spins are not as its specification says.`);
  let drawn = true;
  try {
    wavefunctionOf(s, name);
  } catch {
    drawn = false;
  }
  return spins.map((v, i) => ({ spin: SPINS[v], energy: energies[i], occupation: occupations[i], ...(drawn ? { surface: { ask: `orbital:${i}` } } : {}) }));
}

type Wavefunction = { nuclei: number[]; centres: number[]; powers: [number, number, number][]; exponents: number[]; coefficients: number[][] };

/** Its nuclei (bohr) and its primitives - each one's centre, by the nucleus's place from 0, its powers and its exponent - and each orbital's coefficients of them, in order. */
function wavefunctionOf(s: Sections, name: string): Wavefunction {
  const count = one(s, "number of primitives", name, true)!;
  const { bohr } = nucleiOf(s, name);
  const n = bohr.length / 3;
  const centres = numbers(section(s, "primitive centers", name), "primitives' centres", name, count, true);
  const types = numbers(section(s, "primitive types", name), "primitives' types", name, count, true);
  const exponents = numbers(section(s, "primitive exponents", name), "primitives' exponents", name, count);
  if (centres.some((c) => c < 1 || c > n)) throw new Error(`${name}: a primitive is centred on no nucleus it has.`);
  if (types.some((t) => t < 1 || t > POWERS.length)) throw new Error(`${name}: a primitive is of a type its specification does not list.`);
  if (exponents.some((a) => !(a > 0))) throw new Error(`${name}: a primitive's exponent is not positive.`);
  const orbitals = one(s, "number of occupied molecular orbitals", name, true)!;
  const byNumber = new Map<number, number[]>();
  let number: number | null = null;
  let values: number[] = [];
  let reading = false;
  for (const line of section(s, "molecular orbital primitive coefficients", name)!) {
    const tag = tagOf(line);
    if (tag && tag[0] === "mo number") {
      if (!tag[1]) {
        if (number != null) byNumber.set(number, values);
        number = null;
        values = [];
        reading = true;
      }
      continue;
    }
    if (!line.trim()) continue;
    if (reading) {
      number = numbers([line], "orbitals' numbers", name, 1, true)[0];
      reading = false;
      continue;
    }
    if (number == null) throw new Error(`${name}: its coefficients come before any orbital's number.`);
    values.push(...numbers([line], "coefficients", name));
  }
  if (number != null) byNumber.set(number, values);
  const coefficients = Array.from({ length: orbitals }, (_, k) => byNumber.get(k + 1));
  if (byNumber.size !== orbitals || coefficients.some((c) => c?.length !== count)) throw new Error(`${name}: its coefficients are not ${count} for each of its ${orbitals} orbitals.`);
  return { nuclei: bohr, centres: centres.map((c) => c - 1), powers: types.map((t) => POWERS[t - 1]), exponents, coefficients: coefficients as number[][] };
}

/** Past this, exp(-a r^2) is under 1e-17 of a primitive's largest value, and its share of a value is left out. */
const FAR = 40;

/**
 * An orbital's values on a grid in bohr - its origin, one step alike each
 * way, its points along each - the last axis running fastest: the sum of
 * its coefficients times each primitive's value. Primitives of one centre
 * and exponent share each point's exp(-a r^2), worked out only as far as
 * it matters (`FAR`).
 */
export function orbitalOn(w: Wavefunction, k: number, origin: readonly number[], step: number, counts: readonly number[]): Float32Array {
  const c = w.coefficients[k];
  const groups = new Map<string, { centre: number; a: number; terms: { p: [number, number, number]; c: number }[] }>();
  c.forEach((v, i) => {
    if (!v) return;
    const key = `${w.centres[i]} ${w.exponents[i]}`;
    const g = groups.get(key) ?? { centre: w.centres[i], a: w.exponents[i], terms: [] };
    g.terms.push({ p: w.powers[i], c: v });
    groups.set(key, g);
  });
  const [nx, ny, nz] = counts;
  const out = new Float64Array(nx * ny * nz);
  const px = new Float64Array(6);
  const py = new Float64Array(6);
  const pz = new Float64Array(6);
  for (const g of groups.values()) {
    const [cx, cy, cz] = [0, 1, 2].map((d) => w.nuclei[3 * g.centre + d]);
    const reach = Math.sqrt(FAR / g.a);
    const span = (o: number, cen: number, n: number) => [Math.max(0, Math.ceil((cen - reach - o) / step)), Math.min(n - 1, Math.floor((cen + reach - o) / step))];
    const [x0, x1] = span(origin[0], cx, nx);
    const [y0, y1] = span(origin[1], cy, ny);
    const [z0, z1] = span(origin[2], cz, nz);
    const r2most = reach * reach;
    for (let i = x0; i <= x1; i++) {
      const dx = origin[0] + i * step - cx;
      px[0] = 1;
      for (let e = 1; e < 6; e++) px[e] = px[e - 1] * dx;
      for (let j = y0; j <= y1; j++) {
        const dy = origin[1] + j * step - cy;
        const dxy = dx * dx + dy * dy;
        if (dxy > r2most) continue;
        py[0] = 1;
        for (let e = 1; e < 6; e++) py[e] = py[e - 1] * dy;
        const row = (i * ny + j) * nz;
        for (let l = z0; l <= z1; l++) {
          const dz = origin[2] + l * step - cz;
          const r2 = dxy + dz * dz;
          if (r2 > r2most) continue;
          pz[0] = 1;
          for (let e = 1; e < 6; e++) pz[e] = pz[e - 1] * dz;
          let sum = 0;
          for (const t of g.terms) sum += t.c * px[t.p[0]] * py[t.p[1]] * pz[t.p[2]];
          out[row + l] += sum * Math.exp(-g.a * r2);
        }
      }
    }
  }
  return Float32Array.from(out);
}

/** One of a WFX file's orbitals on the grid about its nuclei (./grids `gridAbout`), asked for by its key (`orbital:<place>`). */
export function wfxGrid(name: string, text: string, key: string): Grid {
  const k = Number(/^orbital:(\d+)$/.exec(key)?.[1] ?? NaN);
  const w = wavefunctionOf(sectionsOf(text, name), name);
  if (!Number.isInteger(k) || k < 0 || k >= w.coefficients.length) throw new Error(`${name} has no ${key}.`);
  // (about every nucleus, ghosts too: a ghost atom can carry primitives)
  const place = gridAbout(w.nuclei.map((v) => v * BOHR_ANGSTROM));
  const step = place.axes[0][0];
  const values = orbitalOn(
    w,
    k,
    place.origin.map((v) => v / BOHR_ANGSTROM),
    step / BOHR_ANGSTROM,
    place.counts,
  );
  return { ...place, values: floatsText(values), signed: true, quantity: "orbital" };
}
