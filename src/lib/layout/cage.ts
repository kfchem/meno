/**
 * A cage - a ring system whose rings are all bridged, or a polyhedron:
 * norbornane, quinuclidine, adamantane, cubane - drawn the way it is always
 * drawn: in perspective, as the solid it is.
 *
 * The solid is found from the bonds: each atom's bonds at the angles its
 * bonding gives - tetrahedral, flat at 120 degrees beside a double bond,
 * straight through a triple one, a small ring's own - so that atoms a bond
 * apart are 1 apart and two bonds apart as far as that angle puts them; a
 * double bond's atoms and all their neighbours in one plane; atoms further
 * apart further, placed in three dimensions to fit those distances as well
 * as they can (classical scaling, then stress majorisation), and eased
 * with every stereocentre held the way round it is given (`embed`). Then
 * it is drawn the way a chemist draws it:
 * one of its six-membered rings as the chair or boat it is, by the
 * textbook's template, and the rest of the cage built on that (`textbook`).
 * A cage with no six-membered ring is looked at from many directions
 * instead, and the view kept is the one in which no atom hides another or
 * sits on a bond, the fewest bonds cross, and the bonds come out most
 * nearly one length.
 */
import { centroid, segmentsCross, splitOutside, type Point } from "./geometry";
import { ringShape } from "./conformation";
import { isMetal, orderOf, type Molecule, type RingSystem } from "./perceive";
import { byStructure } from "./ranks";
import { ringsAlike } from "./rings";

export type Vec3 = [number, number, number];

/** Graph distances between the system's atoms, through its own bonds. */
function hops(mol: Molecule, atoms: number[]): number[][] {
  const index = new Map(atoms.map((a, i) => [a, i]));
  return atoms.map((s) => {
    const d = new Array<number>(atoms.length).fill(Infinity);
    d[index.get(s)!] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of mol.neighbours[u]) {
        const j = index.get(v);
        if (j == null || d[j] !== Infinity) continue;
        d[j] = d[index.get(u)!] + 1;
        q.push(v);
      }
    }
    return d;
  });
}

/** The distance two atoms `k` bonds apart keep in a cage. */
const span = (k: number) => (k === 0 ? 0 : k === 1 ? 1 : k === 2 ? 1.63 : 1.63 + 0.8 * (k - 2));

/** Three dimensions that fit the distances `D` best, by classical scaling. */
function classical(D: number[][]): Vec3[] {
  const n = D.length;
  const sq = D.map((row) => row.map((v) => v * v));
  const rowMean = sq.map((row) => row.reduce((s, v) => s + v, 0) / n);
  const all = rowMean.reduce((s, v) => s + v, 0) / n;
  const B = sq.map((row, i) => row.map((v, j) => -0.5 * (v - rowMean[i] - rowMean[j] + all)));
  const out: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);
  const found: number[][] = [];
  for (let k = 0; k < 3; k++) {
    // the next eigenvector by power iteration, the earlier ones taken out
    let v = Array.from({ length: n }, (_, i) => Math.sin(1 + i * (k + 1.7)));
    let value = 0;
    for (let it = 0; it < 200; it++) {
      let w = B.map((row) => row.reduce((s, b, j) => s + b * v[j], 0));
      for (const f of found) {
        const d = w.reduce((s, x, i) => s + x * f[i], 0);
        w = w.map((x, i) => x - d * f[i]);
      }
      const norm = Math.hypot(...w) || 1;
      value = norm;
      v = w.map((x) => x / norm);
    }
    found.push(v);
    const scale = Math.sqrt(Math.max(value, 0));
    v.forEach((x, i) => (out[i][k] = x * scale));
  }
  return out;
}

/** Stress majorisation: moves the points to fit `D`, weighting near pairs most. */
function majorise(X: Vec3[], D: number[][]): Vec3[] {
  const n = X.length;
  let P = X.map((p) => [...p] as Vec3);
  for (let it = 0; it < 300; it++) {
    const next: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const acc: Vec3 = [0, 0, 0];
      let wsum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = 1 / (D[i][j] * D[i][j]);
        const dx = P[i][0] - P[j][0];
        const dy = P[i][1] - P[j][1];
        const dz = P[i][2] - P[j][2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const f = D[i][j] / d;
        acc[0] += w * (P[j][0] + f * dx);
        acc[1] += w * (P[j][1] + f * dy);
        acc[2] += w * (P[j][2] + f * dz);
        wsum += w;
      }
      next.push([acc[0] / wsum, acc[1] / wsum, acc[2] / wsum]);
    }
    P = next;
  }
  return P;
}

/**
 * The distances a solid keeps between its atoms (`embed`): each pair's own
 * where its bonds fix one - a bond's, the angle's across two bonds, across
 * a double bond to a neighbour on each side - with how hard it is held;
 * otherwise the least it may come to.
 */
type Targets = {
  d: (number | null)[][];
  w: number[][];
  least: number[][];
  /** The atoms that lie in one plane: each double bond's two and those bonded to them. */
  planes: number[][];
};

/**
 * The solid as it really is: the distances its bonds fix, and nothing else
 * nearer than it may come - eased in from the rough placement until those
 * hold.
 */
function settle(X: Vec3[], T: Targets, hold: readonly Held[] = []): Vec3[] {
  const n = X.length;
  const P = X.map((p) => [...p] as Vec3);
  const pull = (i: number, j: number, target: number, k: number, onlyApart: boolean) => {
    const d: Vec3 = [P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]];
    const l = Math.hypot(...d) || 1e-9;
    if (onlyApart && l >= target) return;
    const f = ((l - target) / l) * 0.5 * k;
    for (let c = 0; c < 3; c++) {
      P[i][c] += d[c] * f;
      P[j][c] -= d[c] * f;
    }
  };
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = T.d[i][j];
        if (d != null) pull(i, j, d, T.w[i][j], false);
        else pull(i, j, T.least[i][j], 0.3, true);
      }
    }
    // (a double bond's atoms and their neighbours drawn into their plane)
    for (const group of T.planes) {
      const c: Vec3 = [0, 1, 2].map((k) => group.reduce((sum, g) => sum + P[g][k], 0) / group.length) as Vec3;
      const nrm = leastAxis(group.map((g) => subV(P[g], c)));
      for (const g of group) {
        const k = 0.5 * dotV(subV(P[g], c), nrm);
        P[g] = [P[g][0] - k * nrm[0], P[g][1] - k * nrm[1], P[g][2] - k * nrm[2]];
      }
    }
    // (a centre held the way round it is given, put back through the plane
    // of its three neighbours whenever the easing turns it)
    for (const { c, three, sign } of hold) {
      const [a, b, d] = three.map((k) => P[k]);
      const v = [a, b, d].map((q) => subV(q, P[c]));
      if (Math.sign(dotV(v[0], crossV(v[1], v[2]))) === sign) continue;
      const nrm = normalise(crossV(subV(b, a), subV(d, a)));
      const k = 2 * dotV(subV(P[c], a), nrm);
      P[c] = [P[c][0] - k * nrm[0], P[c][1] - k * nrm[1], P[c][2] - k * nrm[2]];
    }
  }
  return P;
}

/** The direction points about their middle spread least along: the normal of the plane that fits them best. */
function leastAxis(us: readonly Vec3[]): Vec3 {
  const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => us.reduce((sum, u) => sum + u[i] * u[j], 0)));
  const s = C[0][0] + C[1][1] + C[2][2] + 1e-9;
  // (power iteration on s - C, whose largest is C's least)
  let v: Vec3 = [0.577, 0.578, 0.576];
  for (let it = 0; it < 40; it++) {
    const w: Vec3 = [0, 1, 2].map((i) => s * v[i] - (C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2])) as Vec3;
    v = normalise(w);
  }
  return v;
}

/**
 * A stereocentre's configuration with its neighbours in the order the
 * structure gives (`byStructure`), an H last, and its volume turned with
 * them: which three of them a solid is checked and held by is then the
 * same in any order of the atoms.
 */
function orderedCentre(mol: Molecule, c: number): { neighbours: number[]; volume: number } | undefined {
  const t = mol.tetra.get(c);
  if (!t) return undefined;
  const same = byStructure(mol);
  const at = t.neighbours.map((_, k) => k).sort((p, q) => {
    const [a, b] = [t.neighbours[p], t.neighbours[q]];
    return a < 0 || b < 0 ? (a < 0 ? 1 : 0) - (b < 0 ? 1 : 0) : same(a, b);
  });
  let sign = 1;
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (at[i] > at[j]) sign = -sign;
  return { neighbours: at.map((k) => t.neighbours[k]), volume: t.volume * sign };
}

/** A stereocentre held the way round it is given while a solid is eased: its index, three neighbours' and the sign of the volume they span from it. */
type Held = { c: number; three: [number, number, number]; sign: number };

/**
 * How badly a flat view reads: atoms hidden or on bonds, bonds crossing,
 * bonds uneven. `near` and `onBond` are how close an atom may come to
 * another and to a bond, in bonds: a textbook drawing of a cage allows a
 * little less room than a view found by searching (the second bridge of
 * bicyclo[2.2.2]octane passes close by the back bridgehead).
 */
function viewCost(
  pts: Point[],
  bonds: [number, number][],
  near = 0.6,
  onBond = 0.3,
  depth?: readonly number[],
  /** Only its faults: atoms on atoms or on bonds, a bond far too short, bonds crossing with neither behind - not its bonds uneven, nor one passing behind another. */
  faultsOnly = false,
): number {
  const lens = bonds.map(([a, b]) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
  const spread = Math.sqrt(lens.reduce((s, v) => s + (v - mean) ** 2, 0) / lens.length) / mean;
  let cost = faultsOnly ? 0 : 20 * spread;
  for (const l of lens) if (l / mean < 0.55) cost += 5;
  const bonded = new Set(bonds.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (bonded.has(`${i},${j}`)) continue;
      // (one in front of the other may come a little nearer)
      const apart = depth && Math.abs(depth[i] - depth[j]) > 0.25;
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / mean < (apart ? Math.min(near, 0.45) : near)) cost += 10;
    }
    for (const [a, b] of bonds) {
      if (a === i || b === i) continue;
      const vx = pts[b].x - pts[a].x;
      const vy = pts[b].y - pts[a].y;
      const l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((pts[i].x - pts[a].x) * vx + (pts[i].y - pts[a].y) * vy) / l2)) : 0;
      const d = Math.hypot(pts[i].x - (pts[a].x + t * vx), pts[i].y - (pts[a].y + t * vy));
      if (d / mean < onBond) cost += 5;
    }
  }
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      const [a, b] = bonds[i];
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      // a bond passing behind another is drawn broken there, which reads
      // - the better where the drawing says which is in front
      const apart = depth && Math.abs((depth[a] + depth[b]) / 2 - (depth[c] + depth[d]) / 2) > 0.25;
      if (segmentsCross(pts[a], pts[b], pts[c], pts[d])) cost += apart ? (faultsOnly ? 0 : 0.3) : 1;
    }
  }
  return cost;
}

/**
 * The cage seen from its best side, in the ring system's atoms, bonds
 * scaled to about 1; and how well that view reads (lower better).
 */
export type CageView = {
  pos: Map<number, Point>;
  /**
   * Where each bond out of the cage points, as seen: the neighbour's place
   * at a bond's length, in the same frame - the solid's own tetrahedral
   * directions, the stereocentres' as their configuration puts them.
   */
  hints: Map<number, Map<number, Point>>;
  /** How near each atom is to the viewer: a bond passing behind another is broken there. */
  depth: Map<number, number>;
  cost: number;
  /**
   * The same cage seen from its other side - still from above, the back
   * of its ring still at the top - for a frame set down mirrored: a cage
   * is never mirrored itself, which would show the other enantiomer, nor
   * turned round with its depth, which would show it from below.
   */
  other?: Omit<CageView, "other">;
  /** As good as the best view by the system's own measure: chosen among with no margin, by what hangs from it. */
  tied?: true;
};

