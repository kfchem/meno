/**
 * A ring system bridged across a ring that is fused into it - morphine's
 * piperidine across its phenanthrene, artemisinin's peroxide across its
 * seven-membered ring - drawn flat, the way a chemist draws it: the fused
 * rings flat and regular, as though the bridge were not there, and the
 * bridge a short path of bonds across the face of a ring, in front of it or
 * behind it as the molecule has it (docs/LAYOUT-2D.md, section 2). Where the
 * bridge passes over a bond, the bond behind is drawn broken.
 */
import { affineFit, solidOf, turnedConfigurations } from "./cage";
import { add, dir, dist, segmentsCross, sub, type Point } from "./geometry";
import type { Molecule, RingSystem } from "./perceive";
import { placeRingSystem } from "./ringSystem";

export type Bridged = {
  pos: Map<number, Point>;
  /** 0 for the flat rings; 1 for a bridge in front of them, -1 for one behind. */
  depth: Map<number, number>;
  /** How well it reads, as `flatCost` counts. */
  cost: number;
};

/** A bridge: its atoms in order from the end bonded to `from` to the end bonded to `to`. */
type Path = { from: number; to: number; atoms: number[] };

/**
 * The rings to draw flat and the bridges to draw across them: rings taken
 * out, fewest first, until those left share no more than a side with each
 * other; the atoms of the rings taken out that are in none left are the
 * bridges, each a path between two atoms of the flat rings.
 */
function splits(mol: Molecule, sys: RingSystem): { core: number[]; paths: Path[] }[] {
  const rings = sys.rings;
  const shared = (p: number, q: number) => mol.rings[p].filter((a) => mol.rings[q].includes(a)).length;
  const bridged = rings.flatMap((p, i) => rings.slice(i + 1).filter((q) => shared(p, q) >= 3).map((q) => [p, q]));
  if (!bridged.length) return [];
  const removable = [...new Set(bridged.flat())];
  const sets: number[][] = removable.map((r) => [r]);
  for (let i = 0; i < removable.length; i++) {
    for (let j = i + 1; j < removable.length; j++) sets.push([removable[i], removable[j]]);
  }
  const out: { core: number[]; paths: Path[] }[] = [];
  for (const gone of sets) {
    const core = rings.filter((r) => !gone.includes(r));
    if (!core.length) continue;
    if (core.some((p, i) => core.slice(i + 1).some((q) => shared(p, q) >= 3))) continue;
    // the flat rings one piece
    const reached = new Set([core[0]]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of core) {
        if (reached.has(r)) continue;
        if ([...reached].some((q) => shared(q, r) >= 1)) {
          reached.add(r);
          grew = true;
        }
      }
    }
    if (reached.size !== core.length) continue;
    const inCore = new Set(core.flatMap((r) => mol.rings[r]));
    const rest = sys.atoms.filter((a) => !inCore.has(a));
    const paths = pathsOf(mol, rest, inCore);
    if (paths) out.push({ core, paths });
  }
  return out;
}

/** The atoms left over as bridges, or null where they are not simple paths between two flat atoms. */
function pathsOf(mol: Molecule, rest: number[], inCore: Set<number>): Path[] | null {
  const left = new Set(rest);
  const paths: Path[] = [];
  const seen = new Set<number>();
  for (const a of rest) {
    if (seen.has(a)) continue;
    const group: number[] = [];
    const todo = [a];
    seen.add(a);
    while (todo.length) {
      const u = todo.pop()!;
      group.push(u);
      for (const v of mol.neighbours[u]) {
        if (left.has(v) && !seen.has(v)) {
          seen.add(v);
          todo.push(v);
        }
      }
    }
    const within = (u: number) => mol.neighbours[u].filter((v) => left.has(v) && group.includes(v));
    const onto = (u: number) => mol.neighbours[u].filter((v) => inCore.has(v));
    if (group.some((u) => within(u).length > 2)) return null;
    const ends = group.filter((u) => within(u).length < 2);
    const links = group.reduce((s, u) => s + onto(u).length, 0);
    if (links !== 2) return null;
    let start: number;
    if (group.length === 1) {
      if (onto(group[0]).length !== 2) return null;
      start = group[0];
    } else {
      if (ends.length !== 2 || ends.some((u) => onto(u).length !== 1)) return null;
      start = ends[0];
    }
    const order = [start];
    while (order.length < group.length) {
      const next = within(order[order.length - 1]).find((v) => !order.includes(v));
      if (next == null) return null;
      order.push(next);
    }
    const first = onto(order[0]);
    const last = onto(order[order.length - 1]);
    const from = first[0];
    const to = group.length === 1 ? first[1] : last[0];
    paths.push({ from, to, atoms: order });
  }
  return paths;
}

