/**
 * Growing a structure out from its frame: each bond placed by the rules for
 * the atom it leaves, and the choices those rules leave free - which way a
 * chain turns, which side a branch goes, which way round a ring system is
 * hung - settled first by the rules of reading order, then by trying the
 * other way wherever it would do better.
 */
import {
  add,
  angleOf,
  centroid,
  cross,
  dir,
  dist,
  mirror,
  rotate,
  splitOutside,
  splitWidestGap,
  sub,
  wrap,
  type Point,
} from "./geometry";
import { metalSlots } from "./hapto";
import { isMetal, key, METAL_BOND, orderOf, type Molecule } from "./perceive";
import { MACROCYCLE } from "./ringSystem";

/** How the frame is set: turned by a multiple of 60 degrees, and mirrored or not. */
export type Frame = { turn: number; mirrored: boolean };

export const FRAMES: Frame[] = [false, true].flatMap((mirrored) =>
  [0, 1, 2, 3, 4, 5].map((k) => ({ turn: (k * Math.PI) / 3, mirrored })),
);


/** For each acyclic bond (by key, and which end), how many atoms lie beyond it. */
export function sidesOf(mol: Molecule): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k] of mol.bondIndex) {
    if (mol.ringBonds.has(k)) continue;
    const [a, b] = k.split(",").map(Number);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const seen = new Set([from, to]);
      const todo = [to];
      while (todo.length) {
        const u = todo.pop()!;
        for (const v of mol.linked[u]) {
          if (!seen.has(v)) {
            seen.add(v);
            todo.push(v);
          }
        }
      }
      out.set(`${from}>${to}`, seen.size - 1);
    }
  }
  return out;
}

/** The middle atom of a piece's longest path: where a structure with no ring starts. */
function middleOfLongestPath(mol: Molecule, piece: number[]): { middle: number; path: number[] } {
  const far = (s: number) => {
    const d = new Map([[s, 0]]);
    const parent = new Map<number, number>();
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      for (const v of mol.neighbours[q[h]]) {
        if (!d.has(v)) {
          d.set(v, d.get(q[h])! + 1);
          parent.set(v, q[h]);
          q.push(v);
        }
      }
    }
    // the furthest; among those, a carbon chain's end before a heteroatom's
    let best = s;
    for (const v of q) {
      const better =
        d.get(v)! > d.get(best)! ||
        (d.get(v)! === d.get(best)! && mol.el[v] === "C" && mol.el[best] !== "C");
      if (better) best = v;
    }
    const path = [best];
    while (parent.has(path[path.length - 1])) path.push(parent.get(path[path.length - 1])!);
    return { end: best, path };
  };
  const a = far(piece[0]).end;
  const { path } = far(a);
  return { middle: path[Math.floor((path.length - 1) / 2)], path };
}

export type Grown = Map<number, Point>;

/**
 * Lays out one connected piece with its frame set as `frame`: the largest
 * ring system (or, with no ring, the middle of the longest chain) placed
 * first, and everything else grown out from it.
 */
