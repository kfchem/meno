/**
 * Configuration read from atoms' places in space, written once (foundation part 14 D): a centre's sense, a double bond's side, an
 * allene's axis and an odd cumulene's cis or trans, each from where its atoms are, by the geometry of part 4 (./geometry: `signedVolume`,
 * `sideOfLine`, `torsionSense`). Every reader of a configuration from places goes by these, so that two of them cannot read one molecule
 * two ways.
 *
 * **The tolerances** stay what each reader had, each named where it is used (./geometry's table; `FLAT_ALLENE` here): a move, no answer
 * changes. Which atoms and bonds can carry a configuration is each caller's, as today (its candidates passed in).
 */
import { EXACT, FLAT_VOLUME_3D, sideOfLine, signedVolume, torsionSense, volumeSign } from "./geometry";
import { runsOf } from "./runs";
import type { IsomerConfiguration } from "./configuration";
import type { Axial, Cumulated } from "./types";

/** A place in 3D, in ångströms. */
export type Place = readonly [number, number, number];

/** A place as these read it: three numbers, x, y, z. */
type V3 = readonly number[];

/**
 * A centre's sense from places: the sign of the volume its first three neighbours, in the order given, span seen from it (the
 * `Tetrahedral` reading) - 0 where its size is at or under `tolerance` (./geometry's table names each reader's: `EXACT` for the page's
 * mirror and the 3D editor, `HANDED` for settling a molecule's places).
 */
export function senseAt(centre: V3, neighbours: readonly V3[], tolerance = EXACT): 1 | -1 | 0 {
  return volumeSign(neighbours[0], neighbours[1], neighbours[2], centre, tolerance);
}

/**
 * A double bond's side from places: whether `p`, on its end `a`, and `q`, on its end `b`, stand on one side of its line (cis, true) or
 * on opposite sides (trans, false) - none where either lies on it.
 */
export function cisAt(a: V3, b: V3, p: V3, q: V3): boolean | null {
  const side = sideOfLine(a, b, p, q);
  return side > 0 ? true : side < 0 ? false : null;
}

/**
 * Which way a torsion a-b-c-d turns, by the dot product of its two planes' normals, (b-a) x (c-b) and (c-b) x (d-c): positive where `a`
 * and `d` stand on one side (the torsion under 90 degrees either way), negative where on opposite sides, 0 where either plane is none.
 * The same number, worked out in the same order, as Compare bonding's and the reference numbering's readings of a double bond have it.
 */
