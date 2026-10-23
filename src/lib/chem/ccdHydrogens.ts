/**
 * A PDB entry's residue given the hydrogens the wwPDB's Chemical Component
 * Dictionary defines for it (./ccd): each of the component's hydrogens put
 * on the entry's atom of the same name, where the component's shape puts
 * it beside that atom and its neighbours - the component's atoms there
 * fitted onto the entry's (`fitted`), so that a hydrogen stands as the
 * component has it however the residue is turned and bent. The entry's
 * atoms are matched to the component's by name; a hydrogen that leaves as
 * the residue bonds to another (an amino acid's H2, a sugar's HO1) is put
 * only where its atom is bonded to no other residue.
 *
 * Pure: over the entry's atoms and the component.
 */
import type { Component } from "./ccd";

type Point = { x: number; y: number; z: number };

/** The rotation, as a matrix by rows, and the two centroids that carry points `from` onto points `to` as nearly as one turn and shift can. */
export type Fit = { r: number[][]; from: Point; to: Point };

/**
 * The turn and shift that carry some points onto others as nearly as any
 * can - their squared distances' sum least: by the unit quaternion of
 * Horn's closed form ("Closed-form solution of absolute orientation using
 * unit quaternions", J. Opt. Soc. Am. A 4, 629, 1987), the eigenvector of
 * the largest eigenvalue of his 4 × 4 matrix N. One point gives a shift
 * alone; two, a turn that lines them up.
 */
export function fitted(from: readonly Point[], to: readonly Point[]): Fit {
  const mean = (ps: readonly Point[]) => {
    const n = ps.length;
    return { x: ps.reduce((s, p) => s + p.x, 0) / n, y: ps.reduce((s, p) => s + p.y, 0) / n, z: ps.reduce((s, p) => s + p.z, 0) / n };
  };
  const a = mean(from);
  const b = mean(to);
  // (the sums of products of the points' coordinates about their centroids: Horn's S)
  const S = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  from.forEach((p, k) => {
    const u = [p.x - a.x, p.y - a.y, p.z - a.z];
    const v = [to[k].x - b.x, to[k].y - b.y, to[k].z - b.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += u[i] * v[j];
  });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const [q0, qx, qy, qz] = largestEigenvector(N);
  const r = [
    [q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy)],
    [2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx)],
    [2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz],
  ];
  return { r, from: a, to: b };
}

/** A point carried by a fit. */
export function carried(fit: Fit, p: Point): Point {
  const u = [p.x - fit.from.x, p.y - fit.from.y, p.z - fit.from.z];
  const [x, y, z] = fit.r.map((row) => row[0] * u[0] + row[1] * u[1] + row[2] * u[2]);
  return { x: x + fit.to.x, y: y + fit.to.y, z: z + fit.to.z };
}

/** The unit eigenvector of a symmetric 4 × 4 matrix's largest eigenvalue, by Jacobi's rotations; for a matrix of zeros (one point), no turn. */
function largestEigenvector(m: readonly number[][]): number[] {
  const a = m.map((row) => [...row]);
  const v = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j): number => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p++)
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  const e = v.map((row) => row[best]);
  const n = Math.hypot(...e);
  // (all of N nought - one point, or none: the identity, a quaternion of 1)
  return n > 0 && m.some((row) => row.some((x) => x !== 0)) ? e.map((x) => x / n) : [1, 0, 0, 0];
}

/** Whether points - each known - are three or more not in a line: enough to fix a turn. */
function spans(ps: readonly (Point | undefined)[]): boolean {
  if (ps.length < 3 || ps.some((p) => !p)) return false;
  const [a, b] = ps as Point[];
  const u = [b.x - a.x, b.y - a.y, b.z - a.z];
  return (ps as Point[]).slice(2).some((c) => {
    const v = [c.x - a.x, c.y - a.y, c.z - a.z];
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-3 * Math.hypot(...u) * Math.hypot(...v);
  });
}

