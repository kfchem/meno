/**
 * A structure as drawn made regular, its arrangement kept (the maintainer,
 * 2026-10-27, on structures read from a figure): which atom is bonded to
 * which, where its rings are and how they are turned, the side each
 * substituent and branch is on, and the bonds' marks, all as drawn; its
 * geometry the style's - every bond `bond` long, standard angles, regular
 * rings. Each ring system is the engine's flat one (of its ways of being
 * laid flat, the nearest turning no corner the other way), fitted onto
 * where it is drawn, however unevenly; each chain goes the way it is drawn,
 * at the standard angles, on the side it is drawn. A ring drawn as a chair,
 * a bridged system and a cage are drawings in perspective, kept as drawn
 * (the maintainer, 2026-10-27), and the bonds out of them too. Crowded, or
 * crossing what the drawing does not cross, it is cleared, its arrangement
 * kept (untangleKept); still so - or with two bonds at an atom narrower
 * than Meno draws any (`NARROWEST`), or a group closed up on its neighbour
 * where the drawing has it open (`closedUp`) - it is none, and left as
 * drawn. Pure.
 */
import { layoutFlat } from "./engine";
import { ringSystemVariants } from "./ringSystem";
import { untangledKeeping } from "./untangleKept";
import type { Point } from "./geometry";
import { isMetal, perceive, type Molecule } from "./perceive";

export type DrawnAtom = { x: number; y: number; el: string; charge?: number; unsure?: boolean };
/** A bond as drawn; `stereo`, a wedge or a hash. */
export type DrawnBond = { a: number; b: number; order: number; stereo?: boolean };

/**
 * How far a chain's bond set at a standard angle may move its far end from the way it is drawn, in bonds - as the turn that
 * moves it so far - before the nearest twelfth of a turn is taken instead. It bounds each bond's turn, not where an atom
 * ends up: a ring drawn unevenly is the regular one however far off it is drawn (the maintainer, 2026-10-27).
 */
export const MOST_MOVED = 0.5;
const MOST_TURNED = 2 * Math.asin(MOST_MOVED / 2);
/**
 * The narrowest two bonds at an atom may come out at, made regular: the narrowest Meno draws is 60 deg, a three-membered
 * ring's, or two groups on one ring atom. Narrower, where the drawing has them wider, it is none.
 */
const NARROWEST = 55 * (Math.PI / 180);
/** How near two atoms not bonded may come, in bonds. */
const NEAREST = 0.45;
const DEG = Math.PI / 180;

const angleOf = (p: Point, q: Point) => Math.atan2(q.y - p.y, q.x - p.x);
const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const apart = (a: number, b: number) => Math.abs(turn(a - b));

/** How far from parallel two opposite bonds of a ring drawn as a chair may be. */
const PARALLEL = Math.sin(12 * DEG);

/**
 * Whether a ring of six, its atoms in order round it, is drawn as a chair - in perspective, as a textbook draws one: each of
 * its three pairs of opposite bonds parallel, its outline not convex (a flat hexagon's opposite sides are parallel too).
 */
export function drawnAsChair(ring: readonly Point[]): boolean {
  if (ring.length !== 6) return false;
  const e = ring.map((p, i) => ({ x: ring[(i + 1) % 6].x - p.x, y: ring[(i + 1) % 6].y - p.y }));
  const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;
  const parallel = [0, 1, 2].every((i) => Math.abs(cross(e[i], e[i + 3])) <= PARALLEL * Math.hypot(e[i].x, e[i].y) * Math.hypot(e[i + 3].x, e[i + 3].y));
  const turns = e.map((u, i) => Math.sign(cross(u, e[(i + 1) % 6])));
  return parallel && turns.some((t) => t > 0) && turns.some((t) => t < 0);
}

/** A ring's atoms in order round it. */
function roundRing(mol: Molecule, ring: readonly number[]): number[] {
  const inRing = new Set(ring);
  const out = [ring[0]];
  while (out.length < ring.length) {
    const last = out[out.length - 1];
    const next = mol.neighbours[last].find((v) => inRing.has(v) && !out.includes(v) && (out.length > 1 || v !== ring[0]));
    if (next == null) return [...ring];
    out.push(next);
  }
  return out;
}

