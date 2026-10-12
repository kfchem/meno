/**
 * A ring system laid out on its own, in a frame of its own: its rings as
 * regular polygons on the lattice, one after another.
 *
 * The first ring is set square on the lattice - a six-membered ring with two
 * sides upright - or, where the system has a macrocycle, the macrocycle is
 * first, drawn as a chain closed on itself. Each ring after it has some of
 * its atoms placed already, by the rings before it; the rest of the ring is
 * a run of atoms between two placed ones, laid on the arc of the ring's own
 * regular polygon between them. On a shared side, that is the regular
 * polygon fused on that side. Where more of the ring is placed - a ring
 * fused on two sides at once, as in pyrene, or a bridge - it is the part of
 * the polygon the placed atoms leave, on whichever side has room.
 */
import {
  add,
  angleOf,
  centroid,
  cross,
  dir,
  dist,
  len,
  norm,
  scale,
  segmentsCross,
  splitWidestGap,
  sub,
  type Point,
} from "./geometry";
import { macrocycleShapes } from "./macrocycle";
import type { Molecule, RingSystem } from "./perceive";

/** Rings this size and over are macrocycles, drawn as a closed zigzag. */
export const MACROCYCLE = 9;

/** The circumradius of a regular polygon of `n` sides of length 1. */
const radius = (n: number) => 1 / (2 * Math.sin(Math.PI / n));

/**
 * The angle of a regular ring's first atom, round from its centre, that sets
 * it square: a triangle, pentagon, hexagon or heptagon with an apex at the
 * top; a square or octagon with a side level at the top.
 */
function squareStart(n: number): number {
  return n === 4 || n === 8 ? Math.PI / 2 + Math.PI / n : Math.PI / 2;
}

/** How many ways a ring system can be laid out: one per macrocycle shape offered. */
/**
 * A system of macrocycles strung through six-membered rings with chains
 * between (vancomycin) starts from the ring the most of them run through:
 * the macrocycles are then chains drawn between rings already regular.
 * That ring, or null for any other system.
 */
function hubOf(rings: number[][]): number[] | null {
  const macro = rings.filter((r) => r.length >= MACROCYCLE);
  if (macro.length < 2) return null;
  const runsThrough = (r: number[]) => macro.filter((m) => r.filter((a) => m.includes(a)).length >= 3).length;
  const hubs = rings.filter((r) => r.length === 6 && runsThrough(r) >= 2);
  return hubs.sort((p, q) => runsThrough(q) - runsThrough(p))[0] ?? null;
}

export function ringSystemVariants(mol: Molecule, sys: RingSystem): number {
  const rings = sys.rings.map((i) => mol.rings[i]);
  const big = Math.max(0, ...rings.map((r) => r.length));
  if (big < MACROCYCLE || hubOf(rings)) return 1;
  return macrocycleShapes(big).length;
}

export function placeRingSystem(
  mol: Molecule,
  sys: RingSystem,
  variant = 0,
  start?: number,
): Map<number, Point> {
  const pos = new Map<number, Point>();
  const rings = sys.rings.map((i) => mol.rings[i]);
  const placedRing = new Set<number>();

  // first: the largest macrocycle; else a six-membered ring, or a four,
  // among the most fused; else the largest ring
  const fusedCount = (r: number[]) =>
    rings.filter((q) => q !== r && q.filter((a) => r.includes(a)).length >= 2).length;
  // (a ring that can lie square on the lattice - six, then four - sets the
  // system square)
  const fit = (r: number[]) => (r.length === 6 ? 2 : r.length === 4 ? 1 : 0);
  // and a ring a larger one is bridged across (sharing three atoms or more)
  // before others: it stays regular, and the larger ring arcs round from it,
  // the bridge inside - taxol's A ring, and its eight-membered B
  const bridgedFrom = (r: number[]) =>
    rings.some((q) => q !== r && q.length > r.length && q.filter((a) => r.includes(a)).length >= 3) ? 1 : 0;
  const ordered = [...rings].sort((p, q) => {
    const pm = p.length >= MACROCYCLE ? p.length : 0;
    const qm = q.length >= MACROCYCLE ? q.length : 0;
    if (pm !== qm) return qm - pm;
    if (fit(p) !== fit(q)) return fit(q) - fit(p);
    if (bridgedFrom(p) !== bridgedFrom(q)) return bridgedFrom(q) - bridgedFrom(p);
    const f = fusedCount(q) - fusedCount(p);
    if (f) return f;
    return q.length - p.length;
  });
  // (or the ring asked for: a bridged system is tried from each)
  const first = start != null ? mol.rings[start] : hubOf(rings) ?? ordered[0];

  // a macrocycle that runs mostly through other rings is a ring of rings,
  // round a circle; one that runs through a ring or two on its way
  // (sirolimus's pyran) is still a chain closed on itself, never round
  const through = new Set(
    rings
      .filter((r) => r !== first && r.filter((a) => first.includes(a)).length >= 3)
      .flatMap((r) => r.filter((a) => first.includes(a))),
  );
  const shapes = first.length >= MACROCYCLE ? macrocycleShapes(first.length) : [];
  if (first.length >= MACROCYCLE && through.size >= 0.4 * first.length && shortLinks(first, through)) {
    ringOfBlocks(mol, first, rings, pos).forEach((i) => placedRing.add(i));
  } else if (first.length >= MACROCYCLE) {
    const shape = shapes[variant % shapes.length];
    const at = macrocycleFit(mol, first, shape, rings);
    first.forEach((a, i) => pos.set(a, shape[at(i)]));
  } else {
    const r = radius(first.length);
    const t0 = squareStart(first.length);
    first.forEach((a, i) => pos.set(a, scale(dir(t0 - (i * 2 * Math.PI) / first.length), r)));
  }
  placedRing.add(rings.indexOf(first));

  // A bridged pair of rings has three bridges between its bridgeheads: the
  // path they share and each one's own. The shortest is drawn inside the
  // other two (taxol's gem-dimethyl carbon, artemisinin's peroxide). Where
  // it is one ring's own path, that ring waits until the other is down, so
  // the other is laid out whole and the bridge crosses it.
  const waitsFor = new Map<number, number>();
  rings.forEach((r, i) =>
    rings.forEach((q, j) => {
      if (i === j) return;
      const shared = r.filter((a) => q.includes(a));
      if (shared.length < 3) return;
      const own = r.filter((a) => !q.includes(a));
      const theirs = q.filter((a) => !r.includes(a));
      const ends = shared.filter((a) => {
        const k = r.indexOf(a);
        return !shared.includes(r[(k + 1) % r.length]) || !shared.includes(r[(k - 1 + r.length) % r.length]);
      });
      const inner = shared.filter((a) => !ends.includes(a));
      // on a tie, the bridge that is fused to nothing else goes inside
      const elsewhere = (path: number[]) =>
        path.filter((a) => rings.some((o) => o !== r && o !== q && o.includes(a))).length;
      const weigh = (path: number[]) => path.length + 0.1 * elsewhere(path);
      if (weigh(own) < weigh(theirs) && weigh(own) < weigh(inner)) waitsFor.set(i, j);
    }),
  );

  while (placedRing.size < rings.length) {
    // next: the ring most fused to what is placed - on a side before a
    // bridge, a bridge before one touching at an atom (spiro)
    let next = -1;
    let nextRank = -Infinity;
    rings.forEach((r, i) => {
      if (placedRing.has(i)) return;
      const shared = r.filter((a) => pos.has(a)).length;
      if (!shared) return;
      const waiting = waitsFor.has(i) && !placedRing.has(waitsFor.get(i)!);
      const rank =
        (waiting ? -5000 : 0) +
        (shared === 2 ? 1000 : shared > 2 ? 500 : 0) +
        (r.length === 6 ? 50 : 0) +
        (r.length < MACROCYCLE ? 20 : 0) -
        r.length;
      if (rank > nextRank) {
        nextRank = rank;
        next = i;
      }
    });
    if (next < 0) break;
    placeRing(rings[next], pos, rings);
    placedRing.add(next);
  }
  return pos;
}

