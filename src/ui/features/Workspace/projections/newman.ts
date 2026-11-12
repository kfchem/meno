/**
 * The Newman tool's drawing (docs/EDITOR-2D.md, *Projections*; foundation part 10): two carbons on the line of sight - the front atom nearer - drawn at
 * ONE place on the page, with the circle round it. The front atom's bonds meet at the circle's centre and the back atom's start at its rim (Moss 1996,
 * *Newman Projection*: the circle stands for the nearer atom - so say only that, never "the back atom is the circle"). The central bond is seen
 * end-on: it has no drawn length and no direction. Three free positions on each atom, *spokes*, staggered; a spoke's end dragged round the circle
 * turns all three of its atom together (`turnedTo`). Both atoms are carbon: they are drawn at one place and have no room for a label of their own.
 * Pure: nothing here knows a page or a store.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { isEndOn } from "../../../../lib/chem/layout2d";
import { CHAIR_R, ECLIPSED_OFFSET_DEG, newman } from "../../../../lib/chem/perception/projection/solids";
import { standardView } from "../../../../lib/chem/perception/projection/views";
import type { Atom, Bond } from "../store/types";
import type { ChairDrawing } from "./chair";

const DEG = Math.PI / 180;

/** The circle's radius, in bond lengths (lib/chem/layout2d, where the page draws it): a group's atom is a whole bond length from the centre. */
export { NEWMAN_CIRCLE } from "../../../../lib/chem/layout2d";

/** The scale of a Newman drawing: a spoke's length on the page is the style's bond length (the solid's spoke is `CHAIR_R` long). */
export const newmanScale = (length = NOMINAL_BOND_LENGTH): number => length / CHAIR_R;

/**
 * A Newman pair, staggered, its place at `at`: the front atom `firstId`, the back atom `firstId + 1`, their bond `firstBondId`. Both atoms at `at` -
 * the front at depth +1/2 a solid bond, the back at -1/2 - and carbon, as ordinary atoms that carry their depth. The drawing's `ring` is the two atoms, front first.
 */
export function newmanDrawing(opts: { at: { x: number; y: number }; firstId: number; firstBondId: number; length?: number }): ChairDrawing {
  const solid = newman("staggered");
  const scale = newmanScale(opts.length);
  const atoms: Atom[] = solid.atoms.map((p, k) => ({ id: opts.firstId + k, el: "C", r: 0.9, x: opts.at.x, y: opts.at.y, z: p[2] * scale, stereoCentre: true, stereoShown: true }));
  const bonds: Bond[] = [{ id: opts.firstBondId, a: atoms[0].id, b: atoms[1].id, order: 1 }];
  return { atoms, bonds, ring: atoms.map((a) => a.id), solid, view: standardView(solid), scale };
}

/** Whether a bond is seen end-on: its two atoms at one place on the page, one nearer than the other (a Newman's central bond): lib/chem/layout2d's, the one place that says so. */
export { isEndOn };

/** The three spoke angles of a set, in degrees counter-clockwise from the right (y up): the set whose first is `base` - 90 or 30, as the solid has them. */
const spokes = (base: number): number[] => [0, 1, 2].map((j) => base + 120 * j);

/** A set of spokes: A, the front's at 90, 210, 330 and B, 30, 150, 270 - the back's, staggered. */
export type SpokeSet = "A" | "B";
const baseOf = (s: SpokeSet): number => (s === "A" ? 90 : 30);