/**
 * The bridged bicycle's own view, the way it is always drawn - norbornane,
 * camphor, tropane, quinuclidine: the two bridgeheads level, the shortest
 * bridge on top, the other two in front and behind, seen from a little
 * above and a little to one side. Null if the system is not a bicycle.
 */
function bicycleAxes(mol: Molecule, sys: RingSystem, X: Vec3[], index: Map<number, number>) {
  if (sys.rings.length !== 2) return null;
  const [r1, r2] = sys.rings.map((i) => mol.rings[i]);
  const shared = r1.filter((a) => r2.includes(a));
  if (shared.length < 3) return null;
  // (its ends, and bridges as long, in the order the structure gives)
  const same = byStructure(mol);
  const ends = shared.filter((a) => mol.neighbours[a].filter((b) => shared.includes(b)).length === 1).sort(same);
  if (ends.length !== 2) return null;
  const first = (b: number[]) => [...b].sort(same)[0];
  const bridges = [
    shared.filter((a) => !ends.includes(a)),
    r1.filter((a) => !shared.includes(a)),
    r2.filter((a) => !shared.includes(a)),
  ].sort((p, q) => p.length - q.length || same(first(p), first(q)));
  const at = (a: number) => X[index.get(a)!];
  const b1 = at(ends[0]);
  const b2 = at(ends[1]);
  const mid: Vec3 = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2, (b1[2] + b2[2]) / 2];
  const e1 = normalise([b2[0] - b1[0], b2[1] - b1[1], b2[2] - b1[2]]);
  const top = bridges[0].map(at);
  const c: Vec3 = [0, 1, 2].map((k) => top.reduce((sum, p) => sum + p[k], 0) / top.length - mid[k]) as Vec3;
  const along = dotV(c, e1);
  const e3 = normalise([c[0] - along * e1[0], c[1] - along * e1[1], c[2] - along * e1[2]]);
  const e2 = crossV(e3, e1);
  return { e1, e2, e3 };
}

/** The view along `toViewer`, the screen's up as near `up` as it can be. */
function look(
  X: Vec3[],
  toViewer: Vec3,
  up: Vec3,
): { pts: Point[]; depth: number[]; toViewer: Vec3; up: Vec3 } {
  const k = dotV(up, toViewer);
  const sy = normalise([up[0] - k * toViewer[0], up[1] - k * toViewer[1], up[2] - k * toViewer[2]]);
  const sx = crossV(sy, toViewer);
  return {
    pts: X.map((p) => ({ x: dotV(p, sx), y: dotV(p, sy) })),
    depth: X.map((p) => dotV(p, toViewer)),
    toViewer,
    up: sy,
  };
}

/**
 * The angle an atom's bonds keep, by how it bonds: straight through a
 * triple bond or two double ones; 120 degrees with a double bond, or
 * beside one with a lone pair to share - an amide's or a guanidine's N,
 * an ester's O; tetrahedral otherwise.
 */
function bondAngle(mol: Molecule, a: number): number {
  const orders = mol.neighbours[a].map((b) => orderOf(mol, a, b));
  if (orders.includes(3) || orders.filter((o) => o === 2).length >= 2) return Math.PI;
  if (orders.includes(2)) return (2 * Math.PI) / 3;
  const lonePair = (mol.el[a] === "N" || mol.el[a] === "O") && mol.neighbours[a].length <= 3;
  if (lonePair && mol.neighbours[a].some((b) => mol.neighbours[b].some((c) => orderOf(mol, b, c) === 2))) return (2 * Math.PI) / 3;
  return Math.acos(-1 / 3);
}

/**
 * The angle between bonds `a`-`j` and `a`-`k`: a three-, four- or
 * five-membered ring's own where the two run round one (60, 90, and 108
 * flat or 104 puckered); otherwise the atom's, and where a flat atom has
 * a small ring's angle among its three, the rest of the turn shared by
 * its other two.
 */
function angleAt(mol: Molecule, a: number, j: number, k: number, inside: (v: number) => boolean): number {
  const small = (p: number, q: number) => {
    let n = Infinity;
    for (const r of mol.ringsOf[a]) {
      const ring = mol.rings[r];
      const i = ring.indexOf(a);
      const m = ring.length;
      const nb = [ring[(i + 1) % m], ring[(i - 1 + m) % m]];
      if (nb.includes(p) && nb.includes(q)) n = Math.min(n, m);
    }
    return n;
  };
  const own = bondAngle(mol, a);
  const flat = Math.abs(own - (2 * Math.PI) / 3) < 1e-6;
  const ringAngle = (n: number) => (n === 3 ? Math.PI / 3 : n === 4 ? Math.PI / 2 : n === 5 ? ((flat ? 108 : 104) * Math.PI) / 180 : null);
  const here = ringAngle(small(j, k));
  if (here != null) return here;
  const near = mol.neighbours[a].filter(inside);
  if (!flat || near.length !== 3) return own;
  const third = near.find((v) => v !== j && v !== k)!;
  const fixed = [ringAngle(small(j, third)), ringAngle(small(k, third))].filter((t): t is number => t != null);
  if (fixed.length !== 1) return own;
  return (2 * Math.PI - fixed[0]) / 2;
}

/** How near two atoms either side of a bond between tetrahedral atoms may come: 50 degrees round from eclipsed (1.67 apart; gauche, at 60, 1.92). */
const STAGGERED = 1.85;

/** The distances a ring system's bonds fix between its atoms, and the least the rest may come to (`Targets`). */
function targetsOf(mol: Molecule, atoms: readonly number[], index: Map<number, number>, hop: number[][]): Targets {
  const n = atoms.length;
  const d: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  const w: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const least: number[][] = hop.map((row) => row.map((h) => (h <= 2 ? 0 : h === 3 ? 1.6 : 1.7)));
  const inside = (v: number) => index.has(v);
  const set = (i: number, j: number, v: number, k: number) => {
    d[i][j] = d[j][i] = v;
    w[i][j] = w[j][i] = k;
  };
  atoms.forEach((a, i) => {
    const near = mol.neighbours[a].filter(inside);
    for (const b of near) set(i, index.get(b)!, 1, 1);
    for (let p = 0; p < near.length; p++)
      for (let q = p + 1; q < near.length; q++) {
        const [j, k] = [index.get(near[p])!, index.get(near[q])!];
        if (hop[j][k] !== 2) continue;
        set(j, k, 2 * Math.sin(angleAt(mol, a, near[p], near[q], inside) / 2), 0.6);
      }
  });
  // across a bond between two tetrahedral atoms, the atoms either side
  // staggered, not eclipsed - a ring a chair rather than a boat where it
  // can be: at least as far apart as 50 degrees round puts them
  const tetrahedral = (v: number) => Math.abs(bondAngle(mol, v) - Math.acos(-1 / 3)) < 1e-6;
  for (const bond of mol.bonds) {
    const [a, b] = [bond.a, bond.b];
    if (bond.order !== 1 || !inside(a) || !inside(b) || !tetrahedral(a) || !tetrahedral(b)) continue;
    for (const x of mol.neighbours[a])
      for (const y of mol.neighbours[b]) {
        if (x === b || y === a || x === y || !inside(x) || !inside(y)) continue;
        const [i, j] = [index.get(x)!, index.get(y)!];
        if (hop[i][j] === 3) least[i][j] = least[j][i] = Math.max(least[i][j], STAGGERED);
      }
  }
  // a double bond flat: its atoms and those bonded to them in one plane,
  // each neighbour of one end a cis or trans distance from each of the
  // other's - cis where a ring runs through all four
  const planes: number[][] = [];
  for (const bond of mol.bonds) {
    if (bond.order !== 2 || !inside(bond.a) || !inside(bond.b)) continue;
    const [a, b] = [bond.a, bond.b];
    const group = [...new Set([a, b, ...mol.neighbours[a], ...mol.neighbours[b]])]
      .filter(inside)
      .map((v) => index.get(v)!)
      .sort((p, q) => p - q);
    if (group.length >= 4) planes.push(group);
    for (const x of mol.neighbours[a]) {
      if (x === b || !inside(x)) continue;
      for (const y of mol.neighbours[b]) {
        if (y === a || y === x || !inside(y)) continue;
        const cis = mol.rings.some((r) => {
          if (r.length > 8 || ![x, a, b, y].every((v) => r.includes(v))) return false;
          const m = r.length;
          const at = (v: number) => r.indexOf(v);
          const next = (u: number, v: number) => Math.abs(at(u) - at(v)) === 1 || Math.abs(at(u) - at(v)) === m - 1;
          return next(x, a) && next(b, y);
        });
        const ta = angleAt(mol, a, x, b, inside);
        const tb = angleAt(mol, b, y, a, inside);
        const px = { x: Math.cos(ta), y: Math.sin(ta) };
        const py = { x: 1 - Math.cos(tb), y: (cis ? 1 : -1) * Math.sin(tb) };
        const [i, j] = [index.get(x)!, index.get(y)!];
        if (hop[i][j] === 3) set(i, j, Math.hypot(px.x - py.x, px.y - py.y), 0.4);
      }
    }
  }
  // (drawn into their planes one after another in the order of their
  // atoms, not of the bonds)
  planes.sort((p, q) => {
    for (let k = 0; k < Math.min(p.length, q.length); k++) if (p[k] !== q[k]) return p[k] - q[k];
    return p.length - q.length;
  });
  return { d, w, least, planes };
}

/**
 * A ring system's solid: placed roughly by its distances (classical
 * scaling, stress majorisation), taken the way round its stereocentres
 * say rather than as its mirror image, each centre the wrong way put
 * through the plane of its three neighbours (`rightCentres`), and eased -
 * all with its atoms in the order the structure gives, so the same solid
 * comes out in any order of the atoms.
 */
function embed(mol: Molecule, atoms: number[]): Vec3[] {
  // (found once for a ring system: it is asked for again and again - and
  // by what it is found from, not by the molecule object, since a drawing
  // read back is perceived anew, its cage the same: tetrodotoxin's solid
  // found anew for each of its read-backs was half its Clean-up)
  const key = `${contentOf(mol)}|${[...atoms].sort((p, q) => p - q).join(",")}`;
  let solid = solids.get(key);
  if (!solid) {
    // (found with the atoms in the order the structure gives - its scatter
    // starts and its easing go atom by atom - and handed back in the
    // caller's: the same solid whatever order the atoms come in)
    const canon = [...atoms].sort(byStructure(mol));
    const found = embedAnew(mol, canon, new Map(canon.map((a, i) => [a, i])));
    solid = new Map(canon.map((a, i) => [a, found[i]]));
    solids.set(key, solid);
    if (solids.size > KEPT_SOLIDS) solids.delete(solids.keys().next().value!);
  }
  return atoms.map((a) => solid.get(a)!);
}

/** The solids found so far, by what each is found from (`contentOf`) and its system's atoms; the oldest let go first. */
const solids = new Map<string, Map<number, Vec3>>();

/** How many solids are kept (`solids`). */
const KEPT_SOLIDS = 64;

/** Everything a solid is found from, as a key: each atom's element, each bond and its order, each centre's configuration. */
function contentOf(mol: Molecule): string {
  let content = contents.get(mol);
  if (content == null) {
    const bond = (b: Molecule["bonds"][number]) => `${b.a}-${b.b}:${b.order}${b.stereo ? `:${b.stereo.refs.join(".")}${b.stereo.cis ? "c" : "t"}` : ""}`;
    const centre = ([a, t]: [number, { neighbours: readonly number[]; volume: number }]) => `${a}:${t.neighbours.join(".")}:${t.volume}`;
    content = [mol.el.join(","), mol.bonds.map(bond).join(","), [...mol.tetra].map(centre).join(",")].join("|");
    contents.set(mol, content);
  }
  return content;
}

const contents = new WeakMap<Molecule, string>();