/**
 * Whether a ring system is kept as drawn: one holding a ring drawn as a chair (`drawnAsChair`), a drawing in perspective; a
 * bridged one, or one the engine lays out only in perspective - a cage - drawn so too; or one holding a metal or a haptic bond's star, which have no standard
 * angles to be laid out at.
 */
function keptAsDrawn(mol: Molecule, sysAt: number, drawn: readonly DrawnAtom[]): boolean {
  const sys = mol.systems[sysAt];
  if (sys.atoms.some((i) => isMetal(drawn[i].el) || drawn[i].el === "*")) return true;
  if (sys.rings.some((r) => mol.rings[r].length === 6 && drawnAsChair(roundRing(mol, mol.rings[r]).map((i) => drawn[i])))) return true;
  // (a bridged system - two of its rings sharing more than a bond - drawn as it is meant, in perspective: the maintainer, 2026-10-27)
  const rings = sys.rings.map((r) => new Set(mol.rings[r]));
  if (rings.some((r, i) => rings.some((t, j) => j > i && [...r].filter((a) => t.has(a)).length > 2))) return true;
  const laid = layoutFlat(mol, sys);
  return !!laid.solid || !!laid.depth?.size;
}

/** How many of a ring system's ways of being laid flat are tried against how it is drawn. */
const MOST_VARIANTS = 8;

/**
 * The ring system's atoms laid flat by the engine - of its ways of being laid flat, the one nearest how it is drawn - fitted,
 * turned, moved, and mirrored where that fits better, onto where they are drawn; kept as drawn (`keptAsDrawn`), as drawn.
 */
function fitted(mol: Molecule, sysAt: number, drawn: readonly DrawnAtom[], bond: number): Map<number, Point> | null {
  const sys = mol.systems[sysAt];
  if (keptAsDrawn(mol, sysAt, drawn)) return new Map(sys.atoms.map((i) => [i, { x: drawn[i].x, y: drawn[i].y }]));
  const count = Math.min(MOST_VARIANTS, Math.max(1, ringSystemVariants(mol, sys)));
  // (of those turning no corner of it the other way from the drawing, the nearest; none doing so, as drawn)
  const tries = [undefined, ...Array.from({ length: count }, (_, v) => v)]
    .flatMap((v) => fittedAs(mol, sys, v, drawn, bond))
    .filter((f) => !turnsAnother(mol, sys.atoms, drawn, f.place));
  const best = tries.sort((p, q) => p.worst - q.worst)[0];
  return best ? best.place : new Map(sys.atoms.map((i) => [i, { x: drawn[i].x, y: drawn[i].y }]));
}

/** How far from straight a corner must be, drawn and laid out, for the way it turns to count. */
const TURNS = Math.sin(10 * DEG);