/** The two points a bond's length from both `p` and `q`, if there are any. */
function apexes(p: Point, q: Point): Point[] {
  const d = dist(p, q);
  if (d > 2 || d < 1e-9) return [];
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const h = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
  const u = { x: (q.y - p.y) / d, y: -(q.x - p.x) / d };
  return [add(m, { x: u.x * h, y: u.y * h }), add(m, { x: -u.x * h, y: -u.y * h })];
}

/**
 * The bridge's atoms laid on the flat rings: every way of setting its
 * bonds, a bond's length each, in steps round each atom, the last closing
 * onto the far end - and the one kept that crowds nothing, crosses fewest
 * bonds (each drawn broken behind it), and turns its bonds most nearly as
 * a chain's are.
 */
/** Whether a point lies inside a polygon, its corners in order. */
function inside(p: Point, poly: readonly Point[]): boolean {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}

function layPath(
  mol: Molecule,
  path: Path,
  pos: Map<number, Point>,
  bonds: [number, number][],
): { at: Point[]; cost: number } | null {
  const P = pos.get(path.from)!;
  const Q = pos.get(path.to)!;
  const k = path.atoms.length;
  if (k > 4) return null;
  const inSystem = new Set([...pos.keys(), ...path.atoms]);
  const steps = k <= 3 ? 36 : 18;
  const others = [...pos.entries()];
  const middles = mol.rings
    .filter((r) => r.every((a) => pos.has(a)))
    .map((r) => {
      const ps = r.map((a) => pos.get(a)!);
      return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
    });
  let best: { at: Point[]; cost: number } | null = null;
  const judge = (at: Point[], bonus = 0) => {
    let cost = bonus;
    const chain = [P, ...at, Q];
    at.forEach((p, i) => {
      for (const [a, o] of others) {
        const d = dist(p, o);
        const room = mol.el[path.atoms[i]] !== "C" || mol.el[a] !== "C" ? 0.9 : 0.75;
        if (d < 0.5) cost += 20;
        else if (d < room) cost += (room - d) * 20;
      }
      for (let j = 0; j < i - 1; j++) if (dist(p, at[j]) < 0.9) cost += 10;
      // (an atom at a ring's middle reads as a spoke of it)
      for (const c of middles) if (dist(p, c) < 0.45) cost += 3;
    });
    // (nor closed round an atom with a group of its own - huperzine A's
    // ethylidene carbon, its group then with no room but on the bridge)
    for (const [a, o] of others) {
      if (a === path.from || a === path.to || !mol.neighbours[a].some((b) => !inSystem.has(b))) continue;
      if (inside(o, chain)) cost += 15;
    }
    // bonds it passes over, and atoms it passes through
    for (let i = 0; i + 1 < chain.length; i++) {
      for (const [a, b] of bonds) {
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        if (a === path.from || b === path.from || a === path.to || b === path.to) {
          // (a bond out of the same atom: only too near in angle)
          continue;
        }
        if (segmentsCross(chain[i], chain[i + 1], pa, pb)) cost += 0.5;
      }
    }
    // a chain's angles, and room at the ends among the rings' bonds there
    for (let i = 1; i + 1 < chain.length; i++) {
      const u = sub(chain[i - 1], chain[i]);
      const v = sub(chain[i + 1], chain[i]);
      const t = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)))));
      cost += ((t * 180) / Math.PI - 120) ** 2 / 3600;
    }
    for (const [end, next] of [
      [path.from, at[0]],
      [path.to, at[at.length - 1]],
    ] as const) {
      const e = pos.get(end)!;
      const out = Math.atan2(next.y - e.y, next.x - e.x);
      for (const n of mol.neighbours[end]) {
        const p = pos.get(n);
        if (!p) continue;
        let d = Math.abs(Math.atan2(p.y - e.y, p.x - e.x) - out);
        if (d > Math.PI) d = 2 * Math.PI - d;
        const deg = (d * 180) / Math.PI;
        if (deg < 50) cost += (50 - deg) / 10;
      }
    }
    if (!best || cost < best.cost) best = { at, cost };
  };
  const grow = (at: Point[]) => {
    const last = at.length ? at[at.length - 1] : P;
    if (at.length === k - 1) {
      for (const p of apexes(last, Q)) judge([...at, p]);
      return;
    }
    for (let s = 0; s < steps; s++) grow([...at, add(last, dir((s * 2 * Math.PI) / steps))]);
  };
  grow([]);
  // A bridge as long as a path of the flat rings between its ends is drawn
  // as that path set off by a bond's length - the ring they make together
  // the chair or boat it is, by the template cages are drawn by (a
  // morphinan's piperidine below its B ring).
  for (const along of pathsBetween(path.from, path.to, k, bonds)) {
    for (let s = 0; s < 24; s++) {
      const o = dir((s * Math.PI) / 12);
      judge(
        along.map((a) => add(pos.get(a)!, o)),
        -6,
      );
    }
  }
  return best;
}