function embedAnew(mol: Molecule, atoms: number[], index: Map<number, number>): Vec3[] {
  const hop = hops(mol, atoms);
  const T = targetsOf(mol, atoms, index, hop);
  const D = hop.map((row, i) => row.map((h, j) => T.d[i][j] ?? span(h)));
  const rough = majorise(classical(D), D);
  // (eased from the rough placement and from a few others, the atoms
  // scattered through a ball the solid's size - the rough placement lays
  // atoms far apart in the graph far apart in space, and a ring left a boat
  // from it may come out the chair it is from another - the one that keeps
  // its distances best taken)
  let best: Vec3[] = rough;
  let bestMiss = Infinity;
  const size = Math.cbrt(atoms.length);
  for (let k = 0; k < STARTS; k++) {
    const scatter = (i: number, c: number) => size * Math.sin(12.9898 * (i + 1) + 78.233 * (c + 1) + 37.719 * k) * Math.cos(4.1414 * (i + 1) * (k + 1) + c);
    let X = k ? rough.map((_, i) => [0, 1, 2].map((c) => scatter(i, c)) as Vec3) : rough;
    // the solid is found from distances, which cannot tell a shape from
    // its mirror image: the one whose stereocentres are as given is taken
    if (handedness(mol, atoms, index, X) < 0) X = X.map(([x, y, z]) => [x, y, -z] as Vec3);
    X = rightCentres(mol, atoms, index, settle(X, T, holds(mol, atoms, index)), T);
    const m = miss(X, T);
    if (m < bestMiss - 1e-9) {
      bestMiss = m;
      best = X;
    }
  }
  return best;
}

/** How many placements a solid is eased from (`embed`). */
const STARTS = 7;

/** How far a solid misses its distances: each fixed one's miss squared, as hard as it is held, and each pair nearer than it may come. */
function miss(X: Vec3[], T: Targets): number {
  let sum = 0;
  for (let i = 0; i < X.length; i++)
    for (let j = i + 1; j < X.length; j++) {
      const l = Math.hypot(X[i][0] - X[j][0], X[i][1] - X[j][1], X[i][2] - X[j][2]);
      const d = T.d[i][j];
      sum += d != null ? T.w[i][j] * (l - d) ** 2 : 0.3 * Math.max(0, T.least[i][j] - l) ** 2;
    }
  return sum;
}

/** The solid a cage system is taken to be: its atoms' places in three dimensions. */
export function solidOf(mol: Molecule, sys: RingSystem): Map<number, Vec3> {
  const X = embed(mol, sys.atoms);
  return new Map(sys.atoms.map((a, i) => [a, X[i]]));
}

/**
 * A ring system with its atoms in the order the structure gives
 * (`byStructure`): a cage's views are worked out atom by atom and bond by
 * bond, and eased in that order, so the views come out the same whatever
 * order the atoms are listed in.
 */
function inStructureOrder(mol: Molecule, sys: RingSystem): RingSystem {
  return { ...sys, atoms: [...sys.atoms].sort(byStructure(mol)) };
}

/** The bonds between atoms of `index`, by their places in it, in the order of those places. */
function bondsWithin(mol: Molecule, index: Map<number, number>): [number, number][] {
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!index.has(a) || !index.has(b)) continue;
    const [i, j] = [index.get(a)!, index.get(b)!];
    bonds.push(i < j ? [i, j] : [j, i]);
  }
  return bonds.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/**
 * The cage seen from its best side (`rank` 0) - or, a textbook view, the
 * next best (1, 2, ...), for a ring system to try with what is fused to the
 * cage: a cage the same from several sides reads best from the one that
 * leaves room for the rest. Null where there is no such view.
 */
/**
 * Every textbook view of a cage as good as its best, from either side
 * (`projectCage`'s ranks are one hand's): a cage alike from several sides
 * offers them all, to choose among by what is fused to it and hangs from
 * it. Empty where the cage is not drawn by the template.
 */
export function tiedViews(mol: Molecule, given: RingSystem): CageView[] {
  const sys = inStructureOrder(mol, given);
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds = bondsWithin(mol, index);
  const X = embed(mol, atoms);
  if (twinChairs(mol, sys, X, index, bonds)) return [];
  const tied: CageView[] = [];
  const best = textbook(mol, sys, X, index, bonds, 0, tied);
  return best && best.cost < 8 ? tied : [];
}

