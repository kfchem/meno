/**
 * A bond dragged out of an atom of a projection - a chair, a Haworth ring, a Newman pair (docs/EDITOR-2D.md, *Projections*: groups are drawn by extension): it goes to
 * one of that atom's free positions as the projection solids give them (lib/chem/perception/projection), seen as the solid is seen - the one whose seen direction is nearest the pointer's - and
 * nowhere between, so that nothing a projection is extended with is left unread. Pure: the model in, where the bond ends and what the place is called out.
 */
import type { Atom, Bond } from "../store/types";
import { seenPlaces, snapTo, type SeenPlace } from "./chair";
import { apart, newmanExtension, newmansIn, nextSpoke, setOf, spokeAngles, type FoundNewman } from "./newman";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { projectionsIn, type FoundProjection } from "./rings";

/** Where a bond out of `tip` ends, and what the place is called ("axial", "equatorial", "up", "down"). */
export type ChairExtension = { end: { x: number; y: number }; name: string };

const NEAR = 1e-3;

/**
 * The place a bond dragged out of atom `tip` to `pointer` takes, where `tip` is an atom of a projection of the tool's: the nearer of its free
 * positions that no group holds already. None where `tip` is on no such ring, or both its places are held, and the stroke goes as any.
 */
export function chairExtension(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }): ChairExtension | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  // (a Newman pair: the front atom's spokes and the back's, a bond length from the centre)
  const spoke = newmanExtension({ atoms, bonds }, tip, pointer);
  if (spoke) return spoke;
  for (const found of projectionsIn({ atoms, bonds })) {
    if (!found.ring.includes(tip)) continue;
    const d = found.drawing;
    const k = found.index.get(tip)!;
    const here = atoms.find((a) => a.id === tip)!;
    const taken = heldKinds({ atoms, bonds }, found.ring, tip, d, k);
    const place = snapTo(d, k, { x: pointer.x - here.x + d.atoms[k].x, y: pointer.y - here.y + d.atoms[k].y }, taken);
    if (!place) return null;
    // (the new atom where the free position says, as the ring's own atoms are: the seen vector of that bond, not a bond's length along it)
    return { end: { x: here.x + place.place.x - d.atoms[k].x, y: here.y + place.place.y - d.atoms[k].y }, name: place.free.kind };
  }
  return null;
}

/**
 * The free positions of ring atom `k` of a found projection's drawing `d` (atom `tip` on the page) that a group holds already: a neighbour off the
 * ring standing at one of them, by kind. A group drawn elsewhere by hand holds none.
 */