export function grow(
  mol: Molecule,
  piece: number[],
  local: Map<number, Map<number, Point>>,
  frame: Frame,
  sides: Map<string, number>,
  hints: Map<number, Map<number, Point>> = new Map(),
  upright: ReadonlySet<number> = new Set(),
): Grown {
  const pos: Grown = new Map();
  const queue: number[] = [];
  // a ring's atom bound face-on: what hangs from it lies in the ring's plane,
  // foreshortened as the ring is - where its hint puts it, not a bond off
  const faceOn = new Set(mol.eta.flatMap((e) => e.atoms));
  // how each ring system's own frame was set down: to carry its hints over
  const transforms = new Map<number, (p: Point) => Point>();
  const setFrame = (p: Point): Point => {
    const q = frame.mirrored ? { x: -p.x, y: p.y } : p;
    return rotate(q, frame.turn);
  };

  // a complex is grown from its metal, its ligands round it as the metal's
  // slots have them (section 7) - the most-bonded metal, where there are
  // several - where no ring runs through the metal (a chelate through a
  // ferrocene, dppf's, is closed at the metal instead)
  const open = (m: number) =>
    mol.neighbours[m].every((l) => !sideAtoms(mol, m, l).some((v) => v !== l && mol.neighbours[m].includes(v)));
  const centre = piece
    .filter((a) => isMetal(mol.el[a]) && mol.systemOf[a] < 0 && mol.neighbours[a].length >= 2 && open(a))
    .sort((p, q) => mol.neighbours[q].length - mol.neighbours[p].length || p - q)[0];
  const root = centre == null ? rootSystem(mol, piece) : -1;
  if (centre != null) {
    pos.set(centre, { x: 0, y: 0 });
    const weight = (l: number) => sides.get(`${centre}>${l}`) ?? 1;
    const [first, ...rest] = [...mol.neighbours[centre]].sort((p, q) => weight(q) - weight(p) || p - q);
    const placed: [number, number][] = [[first, setFrameAngle(frame, 0)], ...atMetal(mol, sides, centre, first, setFrameAngle(frame, 0), rest)];
    for (const [child, t] of placed) placeChild(mol, pos, local, queue, centre, child, t, transforms, hints, upright);
    queue.push(centre);
  } else if (root >= 0) {
    const L = local.get(root)!;
    const c = centroid([...L.values()]);
    // a cage drawn in perspective stays upright, as it was drawn
    const set = upright.has(root) ? (p: Point) => p : setFrame;
    transforms.set(root, (p) => set(sub(p, c)));
    for (const [a, p] of L) pos.set(a, set(sub(p, c)));
    queue.push(...mol.systems[root].atoms);
  } else {
    const { middle, path } = middleOfLongestPath(mol, piece);
    pos.set(middle, { x: 0, y: 0 });
    // the longest chain level through the middle, the middle at a peak;
    // anything else on it straight up
    const i = path.indexOf(middle);
    const along = [path[i - 1], path[i + 1]].filter((v) => v != null);
    const others = mol.neighbours[middle].filter((v) => !along.includes(v));
    const deg = mol.neighbours[middle].length;
    // (a cross, or the O between two, square to the page, the chain straight
    // through it and a double-bonded O above)
    const cross = isCross(mol, middle);
    const between = deg === 2 && along.length === 2 && along.every((v) => isCross(mol, v));
    // (an atom straight through - between two double bonds, or by a triple
    // one: an allene's, a ketene's, CO2's middle - as it is in a chain)
    const orders = along.map((v) => orderOf(mol, middle, v));
    const linear = deg === 2 && along.length === 2 && (orders.includes(3) || orders.every((o) => o === 2));
    // (a trident fanned, the bond into it level to the right)
    const fanEnds = tridentEnds(mol, middle);
    const fan = fanEnds ? mol.neighbours[middle].find((v) => !fanEnds.includes(v))! : -1;
    const slots =
      deg === 1
        ? [0]
        : fan >= 0
          ? [0, Math.PI, (2 * Math.PI) / 3, (4 * Math.PI) / 3]
          : between || linear
            ? [Math.PI, 0]
            : cross && along.length === 2
              ? [Math.PI, 0, Math.PI / 2, -Math.PI / 2]
              : deg === 2
                ? [(-150 * Math.PI) / 180, (-30 * Math.PI) / 180]
                : deg === 3
                  ? [(-150 * Math.PI) / 180, (-30 * Math.PI) / 180, Math.PI / 2]
                  : splitWidestGap([], deg, Math.PI);
    if (cross) others.sort((u, v) => orderOf(mol, middle, v) - orderOf(mol, middle, u));
    const order = fan >= 0 ? [fan, ...mol.neighbours[middle].filter((v) => v !== fan)] : [...along, ...others];
    order.forEach((v, k) => {
      const t = slots[k] ?? slots[slots.length - 1];
      placeChild(mol, pos, local, queue, middle, v, setFrameAngle(frame, t), transforms, hints, upright);
    });
    queue.push(...order);
  }

  for (let h = 0; h < queue.length; h++) {
    const a = queue[h];
    const children = mol.neighbours[a].filter((v) => !pos.has(v));
    if (!children.length) continue;
    const placed = mol.neighbours[a].filter((v) => pos.has(v));
    const at = pos.get(a)!;
    const taken = placed.map((v) => angleOf(sub(pos.get(v)!, at)));
    // a cage's bonds out go where the solid puts them
    const hinted = hints.get(a);
    const T = transforms.get(mol.systemOf[a]);
    const byHint: [number, number][] = [];
    if (hinted && T) {
      for (const c of children) {
        const h = hinted.get(c);
        if (h) byHint.push([c, angleOf(sub(T(h), at))]);
      }
    }
    // an upright cage hung from here comes in along its own bond out, as
    // it is drawn: that bond's way is set by the cage, not by this atom
    for (const c of children) {
      const s = mol.systemOf[c];
      const back = hints.get(c)?.get(a);
      if (s < 0 || !upright.has(s) || !back || byHint.some(([h]) => h === c)) continue;
      byHint.push([c, angleOf(sub(local.get(s)!.get(c)!, back))]);
    }
    // a metal bonded to another atom placed already - a chelate closing
    // through it (dppf's P and P on Pd): at the apex over the two, its bonds
    // as long as a square angle there asks, a bond at least, on the side
    // away from what is placed
    const closing: [number, number][] = [];
    for (const c of children) {
      const other = mol.neighbours[c].find((v) => v !== a && pos.has(v));
      if (!isMetal(mol.el[c]) || mol.systemOf[c] >= 0 || other == null || byHint.some(([h]) => h === c)) continue;
      const p2 = pos.get(other)!;
      const mid = { x: (at.x + p2.x) / 2, y: (at.y + p2.y) / 2 };
      const half = dist(at, p2) / 2;
      const height = half >= Math.SQRT1_2 ? half : Math.sqrt(Math.max(0, 1 - half * half));
      const across = rotate(sub(p2, at), Math.PI / 2);
      const unit = { x: across.x / (2 * half || 1), y: across.y / (2 * half || 1) };
      const rest = [...pos.values()];
      const centre = centroid(rest);
      const toward = (p: Point) => (p.x - centre.x) * unit.x + (p.y - centre.y) * unit.y;
      const sign = toward(add(mid, unit)) >= toward(add(mid, { x: -unit.x, y: -unit.y })) ? 1 : -1;
      const apex = { x: mid.x + sign * unit.x * height, y: mid.y + sign * unit.y * height };
      pos.set(c, apex);
      queue.push(c);
      closing.push([c, angleOf(sub(apex, at))]);
    }
    const rest = children.filter((c) => !byHint.some(([h]) => h === c) && !closing.some(([h]) => h === c));
    const assigned = rest.length
      ? assign(mol, pos, sides, a, placed, [...taken, ...byHint.map(([, t]) => t), ...closing.map(([, t]) => t)], rest)
      : [];
    for (const [child, t] of [...byHint, ...assigned]) {
      const h = faceOn.has(a) && mol.systemOf[child] < 0 && T ? hinted?.get(child) : undefined;
      if (h) {
        pos.set(child, T!(h));
        queue.push(child);
        continue;
      }
      placeChild(mol, pos, local, queue, a, child, t, transforms, hints, upright, sides);
    }
  }
  return pos;
}

