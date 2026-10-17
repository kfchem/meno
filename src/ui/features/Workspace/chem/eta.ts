/**
 * A ligand bound to a metal through a ring or chain of its atoms (eta: Cp,
 * benzene, allyl) as the drawing holds it - one bond from the metal to a
 * star at the system's centre, its endpoints the system's atoms, as the
 * CTfile's multi-centre bond is (ENDPTS, ATTACH=ALL) - and drawn: one line
 * from the metal to the centre. The star is no atom to the user: it is not
 * hovered, picked or labelled, it stands at its atoms' centre wherever they
 * go, and it goes with its bond.
 */
import type { Atom, Bond, Model } from "../store/types";

type Graph = { atoms: readonly Atom[]; bonds: readonly Bond[] };

const starsOf = new WeakMap<readonly Bond[], { atoms: readonly Atom[]; stars: Set<number> }>();

/** The atoms that are a haptic bond's star: the end of a bond with endpoints that is a "*". */
export function hapticStars(model: Graph): Set<number> {
  const kept = starsOf.get(model.bonds);
  if (kept && kept.atoms === model.atoms) return kept.stars;
  const stars = new Set<number>();
  if (model.bonds.some((b) => b.endpoints?.length)) {
    const el = new Map(model.atoms.map((a) => [a.id, a.el]));
    for (const b of model.bonds) {
      if (!b.endpoints?.length) continue;
      for (const e of [b.a, b.b]) if (el.get(e) === "*") stars.add(e);
    }
  }
  starsOf.set(model.bonds, { atoms: model.atoms, stars });
  return stars;
}

/** The middle of `ids` among `at`, or null where any is missing. */
function middleOf(ids: readonly number[], at: ReadonlyMap<number, { x: number; y: number }>): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const p = at.get(id);
    if (!p) return null;
    x += p.x;
    y += p.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/**
 * A model's haptic bonds held to what they bind, after an edit: a bond
 * whose ring is no longer whole - an atom of it deleted, or merged onto
 * another - goes, with its star, as does a star whose bond has gone (the
 * bond deleted, its metal deleted), so that a star is never left on the
 * drawing as an atom of its own; and each star stands at its atoms' centre,
 * where they have moved. `before` is the model as it was before the edit.
 */
export function etaHeld(model: Model, before?: Model): Model {
  const has = model.bonds.some((b) => b.endpoints?.length);
  const had = !!before && before.bonds !== model.bonds && hapticStars(before).size > 0;
  if (!has && !had) return model;
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const gone = new Set<number>();
  let bonds = model.bonds.filter((b) => {
    if (!b.endpoints?.length) return true;
    if (at.has(b.a) && at.has(b.b) && b.endpoints.every((e) => at.has(e))) return true;
    for (const e of [b.a, b.b]) if (at.get(e)?.el === "*") gone.add(e);
    return false;
  });
  const live = new Set<number>();
  for (const b of bonds) if (b.endpoints?.length) for (const e of [b.a, b.b]) if (at.get(e)?.el === "*") live.add(e);
  if (had) for (const s of hapticStars(before!)) if (at.has(s) && !live.has(s)) gone.add(s);
  for (const s of live) gone.delete(s);
  if (gone.size) bonds = bonds.filter((b) => !gone.has(b.a) && !gone.has(b.b));
  // (each star at its atoms' centre - a variable attachment's, ATTACH=ANY, where it was put)
  const to = new Map<number, { x: number; y: number }>();
  for (const b of bonds) {
    if (!b.endpoints?.length || b.attach === "any") continue;
    const star = at.get(b.b)?.el === "*" ? b.b : at.get(b.a)?.el === "*" ? b.a : null;
    if (star == null) continue;
    const p = middleOf(b.endpoints, at);
    const s = at.get(star)!;
    if (p && (Math.abs(p.x - s.x) > 1e-9 || Math.abs(p.y - s.y) > 1e-9)) to.set(star, p);
  }
  if (!gone.size && !to.size && bonds.length === model.bonds.length) return model;
  const atoms = model.atoms.flatMap((a) => (gone.has(a.id) ? [] : to.has(a.id) ? [{ ...a, ...to.get(a.id)! }] : [a]));
  return { ...model, atoms, bonds };
}

/**
 * The atoms as drawn, each star at the centre of its atoms where they are
 * drawn - while a ring is dragged, gliding, or moved with a selection that
 * holds no star - not where the model last put it.
 */
export function starsAtTheirAtoms<T extends { id: number; x: number; y: number }>(atoms: T[], model: Graph): T[] {
  const stars = hapticStars(model);
  if (!stars.size) return atoms;
  const at = new Map(atoms.map((a) => [a.id, a]));
  const to = new Map<number, { x: number; y: number }>();
  for (const b of model.bonds) {
    if (!b.endpoints?.length || b.attach === "any") continue;
    const star = stars.has(b.b) ? b.b : stars.has(b.a) ? b.a : null;
    const p = star == null ? null : middleOf(b.endpoints, at);
    const s = star == null ? undefined : at.get(star);
    if (p && s && (s.x !== p.x || s.y !== p.y)) to.set(star!, p);
  }
  if (!to.size) return atoms;
  return atoms.map((a) => (to.has(a.id) ? { ...a, ...to.get(a.id)! } : a));
}

/**
 * Atoms `ids` with the stars whose atoms are all among them: a selection
 * takes a ring's star with the ring, so that the bond to it goes with it,
 * and never takes a star by itself.
 */
export function withTheirStars(model: Graph, ids: Set<number>): Set<number> {
  const stars = hapticStars(model);
  if (!stars.size) return ids;
  const out = new Set([...ids].filter((id) => !stars.has(id)));
  for (const b of model.bonds) {
    if (!b.endpoints?.length) continue;
    const star = stars.has(b.b) ? b.b : stars.has(b.a) ? b.a : null;
    if (star != null && b.endpoints.every((e) => out.has(e))) out.add(star);
  }
  return out;
}
