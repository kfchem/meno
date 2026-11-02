/**
 * Stereochemistry shown where it reads (docs/LAYOUT-2D.md, section 6): a
 * wedge or hashes on a bond out of the rings, its narrow end at the
 * stereocentre - to an end atom first, then to a chain - and never on a
 * ring bond while there is another way. A stereocentre at a ring fusion,
 * with no bond out of the rings, gets its H drawn, straight out, and the
 * wedge on that.
 *
 * A configuration is given as the neighbours in order (-1 for an implicit
 * H) and the sign of the volume the first three span, seen from the
 * centre. Drawn, a neighbour on a wedge stands out of the page, one on
 * hashes behind it, the rest in it; the wedge's sense is whichever gives
 * that sign back.
 */
import { angleOf, centroid, drawnVolume, insidePolygon, segmentsCross, splitOutside, splitWidestGap, sub, type Point } from "./geometry";
import { hydrogenSpot, hydrogenWritten } from "./metrics";
import { key, type Molecule } from "./perceive";
import { atomDepth, isName, namesLaid } from "./names";

export { drawnVolume };

export type Tetrahedral = {
  /** Neighbours in order; -1 for an implicit H, last. */
  neighbours: readonly number[];
  /** The sign of the volume the first three span, seen from the centre. */
  volume: 1 | -1;
};

/**
 * An axis of chirality: the single bond between `atoms`, each end with two
 * other neighbours (a biaryl's - BINAP's C1-C1'), and how the two `refs`,
 * one bonded to each end, are turned about it: the sign of the torsion
 * refs[0]-atoms[0]-atoms[1]-refs[1] (IUPAC's: + where, looking along the
 * axis, the near one turns clockwise onto the far one). Drawn flat, it is
 * shown by a wedge on a bond out of an end of it, narrow there, to the
 * neighbour that stands out of the page, the other end's neighbours in it -
 * as an atropisomer's wedge is read.
 */
export type Axial = { atoms: readonly [number, number]; refs: readonly [number, number]; sense: 1 | -1 };

/** The sign of the torsion p-q-r-s, IUPAC's: + where, looking from q to r, p turns clockwise onto s. */
export function torsionSense(p: readonly number[], q: readonly number[], r: readonly number[], s: readonly number[]): 1 | -1 | 0 {
  const b1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const b2 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
  const b3 = [s[0] - r[0], s[1] - r[1], s[2] - r[2]];
  const c = [b2[1] * b3[2] - b2[2] * b3[1], b2[2] * b3[0] - b2[0] * b3[2], b2[0] * b3[1] - b2[1] * b3[0]];
  const v = b1[0] * c[0] + b1[1] * c[1] + b1[2] * c[2];
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
}

/**
 * How an axis drawn flat - `pos` - turns, where `lifted`, a neighbour of
 * its first end, stands `up` (+1) or down (-1) out of the page and the
 * rest are in it: its sense, as `Axial` has it, or 0.
 */
export function drawnAxisSense(
  pos: (a: number) => Point,
  axis: Omit<Axial, "sense">,
  lifted: number,
  up: 1 | -1,
): 1 | -1 | 0 {
  const [i, j] = axis.atoms;
  const [a, b] = axis.refs;
  // (the end's other neighbour stands the other way: the ring turned about the axis)
  const z = lifted === a ? up : -up;
  const at = (k: number, depth = 0) => [pos(k).x, pos(k).y, depth];
  return torsionSense(at(a, z), at(i), at(j), at(b));
}

/**
 * The wedge that shows an axis drawn flat: out of an end, narrow there, on
 * a single bond to one of the end's two other neighbours (in a Kekulé ring,
 * the one that is not a double bond, which no wedge can be put on) - a
 * wedge where that neighbour standing out of the page gives the sense the
 * axis has, at its first end or else at its second, and else hashes. None
 * where the drawing cannot show it (an end in line with the axis).
 */