/**
 * The ring system a piece is built round, its frame: the one nearest all
 * the rest of it (atorvastatin's pyrrole, not one of its phenyls), and of
 * those the largest; -1 for a piece with no ring.
 */
export function rootSystem(mol: Molecule, piece: number[]): number {
  const systemsHere = [...new Set(piece.map((a) => mol.systemOf[a]).filter((s) => s >= 0))];
  if (!systemsHere.length) return -1;
  const reach = (s: number) => {
    const d = new Map<number, number>();
    const q = [...mol.systems[s].atoms];
    q.forEach((a) => d.set(a, 0));
    for (let h = 0; h < q.length; h++) {
      for (const v of mol.neighbours[q[h]]) {
        if (!d.has(v)) {
          d.set(v, d.get(q[h])! + 1);
          q.push(v);
        }
      }
    }
    return Math.max(...d.values());
  };
  const far = new Map(systemsHere.map((s) => [s, reach(s)]));
  return systemsHere.sort(
    (p, q) =>
      far.get(p)! - far.get(q)! ||
      mol.systems[q].atoms.length - mol.systems[p].atoms.length ||
      mol.systems[q].rings.length - mol.systems[p].rings.length,
  )[0];
}

/**
 * The ways of setting a piece's frame down: turned by sixty degrees at a
 * time, and mirrored - and, for a frame of squares and no hexagons (a
 * penam), by thirty degrees at a time, the square's sides able to lie
 * level and upright either way round.
 */
export function framesFor(mol: Molecule, piece: number[]): Frame[] {
  const root = rootSystem(mol, piece);
  if (root < 0) return FRAMES;
  const sizes = mol.systems[root].rings.map((r) => mol.rings[r].length);
  if (!sizes.includes(4) || sizes.includes(6)) return FRAMES;
  return [false, true].flatMap((mirrored) =>
    Array.from({ length: 12 }, (_, k) => ({ turn: (k * Math.PI) / 6, mirrored })),
  );
}

function setFrameAngle(frame: Frame, t: number): number {
  const v = dir(t);
  const q = frame.mirrored ? { x: -v.x, y: v.y } : v;
  return angleOf(q) + frame.turn;
}

/**
 * The ways out of ring atom `a` (`slots`), turned together, within the room
 * outside its rings, away from an atom of its own ring system it is not
 * bonded to that one of them would end by - as at a narrow gap between
 * rings, three five-membered rings round one atom leaving 36 degrees
 * (bilobalide's C4 and C9, either side of theirs): each centre's groups
 * leaning out of the gap, as chemists draw them, not into each other.
 */
