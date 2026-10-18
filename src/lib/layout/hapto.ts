/**
 * A ring bound face-on to a metal through all its atoms - η⁵-Cp, Cp*,
 * η⁶-benzene, p-cymene - drawn as it is seen (docs/LAYOUT-2D.md, section
 * 7): the metal on the ring's axis, a bond from its centre, and the ring
 * seen from a little above its plane, so that it is foreshortened across
 * the axis - a flattened polygon - its near half drawn bold. What hangs from
 * the ring lies in its plane, pointing out from its centre.
 *
 * In the ring's own frame its centre (the star) is at the origin and its
 * metal along +y. A ring can be spun about its axis: where its first
 * substituent points is a free choice, each one tried (`etaSpins`), as a
 * macrocycle's shapes are.
 */
import { add, angleOf, centroid, dir, rotate, sub, type Point } from "./geometry";
import { METAL_BOND, type DieneRing, type EtaRing, type MetalUnit, type Molecule } from "./perceive";
import { placeCluster } from "./cluster";
import { placeRingSystem } from "./ringSystem";

/**
 * Seen from a little above its plane, a ring is drawn this much as deep as
 * it is wide: the sine of the angle it is seen at (about 24 degrees).
 */
export const FORESHORTEN = 0.4;

/** How far a ring's centre is from its metal, in bond lengths. */
export const TO_METAL = 1;

/**
 * Where a ring's first substituent may point, round its plane from the side
 * its metal is not on: to either side, or away from the metal. (Not toward
 * the metal, where it would meet it.)
 */
const SPINS = [0, Math.PI, -Math.PI / 2];

/** How far a bent metallocene's rings lean from the line through its metal, away from its other ligands. */
const BENT = Math.PI / 9;

/**
 * The ways a metal's ligands go (docs/LAYOUT-2D.md, section 7), round from
 * the first ring's: two rings bound face-on opposite each other - leaning a
 * little away from any others, between them to one side; one ring, the rest
 * opposite it, spread as a stool's legs; no ring, all of them evenly round.
 * For each, whether it is a ring's.
 */
export function metalSlots(rings: number, others: number): { angle: number; ring: boolean }[] {
  const ring = (angle: number) => ({ angle, ring: true });
  const other = (angle: number) => ({ angle, ring: false });
  const spread = (centre: number, n: number, step: number) =>
    Array.from({ length: n }, (_, i) => other(centre + (i - (n - 1) / 2) * step));
  if (rings === 2) {
    const lean = others ? BENT : 0;
    return [ring(-lean), ring(Math.PI + lean), ...spread(Math.PI / 2, others, others === 2 ? Math.PI / 3 : Math.PI / 4)];
  }
  if (rings === 1) {
    const step = others <= 2 ? Math.PI / 2 : (2 * Math.PI) / 3 / (others - 1);
    return [ring(0), ...spread(Math.PI, others, step)];
  }
  const n = rings + others;
  return Array.from({ length: n }, (_, i) => ({ angle: (2 * Math.PI * i) / n, ring: i < rings }));
}

/** The ring system's atoms that hang from the ring by a bond, with the ring atom each hangs from. */
function hanging(mol: Molecule, eta: EtaRing): [number, number][] {
  const sys = new Set(eta.atoms);
  const out: [number, number][] = [];
  for (const a of eta.atoms) {
    if (a === eta.star) continue;
    for (const b of mol.neighbours[a]) if (!sys.has(b) && b !== eta.star) out.push([a, b]);
  }
  return out;
}

/** How many spins a ring bound face-on is tried in: one, where nothing hangs from its system. */
export function etaSpins(mol: Molecule, eta: EtaRing): number {
  return spinsOf(mol, eta).length;
}

/**
 * The spins a ring is tried in: of SPINS, those that keep what hangs from
 * it 60 degrees or more from its metal's side - or, where none does, those
 * that keep it furthest (Cp*'s methyls, a corner away from the metal): no
 * substituent drawn pointing at the metal where another spin would have
 * none. With nothing hanging from it, its one way: a corner away from the
 * metal for a ring of odd size, one to the side for an even one.
 */
