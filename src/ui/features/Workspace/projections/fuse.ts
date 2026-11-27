/**
 * A chair fused on a bond of a chair already drawn (docs/EDITOR-2D.md, *Fusing*): the solids' `fused`, drawn as the first ring is drawn. Three ways, never
 * two - trans, cis on the upper face, cis on the lower - because on a ring that carries a group or another fused ring the two cis fusions are
 * different compounds (cis-syn-cis against cis-anti-cis): the tool does not pick one for the chemist. Pure: the model in, what is added out.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { chair, flipped, fused } from "../../../../lib/chem/perception/projection/solids";
import { drawn, type Drawn } from "../../../../lib/chem/perception/projection/views";
import type { Atom, Bond, Model } from "../store/types";
import { chairOf, chairsIn, ringAlone, seenPlaces, chairDrawing, type ChairDrawing, type FoundChair } from "./chair";

/** How the new ring is fused: trans, or cis on the upper (1) or lower (-1) face of the first ring. */
export type FuseHow = "trans" | { cis: 1 | -1 };

/** What a fusion adds: its new atoms, and its bonds - an end given as an atom already there (`id`) or one of the new ones (`new`, an index into `atoms`). */
export type Fuse = {
  atoms: Omit<Atom, "id">[];
  bonds: { a: { id: number } | { new: number }; b: { id: number } | { new: number } }[];
};

/** The three ways, as the menu words them. */
export const FUSE_WAYS: { how: FuseHow; name: string }[] = [
  { how: "trans", name: "Fuse a chair, trans" },
  { how: { cis: 1 }, name: "Fuse a chair, cis on the upper face" },
  { how: { cis: -1 }, name: "Fuse a chair, cis on the lower face" },
];

/** The ring bonds of a structure's one chair: where a chair can be fused. None where it holds none or more than one (a fused system is not fused again by the tool yet). */
export function fusableBonds(model: Model, ids: ReadonlySet<number>): number[] {
  const rings = chairsIn(model, ids);
  // (a chair that stands alone: one fused already is not fused again by the tool)
  if (rings.length !== 1 || !ringAlone(model, rings[0])) return [];
  const ring = rings[0];
  return model.bonds.filter((b) => ring.includes(b.a) && ring.includes(b.b)).map((b) => b.id);
}

/**
 * The ring fused on bond `bondId` of the structure's one chair, `how`: the four atoms and five bonds `fused` adds, drawn as the first ring is
 * (`drawn`: chairs fused stay on the first ring's four directions, each bond one bond long, with the depth of the same view), every bond plain. `refused`, in words, where a group stands at a place the new ring would take, or another atom stands where one
 * of its own would go; none where the bond is on no chair of the tool's.
 */