/**
 * The rings of a system not yet placed, placed onto those that are - fused
 * on a side first, then bridged, then touching at an atom - as
 * `placeRingSystem` places them all: the rings fused to a cage's core once
 * the core is drawn in perspective (engine `layoutSystem`).
 */
export function extendRingSystem(mol: Molecule, sys: RingSystem, pos: Map<number, Point>): void {
  const rings = sys.rings.map((i) => mol.rings[i]);
  const placed = new Set(rings.flatMap((r, i) => (r.every((a) => pos.has(a)) ? [i] : [])));
  while (placed.size < rings.length) {
    let next = -1;
    let nextRank = -Infinity;
    rings.forEach((r, i) => {
      if (placed.has(i)) return;
      const shared = r.filter((a) => pos.has(a)).length;
      if (!shared) return;
      const rank = (shared === 2 ? 1000 : shared > 2 ? 500 : 0) + (r.length === 6 ? 50 : 0) + (r.length < MACROCYCLE ? 20 : 0) - r.length;
      if (rank > nextRank) {
        nextRank = rank;
        next = i;
      }
    });
    if (next < 0) break;
    placeRing(rings[next], pos, rings);
    placed.add(next);
  }
}

/**
 * Whether the rings a macrocycle runs through are each linked to the next
 * by no more than two atoms - a porphyrin's meso carbons, a cyclodextrin's
 * glycosidic oxygens - so that it is rings strung together, and nothing
 * else, rather than a chain with rings in it (vancomycin's peptide).
 */
function shortLinks(ring: number[], through: Set<number>): boolean {
  const start = ring.findIndex((a) => through.has(a));
  if (start < 0) return false;
  let run = 0;
  for (let k = 1; k <= ring.length; k++) {
    if (through.has(ring[(start + k) % ring.length])) run = 0;
    else if (++run > 2) return false;
  }
  return true;
}

/**
 * A macrocycle that runs through other rings, not along their sides - the
 * pyrroles of a porphyrin, the glucoses of a cyclodextrin, the aromatic
 * rings of vancomycin: a ring of rings. Each group of those rings is laid
 * out on its own, and stands in the macrocycle as one straight side from
 * where the macrocycle enters it to where it leaves; the macrocycle, so
 * shortened, is set round a circle, and each group hung on its side with
 * the rest of it outside. Returns the rings it placed, by index.
 */