/** Whether any corner among `ids` - two bonds meeting at one of them, all three atoms among them - turns the other way laid out (`place`) than drawn. */
function turnsAnother(mol: Molecule, ids: readonly number[], drawn: readonly DrawnAtom[], place: ReadonlyMap<number, Point>): boolean {
  const cross = (p: Point, q: Point, r: Point) => {
    const u = { x: q.x - p.x, y: q.y - p.y };
    const v = { x: r.x - q.x, y: r.y - q.y };
    return (u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
  };
  for (const q of ids) {
    const ns = mol.neighbours[q].filter((n) => place.has(n));
    for (const p of ns)
      for (const r of ns) {
        if (p >= r) continue;
        const d = cross(drawn[p], drawn[q], drawn[r]);
        const l = cross(place.get(p)!, place.get(q)!, place.get(r)!);
        if (Math.abs(d) > TURNS && Math.abs(l) > TURNS && d * l < 0) return true;
      }
  }
  return false;
}

/** The ring system laid flat as `variant`, fitted onto where it is drawn, as it is and mirrored. */
function fittedAs(mol: Molecule, sys: Molecule["systems"][number], variant: number | undefined, drawn: readonly DrawnAtom[], bond: number): { place: Map<number, Point>; worst: number }[] {
  const laid = layoutFlat(mol, sys, variant);
  if (laid.solid || laid.depth?.size) return [];
  const ids = sys.atoms;
  if (ids.some((i) => !laid.pos.has(i))) return [];
  // (at `bond`: the engine's ring bonds the length it lays them at)
  const ringBonds = mol.bonds.filter((b) => mol.ringBonds.has(b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`) && laid.pos.has(b.a) && laid.pos.has(b.b));
  const lengths = ringBonds.map((b) => Math.hypot(laid.pos.get(b.a)!.x - laid.pos.get(b.b)!.x, laid.pos.get(b.a)!.y - laid.pos.get(b.b)!.y)).sort((p, q) => p - q);
  const unit = lengths[lengths.length >> 1];
  if (!unit) return [];
  const w = ids.map((i) => (drawn[i].unsure ? 0 : 1));
  const weights = w.some((v) => v > 0) ? w : ids.map(() => 1);
  const total = weights.reduce((s, v) => s + v, 0);
  const best = [1, -1]
    .map((mirror) => {
      const t = ids.map((i) => ({ x: (mirror * laid.pos.get(i)!.x * bond) / unit, y: (laid.pos.get(i)!.y * bond) / unit }));
      const tc = { x: t.reduce((s, p, k) => s + p.x * weights[k], 0) / total, y: t.reduce((s, p, k) => s + p.y * weights[k], 0) / total };
      const dc = { x: ids.reduce((s, i, k) => s + drawn[i].x * weights[k], 0) / total, y: ids.reduce((s, i, k) => s + drawn[i].y * weights[k], 0) / total };
      let sin = 0;
      let cos = 0;
      ids.forEach((i, k) => {
        const p = { x: t[k].x - tc.x, y: t[k].y - tc.y };
        const q = { x: drawn[i].x - dc.x, y: drawn[i].y - dc.y };
        sin += weights[k] * (p.x * q.y - p.y * q.x);
        cos += weights[k] * (p.x * q.x + p.y * q.y);
      });
      const r = Math.atan2(sin, cos);
      const place = t.map((p) => ({ x: dc.x + (p.x - tc.x) * Math.cos(r) - (p.y - tc.y) * Math.sin(r), y: dc.y + (p.x - tc.x) * Math.sin(r) + (p.y - tc.y) * Math.cos(r) }));
      const worst = Math.max(...ids.map((i, k) => (weights[k] ? Math.hypot(place[k].x - drawn[i].x, place[k].y - drawn[i].y) : 0)));
      return { place, worst };
    })
;
  return best.map((b) => ({ place: new Map(ids.map((i, k) => [i, b.place[k]])), worst: b.worst }));
}

/**
 * The directions `n` bonds leave an atom in, the way each is drawn (`drawnAt`), given the directions of its bonds placed
 * already (`placed`): the standard angles - round a chain's atom, a third of a turn apart (half a turn where it is linear),
 * out of a ring along the bisector of its ring bonds - each matched to a drawn bond in the order round the atom they are
 * drawn in; where those are turned too far from the drawing, the nearest twelfth of a turn to each. None where even that is.
 */
function directions(placed: readonly number[], drawnAt: readonly number[], linear: boolean, inRing: boolean): number[] | null {
  const n = drawnAt.length;
  if (!n) return [];
  // (an atom first placed, nothing about it yet: its first bond as drawn, the rest round it)
  if (!placed.length) {
    const rest = directions([drawnAt[0]], drawnAt.slice(1), linear, inRing);
    return rest && [drawnAt[0], ...rest];
  }
  const ref = placed[0];
  const standard = (): number[] | null => {
    if (inRing && placed.length >= 2) {
      // (out of the ring: along the bisector of the widest gap between its placed bonds, a twelfth of a turn either side for two)
      const sorted = [...placed].sort((p, q) => p - q);
      let gap = { at: 0, size: -1 };
      sorted.forEach((a, i) => {
        const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
        if (next - a > gap.size) gap = { at: a, size: next - a };
      });
      const mid = gap.at + gap.size / 2;
      if (n === 1) return [mid];
      if (n === 2) return [mid - 30 * DEG, mid + 30 * DEG];
      return null;
    }
    if (placed.length !== 1) return null;
    const d = n + 1;
    if (d === 2) return linear ? [ref + Math.PI] : null;
    if (d === 3) return [ref + 120 * DEG, ref - 120 * DEG];
    if (d === 4) return [ref + 90 * DEG, ref + 180 * DEG, ref + 270 * DEG];
    return null;
  };
  // (a chain's atom with one bond out: the way it turns as drawn, a third of a turn round - or straight on, where it is linear)
  if (!inRing && placed.length === 1 && n === 1) {
    return linear ? [ref + Math.PI] : [[ref + 120 * DEG, ref - 120 * DEG].sort((p, q) => apart(p, drawnAt[0]) - apart(q, drawnAt[0]))[0]];
  }
  const set = standard();
  // (a chain's atom of three bonds: a third of a turn apart, in the order round it they are drawn in, however skewed they are)
  if (set && !inRing && placed.length === 1 && n === 2) {
    const from = (a: number) => (turn(a - ref) + 2 * Math.PI) % (2 * Math.PI);
    return from(drawnAt[0]) <= from(drawnAt[1]) ? [set[0], set[1]] : [set[1], set[0]];
  }
  if (set) {
    // (matched in the order round the atom, from its first placed bond)
    const from = (a: number) => (turn(a - ref) + 2 * Math.PI) % (2 * Math.PI);
    const order = drawnAt.map((_, i) => i).sort((p, q) => from(drawnAt[p]) - from(drawnAt[q]));
    const ideal = [...set].sort((p, q) => from(p) - from(q));
    const out: number[] = new Array(n);
    order.forEach((i, k) => (out[i] = ideal[k]));
    if (out.every((a, i) => apart(a, drawnAt[i]) <= MOST_TURNED)) return out;
  }
  // (else each to the nearest twelfth of a turn from the first placed bond that no other bond there takes)
  const taken = [...placed];
  const out: number[] = [];
  for (const a of drawnAt) {
    const twelfths = Array.from({ length: 12 }, (_, k) => ref + k * 30 * DEG).sort((p, q) => apart(p, a) - apart(q, a));
    const snapped = twelfths.find((t) => !taken.some((u) => apart(u, t) < 30 * DEG - 1e-9));
    if (snapped == null) return null;
    taken.push(snapped);
    out.push(snapped);
  }
  return out;
}

/** The bisector of the widest gap between some directions out of an atom: the way out of a ring at one of its atoms. */
function bisectorOf(ways: readonly number[]): number | null {
  if (ways.length < 2) return null;
  const sorted = [...ways].sort((p, q) => p - q);
  let gap = { at: 0, size: -1 };
  sorted.forEach((a, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    if (next - a > gap.size) gap = { at: a, size: next - a };
  });
  return gap.at + gap.size / 2;
}

function crosses(p: Point, q: Point, r: Point, s: Point): boolean {
  const side = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = side(r, s, p);
  const d2 = side(r, s, q);
  const d3 = side(p, q, r);
  const d4 = side(p, q, s);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/**
 * Where each atom of a structure as drawn goes, made regular with its arrangement kept (see above), every bond `bond`
 * long; each of its pieces - a salt's ions - about where it is drawn. None, where it cannot be so made: it is left as drawn.
 */
export function regularised(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], bond: number, why?: (none: "crowded" | "crossing" | "narrow" | "no way") => void): Point[] | null {
  if (!atoms.length || !bonds.length) return null;
  const mol = perceive({ atoms: atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: bonds.map((b) => ({ a: b.a, b: b.b, order: Math.round(b.order) || 1 })) });
  const fits = mol.systems.map((_, k) => fitted(mol, k, atoms, bond));
  if (fits.some((f) => !f)) return null;
  const asDrawn = new Set(mol.systems.flatMap((_, k) => (keptAsDrawn(mol, k, atoms) ? [k] : [])));
  // (round a metal, a haptic bond's star, an atom of more than four bonds - no standard angles - and a stereocentre whose
  // wedge and hash the standard angles would set opposite, read no way: each bond the way it is drawn, the style's length)
  const stereoAt = new Set(bonds.flatMap((b) => (b.stereo ? [b.a, b.b] : [])));
  const stereoBond = (u: number, v: number) => bonds.some((b) => b.stereo && ((b.a === u && b.b === v) || (b.a === v && b.b === u)));
  const free = (u: number) => isMetal(atoms[u].el) || atoms[u].el === "*" || mol.neighbours[u].length > 4 || mol.neighbours[u].some((v) => isMetal(atoms[v].el) || atoms[v].el === "*");
  const out: (Point | null)[] = atoms.map(() => null);
  const order = (u: number, v: number) => bonds.find((b) => (b.a === u && b.b === v) || (b.a === v && b.b === u))?.order ?? 1;
  const linearAt = (u: number) => {
    const os = mol.neighbours[u].map((v) => order(u, v));
    return mol.neighbours[u].length === 2 && (os.some((o) => o === 3) || os.every((o) => o === 2));
  };
  for (const piece of mol.pieces) {
    // (from its largest ring system, as fitted; with none, from the atom with most bonds, where it is drawn)
    const systems = [...new Set(piece.map((i) => mol.systemOf[i]).filter((s) => s >= 0))].sort((p, q) => mol.systems[q].atoms.length - mol.systems[p].atoms.length);
    const queue: number[] = [];
    const put = (i: number, p: Point) => {
      out[i] = p;
      queue.push(i);
    };
    if (systems.length) for (const [i, p] of fits[systems[0]]!) put(i, p);
    else {
      const start = piece.reduce((m, i) => (mol.neighbours[i].length > mol.neighbours[m].length ? i : m), piece[0]);
      put(start, { x: atoms[start].x, y: atoms[start].y });
    }
    while (queue.length) {
      const u = queue.shift()!;
      const at = out[u]!;
      const next = mol.neighbours[u].filter((v) => !out[v]);
      if (!next.length) continue;
      const placed = mol.neighbours[u].filter((v) => out[v]).map((v) => angleOf(at, out[v]!));
      const drawnAt = next.map((v) => angleOf(atoms[u], atoms[v]));
      // (out of a chair, each the way it is drawn: axial and equatorial as drawn)
      let ways = asDrawn.has(mol.systemOf[u]) || free(u) ? drawnAt : directions(placed, drawnAt, linearAt(u), mol.systemOf[u] >= 0);
      if (!ways) {
        why?.("no way");
        return null;
      }
      if (stereoAt.has(u)) {
        const round = [...mol.neighbours[u].filter((v) => out[v]).map((v) => ({ a: angleOf(at, out[v]!), stereo: stereoBond(u, v) })), ...next.map((v, k) => ({ a: ways![k], stereo: stereoBond(u, v) }))];
        const opposite = round.some((p, i) => round.some((q, j) => j > i && (p.stereo || q.stereo) && apart(p.a, q.a) > Math.PI - 15 * DEG));
        if (opposite) ways = drawnAt;
      }
      next.forEach((v, k) => {
        const p = { x: at.x + bond * Math.cos(ways[k]), y: at.y + bond * Math.sin(ways[k]) };
        const s = mol.systemOf[v];
        if (s < 0) {
          put(v, p);
          return;
        }
        // (a ring system reached by a bond: as fitted, turned about where it is met to take the bond along its bisector, there)
        const fit = fits[s]!;
        const q = fit.get(v)!;
        const ring = mol.neighbours[v].filter((x) => fit.has(x)).map((x) => angleOf(q, fit.get(x)!));
        // (its bisector there as fitted, turned to the bond: never matched to a way drawn, which is in another frame)
        const out1 = asDrawn.has(s) ? null : bisectorOf(ring);
        const r = out1 == null ? 0 : turn(angleOf(p, at) - out1);
        for (const [i, f] of fit) {
          const d = { x: f.x - q.x, y: f.y - q.y };
          put(i, { x: p.x + d.x * Math.cos(r) - d.y * Math.sin(r), y: p.y + d.x * Math.sin(r) + d.y * Math.cos(r) });
        }
      });
    }
    // (the piece about where it is drawn - by its atoms read for sure, where it has any)
    const mid = (ps: Point[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
    const sure = piece.some((i) => !atoms[i].unsure) ? piece.filter((i) => !atoms[i].unsure) : piece;
    const a = mid(sure.map((i) => out[i]!));
    const b = mid(sure.map((i) => ({ x: atoms[i].x, y: atoms[i].y })));
    for (const i of piece) out[i] = { x: out[i]!.x + b.x - a.x, y: out[i]!.y + b.y - a.y };
  }
  const placed = out as Point[];
  if (placed.some((p) => !p)) return null;
  const drawnP = atoms.map((a) => ({ x: a.x, y: a.y }));
  const wrong = inTheWay(placed, drawnP, bonds, bond);
  if (!wrong) return narrowed(placed, drawnP, mol) || closedUp(placed, drawnP, mol) ? (why?.("narrow"), null) : placed;
  // (crowded, or crossing: cleared, its arrangement kept - its rings, those kept as drawn and the rest, where they are - else as drawn)
  const kept = new Set([...asDrawn].flatMap((k) => mol.systems[k].atoms));
  const input = { atoms: atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: bonds.map((b) => ({ a: b.a, b: b.b, order: Math.round(b.order) || 1 })) };
  const cleared = untangledKeeping(input, placed, drawnP, bond, (i) => kept.has(i));
  const still = inTheWay(cleared, drawnP, bonds, bond) ?? (narrowed(cleared, drawnP, mol) || closedUp(cleared, drawnP, mol) ? "narrow" : null);
  if (!still) return cleared;
  why?.(still);
  return null;
}

/**
 * How narrow two bonds at an atom of two or three bonds, not both a ring's, may come out where the drawing has them wider: a
 * third of a turn less a little. Narrower - a group turned in on its neighbour - it is left as drawn. Not at an atom of four
 * bonds, whose standard is a cross, nor between two groups on one ring atom, whose standard is 60 deg.
 */
const CLOSED_UP = 100 * (Math.PI / 180);

/** Whether a result (`placed`) closes two bonds at an atom past `CLOSED_UP` that the drawing (`drawn`) has wider. */
export function closedUp(placed: readonly Point[], drawn: readonly Point[], mol: Pick<Molecule, "neighbours" | "ringBonds">): boolean {
  const inRing = (u: number, v: number) => mol.ringBonds.has(u < v ? `${u},${v}` : `${v},${u}`);
  return mol.neighbours.some((ns, u) => {
    if (ns.length < 2 || ns.length > 3) return false;
    return ns.some((v, i) =>
      ns.some((w, j) => {
        if (j <= i || (inRing(u, v) && inRing(u, w))) return false;
        const now = apart(angleOf(placed[u], placed[v]), angleOf(placed[u], placed[w]));
        const was = apart(angleOf(drawn[u], drawn[v]), angleOf(drawn[u], drawn[w]));
        return now < CLOSED_UP && was >= CLOSED_UP;
      }),
    );
  });
}

/** Whether two bonds at an atom come out narrower than `NARROWEST` where the drawing has them wider. */
function narrowed(placed: readonly Point[], drawn: readonly Point[], mol: Molecule): boolean {
  return mol.neighbours.some((ns, u) =>
    ns.some((v, i) =>
      ns.some((w, j) => j > i && apart(angleOf(placed[u], placed[v]), angleOf(placed[u], placed[w])) < NARROWEST && apart(angleOf(drawn[u], drawn[v]), angleOf(drawn[u], drawn[w])) >= NARROWEST),
    ),
  );
}

/** What is in the way where a drawing is made regular: two atoms put on each other, or bonds crossing that the drawing does not cross. */
function inTheWay(placed: readonly Point[], drawn: readonly Point[], bonds: readonly DrawnBond[], bond: number): "crowded" | "crossing" | "narrow" | null {
  const bonded = new Set(bonds.map((b) => (b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`)));
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      if (bonded.has(`${i},${j}`) || Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) >= NEAREST * bond) continue;
      // (two drawn as near - a chair's, in perspective - are as drawn)
      if (Math.hypot(drawn[i].x - drawn[j].x, drawn[i].y - drawn[j].y) >= NEAREST * bond) return "crowded";
    }
  for (let i = 0; i < bonds.length; i++)
    for (let j = i + 1; j < bonds.length; j++) {
      const [b, c] = [bonds[i], bonds[j]];
      if (b.a === c.a || b.a === c.b || b.b === c.a || b.b === c.b) continue;
      if (crosses(placed[b.a], placed[b.b], placed[c.a], placed[c.b]) && !crosses(drawn[b.a], drawn[b.b], drawn[c.a], drawn[c.b])) return "crossing";
    }
  return null;
}