function spinsOf(mol: Molecule, eta: EtaRing): number[] {
  const out = hanging(mol, eta);
  if (!out.length) return [eta.ring.length % 2 ? -Math.PI / 2 : 0];
  const own = eta.atoms.filter((a) => a !== eta.star);
  const rings = mol.rings.map((r, i) => (r.every((a) => own.includes(a)) ? i : -1)).filter((i) => i >= 0);
  const flat = placeRingSystem(mol, { atoms: own, rings });
  const c = centroid(eta.ring.map((a) => flat.get(a)!));
  const first = heaviest(mol, out);
  const toward = angleOf(sub(flat.get(first[0])!, c));
  const offsets = out.map(([a]) => angleOf(sub(flat.get(a)!, c)) - toward);
  // (the metal is along +y, at a quarter turn)
  const gap = (t: number) => Math.abs(Math.atan2(Math.sin(t - Math.PI / 2), Math.cos(t - Math.PI / 2)));
  const clear = SPINS.map((spin) => Math.min(...offsets.map((o) => gap(spin + o))));
  // (60 degrees clear is clear enough: dppf's P to either side, as well as away)
  const enough = Math.min(Math.max(...clear), Math.PI / 3);
  return SPINS.filter((_, k) => clear[k] >= enough - 1e-6);
}

/** The heaviest branch hanging from a ring, by how many atoms lie beyond it. */
function heaviest(mol: Molecule, out: [number, number][]): [number, number] {
  return [...out].sort((p, q) => beyond(mol, ...q) - beyond(mol, ...p))[0];
}

export type EtaLayout = {
  /** Where its system's atoms are, the star at the origin, the metal along +y. */
  pos: Map<number, Point>;
  /** Where the bonds out of it go: the metal's, and each hanging atom's, by atom. */
  hints: Map<number, Map<number, Point>>;
  /** Each atom's place across the axis in the ring's plane, before it is foreshortened: + toward the metal. */
  lift: Map<number, number>;
};

/**
 * A ring system bound face-on to its metal, spun as `spin` says: laid out
 * flat by its rings, turned so that its first substituent (the heaviest
 * branch) points the way the spin gives (`spinsOf`), and foreshortened
 * across the axis.
 */
export function placeEta(mol: Molecule, eta: EtaRing, spin = 0): EtaLayout {
  const own = eta.atoms.filter((a) => a !== eta.star);
  const rings = mol.rings.map((r, i) => (r.every((a) => own.includes(a)) ? i : -1)).filter((i) => i >= 0);
  const flat = placeRingSystem(mol, { atoms: own, rings });
  const c = centroid(eta.ring.map((a) => flat.get(a)!));
  // the heaviest branch hanging from it, by how many atoms lie beyond
  const out = hanging(mol, eta);
  const first = out.length ? heaviest(mol, out) : undefined;
  const toward = first
    ? angleOf(sub(flat.get(first[0])!, c))
    : angleOf(sub(flat.get(eta.ring[0])!, c));
  const spins = spinsOf(mol, eta);
  const want = spins[spin % spins.length];
  const turn = want - toward;
  const inPlane = (p: Point) => rotate(sub(p, c), turn);
  const seen = (q: Point): Point => ({ x: q.x, y: q.y * FORESHORTEN });

  const pos = new Map<number, Point>();
  const lift = new Map<number, number>();
  for (const [a, p] of flat) {
    const q = inPlane(p);
    pos.set(a, seen(q));
    lift.set(a, q.y);
  }
  pos.set(eta.star, { x: 0, y: 0 });
  lift.set(eta.star, 0);

  const hints = new Map<number, Map<number, Point>>();
  const hint = (a: number, b: number, p: Point) => hints.set(a, (hints.get(a) ?? new Map()).set(b, p));
  // the metal on the axis
  for (const m of mol.neighbours[eta.star]) hint(eta.star, m, { x: 0, y: TO_METAL });
  // what hangs from a ring atom: straight out from the centre of its rings,
  // in their plane (two from one atom, either side of that)
  const byAtom = new Map<number, number[]>();
  for (const [a, b] of out) byAtom.set(a, [...(byAtom.get(a) ?? []), b]);
  for (const [a, bs] of byAtom) {
    const centres = mol.ringsOf[a].map((r) => centroid(mol.rings[r].map((v) => flat.get(v)!)));
    const from = centroid(centres);
    const radial = angleOf(sub(flat.get(a)!, from));
    const spread = bs.length === 1 ? [0] : bs.map((_, k) => ((k - (bs.length - 1) / 2) * Math.PI) / 3);
    bs.forEach((b, k) => {
      const end = add(flat.get(a)!, { x: Math.cos(radial + spread[k]), y: Math.sin(radial + spread[k]) });
      hint(a, b, seen(inPlane(end)));
    });
  }
  return { pos, hints, lift };
}