function leanAway(mol: Molecule, pos: Grown, a: number, taken: readonly number[], slots: number[]): number[] {
  const at = pos.get(a)!;
  // (not in a bridged system laid flat, its gaps where a bridge was pressed
  // into the page - tetrodotoxin's)
  const rings = mol.systems[mol.systemOf[a]].rings.map((r) => mol.rings[r]);
  if (rings.some((r, i) => rings.slice(i + 1).some((q) => q.filter((v) => r.includes(v)).length >= 3))) return slots;
  // (an atom across a narrow gap: bonded with `a` to one atom, the two
  // bonds under 45 degrees apart)
  const near: Point[] = [];
  for (const c of mol.neighbours[a]) {
    const pc = pos.get(c);
    if (!pc || mol.systemOf[c] !== mol.systemOf[a]) continue;
    for (const b of mol.neighbours[c]) {
      const pb = pos.get(b);
      if (b === a || !pb || mol.systemOf[b] !== mol.systemOf[a] || mol.neighbours[a].includes(b)) continue;
      const apart = Math.abs(wrap(angleOf(sub(pb, pc)) - angleOf(sub(at, pc))));
      if (apart < (45 * Math.PI) / 180) near.push(pb);
    }
  }
  if (!near.length) return slots;
  const room = (ts: readonly number[]) => Math.min(...ts.flatMap((t) => near.map((p) => dist(p, add(at, dir(t))))));
  if (room(slots) >= 0.9) return slots;
  // (each way kept 35 degrees clear of the atom's own bonds)
  const clear = (t: number) => taken.every((u) => Math.abs(wrap(t - u)) >= (35 * Math.PI) / 180);
  let best = slots;
  let bestRoom = room(slots);
  for (const deg of [10, -10, 20, -20, 30, -30, 40, -40]) {
    const turned = slots.map((t) => t + (deg * Math.PI) / 180);
    if (!turned.every(clear)) continue;
    const r = room(turned) - 0.005 * Math.abs(deg);
    if (r > bestRoom + 1e-9) {
      best = turned;
      bestRoom = r;
    }
  }
  return best;
}

