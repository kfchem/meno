/**
 * *Read as Fischer projection* (docs/EDITOR-2D.md, *A Fischer projection*):
 * a structure drawn as a Fischer projection - each stereocentre a cross of
 * four plain bonds on the page's axes, the centres one above another - is
 * read so on the chemist's word: at each such centre its two level bonds
 * are made solid wedges narrow at it, its two upright bonds kept plain. The
 * drawing is then in a form the reader reads by its ordinary rules; nothing
 * is stored to say it was a Fischer projection. Never guessed: a cross of
 * plain bonds states no configuration until the chemist asks.
 */
import type { Bond, Model } from "../store/types";
import { IN_LINE } from "../../../../lib/chem/perception/stereo/from2d";
import { symmetryClasses } from "../../../../lib/chem/perception/symmetry";
import { identityInputOf } from "../chem/identityOf";
import { fragmentOf } from "../chem/cleanUp";
import { isMetal } from "../../../../lib/layout/perceive";
import { readAs } from "../chem/drawing";

/** How far, across, a centre of one Fischer projection may lie from the line through its topmost and lowest, in a bond's length. */
const ONE_LINE = 0.25;

/** Whether a bond is plain: single, no wedge or look of its own. */
const plain = (b: Bond) => b.order === 1 && (!b.stereo || b.stereo === "none") && (!b.display || b.display === "plain") && !b.dative;

/**
 * The centres of the structure holding `at` drawn as a Fischer projection: each an atom of four plain bonds, in no ring, that lie as a
 * plus on the page's axes (each within the reader's `IN_LINE` of level or upright, one each way), its four groups unlike (by the
 * structure's own classes, as a stereocentre's are), or only its two upright ones alike, each holding such a cross (a centre told by
 * the configurations about it); a cross that is neither is left as it is - and all of them in one upright line.
 * None, where there are none, or where such centres do not lie one above another. Each with its two level bonds, by id.
 */
