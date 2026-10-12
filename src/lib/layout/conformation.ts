/**
 * The conformation of a solid (cage.ts `solidOf`), read from where its atoms
 * are: which shape each ring takes. The drawing follows it - a chair drawn
 * as a chair, a boat as a boat, a ring with a double bond flat - rather
 * than rules for one molecule or another.
 */
import { orderOf, type Molecule } from "./perceive";

type Vec3 = [number, number, number];

/**
 * A ring's shape: flat - a double bond in it, or every atom within a tenth
 * of a bond of one plane; a chair - its atoms alternately above and below
 * that plane; a boat - two opposite atoms out on one side (its bow and
 * stern, by their places round the ring), the other four on the other;
 * otherwise puckered (a twist, an envelope).
 */
export type RingShape = { kind: "flat" | "chair" | "puckered" } | { kind: "boat"; bow: number };

export function ringShape(mol: Molecule, ring: readonly number[], at: (a: number) => Vec3): RingShape {
  const n = ring.length;
  if (ring.some((a, i) => orderOf(mol, a, ring[(i + 1) % n]) === 2)) return { kind: "flat" };
  const h = heights(ring.map(at));
  if (h.every((v) => Math.abs(v) < 0.1)) return { kind: "flat" };
  if (n !== 6) return { kind: "puckered" };
  if (h.every((v, i) => Math.sign(v) !== Math.sign(h[(i + 1) % 6]))) return { kind: "chair" };
  for (let k = 0; k < 3; k++) {
    const side = Math.sign(h[k]);
    if (side === 0 || Math.sign(h[k + 3]) !== side) continue;
    if (h.every((v, i) => i === k || i === k + 3 || Math.sign(v) === -side)) return { kind: "boat", bow: k };
  }
  return { kind: "puckered" };
}

/** How far each point stands out of the plane that best fits them all, one way or the other, as they go round. */
export function heights(P: readonly Vec3[]): number[] {
  const n = P.length;
  const c = [0, 1, 2].map((k) => P.reduce((sum, p) => sum + p[k], 0) / n) as Vec3;
  // (the plane's normal by the ring's turn round its middle)
  let nrm: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = sub(P[i], c);
    const v = sub(P[(i + 1) % n], c);
    nrm = [nrm[0] + u[1] * v[2] - u[2] * v[1], nrm[1] + u[2] * v[0] - u[0] * v[2], nrm[2] + u[0] * v[1] - u[1] * v[0]];
  }
  const l = Math.hypot(...nrm) || 1;
  return P.map((p) => dot(sub(p, c), nrm) / l);
}

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