function ringOfBlocks(
  mol: Molecule,
  macro: number[],
  rings: number[][],
  pos: Map<number, Point>,
): number[] {
  const n = macro.length;
  const others = rings.map((_, i) => i).filter((i) => rings[i] !== macro);
  // groups: rings fused to each other
  const group = new Map<number, number>();
  others.forEach((i) => group.set(i, i));
  const find = (i: number): number => (group.get(i) === i ? i : find(group.get(i)!));
  for (const i of others) {
    for (const j of others) {
      if (i < j && rings[i].filter((a) => rings[j].includes(a)).length >= 2) group.set(find(j), find(i));
    }
  }
  const blocks = new Map<number, number[]>();
  for (const i of others) blocks.set(find(i), [...(blocks.get(find(i)) ?? []), i]);
  const inMacro = new Set(macro);
  type Block = { rings: number[]; path: number[]; local: Map<number, Point> };
  const threads: Block[] = [];
  for (const members of blocks.values()) {
    const atoms = new Set(members.flatMap((i) => rings[i]));
    const shared = macro.map((a, i) => (atoms.has(a) ? i : -1)).filter((i) => i >= 0);
    if (shared.length < 3) continue;
    // the run of the macrocycle through the block, in the macrocycle's order
    const start = shared.find((i) => !atoms.has(macro[(i - 1 + n) % n]));
    if (start == null) continue;
    const path: number[] = [];
    for (let k = 0; k < n && atoms.has(macro[(start + k) % n]); k++) path.push(macro[(start + k) % n]);
    if (path.length !== shared.length) continue;
    const sub = { atoms: [...atoms], rings: members.map((i) => mol.rings.indexOf(rings[i])) };
    threads.push({ rings: members, path, local: placeRingSystem(mol, sub) });
  }
  // the macrocycle's sides: a bond, or a block from its first atom to its last
  const blockAt = new Map<number, Block>();
  for (const b of threads) blockAt.set(b.path[0], b);
  const corners: number[] = [];
  const sides: number[] = [];
  const firstCorner = macro.findIndex((a, i) => {
    const prev = macro[(i - 1 + n) % n];
    return !threads.some((b) => b.path.includes(a) && b.path.includes(prev) && a !== b.path[0]);
  });
  for (let k = 0; k < n; ) {
    const a = macro[(firstCorner + k) % n];
    corners.push(a);
    const b = blockAt.get(a);
    if (b) {
      sides.push(dist(b.local.get(b.path[0])!, b.local.get(b.path[b.path.length - 1])!));
      k += b.path.length - 1;
    } else {
      sides.push(1);
      k += 1;
    }
  }
  // round a circle: the radius at which the sides' angles close the ring
  const turns = (r: number) => sides.reduce((sum, l) => sum + 2 * Math.asin(Math.min(1, l / (2 * r))), 0);
  let lo = Math.max(...sides) / 2;
  let hi = sides.reduce((sum, l) => sum + l, 0);
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (turns(mid) > 2 * Math.PI) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  let t = Math.PI / 2;
  corners.forEach((a, i) => {
    pos.set(a, scale(dir(t), r));
    t -= 2 * Math.asin(Math.min(1, sides[i] / (2 * r)));
  });
  // each block on its side, the rest of it outside the circle
  for (const b of threads) {
    const p0 = pos.get(b.path[0])!;
    const p1 = pos.get(b.path[b.path.length - 1])!;
    const l0 = b.local.get(b.path[0])!;
    const l1 = b.local.get(b.path[b.path.length - 1])!;
    const rest = [...b.local.keys()].filter((a) => !b.path.includes(a));
    let best: Map<number, Point> | null = null;
    let bestOut = -Infinity;
    for (const flipped of [false, true]) {
      const src = (p: Point) => (flipped ? { x: p.x, y: -p.y } : p);
      const a0 = src(l0);
      const a1 = src(l1);
      const turn = angleOf(sub(p1, p0)) - angleOf(sub(a1, a0));
      const place = (p: Point) => {
        const q = sub(src(p), a0);
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        return add(p0, { x: q.x * c - q.y * sn, y: q.x * sn + q.y * c });
      };
      const placed = new Map<number, Point>();
      for (const [a, p] of b.local) placed.set(a, place(p));
      const out = rest.length ? rest.reduce((sum, a) => sum + len(placed.get(a)!), 0) / rest.length : 0;
      if (out > bestOut) {
        bestOut = out;
        best = placed;
      }
    }
    for (const [a, p] of best!) if (!inMacro.has(a) || !pos.has(a)) pos.set(a, p);
  }
  return [rings.indexOf(macro), ...threads.flatMap((b) => b.rings)];
}

/**
 * Which corner of the macrocycle's shape each of its atoms takes (as a map
 * from the atom's place in the ring to the shape's). A zigzag's corners
 * alternate: one points out, with room for what hangs there; the next points
 * in, with room for nothing. So the atoms that carry something - a branch, a
 * ring fused on - take the corners that point out, the bare CH2s the ones
 * that point in: of every way round the shape, and either direction, the
 * one that leaves the least on corners pointing in.
 */