/** How many atoms lie beyond `b`, from `a`: what hangs there, by bonds (and a ring bound face-on, by its star). */
function beyond(mol: Molecule, a: number, b: number): number {
  const seen = new Set([a, b]);
  const todo = [b];
  while (todo.length) {
    const u = todo.pop()!;
    const ring = mol.eta.find((e) => e.star === u);
    for (const v of [...mol.neighbours[u], ...(ring?.atoms ?? [])]) {
      if (seen.has(v)) continue;
      seen.add(v);
      todo.push(v);
    }
  }
  return seen.size - 1;
}

/** How many ways a metal's unit is tried: each of its rings' spins, together. */
export function unitVariants(mol: Molecule, unit: MetalUnit): number {
  return unit.eta.reduce((n, e) => n * etaSpins(mol, e), 1);
}

/**
 * A metal and its rings bound face-on, as one system (section 7): the
 * metal at the origin, each ring's centre a bond from it the way its slot
 * goes (`metalSlots`), the ring square to that line; and the metal's other
 * ligands hinted along the other slots, the bulkiest furthest apart.
 * `variant` gives each ring's spin, the first ring's fastest.
 */
export function placeUnit(
  mol: Molecule,
  unit: MetalUnit,
  variant = 0,
  /** Its `chelate` laid out on its own, flat - as the engine lays out a ring system. */
  chelate?: ReadonlyMap<number, Point>,
): EtaLayout {
  if (unit.pair) return placePair(mol, unit, variant);
  if (unit.cluster) return placeCluster(mol, unit);
  if (unit.dienes.length && !unit.eta.length) return placeTubs(mol, unit, chelate);
  const m = unit.metal;
  const stars = new Set(unit.eta.map((e) => e.star));
  const others = mol.neighbours[m].filter((l) => !stars.has(l));
  const slots = metalSlots(unit.eta.length, others.length);
  const ringSlots = slots.filter((t) => t.ring);
  const otherSlots = slots.filter((t) => !t.ring).map((t) => t.angle);
  const pos = new Map<number, Point>([[m, { x: 0, y: 0 }]]);
  const lift = new Map<number, number>([[m, 0]]);
  const hints = new Map<number, Map<number, Point>>();
  let v = variant;
  unit.eta.forEach((e, j) => {
    const spins = etaSpins(mol, e);
    const laid = placeEta(mol, e, v % spins);
    v = Math.floor(v / spins);
    // its centre a bond out along its slot, its own +y back toward the metal
    const out = ringSlots[j].angle;
    const at = dir(out);
    const turn = out + Math.PI - Math.PI / 2;
    const place = (p: Point) => add(at, rotate(p, turn));
    for (const [a, p] of laid.pos) pos.set(a, place(p));
    for (const [a, l] of laid.lift) lift.set(a, l);
    for (const [a, h] of laid.hints) {
      const moved = new Map([...h].filter(([b]) => b !== m).map(([b, p]) => [b, place(p)]));
      if (moved.size) hints.set(a, moved);
    }
  });
  // the other ligands: the bulkiest furthest from each other and from the rings
  const weight = (l: number) => beyond(mol, m, l);
  const ringsAt = ringSlots.map((t, j) => ({ angle: t.angle, w: unit.eta[j].atoms.length }));
  let best: { cost: number; order: number[] } | null = null;
  for (const order of permutations(others.length)) {
    const at = order.map((k, i) => ({ angle: otherSlots[k], w: weight(others[i]) }));
    const all = [...ringsAt, ...at];
    let cost = 0;
    for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) cost += all[i].w * all[k].w * Math.cos(all[i].angle - all[k].angle);
    if (!best || cost < best.cost - 1e-9) best = { cost, order };
  }
  const toMetal = new Map<number, Point>();
  others.forEach((l, i) => toMetal.set(l, dir(otherSlots[best!.order[i]])));
  if (toMetal.size) hints.set(m, toMetal);
  return { pos, hints, lift };
}