export function fischerCentres(model: Model, at: number): { atom: number; level: [number, number] }[] {
  const ids = new Set(fragmentOf(model, at));
  if (!ids.size) return [];
  const part: Model = { ...model, atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
  const atomOf = new Map(part.atoms.map((a) => [a.id, a]));
  const bondsAt = new Map<number, Bond[]>();
  for (const b of part.bonds) for (const e of [b.a, b.b]) (bondsAt.get(e) ?? bondsAt.set(e, []).get(e)!).push(b);
  const inRing = (b: Bond) => {
    // (another way from one end to the other, not by this bond)
    const seen = new Set([b.a]);
    const todo = [b.a];
    while (todo.length) {
      const n = todo.pop()!;
      for (const o of bondsAt.get(n) ?? []) {
        if (o === b) continue;
        const m = o.a === n ? o.b : o.a;
        if (m === b.b) return true;
        if (!seen.has(m)) {
          seen.add(m);
          todo.push(m);
        }
      }
    }
    return false;
  };
  const crosses: { atom: number; x: number; y: number; level: [number, number]; upright: [number, number]; sides: [number, number] }[] = [];
  for (const a of part.atoms) {
    const bs = bondsAt.get(a.id) ?? [];
    // (a metal drawn as a plus is no Fischer projection's centre: it is read as it is drawn, square planar where it surely is)
    if (bs.length !== 4 || isMetal(readAs(a)) || !bs.every(plain)) continue;
    // (each bond's way from the centre: level, one each side; upright, one each side)
    const ways = bs.map((b) => {
      const o = atomOf.get(b.a === a.id ? b.b : b.a)!;
      return { b, t: Math.atan2(o.y - a.y, o.x - a.x), other: o.id };
    });
    const near = (t: number, to: number) => Math.abs(Math.atan2(Math.sin(t - to), Math.cos(t - to))) <= IN_LINE;
    const right = ways.filter((w) => near(w.t, 0));
    const left = ways.filter((w) => near(w.t, Math.PI));
    const down = ways.filter((w) => near(w.t, Math.PI / 2));
    const up = ways.filter((w) => near(w.t, -Math.PI / 2));
    if (right.length !== 1 || left.length !== 1 || down.length !== 1 || up.length !== 1) continue;
    // (in no ring - asked only of a cross on the axes: a search over the structure for each of its bonds)
    if (bs.some(inRing)) continue;
    crosses.push({ atom: a.id, x: a.x, y: a.y, level: [right[0].b.id, left[0].b.id], upright: [up[0].other, down[0].other], sides: [right[0].other, left[0].other] });
  }
  if (!crosses.length) return [];
  // (its four groups unlike, as a stereocentre's are: by the structure's classes, each group the class of the atom it begins at; a
  // cross that is no stereocentre - two of its groups alike - is left as it is)
  const { input } = identityInputOf(part);
  const classes = symmetryClasses(input);
  const index = new Map(part.atoms.map((a, i) => [a.id, i]));
  const classOf = (id: number) => classes[index.get(id)!];
  const taken = new Set(crosses.filter((c) => new Set([...c.upright, ...c.sides].map(classOf)).size === 4).map((c) => c.atom));
  // (and a cross whose only alike pair is its two upright groups, each holding a cross taken - the middle of ribitol, of xylitol: alike
  // by constitution, told apart by the configurations about it - taken too, for the CIP to judge: it reads such a centre r or s, or
  // none where it is no centre, as in D-arabinitol; found in review)
  const holds = (from: number, start: number) => {
    // (the atoms reached from `start` not through `from`: whether a cross taken is among them)
    const seen = new Set([from, start]);
    const todo = [start];
    while (todo.length) {
      const n = todo.pop()!;
      if (taken.has(n)) return true;
      for (const b of bondsAt.get(n) ?? []) {
        const m = b.a === n ? b.b : b.a;
        if (!seen.has(m)) {
          seen.add(m);
          todo.push(m);
        }
      }
    }
    return false;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of crosses) {
      if (taken.has(c.atom)) continue;
      const [u, d] = c.upright.map(classOf);
      const [r, l] = c.sides.map(classOf);
      const onlyUpright = u === d && new Set([u, r, l]).size === 3;
      if (onlyUpright && c.upright.every((n) => holds(c.atom, n))) {
        taken.add(c.atom);
        grew = true;
      }
    }
  }
  const centres = crosses.filter((c) => taken.has(c.atom));
  if (!centres.length) return [];
  // (one above another: the line from the topmost to the lowest within the reader's IN_LINE of upright, however many there are, and each
  // within a quarter of a bond across of that line)
  if (centres.length > 1) {
    const bond = part.bonds.reduce((t, b) => t + Math.hypot(atomOf.get(b.a)!.x - atomOf.get(b.b)!.x, atomOf.get(b.a)!.y - atomOf.get(b.b)!.y), 0) / part.bonds.length;
    const byHeight = [...centres].sort((p, q) => q.y - p.y);
    const [top, foot] = [byHeight[0], byHeight[byHeight.length - 1]];
    const [dx, dy] = [foot.x - top.x, foot.y - top.y];
    const span = Math.hypot(dx, dy);
    if (!span || Math.abs(Math.atan2(dx, -dy)) > IN_LINE) return [];
    if (centres.some((c) => Math.abs((c.x - top.x) * dy - (c.y - top.y) * dx) / span > ONE_LINE * bond)) return [];
  }
  return centres.map((c) => ({ atom: c.atom, level: c.level }));
}

/** The bonds' changes that read a Fischer projection: at each centre its two level bonds solid wedges, narrow at it. */
export function fischerWedges(centres: readonly { atom: number; level: readonly [number, number] }[]): [number, Partial<Bond>][] {
  return centres.flatMap((c) => c.level.map((id): [number, Partial<Bond>] => [id, { order: 1, stereo: "up", narrow: c.atom }]));
}