export function axisWedge(mol: Molecule, pos: Map<number, Point>, axis: Axial): Wedge | null {
  const at = (k: number) => pos.get(k)!;
  const [i, j] = axis.atoms;
  const [a, b] = axis.refs;
  // (seen from the other end, an axis turns the same way)
  const ends = [axis, { atoms: [j, i] as const, refs: [b, a] as const, sense: axis.sense }];
  const single = (end: number, other: number) =>
    mol.neighbours[end].filter((n) => n !== other && mol.bonds[mol.bondIndex.get(key(end, n))!].order === 1);
  for (const up of [1, -1] as const) {
    for (const end of ends) {
      const [e, o] = end.atoms;
      for (const c of single(e, o)) {
        if (drawnAxisSense(at, end, c, up) === axis.sense) return { from: e, to: c, stereo: up === 1 ? "up" : "down" };
      }
    }
  }
  return null;
}

export type Wedge = {
  /** The stereocentre: the narrow end. */
  from: number;
  /** The other end: an atom, or -1 for the H drawn on `from`. */
  to: number;
  stereo: "up" | "down";
};

export type Stereo = {
  wedges: Wedge[];
  /** Hydrogens drawn to show a centre that has no other bond to put a wedge on. */
  hydrogens: { on: number; at: Point }[];
};