/** Each order of 0..n-1 (n up to six; beyond, the one order). */
function permutations(n: number): number[][] {
  if (n > 6) return [Array.from({ length: n }, (_, i) => i)];
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

// --- a ring bound by two C=C: a tub ---------------------------------------------

/** How far apart a tub's two C=C are, either side of its middle, in bond lengths. */
const TUB_HALF_GAP = 0.95;
/** How a tub is seen, from in front and a little above: how far across and down the page its depth goes. */
const TUB_ACROSS = -0.25;
const TUB_DOWN = -0.5;

/**
 * A ring bound to its metal through two C=C of its own - cod's - as the
 * tub it is (section 7), in three dimensions: its two C=C parallel, a
 * little apart, in a plane facing the metal, which lies beyond their
 * middle; what runs between them on each side arching away from the
 * metal. Seen from in front and a little above, the near C=C below and to
 * the side of the far one, as chemists draw cod on Ni, Rh, Ir. Where its
 * atoms are, the metal at the origin and the ring toward -x; how near each
 * is (its lift); and where its stars are.
 */
export function placeTub(d: DieneRing): { pos: Map<number, Point>; lift: Map<number, number> } {
  const n = d.ring.length;
  const at = (k: number) => d.ring[((k % n) + n) % n];
  const [first, second] = d.stars;
  // the ring from the far C=C round: its atoms 0 and 1, then the near one's
  const i0 = d.ring.findIndex((a, k) => first.pi.includes(a) && first.pi.includes(at(k + 1)));
  const ring = Array.from({ length: n }, (_, k) => at(i0 + k));
  const j = ring.findIndex((a, k) => k > 1 && second.pi.includes(a) && second.pi.includes(ring[k + 1]));
  type V3 = [number, number, number];
  const p3 = new Map<number, V3>();
  const h = TUB_HALF_GAP;
  p3.set(ring[0], [-0.5, -h, 0]);
  p3.set(ring[1], [0.5, -h, 0]);
  p3.set(ring[j], [0.5, h, 0]);
  p3.set(ring[j + 1], [-0.5, h, 0]);
  // what runs between: an arc from one C=C to the other, away from the
  // metal (+z) and out to its side, its bonds a bond long on average
  const arc = (atoms: number[], from: V3, to: V3, side: number) => {
    const k = atoms.length;
    if (!k) return;
    const at3 = (t: number, s: number): V3 => {
      const b = Math.sin(Math.PI * t) * s;
      return [from[0] + (to[0] - from[0]) * t + side * 0.5 * b, from[1] + (to[1] - from[1]) * t, b];
    };
    const mean = (s: number) => {
      let sum = 0;
      for (let i = 0; i <= k; i++) {
        const p = at3(i / (k + 1), s);
        const q = at3((i + 1) / (k + 1), s);
        sum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      }
      return sum / (k + 1);
    };
    let lo = 0;
    let hi = 6;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      if (mean(mid) < 1) lo = mid;
      else hi = mid;
    }
    atoms.forEach((a, i) => p3.set(a, at3((i + 1) / (k + 1), (lo + hi) / 2)));
  };
  arc(ring.slice(2, j), p3.get(ring[1])!, p3.get(ring[j])!, 1);
  arc(ring.slice(j + 2), p3.get(ring[j + 1])!, p3.get(ring[0])!, -1);
  // the metal beyond the C=C's middle, as far from each as a metal's bond
  const metalAt: V3 = [0, 0, -Math.sqrt(Math.max(0.25, METAL_BOND * METAL_BOND - h * h))];
  const seen = (v: V3): Point => ({ x: -(v[2] - metalAt[2]) + TUB_ACROSS * v[1], y: v[0] + TUB_DOWN * v[1] });
  const pos = new Map<number, Point>([[d.metal, { x: 0, y: 0 }]]);
  const lift = new Map<number, number>([[d.metal, 0]]);
  for (const [a, v] of p3) {
    pos.set(a, seen(v));
    lift.set(a, v[1]);
  }
  // each star at its C=C's middle
  for (const s of d.stars) {
    const [u, v] = s.pi.map((a) => p3.get(a)!);
    const mid: V3 = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    pos.set(s.star, seen(mid));
    lift.set(s.star, mid[1]);
  }
  return { pos, lift };
}