/** An atom of the entry's residue: its name, element and place. */
export type ResidueAtom = Point & { name: string; el: string };

/** A hydrogen the dictionary gives a residue: the entry's atom it is on (by its place among `atoms`), its name, and where it stands. */
export type GivenHydrogen = Point & { on: number; name: string };

/**
 * The hydrogens a component gives an entry's residue (`atoms`, matched to
 * its own by name), each where the component's shape puts it: the
 * component's atom it is on and its neighbours - and theirs, where those
 * are not yet three not in a line - fitted onto the entry's. `linked` says
 * which of the residue's atoms are bonded to another residue, and where
 * the atoms they are bonded to are: each such bond takes the place of a
 * hydrogen of its atom - a leaving one first, then the one nearest the
 * atom it is bonded to - unless it takes that of an atom that left (a
 * peptide's carbon, its OXT gone). Or why none can be: an atom of the
 * component, not one that leaves, missing from the entry - the residue is
 * not whole, and is not made so - or the component giving no shape.
 */
export function hydrogensFromComponent(atoms: readonly ResidueAtom[], linked: ReadonlyMap<number, readonly Point[]>, component: Component): GivenHydrogen[] | { why: string } {
  const byName = new Map(atoms.map((a, i) => [a.name, i]));
  const heavy = component.atoms.filter((a) => a.element !== "H");
  const missing = heavy.filter((a) => !a.leaving && !byName.has(a.name)).map((a) => a.name);
  if (missing.length) return { why: `${missing.join(", ")} of ${component.id} ${missing.length === 1 ? "is" : "are"} not in the entry, so its hydrogens cannot all be given.` };
  const near = new Map<string, string[]>();
  for (const b of component.bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const of = new Map(component.atoms.map((a) => [a.name, a]));
  const given: (GivenHydrogen & { leaving: boolean })[] = [];
  for (const h of component.atoms) {
    if (h.element !== "H") continue;
    const parent = (near.get(h.name) ?? []).find((n) => of.get(n)?.element !== "H");
    if (!parent) continue;
    const on = byName.get(parent);
    // (on an atom that left: not there)
    if (on == null) continue;
    // (the atom it is on, and its heavy neighbours there, then theirs - shell by shell, the nearest that make three not in a line)
    const points = [parent];
    for (let ring = [parent]; !spans(points.map((p) => of.get(p)!.at)) && ring.length; ) {
      const next = ring.flatMap((p) => (near.get(p) ?? []).filter((n) => of.get(n)?.element !== "H" && byName.has(n) && !points.includes(n)));
      for (const n of next) if (!points.includes(n)) points.push(n);
      ring = next;
    }
    if (!h.at || points.some((p) => !of.get(p)!.at)) return { why: `The CCD gives no shape for ${component.id}, so its hydrogens cannot be placed.` };
    const fit = fitted(
      points.map((p) => of.get(p)!.at!),
      points.map((p) => atoms[byName.get(p)!]),
    );
    given.push({ on, name: h.name, leaving: !!h.leaving, ...carried(fit, h.at) });
  }
  // (each bond to another residue in place of a hydrogen of its atom - but those in place of an atom that left)
  const gone = new Set<GivenHydrogen>();
  for (const [on, to] of linked) {
    const left = (near.get(atoms[on].name) ?? []).filter((n) => of.get(n)?.element !== "H" && of.get(n)?.leaving && !byName.has(n)).length;
    const its = given.filter((h) => h.on === on);
    const far = (h: Point) => Math.min(...to.map((p) => Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z)));
    its.sort((p, q) => Number(q.leaving) - Number(p.leaving) || far(p) - far(q));
    its.slice(0, Math.max(0, to.length - left)).forEach((h) => gone.add(h));
  }
  return given.filter((h) => !gone.has(h)).map(({ leaving: _, ...h }) => h);
}