/** Which child goes which way from atom `a`. */
function assign(
  mol: Molecule,
  pos: Grown,
  sides: Map<string, number>,
  a: number,
  placed: number[],
  taken: number[],
  children: number[],
): [number, number][] {
  const at = pos.get(a)!;
  const k = children.length;
  const weight = (c: number) => sides.get(`${a}>${c}`) ?? 1;
  const byWeight = [...children].sort((p, q) => weight(q) - weight(p) || p - q);

  if (isMetal(mol.el[a]) && mol.systemOf[a] < 0 && placed.length === 1) {
    return atMetal(mol, sides, a, placed[0], taken[0], children);
  }

  if (mol.systemOf[a] >= 0 || placed.length !== 1) {
    // a ring atom: the room outside the rings split evenly, the heaviest
    // branch nearest straight out
    // (a macrocycle's centre is not counted: at a zigzag corner the
    // substituent takes the wider side, inside the macrocycle or out)
    const centres = mol.ringsOf[a]
      .filter((r) => mol.rings[r].length < MACROCYCLE)
      .map((r) => angleOf(sub(centroid(mol.rings[r].map((v) => pos.get(v)!)), at)));
    const even = mol.systemOf[a] >= 0 ? splitOutside(taken, centres, k) : splitWidestGap(taken, k);
    const slots = mol.systemOf[a] >= 0 ? leanAway(mol, pos, a, taken, even) : even;
    const mid = slots.reduce((s, t) => s + t, 0) / slots.length;
    const byCentre = [...slots].sort((p, q) => Math.abs(wrap(p - mid)) - Math.abs(wrap(q - mid)));
    return byWeight.map((c, i) => [c, byCentre[i]]);
  }

  const parent = placed[0];
  const p = taken[0];
  const deg = k + 1;
  // a donor bonded to a metal (a phosphine's P): what it carries spread
  // away from the metal, as a tripod's legs - 75 degrees apart, the
  // heaviest straight out - clear of the metal's other ligands
  if (isMetal(mol.el[parent]) && k >= 2) {
    const legs = Array.from({ length: k }, (_, i) => p + Math.PI + (i - (k - 1) / 2) * ((5 * Math.PI) / 12));
    const mid = p + Math.PI;
    const byCentre = [...legs].sort((u, v) => Math.abs(wrap(u - mid)) - Math.abs(wrap(v - mid)));
    return byWeight.map((c, i) => [c, byCentre[i]]);
  }
  const orders = mol.neighbours[a].map((v) => orderOf(mol, a, v));
  // (and the O of a P-O-P, so that a run of crosses is one line)
  const straight =
    deg === 2 &&
    (orders.includes(3) ||
      orders.filter((o) => o === 2).length === 2 ||
      (isCross(mol, parent) && isCross(mol, children[0])));
  if (straight) return [[children[0], p + Math.PI]];
  if (deg === 4) {
    const slots = [p + Math.PI, p + Math.PI / 2, p - Math.PI / 2];
    if (isCross(mol, a)) {
      // a cross: the chain straight through it - a single bond before a
      // double one where it ends - and a double-bonded O above it
      const order = (c: number) => orderOf(mol, a, c);
      const [first, ...rest] = [...children].sort((u, v) => weight(v) - weight(u) || order(u) - order(v) || u - v);
      const [hi, lo] = rest.sort((u, v) => order(v) - order(u) || u - v);
      const up = Math.sin(slots[1]) >= Math.sin(slots[2]) ? slots[1] : slots[2];
      return [
        [first, slots[0]],
        [hi, up],
        [lo, up === slots[1] ? slots[2] : slots[1]],
      ];
    }
    // a tert-butyl, a CF3: its three ends fanned 60 degrees apart about the
    // line of the bond into it, as it is drawn, not a cross - grown from
    // one of its ends, that one the fan's middle one
    const ends = tridentEnds(mol, a);
    if (ends) {
      const end = children.find((c) => !ends.includes(c));
      if (end == null) return children.map((c, i) => [c, p + Math.PI + ((i - 1) * Math.PI) / 3]);
      const [m1, m2] = children.filter((c) => c !== end);
      return [
        [end, p + Math.PI],
        [m1, p + Math.PI / 3],
        [m2, p - Math.PI / 3],
      ];
    }
    return byWeight.map((c, i) => [c, slots[i]]);
  }
  if (deg > 4) {
    const slots = splitWidestGap(taken, k);
    return byWeight.map((c, i) => [c, slots[i]]);
  }

  // two or three bonds at 120 degrees: which side each child goes
  const both = [p + (2 * Math.PI) / 3, p - (2 * Math.PI) / 3];
  const bond = sub(at, pos.get(parent)!);
  const sideOf = (t: number) => Math.sign(cross(bond, dir(t)));

  // a stereo double bond to the parent decides
  const required = stereoSides(mol, pos, parent, a, children);
  if (required) {
    const out: [number, number][] = [];
    for (const c of children) {
      const want = required.get(c);
      const t = want != null ? both.find((s) => sideOf(s) === want) ?? both[0] : both[0];
      out.push([c, t]);
    }
    if (k === 2 && out[0][1] === out[1][1]) out[1][1] = both.find((s) => s !== out[0][1])!;
    return out;
  }

  // the chain carries on as a zigzag: trans to what the parent came from
  const grand = mol.neighbours[parent].filter((v) => v !== a && pos.has(v));
  let carryOn: number | null = null;
  if (mol.systemOf[parent] < 0 && grand.length === 1) {
    const g = pos.get(grand[0])!;
    const gSide = Math.sign(cross(bond, sub(g, pos.get(parent)!)));
    if (gSide !== 0) carryOn = both.find((s) => sideOf(s) === -gSide) ?? null;
  }
  if (carryOn == null) {
    // free: the way that runs the chain nearest level
    const level = (t: number) => {
      const axis = add(dir(angleOf(bond)), dir(t));
      return Math.abs(Math.sin(angleOf(axis)));
    };
    carryOn = level(both[0]) <= level(both[1]) + 1e-9 ? both[0] : both[1];
  }
  // Two bonds past a cis double bond the chain takes up again the line it
  // ran along before it: the double bond a step in a straight chain, as a
  // fatty acid's is drawn - not a bend it runs off along.
  const resumed = resume(mol, pos, a, parent, grand);
  if (resumed) {
    const along = (t: number) => {
      const axis = add(dir(angleOf(bond)), dir(t));
      return Math.cos(angleOf(axis) - angleOf(resumed));
    };
    carryOn = along(both[0]) >= along(both[1]) ? both[0] : both[1];
  }
  const other = both.find((s) => s !== carryOn)!;
  const angleAt = (t: number) => Math.abs(wrap(t - p));
  const opens = (t: number) => angleAt(t) > (2 * Math.PI) / 3 - 1e-6 && angleAt(t) < Math.PI - 1e-6;
  if (k === 1 && isCross(mol, children[0])) {
    // a cross set square to the page: the bond into it level where the
    // angle here allows (150 degrees, the join giving way), else upright,
    // else straight on
    const turns = [0, 1, 2, 3].map((i) => (i * Math.PI) / 2);
    const open = turns.filter(opens);
    const level = open.find((t) => Math.abs(Math.cos(t)) > 0.5);
    const into = level ?? open[0] ?? turns.find((t) => angleAt(t) > Math.PI - 1e-6);
    if (into != null) return [[children[0], into]];
  }
  if (k === 1 && isCross(mol, parent)) {
    // and out of a cross back onto the lattice, the join giving way again,
    // the zigzag turning the way it would have
    const lattice = [0, 1, 2, 3, 4, 5].map((i) => Math.PI / 6 + (i * Math.PI) / 3);
    const open = lattice.filter(opens).sort((u, v) => Math.abs(wrap(u - carryOn!)) - Math.abs(wrap(v - carryOn!)));
    if (open.length) return [[children[0], open[0]]];
  }
  if (k === 1) return [[children[0], carryOn]];
  // At an alpha carbon the backbone carries on, N to C(=O) or back, and the
  // side chain branches off - however much heavier the side chain is.
  const next = backbone(mol, a, parent, children);
  const first = next ?? byWeight[0];
  const second = children.find((c) => c !== first)!;
  return [
    [first, carryOn],
    [second, other],
  ];
}

/**
 * Which way each child of a metal goes, the bond in from `parent` fixed:
 * the metal's slots (`metalSlots`) turned to put that bond in one of its
 * kind, rings to rings, and the rest given the others so that the bulkiest
 * are furthest apart - two bulky ligands trans to each other, the small
 * ones (Cl, H, CO) between.
 */