export function projectCage(mol: Molecule, sys: RingSystem): CageView;
export function projectCage(mol: Molecule, sys: RingSystem, rank: number): CageView | null;
export function projectCage(mol: Molecule, given: RingSystem, rank = 0): CageView | null {
  const sys = inStructureOrder(mol, given);
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds = bondsWithin(mol, index);
  const X = embed(mol, atoms);

  // a bicyclo[3.3.1] cage as 9-BBN is drawn: its two chairs stood on end
  const twin = twinChairs(mol, sys, X, index, bonds);
  if (twin) return rank ? null : twin;

  // the way it is drawn in textbooks, where it has a six-membered ring to
  // draw that on
  const drawn = textbook(mol, sys, X, index, bonds, rank);
  if (drawn && drawn.cost < 8) return drawn;
  if (rank) return null;

  let best: Point[] = [];
  let bestDepth: number[] = [];
  let bestCost = Infinity;
  let bestView: Vec3 = [0, 0, 1];
  let bestUp: Vec3 = [0, 1, 0];
  const consider = (view: { pts: Point[]; depth: number[]; toViewer: Vec3; up: Vec3 }, bias = 0) => {
    const cost = viewCost(view.pts, bonds) + bias;
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = view.pts;
      bestDepth = view.depth;
      bestView = view.toViewer;
      bestUp = view.up;
    }
  };
  // Every six-membered ring of the solid seen the way a chair or a boat is
  // always drawn: its mean plane edge on from a little above, two of its
  // opposite atoms the ends, left and right - the textbook chair, from
  // which cages (adamantane is four of them) are drawn.
  for (const r of sys.rings.map((i) => mol.rings[i]).filter((r) => r.length === 6)) {
    const P = r.map((a) => X[index.get(a)!]);
    const c: Vec3 = [0, 1, 2].map((k) => P.reduce((sum, p) => sum + p[k], 0) / 6) as Vec3;
    // the mean plane's normal, from the ring's turn
    let nrm: Vec3 = [0, 0, 0];
    for (let i = 0; i < 6; i++) {
      const u: Vec3 = [P[i][0] - c[0], P[i][1] - c[1], P[i][2] - c[2]];
      const v: Vec3 = [P[(i + 1) % 6][0] - c[0], P[(i + 1) % 6][1] - c[1], P[(i + 1) % 6][2] - c[2]];
      const w = crossV(u, v);
      nrm = [nrm[0] + w[0], nrm[1] + w[1], nrm[2] + w[2]];
    }
    nrm = normalise(nrm);
    for (let i = 0; i < 3; i++) {
      const d: Vec3 = [P[i + 3][0] - P[i][0], P[i + 3][1] - P[i][1], P[i + 3][2] - P[i][2]];
      const k = dotV(d, nrm);
      const e1 = normalise([d[0] - k * nrm[0], d[1] - k * nrm[1], d[2] - k * nrm[2]]);
      const e2 = crossV(nrm, e1);
      for (const up of [1, -1]) {
        for (const front of [1, -1]) {
          for (const elev of [15, 20, 25]) {
            const ce = Math.cos((elev * Math.PI) / 180);
            const se = Math.sin((elev * Math.PI) / 180);
            const n2: Vec3 = [nrm[0] * up, nrm[1] * up, nrm[2] * up];
            const toViewer = normalise([0, 1, 2].map((j) => ce * front * e2[j] + se * n2[j]) as Vec3);
            consider(look(X, toViewer, n2), 0.02 * Math.abs(elev - 20));
          }
        }
      }
    }
  }
  // A cage with an atom on an axis of its symmetry - adamantane's
  // bridgeheads, cubane's corners - seen along that axis, tilted a little
  // so nothing hides behind: the hexagon with a Y inside that it always is.
  if (sys.rings.length >= 3) {
    const c: Vec3 = [0, 1, 2].map((k) => X.reduce((sum, p) => sum + p[k], 0) / X.length) as Vec3;
    for (let i = 0; i < X.length; i++) {
      const axis = normalise([X[i][0] - c[0], X[i][1] - c[1], X[i][2] - c[2]]);
      const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const p1 = normalise(crossV(axis, helper));
      const p2 = crossV(axis, p1);
      for (const tilt of [8, 12, 16]) {
        for (let k = 0; k < 6; k++) {
          const t = (tilt * Math.PI) / 180;
          const phi = (k * Math.PI) / 3;
          const side: Vec3 = [0, 1, 2].map((j) => Math.cos(phi) * p1[j] + Math.sin(phi) * p2[j]) as Vec3;
          const toViewer = normalise([0, 1, 2].map((j) => Math.cos(t) * axis[j] + Math.sin(t) * side[j]) as Vec3);
          consider(look(X, toViewer, side), 0.02 * Math.abs(tilt - 12));
        }
      }
    }
  }
  // a textbook view - a chair, a boat, down an axis - that hides no atom is
  // taken as it is: that is how the cage is drawn, even where some other
  // view crosses fewer bonds
  const readable = bestCost < 10;
  const axes = bicycleAxes(mol, sys, X, index);
  if (readable) {
    // (kept)
  } else if (axes) {
    const { e1, e2, e3 } = axes;
    // (with either of its other two bridges in front)
    for (const front of [1, -1]) {
      for (const elev of [15, 20, 25, 30, 40]) {
        for (const az of [0, 10, -10, 20, -20, 30, -30]) {
          const ce = Math.cos((elev * Math.PI) / 180);
          const se = Math.sin((elev * Math.PI) / 180);
          const ca = Math.cos((az * Math.PI) / 180);
          const sa = Math.sin((az * Math.PI) / 180);
          const toViewer = normalise([0, 1, 2].map((i) => ce * (ca * front * e2[i] + sa * e1[i]) + se * e3[i]) as Vec3);
          // a little above and to the side reads best; straight on hides the back
          consider(look(X, toViewer, e3), 0.02 * Math.abs(elev - 25) + 0.01 * Math.abs(Math.abs(az) - 15));
        }
      }
    }
  } else {
    const views = 600;
    for (let k = 0; k < views; k++) {
      // directions spread evenly over the sphere
      const z = 1 - (2 * (k + 0.5)) / views;
      const r = Math.sqrt(1 - z * z);
      const t = k * Math.PI * (3 - Math.sqrt(5));
      const v: Vec3 = [r * Math.cos(t), r * Math.sin(t), z];
      const helper: Vec3 = Math.abs(v[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      consider(look(X, v, helper));
    }
  }
  const lens = bonds.map(([a, b]) => Math.hypot(best[a].x - best[b].x, best[a].y - best[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
  const pos = new Map<number, Point>();
  const depth = new Map<number, number>();
  atoms.forEach((a, i) => {
    pos.set(a, { x: best[i].x / mean, y: best[i].y / mean });
    depth.set(a, bestDepth[i] / mean);
  });
  // the bonds out, placed in the solid and seen from the same side
  const hints = new Map<number, Map<number, Point>>();
  const toViewer = bestView;
  const sy = bestUp;
  const sx = crossV(sy, toViewer);
  atoms.forEach((a, i) => {
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    if (!out.length) return;
    const dirs = outward(mol, a, i, X, index, out);
    const m = new Map<number, Point>();
    out.forEach((b, k) => {
      const d = dirs[k];
      const flat = { x: dotV(d, sx), y: dotV(d, sy) };
      const l = Math.hypot(flat.x, flat.y) || 1;
      // seen end on, a bond still shows at half its length
      const shown = Math.max(0.5, l);
      m.set(b, {
        x: pos.get(a)!.x + (flat.x / l) * shown,
        y: pos.get(a)!.y + (flat.y / l) * shown,
      });
    });
    hints.set(a, m);
  });
  return { pos, depth, hints, cost: bestCost };
}

/**
 * A six-membered ring drawn in perspective, the way a chair or a boat is
 * always drawn: two zigzags of three atoms, their bonds 15 degrees off
 * level, one above the other and joined at their ends by two bonds 60
 * degrees steep - the upper zigzag the back of the ring, the lower the
 * front. Every bond comes out one length and the ring's opposite bonds
 * parallel. A chair's zigzags point opposite ways (one a V, the other a
 * peak), a boat's the same way; the ring's axial bonds - a boat's
 * flagpoles - are drawn upright.
 */
const LEVEL = (15 * Math.PI) / 180;
const STEEP = (60 * Math.PI) / 180;

/**
 * The template's six places, from the back zigzag's middle round: `top`
 * and `bottom` say which way each zigzag's middle points (1 a V, -1 a
 * peak), `hand` which way the front zigzag is set off from the back one.
 */
function ringTemplate(top: number, bottom: number, hand: number): Point[] {
  const c = Math.cos(LEVEL);
  const s = Math.sin(LEVEL);
  const o = { x: -hand * Math.cos(STEEP), y: -Math.sin(STEEP) };
  return [
    { x: 0, y: 0 },
    { x: c, y: top * s },
    { x: c + o.x, y: top * s + o.y },
    { x: o.x, y: o.y + (top - bottom) * s },
    { x: -c + o.x, y: top * s + o.y },
    { x: -c, y: top * s },
  ];
}

/**
 * Whether six points, in order round a ring, are drawn as a chair or a boat
 * always is (`ringTemplate`): two zigzags of three atoms, 15 degrees off
 * level, one above the other and joined by two bonds 60 degrees steep -
 * any way round or mirrored, at any size. Drawn so, a ring shows by its
 * shape alone which way each bond out of it goes, up or down; drawn any
 * other way - a ring of a solid seen as it falls - it does not.
 */
export function drawnAsChairOrBoat(pts: readonly Point[]): boolean {
  if (pts.length !== 6) return false;
  const lens = pts.map((p, k) => Math.hypot(pts[(k + 1) % 6].x - p.x, pts[(k + 1) % 6].y - p.y));
  const bond = lens.reduce((sum, v) => sum + v, 0) / 6;
  const mid = (ps: readonly Point[]) => ({ x: ps.reduce((sum, p) => sum + p.x, 0) / 6, y: ps.reduce((sum, p) => sum + p.y, 0) / 6 });
  const m = mid(pts);
  const q = pts.map((p) => ({ x: p.x - m.x, y: p.y - m.y }));
  for (const top of [1, -1]) {
    for (const bottom of [1, -1]) {
      for (const hand of [1, -1]) {
        const tpl = ringTemplate(top, bottom, hand);
        const c = mid(tpl);
        const t0 = tpl.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
        for (const mirror of [1, -1]) {
          const t = t0.map((p) => ({ x: p.x, y: mirror * p.y }));
          for (let start = 0; start < 6; start++) {
            for (const dir of [1, -1]) {
              const at = (k: number) => q[(start + dir * k + 12) % 6];
              // (the turn and scale that lay the template best on the drawing)
              let re = 0;
              let im = 0;
              let tt = 0;
              t.forEach((p, k) => {
                const d = at(k);
                re += p.x * d.x + p.y * d.y;
                im += p.x * d.y - p.y * d.x;
                tt += p.x * p.x + p.y * p.y;
              });
              const a = re / tt;
              const b = im / tt;
              const off = t.reduce((sum, p, k) => sum + (at(k).x - (a * p.x - b * p.y)) ** 2 + (at(k).y - (b * p.x + a * p.y)) ** 2, 0);
              if (Math.sqrt(off / 6) < 0.05 * bond) return true;
            }
          }
        }
      }
    }
  }
  return false;
}

/**
 * The stereocentres among `atoms`, drawn as a solid at `pos`, that the
 * drawing shows by its shape: each in a six-membered ring of them drawn as
 * a chair or a boat (`drawnAsChairOrBoat`).
 */
export function shownByShape(mol: Molecule, atoms: readonly number[], pos: (a: number) => Point): Set<number> {
  const out = new Set<number>();
  for (const cycle of sixCycles(mol, atoms)) {
    if (!cycle.some((a) => mol.tetra.has(a))) continue;
    if (!drawnAsChairOrBoat(cycle.map(pos))) continue;
    for (const a of cycle) if (mol.tetra.has(a)) out.add(a);
  }
  return out;
}

/**
 * The stereocentres among `atoms` - those of `sys` drawn as a solid, at
 * `pos` - that the drawing shows by its shape: each in a six-membered ring
 * drawn as a chair or a boat (`shownByShape`), or in a ring of the system
 * bridged across another (sharing three atoms or more with it), whose
 * atoms the cage drawn in perspective fixes - the way each bond goes from
 * them says which way round they are. Bridged so in every smallest set of
 * the system's rings (`smallestSets`), not only the one it was given.
 */
export function shownBySolid(mol: Molecule, sys: RingSystem, atoms: readonly number[], pos: (a: number) => Point): Set<number> {
  const out = shownByShape(mol, atoms, pos);
  const bridged = smallestSets(mol, sys).map((rings) => rings.filter((r) => rings.some((q) => q !== r && shares3(q, r))));
  for (const a of atoms) if (mol.tetra.has(a) && bridged.every((set) => set.some((r) => r.includes(a)))) out.add(a);
  return out;
}

/** Every six-membered cycle through the given atoms, each in order round it. */
function sixCycles(mol: Molecule, atoms: readonly number[]): number[][] {
  const inside = new Set(atoms);
  const found = new Map<string, number[]>();
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    if (path.length === 6) {
      if (mol.neighbours[last].includes(path[0])) {
        const k = [...path].sort((a, b) => a - b).join(",");
        if (!found.has(k)) found.set(k, path);
      }
      return;
    }
    for (const b of mol.neighbours[last]) if (inside.has(b) && !path.includes(b) && b > path[0]) walk([...path, b]);
  };
  for (const a of atoms) walk([a]);
  return [...found.values()];
}

/** The affine map from three dimensions to the page that best takes `from` to `to`. */
export function affineFit(from: Vec3[], to: Point[]): { x: number[]; y: number[]; residual: number } {
  const rows = from.map((p) => [p[0], p[1], p[2], 1]);
  const normal = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const solve = (b: number[]): number[] => {
    const m = normal.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 4; c++) {
      let p = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      if (Math.abs(m[c][c]) < 1e-12) return [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 5; k++) m[r][k] -= f * m[c][k];
      }
    }
    return m.map((r, i) => r[4] / r[i]);
  };
  const x = solve([0, 1, 2, 3].map((i) => rows.reduce((s, r, k) => s + r[i] * to[k].x, 0)));
  const y = solve([0, 1, 2, 3].map((i) => rows.reduce((s, r, k) => s + r[i] * to[k].y, 0)));
  let err = 0;
  rows.forEach((r, k) => {
    const px = r.reduce((s, v, i) => s + v * x[i], 0);
    const py = r.reduce((s, v, i) => s + v * y[i], 0);
    err += (px - to[k].x) ** 2 + (py - to[k].y) ** 2;
  });
  return { x, y, residual: Math.sqrt(err / rows.length) };
}

/**
 * Each double bond of the system in a ring of seven atoms or fewer, with
 * a neighbour of each end round such a ring: [its two ends, those two
 * neighbours], by their places among the system's atoms (`index`). Such a
 * ring has the bond cis. Found by the fewest bonds from the one neighbour
 * round to the other, not through the bond itself - not by the rings the
 * smallest set holds, which a cage alike in several rings leaves to the
 * order of its atoms.
 */
function ringDoubleBonds(mol: Molecule, index: Map<number, number>): [number, number, number, number][] {
  const found: [number, number, number, number][] = [];
  for (const { a, b, order } of mol.bonds) {
    if (order !== 2 || !index.has(a) || !index.has(b)) continue;
    for (const p of mol.neighbours[a])
      for (const q of mol.neighbours[b]) {
        if (p === b || q === a || p === q || !index.has(p) || !index.has(q)) continue;
        // (four bonds at most from p to q: the ring seven atoms at most)
        const hop = new Map([[p, 0]]);
        const queue = [p];
        for (let h = 0; h < queue.length && !hop.has(q); h++) {
          const u = queue[h];
          if (hop.get(u)! >= 4) break;
          for (const v of mol.neighbours[u]) {
            if (v === a || v === b || !index.has(v) || hop.has(v)) continue;
            hop.set(v, hop.get(u)! + 1);
            queue.push(v);
          }
        }
        if (hop.has(q)) found.push([index.get(a)!, index.get(b)!, index.get(p)!, index.get(q)!]);
      }
  }
  return found;
}

/**
 * How many of those double bonds (`ringDoubleBonds`) a drawing shows
 * trans: the two neighbours on opposite sides of the bond. The solid has
 * each flat and cis, and seen from any side it stays so; easing the rest
 * of the cage to bonds of one length can turn one (tetrodotoxin's
 * guanidine ring, seen nearly edge on, its C=N a zigzag).
 */
function turnedInRings(pts: readonly Point[], found: readonly [number, number, number, number][]): number {
  return found.filter(([a, b, p, q]) => {
    const side = (v: number) => Math.sign((pts[b].x - pts[a].x) * (pts[v].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[v].x - pts[a].x));
    return side(p) * side(q) < 0;
  }).length;
}

/**
 * The cage as a chemist draws it: one of its six-membered rings as the
 * chair or boat it is, by the template above, and the rest of the cage
 * built up from it - a bond axial to that ring upright, an atom bridging
 * two of its atoms (norbornane's C7) straight above the front one and a
 * bond from the back one, anything further where the solid, seen the
 * same way, puts it, eased to bonds of one length. Null for a cage with
 * no six-membered ring. Adamantane comes out as four chairs, the one at
 * the bottom with its three axial bonds rising to the fourth bridgehead;
 * norbornane and camphor as a boat with their bridge above. A double bond
 * in a ring of seven atoms or fewer is drawn cis, as the ring has it.
 */
function textbook(
  mol: Molecule,
  sys: RingSystem,
  X: Vec3[],
  index: Map<number, number>,
  bonds: [number, number][],
  rank = 0,
  tied?: CageView[],
): CageView | null {
  const atoms = sys.atoms;
  const cycles = sixCycles(mol, atoms);
  if (!cycles.length) return null;
  const kinds = [
    [1, -1],
    [-1, 1],
    [-1, -1],
    [1, 1],
  ];
  const at = (a: number) => X[index.get(a)!];
  const inSmallRings = ringDoubleBonds(mol, index);
  type Found = { pts: Point[]; depth: number[]; hints: Map<number, Map<number, Point>>; cost: number };
  // (the atoms of every six-membered ring the solid has as a chair or a
  // boat: a bond axial to one is drawn upright, the ring drawn by the
  // template or not)
  const axialRings = new Set(
    cycles.filter((r) => ["chair", "boat"].includes(ringShape(mol, r, at).kind)).flatMap((r) => r),
  );
  // the best seen with its front zigzag set off each way: one the other
  // seen from its other side
  const best = new Map<number, Found[]>();
  for (const cycle of cycles) {
    const R = cycle.map(at);
    const c: Vec3 = [0, 1, 2].map((k) => R.reduce((sum, p) => sum + p[k], 0) / 6) as Vec3;
    let nrm: Vec3 = [0, 0, 0];
    for (let i = 0; i < 6; i++) {
      const w = crossV(subV(R[i], c), subV(R[(i + 1) % 6], c));
      nrm = [nrm[0] + w[0], nrm[1] + w[1], nrm[2] + w[2]];
    }
    nrm = normalise(nrm);
    const rest = atoms.filter((a) => !cycle.includes(a)).map(at);
    // only a ring the solid has as a chair or a boat is drawn as one - not
    // one flat with a double bond in it, nor one twisted (conformation.ts)
    const shape = ringShape(mol, cycle, at);
    if (shape.kind !== "chair" && shape.kind !== "boat") continue;
    const h = R.map((p) => dotV(subV(p, c), nrm));
    const chair = shape.kind === "chair";
    const bow = shape.kind === "boat" ? shape.bow : 0;
    for (const turn of [1, -1]) {
      for (let start = 0; start < 6; start++) {
        if (!chair && start % 3 !== bow) continue;
        const k6 = (k: number) => (start + turn * k + 12) % 6;
        const order = [0, 1, 2, 3, 4, 5].map((k) => cycle[k6(k)]);
        // how far each zigzag's middle stands out of the ring, and which way
        const out0 = h[k6(0)] - (h[k6(1)] + h[k6(5)]) / 2;
        const out3 = h[k6(3)] - (h[k6(2)] + h[k6(4)]) / 2;
        for (const [top, bottom] of kinds) {
          if (chair !== (top === -bottom)) continue;
          for (const hand of [1, -1]) {
            const place = ringTemplate(top, bottom, hand);
            const fit = affineFit(order.map(at), place);
            if (fit.residual > 0.25) continue;
            const lx: Vec3 = [fit.x[0], fit.x[1], fit.x[2]];
            const ly: Vec3 = [fit.y[0], fit.y[1], fit.y[2]];
            // a middle that stands out of the ring toward the top of the
            // page is drawn as a peak, one away from it as a V
            const up = Math.sign(dotV(ly, nrm));
            if (Math.sign(out0) * up !== -top || Math.sign(out3) * up !== -bottom) continue;
            // a boat is bridged across its bow and stern: the bridge above it
            const pageUp: Vec3 = [nrm[0] * up, nrm[1] * up, nrm[2] * up];
            const restUp = rest.reduce((sum, p) => sum + dotV(subV(p, c), pageUp), 0) > 0;
            if (!chair && !restUp) continue;
            // toward the viewer, the page's axes and it turning the right
            // way: the drawing is the solid, not its mirror image
            const view = normalise(crossV(lx, ly));
            // the lower zigzag in front
            if (dotV(subV(at(order[3]), at(order[0])), view) <= 0) continue;
            const cost0 = 2 * fit.residual;
            const depth = X.map((p) => dotV(p, view));
            // (with the rings fused to it on a bond drawn by the template
            // too, and without: a ring fused flat onto the cage may read as
            // given only from the one)
            for (const fused of [true, false]) {
              const { pts, drawn, uprights } = drawOn(mol, atoms, X, index, bonds, order, place, fit, pageUp, fused);
              const hints = exits(mol, atoms, X, index, bonds, pts, pageUp, fit, drawn, axialRings, uprights);
              // the rest of the cage above the ring, where it is looked for,
              // and room for what hangs from it - from the front of the ring
              // rather than the back, where it would pass behind the cage;
              // and, of views alike, the one that lies level (tetrodotoxin
              // long, its guanidine ring beside the cage, not under it)
              const behind = [order[5], order[0], order[1]].reduce(
                (sum, a) => sum + mol.neighbours[a].filter((b) => !index.has(b)).length,
                0,
              );
              // (and a double bond in a small ring drawn trans counted as a
              // bridge's is (bridge.ts): it reads as another molecule -
              // tetrodotoxin's guanidine C=N, which won or lost by how near
              // an OH's label came to the ring's N, a hair either side of a
              // label's breadth as the atoms came)
              const cost =
                viewCost(pts, bonds, 0.45, 0.2) +
                cost0 +
                (restUp ? 0 : 0.5) +
                exitCost(pts, bonds, index, hints, (a) => mol.el[a] !== "C") +
                0.25 * behind +
                LEVEL_AXIS * axisTiltOf(pts) +
                20 * turnedInRings(pts, inSmallRings);
              best.set(hand, [...(best.get(hand) ?? []), { pts, depth, hints, cost }]);
            }
          }
        }
      }
    }
  }
  // (the views of each hand, best first, one of each look: a view and the
  // same ring seen again from another start comes out the same drawing)
  const looks = (fs: Found[]) => {
    const seen = new Set<string>();
    return [...fs].sort((p, q) => p.cost - q.cost).filter((f) => {
      const k = f.pts.map((p) => `${Math.round(p.x * 20)},${Math.round(p.y * 20)}`).join(";");
      return !seen.has(k) && (seen.add(k), true);
    });
  };
  const hands = [...best.values()].map(looks).sort((p, q) => p[0].cost - q[0].cost);
  if (!hands.length || rank >= hands[0].length) return null;
  const found = [hands[0][rank], ...(hands[1] ? [hands[1][0]] : [])];
  const view = (f: Found): Omit<CageView, "other"> => {
    const pos = new Map<number, Point>();
    const depth = new Map<number, number>();
    atoms.forEach((a, i) => {
      pos.set(a, f.pts[i]);
      depth.set(a, f.depth[i]);
    });
    return { pos, depth, hints: f.hints, cost: f.cost };
  };
  // (and every view of either hand as good as the best, each with the
  // other hand's best for its other side: two hands alike - an achiral
  // cage, adamantane - and which came first went by the order of the atoms)
  if (tied)
    hands.forEach((fs, h) => {
      const back = hands[1 - h]?.[0];
      for (const f of fs) if (f.cost < hands[0][0].cost + 1e-6) tied.push({ ...view(f), other: back ? view(back) : undefined });
    });
  return { ...view(found[0]), other: found[1] ? view(found[1]) : undefined };
}

/**
 * A bicyclo[3.3.1] cage - two six-membered rings sharing three atoms -
 * where each atom goes, as 9-BBN is drawn: its two chairs stood on end,
 * back to back. The one-atom bridge is their shared top; the bridgeheads
 * are under it, the front one the lower and a little to the left of the
 * back one, so that the bonds up to the top stay apart; each three-atom
 * bridge is a chair's lower half to one side, its middle atom the foot.
 * A bond toward the viewer comes out longer, as in a perspective drawing.
 * One side's bridge is given, from the front bridgehead round to the back
 * one; the other side's is its mirror image. How near each is (`z`): the
 * front bridgehead and the atom next to it on each side a bond's breadth
 * nearer than the top and the feet, the back ones as much further.
 */
const TWIN = {
  top: { x: 0, y: 1.2, z: 0 },
  back: { x: 0.16, y: 0.45, z: -0.8 },
  front: { x: -0.12, y: -0.1, z: 0.8 },
  side: [
    { x: 0.88, y: -0.35, z: 0.8 },
    { x: 1.08, y: -1.25, z: 0 },
    { x: 0.98, y: 0.2, z: -0.8 },
  ],
};

/**
 * A bicyclo[3.3.1] cage - 9-BBN, bicyclo[3.3.1]nonan-9-one, bispidine -
 * drawn by TWIN, its one-atom bridge on top, where what hangs from that
 * has room: seen with either bridgehead in front, the way round that is
 * the solid and not its mirror image, the other kept for a frame set down
 * mirrored. Null for any other system.
 */
function twinChairs(
  mol: Molecule,
  sys: RingSystem,
  X: Vec3[],
  index: Map<number, number>,
  bonds: [number, number][],
): CageView | null {
  if (sys.rings.length !== 2) return null;
  const [r1, r2] = sys.rings.map((i) => mol.rings[i]);
  if (r1.length !== 6 || r2.length !== 6) return null;
  const shared = r1.filter((a) => r2.includes(a));
  const ends = shared.filter((a) => mol.neighbours[a].filter((b) => shared.includes(b)).length === 1);
  const top = shared.find((a) => !ends.includes(a));
  if (shared.length !== 3 || ends.length !== 2 || top == null) return null;
  // (only two chairs the solid has as chairs: not a ring flat with a double
  // bond in it - huperzine A's - whose atom would carry an axial bond)
  if (![r1, r2].every((r) => ringShape(mol, r, (a) => X[index.get(a)!]).kind === "chair")) return null;
  // each three-atom bridge, from the first bridgehead round to the second
  const bridge = (r: number[]) => {
    const i = r.indexOf(ends[0]);
    const step = r[(i + 1) % 6] === top ? -1 : 1;
    return [1, 2, 3].map((k) => r[(i + step * k + 6) % 6]);
  };
  const bridges = [bridge(r1), bridge(r2)];
  const at = (a: number) => X[index.get(a)!];
  const atoms = sys.atoms;
  const views: Omit<CageView, "other">[] = [];
  for (const f of [0, 1]) {
    const front = ends[f];
    const back = ends[1 - f];
    for (const right of [0, 1]) {
      const place = new Map<number, Point & { z: number }>([
        [top, TWIN.top],
        [front, TWIN.front],
        [back, TWIN.back],
      ]);
      bridges.forEach((b, k) => {
        const run = f === 0 ? b : [...b].reverse();
        const sign = k === right ? 1 : -1;
        run.forEach((a, j) => place.set(a, { ...TWIN.side[j], x: sign * TWIN.side[j].x }));
      });
      // the page's axes in the solid, and toward the viewer: the front
      // bridgehead nearer, or this is the mirror image
      const fit = affineFit(atoms.map(at), atoms.map((a) => place.get(a)!));
      const lx: Vec3 = [fit.x[0], fit.x[1], fit.x[2]];
      const ly: Vec3 = [fit.y[0], fit.y[1], fit.y[2]];
      const view = normalise(crossV(lx, ly));
      if (dotV(subV(at(front), at(back)), view) <= 0) continue;
      const sx = normalise(lx);
      const sy = normalise(ly);
      const pos = new Map(atoms.map((a) => [a, { x: place.get(a)!.x, y: place.get(a)!.y }] as [number, Point]));
      const depth = new Map(atoms.map((a) => [a, place.get(a)!.z] as [number, number]));
      // the bonds out, as the solid has them seen this way; the top's
      // straight up, out of the cage
      const hints = new Map<number, Map<number, Point>>();
      atoms.forEach((a, i) => {
        const out = mol.neighbours[a].filter((b) => !index.has(b));
        if (!out.length) return;
        const dirs = outward(mol, a, i, X, index, out);
        const m = new Map<number, Point>();
        out.forEach((b, k) => {
          let d = { x: dotV(dirs[k], sx), y: dotV(dirs[k], sy) };
          if (a === top) d = out.length === 1 ? { x: 0, y: 1 } : { x: k ? 0.5 : -0.5, y: 0.87 };
          const l = Math.hypot(d.x, d.y) || 1;
          m.set(b, { x: pos.get(a)!.x + d.x / l, y: pos.get(a)!.y + d.y / l });
        });
        hints.set(a, m);
      });
      views.push({ pos, depth, hints, cost: viewCost(atoms.map((a) => pos.get(a)!), bonds, 0.45, 0.2, atoms.map((a) => depth.get(a)!)) });
    }
  }
  if (!views.length) return null;
  return { ...views[0], other: views[1] };
}

/**
 * A six-membered ring drawn by the template (`ringTemplate`) on a bond
 * already drawn, from `P` to `Q`, as a chair or a boat: its other four
 * atoms, in order on from `Q`, where the template - turned, mirrored and
 * started every way - puts them nearest `targets` (where the solid puts
 * them), clear of `avoid`. Null where none comes within 0.6 of a bond.
 */
export function templateOnBond(
  kind: "chair" | "boat",
  P: Point,
  Q: Point,
  targets: readonly Point[],
  avoid: readonly Point[],
): { at: Point[]; up: Point } | null {
  let best: { at: Point[]; up: Point; miss: number } | null = null;
  for (const [top, bottom] of [[1, -1], [-1, 1], [1, 1], [-1, -1]]) {
    if ((kind === "chair") !== (top === -bottom)) continue;
    for (const hand of [1, -1])
      for (const flip of [1, -1]) {
        const tpl = ringTemplate(top, bottom, hand).map((t) => ({ x: t.x, y: flip * t.y }));
        for (let start = 0; start < 6; start++)
          for (const dir of [1, -1]) {
            const t = (k: number) => tpl[(start + dir * k + 12) % 6];
            // (the turn and scale that take the template's two onto the bond)
            const a0 = t(0);
            const a1 = t(1);
            const u = { x: a1.x - a0.x, y: a1.y - a0.y };
            const v = { x: Q.x - P.x, y: Q.y - P.y };
            const uu = u.x * u.x + u.y * u.y || 1;
            const zr = (v.x * u.x + v.y * u.y) / uu;
            const zi = (v.y * u.x - v.x * u.y) / uu;
            const map = (w: Point) => ({ x: P.x + zr * (w.x - a0.x) - zi * (w.y - a0.y), y: P.y + zi * (w.x - a0.x) + zr * (w.y - a0.y) });
            const at = [2, 3, 4, 5].map((k) => map(t(k)));
            let miss = at.reduce((sum, p, j) => sum + (p.x - targets[j].x) ** 2 + (p.y - targets[j].y) ** 2, 0);
            // (never onto what is drawn already)
            for (const p of at) for (const f of avoid) if (Math.hypot(p.x - f.x, p.y - f.y) < 0.5) miss += 10;
            // (the template's upright, its axial bonds' way, as laid)
            const l = Math.hypot(zr, zi) || 1;
            const up = { x: (-zi * flip) / l, y: (zr * flip) / l };
            if (!best || miss < best.miss) best = { at, up, miss };
          }
      }
  }
  return best && Math.sqrt(best.miss / 4) <= 0.6 ? { at: best.at, up: best.up } : null;
}

/**
 * Where the bonds out of a cage drawn by the template go: a double bond
 * straight out, between the atom's two bonds in the cage. From an atom of
 * the chair or boat itself (`ring`), a bond parallel in the solid to one
 * of the cage's is drawn parallel to it (a chair's equatorial bonds
 * parallel to the ring bonds but one), an axial one upright. Any other
 * goes straight out from the cage's bonds at the atom, two of them either
 * side of that (camphor's gem-dimethyl, a V above its bridge). Each is
 * given as the neighbour's place, a bond's length out.
 */
function exits(
  mol: Molecule,
  atoms: readonly number[],
  X: Vec3[],
  index: Map<number, number>,
  bonds: [number, number][],
  pts: Point[],
  pageUp: Vec3,
  fit: { x: number[]; y: number[] },
  ring: readonly number[],
  axialRings: ReadonlySet<number> = new Set(),
  uprights: ReadonlyMap<string, Point> = new Map(),
): Map<number, Map<number, Point>> {
  const hints = new Map<number, Map<number, Point>>();
  // the side a direction in the solid comes out on, seen the same way
  const across = (d: Vec3) => fit.x[0] * d[0] + fit.x[1] * d[1] + fit.x[2] * d[2];
  atoms.forEach((a, i) => {
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    if (!out.length) return;
    const dirs = outward(mol, a, i, X, index, out);
    const inCage = mol.neighbours[a].filter((b) => index.has(b)).map((b) => index.get(b)!);
    let sx = 0;
    let sy = 0;
    for (const j of inCage) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const l = Math.hypot(dx, dy) || 1;
      sx -= dx / l;
      sy -= dy / l;
    }
    const away = Math.atan2(sy, sx);
    const open = Math.hypot(sx, sy) > 0.3;
    const m = new Map<number, Point>();
    const free: number[] = [];
    out.forEach((b, k) => {
      const d = dirs[k];
      const bi = mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`);
      let flat: Point | null = null;
      if (bi != null && mol.bonds[bi].order === 2 && open) flat = { x: Math.cos(away), y: Math.sin(away) };
      // (axial to a ring drawn by the template on a bond: along its upright)
      if (!flat && uprights.has(`${a}>${b}`)) flat = uprights.get(`${a}>${b}`)!;
      // (the chair's or boat's own rules, for its own atoms)
      const own = ring.includes(a);
      if (!flat && own) {
        let most = Math.cos((20 * Math.PI) / 180);
        for (const [p, q] of bonds) {
          const cos = dotV(normalise(subV(X[q], X[p])), d);
          if (Math.abs(cos) > most) {
            most = Math.abs(cos);
            const sign = Math.sign(cos);
            flat = { x: sign * (pts[q].x - pts[p].x), y: sign * (pts[q].y - pts[p].y) };
          }
        }
      }
      // (and an axial bond upright from any chair or boat of the solid:
      // drawn by the template or not, a group axial on a chair stands
      // straight up or down)
      if (!flat && (own || axialRings.has(a)) && Math.abs(dotV(d, pageUp)) > Math.cos((35 * Math.PI) / 180)) {
        flat = { x: 0, y: Math.sign(dotV(d, pageUp)) };
      }
      if (!flat) {
        free.push(k);
        return;
      }
      const l = Math.hypot(flat.x, flat.y) || 1;
      m.set(b, { x: pts[i].x + flat.x / l, y: pts[i].y + flat.y / l });
    });
    // the rest straight out, two of them either side, as the solid has them
    // - but a stereocentre's one bond out, beside its H, the way the solid
    // has it: straight out is where neither of its corners is, and says
    // nothing of which it is in
    const shown = mol.tetra.get(a)?.neighbours.includes(-1) && free.length === 1;
    const spread = free.length > 1 ? (37.5 * Math.PI) / 180 : 0;
    const sides = [...free].sort((p, q) => across(dirs[q]) - across(dirs[p]));
    sides.forEach((k, j) => {
      const t = open ? away + (free.length > 1 ? (j === 0 ? -spread : spread) : 0) : Math.atan2(0, 1);
      const d = dirs[k];
      const flatDir = shown
        ? { x: across(d), y: fit.y[0] * d[0] + fit.y[1] * d[1] + fit.y[2] * d[2] }
        : open
          ? { x: Math.cos(t), y: Math.sin(t) }
          : { x: across(d), y: 0 };
      const l = Math.hypot(flatDir.x, flatDir.y) || 1;
      m.set(out[k], { x: pts[i].x + flatDir.x / l, y: pts[i].y + flatDir.y / l });
    });
    hints.set(a, m);
  });
  return hints;
}

/** What a degree of a template view's long axis off level costs it (`textbook`, `axisTiltOf`). */
const LEVEL_AXIS = 0.05;

/** How far a drawing's long axis is from level, in degrees, scaled by how much longer than broad it is (as `layoutMetrics` measures it). */
function axisTiltOf(pts: readonly Point[]): number {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const half = (sxx + syy) / 2;
  const spread = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)));
  const long = half + spread;
  const broad = Math.max(0, half - spread);
  return long > 0 ? Math.abs((0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI) * (1 - Math.sqrt(broad / long)) : 0;
}

/** How much a cage's bonds out run into it: an end on an atom or a bond, or crossing one. */
function exitCost(
  pts: Point[],
  bonds: [number, number][],
  index: Map<number, number>,
  hints: Map<number, Map<number, Point>>,
  labelled: (a: number) => boolean = () => false,
): number {
  let cost = 0;
  const atoms = [...index.keys()];
  for (const [a, m] of hints) {
    const i = index.get(a)!;
    for (const [t, h] of m) {
      for (let j = 0; j < pts.length; j++) {
        // (two labels - an OH ending by a cage's O - a label's breadth apart)
        const room = labelled(t) && labelled(atoms[j]) ? 0.85 : 0.5;
        if (j !== i && Math.hypot(pts[j].x - h.x, pts[j].y - h.y) < room) cost += 3;
      }
      for (const [p, q] of bonds) {
        if (p === i || q === i) continue;
        if (segmentsCross(pts[i], h, pts[p], pts[q])) cost += 2;
      }
      for (const [b, n] of hints) {
        if (b === a) continue;
        for (const [, g] of n) if (Math.hypot(g.x - h.x, g.y - h.y) < 0.8) cost += 1.5;
      }
    }
  }
  return cost;
}

/**
 * The cage's atoms placed on a ring drawn by the template (`order` at
 * `place`): the rest built up from it as `textbook` says.
 */
function drawOn(
  mol: Molecule,
  atoms: readonly number[],
  X: Vec3[],
  index: Map<number, number>,
  bonds: [number, number][],
  order: number[],
  place: Point[],
  fit: { x: number[]; y: number[] },
  pageUp: Vec3,
  fused = true,
): { pts: Point[]; drawn: number[]; uprights: Map<string, Point> } {
  const proj = (p: Vec3): Point => ({
    x: fit.x[0] * p[0] + fit.x[1] * p[1] + fit.x[2] * p[2] + fit.x[3],
    y: fit.y[0] * p[0] + fit.y[1] * p[1] + fit.y[2] * p[2] + fit.y[3],
  });
  const pts: Point[] = atoms.map((a) => {
    const k = order.indexOf(a);
    return k >= 0 ? { ...place[k] } : proj(X[index.get(a)!]);
  });
  const fixed = new Set(order.map((a) => index.get(a)!));
  const drawn = [...order];
  const uprights = new Map<string, Point>();
  // A six-membered ring the solid has as a chair or a boat, fused on a bond
  // to a ring drawn by the template, drawn by the template too - decalin's
  // second chair beside its first, trans or cis as the solid has it: the
  // template laid on the bond they share, turned, mirrored and started
  // where its other four atoms fall nearest where the solid puts them.
  // (or fused on a bond to the rest of the solid, its other four atoms in
  // no other ring: laid on that bond where the solid puts it)
  const cycles = sixCycles(mol, atoms);
  const inOthers = (a: number, cycle: number[]) =>
    cycles.some((r) => r !== cycle && r.includes(a)) ||
    mol.rings.some((r) => r.length !== 6 && r.includes(a) && r.every((v) => index.has(v)));
  const tried = new Set<string>();
  for (let grew = fused; grew; ) {
    grew = false;
    for (const cycle of cycles) {
      const key = [...cycle].sort((p, q) => p - q).join(",");
      const idx = cycle.map((a) => index.get(a)!);
      let shared = idx.flatMap((i, k) => (fixed.has(i) ? [k] : []));
      if (shared.length === 0) shared = cycle.flatMap((a, k) => (inOthers(a, cycle) ? [k] : []));
      if (tried.has(key) || shared.length !== 2 || (shared[1] - shared[0] !== 1 && shared[1] - shared[0] !== 5)) continue;
      tried.add(key);
      const shape = ringShape(mol, cycle, (a) => X[index.get(a)!]);
      if (shape.kind !== "chair" && shape.kind !== "boat") continue;
      // (round the ring from the bond it shares: its two atoms first)
      const [k0, k1] = shared[1] - shared[0] === 1 ? shared : [shared[1], shared[0]];
      const step = (k1 - k0 + 6) % 6 === 1 ? 1 : -1;
      const seq = [0, 1, 2, 3, 4, 5].map((k) => idx[(k0 + step * k + 12) % 6]);
      const at = templateOnBond(
        shape.kind,
        pts[seq[0]],
        pts[seq[1]],
        seq.slice(2).map((i) => proj(X[i])),
        [...fixed].map((f) => pts[f]),
      );
      if (!at) continue;
      at.at.forEach((p, j) => {
        pts[seq[j + 2]] = p;
        fixed.add(seq[j + 2]);
      });
      fixed.add(seq[0]);
      fixed.add(seq[1]);
      drawn.push(...cycle.filter((a) => !drawn.includes(a)));
      // (its axial bonds along the template's upright as laid, up or down
      // as the solid has them, seen the same way)
      for (const { from, to, dir } of axialOut(mol, { atoms: [...atoms], rings: [] }, cycle, new Map(atoms.map((a, i) => [a, X[i]])))) {
        const seen = { x: fit.x[0] * dir[0] + fit.x[1] * dir[1] + fit.x[2] * dir[2], y: fit.y[0] * dir[0] + fit.y[1] * dir[1] + fit.y[2] * dir[2] };
        const sign = seen.x * at.up.x + seen.y * at.up.y >= 0 ? 1 : -1;
        uprights.set(`${from}>${to}`, { x: at.up.x * sign, y: at.up.y * sign });
      }
      grew = true;
    }
  }
  const hold = new Map<number, number>();
  atoms.forEach((a, i) => {
    if (fixed.has(i)) return;
    const onRing = mol.neighbours[a].filter((b) => order.includes(b)).map((b) => index.get(b)!);
    if (!onRing.length) return;
    const up = Math.sign(dotV(subV(X[i], X[onRing[0]]), pageUp)) || 1;
    if (onRing.length >= 2) {
      // a bridge of one atom: straight above (or below) the end further
      // from it, a bond's length from the other
      const [far, near] = [...onRing].sort((p, q) => up * (pts[p].y - pts[q].y));
      const dx = pts[far].x - pts[near].x;
      if (Math.abs(dx) <= 1) {
        pts[i] = { x: pts[far].x, y: pts[near].y + up * Math.sqrt(1 - dx * dx) };
        fixed.add(i);
      }
    } else if (onRing.length === 1) {
      const d = normalise(subV(X[i], X[onRing[0]]));
      if (Math.abs(dotV(d, pageUp)) > Math.cos((35 * Math.PI) / 180)) {
        pts[i] = { x: pts[onRing[0]].x, y: pts[onRing[0]].y + up };
        hold.set(i, 0.15);
      }
    }
  });
  // the rest eased to bonds of one length, each held near where it was put
  const anchor = pts.map((p) => ({ ...p }));
  for (let it = 0; it < 400; it++) {
    for (const [a, b] of bonds) {
      const fa = fixed.has(a);
      const fb = fixed.has(b);
      if (fa && fb) continue;
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const l = Math.hypot(dx, dy) || 1e-9;
      const f = (l - 1) / l;
      const share = fa || fb ? 0.5 : 0.25;
      if (!fa) {
        pts[a].x += dx * f * share;
        pts[a].y += dy * f * share;
      }
      if (!fb) {
        pts[b].x -= dx * f * share;
        pts[b].y -= dy * f * share;
      }
    }
    // (an upright bond kept upright - its far atom moved only up or down;
    // the rest held less and less, so that bonds that can all be one
    // length are)
    const ease = Math.max(0, 1 - it / 300);
    pts.forEach((p, i) => {
      if (fixed.has(i)) return;
      if (hold.has(i)) {
        p.x = anchor[i].x;
        p.y += (anchor[i].y - p.y) * hold.get(i)!;
        return;
      }
      const w = 0.05 * ease;
      p.x += (anchor[i].x - p.x) * w;
      p.y += (anchor[i].y - p.y) * w;
    });
  }
  return { pts, drawn, uprights };
}

/**
 * The solid with each stereocentre it has the wrong way that three of its
 * bonds in the system fix turned the right way: from how far apart the
 * bonds put the atoms, a ring fusion can come out trans where it is cis
 * (tetrodotoxin's C4a, where its guanidine ring joins the cage). The
 * centre is put through the plane of those three neighbours - its bonds to
 * them keep their lengths - and the solid eased again from there, every
 * centre so fixed held the way round it is given; taken where that leaves
 * fewer wrong.
 */
function rightCentres(mol: Molecule, atoms: readonly number[], index: Map<number, number>, X: Vec3[], T: Targets): Vec3[] {
  const fixed = (c: number) => {
    const t = orderedCentre(mol, c);
    if (!t) return null;
    const known = t.neighbours.map((n, k) => [n, k] as const).filter(([n]) => n >= 0 && index.has(n));
    return known.length >= 3 ? { t, known } : null;
  };
  const wrong = (Y: Vec3[]) =>
    atoms.filter((c) => {
      const f = fixed(c);
      if (!f) return false;
      const three = f.known.slice(0, 3);
      const left = [0, 1, 2, 3].find((k) => !three.some(([, q]) => q === k))!;
      const p = Y[index.get(c)!];
      const v = three.map(([n]) => subV(Y[index.get(n)!], p));
      return Math.sign(dotV(v[0], crossV(v[1], v[2]))) !== f.t.volume * (left % 2 === 1 ? 1 : -1);
    });
  const bad = wrong(X);
  if (!bad.length) return X;
  const next = X.map((p) => [...p] as Vec3);
  for (const c of bad) {
    const [a, b, d] = fixed(c)!.known.slice(0, 3).map(([n]) => X[index.get(n)!]);
    const nrm = normalise(crossV(subV(b, a), subV(d, a)));
    const p = X[index.get(c)!];
    const k = 2 * dotV(subV(p, a), nrm);
    next[index.get(c)!] = [p[0] - k * nrm[0], p[1] - k * nrm[1], p[2] - k * nrm[2]];
  }
  const settled = settle(next, T, holds(mol, atoms, index));
  return wrong(settled).length < bad.length ? settled : X;
}

/** Every stereocentre with three bonds or more in the system, to be held the way round it is given while the solid eases. */
function holds(mol: Molecule, atoms: readonly number[], index: Map<number, number>): Held[] {
  return atoms.flatMap((c) => {
    const t = orderedCentre(mol, c);
    if (!t) return [];
    const known = t.neighbours.map((n, k) => [n, k] as const).filter(([n]) => n >= 0 && index.has(n));
    if (known.length < 3) return [];
    const three = known.slice(0, 3);
    const left = [0, 1, 2, 3].find((k) => !three.some(([, q]) => q === k))!;
    return [{ c: index.get(c)!, three: three.map(([n]) => index.get(n)!) as [number, number, number], sign: t.volume * (left % 2 === 1 ? 1 : -1) }];
  });
}

/**
 * Whether the solid's stereocentres at its bridgeheads - those whose four
 * bonds the cage itself fixes, three of them inside it - are as their
 * configurations say (+1), the mirror image (-1), or have none to say (0).
 */
function handedness(mol: Molecule, atoms: number[], index: Map<number, number>, X: Vec3[]): number {
  let vote = 0;
  atoms.forEach((a, i) => {
    const t = orderedCentre(mol, a);
    if (!t) return;
    const inside = mol.neighbours[a].filter((b) => index.has(b));
    if (inside.length < 3) return;
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    const dirs = outward(mol, a, i, X, index, out);
    const v = t.neighbours.slice(0, 3).map((n): Vec3 => {
      if (index.has(n)) {
        const q = X[index.get(n)!];
        return [q[0] - X[i][0], q[1] - X[i][1], q[2] - X[i][2]];
      }
      const k = out.indexOf(n);
      return k >= 0 ? dirs[k] : dirs[0];
    });
    const vol = dotV(v[0], crossV(v[1], v[2]));
    vote += Math.sign(vol) === t.volume ? 1 : -1;
  });
  return Math.sign(vote);
}

/** Straight away from bonds given as unit vectors: where their sum points the other way. */
function awayFrom(us: readonly Vec3[]): Vec3 {
  const sum: Vec3 = [0, 1, 2].map((c) => us.reduce((s, u) => s + u[c], 0)) as Vec3;
  return normalise([-sum[0], -sum[1], -sum[2]]);
}

/**
 * The bonds out of a ring system that are axial to a six-membered ring of
 * it the solid has as a chair or a boat (`ring`): for each of the ring's
 * atoms, the atom out of the system and its way in the solid (`outward`),
 * where that is within 35 degrees of the ring's normal.
 */
export function axialOut(mol: Molecule, sys: RingSystem, ring: readonly number[], solid: Map<number, Vec3>): { from: number; to: number; dir: Vec3 }[] {
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const X = atoms.map((a) => solid.get(a)!);
  const P = ring.map((a) => solid.get(a)!);
  const c: Vec3 = [0, 1, 2].map((k) => P.reduce((sum, p) => sum + p[k], 0) / P.length) as Vec3;
  let nrm: Vec3 = [0, 0, 0];
  for (let i = 0; i < P.length; i++) {
    const w = crossV(subV(P[i], c), subV(P[(i + 1) % P.length], c));
    nrm = [nrm[0] + w[0], nrm[1] + w[1], nrm[2] + w[2]];
  }
  nrm = normalise(nrm);
  const found: { from: number; to: number; dir: Vec3 }[] = [];
  for (const a of ring) {
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    if (!out.length) continue;
    const dirs = outward(mol, a, index.get(a)!, X, index, out);
    out.forEach((b, k) => {
      if (Math.abs(dotV(dirs[k], nrm)) > Math.cos((35 * Math.PI) / 180)) found.push({ from: a, to: b, dir: dirs[k] });
    });
  }
  return found;
}

/**
 * Where the bonds of a tetrahedral atom that are not among `us` (its bonds
 * given, as unit vectors) point: with three given, the one corner left;
 * with two, the two either side of their plane.
 */
export function freeCorners(us: readonly Vec3[]): Vec3[] {
  const away = awayFrom(us);
  if (us.length !== 2) return [away];
  const across = normalise(crossV(us[0], us[1]));
  const k = Math.cos((54.75 * Math.PI) / 180);
  const j = Math.sin((54.75 * Math.PI) / 180);
  return [
    [0, 1, 2].map((c) => away[c] * k + across[c] * j) as Vec3,
    [0, 1, 2].map((c) => away[c] * k - across[c] * j) as Vec3,
  ];
}

/**
 * The directions, in the solid, of an atom's bonds out of the cage: the
 * tetrahedron's free corners (or, beside a double bond, the plane's), the
 * one a stereocentre's configuration asks for where there is a choice.
 */
function outward(
  mol: Molecule,
  a: number,
  i: number,
  X: Vec3[],
  index: Map<number, number>,
  out: number[],
): Vec3[] {
  const inside = mol.neighbours[a].filter((b) => index.has(b));
  const unit = (b: number): Vec3 => {
    const q = X[index.get(b)!];
    return normalise([q[0] - X[i][0], q[1] - X[i][1], q[2] - X[i][2]]);
  };
  const us = inside.map(unit);
  const corners = freeCorners(us);
  const away = awayFrom(us);
  if (corners.length < 2) return out.map(() => away);
  const k = Math.cos((54.75 * Math.PI) / 180);
  const double = out.some((b) => {
    const bi = mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`);
    return bi != null && mol.bonds[bi].order === 2;
  });
  if (double) return out.map(() => away);
  if (out.length >= 2) {
    // (which goes to which corner by the structure - the corners told apart
    // by which side of the plane of its first two neighbours inside they
    // lie - and, at a stereocentre, as its configuration asks)
    const same = byStructure(mol);
    const [p, q] = [...inside].sort(same).map(unit);
    const [c1, c2] = [...corners].sort((u, v) => Math.sign(dotV(crossV(p, q), v)) - Math.sign(dotV(crossV(p, q), u)));
    const [o1, o2] = [...out].sort(same);
    let pick = new Map([
      [o1, c1],
      [o2, c2],
    ]);
    const t = orderedCentre(mol, a);
    if (t && out.length === 2) {
      const dirOf = (n: number): Vec3 => (pick.has(n) ? pick.get(n)! : unit(n));
      const v = t.neighbours.slice(0, 3).map(dirOf);
      if (Math.sign(dotV(v[0], crossV(v[1], v[2]))) !== t.volume) pick = new Map([
        [o1, c2],
        [o2, c1],
      ]);
    }
    return out.map((b) => pick.get(b) ?? away);
  }
  // one bond out and an H: the corner the configuration asks for
  const t = mol.tetra.get(a);
  if (!t) return [away];
  const at = (n: number, corner: Vec3): Vec3 =>
    n === out[0] ? corner : n === -1 ? [0, 1, 2].map((c) => -corner[c] + 2 * away[c] * k) as Vec3 : unit(n);
  for (const corner of corners) {
    const other = corners.find((c) => c !== corner)!;
    const v = t.neighbours.slice(0, 3).map((n) => (n === -1 ? other : at(n, corner)));
    const vol = dotV(v[0], crossV(v[1], v[2]));
    if (Math.sign(vol) === t.volume) return [corner];
  }
  return [away];
}

/**
 * Whether a ring system is a cage, drawn in perspective as the solid it is:
 * one whose rings are all bridged - each sharing three atoms or more with
 * another, so that none is a ring fused flat on a side - as norbornane's,
 * tropane's, quinuclidine's and adamantane's are; or a polyhedron, every
 * atom in two rings or more (cubane). A system with a ring fused on a side
 * as well (morphine's benzene ring, artemisinin's cyclohexane) is drawn
 * flat, its bridge across it.
 *
 * Read from every smallest set of its rings (`smallestSets`), not only the
 * one the system was given, which of several as small going by the order
 * of the atoms: a cage only where each of them reads as one - a set that
 * has a ring fused on a side shows the system is not all bridged.
 */
export function isCage(mol: Molecule, sys: RingSystem): boolean {
  if (sys.rings.length < 2 || sys.atoms.length > 16) return false;
  // (rings through a metal - a chelate, a diene bound to it - or round a
  // star are no cage: they are drawn flat, or face-on to their metal)
  if (sys.atoms.some((a) => mol.el[a] === "*" || isMetal(mol.el[a]))) return false;
  if (sys.rings.some((r) => mol.rings[r].length > 8)) return false;
  return smallestSets(mol, sys).every((rings) => allBridged(sys.atoms, rings));
}

/** Rings all bridged, each sharing three atoms or more with another, or a polyhedron, every atom in two rings or more. */
function allBridged(atoms: readonly number[], rings: readonly (readonly number[])[]): boolean {
  const bridged = rings.every((r) => rings.some((q) => q !== r && q.filter((a) => r.includes(a)).length >= 3));
  return bridged || atoms.every((a) => rings.filter((r) => r.includes(a)).length >= 2);
}

/** At most this many smallest sets read for one system: one with more is read by its own set. */
const MOST_SETS = 64;
const setsOf = new WeakMap<RingSystem, number[][][]>();

/**
 * Every smallest set of a ring system's rings, each as its rings' atoms:
 * the system's own (`Molecule.rings`) and each other as small - where
 * several sets are as small, which one the system was given goes by the
 * order of its atoms: quinuclidine has three six-membered cycles and any
 * two are a smallest set; paeoniflorin's six-membered ring is one of three.
 * Each other set takes, length by length, as many of the cycles that size
 * no sum of shorter rings gives (`ringsAlike`) as the system's own set has,
 * where they are independent of the shorter rings and of one another. A
 * ring of nine atoms or more is kept as the system has it: no cage has one.
 */
function smallestSets(mol: Molecule, sys: RingSystem): number[][][] {
  const known = setsOf.get(sys);
  if (known) return known;
  const own = sys.rings.map((i) => mol.rings[i]);
  const small = own.filter((r) => r.length <= 8);
  const alike = small.length ? ringsAlike(small, mol.neighbours) : [];
  let sets: number[][][] = [own];
  if (alike.length > small.length) {
    // (each cycle as the set of its bonds, over GF(2))
    const bondOf = new Map<string, number>();
    const vectorOf = (r: readonly number[]) => {
      let v = 0n;
      r.forEach((a, k) => {
        const b = r[(k + 1) % r.length];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (!bondOf.has(key)) bondOf.set(key, bondOf.size);
        v ^= 1n << BigInt(bondOf.get(key)!);
      });
      return v;
    };
    const rank = (vs: readonly bigint[]) => {
      const basis: bigint[] = [];
      for (let v of vs) {
        for (const b of basis) if ((v ^ b) < v) v ^= b;
        if (!v) continue;
        basis.push(v);
        basis.sort((p, q) => (p > q ? -1 : p < q ? 1 : 0));
      }
      return basis.length;
    };
    const choose = <T,>(items: readonly T[], m: number): T[][] =>
      m === 0 ? [[]] : items.flatMap((x, k) => choose(items.slice(k + 1), m - 1).map((rest) => [x, ...rest]));
    const binomial = (k: number, m: number) => {
      let c = 1;
      for (let j = 0; j < m; j++) c = (c * (k - j)) / (j + 1);
      return c;
    };
    const lengths = [...new Set(small.map((r) => r.length))].sort((p, q) => p - q);
    const options: number[][][][] = [];
    let count = 1;
    for (const length of lengths) {
      const shorter = small.filter((r) => r.length < length).map(vectorOf);
      const wanted = small.filter((r) => r.length === length).length;
      const cycles = alike.filter((r) => r.length === length);
      if (binomial(cycles.length, wanted) > 4 * MOST_SETS) {
        count = Infinity;
        break;
      }
      const ways = choose(cycles, wanted).filter((pick) => rank([...shorter, ...pick.map(vectorOf)]) === shorter.length + wanted);
      options.push(ways);
      count *= ways.length;
    }
    if (count > 1 && count <= MOST_SETS) {
      const large = own.filter((r) => r.length > 8);
      sets = options.reduce<number[][][]>((acc, ways) => acc.flatMap((set) => ways.map((pick) => [...set, ...pick])), [[]]).map((set) => [...set, ...large]);
    }
  }
  setsOf.set(sys, sets);
  return sets;
}

const dotV = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subV = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalise = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The cage within a ring system that is not one as a whole: its rings
 * bridged to one another - each sharing three atoms or more with another,
 * as a cage's do - with rings fused to them on a side (ibogaine's
 * isoquinuclidine, fused to its indole by a seven-membered ring;
 * tetrodotoxin's cage, its guanidine ring fused to it). The largest such
 * set of rings, where it is a cage on its own; else none.
 *
 * Where the system has more than one smallest set of rings (`smallestSets`),
 * its cage is the atoms every set has in its cage - all the system's, in a
 * set that reads the whole as one - and the system's own rings within
 * them: ibogaine's seven-membered ring shares three atoms with one of the
 * isoquinuclidine's three six-membered cycles and is fused on a side of
 * the other two, so it is no part of the cage whichever two the system
 * was given.
 */
export function cageCore(mol: Molecule, sys: RingSystem): RingSystem | null {
  const sets = smallestSets(mol, sys);
  if (sets.length === 1) {
    const best = largestGroup(sys.rings, (i, j) => shares3(mol.rings[i], mol.rings[j]));
    if (best.length < 2 || best.length === sys.rings.length) return null;
    const core: RingSystem = { rings: best, atoms: [...new Set(best.flatMap((i) => mol.rings[i]))] };
    return isCage(mol, core) ? core : null;
  }
  const cages: number[][] = [];
  for (const rings of sets) {
    const best = largestGroup(rings, shares3);
    if (best.length < 2) return null;
    const atoms = [...new Set(best.flat())];
    const metal = atoms.some((a) => mol.el[a] === "*" || isMetal(mol.el[a]));
    if (metal || atoms.length > 16 || best.some((r) => r.length > 8) || !allBridged(atoms, best)) return null;
    cages.push(atoms);
  }
  const inside = new Set(cages[0].filter((a) => cages.every((c) => c.includes(a))));
  const rings = sys.rings.filter((i) => mol.rings[i].every((a) => inside.has(a)));
  if (rings.length < 2 || rings.length === sys.rings.length) return null;
  const core: RingSystem = { rings, atoms: [...new Set(rings.flatMap((i) => mol.rings[i]))] };
  return isCage(mol, core) ? core : null;
}

const shares3 = (p: readonly number[], q: readonly number[]) => p.filter((a) => q.includes(a)).length >= 3;

/** The largest group of rings joined each to another by `joined`, the first of the largest in the order given. */
function largestGroup<T>(rings: readonly T[], joined: (p: T, q: T) => boolean): T[] {
  const seen = new Set<T>();
  let best: T[] = [];
  for (const start of rings) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let k = 0; k < group.length; k++)
      for (const j of rings) {
        if (seen.has(j) || !joined(group[k], j)) continue;
        seen.add(j);
        group.push(j);
      }
    if (group.length > best.length) best = group;
  }
  return best;
}

