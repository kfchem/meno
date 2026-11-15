import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model, Molecule3D } from "../store/types";

type Atom = Model["atoms"][number];
type Bond = Model["bonds"][number];

/** A drawing's atoms by id, and each atom's bonds: made once for each drawing, so that a structure is read in the time its own atoms take, not the page's (`pageIndex`). */
export type PageIndex = { byId: ReadonlyMap<number, Atom>; bondsOf: ReadonlyMap<number, readonly Bond[]> };
const indexes = new WeakMap<Model, PageIndex>();

/** A drawing's index (`PageIndex`), made the first time it is asked for and kept while the drawing is. */
export function pageIndex(model: Model): PageIndex {
  const had = indexes.get(model);
  if (had) return had;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const bondsOf = new Map<number, Bond[]>();
  for (const b of model.bonds) for (const end of b.a === b.b ? [b.a] : [b.a, b.b]) bondsOf.set(end, [...(bondsOf.get(end) ?? []), b]);
  const index = { byId, bondsOf };
  indexes.set(model, index);
  return index;
}

/**
 * What a drawn structure is, as its molecules in 3D were made from it: its
 * atoms (by id: element, charge, mass), its bonds (order and wedge, and
 * what a haptic bond binds), and those that leave it - not where anything
 * is drawn, nor a hydrogen bond, which is no bond of a structure (one drawn
 * or taken away changes no molecule made from it). A molecule in 3D whose
 * drawing no longer says the same is its drawing's no longer. Read through
 * the drawing's index (`pageIndex`): the structure's own atoms and bonds
 * alone, however many others the page holds.
 */
export function signatureOf(model: Model, ids: Iterable<number>): string {
  const { byId, bondsOf } = pageIndex(model);
  const of = new Set(ids);
  // (a haptic bond's star with the metal it is bound to: no atom of a
  // molecule in 3D, so not among its drawing's atoms, but of the structure
  // as its bond is - else every complex so bound read as drawn otherwise)
  for (const id of [...of])
    for (const b of bondsOf.get(id) ?? []) {
      if (!b.endpoints?.length) continue;
      const star = b.a === id ? b.b : b.a;
      if (byId.get(star)?.el === "*") of.add(star);
    }
  // (and a label bonded to it - Cp, cod - written out for the plugin: where it is bound through a pi system, its place in
  // the structure asked about is that system's star, no atom of the molecule in 3D, so no atom the molecule is tied to;
  // of the structure all the same, as the bond to it is - else every complex so labelled read as drawn otherwise)
  const label = (a: Atom) => !!a.abbrev || (a.el !== "*" && !isElementSymbol(a.el));
  const reach = [...of];
  while (reach.length) {
    const x = reach.pop()!;
    for (const b of bondsOf.get(x) ?? []) {
      const y = b.a === x ? b.b : b.a;
      const other = byId.get(y);
      if (!of.has(y) && other && label(other)) {
        of.add(y);
        reach.push(y);
      }
    }
  }
  const atoms = [...of]
    .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    .map((a) => `${a.id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}`)
    .sort();
  const touching = new Set<Bond>();
  for (const id of of) for (const b of bondsOf.get(id) ?? []) if (!b.hydrogen) touching.add(b);
  const bonds = [...touching]
    .map((b) => {
      const ends = of.has(b.a) && of.has(b.b) ? `${b.a}-${b.b}` : of.has(b.a) ? `${b.a}-out` : `${b.b}-out`;
      // (and what a haptic bond binds)
      const binds = b.endpoints?.length ? `:${[...b.endpoints].sort((p, q) => p - q).join(" ")}` : "";
      return `${ends}:${b.order}:${b.stereo ?? "none"}${binds}`;
    })
    .sort();
  return [...atoms, "|", ...bonds].join(",");
}

/**
 * How a molecule in 3D stands to the drawing it was made from: the same
 * structure still ("live"), drawn otherwise since ("changed"), gone, or
 * made from none.
 */
export function linkOf(m: Pick<Molecule3D, "drawnFrom" | "drawnAs">, model: Model): "live" | "changed" | "gone" | null {
  if (!m.drawnFrom) return null;
  const ids = m.drawnFrom.filter((id): id is number => id != null);
  const present = new Set(model.atoms.map((a) => a.id));
  if (!ids.some((id) => present.has(id))) return "gone";
  return m.drawnAs != null && signatureOf(model, ids) !== m.drawnAs ? "changed" : "live";
}

/**
 * A molecule in 3D pasted with its drawing - all of it, or some - tied to
 * the pasted drawing's atoms, which `idOf` renames: still its drawing's if it
 * was in what was copied (`part`), or changed if only some of that came;
 * tied to nothing where none of its drawing came with it.
 */
export function relinked<M extends Pick<Molecule3D, "drawnFrom" | "drawnAs">>(
  m: M,
  part: Model,
  idOf: (id: number) => number | undefined,
): M {
  if (!m.drawnFrom) return m;
  const drawnFrom = m.drawnFrom.map((id) => (id == null ? null : (idOf(id) ?? null)));
  if (!drawnFrom.some((id) => id != null)) {
    const { drawnFrom: _from, drawnAs: _as, ...rest } = m;
    return rest as M;
  }
  if (linkOf(m, part) !== "live") return { ...m, drawnFrom };
  const renamed: Model = {
    atoms: part.atoms.map((a) => ({ ...a, id: idOf(a.id) ?? a.id })),
    bonds: part.bonds.map((b) => ({ ...b, a: idOf(b.a) ?? b.a, b: idOf(b.b) ?? b.b })),
  };
  return { ...m, drawnFrom, drawnAs: signatureOf(renamed, drawnFrom.filter((id): id is number => id != null)) };
}