function atMetal(
  mol: Molecule,
  sides: Map<string, number>,
  a: number,
  parent: number,
  p: number,
  children: number[],
): [number, number][] {
  const etaSystem = new Map(mol.eta.map((e) => [e.star, mol.systems[e.system].atoms.length]));
  const isRing = (l: number) => etaSystem.has(l);
  // (a ring's bulk is its system's; another ligand's, what lies beyond it)
  const weight = (l: number) => etaSystem.get(l) ?? sides.get(`${a}>${l}`) ?? 1;
  const all = [parent, ...children];
  const slots = metalSlots(all.filter(isRing).length, all.filter((l) => !isRing(l)).length);
  let best: { cost: number; out: [number, number][] } | null = null;
  for (const [j, s] of slots.entries()) {
    if (s.ring !== isRing(parent)) continue;
    const turn = p - s.angle;
    const free = slots.filter((_, i) => i !== j).map((t) => ({ ...t, angle: t.angle + turn }));
    for (const out of placements(children, free, isRing)) {
      const placedAt: [number, number][] = [[parent, p], ...out];
      // bulky pairs near each other cost the most
      let cost = 0;
      for (let u = 0; u < placedAt.length; u++) {
        for (let v = u + 1; v < placedAt.length; v++) {
          cost += weight(placedAt[u][0]) * weight(placedAt[v][0]) * Math.cos(placedAt[u][1] - placedAt[v][1]);
        }
      }
      if (!best || cost < best.cost - 1e-9) best = { cost, out };
    }
  }
  return best?.out ?? children.map((c, i) => [c, p + ((i + 1) * 2 * Math.PI) / (children.length + 1)]);
}

/** Each way of giving `children` the free slots, a ring's to a ring (all of them, for up to six; else in order). */
function placements(
  children: number[],
  free: { angle: number; ring: boolean }[],
  isRing: (l: number) => boolean,
): [number, number][][] {
  if (children.length > 6) {
    const left = [...free];
    return [
      children.map((c) => {
        const i = Math.max(0, left.findIndex((s) => s.ring === isRing(c)));
        return [c, left.splice(i, 1)[0]?.angle ?? 0] as [number, number];
      }),
    ];
  }
  const out: [number, number][][] = [];
  const go = (i: number, used: boolean[], acc: [number, number][]) => {
    if (i === children.length) return void out.push([...acc]);
    free.forEach((s, j) => {
      if (used[j] || s.ring !== isRing(children[i])) return;
      used[j] = true;
      acc.push([children[i], s.angle]);
      go(i + 1, used, acc);
      acc.pop();
      used[j] = false;
    });
  };
  go(0, free.map(() => false), []);
  return out;
}

/**
 * A phosphorus or sulfur with four bonds, in no ring - a phosphate, a
 * sulfonyl: drawn as a cross, square to the page.
 */
export function isCross(mol: Molecule, a: number): boolean {
  return (mol.el[a] === "P" || mol.el[a] === "S") && mol.neighbours[a].length === 4 && mol.systemOf[a] < 0;
}

/**
 * The three ends of a group drawn as a trident, from its middle atom `a`:
 * a tert-butyl's methyls, a trimethylsilyl's, a trimethylammonium's
 * (choline's), a CF3's or a CCl3's halogens. Its middle a carbon, a
 * silicon or a nitrogen in no ring, with four bonds - three to like ends,
 * each bonded to nothing else, and the fourth to anything but another
 * such end (neopentane's middle carbon, four methyls, is a cross; CF4's
 * likewise). Null for any other atom.
 */
export function tridentEnds(mol: Molecule, a: number): number[] | null {
  if (!TRIDENT_MIDDLES.has(mol.el[a]) || mol.systemOf[a] >= 0 || mol.neighbours[a].length !== 4) return null;
  const kind = (v: number) => (mol.neighbours[v].length === 1 && TRIDENT_ENDS.has(mol.el[v]) ? mol.el[v] : null);
  for (const el of TRIDENT_ENDS) {
    const ends = mol.neighbours[a].filter((v) => kind(v) === el);
    if (ends.length === 3) return ends;
  }
  return null;
}

/** What a trident's middle atom may be, and its ends. */
const TRIDENT_MIDDLES = new Set(["C", "Si", "N"]);
const TRIDENT_ENDS = new Set(["C", "F", "Cl", "Br", "I"]);

/** A carbonyl carbon of an acid, an ester or an amide: C(=O)O or C(=O)N. */
function isCarbonyl(mol: Molecule, c: number): boolean {
  if (mol.el[c] !== "C") return false;
  const nb = mol.neighbours[c];
  return (
    nb.some((v) => mol.el[v] === "O" && orderOf(mol, c, v) === 2) &&
    nb.some((v) => (mol.el[v] === "O" || mol.el[v] === "N") && orderOf(mol, c, v) === 1)
  );
}

/**
 * Where `a` is an alpha carbon reached from its N or its carbonyl carbon,
 * the child that carries the backbone on: the other of the two.
 */