function macrocycleFit(
  mol: Molecule,
  ring: number[],
  shape: Point[],
  rings: number[][],
): (i: number) => number {
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += cross(shape[i], shape[(i + 1) % n]);
  const inward = shape.map((p, i) => {
    const prev = shape[(i - 1 + n) % n];
    const next = shape[(i + 1) % n];
    // a turn against the way round is a corner pointing in
    return Math.sign(cross(sub(p, prev), sub(next, p))) * Math.sign(area) < 0;
  });
  const inRing = new Set(ring);
  // how much hangs off each atom of the ring, a few atoms deep
  const load = ring.map((a) => {
    let weight = 0;
    for (const b of mol.neighbours[a]) {
      if (inRing.has(b)) continue;
      const seen = new Set([a, b]);
      const todo = [b];
      while (todo.length && seen.size < 8) {
        const u = todo.pop()!;
        for (const v of mol.neighbours[u]) {
          if (!seen.has(v) && !inRing.has(v)) {
            seen.add(v);
            todo.push(v);
          }
        }
      }
      // (a double-bonded O as much as a methyl and a half: a C=O inside
      // the ring crowds it more than a methyl does)
      const double = mol.bonds[mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!].order === 2;
      weight += (double ? 1.5 : 1) + 0.5 * (seen.size - 2);
    }
    return weight;
  });
  // A ring the macrocycle runs through (three atoms or more of it): through
  // three, across a corner of it, the ring stands outside the macrocycle
  // where that corner points in - its middle atom on a corner pointing in;
  // through more, the ring can only lie inside a corner pointing out.
  // A ring fused on a side: a regular ring there needs both ends of that
  // side to be corners pointing out - at one pointing in, its next side
  // would run along the macrocycle's own bond. Along a zigzag the corners
  // alternate, so fused rings go where the shape turns, at its corners.
  const pointIn: number[] = [];
  const pointOut: number[] = [];
  for (const r of rings) {
    if (r === ring) continue;
    const shared = ring.map((a, i) => (r.includes(a) ? i : -1)).filter((i) => i >= 0);
    if (shared.length === 2) pointOut.push(...shared);
    if (shared.length < 3) continue;
    for (const i of shared) {
      if (!r.includes(ring[(i - 1 + n) % n]) || !r.includes(ring[(i + 1) % n])) continue;
      (shared.length === 3 ? pointIn : pointOut).push(i);
    }
  }
  // a double bond in the ring keeps its cis or trans: taken against the
  // ring atoms either side of it (a substituent is on the other side from
  // its ring neighbour, so a configuration given against it is turned round)
  const fixed: { i: number; cis: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const bi = mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`);
    const st = bi != null ? mol.bonds[bi].stereo : undefined;
    if (!st || mol.bonds[bi!].order !== 2) continue;
    const before = ring[(i - 1 + n) % n];
    const after = ring[(i + 2) % n];
    const onA = mol.neighbours[a].includes(st.refs[0]) && st.refs[0] !== b ? st.refs[0] : st.refs[1];
    const onB = onA === st.refs[0] ? st.refs[1] : st.refs[0];
    const cis = st.cis !== (onA !== before) !== (onB !== after);
    fixed.push({ i, cis });
  }
  // A macrolide's lactone at the lower left, the ring numbered from its
  // carbonyl carbon counterclockwise (docs/LAYOUT-2D.md, section 4): among
  // fits that put the heavy groups outside as well, the one that does
  const lactone = macrolactone(mol, ring, rings);
  const at = (shift: number, way: number, k: number) => shape[(((shift + way * k) % n) + n) % n];
  let best = { shift: 0, way: 1 };
  let bestCost = Infinity;
  for (const way of [1, -1]) {
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (const { i, cis } of fixed) {
        const pa = at(shift, way, i);
        const pb = at(shift, way, i + 1);
        const side = (k: number) => Math.sign(cross(sub(pb, pa), sub(at(shift, way, k), pa)));
        if ((side(i - 1) === side(i + 2)) !== cis) cost += 1000;
      }
      for (let i = 0; i < n; i++) {
        if (inward[(((shift + way * i) % n) + n) % n]) cost += load[i];
      }
      for (const i of pointIn) {
        if (!inward[(((shift + way * i) % n) + n) % n]) cost += 20;
      }
      for (const i of pointOut) {
        if (inward[(((shift + way * i) % n) + n) % n]) cost += 20;
      }
      if (lactone) {
        const c1 = at(shift, way, lactone.c1);
        const c2 = at(shift, way, lactone.c2);
        if (c1.x > -0.5) cost += 2;
        if (c1.y > -0.5) cost += 2;
        if (cross(c1, c2) < 0) cost += 4;
      }
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = { shift, way };
      }
    }
  }
  return (i) => (((best.shift + best.way * i) % n) + n) % n;
}

/**
 * A macrocycle's one lactone, where it is a plain one - its carbonyl carbon
 * and the next atom on in no other ring: their places in the ring.
 */
function macrolactone(mol: Molecule, ring: number[], rings: number[][]): { c1: number; c2: number } | null {
  const n = ring.length;
  const found: { c1: number; c2: number }[] = [];
  ring.forEach((c, i) => {
    if (mol.el[c] !== "C") return;
    const oxo = mol.neighbours[c].some(
      (o) => !ring.includes(o) && mol.el[o] === "O" && mol.bonds[mol.bondIndex.get(c < o ? `${c},${o}` : `${o},${c}`)!].order === 2,
    );
    if (!oxo) return;
    const [before, after] = [(i - 1 + n) % n, (i + 1) % n];
    if (mol.el[ring[before]] === "O") found.push({ c1: i, c2: after });
    else if (mol.el[ring[after]] === "O") found.push({ c1: i, c2: before });
  });
  if (found.length !== 1) return null;
  const { c1, c2 } = found[0];
  if (rings.some((q) => q !== ring && (q.includes(ring[c1]) || q.includes(ring[c2])))) return null;
  return found[0];
}

/** Places the atoms of a ring not yet placed, given those that are. */
function placeRing(ring: number[], pos: Map<number, Point>, rings: number[][] = []): void {
  const n = ring.length;
  const placed = ring.map((a) => pos.has(a));
  const count = placed.filter(Boolean).length;
  if (count === 1) {
    placeSpiro(ring, pos);
    return;
  }
  // A small ring its neighbours have fixed three atoms or more of (a
  // furan fused between rings, as morphine's): the rest of it where the
  // regular polygon that best fits those atoms puts it - its shape kept,
  // its bonds giving a little, rather than squeezed round an arc.
  if (n >= 5 && n < MACROCYCLE && count >= 3 && count < n && fitPolygon(ring, pos)) return;
  // the runs of unplaced atoms, each between two placed ones
  for (let i = 0; i < n; i++) {
    if (!placed[i] || placed[(i + 1) % n]) continue;
    const run: number[] = [];
    let j = (i + 1) % n;
    while (!placed[j]) {
      run.push(ring[j]);
      j = (j + 1) % n;
    }
    // a macrocycle's run is a chain, drawn as one: a zigzag, never an arc
    if (n >= MACROCYCLE && run.length >= 3) placeChainRun(ring[i], ring[j], run, pos, rings);
    else placeRun(ring[i], ring[j], run, n, pos);
  }
}

/**
 * The regular polygon of a ring's size best fitted - turned, scaled and
 * moved, either way round - to the given places of some of its atoms (by
 * their places round it): where it puts each of its places, and how far,
 * in all, it misses the given ones.
 */
function regularFit(
  n: number,
  known: readonly (readonly [number, Point])[],
  scaleWithin: readonly [number, number] = [0, Infinity],
): { place: (k: number) => Point; error: number } {
  const r = radius(n);
  let best: { place: (k: number) => Point; error: number } | null = null;
  for (const way of [1, -1]) {
    const ideal = (k: number) => scale(dir((way * k * 2 * Math.PI) / n), r);
    const ci = centroid(known.map(([k]) => ideal(k)));
    const cp = centroid(known.map(([, p]) => p));
    let dotSum = 0;
    let crossSum = 0;
    let norm2 = 0;
    for (const [k, p] of known) {
      const u = sub(ideal(k), ci);
      const w = sub(p, cp);
      dotSum += u.x * w.x + u.y * w.y;
      crossSum += u.x * w.y - u.y * w.x;
      norm2 += u.x * u.x + u.y * u.y;
    }
    const k0 = Math.min(scaleWithin[1], Math.max(scaleWithin[0], Math.hypot(dotSum, crossSum) / (norm2 || 1)));
    const turn = Math.atan2(crossSum, dotSum);
    const place = (k: number) => add(cp, scale(rotateBy(sub(ideal(k), ci), turn), k0));
    const error = known.reduce((sum, [k, p]) => sum + dist(place(k), p) ** 2, 0);
    if (!best || error < best.error) best = { place, error };
  }
  return best!;
}

/**
 * A ring system whose rings came out bent - pulled this way and that by
 * rings fused and bridged round them (strychnine) - eased toward rings of
 * their own shape: each ring drawn to the regular polygon that best fits
 * it, a little larger or smaller as it must, its bonds giving before its
 * shape does, and atoms kept clear of each other. The larger ring of a
 * bridged pair, which arcs round the bridge, is left to its bonds. A
 * system whose rings are already regular is left as it is.
 */
export function regularize(mol: Molecule, sys: RingSystem, pos: Map<number, Point>): void {
  const { shaped, misfit } = shapesOf(mol, sys, pos);
  // (regular rings, but two atoms on each other, as two rings meeting at an atom put them: eased as well)
  const crowded = sys.atoms.some((a, i) =>
    sys.atoms.slice(i + 1).some((b) => !mol.neighbours[a].includes(b) && dist(pos.get(a)!, pos.get(b)!) < 0.6),
  );
  if (!crowded && !narrowGap(mol, sys, pos) && !shaped.some((r) => misfit(r) > 0.002)) return;
  easeRings(mol, sys, pos, shaped, misfit);
}

/**
 * How many pairs of a ring system's atoms, each with a bond out of the
 * system, a bond apart from an atom they share, are closer than what hangs
 * from them needs: under 0.8 of a bond, where three five-membered rings
 * round one atom leave a gap of 36 degrees between two of them
 * (bilobalide's C4 and C9, each with its groups out of that gap). Easing
 * the rings (`easeRings`) holds them 0.85 apart.
 */
export function narrowGap(mol: Molecule, sys: RingSystem, pos: Map<number, Point>): number {
  const inSys = new Set(sys.atoms);
  const out = (a: number) => mol.neighbours[a].some((b) => !inSys.has(b));
  let gaps = 0;
  for (const c of sys.atoms) {
    const near = mol.neighbours[c].filter((a) => inSys.has(a) && out(a));
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const [a, b] = [near[i], near[j]];
        if (!mol.neighbours[a].includes(b) && dist(pos.get(a)!, pos.get(b)!) < 0.8) gaps++;
      }
  }
  return gaps;
}

/**
 * How far a ring system's rings are from their own shapes: each ring's
 * miss from the regular polygon that best fits it, per atom, summed - the
 * larger ring of a bridged pair, which arcs round the bridge, not counted.
 */
export function misshapen(mol: Molecule, sys: RingSystem, pos: Map<number, Point>): number {
  const { shaped, misfit } = shapesOf(mol, sys, pos);
  return shaped.reduce((sum, r) => sum + misfit(r), 0);
}

function shapesOf(mol: Molecule, sys: RingSystem, pos: Map<number, Point>) {
  const rings = sys.rings.map((i) => mol.rings[i]);
  // of a bridged pair, the larger arcs round the bridge; of two alike, the
  // one fused to fewer other rings
  const fused = (r: number[]) => rings.filter((q) => q !== r && q.filter((a) => r.includes(a)).length === 2).length;
  const arcs = new Set(
    rings.filter((r) =>
      rings.some(
        (q) =>
          q !== r &&
          q.filter((a) => r.includes(a)).length >= 3 &&
          (q.length < r.length || (q.length === r.length && fused(q) > fused(r))),
      ),
    ),
  );
  const shaped = rings.filter((r) => r.length < MACROCYCLE && !arcs.has(r));
  const misfit = (r: number[]) =>
    regularFit(r.length, r.map((a, k) => [k, pos.get(a)!] as const)).error / r.length;
  return { shaped, misfit };
}

function easeRings(
  mol: Molecule,
  sys: RingSystem,
  pos: Map<number, Point>,
  shaped: number[][],
  misfit: (r: number[]) => number,
): void {
  const atoms = sys.atoms;
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (pos.has(a) && pos.has(b) && sys.atoms.includes(a) && sys.atoms.includes(b)) bonds.push([a, b]);
  }
  for (let it = 0; it < 300; it++) {
    const pull = new Map<number, { x: number; y: number; w: number }>();
    const add2 = (a: number, d: Point, w: number) => {
      const m = pull.get(a) ?? { x: 0, y: 0, w: 0 };
      m.x += d.x * w;
      m.y += d.y * w;
      m.w += w;
      pull.set(a, m);
    };
    for (const r of shaped) {
      const fit = regularFit(r.length, r.map((a, k) => [k, pos.get(a)!] as const), [0.95, 1.35]);
      r.forEach((a, k) => add2(a, sub(fit.place(k), pos.get(a)!), 1));
    }
    for (const [a, b] of bonds) {
      const d = sub(pos.get(b)!, pos.get(a)!);
      const l = len(d) || 1e-9;
      const f = (l - 1) / l / 2;
      add2(a, scale(d, f), 0.3);
      add2(b, scale(d, -f), 0.3);
    }
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const a = atoms[i];
        const b = atoms[j];
        if (mol.neighbours[a].includes(b)) continue;
        const d = sub(pos.get(b)!, pos.get(a)!);
        const l = len(d);
        if (l >= 0.85 || l < 1e-9) continue;
        const f = (l - 0.85) / l / 2;
        add2(a, scale(d, f), 1);
        add2(b, scale(d, -f), 1);
      }
    }
    for (const [a, m] of pull) {
      const p = pos.get(a)!;
      pos.set(a, { x: p.x + (0.3 * m.x) / m.w, y: p.y + (0.3 * m.y) / m.w });
    }
  }
  // and set square again by its most regular six-membered ring
  const six = shaped
    .filter((r) => r.length === 6)
    .sort((p, q) => misfit(p) - misfit(q))[0];
  if (!six) return;
  let off = 0;
  six.forEach((a, k) => {
    const t = (angleOf(sub(pos.get(six[(k + 1) % 6])!, pos.get(a)!)) * 180) / Math.PI - 30;
    off += t - 60 * Math.round(t / 60);
  });
  const turn = (-off / 6) * (Math.PI / 180);
  const c = centroid(atoms.map((a) => pos.get(a)!));
  for (const a of atoms) pos.set(a, add(c, rotateBy(sub(pos.get(a)!, c), turn)));
}

/**
 * Places a ring's unplaced atoms at the vertices of the regular polygon
 * fitted (turned, scaled and moved, either way round) to its placed ones;
 * false, placing nothing, where that puts one on another atom or asks
 * too much of a bond.
 */
function fitPolygon(ring: number[], pos: Map<number, Point>): boolean {
  const n = ring.length;
  const r = radius(n);
  const others = [...pos.entries()].filter(([v]) => !ring.includes(v)).map(([, p]) => p);
  let best: Map<number, Point> | null = null;
  let bestError = Infinity;
  for (const way of [1, -1]) {
    const ideal = ring.map((_, k) => scale(dir((way * k * 2 * Math.PI) / n), r));
    const known = ring.map((v, k) => [k, pos.get(v)] as const).filter((e): e is readonly [number, Point] => !!e[1]);
    const ci = centroid(known.map(([k]) => ideal[k]));
    const cp = centroid(known.map(([, p]) => p));
    let dotSum = 0;
    let crossSum = 0;
    let norm2 = 0;
    for (const [k, p] of known) {
      const u = sub(ideal[k], ci);
      const w = sub(p, cp);
      dotSum += u.x * w.x + u.y * w.y;
      crossSum += u.x * w.y - u.y * w.x;
      norm2 += u.x * u.x + u.y * u.y;
    }
    const k0 = Math.hypot(dotSum, crossSum) / norm2;
    const turn = Math.atan2(crossSum, dotSum);
    const place = (k: number) => add(cp, scale(rotateBy(sub(ideal[k], ci), turn), k0));
    const error = known.reduce((sum, [k, p]) => sum + dist(place(k), p) ** 2, 0);
    if (error >= bestError) continue;
    const out = new Map<number, Point>();
    ring.forEach((v, k) => {
      if (!pos.has(v)) out.set(v, place(k));
    });
    bestError = error;
    best = out;
  }
  if (!best) return false;
  // (clear of other atoms, and every bond of the ring within reason)
  for (const p of best.values()) if (others.some((o) => dist(o, p) < 0.5)) return false;
  const at = (v: number) => best!.get(v) ?? pos.get(v)!;
  for (let k = 0; k < n; k++) {
    const l = dist(at(ring[k]), at(ring[(k + 1) % n]));
    if (l < 0.75 || l > 1.5) return false;
  }
  for (const [v, p] of best) pos.set(v, p);
  return true;
}

function rotateBy(p: Point, t: number): Point {
  return { x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) };
}

/**
 * A run of a macrocycle between two atoms already placed, drawn as a chain:
 * each bond turned sixty degrees from the last, zigzag where it can be and
 * cornering where it must, clear of what is placed and crossing none of
 * it, bulging away from it - and the last atom set a bond from both its
 * neighbours to close onto the far end. Found by a beam search over the
 * ways each bond can turn.
 */
function placeChainRun(
  from: number,
  to: number,
  run: number[],
  pos: Map<number, Point>,
  rings: number[][] = [],
): void {
  // the six-membered rings the run passes through, yet to be drawn: where
  // it does, it turns as the hexagon does, the same way at each atom
  const hexagon = (u: number, v: number, w: number) =>
    rings.findIndex((r) => r.length === 6 && r.includes(u) && r.includes(v) && r.includes(w));
  const a = pos.get(from)!;
  const b = pos.get(to)!;
  const k = run.length;
  const placed = [...pos.entries()].filter(([v]) => v !== from && v !== to).map(([, p]) => p);
  const middle = placed.length ? centroid(placed) : scale(add(a, b), 0.5);
  const bonds: [Point, Point][] = [];
  // (the bonds among placed atoms are those a bond's length apart)
  const pts = [...pos.values()];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(dist(pts[i], pts[j]) - 1) < 0.05) bonds.push([pts[i], pts[j]]);
    }
  }
  const crowd = (p: Point) => {
    let c = 0;
    for (const o of placed) {
      const d = dist(p, o);
      if (d < 0.6) c += 50;
      else if (d < 0.9) c += 10 * (0.9 - d);
    }
    return c;
  };
  const crosses = (p: Point, q: Point) =>
    bonds.reduce((c, [u, v]) => c + (segmentsCross(p, q, u, v) ? 1 : 0), 0);
  // Where the rest of a hexagon the run enters will fall, once drawn round
  // from three of its atoms, u, v and w in order along the run: those of
  // its atoms neither on the run nor placed.
  const rest = (r: number, u: Point, v: Point, w: Point, vAtom: number, wAtom: number): Point[] => {
    const ring = rings[r];
    const c = add(v, norm(add(sub(u, v), sub(w, v))));
    const iv = ring.indexOf(vAtom);
    const step = ring[(iv + 1) % 6] === wAtom ? 1 : -1;
    const turnTo = Math.sign(cross(sub(v, c), sub(w, c)));
    const out: Point[] = [];
    for (let d = 1; d < 6; d++) {
      const atom = ring[(iv + step * d + 6) % 6];
      if (run.includes(atom) || atom === from || atom === to || pos.has(atom)) continue;
      out.push(add(c, dir(angleOf(sub(v, c)) + turnTo * d * (Math.PI / 3))));
    }
    return out;
  };
  type State = { at: Point[]; t: number; turn: number; ring: number; ghosts: Point[]; cost: number };
  let beam: State[] = [];
  for (let s = 0; s < 12; s++) {
    const t = (s * Math.PI) / 6;
    const p = add(a, dir(t));
    beam.push({ at: [p], t, turn: 0, ring: -1, ghosts: [], cost: crowd(p) + 5 * crosses(a, p) });
  }
  // (a point too near where a hexagon's rest will fall)
  const onGhost = (p: Point, ghosts: Point[]) => ghosts.reduce((c, g) => c + (dist(p, g) < 0.9 ? 20 : 0), 0);
  const WIDTH = 400;
  for (let step = 1; step < k - 1; step++) {
    const next: State[] = [];
    const left = k - step; // bonds still to go after this atom, to b
    // the turn made at run[step - 1], between the atoms either side of it
    const before = step >= 2 ? run[step - 2] : from;
    const ring = hexagon(before, run[step - 1], run[step]);
    for (const st of beam) {
      for (const turn of [1, -1]) {
        // (inside a hexagon, the same way as the turn before it there)
        if (ring >= 0 && st.ring === ring && turn !== st.turn) continue;
        const t = st.t + (turn * Math.PI) / 3;
        const last = st.at[st.at.length - 1];
        const p = add(last, dir(t));
        // (still able to reach the far end)
        if (dist(p, b) > left + 1e-9) continue;
        let cost = st.cost + crowd(p) + 5 * crosses(last, p) + onGhost(p, st.ghosts);
        for (let j = 0; j < st.at.length - 1; j++) if (dist(p, st.at[j]) < 0.9) cost += 20;
        // a zigzag turns each way in turn; a corner is two turns alike
        if (turn === st.turn && ring < 0) cost += 0.3;
        // entering a hexagon: room for the rest of it, kept from then on
        let ghosts = st.ghosts;
        if (ring >= 0 && st.ring !== ring) {
          const u = step >= 2 ? st.at[step - 2] : a;
          const fresh = rest(ring, u, last, p, run[step - 1], run[step]);
          for (const g of fresh) {
            cost += crowd(g);
            for (const q of [a, ...st.at, p]) if (dist(q, g) < 0.9) cost += 20;
          }
          ghosts = [...ghosts, ...fresh];
        }
        next.push({ at: [...st.at, p], t, turn, ring, ghosts, cost });
      }
    }
    next.sort((p, q) => p.cost - q.cost);
    beam = next.slice(0, WIDTH);
    if (!beam.length) break;
  }
  let best: Point[] | null = null;
  let bestCost = Infinity;
  const angle = (u: Point, v: Point, w: Point) => {
    const x1 = sub(u, v);
    const x2 = sub(w, v);
    return Math.acos(Math.max(-1, Math.min(1, (x1.x * x2.x + x1.y * x2.y) / (len(x1) * len(x2)))));
  };
  for (const st of beam) {
    const last = st.at[st.at.length - 1];
    const closes = k === 1 ? [] : apexOf(last, b);
    for (const p of closes) {
      const at = [...st.at, p];
      let cost = st.cost + crowd(p) + 5 * (crosses(last, p) + crosses(p, b)) + onGhost(p, st.ghosts);
      for (let j = 0; j < at.length - 2; j++) if (dist(p, at[j]) < 0.9) cost += 20;
      // the angles the closing bends, against 120 degrees
      const prev = at.length >= 3 ? at[at.length - 3] : a;
      for (const [u, v, w] of [
        [prev, last, p],
        [last, p, b],
      ]) {
        cost += ((angle(u, v, w) - (2 * Math.PI) / 3) / (Math.PI / 6)) ** 2;
      }
      // room at each end among the bonds already there
      for (const [end, first] of [
        [a, at[0]],
        [b, p],
      ] as const) {
        for (const o of placed) {
          if (Math.abs(dist(o, end) - 1) > 0.05) continue;
          const t = angle(o, end, first);
          if (t < (100 * Math.PI) / 180) cost += 3 * ((100 * Math.PI) / 180 - t);
        }
      }
      // away from what is placed
      cost -= 0.3 * len(sub(centroid(at), middle));
      if (cost < bestCost) {
        bestCost = cost;
        best = at;
      }
    }
  }
  if (!best) {
    placeRun(from, to, run, run.length + 2, pos);
    return;
  }
  // the strain of closing it shared out along the chain: bonds 1, each
  // chain atom's neighbours a 120-degree angle apart, clear of what is
  // placed - the rings the run passes through left as they are
  const line = [a, ...best.map((p) => ({ ...p })), b];
  const ids = [from, ...run, to];
  const free = ids.map((v, i) => i > 0 && i < ids.length - 1 && !rings.some((r) => r.length < MACROCYCLE && r.includes(v)));
  const pull = (i: number, j: number, target: number, k: number) => {
    if (!free[i] && !free[j]) return;
    const d = sub(line[j], line[i]);
    const l = len(d) || 1e-9;
    const f = ((l - target) / l) * k;
    const [wi, wj] = free[i] && free[j] ? [0.5, 0.5] : free[i] ? [1, 0] : [0, 1];
    line[i] = add(line[i], scale(d, f * wi));
    line[j] = sub(line[j], scale(d, f * wj));
  };
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i + 1 < line.length; i++) pull(i, i + 1, 1, 0.5);
    for (let i = 0; i + 2 < line.length; i++) if (free[i + 1]) pull(i, i + 2, Math.sqrt(3), 0.15);
    for (let i = 0; i < line.length; i++) {
      if (!free[i]) continue;
      for (const o of placed) {
        const d = sub(line[i], o);
        const l = len(d);
        if (l < 0.9 && l > 1e-9) line[i] = add(line[i], scale(d, ((0.9 - l) / l) * 0.3));
      }
    }
  }
  run.forEach((atom, i) => pos.set(atom, line[i + 1]));
}

/** The points a bond's length from both `p` and `q`. */
function apexOf(p: Point, q: Point): Point[] {
  const d = dist(p, q);
  if (d > 2 || d < 1e-9) return [];
  const m = scale(add(p, q), 0.5);
  const h = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
  const u = { x: -(q.y - p.y) / d, y: (q.x - p.x) / d };
  return [add(m, scale(u, h)), add(m, scale(u, -h))];
}

/** A ring touching what is placed at one atom: set on the far side of it. */
function placeSpiro(ring: number[], pos: Map<number, Point>): void {
  const n = ring.length;
  const i0 = ring.findIndex((a) => pos.has(a));
  const at = pos.get(ring[i0])!;
  // the way out from the atom: away from the placed atoms near it
  const near = [...pos.entries()].filter(([a, p]) => a !== ring[i0] && dist(p, at) < 1.5);
  const taken = near.map(([, p]) => angleOf(sub(p, at)));
  const [out] = splitWidestGap(taken, 1);
  const r = radius(n);
  const c = add(at, scale(dir(out), r));
  const start = out + Math.PI; // the shared atom, seen from the centre
  for (let k = 1; k < n; k++) {
    pos.set(ring[(i0 + k) % n], add(c, scale(dir(start - (k * 2 * Math.PI) / n), r)));
  }
}

/**
 * Places `run`, the atoms of an `n`-membered ring between placed atoms `from`
 * and `to`, on an arc of the ring's regular polygon between them - of the
 * four such arcs (two circles, the short way round or the long), the one
 * whose bonds come nearest 1 and that keeps clear of what is placed.
 */
function placeRun(from: number, to: number, run: number[], n: number, pos: Map<number, Point>): void {
  const a = pos.get(from)!;
  const b = pos.get(to)!;
  const d = dist(a, b);
  const steps = run.length + 1;
  let r = radius(n);
  if (d > 2 * r) r = d / 2;
  const mid = scale(add(a, b), 0.5);
  const across = norm({ x: -(b.y - a.y), y: b.x - a.x });
  // across a diameter (para atoms of a ring fused on two sides) the centre
  // is the midpoint itself: rounding must not move it off
  const h = d > 2 * r * (1 - 1e-6) ? 0 : Math.sqrt(Math.max(0, r * r - (d * d) / 4));
  const others = [...pos.entries()].filter(([k]) => k !== from && k !== to).map(([, p]) => p);
  const middle = others.length ? centroid(others) : mid;

  let best: Point[] | null = null;
  let bestCost = Infinity;
  for (const side of [1, -1]) {
    const c = add(mid, scale(across, side * h));
    const ta = angleOf(sub(a, c));
    const tb = angleOf(sub(b, c));
    for (const way of [1, -1]) {
      // from a to b going `way` round the circle
      let sweep = (tb - ta) * way;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const pts: Point[] = [];
      for (let k = 1; k < steps; k++) pts.push(add(c, scale(dir(ta + (way * sweep * k) / steps), r)));
      const step = 2 * r * Math.sin(sweep / steps / 2);
      let cost = 40 * Math.abs(step - 1);
      pts.forEach((p, i) => {
        // (beside a neighbour of an end it leaves from - two rings fused on
        // neighbouring sides of a third, meeting at that end, as saxitoxin's
        // two five-membered rings meet at their shared carbon - it comes
        // close by the rings' own angles: the gap between them is opened
        // later, not the ring squeezed flat)
        const end = i === 0 ? a : i === pts.length - 1 ? b : null;
        for (const o of others) {
          const dd = dist(p, o);
          const besideEnd = !!end && Math.abs(dist(end, o) - 1) < 0.15;
          if (dd < (besideEnd ? 0.3 : 0.55)) cost += 100;
          else if (dd < 0.9) cost += 5 * (0.9 - dd);
        }
      });
      // outward, away from the middle of what is placed
      const bulge = centroid(pts);
      cost -= 0.5 * len(sub(bulge, middle));
      // a convex ring: the run on the far side of the line from the placed
      // atoms' middle
      const sideOfRun = Math.sign(cross(sub(b, a), sub(bulge, a)));
      const sideOfRest = Math.sign(cross(sub(b, a), sub(middle, a)));
      if (others.length && sideOfRun === sideOfRest) cost += 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = pts;
      }
    }
  }
  run.forEach((atom, i) => pos.set(atom, best![i]));
}