/**
 * Whether a solid drawn in perspective has each of its stereocentres - those
 * with three bonds or more within `atoms` - as given, read from where its
 * atoms are on the page and how near the viewer each is. A cage's own shape
 * fixes its centres; rings fused round a middle do not - a ring fusion is
 * cis or trans with the same bonds between the same atoms - so a solid found
 * from how far apart the bonds put its atoms may have one the wrong way.
 */
export function keepsConfigurations(mol: Molecule, atoms: readonly number[], pos: Map<number, Point>, depth: Map<number, number>): boolean {
  return turnedConfigurations(mol, atoms, pos, depth) === 0;
}

/** How many of those stereocentres the drawing shows the other way, or not at all. */
export function turnedConfigurations(mol: Molecule, atoms: readonly number[], pos: Map<number, Point>, depth: Map<number, number>): number {
  const inside = new Set(atoms);
  const at = (a: number): Vec3 => [pos.get(a)!.x, pos.get(a)!.y, depth.get(a) ?? 0];
  let turned = 0;
  for (const c of atoms) {
    const t = mol.tetra.get(c);
    if (!t) continue;
    const known = t.neighbours.map((n, k) => [n, k] as const).filter(([n]) => n >= 0 && inside.has(n));
    if (known.length < 3) continue;
    // (each three of its four that span a volume - three in one plane, a
    // flat ring's, say nothing - as the volume of the first three says it:
    // the same, or the other way, by which one is left out; a centre none
    // of whose threes spans one shows nothing)
    const p = at(c);
    const signs = [0, 1, 2, 3].flatMap((left) => {
      const three = known.filter(([, k]) => k !== left);
      if (three.length !== 3) return [];
      const v = three.map(([n]) => subV(at(n), p));
      const d = dotV(v[0], crossV(v[1], v[2]));
      return Math.abs(d) < 1e-6 ? [] : [Math.sign(d) === t.volume * (left % 2 === 1 ? 1 : -1)];
    });
    if (!signs.length || signs.includes(false)) turned++;
  }
  return turned;
}