export function placeStereo(
  mol: Molecule,
  pos: Map<number, Point>,
  tetra: ReadonlyMap<number, Tetrahedral>,
  /** Bonds that carry a wedge already, by `key`: another centre's, not to be taken. */
  taken: ReadonlySet<string> = new Set(),
): Stereo {
  const wedges: Wedge[] = [];
  const hydrogens: { on: number; at: Point }[] = [];
  const used = new Set<string>(taken);
  const wideEnds = new Set<number>();
  const narrowEnds = new Set<number>();
  const centres = [...tetra.keys()].filter((c) => pos.has(c));
  const ringBond = (a: number, b: number) => mol.ringBonds.has(key(a, b));
  // where the letters of each name lie - OAc read leftward under a ring as
  // AcO, its Ac reaching a bond's length from its atom - for an H drawn to
  // keep clear of them as of an atom
  const nameBoxes = mol.el.some(isName)
    ? [
        ...namesLaid(
          {
            x: mol.el.map((_, a) => pos.get(a)?.x ?? NaN),
            y: mol.el.map((_, a) => pos.get(a)?.y ?? NaN),
            edges: mol.bonds.map(({ a, b }) => [a, b] as [number, number]),
            elements: mol.el,
            hydrogens: mol.hs,
          },
          1,
        ).values(),
      ].map((n) => n.box)
    : [];

  // every atom placed, and the H of every label that has one, where the
  // drawing sets it; and every bond: what an H drawn keeps clear of
  const atomsAround: { a: number; p: Point; label: boolean; letters: number }[] = [...pos.entries()].map(([a, p]) => ({ a, p, label: mol.el[a] !== "C", letters: mol.el[a].length }));
  for (const [a, p] of pos) {
    if (mol.el[a] === "C" || !(mol.hs[a] > 0) || !mol.neighbours[a].length) continue;
    const off = hydrogenSpot(
      mol.neighbours[a].map((b) => {
        const v = sub(pos.get(b)!, p);
        const d = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / d, y: v.y / d };
      }),
    );
    const w = hydrogenWritten(off, mol.hs[a]);
    atomsAround.push({ a, p: { x: p.x + w.x, y: p.y + w.y }, label: true, letters: 1 });
  }
  const bondsAround = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a, b]) => pos.has(a) && pos.has(b))
    .map(([a, b]) => [a, b, pos.get(a)!, pos.get(b)!] as const);

  // centres with fewest ways to show them first, so they get theirs
  const options = (c: number) => mol.neighbours[c].filter((n) => !ringBond(c, n)).length;

  // how a centre would be shown, as things stand: its wedge, and its H
  // where one is drawn
  const plan = (c: number) => {
    const t = tetra.get(c)!;
    const at = pos.get(c)!;
    const hasH = t.neighbours.includes(-1);
    type Choice = { to: number; rank: number };
    const choices: Choice[] = [];
    // a wedge starting where another ends, or ending where another starts,
    // makes a run of them, which reads as the chain being out of the page
    // rather than the centre (two meeting at their wide ends - a glycoside's
    // oxygen - are nothing of the kind)
    const touches = (a: number, b: number) =>
      (wideEnds.has(a) ? 10 : 0) + (narrowEnds.has(b) ? 10 : 0);
    for (const n of mol.neighbours[c]) {
      if (used.has(key(c, n))) continue;
      const inRing = ringBond(c, n);
      const end = mol.neighbours[n].length === 1;
      const centre = tetra.has(n);
      const rank =
        (inRing ? 100 : 0) +
        (end ? 0 : 2) +
        (centre ? 4 : 0) +
        (mol.el[n] === "H" ? -1 : 0) +
        touches(c, n);
      choices.push({ to: n, rank });
    }
    // An implicit H drawn and wedged: at a ring atom with nothing out of
    // the rings to carry the wedge, first of all; elsewhere before a bond
    // between two centres - the main chain kept plain, the H showing the
    // stereo - or one that would make a run of wedges.
    const outOfRings = mol.neighbours[c].filter((n) => !ringBond(c, n));
    if (hasH && (mol.systemOf[c] >= 0 && outOfRings.length === 0)) choices.push({ to: -1, rank: -10 });
    else if (hasH) choices.push({ to: -1, rank: 5 + (wideEnds.has(c) ? 10 : 0) });
    choices.sort((p, q) => p.rank - q.rank || p.to - q.to);

    // Where an H drawn on this centre goes. Its wedge's sense is fixed by
    // the configuration wherever it points, where its other bonds lie in
    // the page, so it goes where it reads best: straight up on a wedge, or
    // straight down on hashes, as a steroid's are, where that is clear;
    // else wherever round the atom there is most room - away from other
    // atoms and from bonds, and crossing none.
    let hPos: Point | null = null;
    let hRoom = 0;
    let hLean = 0;
    if (hasH) {
      // (a labelled atom - an O, an N, an H already drawn - wants more room;
      // only what lies within three bonds can come nearer an H a bond out
      // than room enough)
      const close = (p: Point) => Math.hypot(p.x - at.x, p.y - at.y) < 3;
      const others = atomsAround.filter((o) => o.a !== c && close(o.p));
      others.push(...hydrogens.filter((h) => close(h.at)).map((h) => ({ a: -1, p: h.at, label: true, letters: 1 })));
      const bonds = bondsAround.filter(([a, b, u, v]) => a !== c && b !== c && (close(u) || close(v))).map(([, , u, v]) => [u, v] as const);
      const own = mol.neighbours[c].map((n) => angleOf(sub(pos.get(n)!, at)));
      // (its own rings, and whether each has a double bond of its own - one
      // no other ring shares, whose second line is drawn inside it)
      const ownRings = mol.ringsOf[c].filter((i) => mol.rings[i].length <= 8 && mol.rings[i].every((v) => pos.has(v)));
      const insides = ownRings.map((i) => {
        const r = mol.rings[i];
        return {
          polygon: r.map((v) => pos.get(v)!),
          unsaturated: r.some((v, k) => {
            const w = r[(k + 1) % r.length];
            const b = mol.bonds[mol.bondIndex.get(key(v, w))!];
            return !!b && b.order >= 2 && !mol.ringsOf[v].some((j) => j !== i && mol.ringsOf[w].includes(j));
          }),
        };
      });
      const room = (angle: number) => {
        const p = { x: at.x + Math.cos(angle), y: at.y + Math.sin(angle) };
        let r = Infinity;
        // (a label half by the distance, half by the paper between its ink
        // and the H's, as the drawing measures two labels' ink: an H a bond
        // off an O diagonally sits on its letter's corner, which the
        // distance alone took as room enough - ivermectin's H over its OH)
        for (const o of others) {
          const d = Math.hypot(o.p.x - p.x, o.p.y - p.y);
          r = Math.min(r, o.label ? (d - 0.2 + inkGap(p, o.p, o.letters) + 0.3) / 2 : d);
        }
        // (as far clear of a name's letters as the drawing reckons a
        // labelled atom must be, or the drawing turns the name round to
        // keep clear of the H - and into whatever is on its other side:
        // within that, by a hair or more, a step the worse)
        for (const b of nameBoxes) {
          const d = atomDepth(b, p, true, 1);
          r = Math.min(r, d > 0 ? 0.3 - d : 0.4 - d);
        }
        for (const [u, v] of bonds) {
          // (a label's room from a bond, a little less than from an atom)
          r = Math.min(r, toSegment(p, u, v) + 0.15);
          if (segmentsCross(at, p, u, v)) r = Math.min(r, 0);
        }
        for (const o of own) {
          const d = Math.abs(Math.atan2(Math.sin(o - angle), Math.cos(o - angle)));
          if (d < (35 * Math.PI) / 180) r = Math.min(r, d);
        }
        // (into one of its own rings only as a steroid's are: straight up or
        // down, into a ring with no double bond's second line inside it -
        // else it reads as pointing into the ring, as lovastatin's and
        // yohimbine's did; the maintainer, 2026-10-11. An H hemmed in by
        // three rings or more goes where there is room, as before:
        // strychnine's)
        const upright = Math.abs(Math.sin(angle)) > 0.97;
        const into = insides.length <= 2 && insides.some((s) => (s.unsaturated || !upright) && insidePolygon(p, s.polygon));
        // (room enough is room enough: then the way it ought to point)
        return Math.min(r, 0.85) - (into ? 0.3 : 0);
      };
      const [t0] =
        mol.systemOf[c] >= 0
          ? splitOutside(
              own,
              mol.ringsOf[c].map((r) => angleOf(sub(centroid(mol.rings[r].map((v) => pos.get(v)!)), at))),
              1,
            )
          : splitWidestGap(own, 1);
      // the sense it will take, to know which way is upright for it
      let sense = 0;
      for (const lift of [1, -1]) {
        const probe = { x: at.x + Math.cos(t0), y: at.y + Math.sin(t0) };
        const drawn = t.neighbours.map((n) => (n === -1 ? probe : pos.get(n) ?? null));
        const lifts = t.neighbours.map((n) => (n === -1 ? lift : 0));
        if (drawnVolume(at, drawn, lifts) === t.volume) sense = lift;
      }
      const fusion = mol.systemOf[c] >= 0 && !mol.neighbours[c].some((n) => !ringBond(c, n));
      const preferred = fusion && sense ? (sense > 0 ? Math.PI / 2 : -Math.PI / 2) : t0;
      let bestT = t0;
      let bestRoom = -Infinity;
      for (let k = 0; k < 24; k++) {
        const angle = (k * Math.PI) / 12;
        // (upright, or straight out of the rings, first among equals)
        const lean = Math.abs(Math.atan2(Math.sin(angle - preferred), Math.cos(angle - preferred)));
        const r = room(angle) - 0.02 * lean;
        if (r > bestRoom + 1e-9) {
          bestRoom = r;
          bestT = angle;
        }
      }
      hPos = { x: at.x + Math.cos(bestT), y: at.y + Math.sin(bestT) };
      hRoom = bestRoom;
      // (and, at a fusion, how far off upright it leans)
      if (fusion) hLean = Math.asin(Math.min(1, Math.abs(Math.cos(bestT))));
    }
    // A wedge that says the configuration only as the bonds round it fall
    // exactly - two of them in a line, or all of them on one side of the
    // centre (a bridgehead drawn flat, ibogaine's) - reads by luck: a
    // reader may take it the other way. So each choice
    // is first taken only where it reads the same with any one of the bonds
    // in the page turned a little either way; failing every one of them,
    // as it reads.
    const reads = (drawn: (Point | null)[], lift: number[]) => drawnVolume(at, drawn, lift) === t.volume;
    // (and never with every bond on one side of the centre: four bonds in a
    // half of the page - bilobalide's carbons between its lactones - say
    // nothing a reader agrees on, however they are wedged)
    const spread = (drawn: (Point | null)[]) => {
      const t = drawn.flatMap((p) => (p ? [Math.atan2(p.y - at.y, p.x - at.x)] : [])).sort((a, b) => a - b);
      if (t.length < 3) return true;
      const widest = Math.max(...t.map((a, k) => (k + 1 < t.length ? t[k + 1] : t[0] + 2 * Math.PI) - a));
      return widest < Math.PI - TURN_TEST;
    };
    const surely = (drawn: (Point | null)[], lift: number[]) =>
      reads(drawn, lift) &&
      (drawn.filter(Boolean).length < 4 || spread(drawn)) &&
      drawn.every((p, i) =>
        !p || lift[i] !== 0 ||
        [-TURN_TEST, TURN_TEST].every((d) => reads(drawn.map((q, j) => (j === i && q ? turnAbout(q, at, d) : q)), lift)),
      );
    let pick: { choice: Choice; stereo: "up" | "down"; strict: boolean } | null = null;
    for (const strict of [true, false]) {
      for (const choice of choices) {
        const place = (n: number) => (n === -1 ? hPos : pos.get(n) ?? null);
        for (const stereo of ["up", "down"] as const) {
          const lift = t.neighbours.map((n) => (n === choice.to ? (stereo === "up" ? 1 : -1) : 0));
          const drawn = t.neighbours.map((n) => (n === -1 && choice.to !== -1 ? null : place(n)));
          if (strict ? surely(drawn, lift) : reads(drawn, lift)) {
            pick = { choice, stereo, strict };
            break;
          }
        }
        if (pick) break;
      }
      if (pick) break;
    }
    return { c, hasH, hPos, hRoom, hLean, pick };
  };
  type Plan = ReturnType<typeof plan>;
  const commit = ({ c, hasH, hPos, pick }: Plan) => {
    for (const choice of pick ? [pick.choice] : []) {
      let done = false;
      for (const stereo of [pick!.stereo]) {
        {
          wedges.push({ from: c, to: choice.to, stereo });
          narrowEnds.add(c);
          if (choice.to === -1) hydrogens.push({ on: c, at: hPos! });
          else {
            used.add(key(c, choice.to));
            wideEnds.add(choice.to);
          }
          // A ring atom's two groups - erythromycin's OH and methyl on one
          // carbon - each show which face they are on: the one in front on
          // a wedge, the other behind on hashes. (With the ring bonds in the
          // page, one stands out of it and the other behind.)
          const out = mol.neighbours[c].filter((n) => !ringBond(c, n));
          const other = out.find((n) => n !== choice.to);
          if (!hasH && out.length === 2 && out.includes(choice.to) && other != null && !used.has(key(c, other))) {
            wedges.push({ from: c, to: other, stereo: stereo === "up" ? "down" : "up" });
            used.add(key(c, other));
            wideEnds.add(other);
          }
          done = true;
          break;
        }
      }
      if (done) break;
    }
  };

  // Of centres with as few ways, the one that costs the others near it
  // least, shown before them, goes first: each is weighed as things stand,
  // and again once another is shown - an H drawn, or a bond taken, changes
  // what is left for the rest. Two fusion Hs wanting one spot: the one
  // that takes it upright may leave the other its ring bond, where the
  // other way round both lean 30 degrees. Of centres that cost as much,
  // the one shown best first - a wedge that reads for sure before one that
  // reads only as the bonds fall, a better bond before a worse, an H with
  // more room before one with less - and the canonical rank only between
  // centres shown as well.
  const quality = (p: Plan): number[] => [
    p.pick ? (p.pick.strict ? 0 : 1) : 2,
    p.pick ? p.pick.choice.rank : 0,
    p.pick?.choice.to === -1 ? -p.hRoom : 0,
  ];
  const better = (p: Plan, q: Plan) => {
    const a = quality(p);
    const b = quality(q);
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i];
    return p.c < q.c;
  };
  // what a way of showing a centre costs: none at all, the most; one that
  // reads only as the bonds fall; a wedge on a ring bond as much as an H
  // left half a bond's room, or one at a fusion of rings laid 60 degrees
  // off upright
  const cost = (p: Plan) =>
    !p.pick
      ? 20
      : (p.pick.strict ? 0 : 4) +
        p.pick.choice.rank / 50 +
        (p.pick.choice.to === -1 ? 5 * (0.85 - p.hRoom) + (2 * p.hLean) / (Math.PI / 3) : 0);
  const apart = (c: number, d: number) => {
    const u = pos.get(c)!;
    const v = pos.get(d)!;
    return Math.hypot(u.x - v.x, u.y - v.y);
  };
  // (a centre's plan reads what is shown within about three bonds of it,
  // and its cost to others what is shown within about seven: each is kept
  // until something is shown nearer than that)
  const planned = new Map<number, Plan>();
  const harmed = new Map<number, number>();
  const left = [...centres];
  while (left.length) {
    const fewest = Math.min(...left.map(options));
    const plans = left.filter((c) => options(c) === fewest).map((c) => planned.get(c) ?? planned.set(c, plan(c)).get(c)!);
    let best = plans[0];
    let least = Infinity;
    for (const p of plans) {
      // (what showing it costs the others near it, shown after it)
      let harm = harmed.get(p.c);
      if (harm == null) {
        harm = 0;
        if (plans.length > 1) {
          const mark = { w: wedges.length, h: hydrogens.length, used: new Set(used), wide: new Set(wideEnds), narrow: new Set(narrowEnds) };
          commit(p);
          for (const q of plans) if (q !== p && apart(p.c, q.c) < 4) harm += cost(plan(q.c)) - cost(q);
          wedges.length = mark.w;
          hydrogens.length = mark.h;
          used.clear();
          mark.used.forEach((v) => used.add(v));
          wideEnds.clear();
          mark.wide.forEach((v) => wideEnds.add(v));
          narrowEnds.clear();
          mark.narrow.forEach((v) => narrowEnds.add(v));
        }
        harmed.set(p.c, harm);
      }
      if (harm < least - 1e-9 || (Math.abs(harm - least) <= 1e-9 && better(p, best))) {
        least = harm;
        best = p;
      }
    }
    commit(best);
    left.splice(left.indexOf(best.c), 1);
    for (const c of left) {
      if (apart(c, best.c) < 5) planned.delete(c);
      if (apart(c, best.c) < 9) harmed.delete(c);
    }
  }
  return { wedges, hydrogens };
}

