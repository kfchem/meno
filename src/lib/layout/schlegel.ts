/**
 * A ring system that closes on itself as a polyhedron's surface does -
 * C60, C70, a larger fullerene - drawn as its Schlegel diagram: seen
 * through one face, that face round the outside and every other inside
 * it, no bond crossing another. Too large for the cage's perspective
 * (cage.ts), and with no ring at its edge to lay it out flat from, it came
 * out tangled.
 *
 * The faces are the system's smallest rings and the one face they leave
 * out: on a closed surface every bond lies in two faces, so the bonds in
 * only one of the rings go round that last face. The outer face is set as
 * a regular polygon, and every other atom at the mean of its neighbours
 * (Tutte's barycentric drawing), which for a polyhedron's graph - planar
 * and 3-connected - crosses no bond (W. T. Tutte, "How to draw a graph",
 * Proc. London Math. Soc. 13, 743 (1963)).
 */
import { segmentsCross, type Point } from "./geometry";
import type { Molecule, RingSystem } from "./perceive";

/** The fewest atoms a system is drawn so with: those of twenty or fewer are drawn as the cage they are (engine `layoutSystem`). */
export const SCHLEGEL_FEWEST = 21;

/** A ring system's faces, where it is drawn as its Schlegel diagram: a closed surface of `SCHLEGEL_FEWEST` atoms or more (`closedFaces`); null otherwise. */
export function schlegelFaces(mol: Molecule, sys: RingSystem): number[][] | null {
  return sys.atoms.length >= SCHLEGEL_FEWEST ? closedFaces(mol, sys) : null;
}

const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * The faces of a ring system that is a closed surface - every bond of it in
 * exactly two of its smallest rings, but the bonds round one face more
 * (`V - E + F = 2`) - each its atoms in order round it, the face the rings
 * leave out last; null where it is no such surface: a bond in three rings,
 * or in none; the left-out bonds no one ring, or one larger than every
 * other face - a flat system's edge, as naphthalene's - or an atom with
 * fewer than three bonds in it, no polyhedron's corner. Bonds out of the
 * system, to what hangs from it, are no part of it.
 */