export function fusedOn(model: Model, ids: ReadonlySet<number>, bondId: number, how: FuseHow): Fuse | { refused: string } | null {
  const rings = chairsIn(model, ids);
  const bond = model.bonds.find((b) => b.id === bondId);
  if (rings.length !== 1 || !bond) return null;
  const ring = rings[0];
  if (!ring.includes(bond.a) || !ring.includes(bond.b)) return null;
  const found = chairOf(model, ring)!;
  const base = chair();
  const solid = found.flip ? flipped(base) : base;
  const [ka, kb] = [found.index.get(bond.a)!, found.index.get(bond.b)!];
  const at = solid.bonds.findIndex(([p, q]) => (p === ka && q === kb) || (p === kb && q === ka));
  const next = fused(solid, at, "chair", how);
  const [i, j] = solid.bonds[at];
  // (the places the new ring takes at the bond's two atoms: a group already standing at one is in its way)
  const taken = (k: number) => {
    const d = chairDrawing({ at: found.at, form: found.form, flip: found.flip, firstId: 1, firstBondId: 1, length: found.scale });
    const id = ring[[...found.index.values()].indexOf(k)];
    const here = model.atoms.find((a) => a.id === id)!;
    const out: string[] = [];
    for (const b of model.bonds) {
      const other = b.a === id ? b.b : b.b === id ? b.a : null;
      if (other == null || ring.includes(other)) continue;
      const g = model.atoms.find((a) => a.id === other)!;
      const place = seenPlaces(d, k).find((p) => Math.hypot(g.x - here.x - (p.place.x - d.atoms[k].x), g.y - here.y - (p.place.y - d.atoms[k].y)) < 1e-3);
      if (place) out.push(`${place.free.face}:${place.free.kind}`);
    }
    return out;
  };
  const used = [...solid.free.filter((f) => (f.at === i || f.at === j) && !next.free.includes(f))];
  for (const f of used) if (taken(f.at).includes(`${f.face}:${f.kind}`)) return { refused: "A group stands where the new ring would go: fuse it on a bond whose places are free." };
  // (the new atoms placed as the first ring's are: the drawing's first ring centred where the chair's middle is, each bond as long as its are)
  const both = pairDrawing(found, at, how);
  if (!both) return null;
  const atoms = both.atoms.slice(6).map(({ x, y, z }) => ({ el: "C", r: 0.9, x, y, z: z!, stereoCentre: true as const, stereoShown: true as const }));
  // (another atom of the drawing in the place of a new one, in the depth too: a ring already there)
  for (const a of atoms) {
    if (model.atoms.some((o) => Math.hypot(o.x - a.x, o.y - a.y, (o.z ?? 0) - a.z) < 0.5 * NOMINAL_BOND_LENGTH)) return { refused: "Another atom stands where the new ring would go." };
  }
  const idOf = (k: number): { id: number } | { new: number } => (k < 6 ? { id: ring[[...found.index.values()].indexOf(k)] } : { new: k - 6 });
  const bonds = next.bonds.slice(6).map(([p, q]) => ({ a: idOf(p), b: idOf(q) }));
  return { atoms, bonds };
}

/** How long a free place of a fused pair is drawn where at full length it would land on an atom or on another place: Meno's own choice. */
export const SHORT_PLACE = 2 / 3;

/**
 * How long such a place is drawn where at `SHORT_PLACE` it would cross a bond of the pair: short of the crossing, so that no stub of it is
 * left beyond the break where it passes behind the bond, nor a tick beyond the bond where it passes in front - Meno's own choice too.
 */
export const SHORTER_PLACE = 1 / 3;

/** How near, in bonds, an end comes to an atom or to another place's end for its place to be drawn `SHORT_PLACE` long. */
const LANDS_ON = 0.3;

/**
 * A fused pair's free places as drawn: each along its own line, one bond long, but a place that would land on an atom or on another
 * place's end - on the four lines the two rings meet so, a twentieth of a bond apart - `SHORT_PLACE` long, or `SHORTER_PLACE` where at that
 * length it would cross a bond of the pair; of two places, the new ring's.
 * Never off its line and never refused: what the place states is its direction and its depth, which stay.
 */
function shortened(d: Drawn, bonds: readonly [number, number][]): Drawn["free"] {
  const end = (f: Drawn["free"][number]) => ({ x: d.atoms[f.free.at].x + f.x, y: d.atoms[f.free.at].y + f.y });
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < LANDS_ON;
  const short = new Set<Drawn["free"][number]>();
  for (const f of d.free) {
    if (d.atoms.some((a, k) => k !== f.free.at && near(a, end(f)))) short.add(f);
    for (const g of d.free) {
      if (g === f || !near(end(f), end(g))) continue;
      // (of two places on one point, the new ring's - the later atom's - is drawn short)
      short.add(f.free.at > g.free.at ? f : g);
    }
  }
  // (whether a place drawn `length` long crosses a bond of the pair that is not at its own atom)
  const crosses = (f: Drawn["free"][number], length: number) => {
    const o = d.atoms[f.free.at];
    const e = { x: o.x + f.x * length, y: o.y + f.y * length };
    const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return bonds.some(([i, j]) => i !== f.free.at && j !== f.free.at && side(o, e, d.atoms[i]) * side(o, e, d.atoms[j]) < 0 && side(d.atoms[i], d.atoms[j], o) * side(d.atoms[i], d.atoms[j], e) < 0);
  };
  return d.free.map((f) => {
    if (!short.has(f)) return f;
    const length = crosses(f, SHORT_PLACE) ? SHORTER_PLACE : SHORT_PLACE;
    return { ...f, x: f.x * length, y: f.y * length };
  });
}