/**
 * The paper between an H written at `h` and a label at `p` of `letters`
 * letters, in bond lengths: each letter's ink half a bond high, the first
 * centred on its atom and 0.4 across the rest after it, as the drawing
 * measures labels' ink (metrics.ts, inkBoxes); the larger of the two gaps,
 * across and up, below nothing where they overlap.
 */
function inkGap(h: Point, p: Point, letters: number): number {
  const x0 = p.x - 0.25;
  const x1 = p.x + 0.25 + 0.4 * (letters - 1);
  return Math.max(x0 - (h.x + 0.25), h.x - 0.25 - x1, Math.abs(h.y - p.y) - 0.5);
}

/** How far each bond in the page round a centre is turned, either way, to ask whether a wedge reads the same. */
const TURN_TEST = (12 * Math.PI) / 180;

/** `p` turned about `c` by `t`. */
function turnAbout(p: Point, c: Point, t: number): Point {
  const x = p.x - c.x;
  const y = p.y - c.y;
  return { x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) };
}

/** How far `p` is from the segment `u`-`v`. */
function toSegment(p: Point, u: Point, v: Point): number {
  const vx = v.x - u.x;
  const vy = v.y - u.y;
  const l2 = vx * vx + vy * vy;
  const k = l2 ? Math.max(0, Math.min(1, ((p.x - u.x) * vx + (p.y - u.y) * vy) / l2)) : 0;
  return Math.hypot(p.x - (u.x + k * vx), p.y - (u.y + k * vy));
}