export function closedFaces(mol: Molecule, sys: RingSystem): number[][] | null {
  const inside = new Set(sys.atoms);
  const faces = sys.rings.map((r) => mol.rings[r]);
  const count = new Map<string, number>();
  for (const f of faces) f.forEach((a, i) => count.set(key(a, f[(i + 1) % f.length]), (count.get(key(a, f[(i + 1) % f.length])) ?? 0) + 1));
  // (every bond between the system's atoms)
  let edges = 0;
  for (const a of sys.atoms) {
    for (const b of mol.neighbours[a]) {
      if (inside.has(b) && a < b) {
        edges++;
        const n = count.get(key(a, b)) ?? 0;
        if (n < 1 || n > 2) return null;
      }
    }
  }
  // the bonds in one ring only: round the face left out, one ring of them
  const once = [...count].filter(([, n]) => n === 1).map(([k]) => k.split(",").map(Number) as [number, number]);
  if (once.length < 3) return null;
  const next = new Map<number, number[]>();
  for (const [a, b] of once) {
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  if ([...next.values()].some((v) => v.length !== 2)) return null;
  const last = [once[0][0]];
  for (let prev = -1, at = once[0][0]; ; ) {
    const step = next.get(at)!.find((v) => v !== prev)!;
    if (step === last[0]) break;
    last.push(step);
    [prev, at] = [at, step];
  }
  if (last.length !== once.length) return null;
  // (a face as the others are, not a flat system's edge round them all -
  // naphthalene's ten, which also leaves Euler's count as a sphere's -
  // and every atom a polyhedron's corner, with three bonds or more in it)
  if (last.length > Math.max(...faces.map((f) => f.length))) return null;
  if (sys.atoms.some((a) => mol.neighbours[a].filter((b) => inside.has(b)).length < 3)) return null;
  // (and Euler's count for a sphere)
  if (sys.atoms.length - edges + faces.length + 1 !== 2) return null;
  return [...faces, last];
}

/**
 * The Schlegel diagram of a closed surface, bonds about one long on
 * average: seen through its largest face (the first of those), that face a
 * regular polygon round the outside, every other atom at the mean of its
 * neighbours.
 */
export function schlegel(mol: Molecule, sys: RingSystem, faces: readonly (readonly number[])[]): Map<number, Point> {
  const outer = faces.reduce((best, f) => (f.length > best.length ? f : best));
  const pos = new Map<number, Point>();
  const r = 1;
  outer.forEach((a, i) => {
    const t = Math.PI / 2 + (2 * Math.PI * i) / outer.length;
    pos.set(a, { x: r * Math.cos(t), y: r * Math.sin(t) });
  });
  const fixed = new Set(outer);
  const free = sys.atoms.filter((a) => !fixed.has(a));
  for (const a of free) pos.set(a, { x: 0, y: 0 });
  // (each free atom at the mean of its neighbours, again and again until none moves)
  for (let round = 0; round < 20000; round++) {
    let moved = 0;
    for (const a of free) {
      const nb = mol.neighbours[a].filter((b) => pos.has(b));
      const x = nb.reduce((s, b) => s + pos.get(b)!.x, 0) / nb.length;
      const y = nb.reduce((s, b) => s + pos.get(b)!.y, 0) / nb.length;
      const p = pos.get(a)!;
      moved = Math.max(moved, Math.abs(p.x - x), Math.abs(p.y - y));
      pos.set(a, { x, y });
    }
    if (moved < 1e-10) break;
  }
  // Tutte's drawing crowds the faces deep inside into its middle: each atom
  // moved out from the middle, its distance r taken to r^p - the order of
  // the atoms round the middle and out from it kept - for the evenest bonds
  // of those that cross none (p = 1, as drawn, always among them)
  const bonds: [number, number][] = [];
  for (const a of sys.atoms) for (const b of mol.neighbours[a]) if (a < b && pos.has(b)) bonds.push([a, b]);
  let best = pos;
  let bestSpread = Infinity;
  for (const p of SPREADS) {
    const at = new Map([...pos].map(([a, q]) => {
      const d = Math.hypot(q.x, q.y);
      const k = d > 0 ? Math.pow(d / r, p) / (d / r) : 1;
      return [a, { x: q.x * k, y: q.y * k }];
    }));
    const lengths = bonds.map(([a, b]) => Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y));
    const mean = lengths.reduce((x, y) => x + y, 0) / lengths.length;
    if (p !== 1 && (crosses(bonds, at) || onABond(bonds, at, CLEAR * mean))) continue;
    const spread = Math.sqrt(lengths.reduce((x, y) => x + (y - mean) ** 2, 0) / lengths.length) / mean;
    if (spread < bestSpread - 1e-9) [best, bestSpread] = [at, spread];
  }
  // (scaled so that its bonds are one long on average)
  const sum = bonds.reduce((x, [a, b]) => x + Math.hypot(best.get(a)!.x - best.get(b)!.x, best.get(a)!.y - best.get(b)!.y), 0);
  const k = bonds.length ? bonds.length / sum : 1;
  return new Map([...best].map(([a, q]) => [a, { x: q.x * k, y: q.y * k }]));
}

/** The powers a Schlegel diagram's distances from its middle are tried at (`schlegel`), as drawn last. */
const SPREADS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** How near a bond, in mean bonds, an atom not of it may lie: no nearer than the benchmark's clash (metrics). */
const CLEAR = 0.3;

/** Whether an atom lies within `room` of a bond it is not part of. */
function onABond(bonds: readonly [number, number][], pos: Map<number, Point>, room: number): boolean {
  const atoms = [...pos.keys()];
  for (const [a, b] of bonds) {
    const p = pos.get(a)!;
    const q = pos.get(b)!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    for (const c of atoms) {
      if (c === a || c === b) continue;
      const r = pos.get(c)!;
      const t = Math.max(0, Math.min(1, ((r.x - p.x) * dx + (r.y - p.y) * dy) / len2));
      if (Math.hypot(p.x + t * dx - r.x, p.y + t * dy - r.y) < room) return true;
    }
  }
  return false;
}

/** Whether any two bonds with no atom in common cross. */
function crosses(bonds: readonly [number, number][], pos: Map<number, Point>): boolean {
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      const [a, b] = bonds[i];
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pos.get(a)!, pos.get(b)!, pos.get(c)!, pos.get(d)!)) return true;
    }
  }
  return false;
}
