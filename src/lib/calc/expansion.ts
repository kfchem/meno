/**
 * A wavefunction as Gaussian primitives - Meno's general form of one
 * (docs/PLUGINS.md, *Gives a wavefunction whole*) - which a reader gives
 * where its program writes its orbitals otherwise (a promise's value,
 * `{expansion}`), converting its program's own basis and coefficients and
 * working out no values itself:
 * - the nuclei, in bohr;
 * - the primitives: each one's centre (a nucleus, from 0), its powers of x,
 *   y and z (their sum at most 5) and its exponent, unnormalised -
 *   x^l y^m z^n e^(-a r^2) from its centre;
 * - the basis functions: each one's primitives, by their places, and its
 *   coefficient of each;
 * - the orbitals: each one's coefficients of the basis functions, in the
 *   order its reader gives the orbitals.
 * The orbitals are over the functions, not over the primitives at once, so
 * that what is sent is no larger than the program's own file holds: an
 * orbital has as many coefficients as there are functions, where the
 * primitives are several times as many.
 *
 * Before any of its orbitals is drawn, Meno checks that the orbitals a list
 * offers - of one spin: an unrestricted calculation's alpha and beta
 * orbitals are not orthogonal to each other, and Meno lists each spin's
 * apart - are as orbitals are: orthonormal (`blockStraying`), their overlaps
 * worked out from the primitives themselves; where they are not, none is
 * drawn. A conversion of a program's basis gone wrong - an order, a
 * normalisation, a sign - is so caught in a molecule, where the atoms'
 * functions overlap, but not always: a sign turned on every function of
 * one l and m of a lone atom leaves C S Cᵀ as it was. What shows a
 * reader's conversion right is its comparison with its program's own
 * expansion of the same orbitals, where it writes one.
 */
import { orbitalOn, type Wavefunction } from "./wfx";
import { floatsText, type Grid } from "./results";
import { gridAbout, type GridPlace } from "./grids";
import { BOHR_ANGSTROM } from "../units";

export type BasisFunction = { primitives: number[]; coefficients: number[] };
export type Expansion = {
  nuclei: number[];
  centres: number[];
  powers: [number, number, number][];
  exponents: number[];
  functions: BasisFunction[];
  orbitals: number[][];
};

/** How many primitives, functions and orbitals a wavefunction may have. */
const PRIMITIVES_MOST = 100_000;
const FUNCTIONS_MOST = 20_000;
const ORBITALS_MOST = 40_000;
/** The highest a primitive's powers may sum to: h (5), as far as Meno works them out. */
const POWER_MOST = 5;
/**
 * How far from orthonormal the orbitals offered may be and still be drawn:
 * far above what coefficients printed to eight figures leave (about 1e-8),
 * far below what a basis read wrong gives (1e-3 and more).
 */
export const STRAYING_MOST = 1e-4;
/** Past this, a pair of primitives' overlap is under exp(-40) of its largest, and left out. */
const APART = 40;

const nums = (x: unknown): number[] | undefined => (Array.isArray(x) && x.every((n) => typeof n === "number" && Number.isFinite(n)) ? (x as number[]) : undefined);
const places = (x: number[], n: number) => x.every((i) => Number.isInteger(i) && i >= 0 && i < n);

/** A wavefunction's primitives, functions and orbitals as given - a promise's value `{expansion}` - where they read as the form says; otherwise none. */
export function expansionOf(v: unknown): Expansion | undefined {
  const e = (v as { expansion?: Record<string, unknown> } | null)?.expansion;
  if (!e || typeof e !== "object") return undefined;
  const nuclei = nums(e.nuclei);
  const centres = nums(e.centres);
  const exponents = nums(e.exponents);
  const powers = Array.isArray(e.powers) ? e.powers.map(nums) : undefined;
  if (!nuclei || !centres || !exponents || !powers || !nuclei.length || nuclei.length % 3) return undefined;
  const n = centres.length;
  if (!n || n > PRIMITIVES_MOST || exponents.length !== n || powers.length !== n || !places(centres, nuclei.length / 3) || exponents.some((a) => !(a > 0))) return undefined;
  if (powers.some((p) => !p || p.length !== 3 || !places(p, POWER_MOST + 1) || p[0] + p[1] + p[2] > POWER_MOST)) return undefined;
  if (!Array.isArray(e.functions) || !e.functions.length || e.functions.length > FUNCTIONS_MOST) return undefined;
  const functions: BasisFunction[] = [];
  for (const f of e.functions as { primitives?: unknown; coefficients?: unknown }[]) {
    const p = nums(f?.primitives);
    const c = nums(f?.coefficients);
    if (!p || !c || !p.length || p.length !== c.length || !places(p, n)) return undefined;
    functions.push({ primitives: p, coefficients: c });
  }
  const orbitals = Array.isArray(e.orbitals) && e.orbitals.length && e.orbitals.length <= ORBITALS_MOST ? e.orbitals.map(nums) : undefined;
  if (!orbitals || orbitals.some((o) => !o || o.length !== functions.length)) return undefined;
  return { nuclei, centres, powers: powers as [number, number, number][], exponents, functions, orbitals: orbitals as number[][] };
}