function backbone(mol: Molecule, a: number, parent: number, children: number[]): number | null {
  if (mol.el[a] !== "C") return null;
  if (mol.el[parent] === "N") return children.find((c) => isCarbonyl(mol, c)) ?? null;
  if (isCarbonyl(mol, parent)) return children.find((c) => mol.el[c] === "N") ?? null;
  return null;
}

/**
 * The line a chain ran along before a cis double bond two bonds back from
 * `a` - parent, then the double bond's near end (`grand`), then its far
 * end - as the chain's own zigzag had it there; null where there is none.
 */
function resume(mol: Molecule, pos: Grown, a: number, parent: number, grand: number[]): Point | null {
  if (grand.length !== 1 || mol.systemOf[a] >= 0 || mol.systemOf[parent] >= 0) return null;
  const g = grand[0];
  const placedBeside = (u: number, not: number) =>
    mol.neighbours[u].filter((v) => v !== not && pos.has(v) && mol.systemOf[v] < 0);
  const [far] = placedBeside(g, parent);
  if (far == null) return null;
  const bi = mol.bondIndex.get(key(g, far));
  const b = bi != null ? mol.bonds[bi] : null;
  if (!b || b.order !== 2 || !b.stereo?.cis) return null;
  const [before] = placedBeside(far, g);
  if (before == null) return null;
  const [twoBefore] = placedBeside(before, far);
  if (twoBefore == null) return null;
  return sub(pos.get(far)!, pos.get(twoBefore)!);
}

/**
 * Where the bond parent=a is a stereo double bond, which side of it (as seen
 * along parent to a) each of a's children must go.
 */
function stereoSides(
  mol: Molecule,
  pos: Grown,
  parent: number,
  a: number,
  children: number[],
): Map<number, number> | null {
  const i = mol.bondIndex.get(key(parent, a));
  if (i == null) return null;
  const bond = mol.bonds[i];
  if (bond.order !== 2 || !bond.stereo) return null;
  const [r1, r2] = bond.stereo.refs;
  const onParent = mol.neighbours[parent].includes(r1) && r1 !== a ? r1 : r2;
  const onA = onParent === r1 ? r2 : r1;
  const pp = pos.get(onParent);
  if (!pp) return null;
  const line = sub(pos.get(a)!, pos.get(parent)!);
  const refSide = Math.sign(cross(line, sub(pp, pos.get(parent)!)));
  if (!refSide) return null;
  const wantRef = bond.stereo.cis ? refSide : -refSide;
  const out = new Map<number, number>();
  for (const c of children) out.set(c, c === onA ? wantRef : -wantRef);
  return out;
}

/** Places `child`, bonded to placed `a`, in direction `t` - an atom, or its whole ring system. */
function placeChild(
  mol: Molecule,
  pos: Grown,
  local: Map<number, Map<number, Point>>,
  queue: number[],
  a: number,
  child: number,
  t: number,
  transforms: Map<number, (p: Point) => Point>,
  hints: Map<number, Map<number, Point>>,
  upright: ReadonlySet<number> = new Set(),
  sides?: Map<string, number>,
): void {
  // (a metal's bond to a ligand drawn longer, as it is: room for the ligands)
  const length = isMetal(mol.el[a]) !== isMetal(mol.el[child]) && mol.el[a] !== "*" && mol.el[child] !== "*" ? METAL_BOND : 1;
  const at = add(pos.get(a)!, { x: Math.cos(t) * length, y: Math.sin(t) * length });
  const s = mol.systemOf[child];
  if (s < 0) {
    pos.set(child, at);
    queue.push(child);
    return;
  }
  const L = local.get(s)!;
  const c0 = L.get(child)!;
  if (upright.has(s)) {
    transforms.set(s, (p) => add(at, sub(p, c0)));
    for (const [v, p] of L) {
      if (pos.has(v)) continue;
      pos.set(v, add(at, sub(p, c0)));
      queue.push(v);
    }
    return;
  }
  // the way out of the ring system at `child`, in its own frame
  const ringNb = mol.neighbours[child].filter((v) => L.has(v));
  const out = mol.neighbours[child].filter((v) => !L.has(v));
  const slots = splitOutside(
    ringNb.map((v) => angleOf(sub(L.get(v)!, c0))),
    mol.ringsOf[child]
      .filter((r) => mol.rings[r].length < MACROCYCLE)
      .map((r) => angleOf(sub(centroid(mol.rings[r].map((v) => L.get(v)!)), c0))),
    out.length,
  );
  const mid = slots.reduce((sum, x) => sum + x, 0) / slots.length;
  const hinted = hints.get(child)?.get(a);
  const slot = hinted
    ? angleOf(sub(hinted, c0))
    : [...slots].sort((p, q) => Math.abs(wrap(p - mid)) - Math.abs(wrap(q - mid)))[0];
  const turn = t + Math.PI - slot;
  // hung from a ring's atom (a biaryl's bond), the ring system the way round
  // that puts what hangs beside the bond on its side opposite what hangs
  // beside it on the parent's - BINOL's OH, BINAP's PPh2, anti - where both
  // have something there; mirrored across the bond, if not
  const place = (p: Point) => add(at, rotate(sub(p, c0), turn));
  const mirrored = (p: Point) => add(at, rotate(reflect(sub(p, c0), slot), turn));
  const T = sides && biarylSyn(mol, pos, sides, a, child, L, place) ? mirrored : place;
  transforms.set(s, T);
  for (const [v, p] of L) {
    if (pos.has(v)) continue;
    pos.set(v, T(p));
    queue.push(v);
  }
}

