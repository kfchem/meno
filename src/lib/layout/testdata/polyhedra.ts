import type { LayoutInput } from "../perceive";

/** The golden ratio. */
const PHI = (1 + Math.sqrt(5)) / 2;

/** Every point `p` makes with its coordinates turned round (cyclically) and each sign either way, once each. */
function turnsAndSigns(base: readonly number[][]): number[][] {
  const out: number[][] = [];
  const seen = new Set<string>();
  for (const b of base)
    for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]])
      for (const s of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
        const p = [b[i] * s[0], b[j] * s[1], b[k] * s[2]];
        const key = p.map((v) => v.toFixed(6)).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
      }
  return out;
}

/** A polyhedron's carbon skeleton: an atom at each vertex, a bond along each edge (the vertices `length` apart), each carbon with as many H as it has room for. */
function skeleton(points: number[][], length: number, double: (nb: number[][], a: number, b: number) => boolean): LayoutInput {
  const bonds: [number, number][] = [];
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++) if (Math.abs(Math.hypot(...points[a].map((v, k) => v - points[b][k])) - length) < 1e-6) bonds.push([a, b]);
  const nb = points.map((_, i) => bonds.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));
  const orders = bonds.map(([a, b]) => (double(nb, a, b) ? 2 : 1));
  const valence = points.map((_, i) => bonds.reduce((n, [a, b], k) => n + (a === i || b === i ? orders[k] : 0), 0));
  return { atoms: points.map((_, i) => ({ el: "C", hs: 4 - valence[i] })), bonds: bonds.map(([a, b], k) => ({ a, b, order: orders[k] })) };
}

/**
 * Buckminsterfullerene, C60: the truncated icosahedron (the even turns of
 * (0, ±1, ±3φ), (±1, ±(2 + φ), ±2φ) and (±φ, ±2, ±(2φ + 1)), edges 2
 * long), its double bonds the thirty edges between two hexagons - those in
 * no pentagon.
 */
export function c60(): LayoutInput {
  const points = turnsAndSigns([[0, 1, 3 * PHI], [1, 2 + PHI, 2 * PHI], [PHI, 2, 2 * PHI + 1]]);
  // (an edge in a pentagon: back to its start by four more)
  const inPentagon = (nb: number[][], u: number, v: number) =>
    nb[v].some((a) => a !== u && nb[a].some((b) => b !== v && b !== u && nb[b].some((c) => c !== a && c !== v && nb[c].includes(u))));
  return skeleton(points, 2, (nb, a, b) => !inPentagon(nb, a, b));
}

/** Dodecahedrane, C20H20: the regular dodecahedron ((±1, ±1, ±1) and the turns of (0, ±1/φ, ±φ), edges 2/φ long), every bond single. */
export function dodecahedrane(): LayoutInput {
  return skeleton(turnsAndSigns([[1, 1, 1], [0, 1 / PHI, PHI]]), 2 / PHI, () => false);
}