export function torsionSide(a: V3, b: V3, c: V3, d: V3): number {
  const b1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const b2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const b3 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
  const cross = (u: readonly number[], v: readonly number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const [m, n] = [cross(b1, b2), cross(b2, b3)];
  return m[0] * n[0] + m[1] * n[1] + m[2] * n[2];
}

/** A bond as these read it: its atoms and order. */
type PlacedBond = { a: number; b: number; order: number };

/**
 * The configurations open stereocentres and double bonds have in places
 * made before (a molecule in 3D made from the same drawing: the page's
 * `like`), to be made so again: a centre's by its neighbours in the order
 * of its bonds and the sign of the volume the first three span seen from it
 * (the `Tetrahedral` reading, an implicit H the fourth); a double bond's by
 * an atom bonded to each end, the first other than the other end, and
 * whether the two are on the same side. Only where the atom, or the bond's
 * two, and every atom bonded to them have a place; none where the places
 * are flat (a volume, or a side, under `FLAT_VOLUME_3D`).
 */
export function configuredFrom(
  bonds: readonly PlacedBond[],
  places: Readonly<Record<number, Place>>,
  openAtoms: readonly number[],
  openBonds: readonly number[],
): IsomerConfiguration {
  const around = new Map<number, number[]>();
  for (const b of bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
  }
  const placed = (x: number) => x in places && (around.get(x) ?? []).every((n) => n in places);
  const centres = openAtoms.flatMap((c) => {
    const ns = around.get(c) ?? [];
    if (ns.length < 3 || !placed(c)) return [];
    const volume = signedVolume(places[ns[0]], places[ns[1]], places[ns[2]], places[c]);
    return Math.abs(volume) < FLAT_VOLUME_3D ? [] : [{ atom: c, neighbours: ns, sense: (volume > 0 ? 1 : -1) as 1 | -1 }];
  });
  const doubles = openBonds.flatMap((i) => {
    const { a, b } = bonds[i];
    if (!placed(a) || !placed(b)) return [];
    const na = (around.get(a) ?? []).find((n) => n !== b);
    const nb = (around.get(b) ?? []).find((n) => n !== a);
    if (na == null || nb == null) return [];
    const side = sideOfLine(places[a], places[b], places[na], places[nb]);
    return Math.abs(side) < FLAT_VOLUME_3D ? [] : [{ bond: i, ends: [na, nb] as [number, number], cis: side > 0 }];
  });
  return { centres, doubles };
}

/**
 * How near flat an allene in 3D is taken to have no hand: its two ends' groups turned about the run by less than this sine of the angle
 * from one plane - within a sixth of a half turn of none or of half a turn - as an odd run turned within the same of a quarter turn has no
 * cis or trans (`runsFrom3d`). The hand changes where the two ends' planes are one, so there the sign of a torsion is noise; an open-chain
 * allene is square, and an allene bent and twisted by a small ring stays well clear of the bound, while a geometry this near flat lies far
 * up the allene's own barrier to turning into its mirror image: what is found there is a bad geometry, not either hand.
 */
export const FLAT_ALLENE = 0.5;

/**
 * Each run of cumulated double bonds whose ends have two other neighbours
 * each, read from the places: an allene's axis (an even number of double
 * bonds) by the sign of the torsion from a group at one end to one at the
 * other, an odd cumulene's cis or trans by whether those two stand on one
 * side of the run; none where they are in line, or square (flat or
 * twisted half way, as no such run is). Each with the first double bond of
 * its run, to be shown on. A biaryl's axis is not read: every biaryl is
 * twisted in 3D, whether or not its turn is held.
 */
export function runsFrom3d(
  around: readonly number[][],
  bonds: readonly { a1: number; a2: number; order: number }[],
  places: Readonly<Record<number, Place>>,
): { axes: Axial[]; cumulated: Cumulated[]; shownOn: { axes: number[]; cumulated: number[] } } {
  const orderOf = new Map(bonds.map((b, i) => [b.a1 < b.a2 ? `${b.a1},${b.a2}` : `${b.a2},${b.a1}`, i]));
  const bondOf = (a: number, b: number) => orderOf.get(a < b ? `${a},${b}` : `${b},${a}`);
  const order = (a: number, b: number) => bonds[bondOf(a, b) ?? -1]?.order ?? 0;
  // (its runs of cumulated double bonds: ./runs - here any atom bonded by its two double bonds alone, its places saying whether it is
  //  in line)
  const runs = runsOf({ atoms: around.map(() => ({})), bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) }, "bondedByTwo");
  const { middle } = runs;
  const out = { axes: [] as Axial[], cumulated: [] as Cumulated[], shownOn: { axes: [] as number[], cumulated: [] as number[] } };
  around.forEach((_, i) => {
    if (middle(i)) return;
    for (const m of around[i]) {
      if (order(i, m) !== 2 || !middle(m)) continue;
      const run = runs.from(i, m);
      const j = run[run.length - 1];
      if (j < i) continue;
      const near = around[i].filter((n) => n !== run[1]);
      const far = around[j].filter((n) => n !== run[run.length - 2]);
      if (near.length !== 2 || far.length !== 2) continue;
      const [p, q] = [Math.min(...near), Math.min(...far)];
      if ([p, i, j, q].some((x) => !places[x])) continue;
      const [P, I, J, Q] = [places[p], places[i], places[j], places[q]];
      const first = bondOf(i, m)!;
      // (each end's group off the run's line)
      const axis = [J[0] - I[0], J[1] - I[1], J[2] - I[2]];
      const off = (X: Place, from: Place) => {
        const v = [X[0] - from[0], X[1] - from[1], X[2] - from[2]];
        const t = (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / (axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1);
        return [v[0] - t * axis[0], v[1] - t * axis[1], v[2] - t * axis[2]];
      };
      const [u, w] = [off(P, I), off(Q, J)];
      const dot = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
      if (run.length % 2 === 1) {
        // (an allene's ends' planes one plane - its groups' turn about the run near none or half a turn: no hand, as an odd run
        //  twisted near a quarter turn has no cis or trans)
        const cross = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
        const sense = cross < FLAT_ALLENE * Math.hypot(...u) * Math.hypot(...w) ? 0 : torsionSense(P, I, J, Q);
        if (sense) {
          out.axes.push({ atoms: [i, j], refs: [p, q], sense });
          out.shownOn.axes.push(first);
        }
        continue;
      }
      // (the two groups on the same side of the run: cis)
      if (Math.abs(dot) < 0.5 * Math.hypot(...u) * Math.hypot(...w)) continue;
      out.cumulated.push({ atoms: [i, j], refs: [p, q], cis: dot > 0 });
      out.shownOn.cumulated.push(first);
    }
  });
  return out;
}