/**
 * A metal and the rings bound to it by two C=C each - Ni(cod)2, [Rh(cod)2]+,
 * Ir(cod)Cl: the first tub to the metal's left, a second to its right (seen
 * from the same side, so mirrored), and the metal's other ligands hinted
 * where they are left room: opposite a lone tub, spread; above and below
 * two. A ring system the metal is in itself - Rh(cod)(acac)'s chelate - is
 * set on it as `chelateAt` has it, turned so that it lies the way its atoms
 * bonded to the metal would go, side by side; the rest of the metal's
 * ligands where the others would.
 */
function placeTubs(mol: Molecule, unit: MetalUnit, chelateAt?: ReadonlyMap<number, Point>): EtaLayout {
  const m = unit.metal;
  const pos = new Map<number, Point>([[m, { x: 0, y: 0 }]]);
  const lift = new Map<number, number>([[m, 0]]);
  unit.dienes.forEach((d, i) => {
    const laid = placeTub(d);
    const side = i === 0 ? 1 : -1;
    for (const [a, p] of laid.pos) if (a !== m) pos.set(a, { x: p.x * side, y: p.y });
    for (const [a, l] of laid.lift) if (a !== m) lift.set(a, l);
  });
  const stars = new Set(unit.dienes.flatMap((d) => d.stars.map((s) => s.star)));
  // (the chelate's atoms bonded to the metal first, side by side)
  const inChelate = new Set(unit.chelate?.atoms ?? []);
  const near = mol.neighbours[m].filter((l) => !stars.has(l));
  const others = [...near.filter((l) => inChelate.has(l)), ...near.filter((l) => !inChelate.has(l))];
  const k = others.length;
  const step = k <= 2 ? Math.PI / 2 : (2 * Math.PI) / 3 / (k - 1);
  const angles =
    unit.dienes.length === 1
      ? others.map((_, i) => (i - (k - 1) / 2) * step)
      : others.map((_, i) => (i % 2 ? -1 : 1) * (Math.PI / 2));
  const bonded = others.filter((l) => inChelate.has(l));
  const at = chelateAt?.get(m);
  if (bonded.length && chelateAt && at) {
    // its atoms bonded to the metal toward where their slots go, together
    const toward = bonded.reduce((v, _, i) => add(v, dir(angles[i])), { x: 0, y: 0 });
    const want = Math.hypot(toward.x, toward.y) > 1e-6 ? angleOf(toward) : angles[0];
    const has = angleOf(sub(centroid(bonded.map((l) => chelateAt.get(l)!)), at));
    for (const a of unit.chelate!.atoms) if (a !== m) pos.set(a, rotate(sub(chelateAt.get(a)!, at), want - has));
  }
  const hints = new Map<number, Map<number, Point>>();
  const hinted = others.flatMap((l, i) => (inChelate.has(l) ? [] : [[l, dir(angles[i])] as const]));
  if (hinted.length) hints.set(m, new Map(hinted));
  return { pos, hints, lift };
}

// --- two metals bridged by two atoms --------------------------------------------