/** `v` reflected across the line through the origin at angle `t`. */
function reflect(v: Point, t: number): Point {
  const u = rotate(v, -t);
  return rotate({ x: u.x, y: -u.y }, t);
}

/**
 * Whether a ring system hung from ring atom `a` by its atom `child`, set
 * down by `place`, has the heavier of what hangs beside `child` on the same
 * side of the bond as the heavier of what hangs beside `a`: false where
 * either has nothing there, or `a` is in no ring.
 */
function biarylSyn(
  mol: Molecule,
  pos: Grown,
  sides: Map<string, number>,
  a: number,
  child: number,
  L: Map<number, Point>,
  place: (p: Point) => Point,
): boolean {
  const sa = mol.systemOf[a];
  if (sa < 0) return false;
  /** The ring neighbour of `x` (not `other`) with the most hanging beside it outside its system, and that much. */
  const heaviest = (x: number, other: number, inSystem: (v: number) => boolean) => {
    let best: number | null = null;
    let most = 0;
    for (const n of mol.neighbours[x]) {
      if (n === other || !inSystem(n)) continue;
      const out = mol.neighbours[n].filter((v) => v !== x && !inSystem(v));
      const w = out.reduce((t, v) => t + (sides.get(`${n}>${v}`) ?? 1), 0);
      if (w > most) {
        most = w;
        best = n;
      }
    }
    return best;
  };
  const ha = heaviest(a, child, (v) => mol.systemOf[v] === sa);
  const hc = heaviest(child, a, (v) => L.has(v));
  if (ha == null || hc == null || !pos.has(ha)) return false;
  const pa = pos.get(a)!;
  const along = sub(place(L.get(child)!), pa);
  const side = (p: Point) => Math.sign(along.x * (p.y - pa.y) - along.y * (p.x - pa.x));
  return side(pos.get(ha)!) === side(place(L.get(hc)!));
}

/**
 * Mirrors the smaller side of an acyclic single bond across the bond's own
 * line - the one free choice a single bond leaves.
 */
export function flip(mol: Molecule, pos: Grown, a: number, b: number, sides: Map<string, number>): void {
  const beyondB = sides.get(`${a}>${b}`) ?? 0;
  const beyondA = sides.get(`${b}>${a}`) ?? 0;
  const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
  const pa = pos.get(from)!;
  const pb = pos.get(to)!;
  const seen = new Set([from, to]);
  const todo = [to];
  while (todo.length) {
    const u = todo.pop()!;
    for (const v of mol.linked[u]) {
      if (seen.has(v)) continue;
      seen.add(v);
      todo.push(v);
      pos.set(v, mirror(pos.get(v)!, pa, pb));
    }
  }
}

/** The atoms on `to`'s side of the bond from-to (acyclic), `to` among them. */
export function sideAtoms(mol: Molecule, from: number, to: number): number[] {
  const seen = new Set([from, to]);
  const out = [to];
  for (let h = 0; h < out.length; h++) {
    for (const v of mol.linked[out[h]]) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

/** Turns the atoms `side` about the atom at `pivot` by `angle`. */
export function turnSide(pos: Grown, side: readonly number[], pivot: Point, angle: number): void {
  for (const v of side) pos.set(v, add(pivot, rotate(sub(pos.get(v)!, pivot), angle)));
}

/** Moves the atoms `side` along the bond from `from` to `to` by `by`: stretching it. */
export function stretchSide(pos: Grown, side: readonly number[], from: Point, to: Point, by: number): void {
  const d = dir(angleOf(sub(to, from)));
  for (const v of side) pos.set(v, add(pos.get(v)!, { x: d.x * by, y: d.y * by }));
}

/** The bonds whose smaller side can be mirrored and change the drawing. */
export function flippable(mol: Molecule, sides: Map<string, number>): [number, number][] {
  const out: [number, number][] = [];
  for (const [k, i] of mol.bondIndex) {
    if (mol.ringBonds.has(k) || mol.bonds[i].order !== 1) continue;
    const [a, b] = k.split(",").map(Number);
    const small = Math.min(sides.get(`${a}>${b}`) ?? 0, sides.get(`${b}>${a}`) ?? 0);
    // one atom beyond is on the line itself; two or more can move
    if (small >= 2) out.push([a, b]);
  }
  return out;
}