function heldKinds(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, ring: readonly number[], tip: number, d: FoundProjection["drawing"], k: number): SeenPlace["free"]["kind"][] {
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const here = byId.get(tip)!;
  const places = seenPlaces(d, k);
  const taken: SeenPlace["free"]["kind"][] = [];
  for (const b of model.bonds) {
    const other = b.a === tip ? b.b : b.b === tip ? b.a : null;
    if (other == null || ring.includes(other)) continue;
    const g = byId.get(other);
    if (!g) continue;
    const held = places.find((p) => Math.hypot(g.x - here.x - (p.place.x - d.atoms[k].x), g.y - here.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
    if (held) taken.push(held.free.kind);
  }
  return taken;
}

/** The order a double-click fills an atom's free positions in: a chair's equatorial before its axial, a Haworth ring's up before its down. */
const FILL_ORDER: readonly SeenPlace["free"]["kind"][] = ["equatorial", "axial", "up", "down"];

/**
 * Where the one bond a double-click adds to atom `tip` ends, where `tip` is an atom of a projection of the tool's (docs/EDITOR-2D.md,
 * *Projections*): a chair's or a Haworth ring's atom at its first free position by `FILL_ORDER`, at the length the drawing gives it; a Newman
 * pair's atom at the next free spoke of its own set (`nextSpoke`). `"full"` where `tip` is such an atom and has no free position - nothing is
 * added, never a bond between two positions - and none where `tip` is no such atom, and the bond goes as any.
 */
export function projectionBond(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number): { x: number; y: number } | "full" | null {
  const spoke = nextSpoke(model, tip);
  if (spoke) return spoke;
  for (const found of projectionsIn({ atoms: model.atoms as Atom[], bonds: model.bonds as Bond[] })) {
    if (!found.ring.includes(tip)) continue;
    const d = found.drawing;
    const k = found.index.get(tip)!;
    const here = model.atoms.find((a) => a.id === tip)!;
    const taken = heldKinds(model, found.ring, tip, d, k);
    const free = seenPlaces(d, k)
      .filter((p) => !taken.includes(p.free.kind))
      .sort((p, q) => FILL_ORDER.indexOf(p.free.kind) - FILL_ORDER.indexOf(q.free.kind))[0];
    if (!free) return "full";
    return { x: here.x + free.place.x - d.atoms[k].x, y: here.y + free.place.y - d.atoms[k].y };
  }
  return null;
}

/**
 * Where a projection's group comes to rest when its atom is dragged and let go at `pointer` (docs/EDITOR-2D.md, *Projections*), where `moving` is
 * an atom of one bond to a ring atom of a chair or a Haworth ring of the tool's, or to an atom of a Newman pair. In page units, the same at every zoom.
 * - A chair's or a Haworth ring's group standing at one of its atom's two positions: the position whose seen direction is nearest the pointer's,
 *   its own or the other; the other held by a group, the two change places (`swap`: that group's atoms, all of them, moved by one step, so its
 *   first atom stands where the dragged one stood). Never between two, never two groups at one.
 * - Such a group standing at neither (drawn by hand): the nearest FREE position; both held, none (the drag goes as any).
 * - A Newman pair's group off every spoke of its atom's set (the set its other groups stand on, or the tool's default): the nearest free spoke of
 *   it, a bond length from the centre; one on a spoke is turned with its set instead (utils/newmanTurn), and none is free, none.
 * None where `moving` is no such group.
 */
export function projectionDrop(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, moving: number, pointer: { x: number; y: number }): { to: { x: number; y: number }; swap?: Map<number, { x: number; y: number }> } | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  const own = bonds.filter((b) => b.a === moving || b.b === moving);
  if (own.length !== 1) return null;
  const stem = own[0].a === moving ? own[0].b : own[0].a;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const here = byId.get(moving);
  const root = byId.get(stem);
  if (!here || !root) return null;
  const pair = newmansIn(model).find((f) => f.front === stem || f.back === stem);
  if (pair) return spokeDrop(pair, moving, pointer);
  const want = Math.atan2(pointer.y - root.y, pointer.x - root.x);
  for (const found of projectionsIn({ atoms, bonds })) {
    if (!found.ring.includes(stem) || found.ring.includes(moving)) continue;
    const d = found.drawing;
    const k = found.index.get(stem)!;
    const places = seenPlaces(d, k).map((p) => ({ kind: p.free.kind, at: { x: root.x + p.place.x - d.atoms[k].x, y: root.y + p.place.y - d.atoms[k].y } }));
    const placeOf = (a: { x: number; y: number }) => places.find((p) => Math.hypot(a.x - p.at.x, a.y - p.at.y) < NEAR * 100);
    // (the positions the atom's other groups hold, by kind)
    const holders = new Map<string, number>();
    for (const b of bonds) {
      const g = b.a === stem ? b.b : b.b === stem ? b.a : null;
      if (g == null || g === moving || found.ring.includes(g)) continue;
      const p = placeOf(byId.get(g)!);
      if (p) holders.set(p.kind, g);
    }
    const off = (p: (typeof places)[number]) => Math.abs(Math.atan2(Math.sin(Math.atan2(p.at.y - root.y, p.at.x - root.x) - want), Math.cos(Math.atan2(p.at.y - root.y, p.at.x - root.x) - want)));
    const nearest = (among: typeof places) => [...among].sort((p, q) => off(p) - off(q))[0];
    const mine = placeOf(here);
    if (!mine) {
      const free = places.filter((p) => !holders.has(p.kind));
      return free.length ? { to: nearest(free).at } : null;
    }
    const target = nearest(places);
    const other = holders.get(target.kind);
    if (target.kind === mine.kind || other == null) return { to: target.at };
    // (the two groups change places: the other one, with all that hangs from it, by the step that takes its first atom to the dragged one's place)
    const [dx, dy] = [mine.at.x - target.at.x, mine.at.y - target.at.y];
    const swap = new Map<number, { x: number; y: number }>();
    const seen = new Set([stem, other]);
    const todo = [other];
    while (todo.length) {
      const u = todo.pop()!;
      const a = byId.get(u)!;
      swap.set(u, { x: a.x + dx, y: a.y + dy });
      for (const b of bonds) {
        const v = b.a === u ? b.b : b.b === u ? b.a : null;
        if (v == null || seen.has(v) || found.ring.includes(v)) continue;
        seen.add(v);
        todo.push(v);
      }
    }
    swap.set(moving, target.at);
    return { to: target.at, swap };
  }
  return null;
}

/** `projectionDrop` for a group of a Newman pair: the nearest free spoke of its atom's set, where it lies off every one of them. */
function spokeDrop(pair: FoundNewman, moving: number, pointer: { x: number; y: number }): { to: { x: number; y: number } } | null {
  const back = pair.groups.back.some((g) => g.id === moving);
  const mine = back ? pair.groups.back : pair.groups.front;
  const me = mine.find((g) => g.id === moving);
  if (!me) return null;
  const rest = mine.filter((g) => g.id !== moving);
  // (the set its atom's other groups stand on; the front's read first, as the back's offset follows it; none of them, the tool's default)
  const frontGroups = back ? pair.groups.front : rest;
  const front = setOf(frontGroups, false, null);
  if (frontGroups.length && !front) return null;
  const frontSet = front?.set ?? "A";
  let angles: number[];
  if (back) {
    const b = setOf(rest, true, frontSet);
    if (rest.length && !b) return null;
    angles = spokeAngles(b?.set ?? (frontSet === "A" ? "B" : "A"), true, b?.eclipsed ?? false);
  } else angles = spokeAngles(frontSet, false, false);
  if (angles.some((a) => apart(a, me.angle) < 1e-3)) return null;
  const want = (((Math.atan2(pointer.y - pair.at.y, pointer.x - pair.at.x) * 180) / Math.PI) % 360 + 360) % 360;
  const free = angles.filter((a) => !rest.some((g) => apart(g.angle, a) < 1e-3)).sort((p, q) => apart(p, want) - apart(q, want));
  if (!free.length) return null;
  const rad = (free[0] * Math.PI) / 180;
  return { to: { x: pair.at.x + NOMINAL_BOND_LENGTH * Math.cos(rad), y: pair.at.y + NOMINAL_BOND_LENGTH * Math.sin(rad) } };
}

/**
 * Where the bond after a projection's group goes, out of `tip`, its first atom - an atom whose one bond is to an atom of a projection of the
 * tool's, standing at one of that atom's free positions: 120 degrees from that bond, to the side nearer the pointer, `length` long. Never on
 * along the group's own line: two bonds in one line hide the atom between them, and a CH2OH drawn straight up reads as one bond to an OH
 * (docs/EDITOR-2D.md, *Projections*). None where `tip` is no such atom, and the stroke goes as any.
 */
export function groupBend(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }, length: number): { end: { x: number; y: number }; from: number } | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  const own = bonds.filter((b) => b.a === tip || b.b === tip);
  if (own.length !== 1) return null;
  const stem = own[0].a === tip ? own[0].b : own[0].a;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const here = byId.get(tip);
  const root = byId.get(stem);
  if (!here || !root) return null;
  for (const found of projectionsIn({ atoms, bonds })) {
    if (!found.ring.includes(stem) || found.ring.includes(tip)) continue;
    const d = found.drawing;
    const k = found.index.get(stem)!;
    // (the group stands at one of the ring atom's free positions: a bond drawn elsewhere by hand is the chemist's own)
    const at = seenPlaces(d, k).some((p) => Math.hypot(here.x - root.x - (p.place.x - d.atoms[k].x), here.y - root.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
    if (!at) return null;
    const back = Math.atan2(root.y - here.y, root.x - here.x);
    const want = Math.atan2(pointer.y - here.y, pointer.x - here.x);
    const off = (a: number) => Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
    const turns = [back + (2 * Math.PI) / 3, back - (2 * Math.PI) / 3];
    const angle = off(turns[0]) <= off(turns[1]) ? turns[0] : turns[1];
    return { end: { x: here.x + length * Math.cos(angle), y: here.y + length * Math.sin(angle) }, from: back };
  }
  return null;
}

/**
 * A projection's group whose first atom is made linear by its bonds - a triple bond, or two double bonds, at an atom of two bonds: a nitrile,
 * an alkyne, an isocyanide on a ring atom of the tool's - drawn straight on, its two bonds in one line (GR-4.1.1), as the bend out of a
 * group's atom (`groupBend`) cannot draw it, the order being set after the stroke. What lies beyond the atom is turned about it, as drawn,
 * until its next atom is straight on from the ring atom; nothing where `atom` is no such group, is straight already, or what lies beyond
 * comes round to the ring. The new places, by atom id.
 */
export function straightenedGroup(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, atom: number): Map<number, { x: number; y: number }> | null {
  const atoms = model.atoms as Atom[];
  const bonds = model.bonds as Bond[];
  const own = bonds.filter((b) => b.a === atom || b.b === atom);
  if (own.length !== 2) return null;
  const linear = own.some((b) => b.order === 3) || own.every((b) => b.order === 2);
  if (!linear) return null;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const here = byId.get(atom);
  if (!here) return null;
  for (const stemBond of own) {
    const stem = stemBond.a === atom ? stemBond.b : stemBond.a;
    const root = byId.get(stem);
    if (!root) continue;
    const found = projectionsIn({ atoms, bonds }).find((f) => f.ring.includes(stem) && !f.ring.includes(atom));
    if (!found) continue;
    const d = found.drawing;
    const k = found.index.get(stem)!;
    const at = seenPlaces(d, k).some((p) => Math.hypot(here.x - root.x - (p.place.x - d.atoms[k].x), here.y - root.y - (p.place.y - d.atoms[k].y)) < NEAR * 100);
    if (!at) return null;
    const onBond = own.find((b) => b !== stemBond)!;
    const far = onBond.a === atom ? onBond.b : onBond.a;
    const next = byId.get(far);
    if (!next) return null;
    const want = Math.atan2(here.y - root.y, here.x - root.x);
    const now = Math.atan2(next.y - here.y, next.x - here.x);
    const turn = Math.atan2(Math.sin(want - now), Math.cos(want - now));
    if (Math.abs(turn) < 1e-6) return null;
    // (what lies beyond: every atom reached from the next one without going back through `atom`; none of the ring's)
    const beyond = new Set([far]);
    const todo = [far];
    while (todo.length) {
      const u = todo.pop()!;
      for (const b of bonds) {
        const v = b.a === u ? b.b : b.b === u ? b.a : null;
        if (v == null || v === atom || beyond.has(v)) continue;
        if (found.ring.includes(v) || v === stem) return null;
        beyond.add(v);
        todo.push(v);
      }
    }
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const moved = new Map<number, { x: number; y: number }>();
    for (const id of beyond) {
      const p = byId.get(id)!;
      const [dx, dy] = [p.x - here.x, p.y - here.y];
      moved.set(id, { x: here.x + dx * c - dy * s, y: here.y + dx * s + dy * c });
    }
    return moved;
  }
  return null;
}