/** How far above and below the line through the metals their bridging atoms are, in bond lengths: the ring seen a little from above. */
const PAIR_RISE = 0.6;
/**
 * And how much nearer the lower bridging atom is than the metals, the upper
 * as much further: the ring a square of a metal's bonds, so tilted.
 */
export const PAIR_DEPTH = Math.sqrt(Math.max(0, (METAL_BOND * METAL_BOND) / 2 - PAIR_RISE * PAIR_RISE));
/** How far a ring bound face-on to one of them is from its metal: a metal's bond, clear of the metal's label, which reads on toward it. */
const PAIR_TO_RING = METAL_BOND;

/**
 * Two metals bridged by two atoms - [Rh(cod)Cl]2, [RuCl2(p-cymene)]2,
 * [Pd(allyl)Cl]2 - as they are drawn: their four-membered ring level, the
 * metals left and right, the bridging atoms above and below the line
 * through them; each metal's own ligands outside, the second's the first's
 * turned half round - a tub on each, mirrored, as Ni(cod)2's are. A ring
 * bound face-on to the first metal goes above it and to the left, its other
 * ligands below and to the left; the second's the other way round.
 * `variant` gives each ring's spin, the first ring's fastest.
 */
function placePair(mol: Molecule, unit: MetalUnit, variant: number): EtaLayout {
  const pair = unit.pair!;
  const metals = [unit.metal, pair.metal];
  const half = Math.sqrt(METAL_BOND * METAL_BOND - PAIR_RISE * PAIR_RISE);
  const pos = new Map<number, Point>([
    [metals[0], { x: -half, y: 0 }],
    [metals[1], { x: half, y: 0 }],
    [pair.bridges[0], { x: 0, y: PAIR_RISE }],
    [pair.bridges[1], { x: 0, y: -PAIR_RISE }],
  ]);
  const lift = new Map<number, number>([...pos.keys()].map((a) => [a, 0]));
  const hints = new Map<number, Map<number, Point>>();
  const inUnit = new Set([...pos.keys(), ...unit.eta.flatMap((e) => e.atoms), ...unit.dienes.flatMap((d) => d.atoms)]);
  let v = variant;
  metals.forEach((m, k) => {
    const at = pos.get(m)!;
    // the second metal's side the first's turned half round
    const turned = (angle: number) => (k ? angle + Math.PI : angle);
    const tubs = unit.dienes.filter((d) => d.metal === m);
    tubs.forEach((d) => {
      const laid = placeTub(d);
      for (const [a, p] of laid.pos) if (a !== m) pos.set(a, { x: at.x + (k ? -p.x : p.x), y: at.y + p.y });
      for (const [a, l] of laid.lift) if (a !== m) lift.set(a, l);
    });
    const rings = unit.eta.filter((e) => e.metal === m);
    rings.forEach((e, j) => {
      const spins = etaSpins(mol, e);
      const laid = placeEta(mol, e, v % spins);
      v = Math.floor(v / spins);
      // its centre a bond out, above and to the outside; its own +y back toward the metal
      const out = turned((3 * Math.PI) / 4 + j * (Math.PI / 2));
      const centre = add(at, rotate({ x: PAIR_TO_RING, y: 0 }, out));
      const place = (p: Point) => add(centre, rotate(p, out + Math.PI / 2));
      for (const [a, p] of laid.pos) pos.set(a, place(p));
      for (const [a, l] of laid.lift) lift.set(a, l);
      for (const [a, h] of laid.hints) {
        const moved = new Map([...h].filter(([b]) => b !== m).map(([b, p]) => [b, place(p)]));
        if (moved.size) hints.set(a, moved);
      }
    });
    // its other ligands outside: below a ring, or round the outside
    const others = mol.neighbours[m].filter((l) => !inUnit.has(l));
    if (!others.length) return;
    const n = others.length;
    const from = rings.length ? (5 * Math.PI) / 4 : Math.PI;
    const step = Math.PI / 4;
    const angles = others.map((_, i) => turned(from + (i - (rings.length ? 0 : (n - 1) / 2)) * step));
    hints.set(m, new Map(others.map((l, i) => [l, add(at, dir(angles[i]))])));
  });
  return { pos, hints, lift };
}