/** How badly a flat layout of a ring system reads, by the same measure. */
export function flatCost(
  mol: Molecule,
  sys: RingSystem,
  pos: Map<number, Point>,
  depth?: Map<number, number>,
  /** And whether the room its bonds out of the system have is counted: in choosing between flat and solid. */
  room = false,
  /** Only its faults (viewCost). */
  faultsOnly = false,
): number {
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (index.has(a) && index.has(b)) bonds.push([index.get(a)!, index.get(b)!]);
  }
  const pts = atoms.map((a) => pos.get(a)!);
  return viewCost(pts, bonds, 0.6, 0.3, depth && atoms.map((a) => depth.get(a) ?? 0), faultsOnly) + (room ? roomFault(mol, sys, pos, pts, bonds) : 0);
}

/**
 * Where the system's atoms have bonds out of it, how badly the first of
 * them would sit where the drawing leaves it room - out of the atom's
 * rings: on another of the system's atoms, or on one of its bonds. A
 * one-atom bridge drawn across a ring's face leaves its substituent none
 * (huperzine A's ethylidene, laid on the ring it crossed).
 */
function roomFault(mol: Molecule, sys: RingSystem, pos: Map<number, Point>, pts: readonly Point[], bonds: readonly [number, number][]): number {
  const inSys = new Set(sys.atoms);
  const lens = bonds.map(([a, b]) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / Math.max(lens.length, 1);
  let fault = 0;
  sys.atoms.forEach((a, i) => {
    const out = mol.neighbours[a].filter((b) => !inSys.has(b));
    if (!out.length) return;
    const at = pts[i];
    const own = mol.neighbours[a].filter((b) => inSys.has(b)).map((b) => Math.atan2(pos.get(b)!.y - at.y, pos.get(b)!.x - at.x));
    const centres = mol.ringsOf[a]
      .filter((r) => sys.rings.includes(r))
      .map((r) => {
        const c = centroid(mol.rings[r].map((v) => pos.get(v)!));
        return Math.atan2(c.y - at.y, c.x - at.x);
      });
    const [t] = splitOutside(own, centres, 1);
    if (t == null) return;
    const p = { x: at.x + mean * Math.cos(t), y: at.y + mean * Math.sin(t) };
    if (pts.some((q, j) => j !== i && Math.hypot(q.x - p.x, q.y - p.y) < 0.5 * mean)) fault += 5;
    else if (
      bonds.some(([u, v]) => {
        if (u === i || v === i) return false;
        const vx = pts[v].x - pts[u].x;
        const vy = pts[v].y - pts[u].y;
        const l2 = vx * vx + vy * vy;
        const k = l2 ? Math.max(0, Math.min(1, ((p.x - pts[u].x) * vx + (p.y - pts[u].y) * vy) / l2)) : 0;
        return Math.hypot(p.x - (pts[u].x + k * vx), p.y - (pts[u].y + k * vy)) < 0.25 * mean;
      })
    )
      fault += 3;
  });
  return fault;
}