/**
 * The molecule with every simple cycle of the system as long as its
 * longest ring in the smallest set added to its rings (up to a few dozen),
 * and the system with them.
 */
function withSmallRings(mol: Molecule, sys: RingSystem): { mol: Molecule; sys: RingSystem } {
  const longest = Math.max(...sys.rings.map((r) => mol.rings[r].length));
  const inside = new Set(sys.atoms);
  const have = new Set(sys.rings.map((r) => [...mol.rings[r]].sort((p, q) => p - q).join(",")));
  const extra: number[][] = [];
  const seen = new Set<string>();
  const walk = (path: number[]) => {
    if (extra.length >= SMALL_RINGS_MAX) return;
    const last = path[path.length - 1];
    for (const b of mol.neighbours[last]) {
      if (!inside.has(b)) continue;
      if (b === path[0] && path.length >= 3) {
        const k = [...path].sort((p, q) => p - q).join(",");
        if (!have.has(k) && !seen.has(k)) {
          seen.add(k);
          extra.push(path);
        }
        continue;
      }
      if (path.length < longest && b > path[0] && !path.includes(b)) walk([...path, b]);
    }
  };
  for (const a of [...sys.atoms].sort((p, q) => p - q)) walk([a]);
  if (!extra.length) return { mol, sys };
  return {
    mol: { ...mol, rings: [...mol.rings, ...extra] },
    sys: { atoms: sys.atoms, rings: [...sys.rings, ...extra.map((_, i) => mol.rings.length + i)] },
  };
}

/** How many small rings beyond the smallest set's a system is looked at with, at most (`withSmallRings`). */
const SMALL_RINGS_MAX = 24;