/** Orbital `k`'s coefficients of the primitives themselves: of each function's, its coefficient times the function's. */
export function primitiveCoefficients(e: Expansion, k: number): number[] {
  const out = new Array<number>(e.centres.length).fill(0);
  e.orbitals[k].forEach((c, f) => {
    if (!c) return;
    const { primitives, coefficients } = e.functions[f];
    for (let i = 0; i < primitives.length; i++) out[primitives[i]] += c * coefficients[i];
  });
  return out;
}

/** The overlaps along one axis of x^i e^(-a x^2) about A and x^j e^(-b x^2) about B, i and j up to 5 (Obara and Saika's recurrence), without its Gaussian factor. */
function overlaps1d(pa: number, pb: number, p: number, out: Float64Array) {
  // out[i * 6 + j]; S00 = 1 here (the factor is taken apart)
  out.fill(0);
  out[0] = 1;
  const h = 1 / (2 * p);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      if (!i && !j) continue;
      let v: number;
      if (i > 0) v = pa * out[(i - 1) * 6 + j] + h * ((i - 1) * (i > 1 ? out[(i - 2) * 6 + j] : 0) + j * (j > 0 ? out[(i - 1) * 6 + j - 1] : 0));
      else v = pb * out[j - 1] + h * (j - 1) * (j > 1 ? out[j - 2] : 0);
      out[i * 6 + j] = v;
    }
}

/**
 * How far the orbitals `block` (by their places) are from orthonormal: the
 * largest of |C S Cᵀ - 1|, C their coefficients of the primitives, S the primitives' overlaps worked out from the
 * primitives themselves - each pair of a centre and an exponent once, a pair
 * too far apart to matter left out (`APART`).
 */
export function blockStraying(e: Expansion, block: readonly number[]): number {
  const n = e.centres.length;
  // (the primitives by centre and exponent: one Gaussian factor and one table of overlaps each pair of groups)
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = `${e.centres[i]} ${e.exponents[i]}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  }
  const list = [...groups.values()];
  const w = block.length;
  const C = block.map((k) => primitiveCoefficients(e, k));
  // T = S Cᵀ: for each primitive, the overlap of it with each orbital of the block
  const T = new Float64Array(n * w);
  const sx = new Float64Array(36);
  const sy = new Float64Array(36);
  const sz = new Float64Array(36);
  for (const g of list) {
    const a = e.exponents[g[0]];
    const A = [0, 1, 2].map((d) => e.nuclei[3 * e.centres[g[0]] + d]);
    for (const h of list) {
      const b = e.exponents[h[0]];
      const B = [0, 1, 2].map((d) => e.nuclei[3 * e.centres[h[0]] + d]);
      const p = a + b;
      const mu = (a * b) / p;
      const r2 = (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2;
      if (mu * r2 > APART) continue;
      const P = [0, 1, 2].map((d) => (a * A[d] + b * B[d]) / p);
      overlaps1d(P[0] - A[0], P[0] - B[0], p, sx);
      overlaps1d(P[1] - A[1], P[1] - B[1], p, sy);
      overlaps1d(P[2] - A[2], P[2] - B[2], p, sz);
      const factor = (Math.PI / p) ** 1.5 * Math.exp(-mu * r2);
      for (const i of g) {
        const [li, mi, ni] = e.powers[i];
        for (const j of h) {
          const [lj, mj, nj] = e.powers[j];
          const s = factor * sx[li * 6 + lj] * sy[mi * 6 + mj] * sz[ni * 6 + nj];
          if (!s) continue;
          for (let k = 0; k < w; k++) T[i * w + k] += s * C[k][j];
        }
      }
    }
  }
  let worst = 0;
  for (let k = 0; k < w; k++)
    for (let l = 0; l < w; l++) {
      let m = 0;
      for (let i = 0; i < n; i++) m += C[k][i] * T[i * w + l];
      worst = Math.max(worst, Math.abs(m - (k === l ? 1 : 0)));
    }
  return worst;
}

/**
 * Orbital `k` of a wavefunction drawn on `grid` (else on Meno's grid about
 * its nuclei, ghosts too): first the orbitals offered (`block`, by their
 * places, `k` among them) checked orthonormal - none drawn where they are
 * not, saying so.
 */
export function drawnOrbital(e: Expansion, k: number, block: readonly number[], grid?: GridPlace): Grid {
  if (!Number.isInteger(k) || k < 0 || k >= e.orbitals.length) throw new Error(`The reader's wavefunction has no orbital ${k + 1}.`);
  const offered = [...new Set([...block.filter((b) => Number.isInteger(b) && b >= 0 && b < e.orbitals.length), k])];
  const straying = blockStraying(e, offered);
  if (!(straying <= STRAYING_MOST))
    throw new Error(`The reader's orbitals are not orthonormal as given (off by ${straying.toPrecision(2)}), so its basis was not read as its program wrote it: none is drawn.`);
  const place = grid ?? gridAbout(e.nuclei.map((v) => v * BOHR_ANGSTROM));
  const w: Wavefunction = { nuclei: e.nuclei, centres: e.centres, powers: e.powers, exponents: e.exponents, coefficients: [primitiveCoefficients(e, k)] };
  const values = orbitalOn(
    w,
    0,
    place.origin.map((v) => v / BOHR_ANGSTROM),
    place.axes[0][0] / BOHR_ANGSTROM,
    place.counts,
  );
  return { ...place, values: floatsText(values), signed: true, quantity: "orbital" };
}