/**
 * The fused pair a chair found on a page (`found`) makes with a chair fused on its solid's bond `bond`, `how`, drawn as `fusedOn` draws it:
 * atom k of the pair's solid is `1 + k` - the first ring's six, then the new ring's four - placed and deep as on the page, and the pair's free
 * positions on the first ring's four lines (`drawn`). None where the pair is not drawn so.
 */
export function pairDrawing(found: FoundChair, bond: number, how: FuseHow): ChairDrawing | null {
  const solid = fused(found.flip ? flipped(chair()) : chair(), bond, "chair", how);
  const full = drawn(solid, found.form);
  if (!full) return null;
  const drawing = { ...full, free: shortened(full, solid.bonds) };
  const atoms: Atom[] = drawing.atoms.map((p, k) => ({ id: 1 + k, el: "C", r: 0.9, x: found.at.x + p.x * found.scale, y: found.at.y + p.y * found.scale, z: p.z * found.scale }));
  const bonds: Bond[] = solid.bonds.map(([a, b], k) => ({ id: 1 + k, a: 1 + a, b: 1 + b, order: 1 }));
  return { atoms, bonds, ring: atoms.map((a) => a.id), solid, drawing, scale: found.scale };
}

/**
 * The second ring of a fused pair the tool drew on chair `ring` of a page (`fusedOn`): the six-ring of `rings` (atom ids in order round it)
 * that shares one bond of the chair and whose four other atoms stand where one of the three ways of fusing puts them - on the page and in
 * the depth, to a part in a million of a bond, as `chairOf` finds a chair - with the pair's drawing (`pairDrawing`) and each of its atoms'
 * places in the pair's solid. So a group is led out of it to its own free positions, on the four lines the pair is drawn on, as out of
 * the first ring. None for a ring drawn on it by hand.
 */
export function fusedRingsOn(model: { atoms: Atom[] }, ring: readonly number[], found: FoundChair, rings: readonly number[][]): { ring: number[]; drawing: ChairDrawing; index: Map<number, number> }[] {
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const base = chair();
  const out: { ring: number[]; drawing: ChairDrawing; index: Map<number, number> }[] = [];
  for (const other of rings) {
    const shared = other.filter((id) => ring.includes(id));
    if (shared.length !== 2) continue;
    const [ka, kb] = shared.map((id) => found.index.get(id)!);
    const bond = base.bonds.findIndex(([p, q]) => (p === ka && q === kb) || (p === kb && q === ka));
    if (bond < 0) continue;
    for (const { how } of FUSE_WAYS) {
      const d = pairDrawing(found, bond, how);
      if (!d) continue;
      const index = new Map(shared.map((id) => [id, found.index.get(id)!]));
      for (const id of other) {
        if (index.has(id)) continue;
        const a = byId.get(id)!;
        const k = [6, 7, 8, 9].find((k) => Math.hypot(a.x - d.atoms[k].x, a.y - d.atoms[k].y, (a.z ?? 0) - d.atoms[k].z!) < 1e-6 * NOMINAL_BOND_LENGTH * 100);
        if (k == null) break;
        index.set(id, k);
      }
      // (each atom of the ring in its own place, and each bond round it one of the pair's own)
      const ks = other.map((id) => index.get(id));
      const closed = ks.every((k, n) => k != null && d.solid.bonds.some(([p, q]) => (p === k && q === ks[(n + 1) % 6]) || (q === k && p === ks[(n + 1) % 6])));
      if (index.size === 6 && new Set(index.values()).size === 6 && closed) {
        out.push({ ring: [...other], drawing: d, index });
        break;
      }
    }
  }
  return out;
}