/** The angle, in degrees mod 360, a group at (dx, dy) from the centre lies at. */
const angleOf = (dx: number, dy: number): number => (((Math.atan2(dy, dx) / DEG) % 360) + 360) % 360;
const apart = (p: number, q: number): number => {
  const d = Math.abs((((p - q) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

/**
 * Where the three spokes of an atom lie on the page: the set `set`, and - on the back atom, where its set is the front's - turned from it by
 * `ECLIPSED_OFFSET_DEG`, so that both show (F9). `eclipsed` says the back's set is the front's.
 */
export function spokeAngles(set: SpokeSet, back: boolean, eclipsed: boolean): number[] {
  return spokes(baseOf(set) + (back && eclipsed ? ECLIPSED_OFFSET_DEG : 0));
}

/** Where the groups of each atom lie, as a state: which set each atom's spokes are in. The back's is drawn offset where it is the front's. */
export type Turn = { front: SpokeSet; back: SpokeSet };

/** The groups on one atom of a Newman pair: their atoms' ids and where each lies from the centre. */
export type Group = { id: number; angle: number };

/**
 * The spoke set an atom's groups are in, read from where they lie: each group at an angle of one set (the back's of the front's set within the
 * eclipsed offset). None where a group lies at none of them (a hand-drawn drawing: nothing is guessed). `back` says which atom it is.
 */
export function setOf(groups: readonly Group[], back: boolean, other: SpokeSet | null): { set: SpokeSet; eclipsed: boolean } | null {
  if (!groups.length) return null;
  for (const set of ["A", "B"] as const) {
    for (const eclipsed of back ? [false, true] : [false]) {
      if (eclipsed && set !== other) continue;
      if (groups.every((g) => spokeAngles(set, back, eclipsed).some((a) => apart(a, g.angle) < 1e-3))) return { set, eclipsed };
    }
  }
  return null;
}

/**
 * Where a spoke dragged round to `pointer` (page units, from the centre) comes to rest, and by how much its atom's groups turn: the nearest of that atom's
 * six places - its two sets' - as the other atom stands, the groups all turned rigidly by the same angle, the least way round (a turn about the bond
 * changes no configuration). `held` is the angle the dragged group lies at now.
 */
export function turnedTo(opts: { held: number; pointer: { x: number; y: number }; back: boolean; other: SpokeSet }): { set: SpokeSet; eclipsed: boolean; turn: number } {
  const want = angleOf(opts.pointer.x, opts.pointer.y);
  let best: { set: SpokeSet; eclipsed: boolean; angle: number; off: number } | null = null;
  for (const set of ["A", "B"] as const) {
    const eclipsed = opts.back && set === opts.other;
    for (const angle of spokeAngles(set, opts.back, eclipsed)) {
      const off = apart(angle, want);
      if (!best || off < best.off) best = { set, eclipsed, angle, off };
    }
  }
  // (the turn that takes the dragged group to the place nearest the pointer; the least way round, in (-180, 180])
  const raw = (((best!.angle - opts.held) % 360) + 540) % 360 - 180;
  return { set: best!.set, eclipsed: best!.eclipsed, turn: raw };
}

/** A point `at` turned `degrees` counter-clockwise about `centre` (page units, y up). */
export function turnedAbout(p: { x: number; y: number }, centre: { x: number; y: number }, degrees: number): { x: number; y: number } {
  const [c, s] = [Math.cos(degrees * DEG), Math.sin(degrees * DEG)];
  const [dx, dy] = [p.x - centre.x, p.y - centre.y];
  return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
}

/** The angle a point lies at from `centre`, in degrees (counter-clockwise from the right, y up), mod 360. */
export const angleFrom = (p: { x: number; y: number }, centre: { x: number; y: number }): number => angleOf(p.x - centre.x, p.y - centre.y);

/** A Newman pair found on a page: its atoms' ids, the place they lie at, and each atom's groups - their ids and where each lies from the centre. */
export type FoundNewman = { front: number; back: number; at: { x: number; y: number }; groups: { front: Group[]; back: Group[] } };

/**
 * The Newman pairs among the atoms `ids` (a structure's) of a drawing: two bonded atoms seen end-on (`isEndOn`) whose depths differ by a solid bond
 * as the tool draws it - to a part in a million of it - the nearer the front atom. Each with the groups on its atoms: the atoms bonded to it, and
 * where each lies from the centre.
 */
export function newmansIn(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, ids: ReadonlySet<number> = new Set(model.atoms.map((a) => a.id))): FoundNewman[] {
  if (!model.atoms.some((a) => a.z != null)) return [];
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const out: FoundNewman[] = [];
  for (const b of model.bonds) {
    if (!ids.has(b.a) || !ids.has(b.b) || b.order !== 1) continue;
    const [p, q] = [byId.get(b.a)!, byId.get(b.b)!];
    if (!isEndOn(p, q) || Math.abs(Math.abs(p.z! - q.z!) - newmanScale()) > 1e-6 * newmanScale() * 100) continue;
    const [front, back] = p.z! > q.z! ? [p, q] : [q, p];
    const groupsOf = (atom: Atom, partner: Atom): Group[] =>
      model.bonds.flatMap((x) => {
        const other = x.a === atom.id ? x.b : x.b === atom.id ? x.a : null;
        if (other == null || other === partner.id) return [];
        const g = byId.get(other);
        return g ? [{ id: g.id, angle: angleFrom(g, atom) }] : [];
      });
    out.push({ front: front.id, back: back.id, at: { x: front.x, y: front.y }, groups: { front: groupsOf(front, back), back: groupsOf(back, front) } });
  }
  return out;
}

/** What each atom of a found pair has: its set (and, the back, whether it is drawn offset), as its groups lie; the defaults - the front A, the back the other, staggered - where it has none. None where a group lies at none of the places. */
export function turnOf(found: FoundNewman): { front: SpokeSet; back: SpokeSet; eclipsed: boolean } | null {
  const f = setOf(found.groups.front, false, null);
  if (found.groups.front.length && !f) return null;
  const front: SpokeSet = f?.set ?? "A";
  const b = setOf(found.groups.back, true, front);
  if (found.groups.back.length && !b) return null;
  const back: SpokeSet = b?.set ?? (front === "A" ? "B" : "A");
  return { front, back, eclipsed: back === front };
}

/** A bond led out of an atom of a pair: where it ends - a whole bond length from the centre, along the spoke - and what the place is called ("front", "back"). */
export type NewmanExtension = { end: { x: number; y: number }; name: string };

/**
 * The spoke a bond dragged out of atom `tip` toward `pointer` takes, where `tip` is an atom of a pair of the tool's: the nearest of that atom's three
 * that no group holds. None where `tip` is on no pair, the atom's groups lie at none of its places, or all three are held.
 */
export function newmanExtension(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, tip: number, pointer: { x: number; y: number }, length = NOMINAL_BOND_LENGTH): NewmanExtension | null {
  for (const found of newmansIn(model)) {
    if (tip !== found.front && tip !== found.back) continue;
    const turn = turnOf(found);
    if (!turn) return null;
    const back = tip === found.back;
    const set = back ? turn.back : turn.front;
    const held = back ? found.groups.back : found.groups.front;
    const want = angleFrom(pointer, found.at);
    let best: { angle: number; off: number } | null = null;
    for (const angle of spokeAngles(set, back, turn.eclipsed)) {
      if (held.some((g) => apart(g.angle, angle) < 1e-3)) continue;
      const off = apart(angle, want);
      if (!best || off < best.off) best = { angle, off };
    }
    if (!best) return null;
    return { end: { x: found.at.x + length * Math.cos(best.angle * DEG), y: found.at.y + length * Math.sin(best.angle * DEG) }, name: back ? "back" : "front" };
  }
  return null;
}

/**
 * A group's atom of a Newman pair dragged round the circle to `pointer` (page units): all three groups of its atom turned together - each with
 * what hangs beyond it, rigidly - so that the one dragged comes to rest at the nearest of that atom's places (`turnedTo`); and, where the
 * pair's two sets come to be the same or stop being, the other atom's groups moved the eclipsed offset so that both still show. A turn about
 * the central bond changes no configuration: the cyclic order of an atom's groups and every distance are kept. Worked from `model` as the
 * gesture began, so that the moves of one frame do not add to those of the last. None where `group` is no group of a pair of the tool's, or a
 * group of the pair lies at none of its places (drawn by hand: nothing is guessed).
 */
export function newmanTurn(model: { atoms: readonly Atom[]; bonds: readonly Bond[] }, group: number, pointer: { x: number; y: number }): { id: number; x: number; y: number }[] | null {
  for (const found of newmansIn(model)) {
    const ofFront = found.groups.front.find((g) => g.id === group);
    const ofBack = found.groups.back.find((g) => g.id === group);
    if (!ofFront && !ofBack) continue;
    const now = turnOf(found);
    if (!now) return null;
    const back = !!ofBack;
    const held = (ofBack ?? ofFront)!.angle;
    const t = turnedTo({ held, pointer: { x: pointer.x - found.at.x, y: pointer.y - found.at.y }, back, other: back ? now.front : now.back });
    // (the sets after the turn: the dragged atom's is the one it rests in, the other's is as it was)
    const next = back ? { front: now.front, back: t.set } : { front: t.set, back: now.back };
    const eclipsed = next.front === next.back;
    // (each atom's groups: turned by `turn` - the dragged atom's by the turn it came to - and the other's by what the offset changes)
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    const inPair = new Set([found.front, found.back]);
    const beyond = (from: number, through: number): number[] => {
      const out = [through];
      const seen = new Set([from, through]);
      for (let h = 0; h < out.length; h++) {
        for (const b of model.bonds) {
          const other = b.a === out[h] ? b.b : b.b === out[h] ? b.a : null;
          if (other == null || seen.has(other) || inPair.has(other)) continue;
          seen.add(other);
          out.push(other);
        }
      }
      return out;
    };
    const moves = new Map<number, { id: number; x: number; y: number }>();
    const turnGroups = (groups: Group[], from: number, degrees: number) => {
      if (Math.abs(degrees) < 1e-9) return;
      for (const g of groups) {
        for (const id of beyond(from, g.id)) {
          const a = byId.get(id)!;
          const p = turnedAbout(a, found.at, degrees);
          moves.set(id, { id, x: p.x, y: p.y });
        }
      }
    };
    const other = back ? found.groups.front : found.groups.back;
    const mine = back ? found.groups.back : found.groups.front;
    turnGroups(mine, back ? found.back : found.front, t.turn);
    // (the other atom's: its places are those of its own set, and the back's offset by the eclipse: from where they were to where they are)
    const was = back ? spokeAngles(now.front, false, false)[0] : spokeAngles(now.back, true, now.eclipsed)[0];
    const to = back ? spokeAngles(next.front, false, false)[0] : spokeAngles(next.back, true, eclipsed)[0];
    const shift = (((to - was) % 120) + 180) % 120 - 60;
    turnGroups(other, back ? found.front : found.back, shift);
    return [...moves.values()];
  }
  return null;
}