/** The paths of `count` atoms from `from` to `to` along the given bonds. */
function pathsBetween(from: number, to: number, count: number, bonds: [number, number][]): number[][] {
  const next = new Map<number, number[]>();
  for (const [a, b] of bonds) {
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  const out: number[][] = [];
  const walk = (at: number[]) => {
    const last = at[at.length - 1];
    if (at.length === count) {
      if (last === to) out.push(at);
      return;
    }
    for (const v of next.get(last) ?? []) if (!at.includes(v)) walk([...at, v]);
  };
  walk([from]);
  return out;
}

/**
 * The system drawn flat with its bridges across it, the best of the ways
 * of choosing which rings to draw flat; null if it has no bridge that can
 * be drawn so.
 */
export function bridgeAcross(given: Molecule, givenSys: RingSystem): Bridged | null {
  // (from every small ring of the system, not the smallest set's alone:
  // which of rings as long that set takes is a tie - the dihydroanthracene
  // under an ethano bridge has its middle ring, or the two the bridge
  // makes, by the order its atoms come in - and the rings drawn flat are
  // looked for among them all)
  const { mol, sys } = withSmallRings(given, givenSys);
  const options = splits(mol, sys);
  if (!options.length) return null;
  let best: { pos: Map<number, Point>; paths: Path[]; cost: number } | null = null;
  for (const { core, paths } of options) {
    const coreAtoms = [...new Set(core.flatMap((r) => mol.rings[r]))];
    const pos = placeRingSystem(mol, { atoms: coreAtoms, rings: core });
    if (coreAtoms.some((a) => !pos.has(a))) continue;
    // the flat rings' bonds, and any bond between them no ring left holds
    const bonds: [number, number][] = [];
    let cost = 0;
    for (const [k] of mol.bondIndex) {
      const [a, b] = k.split(",").map(Number);
      if (!pos.has(a) || !pos.has(b)) continue;
      bonds.push([a, b]);
      cost += Math.abs(dist(pos.get(a)!, pos.get(b)!) - 1) * 10;
    }
    let ok = true;
    for (const path of paths) {
      const laid = layPath(mol, path, pos, bonds);
      if (!laid) {
        ok = false;
        break;
      }
      cost += laid.cost;
      path.atoms.forEach((a, i) => pos.set(a, laid.at[i]));
      const chain = [path.from, ...path.atoms, path.to];
      for (let i = 0; i + 1 < chain.length; i++) bonds.push([chain[i], chain[i + 1]]);
    }
    if (!ok) continue;
    if (!best || cost < best.cost) best = { pos, paths, cost };
  }
  if (!best) return null;
  // in front of the flat rings or behind them, as the solid has it
  const solid = solidOf(given, givenSys);
  const flat = givenSys.atoms.filter((a) => !best!.paths.some((p) => p.atoms.includes(a)));
  const fit = affineFit(
    flat.map((a) => solid.get(a)!),
    flat.map((a) => best!.pos.get(a)!),
  );
  const lx = [fit.x[0], fit.x[1], fit.x[2]];
  const ly = [fit.y[0], fit.y[1], fit.y[2]];
  const view = [lx[1] * ly[2] - lx[2] * ly[1], lx[2] * ly[0] - lx[0] * ly[2], lx[0] * ly[1] - lx[1] * ly[0]];
  const mid = [0, 1, 2].map((c) => flat.reduce((s, a) => s + solid.get(a)![c], 0) / flat.length);
  const sides = best.paths.map((path) =>
    path.atoms.reduce((s, a) => s + [0, 1, 2].reduce((t, c) => t + (solid.get(a)![c] - mid[c]) * view[c], 0), 0) >= 0 ? 1 : -1,
  );
  const depthOf = (turn: number) => {
    const depth = new Map<number, number>(givenSys.atoms.map((a) => [a, 0]));
    best!.paths.forEach((path, k) => path.atoms.forEach((a) => depth.set(a, ((turn >> k) & 1 ? -1 : 1) * sides[k])));
    return depth;
  };
  // - but where that has a stereocentre the other way, the side that shows
  // them all as given: a solid found from how far apart the bonds put its
  // atoms can have a ring fusion trans that is cis (a diastereomer of
  // morphine, epimeric at C5, had its bridge on the wrong face and C9 read
  // the other way)
  let depth = depthOf(0);
  let turned = turnedConfigurations(given, givenSys.atoms, best.pos, depth);
  for (let turn = 1; turned && turn < 1 << Math.min(best.paths.length, 4); turn++) {
    const other = depthOf(turn);
    const t = turnedConfigurations(given, givenSys.atoms, best.pos, other);
    if (t < turned) [depth, turned] = [other, t];
  }
  return { pos: best.pos, depth, cost: best.cost };
}
