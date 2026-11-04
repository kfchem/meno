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

/** Carbons joined as `bonds` say, each with as many H as its bonds leave it room for (four bonds at most: none). */
function graph(n: number, bonds: readonly [number, number][]): LayoutInput {
  const degree = Array.from({ length: n }, (_, i) => bonds.filter(([a, b]) => a === i || b === i).length);
  return { atoms: degree.map((d) => ({ el: "C", hs: Math.max(0, 4 - d) })), bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })) };
}

/** The n-gonal prism: two n-membered rings, atom i of one bonded to atom i of the other - a closed surface of 2n atoms. */
export function prism(n: number): LayoutInput {
  const bonds: [number, number][] = [];
  for (let i = 0; i < n; i++) bonds.push([i, (i + 1) % n], [n + i, n + ((i + 1) % n)], [i, n + i]);
  return graph(2 * n, bonds);
}

/** The n-gonal prism with one of its bonds between the rings drawn together into one atom: a closed surface of 2n - 1 atoms, that atom with four bonds. */
export function prismPinched(n: number): LayoutInput {
  // (atom n, the other ring's first, made one with atom 0: the rest numbered down by one)
  const at = (k: number) => (k === n ? 0 : k > n ? k - 1 : k);
  const bonds: [number, number][] = [];
  for (let i = 0; i < n; i++) bonds.push([i, (i + 1) % n], [at(n + i), at(n + ((i + 1) % n))]);
  for (let i = 1; i < n; i++) bonds.push([i, at(n + i)]);
  return graph(2 * n - 1, bonds);
}

/** A honeycomb wrapped round a torus, m by n cells: a closed surface, but no sphere's - every atom three bonds, every face a hexagon. */
export function honeycombTorus(m: number, n: number): LayoutInput {
  const id = (i: number, j: number, s: number) => 2 * (((i + m) % m) * n + ((j + n) % n)) + s;
  const bonds: [number, number][] = [];
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) bonds.push([id(i, j, 0), id(i, j, 1)], [id(i, j, 1), id(i + 1, j, 0)], [id(i, j, 1), id(i, j + 1, 0)]);
  return graph(2 * m * n, bonds);
}

/** [1.1.1]Propellane: three three-membered rings on one bond. */
export function propellane(): LayoutInput {
  return graph(5, [[0, 1], [0, 2], [2, 1], [0, 3], [3, 1], [0, 4], [4, 1]]);
}

/** Cubane with one of its bonds made two, through a CH2 between them: a polyhedron but for that atom, with two bonds. */
export function cubaneOpened(): LayoutInput {
  const bonds: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [1, 5], [2, 6], [3, 7], [0, 8], [8, 4]];
  return graph(9, bonds);
}

/** The truncated dodecahedron, C60 of twenty triangles and twelve decagons: the even turns of (0, ±1/φ, ±(2 + φ)), (±1/φ, ±φ, ±2φ) and (±φ, ±2, ±(φ + 1)), edges 2/φ long. */
export function truncatedDodecahedron(): LayoutInput {
  return skeleton(turnsAndSigns([[0, 1 / PHI, 2 + PHI], [1 / PHI, PHI, 2 * PHI], [PHI, 2, PHI + 1]]), 2 / PHI, () => false);
}

/** The truncated octahedron, of eight hexagons and six squares: every ordering of (0, ±1, ±2), edges √2 long. */
export function truncatedOctahedron(): LayoutInput {
  const flipped = turnsAndSigns([[0, 1, 2], [0, 2, 1]]);
  return skeleton(flipped, Math.SQRT2, () => false);
}

/** Five atoms each bonded to every other (the complete graph K5): every three a ring, a bond in three of them - no polyhedron, and drawn on no plane without a crossing. */
export function k5(): LayoutInput {
  const bonds: [number, number][] = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) bonds.push([a, b]);
  return graph(5, bonds);
}

/** The n-gonal pyramid: an n-membered ring and one atom over it bonded to each of its atoms - a polyhedron with one face larger than the rest. */
export function pyramid(n: number): LayoutInput {
  const bonds: [number, number][] = [];
  for (let i = 0; i < n; i++) bonds.push([i, (i + 1) % n], [i, n]);
  return graph(n + 1, bonds);
}
